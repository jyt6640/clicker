// 제작자 통계 — 다섯 게임의 참여 데이터를 한 화면에 모읍니다.
//
// 이 주소는 공개돼 있고 코드도 누구나 읽을 수 있습니다. 실제 보호는 Supabase
// 이메일 계정 로그인과 행 수준 보안 정책이 합니다. 관리자 계정이 아니면 로그인
// 자체가 되지 않고, 설정·정답은 서버 함수가 관리자만 통과시킵니다.

import { GAMES } from "../config.js?v=21";
import {
  loadStats, configured, fmt, gameSettings, saveSettings, signInAdminEmail,
  setLockAnswer, setPayload, listRounds, roundDocId, resetSettingsCache
} from "../shared/core.js?v=21";

const $ = (id) => document.getElementById(id);

const LAYOUT = {
  cylinder: { path: "../cylinder/", target: GAMES.cylinder.target, unit: "클릭" },
  melt: { path: "../melt/", target: GAMES.melt.target, unit: "마찰" },
  lock: { path: "../lock/", target: null, unit: "시도" },
  tug: { path: "../tug/", target: null, unit: "당기기" },
  button: { path: "../button/", target: null, unit: "누름" }
};

const clock = (ts) => ts ? new Date(ts).toLocaleString("ko-KR", { hour12: false }) : "—";
const short = (ts) => ts ? new Date(ts).toLocaleTimeString("ko-KR", { hour12: false }) : "—";
const pct = (part, whole) => whole > 0 ? `${(part / whole * 100).toFixed(1)}%` : "—";

