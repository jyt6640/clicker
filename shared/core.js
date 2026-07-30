// 다섯 게임이 공유하는 코어.
//
// 데이터는 회차 단위로 나뉩니다. games.id = '{게임}-r{회차}'.
// 초기화 대신 회차를 올리므로 지난 기록이 지워지지 않습니다.
//
// 클라이언트는 테이블에 직접 쓰지 않습니다. 증가·정답 대조·완료 처리는 전부
// 서버 함수(RPC)가 하며, 그래서 감소나 조작이 원천적으로 불가능합니다.
// 스키마와 정책은 supabase/schema.sql 에 있습니다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import {
  supabaseConfig, GA_MEASUREMENT_ID, FLUSH_INTERVAL_MS, GAMES
} from "../config.js?v=16";

export const configured =
  Boolean(supabaseConfig.url && supabaseConfig.anonKey);

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
/* 클라이언트                                                           */
/* ------------------------------------------------------------------ */
let _sb = null;
let _authPromise = null;

export function sb() {
  if (!_sb) {
    _sb = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }
  return _sb;
}

/** 익명 로그인. 같은 브라우저면 새로고침해도 같은 사람으로 이어집니다. */
function signIn() {
  if (_authPromise) return _authPromise;
  _authPromise = (async () => {
    const { data: { session } } = await sb().auth.getSession();
    if (session?.user) return session.user.id;
    const { data, error } = await sb().auth.signInAnonymously();
    if (error) throw error;
    return data.user.id;
  })();
  return _authPromise;
}

/** 관리자 이메일 로그인. 익명 세션을 대체합니다. */
export async function signInAdminEmail(email, password) {
  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw error;
  _authPromise = Promise.resolve(data.user.id);
  return data.user;
}

/* ------------------------------------------------------------------ */
/* 라운드                                                              */
/* ------------------------------------------------------------------ */
export const roundDocId = (gameId, round) => `${gameId}-r${round}`;

export function parseRoundId(docId) {
  const m = /^(.+)-r(\d+)$/.exec(docId);
  return m ? { gameId: m[1], round: Number(m[2]) } : null;
}

export async function currentRound(gameId) {
  const merged = await gameSettings();
  return merged[gameId]?.round || 1;
}

/* ------------------------------------------------------------------ */
/* 설정                                                                */
/* ------------------------------------------------------------------ */
let _settingsPromise = null;

export function resetSettingsCache() { _settingsPromise = null; }

/** config.js 기본값 위에 관리자가 저장한 값을 덮어씌웁니다. */
export function gameSettings() {
  if (!_settingsPromise) {
    _settingsPromise = sb()
      .from("settings").select("value").eq("key", "games").maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error("[settings]", error); return {}; }
        return data?.value || {};
      });
  }
  return _settingsPromise.then((over) => {
    const merged = {};
    for (const [id, base] of Object.entries(GAMES)) {
      merged[id] = { ...base, ...(over[id] || {}) };
    }
    return merged;
  });
}

export async function saveSettings(value) {
  const { error } = await sb()
    .from("settings").upsert({ key: "games", value });
  if (error) throw error;
  resetSettingsCache();
}

/* ------------------------------------------------------------------ */
/* 비밀 값 — 전부 서버에서만 다뤄집니다                                  */
/* ------------------------------------------------------------------ */

/** 정답이면 true. 정답은 응답에도 담기지 않습니다. */
export async function checkAnswer(roundId, guess) {
  await signIn();
  const { data, error } = await sb().rpc("check_lock_answer",
    { p_game: roundId, p_guess: guess });
  if (error) { console.error("[checkAnswer]", error); return false; }
  return data === true;
}

/** 공개 단계에 도달한 자리만 돌아옵니다. */
export async function getHint(roundId, index) {
  const { data, error } = await sb().rpc("get_lock_hint",
    { p_game: roundId, p_index: index });
  if (error) { console.error("[getHint]", error); return null; }
  return data || null;
}

export async function raiseHintLevel(roundId, level) {
  const { error } = await sb().rpc("raise_hint_level",
    { p_game: roundId, p_level: level });
  if (error) console.error("[raiseHintLevel]", error);
}

/** 게임이 끝난 뒤에만 돌아옵니다. */
export async function getPayload(roundId) {
  const { data, error } = await sb().rpc("get_payload", { p_game: roundId });
  if (error) { console.error("[getPayload]", error); return null; }
  return data || null;
}

