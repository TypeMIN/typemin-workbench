"use client";

import { ChevronLeft, ChevronRight, Film, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BaseballSoundscape } from "@/components/baseball-game/audio/use-baseball-soundscape";
import { BaseballStadium } from "@/components/baseball-game/baseball-game-debug";
import {
  getBasesAfterRevision,
  getEventsThrough,
} from "@/lib/baseball-game/highlights";
import {
  REACTION_COOLDOWN_MS,
  REACTION_KINDS,
  REACTION_LABELS,
  type MultiplayerReaction,
  type ReactionKind,
} from "@/lib/baseball-game/multiplayer/reactions";
import type { SeriesView } from "@/lib/baseball-game/multiplayer/series";
import type {
  GameAction,
  GameView,
  PresentationBeat,
  PresentationScene,
  TeamSide,
} from "@/lib/baseball-game/types";

const REACTION_BUBBLE_MS = 2_800;
// A short breath between highlight scenes so each play lands on its own.
const REPLAY_GAP_MS = 900;
const TURN_TITLE = "● 내 차례 · 야구 게임";

export function ReactionBar({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (kind: ReactionKind) => void;
}) {
  const [coolingDown, setCoolingDown] = useState(false);
  useEffect(() => {
    if (!coolingDown) return;
    const timer = window.setTimeout(
      () => setCoolingDown(false),
      REACTION_COOLDOWN_MS,
    );
    return () => window.clearTimeout(timer);
  }, [coolingDown]);

  return (
    <div className="bbg-room-reactions" role="group" aria-label="응원 보내기">
      {REACTION_KINDS.map((kind) => (
        <button
          disabled={disabled || coolingDown}
          key={kind}
          onClick={() => {
            setCoolingDown(true);
            onSend(kind);
          }}
          type="button"
        >
          {REACTION_LABELS[kind]}
        </button>
      ))}
    </div>
  );
}

type Bubble = MultiplayerReaction & { mine: boolean };

