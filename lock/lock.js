// 게임 3 — 자물쇠.
// 전체 시도 횟수는 모두가 공유합니다. hintEvery회마다 왼쪽부터 한 자리씩
// 공개되고, 정답을 맞히는 것은 개인입니다.

import {
  createSession, initAnalytics, configured, fmt, reduceMotion, gameSettings,
  checkAnswer, getHint
} from "../shared/core.js?v=6";
import { statusHandler, showDone, showSetupNeeded, popper } from "../shared/ui.js?v=6";

const GAME_ID = "lock";
// 관리자 설정을 읽어 덮어씁니다.
let digits = 3;
let answerSalt = "";
let hintEvery = 1000;
let cooldownMs = 2000;

const $ = (id) => document.getElementById(id);
const elCount = $("count");
const elDials = $("dials");
const elTry = $("try");
const elHint = $("hint");
const elShackle = $("shackle");
const elStage = $("stage");

const pop = popper(elCount, reduceMotion);

/* ------------------------------------------------------------------ */
/* 다이얼                                                              */
/* ------------------------------------------------------------------ */
let values = [];
const strips = [];

function buildDials() {
  values = new Array(digits).fill(0);
  for (let i = 0; i < digits; i++) {
    const dial = document.createElement("div");
    dial.className = "dial";
    dial.tabIndex = 0;
    dial.setAttribute("role", "spinbutton");
    dial.setAttribute("aria-label", `${i + 1}번째 자리`);
    dial.setAttribute("aria-valuemin", "0");
    dial.setAttribute("aria-valuemax", "9");

    const strip = document.createElement("div");
    strip.className = "strip";
    // 위아래로 여유 칸을 둬서 0에서 9로 넘어갈 때도 끊기지 않게 보이도록 한다.
    for (let n = -1; n <= 10; n++) {
      const s = document.createElement("span");
      s.textContent = String((n + 10) % 10);
      strip.appendChild(s);
    }
    dial.appendChild(strip);
    elDials.appendChild(dial);
    strips.push({ dial, strip });

    bindDial(i, dial);
  }
  // 무대가 아직 hidden이면 다이얼 높이가 0이라 칸 높이를 잴 수 없습니다.
  // 실제로 보이게 되는 순간을 ResizeObserver로 잡아 다시 잽니다.
  new ResizeObserver(layout).observe(elDials);
  requestAnimationFrame(layout);
}

/** 칸 높이를 다이얼 높이와 같게 맞춘다. 한 번에 숫자 하나만 보이게 된다. */
function layout() {
  strips.forEach(({ dial, strip }, i) => {
    const h = dial.clientHeight;
    if (!h) return;                    // 아직 화면에 없음
    strip.style.setProperty("--item-h", `${h}px`);
    paint(i, true);
  });
}

function itemHeight(i) {
  return strips[i].dial.clientHeight;
}

function paint(i, instant = false) {
  const { dial, strip } = strips[i];
  // -1번 칸이 맨 위에 있으므로 값 v는 인덱스 v+1에 놓입니다.
  const offset = (values[i] + 1) * itemHeight(i);
  if (instant) strip.style.transition = "none";
  strip.style.transform = `translateY(${-offset}px)`;
  if (instant) requestAnimationFrame(() => { strip.style.transition = ""; });
  dial.setAttribute("aria-valuenow", String(values[i]));
}

function step(i, delta) {
  values[i] = (values[i] + delta + 10) % 10;
  paint(i);
  if (navigator.vibrate) { try { navigator.vibrate(4); } catch (_) {} }
}

