// 게임 4 — 줄다리기.
// 접속하면 두 팀 중 하나에 무작위 배정되고(브라우저에 고정), 누를수록
// 매듭이 자기 쪽으로 끌려옵니다. 격차가 winBy에 닿으면 그 팀이 이깁니다.

import {
  createSession, initAnalytics, configured, fmt, reduceMotion, gameSettings
} from "../shared/core.js?v=6";
import { statusHandler, showDone, showSetupNeeded, popper } from "../shared/ui.js?v=6";

const GAME_ID = "tug";
let winBy = 3000;                 // 관리자 설정을 읽어 덮어씁니다.
const LEFT = "LEFT";
const RIGHT = "RIGHT";

const $ = (id) => document.getElementById(id);
const elCount = $("count");
const elKnot = $("knot");
const elPull = $("pull");
const elStage = $("stage");
const elLeft = $("score-left");
const elRight = $("score-right");

const pop = popper(elCount, reduceMotion);

// 팀은 브라우저에 고정합니다. 새로고침해도 편이 바뀌지 않습니다.
const STORE_KEY = "tug_team";
let myTeam = localStorage.getItem(STORE_KEY);
if (myTeam !== LEFT && myTeam !== RIGHT) {
  myTeam = Math.random() < 0.5 ? LEFT : RIGHT;
  localStorage.setItem(STORE_KEY, myTeam);
}
const mine = myTeam === LEFT ? "left" : "right";

let left = 0;
let right = 0;

function renderTeams() {
  elLeft.textContent = fmt(left);
  elRight.textContent = fmt(right);

  const diff = left - right;                       // 양수면 왼쪽 우세
  const ratio = Math.max(-1, Math.min(1, diff / winBy));
  const travel = elKnot.parentElement.clientWidth / 2 - 24;
  // 왼쪽 팀이 앞서면(diff > 0) 매듭은 왼쪽으로 끌려가야 하므로 부호를 뒤집는다.
  elKnot.style.transform = `translateX(${-ratio * travel}px)`;
  elKnot.classList.toggle("lead-left", diff > 0);
  elKnot.classList.toggle("lead-right", diff < 0);
}

async function main() {
  initAnalytics(GAME_ID);
  if (!configured) { showSetupNeeded(); return; }

  winBy = (await gameSettings())[GAME_ID].winBy;

  elStage.classList.add(`team-${mine}`);
  elCount.classList.add(`team-${mine}`);

  const session = await createSession({
    gameId: GAME_ID,
    target: null,                 // 승부는 격차로 판정하므로 상한이 없습니다.
    shardPrefix: myTeam === LEFT ? "L" : "R",
    onStatus: statusHandler(),
    onShards: (shards) => {
      left = 0;
      right = 0;
      for (const [id, v] of shards) {
        if (id.startsWith("L")) left += v;
        else if (id.startsWith("R")) right += v;
      }
      renderTeams();

      const diff = left - right;
      if (Math.abs(diff) >= winBy) {
        const winner = diff > 0 ? LEFT : RIGHT;
        session.markComplete(winner === myTeam, { winner });
      }
    },
    onTotal: (total) => {
      elCount.textContent = fmt(total);
      pop();
    },
    onComplete: (iWon) => {
      showDone({
        title: iWon ? "이겼습니다." : "졌습니다.",
        msg: `${fmt(left)} : ${fmt(right)}`,
        gameId: GAME_ID
      });
    }
  });

  function pull() {
    if (!session.add(1)) return;
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }
  }

  elPull.addEventListener("pointerdown", (e) => { e.preventDefault(); pull(); });
  elPull.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" && e.code !== "Enter") return;
    if (e.repeat && e.code === "Enter") return;
    e.preventDefault();
    pull();
  });

  window.addEventListener("resize", renderTeams);
  renderTeams();
}

main();
