// firestore-dump.json 을 SQL Editor에 붙여넣을 수 있는 INSERT 문으로 바꿉니다.
//
//   node tools/dump-to-sql.mjs firestore-dump.json > supabase/import-data.sql
//
// import-supabase.mjs 와 달리 로그인이 필요 없습니다. SQL Editor는 관리자
// 권한으로 실행되므로 보안 정책이 막지 않습니다.

import { readFileSync } from "node:fs";

const dump = JSON.parse(readFileSync(process.argv[2] || "firestore-dump.json", "utf8"));

const q = (v) =>
  v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`;
const ts = (ms) => (ms ? `'${new Date(Number(ms)).toISOString()}'` : "null");
const num = (v) => (v === null || v === undefined ? "null" : String(v));

/** 줄다리기만 샤드 id의 L/R 접두사로 팀을 구분했습니다. */
function bucketOf(gameId, shardId) {
  if (!gameId.startsWith("tug")) return "main";
  if (shardId.startsWith("L")) return "LEFT";
  if (shardId.startsWith("R")) return "RIGHT";
  return "main";
}

const out = [
  "-- Firestore에서 옮겨온 기록입니다. Supabase SQL Editor에 붙여넣고 실행하세요.",
  "-- 이미 있는 행은 건드리지 않으므로 여러 번 실행해도 안전합니다.",
  "-- 생성 시각: " + new Date().toISOString(),
  "",
  "begin;",
  ""
];

let games = 0, counters = 0, parts = 0;

for (const [rawId, r] of Object.entries(dump.rounds || {})) {
  if (!r || !r.game) continue;

  // 회차 도입 전 문서는 id에 -r 접미사가 없습니다. 0회차로 보존합니다.
  const id = /-r\d+$/.test(rawId) ? rawId : `${rawId}-r0`;
  const g = r.game;

  const milestones = Object.fromEntries(
    Object.entries(g.milestones || {}).map(([k, v]) => [k, new Date(Number(v)).toISOString()])
  );

  out.push(`-- ${id}`);
  out.push(
    `insert into public.games (id, status, target, start_time, end_time, milestones, hint_level, last_press, last_presser, winner) values (` +
    `${q(id)}, ${q(g.status || "active")}, ${num(g.target)}, ` +
    `${ts(g.startTime)}, ${ts(g.endTime)}, ${q(JSON.stringify(milestones))}::jsonb, ` +
    `${num(g.hintLevel || 0)}, ${ts(g.lastPress)}, ${q(g.lastPresser)}, ${q(g.winner)})` +
    ` on conflict (id) do nothing;`);
  games++;

  const byBucket = {};
  for (const s of r.shards || []) {
    const b = bucketOf(id, s.id);
    byBucket[b] = (byBucket[b] || 0) + (s.c || 0);
  }
  for (const [bucket, value] of Object.entries(byBucket)) {
    out.push(
      `insert into public.counters (game_id, bucket, value) values (${q(id)}, ${q(bucket)}, ${value})` +
      ` on conflict (game_id, bucket) do update set value = excluded.value;`);
    counters++;
  }

  for (const u of r.users || []) {
    out.push(
      `insert into public.participants (game_id, uid, count, first_visit, first_action, last_action, solved, solved_at) values (` +
      `${q(id)}, ${q(u.uid || u.id)}, ${num(u.count ?? u.clicks ?? 0)}, ` +
      `${ts(u.firstVisit)}, ${ts(u.firstAction ?? u.firstClick)}, ${ts(u.lastAction ?? u.lastClick)}, ` +
      `${u.solved ? "true" : "false"}, ${ts(u.solvedAt)})` +
      ` on conflict (game_id, uid) do nothing;`);
    parts++;
  }
  out.push("");
}

// 옮긴 회차 중 가장 큰 번호를 현재 회차로 맞춰둡니다. 그래야 참여자가
// 지난 회차에 이어서 누르지 않고, 통계 화면이 올바른 회차를 현재로 봅니다.
const maxRound = {};
for (const rawId of Object.keys(dump.rounds || {})) {
  const id = /-r\d+$/.test(rawId) ? rawId : `${rawId}-r0`;
  const m = /^(.+)-r(\d+)$/.exec(id);
  if (!m) continue;
  maxRound[m[1]] = Math.max(maxRound[m[1]] || 0, Number(m[2]));
}
const rounds = Object.fromEntries(
  Object.entries(maxRound).map(([g, r]) => [g, { round: r }]));

out.push("-- 현재 회차를 옮겨온 것 중 가장 최근으로 맞춥니다.");
out.push(
  `insert into public.settings (key, value) values ('games', ${q(JSON.stringify(rounds))}::jsonb)` +
  ` on conflict (key) do update set value = public.settings.value || excluded.value;`);
out.push("");
out.push("commit;");
out.push("");
out.push(`-- 회차 ${games}개, 카운터 ${counters}개, 참여자 ${parts}명`);

console.log(out.join("\n"));
