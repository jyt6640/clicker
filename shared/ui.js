// 다섯 게임이 공유하는 화면 조각: 연결 상태 표시와 결과 화면.

import { GOOGLE_FORM_URL } from "../config.js?v=15";
import { track } from "./core.js?v=15";

const $ = (id) => document.getElementById(id);

const LABEL = {
  connecting: "연결 중",
  online: null,
  reconnecting: "다시 연결 중"
};

export function statusHandler(onFirstConnect) {
  const el = $("status");
  const stage = $("stage");
  let connectedOnce = false;

  return (state) => {
    if (state === "online") {
      el.classList.add("hide");
      // 무대는 hidden 속성으로 시작합니다. 연결된 뒤에야 드러납니다.
      stage.hidden = false;
      // hidden을 떼어낸 직후에 곧바로 in을 붙이면 전환이 생략되므로 리플로우를
      // 한 번 강제합니다. requestAnimationFrame은 쓰지 않습니다 — 백그라운드
      // 탭에서 열면 콜백이 실행되지 않아 무대가 투명한 채로 남습니다.
      void stage.offsetWidth;
      stage.classList.add("in");
      if (!connectedOnce) {
        connectedOnce = true;
        if (onFirstConnect) onFirstConnect();
      }
      return;
    }
    if (el.classList.contains("error")) return;
    el.classList.remove("hide");
    const label = LABEL[state];
    if (label) {
      el.textContent = label;
    } else {
      el.textContent = state;      // 에러 문자열
      el.classList.add("error");
    }
  };
}

/**
 * 결과 화면으로 전환한다.
 * @param {string} title 큰 글씨
 * @param {string} msg   보조 문구 (줄바꿈 유지)
 */
export function showDone({ title, msg = "", gameId }) {
  const stage = $("stage");
  const done = $("done");
  const status = $("status");

  status.classList.add("hide");
  stage.classList.remove("in");
  setTimeout(() => { stage.hidden = true; }, 900);

  $("done-title").textContent = title;
  const msgEl = $("done-msg");
  if (msg) msgEl.textContent = msg;
  else msgEl.hidden = true;

  const survey = $("survey");
  if (GOOGLE_FORM_URL && GOOGLE_FORM_URL.trim()) {
    survey.href = GOOGLE_FORM_URL;
    survey.addEventListener("click", () => track("survey_click", { game_id: gameId }));
  } else {
    survey.hidden = true;
    $("survey-pending").hidden = false;
  }

  done.hidden = false;
  void done.offsetWidth;
  done.classList.add("in");
}

export function showSetupNeeded() {
  $("status").hidden = true;
  $("stage").hidden = true;
  $("setup").hidden = false;
}

/** 숫자가 오를 때 짧게 커졌다 돌아오는 효과 */
export function popper(el, reduceMotion) {
  let last = 0;
  return () => {
    if (reduceMotion) return;
    const now = Date.now();
    if (now - last < 60) return;
    last = now;
    el.classList.add("pop");
    setTimeout(() => el.classList.remove("pop"), 100);
  };
}
