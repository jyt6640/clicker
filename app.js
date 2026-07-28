import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, doc, collection, onSnapshot, getDoc, getDocs,
  setDoc, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  GOOGLE_FORM_URL, TARGET_CLICKS, ADMIN_PASSWORD, GA_MEASUREMENT_ID,
  firebaseConfig, SHARD_COUNT, FLUSH_INTERVAL_MS
} from "./config.js?v=3";

/* ------------------------------------------------------------------ */
/* DOM                                                                 */
/* ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const elStatus = $("status");
const elStage = $("stage");
const elTotal = $("total");
const elProgress = $("progress");
const elCylinder = $("cylinder");
const elDone = $("done");
const elSurvey = $("survey");
const elSurveyPending = $("survey-pending");
const elSetup = $("setup");
const elAdmin = $("admin");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmt = (n) => n.toLocaleString("ko-KR");

/* ------------------------------------------------------------------ */
/* 구글 애널리틱스 (선택)                                               */
/* ------------------------------------------------------------------ */
function initAnalytics() {
  if (!GA_MEASUREMENT_ID || !GA_MEASUREMENT_ID.trim()) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID);
}
const track = (name, params) => {
  if (typeof window.gtag === "function") window.gtag("event", name, params || {});
};

/* ------------------------------------------------------------------ */
/* 상태                                                                */
/* ------------------------------------------------------------------ */
let db = null;
let uid = null;

let authReady = false;
let eventReady = false;
let shardsReady = false;
let online = navigator.onLine;

let total = 0;                       // 서버에 실제로 반영된 값만 반영
let shardValues = new Map();
let eventData = {};
let completed = false;
let completionShown = false;

let queue = 0;                       // 아직 서버에 못 보낸 클릭
let inFlight = 0;
let flushing = false;

let sentFirstClick = false;
let sessionClicks = 0;               // GA 요약용
const milestoneWritten = new Set();
let completionWriteTried = false;

let eventRef = null;
let shardsCol = null;
let usersCol = null;

const isConnected = () => authReady && eventReady && shardsReady && online;

/* ------------------------------------------------------------------ */
/* 부팅                                                                */
/* ------------------------------------------------------------------ */
function boot() {
  initAnalytics();

  if (GOOGLE_FORM_URL && GOOGLE_FORM_URL.trim()) {
    elSurvey.href = GOOGLE_FORM_URL;
    elSurvey.addEventListener("click", () => track("survey_click"));
  } else {
    elSurvey.hidden = true;
    elSurveyPending.hidden = false;
  }

  if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
    elStatus.hidden = true;
    elSetup.hidden = false;
    return;
  }

  elStage.hidden = false;
  renderTotal(0);

  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  const auth = getAuth(app);

  eventRef = doc(db, "clickEvent", "main");
  shardsCol = collection(db, "clickEvent", "main", "shards");
  usersCol = collection(db, "clickUsers");

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    uid = user.uid;
    authReady = true;
    registerVisitor();
    subscribe();
    refreshStatus();
  });

  signInAnonymously(auth).catch((err) => {
    console.error("[auth]", err);
    fail("익명 로그인 실패 — Firebase 콘솔에서 익명 인증을 켜주세요");
  });

  setInterval(flush, FLUSH_INTERVAL_MS);

  window.addEventListener("online", () => { online = true; refreshStatus(); });
  window.addEventListener("offline", () => { online = false; refreshStatus(); });
}

async function registerVisitor() {
  try {
    const ref = doc(usersCol, uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { clicks: 0, firstVisit: Date.now(), firstClick: null, lastClick: null });
    } else if (snap.data().firstClick) {
      sentFirstClick = true;
    }
  } catch (err) {
    console.error("[visitor]", err);
  }
}

/* ------------------------------------------------------------------ */
/* 실시간 구독                                                          */
/* ------------------------------------------------------------------ */
function subscribe() {
  onSnapshot(eventRef, (snap) => {
    eventReady = true;
    if (!snap.exists()) {
      setDoc(eventRef, {
        status: "active",
        target: TARGET_CLICKS,
        startTime: Date.now(),
        endTime: null,
        milestones: {}
      }).catch((e) => console.error("[event init]", e));
      refreshStatus();
      return;
    }
    eventData = snap.data();
    if (eventData.status === "completed") {
      completed = true;
      total = TARGET_CLICKS;
      render();
      showCompletion();
    }
    refreshStatus();
  }, (err) => {
    console.error("[event]", err);
    eventReady = false;
    refreshStatus();
  });

  onSnapshot(shardsCol, (snap) => {
    shardsReady = true;
    snap.docChanges().forEach((ch) => {
      if (ch.type === "removed") shardValues.delete(ch.doc.id);
      else shardValues.set(ch.doc.id, ch.doc.data().c || 0);
    });
    let sum = 0;
    for (const v of shardValues.values()) sum += v;
    // 샤드 합계는 목표를 아주 근소하게 넘을 수 있으므로 화면에는 항상 목표 이하로만 노출한다.
    total = Math.min(sum, TARGET_CLICKS);
    render();
    checkMilestones(sum);
    if (sum >= TARGET_CLICKS) markCompleted();
    refreshStatus();
  }, (err) => {
    console.error("[shards]", err);
    shardsReady = false;
    refreshStatus();
  });
}