export async function setLockAnswer(roundId, answer) {
  const { error } = await sb().rpc("set_lock_answer",
    { p_game: roundId, p_answer: answer });
  if (error) throw error;
}

export async function setPayload(roundId, text) {
  const { error } = await sb().rpc("set_payload",
    { p_game: roundId, p_text: text });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* 잡다                                                                */
/* ------------------------------------------------------------------ */
export const fmt = (n) => Math.floor(n).toLocaleString("ko-KR");
export const reduceMotion =
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const ms = (t) => (t ? new Date(t).getTime() : null);

/* ------------------------------------------------------------------ */
/* 게임 세션                                                            */
/* ------------------------------------------------------------------ */
/**
 * @param {string}  opts.gameId  게임 키 (회차는 내부에서 붙입니다)
 * @param {number?} opts.target  목표치. null이면 상한 없이 셉니다.
 * @param {string}  opts.bucket  카운터 갈래 (줄다리기의 팀 등)
 * 콜백
 *   onTotal(total)        서버에 반영된 합계가 바뀔 때
 *   onBuckets(map)        갈래별 합계가 바뀔 때
 *   onEvent(row)          게임 행이 바뀔 때
 *   onStatus(state)       'connecting' | 'online' | 'reconnecting' | 에러 문자열
 *   onComplete(iWon)      끝났을 때
 */
export async function createSession(opts) {
  const {
    gameId, target = null, bucket = "main",
    onTotal = () => {}, onBuckets = () => {}, onEvent = () => {},
    onStatus = () => {}, onComplete = () => {}
  } = opts;

  const roundId = roundDocId(gameId, await currentRound(gameId));
  const client = sb();

  let uid = null;
  let authReady = false;
  let liveReady = false;
  let online = navigator.onLine;

  let total = 0;
  let myCount = 0;
  let completed = false;
  let announced = false;
  let gameRow = {};

  const buckets = new Map();
  let queue = 0;
  let inFlight = 0;
  let flushing = false;

  const connected = () => authReady && liveReady && online;
  const pushStatus = () =>
    onStatus(connected() ? "online" : (authReady ? "reconnecting" : "connecting"));

  try {
    uid = await signIn();
    authReady = true;
  } catch (err) {
    console.error("[auth]", err);
    onStatus("익명 로그인 실패 — Supabase에서 익명 로그인을 켜주세요");
    throw err;
  }

  // 회차를 만들고 방문 기록을 남깁니다.
  const { data: joined, error: joinErr } = await client.rpc("join_game", {
    p_game: roundId, p_target: target
  });
  if (joinErr) {
    console.error("[join]", joinErr);
    onStatus("연결 실패 — supabase/schema.sql을 실행했는지 확인하세요");
    throw joinErr;
  }
  const row = joined?.[0];
  if (row) {
    total = Number(row.total) || 0;
    myCount = Number(row.my_count) || 0;
  }

  async function readCounters() {
    const { data, error } = await client
      .from("counters").select("bucket, value").eq("game_id", roundId);
    if (error) { console.error("[counters]", error); return; }
    buckets.clear();
    let sum = 0;
    for (const c of data) {
      buckets.set(c.bucket, Number(c.value));
      sum += Number(c.value);
    }
    total = target ? Math.min(sum, target) : sum;
    onBuckets(buckets);
    onTotal(total);
  }

  async function readGame() {
    const { data, error } = await client
      .from("games").select("*").eq("id", roundId).maybeSingle();
    if (error || !data) return;
    gameRow = {
      ...data,
      lastPress: ms(data.last_press),
      lastPresser: data.last_presser,
      startTime: ms(data.start_time),
      endTime: ms(data.end_time),
      hintLevel: data.hint_level
    };
    onEvent(gameRow);
    if (gameRow.status === "completed") finish(false);
  }

  await readCounters();
  await readGame();

  // 실시간 구독 — 남이 누른 것도 즉시 반영됩니다.
  client
    .channel(`game:${roundId}`)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "counters", filter: `game_id=eq.${roundId}` },
      readCounters)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "games", filter: `id=eq.${roundId}` },
      readGame)
    .subscribe((status) => {
      liveReady = status === "SUBSCRIBED";
      pushStatus();
    });

  function finish(iWon) {
    completed = true;
    if (announced) return;
    announced = true;
    track("game_complete", { game_id: gameId });
    onComplete(iWon);
  }

  async function flush() {
    if (flushing || queue === 0 || completed || !connected()) return;

    const n = target ? Math.min(queue, Math.max(target - total, 0)) : queue;
    if (n <= 0) { queue = 0; return; }

    flushing = true;
    queue -= n;
    inFlight = n;

    try {
      const { data, error } = await client.rpc("bump",
        { p_game: roundId, p_amount: n, p_bucket: bucket });
      if (error) throw error;

      const res = data?.[0];
      if (res) {
        if (myCount === 0) track("first_action", { game_id: gameId });
        myCount += n;
        total = target ? Math.min(Number(res.total), target) : Number(res.total);
        onTotal(total);
        if (res.completed) finish(res.won === true);
      }
    } catch (err) {
      console.error("[bump]", err);
      queue += n;                    // 실패분은 되돌려 재시도
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
    roundId,
    get myCount() { return myCount; },
    get total() { return total; },
    get completed() { return completed; },
    get game() { return gameRow; },
    connected,
    add(n = 1) {
      if (completed || !connected()) return false;
      if (target && total + queue + inFlight >= target) return false;
      queue += n;
      return true;
    },
    async pressButton() {
      const { error } = await client.rpc("press_button", { p_game: roundId });
      if (error) console.error("[press]", error);
    },
    async finishGame(iWon, winner) {
      const { error } = await client.rpc("finish_game",
        { p_game: roundId, p_winner: winner ?? null });
      if (error) console.error("[finish]", error);
      finish(iWon);
    },
    raiseHintLevel: (level) => raiseHintLevel(roundId, level)
  };
}

