"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type BaseballActionFeedbackState = {
  status: "pending" | "success" | "error";
  title: string;
  detail?: string;
};

type FeedbackOptions = {
  clearAfter?: number | false;
};

export function useBaseballActionFeedback() {
  const [feedback, setFeedback] = useState<BaseballActionFeedbackState | null>(
    null,
  );
  const timerRef = useRef<number | null>(null);

  const show = useCallback(
    (next: BaseballActionFeedbackState, options: FeedbackOptions = {}) => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      setFeedback(next);
      const clearAfter =
        options.clearAfter === undefined
          ? next.status === "pending"
            ? false
            : next.status === "success"
              ? 2_400
              : 4_000
          : options.clearAfter;
      if (clearAfter !== false) {
        timerRef.current = window.setTimeout(() => {
          setFeedback(null);
          timerRef.current = null;
        }, clearAfter);
      }
    },
    [],
  );

  const clear = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setFeedback(null);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return { feedback, show, clear };
}

export function BaseballActionFeedback({
  feedback,
  className,
}: {
  feedback: BaseballActionFeedbackState | null;
  className?: string;
}) {
  if (!feedback) return null;
  return (
    <div
      aria-atomic="true"
      aria-live={feedback.status === "error" ? "assertive" : "polite"}
      className={["bbg-action-feedback", className].filter(Boolean).join(" ")}
      data-status={feedback.status}
      role={feedback.status === "error" ? "alert" : "status"}
    >
      <span aria-hidden="true" className="bbg-action-feedback-indicator" />
      <span>
        <strong>{feedback.title}</strong>
        {feedback.detail ? <small>{feedback.detail}</small> : null}
      </span>
    </div>
  );
}

export function useAdaptiveGamePolling(
  load: (quiet?: boolean) => Promise<void>,
  options: {
    activeMs?: number;
    hiddenMs?: number;
    enabled?: boolean;
  } = {},
) {
  const loadRef = useRef(load);
  const activeMs = options.activeMs ?? 550;
  const hiddenMs = options.hiddenMs ?? 2_500;
  const enabled = options.enabled ?? true;

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let running = false;
    let timer: number | null = null;

    const schedule = () => {
      if (stopped) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(
        () => void run(true),
        document.hidden ? hiddenMs : activeMs,
      );
    };
    const run = async (quiet: boolean) => {
      if (stopped || running) return;
      running = true;
      try {
        await loadRef.current(quiet);
      } finally {
        running = false;
        schedule();
      }
    };
    const wake = () => {
      if (document.hidden || stopped) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      void run(true);
    };

    void run(false);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
  }, [activeMs, enabled, hiddenMs]);
}
