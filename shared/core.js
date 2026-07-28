// 세 게임이 공유하는 코어.
//
// 게임마다 Firestore 네임스페이스가 완전히 분리됩니다.
//   games/{gameId}                  이벤트 상태
//   games/{gameId}/shards/{0..N}    카운터 샤드
//   games/{gameId}/users/{uid}      익명 참여자별 기록
//
// 카운터를 샤드로 쪼개는 이유: Firestore는 문서 하나당 지속 쓰기가 초당 1회
// 수준이라, 단일 문서에 몰아넣으면 동시 참여자가 수십 명일 때 병목이 됩니다.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, doc, collection, onSnapshot, getDoc, getDocs,
  setDoc, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  firebaseConfig, GA_MEASUREMENT_ID, SHARD_COUNT, FLUSH_INTERVAL_MS, GAMES
} from "../config.js?v=9";

export const configured = Boolean(firebaseConfig.projectId && firebaseConfig.apiKey);

/* ------------------------------------------------------------------ */
/* 구글 애널리틱스                                                      */
/* ------------------------------------------------------------------ */
let gaStarted = false;
export function initAnalytics(gameId) {
  if (gaStarted || !GA_MEASUREMENT_ID || !GA_MEASUREMENT_ID.trim()) return;
  gaStarted = true;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, { game_id: gameId });
}

export function track(name, params) {
  if (typeof window.gtag === "function") window.gtag("event", name, params || {});
}

/* ------------------------------------------------------------------ */
/* Firebase 싱글턴                                                      */
/* ------------------------------------------------------------------ */
let _app = null;
let _db = null;
let _auth = null;
let _authPromise = null;

const app = () => (_app ||= initializeApp(firebaseConfig));
function db() { return (_db ||= getFirestore(app())); }
function auth() { return (_auth ||= getAuth(app())); }

function signIn() {
  if (_authPromise) return _authPromise;
  const a = auth();
  _authPromise = new Promise((resolve, reject) => {
    const off = onAuthStateChanged(a, (user) => {
      if (user) { off(); resolve(user.uid); }
    });
    // 이미 로그인돼 있으면(관리자 이메일 로그인 등) 익명 로그인으로
    // 덮어쓰지 않습니다.
    if (!a.currentUser) signInAnonymously(a).catch(reject);
  });
  return _authPromise;
}

/**
 * 관리자 이메일 로그인. 익명 uid와 달리 브라우저 저장소를 지워도, 기기를
 * 바꿔도 그대로입니다. 계정은 Firebase 콘솔에서 직접 만들어야 합니다.
 */
export async function signInAdminEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth(), email, password);
  _authPromise = Promise.resolve(cred.user.uid);
  return cred.user;
}

export const refs = (gameId) => ({
  game: doc(db(), "games", gameId),
  shards: collection(db(), "games", gameId, "shards"),
  users: collection(db(), "games", gameId, "users")
});

export const settingsRef = () => doc(db(), "settings", "global");

/* ------------------------------------------------------------------ */
/* 라운드                                                              */
/* ------------------------------------------------------------------ */
// 게임을 초기화하는 대신 새 라운드를 시작합니다. 이전 라운드 문서는 그대로
// 남아 회차별 기록을 비교할 수 있고, 삭제를 막아둔 규칙과도 충돌하지 않습니다.
//   games/cylinder-r1, games/cylinder-r2, ...

export const roundDocId = (gameId, round) => `${gameId}-r${round}`;

/** 문서 id를 다시 게임과 회차로 나눕니다. 형식이 아니면 null. */
export function parseRoundId(docId) {
  const m = /^(.+)-r(\d+)$/.exec(docId);
  return m ? { gameId: m[1], round: Number(m[2]) } : null;
}

/** 지금 진행 중인 회차. 설정이 없으면 1회차입니다. */
export async function currentRound(gameId) {
  const merged = await gameSettings();
  return merged[gameId]?.round || 1;
}

/* ------------------------------------------------------------------ */
/* 비밀 값                                                             */
/* ------------------------------------------------------------------ */
// 자물쇠 정답은 어디에도 실려 오지 않습니다. 정답의 해시를 문서 id로 쓰고,
// 규칙에서 get만 허용하고 list는 막아둡니다. 맞는 값을 넣었을 때만 문서가
// 열리고, 틀리면 "문서 없음"만 돌아옵니다.

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 회차를 해시에 섞으므로 새 라운드를 시작하면 지난 회차의 정답은 통하지
// 않습니다.
export const answerId = (salt, value, roundId) =>
  sha256(`${salt}:answer:${roundId}:${value}`);

