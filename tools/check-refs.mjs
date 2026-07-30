// 선언되지 않은 이름을 참조하는 곳을 찾습니다.
//
//   node tools/check-refs.mjs
//
// node --check 는 문법만 봅니다. 편집 중에 함수 하나가 통째로 지워져도
// 문법은 멀쩡해서 그대로 배포되고, 브라우저에서 모듈이 첫 참조 줄에서
// 죽습니다. 실제로 onSave · fillSettings 가 그렇게 사라진 채 배포됐습니다.
//
// 완전한 정적 분석은 아닙니다. 최상위 선언과 참조를 비교하는 수준이며,
// 그 실수 유형을 잡는 것이 목적입니다.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// 예약어는 이름이 아닙니다. if( · for( · catch( 처럼 여는 괄호가 붙어
// 호출처럼 보이므로 따로 걸러냅니다.
const KEYWORDS = new Set([
  "if", "for", "while", "switch", "catch", "return", "typeof", "instanceof",
  "new", "delete", "void", "await", "async", "function", "class", "const",
  "let", "var", "of", "in", "do", "else", "try", "finally", "throw", "yield",
  "this", "super", "case", "break", "continue", "default", "export", "import",
  "extends", "static", "get", "set", "with", "debugger"
]);

const GLOBALS = new Set([
  // 언어
  "undefined", "null", "true", "false", "NaN", "Infinity",
  "Object", "Array", "String", "Number", "Boolean", "Symbol", "BigInt",
  "Math", "JSON", "Date", "RegExp", "Error", "TypeError", "RangeError",
  "Promise", "Map", "Set", "WeakMap", "WeakSet", "Proxy", "Reflect",
  "Function", "Intl", "globalThis", "console", "parseInt", "parseFloat",
  "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent",
  "structuredClone", "queueMicrotask",
  // 브라우저
  "window", "document", "navigator", "location", "history", "screen",
  "localStorage", "sessionStorage", "fetch", "URL", "URLSearchParams",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "requestAnimationFrame", "cancelAnimationFrame", "crypto", "TextEncoder",
  "TextDecoder", "IntersectionObserver", "ResizeObserver", "MutationObserver",
  "PointerEvent", "CustomEvent", "Event", "FormData", "Blob", "alert",
  "confirm", "prompt", "matchMedia", "getComputedStyle", "atob", "btoa",
  "HTMLElement", "Node", "AbortController", "performance", "import"
]);

/** 최상위에서 선언된 이름과 import한 이름을 모읍니다. */
function declared(src) {
  const names = new Set();
  const add = (s) => s && names.add(s);

  for (const m of src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) add(m[1]);
  for (const m of src.matchAll(/^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm)) add(m[1]);
  for (const m of src.matchAll(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) add(m[1]);
  // import { a, b as c } from ... / import d from ...
  for (const m of src.matchAll(/import\s+([^;]+?)\s+from/gs)) {
    for (const part of m[1].replace(/[{}]/g, " ").split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) add(name);
    }
  }
  return names;
}

/** 문자열·주석·속성 접근을 걷어낸 뒤 참조되는 이름을 모읍니다. */
function referenced(src) {
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:\\.|\$\{[^}]*\}|[^`\\])*`/g, (m) =>
      // 템플릿 리터럴 안의 ${...} 는 코드이므로 남겨둡니다.
      [...m.matchAll(/\$\{([^}]*)\}/g)].map((x) => x[1]).join(" "))
    .replace(/'(?:\\.|[^'\\])*'/g, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, " ");

  const names = new Set();
  for (const m of stripped.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*(?=\()/g)) {
    // 호출 형태만 봅니다. 속성 접근까지 보면 지역 변수 추적이 필요해져
    // 오탐이 폭발합니다. 통째로 사라진 함수를 잡는 것이 목적입니다.
    if (!KEYWORDS.has(m[2])) names.add(m[2]);
  }
  return names;
}

/** 지역 선언(함수 안의 const/let/function/매개변수)도 선언으로 봅니다. */
function locals(src) {
  const names = new Set();
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/g)) {
    if (m[1]) names.add(m[1]);
    for (const p of (m[2] || "").split(",")) {
      const n = p.trim().split("=")[0].replace(/[{}[\].]/g, "").trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    }
  }
  // 화살표 함수 매개변수
  for (const m of src.matchAll(/\(([^)]*)\)\s*=>/g)) {
    for (const p of m[1].split(",")) {
      const n = p.trim().split("=")[0].replace(/[{}[\].]/g, "").trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    }
  }
  for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) names.add(m[1]);
  // 객체 메서드 축약형(add(n) {} · get game() {} · async pressButton() {})은
  // 호출이 아니라 정의입니다.
  for (const m of src.matchAll(/^\s*(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)) {
    names.add(m[1]);
  }
  // 구조 분해 (여러 줄에 걸쳐 있을 수 있습니다)
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([\s\S]*?)\}\s*=/g)) {
    for (const p of m[1].split(",")) {
      const n = p.trim().split(":").pop().split("=")[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    }
  }
  for (const m of src.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s*\[([^\]]*)\]/g)) {
    for (const p of m[1].split(",")) {
      const n = p.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    }
  }
  return names;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name === "node_modules" || name === "tools") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

let bad = 0;
for (const file of walk(".")) {
  const src = readFileSync(file, "utf8");
  const known = new Set([...declared(src), ...locals(src), ...GLOBALS]);
  const missing = [...referenced(src)].filter((n) => !known.has(n));
  if (missing.length) {
    bad++;
    console.error(`${file}\n  선언 없이 참조: ${missing.join(", ")}`);
  }
}

if (bad) {
  console.error(`\n${bad}개 파일에 문제가 있습니다.`);
  process.exit(1);
}
console.log("선언되지 않은 참조 없음");
