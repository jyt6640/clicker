// 게임 1 — 원통 클릭. 목표에 도달하면 원통이 깨지고 전원이 설문 화면을 봅니다.

import {
  createSession, initAnalytics, configured, fmt, reduceMotion, gameSettings
} from "./shared/core.js?v=5";
import { statusHandler, showDone, showSetupNeeded, popper } from "./shared/ui.js?v=5";

const GAME_ID = "cylinder";
let target = 20000;               // 관리자 설정을 읽어 덮어씁니다.

const $ = (id) => document.getElementById(id);
const elCount = $("count");
const elSub = $("sub");
const elCylinder = $("cylinder");

const pop = popper(elCount, reduceMotion);

function render(total) {
  elCount.textContent = fmt(total);
  elSub.textContent = `${fmt(total)} / ${fmt(target)}`;
  pop();

  const r = total / target;
  elCylinder.classList.toggle("s2", r >= 0.25 && r < 0.5);
  elCylinder.classList.toggle("s3", r >= 0.5 && r < 0.75);
  elCylinder.classList.toggle("s4", r >= 0.75 && r < 1);
}

function shatter() {
  const rect = elCylinder.getBoundingClientRect();
  elCylinder.style.visibility = "hidden";
  if (reduceMotion) return;

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < 28; i++) {
    const p = document.createElement("div");
    p.className = "shard";
    const size = Math.random() * 18 + 8;
    p.style.cssText =
      `width:${size}px;height:${size}px;left:${cx}px;top:${cy}px`;
    document.body.appendChild(p);
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * 160 + 60;
    requestAnimationFrame(() => {
      p.style.transform =
        `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) rotate(${Math.random() * 540 - 270}deg)`;
      p.style.opacity = "0";
    });
    setTimeout(() => p.remove(), 950);
  }
}

async function main() {
  initAnalytics(GAME_ID);
  if (!configured) { showSetupNeeded(); return; }

  target = (await gameSettings())[GAME_ID].target;
  render(0);

  const session = await createSession({
    gameId: GAME_ID,
    target,
    onTotal: render,
    onStatus: statusHandler(),
    onComplete: () => {
      shatter();
      showDone({ title: "끝났습니다.", gameId: GAME_ID });
    }
  });

  function hit(e) {
    if (!session.add(1)) return;

    elCylinder.classList.add("press");
    setTimeout(() => elCylinder.classList.remove("press"), 80);
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }

    if (!reduceMotion && e && e.clientX !== undefined) {
      const rect = elCylinder.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "ripple";
      ripple.style.left = `${e.clientX - rect.left}px`;
      ripple.style.top = `${e.clientY - rect.top}px`;
      elCylinder.appendChild(ripple);
      setTimeout(() => ripple.remove(), 420);
    }
  }

  elCylinder.addEventListener("pointerdown", (e) => { e.preventDefault(); hit(e); });
  elCylinder.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" && e.code !== "Enter") return;
    if (e.repeat && e.code === "Enter") return;
    e.preventDefault();
    hit();
  });
}

main();