/* ------------------------------------------------------------------ */
/* 화면                                                                */
/* ------------------------------------------------------------------ */
function refreshStatus() {
  if (isConnected()) {
    elStatus.classList.add("hide");
    elStage.classList.add("in");
  } else if (!elStatus.classList.contains("error")) {
    elStatus.classList.remove("hide");
    elStatus.textContent = authReady ? "다시 연결 중" : "연결 중";
  }
}

function fail(msg) {
  elStatus.classList.remove("hide");
  elStatus.classList.add("error");
  elStatus.textContent = msg;
}

let lastPop = 0;
function renderTotal(n) {
  elTotal.textContent = fmt(n);
  elProgress.textContent = `${fmt(n)} / ${fmt(TARGET_CLICKS)}`;
}

function render() {
  renderTotal(total);

  const now = Date.now();
  if (!reduceMotion && now - lastPop > 60) {
    lastPop = now;
    elTotal.classList.add("pop");
    setTimeout(() => elTotal.classList.remove("pop"), 100);
  }

  const r = total / TARGET_CLICKS;
  elCylinder.classList.toggle("s2", r >= 0.25 && r < 0.5);
  elCylinder.classList.toggle("s3", r >= 0.5 && r < 0.75);
  elCylinder.classList.toggle("s4", r >= 0.75 && r < 1);
}

/* ------------------------------------------------------------------ */
/* 클릭                                                                */
/* ------------------------------------------------------------------ */
function hit(e) {
  if (!isConnected() || completed) return;
  if (total + queue + inFlight >= TARGET_CLICKS) return;

  queue++;
  sessionClicks++;

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
  if (!elAdmin.hidden) return;
  if (e.repeat && e.code === "Enter") return;
  e.preventDefault();
  hit();
});

/* ------------------------------------------------------------------ */
/* 서버 반영 — 샤드 분산 + 원자적 증가                                   */
/* ------------------------------------------------------------------ */
async function flush() {
  if (flushing || queue === 0 || completed || !isConnected()) return;

  const room = TARGET_CLICKS - total;
  const n = Math.min(queue, room);
  if (n <= 0) { queue = 0; return; }

  flushing = true;
  queue -= n;
  inFlight = n;

  const shardId = String(Math.floor(Math.random() * SHARD_COUNT));
  const now = Date.now();

  try {
    await setDoc(doc(shardsCol, shardId), { c: increment(n) }, { merge: true });

    const userPatch = { clicks: increment(n), lastClick: now };
    if (!sentFirstClick) {
      userPatch.firstClick = now;
      sentFirstClick = true;
      track("first_click");
    }
    setDoc(doc(usersCol, uid), userPatch, { merge: true })
      .catch((e) => console.error("[user]", e));
  } catch (err) {
    console.error("[flush]", err);
    queue += n;          // 실패한 클릭은 되돌려 다시 시도한다
  } finally {
    inFlight = 0;
    flushing = false;
  }
}

// GA에는 클릭을 개별 전송하지 않고 30초마다 요약본만 보낸다.
setInterval(() => {
  if (sessionClicks > 0) {
    track("click_batch", { value: sessionClicks });
    sessionClicks = 0;
  }
}, 30000);

window.addEventListener("pagehide", () => {
  if (sessionClicks > 0) track("click_batch", { value: sessionClicks });
});

/* ------------------------------------------------------------------ */
/* 구간 도달 / 완료                                                     */
/* ------------------------------------------------------------------ */
async function checkMilestones(sum) {
  const marks = [
    [25, 0.25], [50, 0.5], [75, 0.75], [100, 1]
  ];
  const saved = eventData.milestones || {};
  for (const [key, ratio] of marks) {
    if (sum < TARGET_CLICKS * ratio) continue;
    if (saved[key] || milestoneWritten.has(key)) continue;
    milestoneWritten.add(key);
    track("milestone", { value: key });
    try {
      await updateDoc(eventRef, { [`milestones.${key}`]: Date.now() });
    } catch (err) {
      console.error("[milestone]", err);
      milestoneWritten.delete(key);
    }
  }
}

async function markCompleted() {
  completed = true;
  if (eventData.status !== "completed" && !completionWriteTried) {
    completionWriteTried = true;
    track("event_complete");
    try {
      await updateDoc(eventRef, { status: "completed", endTime: Date.now() });
    } catch (err) {
      console.error("[complete]", err);
    }
  }
  showCompletion();
}

