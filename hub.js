// 메인 허브 — 다섯 게임을 아래로 훑으며 각자의 숫자를 보여줍니다.
//
// 게임 화면과 달리 여기서는 아무것도 쓰지 않습니다. 읽기만 합니다.

import { GAMES } from "./config.js?v=11";
import {
  refs, gameSettings, roundDocId, configured, fmt, reduceMotion
} from "./shared/core.js?v=11";
import { getDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// 허브는 다섯 게임을 한꺼번에 보여주므로 실시간 구독을 쓰면 읽기량이
// 게임 화면의 다섯 배가 됩니다. Firestore 읽기는 과금 대상이라, 여기서는
// 주기적으로 한 번씩만 읽습니다.
const POLL_MS = 15000;

const CARDS = [
  {
    id: "cylinder", path: "./cylinder/", unit: "클릭",
    line: "누를수록 원통에 금이 갑니다.\n다 같이 부수면 끝납니다.",
    tone: "#ffffff", glow: "rgba(255,255,255,0.14)"
  },
  {
    id: "melt", path: "./melt/", unit: "마찰",
    line: "문지르면 얼음이 녹습니다.\n마지막 한 명만 무언가를 봅니다.",
    tone: "#8fd3f4", glow: "rgba(143,211,244,0.16)"
  },
  {
    id: "lock", path: "./lock/", unit: "시도",
    line: "세 자리를 맞히면 열립니다.\n모두의 시도가 쌓이면 한 자리씩 드러납니다.",
    tone: "#e8c07d", glow: "rgba(232,192,125,0.16)"
  },
  {
    id: "tug", path: "./tug/", unit: "당기기",
    line: "들어가는 순간 편이 정해집니다.\n줄을 끌어오세요.",
    tone: "#7f9cff", glow: "rgba(127,156,255,0.18)"
  },
  {
    id: "button", path: "./button/", unit: "누름",
    line: "누르면 시간이 되돌아갑니다.\n다섯 번뿐입니다.",
    tone: "#ff6b52", glow: "rgba(255,107,82,0.18)"
  }
];

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
        <p class="reveal">${c.line.replace(/\n/g, "<br>")}</p>
        <div class="card-count reveal tabular" id="count-${c.id}">0</div>
        <div class="card-unit reveal">${target ? `${fmt(target)} ${c.unit} 중` : `${c.unit} 누적`}</div>
        ${target ? `<div class="bar reveal"><i id="bar-${c.id}"></i></div>` : ""}
        <a class="enter reveal" href="${c.path}">들어가기</a>
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
    const r = refs(roundDocId(c.id, cfg.round || 1));

    const [shardSnap, gameSnap] = await Promise.all([getDocs(r.shards), getDoc(r.game)]);

    let raw = 0;
    shardSnap.forEach((d) => { raw += d.data().c || 0; });
    const shown = target ? Math.min(raw, target) : raw;

    const elCount = $(`count-${c.id}`);
    if (elCount.textContent !== fmt(shown)) {
      elCount.textContent = fmt(shown);
      bump(elCount);
    }
    const elBar = $(`bar-${c.id}`);
    if (elBar) elBar.style.width = `${Math.min(shown / target, 1) * 100}%`;
    $(`done-${c.id}`).hidden =
      !(gameSnap.exists() && gameSnap.data().status === "completed");

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
