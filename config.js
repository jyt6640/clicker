// ==========================================================================
// 설정 파일 — 여기만 수정하면 됩니다.
// ==========================================================================

// 1) 결과 화면의 구글 설문 링크. 세 게임이 공용으로 씁니다.
//    비워두면("") 버튼 대신 "설문 준비 중" 문구가 표시됩니다.
export const GOOGLE_FORM_URL = "https://forms.gle/rYcpjhz8FVABvcFb6";

// 2) 게임별 설정
export const GAMES = {
  // 게임 1 — 원통 클릭 (/)
  cylinder: {
    title: "원통 클릭",
    target: 20000
  },

  // 게임 2 — 얼음 녹이기 (/melt/)
  //   문지른 거리가 마찰량으로 쌓입니다. target번째 마찰을 채운 사람만
  //   축하 문구를 보고, 나머지는 Good Job을 봅니다.
  melt: {
    title: "얼음 녹이기",
    target: 50000
  },

  // 게임 3 — 자물쇠 (/lock/)
  lock: {
    title: "자물쇠",
    digits: 3,
    // 평문 정답은 코드 어디에도 없습니다. 대신 앞에서부터 n자리를 자른
    // 접두사의 솔트 SHA-256 해시만 둡니다. 마지막 항목이 정답 전체의
    // 해시이자 검증에 쓰이고, 앞의 항목들은 힌트를 한 자리씩 역산하는 데
    // 쓰입니다(임계치에 도달했을 때만 역산합니다).
    //
    // 정답을 바꾸려면 자릿수만큼 아래를 실행해 순서대로 넣으세요.
    //   S=wootecho-lock-2026
    //   for p in 5 51 512; do printf "%s:%d:%s" "$S" "${#p}" "$p" | shasum -a 256; done
    //
    // ※ 세 자리는 경우의 수가 1,000개뿐이라 작정하면 전수 대입으로 뚫립니다.
    //    소스보기나 Ctrl+F로 정답이 안 보이게 하는 수준의 보호입니다.
    answerSalt: "wootecho-lock-2026",
    prefixHashes: [
      "5842d2824d4195b19f4643fe2f255a8f342cd6386d17aff4d72d4d289e599664",
      "d880fb13e3f80b397df3d502282ea78a20491e1df11adda8c2d185f7e11ffa53",
      "7f8bd182c6d8d769002ca3227bd4ef9b8ae24bf7b562d2e640836b5a0318fbe8"
    ],
    // 전체 시도 횟수가 이 값을 넘을 때마다 왼쪽부터 한 자리씩 공개됩니다.
    hintEvery: 1000,
    // 힌트 목적의 연타를 막는 시도 간 쿨다운(ms).
    cooldownMs: 2000
  },

  // 게임 4 — 줄다리기 (/tug/)
  //   접속하면 무작위로 두 팀 중 하나에 배정됩니다(브라우저에 고정).
  //   양 팀 클릭 수의 차이가 winBy에 도달하면 그 팀이 이깁니다.
  tug: {
    title: "줄다리기",
    winBy: 3000
  },

  // 게임 5 — 더 버튼 (/button/)
  //   누구든 누르면 타이머가 처음으로 되돌아갑니다.
  //   아무도 누르지 않아 0에 닿으면 끝나고, 마지막에 누른 사람이 승자입니다.
  //   숫자는 남은 시간이 hideUnderSeconds 아래로 떨어지면 사라집니다.
  //   한 사람이 누를 수 있는 횟수는 maxPresses로 제한됩니다.
  button: {
    title: "더 버튼",
    resetSeconds: 15,
    hideUnderSeconds: 3,
    maxPresses: 5
  }
};

// 3) 제작자 통계 화면 비밀번호.
//    ※ 이 코드는 공개 저장소에 그대로 노출됩니다. 보안이 아니라
//       실수로 열리는 것을 막는 용도일 뿐입니다. 다른 곳에서 쓰는
//       비밀번호를 절대 넣지 마세요.
export const ADMIN_PASSWORD = "wootecho";

// 4) 구글 애널리틱스 4 측정 ID (예: "G-XXXXXXXXXX").
//    비워두면 GA 스크립트를 아예 로드하지 않습니다.
//    ※ 클릭 하나하나를 GA로 보내지 않습니다. 수만 건을 개별 이벤트로
//       보내면 수집 한도에 걸리고 리포트가 망가집니다.
//    ※ 광고 차단기를 쓰는 사용자는 GA에 잡히지 않습니다.
//       정확한 참여 수치는 통계 페이지(Firestore)가 정본입니다.
export const GA_MEASUREMENT_ID = "G-GS7JQCYXCX";

// 5) Firebase 웹 앱 설정.
//    Firebase 콘솔 > 프로젝트 설정 > 내 앱 > SDK 설정 및 구성.
export const firebaseConfig = {
  apiKey: "AIzaSyAEXF185njXPlQGn-MeMjkVpQezcdOUJwA",
  authDomain: "clicker-2f0d7.firebaseapp.com",
  projectId: "clicker-2f0d7",
  storageBucket: "clicker-2f0d7.firebasestorage.app",
  messagingSenderId: "397733817124",
  appId: "1:397733817124:web:497ee6512732cb8b1b21b1",
  measurementId: "G-GS7JQCYXCX",
};

// ==========================================================================
// 아래는 건드리지 않아도 됩니다.
// ==========================================================================

// 카운터 분산에 사용할 샤드 개수. 이벤트 도중에는 바꾸지 마세요.
export const SHARD_COUNT = 20;

// 큐에 쌓인 입력을 서버로 밀어 넣는 주기(ms).
export const FLUSH_INTERVAL_MS = 500;
