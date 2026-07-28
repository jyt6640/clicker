// ==========================================================================
// 설정 파일 — 여기만 수정하면 됩니다.
// ==========================================================================

// 1) 목표 달성 후 열릴 구글 설문 링크.
//    비워두면("") 버튼 대신 "설문 준비 중" 문구가 표시됩니다.
export const GOOGLE_FORM_URL = "https://forms.gle/rYcpjhz8FVABvcFb6";

// 2) 목표 클릭 수.
export const TARGET_CLICKS = 20000;

// 3) 제작자 통계 화면 비밀번호.
//    ※ 이 코드는 공개 저장소에 그대로 노출됩니다. 보안이 아니라
//       실수로 열리는 것을 막는 용도일 뿐입니다. 다른 곳에서 쓰는
//       비밀번호를 절대 넣지 마세요.
export const ADMIN_PASSWORD = "wootecho";

// 4) 구글 애널리틱스 4 측정 ID (예: "G-XXXXXXXXXX").
//    비워두면 GA 스크립트를 아예 로드하지 않습니다.
//    ※ 클릭 하나하나를 GA로 보내지 않습니다. 2만 건을 개별 이벤트로
//       보내면 수집 한도에 걸리고 리포트가 망가집니다. 아래 이벤트만
//       전송합니다: page_view, first_click, click_batch(요약),
//       milestone(25/50/75/100), event_complete, survey_click.
//    ※ 광고 차단기를 쓰는 사용자는 GA에 잡히지 않습니다.
//       정확한 참여 수치는 제작자 통계 화면(Firestore)이 정본입니다.
export const GA_MEASUREMENT_ID = "G-GS7JQCYXCX";

// 5) Firebase 웹 앱 설정.
//    Firebase 콘솔 > 프로젝트 설정 > 내 앱 > SDK 설정 및 구성 에서
//    복사한 값을 그대로 붙여넣으세요. 채우기 전에는 앱이
//    "설정이 필요합니다" 화면을 표시합니다.
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

// 클릭 분산 저장에 사용할 샤드 개수. Firestore는 문서 하나당
// 지속 쓰기가 초당 1회 수준이라 동시 접속자가 많으면 단일 문서로는
// 병목이 생깁니다. 값을 바꾸면 기존 집계와 어긋나므로 이벤트 도중에는
// 변경하지 마세요.
export const SHARD_COUNT = 20;

// 큐에 쌓인 클릭을 서버로 밀어 넣는 주기(ms).
export const FLUSH_INTERVAL_MS = 500;