export function ReactionBubbles({
  reactions,
  seat,
  onIncoming,
}: {
  reactions: MultiplayerReaction[];
  seat: TeamSide;
  onIncoming: () => void;
}) {
  const seenRef = useRef<Set<string> | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const onIncomingRef = useRef(onIncoming);
  useEffect(() => {
    onIncomingRef.current = onIncoming;
  }, [onIncoming]);

  useEffect(() => {
    if (seenRef.current === null) {
      seenRef.current = new Set(reactions.map((reaction) => reaction.id));
      return;
    }
    const seen = seenRef.current;
    const fresh = reactions.filter((reaction) => !seen.has(reaction.id));
    if (!fresh.length) return;
    for (const reaction of fresh) seen.add(reaction.id);
    if (fresh.some((reaction) => reaction.team !== seat)) {
      onIncomingRef.current();
    }
    setBubbles((current) => [
      ...current,
      ...fresh.map((reaction) => ({
        ...reaction,
        mine: reaction.team === seat,
      })),
    ]);
    const ids = new Set(fresh.map((reaction) => reaction.id));
    const timer = window.setTimeout(
      () =>
        setBubbles((current) =>
          current.filter((bubble) => !ids.has(bubble.id)),
        ),
      REACTION_BUBBLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [reactions, seat]);

  if (!bubbles.length) return null;
  return (
    <div className="bbg-room-bubbles" aria-live="polite">
      {bubbles.map((bubble, index) => (
        <span
          data-side={bubble.mine ? "mine" : "opponent"}
          key={bubble.id}
          style={{ "--bubble-offset": index % 3 } as React.CSSProperties}
        >
          <small>{bubble.mine ? "나" : "상대"}</small>
          {REACTION_LABELS[bubble.kind]}
        </span>
      ))}
    </div>
  );
}

export function SeriesSummary({
  series,
  seatName,
}: {
  series: SeriesView;
  seatName: string;
}) {
  if (!series.games.length) return null;
  return (
    <div className="bbg-room-series" aria-label="시리즈 전적">
      <small>Series · {series.games.length}경기</small>
      <div>
        {series.wins.map((entry) => (
          <span data-mine={entry.name === seatName} key={entry.name}>
            {entry.name}
            <strong>{entry.wins}</strong>
          </span>
        ))}
      </div>
      <ol>
        {series.games.map((game) => (
          <li key={game.number}>
            <span>{game.number}차전</span>
            <span>
              {game.awayName} {game.score.away} : {game.score.home}{" "}
              {game.homeName}
            </span>
            <em>{game.forfeit ? "몰수" : ""}</em>
          </li>
        ))}
      </ol>
    </div>
  );
}

export type ReplayItem = { revision: number; label: string };

export function ReplayReel({
  game,
  items,
  title,
  onBeat,
  onClose,
}: {
  game: GameView;
  items: ReplayItem[];
  title: string;
  onBeat: (beat: PresentationBeat, scene: PresentationScene) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [round, setRound] = useState(0);
  const item = items[Math.min(index, items.length - 1)];
  const staged = useMemo(
    () => ({
      ...game,
      eventLog: getEventsThrough(game.eventLog, item.revision),
      bases: getBasesAfterRevision(game.eventLog, item.revision),
      phase: "finished" as const,
      pitchDuel: null,
    }),
    [game, item.revision],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const playbackRef = useRef({ started: false, scheduled: false });
  const advanceTimer = useRef<number | null>(null);
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(
    () => () => {
      if (advanceTimer.current !== null) {
        window.clearTimeout(advanceTimer.current);
      }
    },
    [],
  );

  const go = useCallback(
    (next: number) => {
      if (advanceTimer.current !== null) {
        window.clearTimeout(advanceTimer.current);
      }
      playbackRef.current = { started: false, scheduled: false };
      setIndex(Math.max(0, Math.min(items.length - 1, next)));
      setRound((current) => current + 1);
    },
    [items.length],
  );

  const handlePresentation = useCallback(
    (active: boolean) => {
      const playback = playbackRef.current;
      if (active) {
        playback.started = true;
        return;
      }
      if (
        !playback.started ||
        playback.scheduled ||
        indexRef.current >= items.length - 1
      ) {
        return;
      }
      playback.scheduled = true;
      advanceTimer.current = window.setTimeout(
        () => go(indexRef.current + 1),
        REPLAY_GAP_MS,
      );
    },
    [go, items.length],
  );

  return (
    <div
      aria-label={`${title} ${index + 1}/${items.length}`}
      aria-modal="true"
      className="bbg-room-replay"
      role="dialog"
    >
      <BaseballStadium
        game={staged}
        key={`${item.revision}-${round}`}
        onBeat={onBeat}
        onPresentationChange={handlePresentation}
      />
      <div className="bbg-room-replay-bar">
        <span className="bbg-room-replay-tag">
          <Film aria-hidden="true" size={14} /> {title}
        </span>
        <strong>{item.label || "플레이 다시 보기"}</strong>
        <span className="bbg-room-replay-count">
          {index + 1}/{items.length}
        </span>
        <div>
          <button
            aria-label="이전 장면"
            disabled={index === 0}
            onClick={() => go(index - 1)}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={16} />
          </button>
          <button
            aria-label="이 장면 다시 보기"
            onClick={() => go(index)}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={15} />
          </button>
          <button
            aria-label="다음 장면"
            disabled={index >= items.length - 1}
            onClick={() => go(index + 1)}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={16} />
          </button>
          <button aria-label="다시 보기 닫기" onClick={onClose} type="button">
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function RoomQr({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(url, {
          width: 168,
          margin: 1,
          color: { dark: "#0b0e13ff", light: "#f4f1e8ff" },
        }),
      )
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (!src) return null;
  return (
    // A data URL QR code needs no image optimisation.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="홈팀 참가 QR 코드" className="bbg-room-qr" src={src} />
  );
}

/** Chime and flag the tab title when a decision lands on this device. */
export function useTurnAlert(
  active: boolean,
  playCue: BaseballSoundscape["playCue"],
) {
  const previousRef = useRef(active);
  const originalTitleRef = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = active;
    if (active && !previous) {
      playCue("your_turn");
      navigator.vibrate?.([24, 60, 24]);
      if (document.hidden) {
        originalTitleRef.current ??= document.title;
        document.title = TURN_TITLE;
      }
    }
    if (!active && originalTitleRef.current !== null) {
      document.title = originalTitleRef.current;
      originalTitleRef.current = null;
    }
  }, [active, playCue]);

  useEffect(() => {
    const restore = () => {
      if (!document.hidden && originalTitleRef.current !== null) {
        document.title = originalTitleRef.current;
        originalTitleRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", restore);
    return () => {
      document.removeEventListener("visibilitychange", restore);
      restore();
    };
  }, []);
}

const SHORTCUTS: Record<string, GameAction> = {
  s: { type: "SELECT_PITCH", target: "strike" },
  b: { type: "SELECT_PITCH", target: "ball" },
  w: { type: "SELECT_SWING", decision: "swing" },
  t: { type: "SELECT_SWING", decision: "take" },
  p: { type: "PASS_CARD_WINDOW" },
};

const SHORTCUT_PHASE: Record<GameAction["type"], GameView["phase"] | null> = {
  SELECT_PITCH: "awaiting_pitch",
  SELECT_SWING: "awaiting_swing",
  PASS_CARD_WINDOW: "awaiting_card",
  PLAY_CARD: "awaiting_card",
  PITCH_RESULT: null,
  BATTING_RESULT: null,
  HIT_RESULT: null,
};

export function useDecisionShortcuts({
  enabled,
  phase,
  onAction,
}: {
  enabled: boolean;
  phase: GameView["phase"];
  onAction: (action: GameAction) => void;
}) {
  const onActionRef = useRef(onAction);
  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) {
        return;
      }
      const action = SHORTCUTS[event.key.toLowerCase()];
      if (!action || SHORTCUT_PHASE[action.type] !== phase) return;
      event.preventDefault();
      onActionRef.current(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, phase]);
}

export function shortcutHint(phase: GameView["phase"]) {
  if (phase === "awaiting_pitch") return "S 스트라이크 · B 볼";
  if (phase === "awaiting_swing") return "W 스윙 · T 지켜보기";
  if (phase === "awaiting_card") return "P 카드 없이 진행";
  return null;
}