/** 정답이면 true. 네트워크 응답에도 정답은 담기지 않습니다. */
export async function checkAnswer(salt, guess, roundId) {
  await signIn();
  try {
    const snap = await getDoc(
      doc(db(), "lockAnswers", await answerId(salt, guess, roundId))
    );
    return snap.exists();
  } catch (err) {
    console.error("[checkAnswer]", err);
    return false;
  }
}

export const hintDocId = (roundId, index) => `${roundId}_${index}`;

/** 공개된 단계까지만 읽힙니다. 그 이상은 규칙이 막습니다. */
export async function getHint(roundId, index) {
  try {
    const snap = await getDoc(doc(db(), "lockHints", hintDocId(roundId, index)));
    return snap.exists() ? snap.data().d : null;
  } catch (_) {
    return null;                       // 아직 잠긴 힌트
  }
}

/** 관리자 페이지가 비밀 문서를 쓸 때 쓰는 참조 */
export const adminDoc = (col, id) => doc(db(), col, id);

/** 게임이 끝난 뒤에만 읽히는 문구 */
export async function getPayload(roundId) {
  try {
    const snap = await getDoc(doc(db(), "payloads", roundId));
    return snap.exists() ? snap.data().text : null;
  } catch (_) {
    return null;
  }
}

/**
 * config.js의 기본값 위에 Firestore의 관리자 설정을 덮어씌운 게임 설정.
 * 관리자 페이지에서 목표치·정답을 바꾸면 배포 없이 즉시 반영됩니다.
 * 설정 문서를 읽지 못하면 조용히 기본값으로 동작합니다.
 */
let _settingsPromise = null;

/** 관리자가 설정을 바꾼 뒤 다시 읽어오게 합니다. */
export function resetSettingsCache() { _settingsPromise = null; }

export function gameSettings() {
  if (!_settingsPromise) {
    _settingsPromise = getDoc(settingsRef())
      .then((snap) => (snap.exists() ? snap.data() : {}))
      .catch((err) => { console.error("[settings]", err); return {}; });
  }
  return _settingsPromise.then((over) => {
    const merged = {};
    for (const [id, base] of Object.entries(GAMES)) {
      merged[id] = { ...base, ...(over[id] || {}) };
    }
    return merged;
  });
}

export const fmt = (n) => Math.floor(n).toLocaleString("ko-KR");
export const reduceMotion =
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ */
/* 게임 세션                                                            */
/* ------------------------------------------------------------------ */
/**
 * @param {string}  opts.gameId  Firestore 네임스페이스 키
 * @param {number?} opts.target  목표치. null이면 상한 없이 계속 셉니다.
 * @param {number[]} opts.milestones  기록할 진행률(0~1). target이 있을 때만.
 * 콜백
 *   onTotal(total, raw)   서버에 반영된 합계가 바뀔 때
 *   onEvent(data)         이벤트 문서가 바뀔 때
 *   onStatus(state)       'connecting' | 'online' | 'reconnecting' | 에러 문자열
 *   onComplete(iWon)      target 도달. iWon은 마지막 증가분을 내가 넣었는지 여부
 */
