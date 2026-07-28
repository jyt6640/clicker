// 게임 2 — 얼음 녹이기.
// 포인터를 움직인 거리가 마찰량으로 쌓입니다. 목표를 정확히 밟은 사람만
// 암호 문구를 보고, 나머지는 Good Job을 봅니다.

import {
  createSession, initAnalytics, configured, fmt, reduceMotion, gameSettings,
  getPayload, roundDocId, currentRound
} from "../shared/core.js?v=8";
import { statusHandler, showDone, showSetupNeeded, popper } from "../shared/ui.js?v=8";

const GAME_ID = "melt";
let target = 50000;               // 관리자 설정을 읽어 덮어씁니다.

const $ = (id) => document.getElementById(id);
const elCount = $("count");
const elSub = $("sub");
const elIce = $("ice");
const elCore = $("core");

const pop = popper(elCount, reduceMotion);

function render(total) {
  elCount.textContent = fmt(total);
  pop();

  const melt = Math.min(total / target, 1);
  elIce.style.setProperty("--melt", melt.toFixed(4));
  elIce.style.setProperty("--ice-alpha", (0.55 - 0.47 * melt).toFixed(3));
  elIce.style.setProperty("--ice-radius", `${Math.round(22 + melt * melt * 40)}px`);
  elCore.textContent = melt > 0.65 ? "🔓" : "🔒";
}

let dropTimer = null;
function startDrops() {
  if (dropTimer || reduceMotion) return;
  dropTimer = setInterval(() => {
    const d = document.createElement("span");
    d.className = "drop";
    const size = 5 + Math.random() * 6;
    d.style.width = `${size}px`;
    d.style.height = `${size}px`;
    d.style.left = `${Math.random() * (elIce.clientWidth - size)}px`;
    d.style.top = `${Math.random() * (elIce.clientHeight * 0.6)}px`;
    elIce.appendChild(d);
    requestAnimationFrame(() => {
      d.style.opacity = "1";
      d.style.transform = `translateY(${40 + Math.random() * 60}px) scale(0.4)`;
    });
    setTimeout(() => d.remove(), 700);
  }, 260);
}
function stopDrops() {
  clearInterval(dropTimer);
  dropTimer = null;
}

async function main() {
  initAnalytics(GAME_ID);
  if (!configured) { showSetupNeeded(); return; }

  target = (await gameSettings())[GAME_ID].target;
  render(0);

  // 이미 끝난 회차라면 onComplete가 createSession이 반환되기 전에 불립니다.
  // 그래서 회차 id를 미리 구해 둡니다.
  const roundId = roundDocId(GAME_ID, await currentRound(GAME_ID));

  const session = await createSession({
    gameId: GAME_ID,
    target,
    onTotal: render,
    onStatus: statusHandler(),
    onComplete: async (iWon) => {
      stopDrops();
      elIce.style.visibility = "hidden";
      if (!iWon) {
        showDone({ title: "Good Job!", gameId: GAME_ID });
        return;
      }
      // 승자 문구는 코드에 없습니다. 게임이 끝난 뒤에만 열리는 문서에서
      // 받아옵니다. 관리자가 아직 넣지 않았다면 문구 없이 넘어갑니다.
      const text = await getPayload(roundId);
      showDone({ title: "🧊", msg: text || "", gameId: GAME_ID });
    }
  });

  let rubbing = false;
  let lastX = 0;
  let lastY = 0;

  function begin(e) {
    rubbing = true;
    lastX = e.clientX;
    lastY = e.clientY;
    elIce.classList.add("rubbing");
    startDrops();
    elIce.setPointerCapture?.(e.pointerId);
    // 문지르지 않고 톡 누르기만 해도 조금은 녹습니다.
    session.add(5);
    if (navigator.vibrate) { try { navigator.vibrate(6); } catch (_) {} }
  }

  function move(e) {
    if (!rubbing) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) return;
    lastX = e.clientX;
    lastY = e.clientY;
    // 한 번의 이동으로 과하게 오르지 않도록 상한을 둡니다.
    session.add(Math.min(Math.round(dist * 1.5), 60));
  }

  function end() {
    if (!rubbing) return;
    rubbing = false;
    elIce.classList.remove("rubbing");
    stopDrops();
  }

  elIce.addEventListener("pointerdown", (e) => { e.preventDefault(); begin(e); });
  elIce.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  elIce.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" && e.code !== "Enter") return;
    e.preventDefault();
    session.add(5);
  });

  elSub.textContent = "문지르세요";
}

main();