function showCompletion() {
  if (completionShown) return;
  completionShown = true;

  const rect = elCylinder.getBoundingClientRect();
  elCylinder.style.visibility = "hidden";

  if (!reduceMotion) {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (let i = 0; i < 28; i++) {
      const p = document.createElement("div");
      p.className = "shard";
      const size = Math.random() * 18 + 8;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.left = `${cx}px`;
      p.style.top = `${cy}px`;
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

  elStatus.classList.add("hide");
  elStage.classList.remove("in");
  setTimeout(() => { elStage.hidden = true; }, 900);

  elDone.hidden = false;
  requestAnimationFrame(() => elDone.classList.add("in"));
}

/* ------------------------------------------------------------------ */
/* 제작자 통계 — 읽기 전용                                              */
/* ------------------------------------------------------------------ */
let triggerHits = [];
$("admin-trigger").addEventListener("click", () => {
  const now = Date.now();
  triggerHits = triggerHits.filter((t) => now - t < 2000);
  triggerHits.push(now);
  if (triggerHits.length < 5) return;
  triggerHits = [];
  const pw = prompt("제작자 통계 비밀번호");
  if (pw === null) return;
  if (pw !== ADMIN_PASSWORD) { alert("비밀번호가 일치하지 않습니다."); return; }
  openAdmin();
});

$("admin-close").addEventListener("click", () => { elAdmin.hidden = true; });
$("admin-refresh").addEventListener("click", openAdmin);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !elAdmin.hidden) elAdmin.hidden = true;
});

const clock = (ts) => ts ? new Date(ts).toLocaleString("ko-KR", { hour12: false }) : "—";
const clockShort = (ts) => ts ? new Date(ts).toLocaleTimeString("ko-KR", { hour12: false }) : "—";

function span(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? h + "시간 " : ""}${m}분 ${s % 60}초`;
}

async function openAdmin() {
  elAdmin.hidden = false;
  $("admin-loading").hidden = false;
  $("admin-body").hidden = true;

  try {
    const [eventSnap, shardSnap, userSnap] = await Promise.all([
      getDoc(eventRef), getDocs(shardsCol), getDocs(usersCol)
    ]);

    const ev = eventSnap.exists() ? eventSnap.data() : {};
    let raw = 0;
    shardSnap.forEach((d) => { raw += d.data().c || 0; });
    const shown = Math.min(raw, TARGET_CLICKS);

    const users = [];
    userSnap.forEach((d) => users.push({ id: d.id, ...d.data() }));
    const clickers = users.filter((u) => (u.clicks || 0) > 0)
                          .sort((a, b) => (b.clicks || 0) - (a.clicks || 0));

    const sumClicks = clickers.reduce((a, u) => a + (u.clicks || 0), 0);
    const top1 = clickers[0]?.clicks || 0;
    const top5 = clickers.slice(0, 5).reduce((a, u) => a + (u.clicks || 0), 0);
    const pct = (part, whole) => whole > 0 ? `${(part / whole * 100).toFixed(1)}%` : "—";

    $("s-status").textContent = ev.status === "completed" ? "완료됨" : "진행 중";
    $("s-total").textContent = raw > shown ? `${fmt(shown)} (원장 ${fmt(raw)})` : fmt(shown);
    $("s-percent").textContent = `${(shown / TARGET_CLICKS * 100).toFixed(2)}%`;
    $("s-visitors").textContent = fmt(users.length);
    $("s-clickers").textContent = fmt(clickers.length);
    $("s-rate").textContent = pct(clickers.length, users.length);
    $("s-avg").textContent = clickers.length ? (sumClicks / clickers.length).toFixed(1) : "—";
    $("s-top1n").textContent = fmt(top1);
    $("s-top1").textContent = pct(top1, sumClicks);
    $("s-top5").textContent = pct(top5, sumClicks);
    $("s-start").textContent = clock(ev.startTime);
    $("s-duration").textContent = ev.startTime
      ? (ev.endTime ? span(ev.endTime - ev.startTime) : `진행 중 (${span(Date.now() - ev.startTime)})`)
      : "—";

    const ms = ev.milestones || {};
    $("s-milestones").innerHTML = [25, 50, 75, 100]
      .map((k) => `<div><span>${k}%</span>${clock(ms[k])}</div>`).join("");

    $("s-users").innerHTML = clickers.length
      ? clickers.map((u, i) => `
          <tr>
            <td>${i + 1}</td>
            <td title="${u.id}">${u.id.slice(0, 10)}</td>
            <td class="num">${fmt(u.clicks || 0)}</td>
            <td>${clockShort(u.firstVisit)}</td>
            <td>${clockShort(u.firstClick)}</td>
            <td>${clockShort(u.lastClick)}</td>
          </tr>`).join("")
      : `<tr><td colspan="6">참여 데이터가 없습니다.</td></tr>`;

    $("admin-loading").hidden = true;
    $("admin-body").hidden = false;
  } catch (err) {
    console.error("[admin]", err);
    $("admin-loading").textContent = "데이터를 불러오지 못했습니다.";
  }
}

boot();