export async function createSession(opts) {
  const {
    gameId, target = null, milestones = [0.25, 0.5, 0.75, 1],
    // 한 게임 안에서 카운터를 여러 갈래로 나눠야 할 때(줄다리기의 팀별
    // 점수 등) 샤드 문서 id 앞에 붙이는 접두사.
    shardPrefix = "",
    onTotal = () => {}, onEvent = () => {}, onStatus = () => {},
    onComplete = () => {}, onShards = () => {}
  } = opts;

  // 실제 데이터는 회차 문서 아래에 쌓입니다.
  const roundId = roundDocId(gameId, await currentRound(gameId));
  const r = refs(roundId);

  let uid = null;
  let authReady = false;
  let eventReady = false;
  let shardsReady = false;
  let online = navigator.onLine;

  let total = 0;                 // 화면에 쓰는 값 (target으로 클램프)
  let raw = 0;                   // 샤드 원장 합계
  let eventData = {};
  let completed = false;
  let announcedComplete = false;

  let queue = 0;
  let inFlight = 0;
  let flushing = false;

  let sentFirstAction = false;
  let lastSentRangeEnd = 0;      // 내가 마지막으로 채운 구간의 끝 번호
  const milestoneWritten = new Set();
  let completionWriteTried = false;

  const connected = () => authReady && eventReady && shardsReady && online;

  function pushStatus() {
    if (connected()) onStatus("online");
    else onStatus(authReady ? "reconnecting" : "connecting");
  }

  try {
    uid = await signIn();
    authReady = true;
  } catch (err) {
    console.error("[auth]", err);
    onStatus("익명 로그인 실패 — Firebase 콘솔에서 익명 인증을 켜주세요");
    throw err;
  }

  // 방문 기록. 새로고침해도 내가 지금까지 몇 번 참여했는지 이어집니다.
  let myCount = 0;
  try {
    const uref = doc(r.users, uid);
    const snap = await getDoc(uref);
    if (!snap.exists()) {
      await setDoc(uref, {
        count: 0, firstVisit: Date.now(), firstAction: null, lastAction: null
      });
    } else {
      myCount = snap.data().count || 0;
      if (snap.data().firstAction) sentFirstAction = true;
    }
  } catch (err) {
    console.error("[visitor]", err);
  }

  // 이벤트 문서
  onSnapshot(r.game, (snap) => {
    eventReady = true;
    if (!snap.exists()) {
      setDoc(r.game, {
        status: "active",
        target: target,
        startTime: Date.now(),
        endTime: null,
        milestones: {}
      }).catch((e) => console.error("[game init]", e));
      pushStatus();
      return;
    }
    eventData = snap.data();
    onEvent(eventData);
    // 끝난 게임은 계속 끝난 상태로 남습니다. 나중에 들어온 사람도 곧바로
    // 결과 화면을 봅니다. 되돌리려면 Firebase 콘솔에서 문서를 지우세요.
    if (eventData.status === "completed") finish(false);
    pushStatus();
  }, (err) => {
    console.error("[game]", err);
    eventReady = false;
    pushStatus();
  });

  // 샤드 합계
  const shardValues = new Map();
  onSnapshot(r.shards, (snap) => {
    shardsReady = true;
    snap.docChanges().forEach((ch) => {
      if (ch.type === "removed") shardValues.delete(ch.doc.id);
      else shardValues.set(ch.doc.id, ch.doc.data().c || 0);
    });
    raw = 0;
    for (const v of shardValues.values()) raw += v;
    total = target ? Math.min(raw, target) : raw;
    onShards(shardValues);
    onTotal(total, raw);
    if (target) {
      writeMilestones(raw);
      if (raw >= target) finish(lastSentRangeEnd >= target);
    }
    pushStatus();
  }, (err) => {
    console.error("[shards]", err);
    shardsReady = false;
    pushStatus();
  });

  async function writeMilestones(sum) {
    const saved = eventData.milestones || {};
    for (const ratio of milestones) {
      const key = String(Math.round(ratio * 100));
      if (sum < target * ratio) continue;
      if (saved[key] || milestoneWritten.has(key)) continue;
      milestoneWritten.add(key);
      track("milestone", { game_id: gameId, value: Number(key) });
      try {
        await updateDoc(r.game, { [`milestones.${key}`]: Date.now() });
      } catch (err) {
        console.error("[milestone]", err);
        milestoneWritten.delete(key);
      }
    }
  }

  async function finish(iWon) {
    completed = true;
    if (!completionWriteTried && eventData.status !== "completed") {
      completionWriteTried = true;
      track("game_complete", { game_id: gameId });
      try {
        await updateDoc(r.game, { status: "completed", endTime: Date.now() });
      } catch (err) {
        console.error("[complete]", err);
      }
    }
    if (announcedComplete) return;
    announcedComplete = true;
    onComplete(iWon);
  }

  /* 큐에 쌓고 주기적으로 원자적 증가 */
  async function flush() {
    if (flushing || queue === 0 || completed || !connected()) return;

    const n = target ? Math.min(queue, target - total) : queue;
    if (n <= 0) { queue = 0; return; }

    flushing = true;
    queue -= n;
    inFlight = n;

    // 이 증가분이 목표를 정확히 밟는지 판정하기 위해 시작 지점을 기억한다.
    const rangeStart = raw;
    const shardId = shardPrefix + Math.floor(Math.random() * SHARD_COUNT);
    const now = Date.now();

    try {
      await setDoc(doc(r.shards, shardId), { c: increment(n) }, { merge: true });
      lastSentRangeEnd = Math.max(lastSentRangeEnd, rangeStart + n);

      const patch = { count: increment(n), lastAction: now };
      if (!sentFirstAction) {
        patch.firstAction = now;
        sentFirstAction = true;
        track("first_action", { game_id: gameId });
      }
      setDoc(doc(r.users, uid), patch, { merge: true })
        .catch((e) => console.error("[user]", e));
    } catch (err) {
      console.error("[flush]", err);
      queue += n;              // 실패분은 되돌려 재시도
    } finally {
      inFlight = 0;
      flushing = false;
    }
  }

  setInterval(flush, FLUSH_INTERVAL_MS);
  window.addEventListener("online", () => { online = true; pushStatus(); });
  window.addEventListener("offline", () => { online = false; pushStatus(); });
  pushStatus();

  return {
    uid,
    /** 이번 회차의 Firestore 문서 id (예: lock-r2) */
    roundId,
    /** 이 브라우저가 지금까지 이 회차에 참여한 횟수(새로고침해도 이어집니다) */
    get myCount() { return myCount; },
    get total() { return total; },
    get raw() { return raw; },
    get completed() { return completed; },
    connected,
    /** 큐에 n만큼 쌓는다. 서버 반영 전에는 화면 숫자가 오르지 않는다. */
    add(n = 1) {
      if (completed || !connected()) return false;
      if (target && total + queue + inFlight >= target) return false;
      queue += n;
      return true;
    },
    /** target 없이 게임 쪽에서 승부를 판정하는 경우(줄다리기 등) */
    markComplete(iWon, extra) {
      if (extra) updateDoc(r.game, extra).catch((e) => console.error("[markComplete]", e));
      finish(iWon);
    },
    /** 이벤트 문서에 게임별 필드를 기록할 때(더 버튼의 마지막 누른 시각 등) */
    async patchGame(fields) {
      try {
        await updateDoc(r.game, fields);
      } catch (err) {
        console.error("[patchGame]", err);
      }
    },
    /** 자물쇠처럼 결과를 따로 기록해야 할 때 */
    async patchUser(fields) {
      try {
        await setDoc(doc(r.users, uid), fields, { merge: true });
      } catch (err) {
        console.error("[patchUser]", err);
      }
    }
  };
}

