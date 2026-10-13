"use client";

import { BookOpen, X } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

// Bump the version when the steps change enough to show them again.
const SEEN_KEY = "bbg-coach-marks-v1";
const SEEN_EVENT = "bbg-coach-marks-seen";

const STEPS = [
  {
    title: "투수와 타자는 동시에 고릅니다",
    body: "투수는 스트라이크나 볼, 타자는 스윙이나 지켜보기를 고릅니다. 상대가 골랐는지는 보이지만 무엇을 골랐는지는 보이지 않습니다.",
  },
  {
    title: "카드는 쓸 수 있는 순간에만 밝아집니다",
    body: "손패의 카드마다 투구 전, 투구 직후, 타구 판정 후처럼 쓰는 때가 정해져 있습니다. 쓸 카드가 없으면 그 순간은 건너뜁니다.",
  },
  {
    title: "결과는 장면이 끝난 뒤에 보입니다",
    body: "판정은 경기장 장면이 끝나야 점수판과 기록에 반영됩니다. 장면을 누르면 다음 장면으로 넘어갑니다.",
  },
] as const;

function readSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SEEN_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SEEN_EVENT, onChange);
  };
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private windows may refuse storage; the guide then just closes.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

/** A first-game guide that sits beside the game instead of blocking it. */
export function BaseballCoachMarks() {
  const seen = useSyncExternalStore(subscribe, readSeen, () => true);
  const [closed, setClosed] = useState(false);
  const [step, setStep] = useState(0);
  if (seen || closed) return null;
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const close = () => {
    setClosed(true);
    markSeen();
  };
  return (
    <section aria-label="처음 하는 분을 위한 안내" className="bbg-coach">
      <header>
        <small>
          처음이신가요 · {step + 1}/{STEPS.length}
        </small>
        <button aria-label="안내 닫기" onClick={close} type="button">
          <X aria-hidden="true" size={14} />
        </button>
      </header>
      <strong>{current.title}</strong>
      <p>{current.body}</p>
      <footer>
        <Link href="/baseball-game/rules">
          <BookOpen aria-hidden="true" size={13} />
          규칙 전체 보기
        </Link>
        {step > 0 ? (
          <button onClick={() => setStep(step - 1)} type="button">
            이전
          </button>
        ) : null}
        <button
          className="is-primary"
          onClick={() => (last ? close() : setStep(step + 1))}
          type="button"
        >
          {last ? "시작하기" : "다음"}
        </button>
      </footer>
    </section>
  );
}