function span(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? h + "시간 " : ""}${m}분 ${s % 60}초`;
}

function cell(label, value) {
  return `<div class="cell"><span>${label}</span><b>${value}</b></div>`;
}

/** Supabase 오류를 화면에 쓸 문장으로 옮깁니다. */
function explain(err) {
  const code = err?.code || "";
  const msg = err?.message || "";
  if (code === "42P01" || /does not exist/i.test(msg)) {
    return "테이블이 없습니다. Supabase SQL Editor에서 supabase/schema.sql을 실행하세요.";
  }
  if (code === "42501" || /permission denied|row-level security/i.test(msg)) {
    return "권한이 없습니다. 관리자 계정으로 로그인했는지, schema.sql의 is_admin() 이메일이 맞는지 확인하세요.";
  }
  if (/admin only/i.test(msg)) return "관리자 계정만 바꿀 수 있습니다.";
  if (/JWT|not signed in/i.test(msg)) return "로그인이 풀렸습니다. 새로고침 후 다시 로그인하세요.";
  return `처리하지 못했습니다 (${code || msg || err}).`;
}

/** 게임 머리말과 새 라운드 버튼. 집계를 기다리지 않고 먼저 그립니다. */
function gameHead(id) {
  return `
    <header class="game-head">
      <h2>${GAMES[id].title}</h2>
      <a class="url" href="${LAYOUT[id].path}" target="_blank" rel="noopener">${LAYOUT[id].path}</a>
      <button type="button" class="ghost" data-new-round="${id}">새 라운드 시작</button>
    </header>`;
}

async function loadAll() {
  const games = $("games");
  const ids = Object.keys(LAYOUT);
  $("loading").hidden = false;

  // 집계는 회차 수만큼 요청이 오가서 몇 초 걸립니다. 그동안 화면에 누를 것이
  // 하나도 없으면 페이지가 멈춘 것처럼 보이므로, 조작할 수 있는 부분을 먼저
  // 그려두고 숫자만 나중에 채웁니다.
  games.innerHTML = ids.map((id) =>
    `<section class="game" data-game="${id}">${gameHead(id)}
       <p class="note">집계 중…</p></section>`).join("");
  bindRoundButtons();

  // 전체를 감쌉니다. 그리는 도중에 터진 예외가 밖으로 새면 "데이터 집계 중"
  // 문구가 영원히 남아 페이지가 멈춘 것처럼 보입니다. finally로 반드시
  // 걷어내고, 이유는 화면에 띄웁니다.
  try {
    const merged = await gameSettings();
    const byGame = await listRounds();

    // 진행 중인 회차는 아직 행이 없을 수 있으므로 목록에 채워 넣습니다.
    for (const id of ids) {
      const now = merged[id]?.round || 1;
      byGame[id] = byGame[id] || [];
      if (!byGame[id].includes(now)) byGame[id].unshift(now);
      byGame[id].sort((a, b) => b - a);
    }

    const jobs = [];
    for (const id of ids) {
      for (const round of byGame[id]) jobs.push({ id, round });
    }

    const results = await Promise.allSettled(
      jobs.map((j) => loadStats(roundDocId(j.id, j.round), LAYOUT[j.id].target))
    );

    const statsByGame = {};
    jobs.forEach((j, i) => {
      const res = results[i];
      (statsByGame[j.id] ||= []).push({
        round: j.round,
        current: (merged[j.id]?.round || 1) === j.round,
        ok: res.status === "fulfilled",
        data: res.status === "fulfilled" ? res.value : null,
        error: res.status === "rejected" ? res.reason : null
      });
      if (res.status === "rejected") {
        console.error(`[stats:${j.id}-r${j.round}]`, res.reason);
      }
    });

    // 한 게임을 그리다 터져도 나머지는 보여줍니다.
    games.innerHTML = ids.map((id) => {
      try {
        return renderGameBlock(id, statsByGame[id] || []);
      } catch (err) {
        console.error(`[render:${id}]`, err);
        return `<section class="game">${gameHead(id)}
          <p class="load-error">이 게임을 그리지 못했습니다 — ${explain(err)}</p>
        </section>`;
      }
    }).join("");
    bindRoundButtons();
  } catch (err) {
    console.error("[stats]", err);
    games.innerHTML = `<p class="load-error">${explain(err)}</p>` +
      ids.map((id) => `<section class="game">${gameHead(id)}</section>`).join("");
    bindRoundButtons();
  } finally {
    $("loading").hidden = true;
  }
}

function bindRoundButtons() {
  document.querySelectorAll("[data-new-round]").forEach((btn) => {
    btn.addEventListener("click", () => newRound(btn.dataset.newRound, btn));
  });
}

/** 한 게임의 전체 회차를 누적 집계와 함께 렌더합니다. */
function renderGameBlock(id, rounds) {
  const meta = LAYOUT[id];
  const good = rounds.filter((r) => r.ok).map((r) => r.data);

  // 게임 전체 누적 — 참여자는 회차가 달라도 같은 익명 id를 씁니다.
  const totalRaw = good.reduce((a, s) => a + s.raw, 0);
  const everyone = new Set();
  const actorsAll = new Set();
  good.forEach((s) => {
    s.users.forEach((u) => everyone.add(u.id));
    s.actors.forEach((u) => actorsAll.add(u.id));
  });

  const summary = `
    <div class="grid">
      ${cell("진행한 회차", `${rounds.length}회`)}
      ${cell(`누적 ${meta.unit}`, fmt(totalRaw))}
      ${cell("누적 고유 접속자", fmt(everyone.size))}
      ${cell("누적 참여자", fmt(actorsAll.size))}
    </div>`;

  const body = rounds.map((r) => {
    if (!r.ok) {
      return `<section class="round"><h3>${r.round}회차</h3>
        <p class="note">${explain(r.error)}</p>
      </section>`;
    }
    return renderRound(id, r);
  }).join("");

  return `<section class="game" data-game="${id}">${gameHead(id)}${summary}${body}</section>`;
}

function renderRound(id, r) {
  const meta = LAYOUT[id];
  const s = r.data;
  const ev = s.event || {};
  const done = ev.status === "completed";
  const total = meta.target ? s.shown : s.raw;

  const cells = [
    cell("상태", done ? "완료됨" : (ev.startTime ? "진행 중" : "시작 전")),
    cell(`전체 ${meta.unit}`,
      meta.target && s.raw > s.shown
        ? `${fmt(s.shown)} <small style="color:#555">(원장 ${fmt(s.raw)})</small>`
        : fmt(total)),
    meta.target ? cell("달성률", `${(s.shown / meta.target * 100).toFixed(2)}%`) : "",
    cell("고유 접속자", fmt(s.users.length)),
    cell("실제 참여자", fmt(s.actors.length)),
    cell("참여율", pct(s.actors.length, s.users.length)),
    cell("1인당 평균", s.actors.length ? (s.sum / s.actors.length).toFixed(1) : "—"),
    cell("최다 참여자", fmt(s.top1)),
    cell("상위 1명 비중", pct(s.top1, s.sum)),
    cell("상위 5명 비중", pct(s.top5, s.sum)),
    cell("시작 시각", clock(ev.startTime)),
    cell("소요 시간", ev.startTime
      ? (ev.endTime ? span(ev.endTime - ev.startTime) : `진행 중 (${span(Date.now() - ev.startTime)})`)
      : "—")
  ];

  if (id === "lock") cells.push(cell("정답자 수", fmt(s.solvers.length)));
  if (id === "tug") cells.push(cell("승리 팀", ev.winner || "—"));
  if (id === "button") {
    cells.push(cell("마지막 누른 시각", clock(ev.lastPress)));
    cells.push(cell("승자", ev.winner ? ev.winner.slice(0, 10) : "—"));
  }

  const ms = ev.milestones || {};
  const milestoneBlock = meta.target ? `
    <section class="block">
      <h3>구간별 도달 시각</h3>
      <div class="milestones">
        ${[25, 50, 75, 100].map((k) =>
          `<div><span>${k}%</span>${clock(ms[k])}</div>`).join("")}
      </div>
    </section>` : "";

  const rows = s.actors.length
    ? s.actors.map((u, i) => `
        <tr>
          <td>${i + 1}</td>
          <td title="${u.id}">${u.id.slice(0, 10)}</td>
          <td class="num">${fmt(u.count || 0)}</td>
          <td>${short(u.firstVisit)}</td>
          <td>${short(u.firstAction)}</td>
          <td>${short(u.lastAction)}</td>
          ${id === "lock" ? `<td>${u.solved ? short(u.solvedAt) : "—"}</td>` : ""}
        </tr>`).join("")
    : `<tr><td colspan="7">참여 데이터가 없습니다.</td></tr>`;

  return `
    <section class="round">
      <h3>${r.round}회차
        ${r.current ? '<span class="badge live">현재</span>' : ""}
        <span class="badge ${done ? "done" : ""}">${done ? "완료" : "진행 중"}</span>
      </h3>
      <div class="grid">${cells.join("")}</div>
      ${milestoneBlock}
      <section class="block">
        <h3>익명 참여자별 기록 (${meta.unit} 내림차순)</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>익명 ID</th><th class="num">${meta.unit}</th>
                <th>최초 접속</th><th>최초 참여</th><th>마지막 참여</th>
                ${id === "lock" ? "<th>정답 시각</th>" : ""}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
    </section>`;
}

// 화면의 입력칸 id → [게임, 항목]
const FIELDS = {
  "set-cylinder-target": ["cylinder", "target"],
  "set-melt-target": ["melt", "target"],
  "set-tug-winBy": ["tug", "winBy"],
  "set-lock-hintEvery": ["lock", "hintEvery"],
  "set-lock-cooldownMs": ["lock", "cooldownMs"],
  "set-button-resetSeconds": ["button", "resetSeconds"],
  "set-button-hideUnderSeconds": ["button", "hideUnderSeconds"],
  "set-button-maxPresses": ["button", "maxPresses"]
};

/** 현재 설정값을 입력칸에 채웁니다. */
async function fillSettings() {
  try {
    const merged = await gameSettings();
    for (const [id, [game, key]] of Object.entries(FIELDS)) {
      const v = merged[game]?.[key];
      if (v !== undefined) $(id).value = v;
    }
  } catch (err) {
    console.error("[fillSettings]", err);
    const msg = $("save-msg");
    msg.className = "save-msg err";
    msg.textContent = `설정을 읽지 못했습니다 — ${explain(err)}`;
  }
}

/** 설정을 저장합니다. 정답과 문구는 서버 함수를 통해서만 들어갑니다. */
async function onSave() {
  const msg = $("save-msg");
  msg.className = "save-msg";
  msg.textContent = "저장 중…";

  const merged = await gameSettings();
  const payload = {};
  for (const [id, [game, key]] of Object.entries(FIELDS)) {
    const v = Number($(id).value);
    if (!Number.isFinite(v)) continue;
    payload[game] = payload[game] || { ...(merged[game] || {}) };
    payload[game][key] = v;
  }

  const answer = $("set-lock-answer").value.trim();
  if (answer && !/^\d+$/.test(answer)) {
    msg.className = "save-msg err";
    msg.textContent = "자물쇠 정답은 숫자만 입력하세요.";
    return;
  }
  const meltText = $("set-melt-payload").value.trim();

  try {
    if (answer) {
      payload.lock = payload.lock || { ...merged.lock };
      payload.lock.digits = answer.length;
    }
    await saveSettings(payload);

    // 평문 정답은 브라우저를 떠나는 순간부터 서버 안에만 존재합니다.
    if (answer) {
      await setLockAnswer(
        roundDocId("lock", payload.lock?.round || merged.lock.round || 1), answer);
    }
    if (meltText) {
      await setPayload(
        roundDocId("melt", payload.melt?.round || merged.melt.round || 1), meltText);
    }

    resetSettingsCache();
    msg.className = "save-msg ok";
    msg.textContent = "저장했습니다. 참여자는 새로고침하면 반영됩니다.";
    $("set-lock-answer").value = "";
    $("set-melt-payload").value = "";
  } catch (err) {
    console.error("[save]", err);
    msg.className = "save-msg err";
    msg.textContent = `저장 실패 — ${explain(err)}`;
  }
}

/** 지우지 않고 회차만 올립니다. 이전 회차 기록은 그대로 남습니다. */
//
// 네이티브 confirm()을 쓰지 않습니다. 브라우저가 대화상자를 억제하면
// (한 번 "추가 대화상자 표시 안 함"을 누른 경우 등) 아무것도 뜨지 않은 채
// false가 돌아와, 버튼이 고장 난 것처럼 보입니다.
async function newRound(id, btn) {
  const merged = await gameSettings();
  const now = merged[id]?.round || 1;
  const next = now + 1;

  const box = document.createElement("span");
  box.className = "confirm";
  box.innerHTML =
    `<span>${next}회차로? ${now}회차 기록은 남습니다` +
    `${id === "lock" ? " · 정답 다시 설정 필요" : ""}</span>` +
    `<button type="button" class="ghost go">시작</button>` +
    `<button type="button" class="ghost no">취소</button>`;
  btn.replaceWith(box);

  const restore = () => box.replaceWith(btn);
  box.querySelector(".no").addEventListener("click", restore);
  box.querySelector(".go").addEventListener("click", async () => {
    box.querySelector(".go").disabled = true;
    box.querySelector("span").textContent = "시작 중…";
    try {
      await saveSettings({ ...merged, [id]: { ...merged[id], round: next } });
      loadAll();
    } catch (err) {
      console.error("[newRound]", err);
      box.querySelector("span").textContent = explain(err);
      box.querySelector(".go").disabled = false;
    }
  });
}

function openPanel(email) {
  $("gate").hidden = true;
  $("panel").hidden = false;
  $("my-uid").textContent = email;
  fillSettings();
  loadAll();
}

$("save").addEventListener("click", onSave);

// Supabase가 돌려주는 코드입니다. Firebase의 auth/* 코드와는 전혀 다릅니다.
const AUTH_ERRORS = {
  invalid_credentials: "이메일이나 비밀번호가 맞지 않습니다.",
  email_not_confirmed:
    "계정이 확인되지 않았습니다. Supabase > Authentication > Users 에서 해당 계정을 확인 처리하세요.",
  user_not_found: "그런 계정이 없습니다. Supabase > Authentication > Users 에서 추가하세요.",
  validation_failed: "이메일 형식이 올바르지 않습니다.",
  over_request_rate_limit: "시도가 너무 많습니다. 잠시 후 다시 해주세요.",
  email_provider_disabled:
    "Supabase > Authentication > Providers 에서 이메일 로그인을 켜주세요."
};

function loginError(err) {
  const known = AUTH_ERRORS[err?.code];
  if (known) return known;
  // 코드가 없거나 처음 보는 값이면 서버 문구를 그대로 보여줍니다.
  return err?.message || "로그인에 실패했습니다.";
}

$("gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("gate-error");
  err.hidden = true;
  try {
    const user = await signInAdminEmail(
      $("gate-email").value.trim(), $("gate-pw").value
    );
    $("gate-pw").value = "";
    openPanel(user.email);
  } catch (ex) {
    console.error("[login]", ex);
    err.hidden = false;
    err.textContent = loginError(ex);
  }
});

$("refresh").addEventListener("click", loadAll);

if (!configured) {
  $("gate").innerHTML =
    "<h1>설정이 필요합니다</h1><p class='note'><code>config.js</code>의 <code>supabaseConfig</code>를 채워주세요.</p>";
}