/* ------------------------------------------------------------------ */
/* 통계                                                                */
/* ------------------------------------------------------------------ */
export async function loadStats(roundId, target) {
  const [gameRes, countersRes, partsRes] = await Promise.all([
    sb().from("games").select("*").eq("id", roundId).maybeSingle(),
    sb().from("counters").select("bucket, value").eq("game_id", roundId),
    sb().from("participants").select("*").eq("game_id", roundId)
  ]);

  for (const r of [gameRes, countersRes, partsRes]) {
    if (r.error) throw r.error;
  }

  const g = gameRes.data || {};
  const raw = (countersRes.data || []).reduce((a, c) => a + Number(c.value), 0);
  const shown = target ? Math.min(raw, target) : raw;

  const users = (partsRes.data || []).map((p) => ({
    id: p.uid,
    count: Number(p.count) || 0,
    firstVisit: ms(p.first_visit),
    firstAction: ms(p.first_action),
    lastAction: ms(p.last_action),
    solved: p.solved,
    solvedAt: ms(p.solved_at)
  }));
  const actors = users.filter((u) => u.count > 0)
                      .sort((a, b) => b.count - a.count);
  const sum = actors.reduce((a, u) => a + u.count, 0);

  return {
    roundId,
    event: {
      status: g.status,
      startTime: ms(g.start_time),
      endTime: ms(g.end_time),
      milestones: g.milestones || {},
      lastPress: ms(g.last_press),
      winner: g.winner
    },
    raw, shown, target,
    users, actors, sum,
    solvers: users.filter((u) => u.solved),
    top1: actors[0]?.count || 0,
    top5: actors.slice(0, 5).reduce((a, u) => a + u.count, 0),
    buckets: Object.fromEntries((countersRes.data || []).map((c) => [c.bucket, Number(c.value)]))
  };
}

/** 존재하는 회차를 게임별로 묶어 돌려줍니다. */
export async function listRounds() {
  const { data, error } = await sb().from("games").select("id");
  if (error) throw error;
  const byGame = {};
  for (const g of data) {
    const parsed = parseRoundId(g.id);
    if (!parsed) continue;
    (byGame[parsed.gameId] ||= []).push(parsed.round);
  }
  for (const rounds of Object.values(byGame)) rounds.sort((a, b) => b - a);
  return byGame;
}

/** 허브에서 쓰는 가벼운 읽기 */
export async function readTotals(roundId, target) {
  const [c, g] = await Promise.all([
    sb().from("counters").select("value").eq("game_id", roundId),
    sb().from("games").select("status").eq("id", roundId).maybeSingle()
  ]);
  const raw = (c.data || []).reduce((a, x) => a + Number(x.value), 0);
  return {
    total: target ? Math.min(raw, target) : raw,
    completed: g.data?.status === "completed"
  };
}
