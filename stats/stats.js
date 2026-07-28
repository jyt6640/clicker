// 제작자 통계 — 다섯 게임의 참여 데이터를 한 화면에 모읍니다.
//
// 이 주소는 공개돼 있고 코드도 누구나 읽을 수 있습니다. 실제 보호는 Firebase
// 이메일 계정 로그인과 보안 규칙이 합니다. 관리자 계정이 아니면 로그인 자체가
// 되지 않고, 설정·정답 문서에는 쓰기도 막혀 있습니다.

import { GAMES } from "../config.js?v=9";
import {
  loadStats, configured, fmt, gameSettings, settingsRef, signInAdminEmail,
  answerId, adminDoc, listRounds, roundDocId, hintDocId, resetSettingsCache
} from "../shared/core.js?v=9";
import { setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const LAYOUT = {
  cylinder: { path: "../", target: GAMES.cylinder.target, unit: "클릭" },
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

async function loadAll() {
  const games = $("games");
  $("loading").hidden = false;
  games.innerHTML = "";

  const merged = await gameSettings();
  const byGame = await listRounds();
  const ids = Object.keys(LAYOUT);

  // 진행 중인 회차는 아직 문서가 없을 수 있으므로 목록에 채워 넣습니다.
  for (const id of ids) {
    const now = merged[id]?.round || 1;
    byGame[id] = byGame[id] || [];
    if (!byGame[id].includes(now)) byGame[id].unshift(now);
    byGame[id].sort((a, b) => b - a);
  }

  const jobs = [];
  for (const id of ids) {
    for (const round of byGame[id]) {
      jobs.push({ id, round });
    }
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
    if (res.status === "rejected") console.error(`[stats:${j.id}-r${j.round}]`, res.reason);
  });

  games.innerHTML = ids.map((id) => renderGameBlock(id, statsByGame[id] || [])).join("");

  document.querySelectorAll("[data-new-round]").forEach((btn) => {
    btn.addEventListener("click", () => newRound(btn.dataset.newRound));
  });

  $("loading").hidden = true;
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
        <p class="note">데이터를 불러오지 못했습니다. 보안 규칙 배포를 확인하세요.</p>
      </section>`;
    }
    return renderRound(id, r);
  }).join("");

  return `
    <section class="game">
      <header class="game-head">
        <h2>${GAMES[id].title}</h2>
        <a class="url" href="${meta.path}" target="_blank" rel="noopener">${meta.path}</a>
        <button type="button" class="ghost" data-new-round="${id}">새 라운드 시작</button>
      </header>
      ${summary}
      ${body}
    </section>`;
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

/** 지우지 않고 회차만 올립니다. 이전 회차 기록은 그대로 남습니다. */
async function newRound(id) {
  const now = (await gameSettings())[id]?.round || 1;
  const next = now + 1;
  if (!confirm(
    `${GAMES[id].title}을(를) ${next}회차로 시작할까요?\n\n` +
    `${now}회차 기록은 지워지지 않고 그대로 남습니다. ` +
    `참여자는 새로고침하면 새 회차로 들어갑니다.` +
    (id === "lock" ? "\n\n자물쇠는 새 회차 정답을 다시 설정해야 열립니다." : "")
  )) return;

  const merged = await gameSettings();
  try {
    await setDoc(settingsRef(), { [id]: { ...merged[id], round: next } }, { merge: true });
    resetSettingsCache();
    loadAll();
  } catch (err) {
    console.error("[newRound]", err);
    alert("회차를 올리지 못했습니다. 관리자 계정으로 로그인했는지 확인하세요.");
  }
}

/* ------------------------------------------------------------------ */
/* 게임 설정 편집                                                       */
/* ------------------------------------------------------------------ */
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

async function fillSettings() {
  const merged = await gameSettings();
  for (const [id, [game, key]] of Object.entries(FIELDS)) {
    $(id).value = merged[game][key];
  }
}

async function saveSettings() {
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

  // 자물쇠 정답은 어디에도 평문으로 저장하지 않습니다. 정답의 해시를 문서
  // id로 쓴 빈 문서를 만들 뿐이고, 힌트 숫자는 따로 잠긴 문서에 넣습니다.
  const answer = $("set-lock-answer").value.trim();
  const secretWrites = [];
  if (answer) {
    if (!/^\d+$/.test(answer)) {
      msg.className = "save-msg err";
      msg.textContent = "자물쇠 정답은 숫자만 입력하세요.";
      return;
    }
    const salt = merged.lock.answerSalt;
    const lockRound = roundDocId("lock", merged.lock.round || 1);
    secretWrites.push(
      setDoc(adminDoc("lockAnswers", await answerId(salt, answer, lockRound)), { ok: true })
    );
    for (let i = 0; i < answer.length; i++) {
      secretWrites.push(
        setDoc(adminDoc("lockHints", hintDocId(lockRound, i + 1)), { d: answer[i] })
      );
    }
    payload.lock = payload.lock || { ...merged.lock };
    payload.lock.digits = answer.length;
    payload.lock.answerSalt = salt;
  }

  // 얼음 승자 문구도 코드가 아니라 서버에 둡니다. 게임이 끝나기 전에는
  // 규칙이 읽기를 막습니다.
  const meltText = $("set-melt-payload").value.trim();
  if (meltText) {
    const meltRound = roundDocId("melt", merged.melt.round || 1);
    secretWrites.push(setDoc(adminDoc("payloads", meltRound), { text: meltText }));
  }

  try {
    await Promise.all([setDoc(settingsRef(), payload, { merge: true }), ...secretWrites]);
    msg.className = "save-msg ok";
    resetSettingsCache();
    msg.textContent = "저장했습니다. 참여자는 새로고침하면 반영됩니다.";
    $("set-lock-answer").value = "";
    $("set-melt-payload").value = "";
  } catch (err) {
    console.error("[save]", err);
    msg.className = "save-msg err";
    msg.textContent =
      "저장 실패 — firestore.rules의 ADMIN_UID에 아래 관리자 ID가 들어가 있는지 확인하세요.";
  }
}

function openPanel(email) {
  $("gate").hidden = true;
  $("panel").hidden = false;
  $("my-uid").textContent = email;
  fillSettings();
  loadAll();
}

$("save").addEventListener("click", saveSettings);

const AUTH_ERRORS = {
  "auth/invalid-credential": "이메일이나 비밀번호가 맞지 않습니다.",
  "auth/invalid-email": "이메일 형식이 올바르지 않습니다.",
  "auth/user-not-found": "그런 계정이 없습니다. Firebase 콘솔에서 만들어주세요.",
  "auth/wrong-password": "비밀번호가 맞지 않습니다.",
  "auth/too-many-requests": "시도가 너무 많습니다. 잠시 후 다시 해주세요.",
  "auth/operation-not-allowed":
    "Firebase 콘솔 > Authentication 에서 이메일/비밀번호 로그인을 켜주세요."
};

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
    err.textContent = AUTH_ERRORS[ex.code] || `로그인 실패 (${ex.code || ex.message})`;
  }
});

$("refresh").addEventListener("click", loadAll);

if (!configured) {
  $("gate").innerHTML =
    "<h1>설정이 필요합니다</h1><p class='note'><code>config.js</code>의 <code>firebaseConfig</code>를 채워주세요.</p>";
}