/* ------------------------------------------------------------------ */
/* 통계 집계 (통합 통계 페이지용)                                        */
/* ------------------------------------------------------------------ */
/** 회차 하나의 집계. roundId는 games 컬렉션의 문서 id입니다. */
export async function loadStats(roundId, target) {
  await signIn();
  const r = refs(roundId);
  const [gameSnap, shardSnap, userSnap] = await Promise.all([
    getDoc(r.game), getDocs(r.shards), getDocs(r.users)
  ]);

  const ev = gameSnap.exists() ? gameSnap.data() : {};
  let raw = 0;
  shardSnap.forEach((d) => { raw += d.data().c || 0; });
  const shown = target ? Math.min(raw, target) : raw;

  const users = [];
  userSnap.forEach((d) => users.push({ id: d.id, ...d.data() }));
  const actors = users.filter((u) => (u.count || 0) > 0)
                      .sort((a, b) => (b.count || 0) - (a.count || 0));

  const sum = actors.reduce((a, u) => a + (u.count || 0), 0);
  return {
    roundId, event: ev, raw, shown, target,
    users, actors, sum,
    solvers: users.filter((u) => u.solved),
    top1: actors[0]?.count || 0,
    top5: actors.slice(0, 5).reduce((a, u) => a + (u.count || 0), 0)
  };
}

/** games 컬렉션에 존재하는 모든 회차 문서 id를 게임별로 묶어 돌려줍니다. */
export async function listRounds() {
  await signIn();
  const snap = await getDocs(collection(db(), "games"));
  const byGame = {};
  snap.forEach((d) => {
    const parsed = parseRoundId(d.id);
    if (!parsed) return;
    (byGame[parsed.gameId] ||= []).push(parsed.round);
  });
  for (const rounds of Object.values(byGame)) rounds.sort((a, b) => b - a);
  return byGame;
}
