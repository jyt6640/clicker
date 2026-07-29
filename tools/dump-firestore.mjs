// Firestore에 남아 있는 기록을 전부 JSON으로 꺼냅니다.
//
//   node tools/dump-firestore.mjs > firestore-dump.json
//
// 공개 읽기가 허용된 경로만 웹 API 키로 읽습니다. 비밀 키는 쓰지 않습니다.
// 무료 한도를 넘긴 상태면 429가 나므로, 태평양시 자정 이후에 실행하세요.

const PROJECT = "clicker-2f0d7";
const KEY = "AIzaSyAEXF185njXPlQGn-MeMjkVpQezcdOUJwA";
const BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

/** Firestore REST의 타입 래핑을 벗겨 평범한 값으로 만듭니다. */
function unwrap(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    const [type, val] = Object.entries(v)[0];
    if (type === "integerValue") out[k] = Number(val);
    else if (type === "doubleValue") out[k] = Number(val);
    else if (type === "booleanValue") out[k] = val;
    else if (type === "nullValue") out[k] = null;
    else if (type === "mapValue") out[k] = unwrap(val.fields);
    else if (type === "arrayValue") out[k] = (val.values || []).map((x) => unwrap({ x }).x);
    else out[k] = val;
  }
  return out;
}

async function get(path) {
  const res = await fetch(`${BASE}/${path}?key=${KEY}`);
  const body = await res.json();
  if (body.error) throw new Error(`${path} → ${body.error.status}: ${body.error.message}`);
  return body;
}

async function listAll(path) {
  const docs = [];
  let token = "";
  do {
    const res = await fetch(
      `${BASE}/${path}?key=${KEY}&pageSize=300${token ? `&pageToken=${token}` : ""}`);
    const body = await res.json();
    if (body.error) throw new Error(`${path} → ${body.error.status}: ${body.error.message}`);
    for (const d of body.documents || []) {
      docs.push({ id: d.name.split("/").pop(), ...unwrap(d.fields) });
    }
    token = body.nextPageToken || "";
  } while (token);
  return docs;
}

const dump = { dumpedAt: new Date().toISOString(), legacy: {}, rounds: {} };

// 예전 구조 (clickEvent / clickUsers)
try {
  dump.legacy.event = unwrap((await get("clickEvent/main")).fields);
  dump.legacy.shards = await listAll("clickEvent/main/shards");
  dump.legacy.users = await listAll("clickUsers");
} catch (err) {
  dump.legacy.error = String(err.message);
}

// 현재 구조 (games/{게임}-r{회차})
try {
  for (const game of await listAll("games")) {
    const id = game.id;
    dump.rounds[id] = {
      game,
      shards: await listAll(`games/${id}/shards`),
      users: await listAll(`games/${id}/users`)
    };
  }
} catch (err) {
  dump.rounds.error = String(err.message);
}

// 사람이 먼저 확인할 수 있게 요약을 함께 담습니다.
dump.summary = {};
if (dump.legacy.shards) {
  dump.summary["clickEvent/main"] = {
    total: dump.legacy.shards.reduce((a, s) => a + (s.c || 0), 0),
    users: dump.legacy.users?.length ?? 0,
    actors: (dump.legacy.users || []).filter((u) => (u.clicks || 0) > 0).length
  };
}
for (const [id, r] of Object.entries(dump.rounds)) {
  if (!r.shards) continue;
  dump.summary[id] = {
    total: r.shards.reduce((a, s) => a + (s.c || 0), 0),
    users: r.users.length,
    actors: r.users.filter((u) => (u.count || 0) > 0).length
  };
}

console.log(JSON.stringify(dump, null, 2));