function bindDial(i, dial) {
  let dragging = false;
  let startY = 0;
  let startVal = 0;

  dial.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startVal = values[i];
    dial.setPointerCapture?.(e.pointerId);
  });

  dial.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const moved = Math.round((startY - e.clientY) / (itemHeight(i) * 0.55));
    const next = (startVal + moved + 100) % 10;
    if (next !== values[i]) { values[i] = next; paint(i); }
  });

  const stop = (e) => {
    if (!dragging) return;
    dragging = false;
    // 거의 움직이지 않았으면 탭으로 보고 한 칸 올린다.
    if (Math.abs(startY - e.clientY) < 6) step(i, 1);
  };
  dial.addEventListener("pointerup", stop);
  dial.addEventListener("pointercancel", () => { dragging = false; });

  dial.addEventListener("wheel", (e) => {
    e.preventDefault();
    step(i, e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  dial.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") { e.preventDefault(); step(i, 1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); step(i, -1); }
    else if (/^[0-9]$/.test(e.key)) { values[i] = Number(e.key); paint(i); }
  });
}

/* ------------------------------------------------------------------ */
/* 힌트                                                                */
/* ------------------------------------------------------------------ */
// 힌트 숫자도 코드에 없습니다. 공개 단계에 도달했을 때 서버에서 한 자리씩
// 받아옵니다. 아직 잠긴 자리는 규칙이 읽기를 막습니다.
const known = [];
let renderedHintFor = 0;

async function updateHint(attempts, session) {
  const unlocked = Math.min(Math.floor(attempts / hintEvery), digits);
  if (unlocked <= renderedHintFor) return;
  renderedHintFor = unlocked;

  // 공개 단계를 서버에 기록해야 그 자리 힌트를 읽을 수 있게 됩니다.
  await session.patchGame({ hintLevel: unlocked });

  for (let i = known.length; i < unlocked; i++) {
    const d = await getHint(i + 1);
    if (d === null) break;
    known.push(d);
  }

  const shown = known.map((d) => `<b>${d}</b>`);
  while (shown.length < digits) shown.push("?");
  elHint.innerHTML = shown.join(" ");
}

/* ------------------------------------------------------------------ */
/* 진행                                                                */
/* ------------------------------------------------------------------ */
async function main() {
  initAnalytics(GAME_ID);
  if (!configured) { showSetupNeeded(); return; }

  const cfg = (await gameSettings())[GAME_ID];
  digits = cfg.digits;
  answerSalt = cfg.answerSalt;
  hintEvery = cfg.hintEvery;
  cooldownMs = cfg.cooldownMs;

  elHint.textContent = new Array(digits).fill("?").join(" ");
  buildDials();
  window.addEventListener("resize", layout);

  let session;
  session = await createSession({
    gameId: GAME_ID,
    target: null,               // 상한 없이 시도 횟수를 계속 셉니다.
    onStatus: statusHandler(),
    onTotal: (attempts) => {
      elCount.textContent = fmt(attempts);
      pop();
      // 첫 스냅샷은 createSession이 반환되기 전에 올 수 있습니다.
      if (session) updateHint(attempts, session);
    }
  });
  updateHint(session.total, session);

  let cooling = false;

  async function attempt() {
    if (cooling || !session.add(1)) return;

    const guess = values.join("");

    // 힌트를 빨리 열려고 연타하는 것을 막는 쿨다운.
    cooling = true;
    elTry.disabled = true;
    const until = Date.now() + cooldownMs;
    const tick = setInterval(() => {
      const left = Math.max(0, until - Date.now());
      elTry.textContent = left > 0 ? `${(left / 1000).toFixed(1)}` : "열기";
      if (left <= 0) {
        clearInterval(tick);
        cooling = false;
        elTry.disabled = false;
        elTry.textContent = "열기";
      }
    }, 100);

    if (await checkAnswer(answerSalt, guess)) {
      clearInterval(tick);
      await session.patchUser({ solved: true, solvedAt: Date.now() });
      elShackle.classList.add("open");
      if (navigator.vibrate) { try { navigator.vibrate([12, 40, 24]); } catch (_) {} }
      setTimeout(() => showDone({ title: "🔓", gameId: GAME_ID }), 700);
      return;
    }

    elStage.classList.add("wrong");
    setTimeout(() => elStage.classList.remove("wrong"), 400);
  }

  elTry.addEventListener("click", attempt);
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Enter") return;
    e.preventDefault();
    attempt();
  });
}

main();
