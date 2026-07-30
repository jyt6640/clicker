// 게임 5 — 더 버튼.
// 타이머가 흐르고, 누구든 누르면 처음으로 되돌아갑니다. 남은 시간이
// hideUnderSeconds 아래로 내려가면 숫자가 사라져 감으로 버텨야 합니다.
// 한 사람이 누를 수 있는 횟수는 maxPresses로 제한됩니다.
// 아무도 누르지 않아 0에 닿으면 끝나고, 마지막에 누른 사람이 승자입니다.

import {
  createSession, initAnalytics, configured, fmt, reduceMotion, gameSettings
} from "../shared/core.js?v=20";
import { statusHandler, showDone, showSetupNeeded } from "../shared/ui.js?v=20";

const GAME_ID = "button";
let resetSeconds = 15;
let hideUnder = 3;
let maxPresses = 5;

const $ = (id) => document.getElementById(id);
const elCount = $("count");
const elSub = $("sub");
const elBtn = $("btn");
const elRing = elBtn.querySelector(".ring");

let lastPress = 0;
let lastPresser = null;
let finished = false;
let myUid = null;
let myPresses = 0;

const remaining = () =>
  Math.max(0, resetSeconds - (Date.now() - lastPress) / 1000);

function renderClock() {
  if (finished || !lastPress) return;
  const left = remaining();
  const ratio = left / resetSeconds;

  // 마지막 구간에서는 숫자를 감춥니다. 남은 시간을 감으로 재야 합니다.
  const blind = left <= hideUnder;
  elCount.textContent = blind ? "" : left.toFixed(1);
  elCount.classList.toggle("blind", blind);

  const warm = ratio <= 0.5 && ratio > 0.25;
  const hot = ratio <= 0.25;
  elCount.classList.toggle("warm", warm);
  elCount.classList.toggle("hot", hot);
  document.body.classList.toggle("warm", warm);
  document.body.classList.toggle("hot", hot);
  elBtn.classList.toggle("urgent", hot && !reduceMotion);
  elBtn.classList.toggle("blind", blind && !reduceMotion);
}

function renderQuota() {
  const left = Math.max(0, maxPresses - myPresses);
  elSub.textContent = "●".repeat(left) + "○".repeat(maxPresses - left);
  elBtn.disabled = left === 0;
}

async function main() {
  initAnalytics(GAME_ID);
  if (!configured) { showSetupNeeded(); return; }

  const cfg = (await gameSettings())[GAME_ID];
  resetSeconds = cfg.resetSeconds;
  hideUnder = cfg.hideUnderSeconds;
  maxPresses = cfg.maxPresses;

  const session = await createSession({
    gameId: GAME_ID,
    target: null,
    onStatus: statusHandler(),
    onEvent: (data) => {
      // 아직 아무도 안 눌렀다면 시작 시각을 기준점으로 씁니다.
      const stamp = data.lastPress || data.startTime;
      if (!stamp) return;
      const byOther = data.lastPresser !== lastPresser || stamp !== lastPress;
      data = { ...data, lastPress: stamp };
      lastPress = data.lastPress;
      lastPresser = data.lastPresser;

      if (byOther && !reduceMotion) {
        elRing.classList.remove("go");
        void elRing.offsetWidth;              // 애니메이션 재시작
        elRing.classList.add("go");
      }
      renderClock();
    },
    onComplete: (iWon) => {
      finished = true;
      elCount.classList.remove("blind");
      elCount.textContent = "0.0";
      showDone({
        title: iWon ? "당신이 마지막이었습니다." : "끝났습니다.",
        msg: iWon ? "" : `마지막에 누른 사람: ${(lastPresser || "—").slice(0, 10)}`,
        gameId: GAME_ID
      });
    }
  });

  myUid = session.uid;
  myPresses = session.myCount;
  renderQuota();

  setInterval(() => {
    if (finished || !lastPress) return;
    renderClock();
    if (remaining() <= 0) {
      finished = true;
      session.finishGame(lastPresser === myUid, lastPresser || null);
    }
  }, 100);

  function press() {
    if (finished || !session.connected()) return;
    if (myPresses >= maxPresses) return;
    if (remaining() <= 0) return;
    if (!session.add(1)) return;

    myPresses++;
    renderQuota();
    lastPress = Date.now();
    lastPresser = myUid;
    renderClock();
    session.pressButton();
    if (navigator.vibrate) { try { navigator.vibrate(10); } catch (_) {} }
  }

  elBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); press(); });
  elBtn.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" && e.code !== "Enter") return;
    if (e.repeat) return;
    e.preventDefault();
    press();
  });
}

main();
