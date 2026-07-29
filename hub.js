// 메인 허브 — 다섯 게임을 아래로 훑으며 각자의 숫자를 보여줍니다.
//
// 게임 화면과 달리 여기서는 아무것도 쓰지 않습니다. 읽기만 합니다.

import { GAMES } from "./config.js?v=14";
import {
  readTotals, gameSettings, roundDocId, configured, fmt, reduceMotion
} from "./shared/core.js?v=14";

// 허브는 다섯 게임을 한꺼번에 보여주므로 실시간 구독을 쓰면 읽기량이
// 게임 화면의 다섯 배가 됩니다. Firestore 읽기는 과금 대상이라, 여기서는
// 주기적으로 한 번씩만 읽습니다.
const POLL_MS = 15000;

const CARDS = [
  {
    id: "cylinder", path: "./cylinder/", unit: "번",
    line: "혼자 누르면 아무 일도 안 생깁니다.",
    tone: "#ffffff", glow: "rgba(255,255,255,0.14)"
  },
  {
    id: "melt", path: "./melt/", unit: "번",
    line: "안에 뭐가 들었는지는\n다 녹여야 알 수 있습니다.",
    tone: "#8fd3f4", glow: "rgba(143,211,244,0.16)"
  },
  {
    id: "lock", path: "./lock/", unit: "번",
    line: "세 자리입니다.\n천 번 틀릴 때마다 한 자리씩 흘립니다.",
    tone: "#e8c07d", glow: "rgba(232,192,125,0.16)"
  },
  {
    id: "tug", path: "./tug/", unit: "번",
    line: "들어오는 순간 편이 정해집니다.\n고를 수 없습니다.",
    tone: "#7f9cff", glow: "rgba(127,156,255,0.18)"
  },
  {
    id: "button", path: "./button/", unit: "번",
    line: "다섯 번뿐입니다.\n다 쓰면 지켜보는 것 말고 할 게 없습니다.",
    tone: "#ff6b52", glow: "rgba(255,107,82,0.18)"
  }
];

// 카드마다 다르게 도발합니다.
const TEASE = {
  cylinder: "부술 수 있을 것 같습니까",
  melt: "마지막 한 명만 봅니다",
  lock: "아직 아무도 못 열었습니다",
  tug: "지는 쪽은 아무것도 없습니다",
  button: "마지막에 누른 사람만 남습니다"
};

const $ = (id) => document.getElementById(id);
const elGames = $("games");
const elGrand = $("grand-total");

const totals = new Map();

function bump(el) {
  if (reduceMotion) return;
  el.classList.add("pop");
  setTimeout(() => el.classList.remove("pop"), 110);
}

function renderGrand() {
  let sum = 0;
  for (const v of totals.values()) sum += v;
  elGrand.textContent = fmt(sum);
  bump(elGrand);
}

function buildCards(settings) {
  elGames.innerHTML = CARDS.map((c, i) => {
    const cfg = settings[c.id];
    const target = cfg.target || null;
    return `
      <section class="card" id="card-${c.id}"
               style="--tone:${c.tone};--glow:${c.glow}">
        <div class="card-no reveal">0${i + 1}${cfg.round > 1 ? ` · ${cfg.round}회차` : ""}</div>
        <h2 class="reveal">${GAMES[c.id].title}</h2>
        <div class="tease reveal">${TEASE[c.id]}</div>
        <p class="reveal">${c.line.replace(/\n/g, "<br>")}</p>
        <div class="card-count reveal tabular" id="count-${c.id}">0</div>
        <div class="card-unit reveal">${target ? `${fmt(target)} ${c.unit} 중` : `누적 ${c.unit}`}</div>
        ${target ? `<div class="bar reveal"><i id="bar-${c.id}"></i></div>` : ""}
        <a class="enter reveal" href="${c.path}">할래요</a>
        <div class="card-done reveal" id="done-${c.id}" hidden>끝났습니다</div>
      </section>`;
  }).join("");
}

/** 스크롤해서 화면에 들어온 카드만 살아납니다. */
function watchReveal() {
  const cards = [...document.querySelectorAll(".card")];
  const showAll = () => cards.forEach((el) => el.classList.add("seen"));

  // 등장 연출은 어디까지나 장식입니다. 관찰자가 동작하지 않는 환경에서도
  // 내용은 반드시 보여야 하므로, 지원하지 않으면 즉시 전부 드러냅니다.
  if (typeof IntersectionObserver !== "function" || reduceMotion) {
    showAll();
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) e.target.classList.add("seen");
    });
  }, { threshold: 0.2 });
  cards.forEach((el) => io.observe(el));

  // 그래도 아무것도 드러나지 않았다면 연출을 포기하고 내용을 보여줍니다.
  setTimeout(() => {
    if (!document.querySelector(".card.seen")) showAll();
  }, 2500);
}

/** 각 게임의 현재 회차 카운터를 주기적으로 읽습니다. 쓰기는 하지 않습니다. */
function watchCounts(settings) {
  async function readOne(c) {
    const cfg = settings[c.id];
    const target = cfg.target || null;
    const { total: shown, completed } =
      await readTotals(roundDocId(c.id, cfg.round || 1), target);

    const elCount = $(`count-${c.id}`);
    if (elCount.textContent !== fmt(shown)) {
      elCount.textContent = fmt(shown);
      bump(elCount);
    }
    const elBar = $(`bar-${c.id}`);
    if (elBar) elBar.style.width = `${Math.min(shown / target, 1) * 100}%`;
    $(`done-${c.id}`).hidden = !completed;

    totals.set(c.id, shown);
  }

  async function readAll() {
    // 보이지 않는 탭에서는 읽지 않습니다.
    if (document.hidden) return;
    const results = await Promise.allSettled(CARDS.map(readOne));
    results.forEach((r, i) => {
      if (r.status === "rejected") console.error(`[hub:${CARDS[i].id}]`, r.reason);
    });
    renderGrand();
  }

  readAll();
  setInterval(readAll, POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) readAll();
  });
}

async function main() {
  if (!configured) {
    elGames.innerHTML =
      "<section class='card'><h2>설정이 필요합니다</h2><p><code>config.js</code>의 <code>firebaseConfig</code>를 채워주세요.</p></section>";
    return;
  }

  const settings = await gameSettings();
  buildCards(settings);
  watchReveal();
  watchCounts(settings);
}

main();
