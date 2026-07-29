// firestore-dump.json 을 Supabase로 옮깁니다.
//
//   node tools/dump-firestore.mjs > firestore-dump.json
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_ANON_KEY=ey... \
//   SUPABASE_EMAIL=jyt6640@gmail.com \
//   SUPABASE_PASSWORD=... \
//   node tools/import-supabase.mjs firestore-dump.json
//
// 관리자 계정으로 로그인해 import_round RPC를 호출합니다. service role 키는
// 쓰지 않습니다. 이미 있는 회차는 건너뜁니다(여러 번 실행해도 안전).
//
// 의존성 없이 fetch만 씁니다. Node 18 이상이면 그대로 실행됩니다.

import { readFileSync } from "node:fs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.SUPABASE_EMAIL;
const PASSWORD = process.env.SUPABASE_PASSWORD;

if (!URL_ || !KEY || !EMAIL || !PASSWORD) {
  console.error("SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_EMAIL, SUPABASE_PASSWORD 를 모두 넣어주세요.");
  process.exit(1);
}

const dumpPath = process.argv[2] || "firestore-dump.json";
const dump = JSON.parse(readFileSync(dumpPath, "utf8"));

const iso = (ms) => (ms ? new Date(Number(ms)).toISOString() : null);

/** 샤드 문서 id를 카운터 갈래로 옮깁니다. 줄다리기만 L/R 접두사를 씁니다. */
function bucketOf(gameId, shardId) {
  if (!gameId.startsWith("tug")) return "main";
  if (shardId.startsWith("L")) return "LEFT";
  if (shardId.startsWith("R")) return "RIGHT";
  return "main";
}

function toRound(id, game, shards, users) {
  const counters = {};
  for (const s of shards) {
    const b = bucketOf(id, s.id);
    counters[b] = (counters[b] || 0) + (s.c || 0);
  }

  return {
    id,
    status: game.status || "active",
    target: game.target ?? null,
    start_time: iso(game.startTime),
    end_time: iso(game.endTime),
    milestones: Object.fromEntries(
      Object.entries(game.milestones || {}).map(([k, v]) => [k, iso(v)])
    ),
    hint_level: game.hintLevel || 0,
    last_press: iso(game.lastPress),
    last_presser: game.lastPresser ?? null,
    winner: game.winner ?? null,
    counters: Object.entries(counters).map(([bucket, value]) => ({ bucket, value })),
    participants: users.map((u) => ({
      uid: u.uid || u.id,
      // 예전 구조는 clicks, 지금 구조는 count 를 씁니다.
      count: u.count ?? u.clicks ?? 0,
      first_visit: iso(u.firstVisit),
      first_action: iso(u.firstAction ?? u.firstClick),
      last_action: iso(u.lastAction ?? u.lastClick),
      solved: Boolean(u.solved),
      solved_at: iso(u.solvedAt)
    }))
  };
}

/* ------------------------------------------------------------------ */

const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: KEY, "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD })
}).then((r) => r.json());

if (!auth.access_token) {
  console.error("로그인 실패:", auth.error_description || auth.msg || auth);
  process.exit(1);
}
console.log(`로그인: ${EMAIL}`);

async function importRound(round) {
  const res = await fetch(`${URL_}/rest/v1/rpc/import_round`, {
    method: "POST",
    headers: {
      apikey: KEY,
      authorization: `Bearer ${auth.access_token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ p: round })
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body}`);
  return body.replace(/"/g, "");
}

const rounds = [];

// 예전 구조는 원통의 0회차로 보존합니다. 지금의 1회차와 섞이지 않습니다.
if (dump.legacy?.shards?.length || dump.legacy?.users?.length) {
  rounds.push(toRound(
    "cylinder-r0",
    { ...(dump.legacy.event || {}), target: dump.legacy.event?.target ?? 20000 },
    dump.legacy.shards || [],
    dump.legacy.users || []
  ));
}

for (const [id, r] of Object.entries(dump.rounds || {})) {
  if (!r || !r.game) continue;
  // 회차 도입 전에 만들어진 문서는 id에 -r 접미사가 없습니다.
  // 0회차로 보존해 통계 페이지가 회차로 인식할 수 있게 합니다.
  const roundId = /-r\d+$/.test(id) ? id : `${id}-r0`;
  rounds.push(toRound(roundId, r.game, r.shards || [], r.users || []));
}

let ok = 0;
for (const round of rounds) {
  const total = round.counters.reduce((a, c) => a + c.value, 0);
  try {
    const result = await importRound(round);
    console.log(
      `${result === "imported" ? "옮김  " : "건너뜀"} ${round.id.padEnd(14)} ` +
      `합계 ${String(total).padStart(8)}  참여자 ${round.participants.length}`);
    if (result === "imported") ok++;
  } catch (err) {
    console.error(`실패   ${round.id}: ${err.message}`);
  }
}

console.log(`\n${rounds.length}개 중 ${ok}개를 옮겼습니다.`);
