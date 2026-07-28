// 제작자 통계 — 다섯 게임의 참여 데이터를 한 화면에 모읍니다.
//
// 비밀번호는 보안이 아니라 실수 방지용입니다. 정적 페이지이므로 소스를 보면
// 누구나 읽을 수 있습니다. 그래서 이 화면은 읽기 전용이고, 데이터를 망가뜨리는
// 기능은 규칙 층에서 아예 막혀 있습니다.

import { GAMES, ADMIN_PASSWORD } from "../config.js?v=4";
import {
  loadStats, configured, fmt, gameSettings, settingsRef, signInAdmin
} from "../shared/core.js?v=4";
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

function renderGame(id, s) {
  const meta = LAYOUT[id];
  const ev = s.event || {};
  const done = ev.status === "completed";
  const total = meta.target ? s.shown : s.raw;

  const cells = [
    cell("상태", done ? "완료됨" : "진행 중"),
    cell(`전체 ${meta.unit}`,
      s.raw > s.shown && meta.target
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
    <section class="game">
      <h2>${GAMES[id].title}
        <span class="badge ${done ? "done" : ""}">${done ? "완료" : "진행 중"}</span>
      </h2>
      <a class="url" href="${meta.path}" target="_blank" rel="noopener">${meta.path}</a>
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

async function loadAll() {
  const games = $("games");
  $("loading").hidden = false;
  games.innerHTML = "";

  const ids = Object.keys(LAYOUT);
  const results = await Promise.allSettled(
    ids.map((id) => loadStats(id, LAYOUT[id].target))
  );

  games.innerHTML = results.map((res, i) => {
    const id = ids[i];
    if (res.status === "rejected") {
      console.error(`[stats:${id}]`, res.reason);
      return `<section class="game"><h2>${GAMES[id].title}</h2>
        <p class="note">데이터를 불러오지 못했습니다. 보안 규칙이 배포되었는지 확인하세요.</p>
      </section>`;
    }
    return renderGame(id, res.value);
  }).join("");

  $("loading").hidden = true;
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

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fillSettings() {
  const merged = await gameSettings();
  for (const [id, [game, key]] of Object.entries(FIELDS)) {
    $(id).value = merged[game][key];
  }
  signInAdmin().then((uid) => { $("my-uid").textContent = uid; })
               .catch(() => { $("my-uid").textContent = "(로그인 실패)"; });
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

  // 자물쇠 정답은 평문으로 저장하지 않습니다. 접두사별 해시만 올립니다.
  const answer = $("set-lock-answer").value.trim();
  if (answer) {
    if (!/^\d+$/.test(answer)) {
      msg.className = "save-msg err";
      msg.textContent = "자물쇠 정답은 숫자만 입력하세요.";
      return;
    }
    const salt = merged.lock.answerSalt;
    const hashes = [];
    for (let n = 1; n <= answer.length; n++) {
      const prefix = answer.slice(0, n);
      hashes.push(await sha256(`${salt}:${n}:${prefix}`));
    }
    payload.lock = payload.lock || { ...merged.lock };
    payload.lock.digits = answer.length;
    payload.lock.prefixHashes = hashes;
    payload.lock.answerSalt = salt;
  }

  try {
    await setDoc(settingsRef(), payload, { merge: true });
    msg.className = "save-msg ok";
    msg.textContent = "저장했습니다. 참여자는 새로고침하면 반영됩니다.";
    $("set-lock-answer").value = "";
  } catch (err) {
    console.error("[save]", err);
    msg.className = "save-msg err";
    msg.textContent =
      "저장 실패 — firestore.rules의 ADMIN_UID에 아래 관리자 ID가 들어가 있는지 확인하세요.";
  }
}

function openPanel() {
  $("gate").hidden = true;
  $("panel").hidden = false;
  fillSettings();
  loadAll();
}

$("save").addEventListener("click", saveSettings);

$("gate-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if ($("gate-pw").value === ADMIN_PASSWORD) {
    sessionStorage.setItem("stats_ok", "1");
    openPanel();
  } else {
    $("gate-error").hidden = false;
  }
});

$("refresh").addEventListener("click", loadAll);

if (!configured) {
  $("gate").innerHTML =
    "<h1>설정이 필요합니다</h1><p class='note'><code>config.js</code>의 <code>firebaseConfig</code>를 채워주세요.</p>";
} else if (sessionStorage.getItem("stats_ok") === "1") {
  openPanel();
}
