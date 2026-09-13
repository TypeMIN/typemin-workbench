"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import {
  buildPresentationCues,
  CARD_DEFINITIONS,
  FACE_LABELS,
  getAudioCues,
  PITCH_TARGET_LABELS,
  type GameEvent,
  type GameState,
  type GameView,
  type PresentationCue,
  type TeamSide,
} from "@/lib/baseball-game";

type BroadcastGame = Pick<
  GameState,
  "boxScore" | "score" | "config" | "inning" | "half" | "battingTeam" | "phase"
>;

export function BroadcastLineScore({ game }: { game: BroadcastGame }) {
  const boxScore = game.boxScore ?? {
    innings: Array.from({ length: game.inning }, (_, index) => ({
      away: index === game.inning - 1 ? game.score.away : 0,
      home:
        index === game.inning - 1 && game.half === "top"
          ? null
          : index === game.inning - 1
            ? game.score.home
            : 0,
    })),
    totals: {
      away: { hits: 0, errors: 0, freePasses: 0 },
      home: { hits: 0, errors: 0, freePasses: 0 },
    },
  };
  const displayGame = { ...game, boxScore };
  const inningCount = Math.max(9, boxScore.innings.length);
  const innings = Array.from({ length: inningCount }, (_, index) => index + 1);

  return (
    <div className="bbg-line-score" aria-label="이닝별 점수와 경기 기록">
      <div
        className="bbg-line-score-grid"
        style={{ "--inning-count": inningCount } as React.CSSProperties}
      >
        <span className="bbg-line-score-head bbg-line-team-head">팀</span>
        {innings.map((inning) => (
          <span
            className="bbg-line-score-head bbg-line-inning"
            data-current={game.inning === inning}
            key={inning}
          >
            {inning}
          </span>
        ))}
        {(["R", "H", "E", "B"] as const).map((label) => (
          <span className="bbg-line-score-head bbg-line-total" key={label}>
            {label}
          </span>
        ))}
        {(["away", "home"] as TeamSide[]).map((side) => (
          <LineScoreRow
            game={displayGame}
            innings={innings}
            key={side}
            side={side}
          />
        ))}
      </div>
    </div>
  );
}

function LineScoreRow({
  game,
  innings,
  side,
}: {
  game: BroadcastGame;
  innings: number[];
  side: TeamSide;
}) {
  const totals = game.boxScore.totals[side];
  return (
    <>
      <span
        className={[
          "bbg-line-team",
          "bbg-team-score",
          game.battingTeam === side && game.phase !== "finished"
            ? "is-batting"
            : null,
        ]
          .filter(Boolean)
          .join(" ")}
        data-batting={game.battingTeam === side && game.phase !== "finished"}
      >
        <small>{side === "away" ? "원정" : "홈"}</small>
        <strong>
          {game.config[side === "away" ? "awayTeamName" : "homeTeamName"]}
        </strong>
      </span>
      {innings.map((inning) => (
        <span
          className="bbg-line-inning bbg-line-value"
          data-current={game.inning === inning}
          key={inning}
        >
          {inningValue(game, side, inning)}
        </span>
      ))}
      <b className="bbg-line-total bbg-line-runs">{game.score[side]}</b>
      <span className="bbg-line-total">{totals.hits}</span>
      <span className="bbg-line-total">{totals.errors}</span>
      <span className="bbg-line-total">{totals.freePasses}</span>
    </>
  );
}

function inningValue(game: BroadcastGame, side: TeamSide, inning: number) {
  const value = game.boxScore.innings[inning - 1]?.[side];
  if (value !== null && value !== undefined) return value;
  const skippedHome =
    side === "home" &&
    game.phase === "finished" &&
    inning === game.inning &&
    game.half === "top";
  return skippedHome ? "X" : "-";
}

const SOUND_STORAGE_KEY = "bbg-broadcast-sound-v1";
const VOLUME_STORAGE_KEY = "bbg-broadcast-volume-v1";

export function BaseballAudio({
  events,
  mode = "full",
}: {
  events: GameEvent[];
  mode?: "full" | "personal";
}) {
  const [muted, setMuted] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [volume, setVolume] = useState(0.65);
  const contextRef = useRef<AudioContext | null>(null);
  const playedRevisionRef = useRef(0);

  useEffect(() => {
    if (mode !== "full") return;
    const timer = window.setTimeout(() => {
      setMuted(window.localStorage.getItem(SOUND_STORAGE_KEY) === "muted");
      const storedValue = window.localStorage.getItem(VOLUME_STORAGE_KEY);
      const stored = Number(storedValue);
      if (storedValue !== null && stored >= 0 && stored <= 1) setVolume(stored);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode]);

  useEffect(
    () => () => {
      if (contextRef.current) void contextRef.current.close();
    },
    [],
  );

  useEffect(() => {
    const unlock = () => {
      setUnlocked(true);
      if (mode === "full" && !contextRef.current) {
        const AudioContextClass = window.AudioContext;
        if (AudioContextClass) contextRef.current = new AudioContextClass();
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [mode]);

  const latestRevision = events.at(-1)?.revision ?? 0;
  useEffect(() => {
    if (!unlocked || latestRevision <= playedRevisionRef.current) return;
    playedRevisionRef.current = latestRevision;
    const revisionEvents = events.filter(
      (event) => event.revision === latestRevision,
    );
    if (mode === "personal") {
      navigator.vibrate?.(18);
      return;
    }
    if (muted || !contextRef.current) return;
    const context = contextRef.current;
    if (context.state === "suspended") void context.resume();
    getAudioCues(revisionEvents)
      .slice(0, 6)
      .forEach((cue, index) => {
        synthesizeCue(context, cue, index * 0.11, volume);
      });
  }, [events, latestRevision, mode, muted, unlocked, volume]);

  if (mode === "personal") return null;

  return (
    <div className="bbg-audio-control">
      <button
        aria-label={muted ? "경기 음향 켜기" : "경기 음향 끄기"}
        aria-pressed={!muted}
        className="bbg-sound-toggle"
        onClick={() => {
          setUnlocked(true);
          setMuted((current) => {
            const next = !current;
            window.localStorage.setItem(
              SOUND_STORAGE_KEY,
              next ? "muted" : "on",
            );
            return next;
          });
        }}
        type="button"
      >
        {muted ? (
          <VolumeX aria-hidden="true" size={16} />
        ) : (
          <Volume2 aria-hidden="true" size={16} />
        )}
      </button>
      <label className="bbg-volume-control">
        <span>볼륨</span>
        <input
          aria-label="경기 음향 볼륨"
          max="1"
          min="0"
          onChange={(event) => {
            const next = Number(event.target.value);
            setVolume(next);
            window.localStorage.setItem(VOLUME_STORAGE_KEY, String(next));
          }}
          step="0.05"
          type="range"
          value={volume}
        />
      </label>
    </div>
  );
}

export function usePresentation(events: GameEvent[]) {
  const latestRevision = events.at(-1)?.revision ?? 0;
  const cues = useMemo(
    () =>
      buildPresentationCues(
        events.filter((event) => event.revision === latestRevision),
      ),
    [events, latestRevision],
  );
  const [progress, setProgress] = useState({ revision: 0, index: 0 });
  const cueIndex = progress.revision === latestRevision ? progress.index : 0;
  const cueSignature = JSON.stringify(cues);

  useEffect(() => {
    if (cues.length === 0) return;
    const stableCues = JSON.parse(cueSignature) as PresentationCue[];
    const rawDurations = stableCues.map(presentationCueDuration);
    const rawTotal = rawDurations.reduce((sum, duration) => sum + duration, 0);
    const scale = Math.min(1, 5_800 / rawTotal);
    let elapsed = 0;
    const timers = rawDurations.map((duration, index) => {
      elapsed += Math.round(duration * scale);
      return window.setTimeout(() => {
        setProgress({ revision: latestRevision, index: index + 1 });
      }, elapsed);
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [cueSignature, cues.length, latestRevision]);

  return {
    cue: cues[cueIndex] as PresentationCue | undefined,
    cues,
    skip: () =>
      setProgress({
        revision: latestRevision,
        index: cues.length,
      }),
  };
}

function presentationCueDuration(cue: PresentationCue) {
  if (cue.type === "pitch") return 460;
  if (cue.type === "call") return 900;
  if (cue.type === "batted_ball") return 820;
  if (cue.type === "catch") return 650;
  if (cue.type === "throw") return 760;
  if (cue.type === "runner_move") return 720;
  return 1_400;
}

type PlayReceiptGame = Pick<
  GameState | GameView,
  "eventLog" | "phase" | "cardWindow"
>;

export type BaseballPlayReceiptData = {
  pitcher: string;
  batter: string;
  cards: string;
  result: string;
};

export function getBaseballPlayReceipt(
  game: PlayReceiptGame,
): BaseballPlayReceiptData | null {
  const events = game.eventLog;
  const commitIndex = events.findLastIndex(
    (event) => event.kind === "pitch_commit",
  );
  const lastCardIndex = events.findLastIndex(
    (event) => event.kind === "card_play",
  );
  if (commitIndex < 0 && lastCardIndex < 0) return null;

  const resultIndex = events.findLastIndex(
    (event) => event.kind === "pitch_result",
  );
  const hasPendingPitch = commitIndex > resultIndex;
  const hasNewPrePitchCard =
    game.cardWindow?.timing === "before_pitch" &&
    lastCardIndex > resultIndex &&
    !hasPendingPitch;
  const cycleEndIndex = hasPendingPitch ? commitIndex : resultIndex;
  const previousPitchIndex = events.findLastIndex(
    (event, index) => index < cycleEndIndex && event.kind === "pitch_result",
  );
  const cycleStartIndex = hasNewPrePitchCard
    ? resultIndex + 1
    : previousPitchIndex + 1;
  const cycle = events.slice(cycleStartIndex);
  const pitchResult = cycle.findLast((event) => event.kind === "pitch_result");
  const hasCommittedPitch = cycle.some(
    (event) => event.kind === "pitch_commit",
  );
  const cardIds = Array.from(
    new Set(
      cycle.flatMap((event) =>
        event.kind === "card_play" && event.cardId ? [event.cardId] : [],
      ),
    ),
  );
  const latestOutcome = cycle.findLast((event) =>
    [
      "game_end",
      "half_inning",
      "plate_appearance",
      "card_resolve",
      "card_play",
      "batted_ball",
      "count",
      "pitch_result",
    ].includes(event.kind),
  );

  return {
    pitcher: pitchResult?.pitchTarget
      ? PITCH_TARGET_LABELS[pitchResult.pitchTarget]
      : hasCommittedPitch
        ? "선택 완료"
        : "대기",
    batter: pitchResult?.swingDecision
      ? pitchResult.swingDecision === "swing"
        ? "스윙"
        : "지켜보기"
      : hasCommittedPitch
        ? "판단 중"
        : "대기",
    cards:
      cardIds.length > 0
        ? cardIds.map((id) => CARD_DEFINITIONS[id].name).join(" + ")
        : pitchResult
          ? "사용 안 함"
          : game.phase === "awaiting_card"
            ? "선택 중"
            : "대기",
    result:
      latestOutcome?.kind === "pitch_result" && latestOutcome.face
        ? FACE_LABELS[latestOutcome.face]
        : (latestOutcome?.summary ?? "대기"),
  };
}

export function BaseballPlayReceipt({
  className,
  game,
}: {
  className?: string;
  game: PlayReceiptGame;
}) {
  const receipt = getBaseballPlayReceipt(game);
  if (!receipt) return null;
  const items: Array<[string, string]> = [
    ["투수", receipt.pitcher],
    ["타자", receipt.batter],
    ["카드", receipt.cards],
    ["판정", receipt.result],
  ];
  return (
    <dl
      aria-label="현재 승부 진행 기록"
      className={["bbg-play-receipt", className].filter(Boolean).join(" ")}
    >
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function synthesizeCue(
  context: AudioContext,
  cue: ReturnType<typeof getAudioCues>[number],
  delay: number,
  volume: number,
) {
  const now = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const frequencies: Record<typeof cue, number> = {
    pitch: 230,
    mitt: 110,
    contact: 520,
    ground: 86,
    throw: 300,
    safe: 440,
    out: 150,
    score: 660,
    home_run: 780,
    ball: 260,
    strike: 180,
  };
  oscillator.type =
    cue === "contact" || cue === "home_run" ? "sawtooth" : "sine";
  oscillator.frequency.setValueAtTime(frequencies[cue], now);
  if (cue === "pitch" || cue === "throw")
    oscillator.frequency.exponentialRampToValueAtTime(90, now + 0.14);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, 0.075 * volume),
    now + 0.012,
  );
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    now + (cue === "home_run" ? 0.5 : 0.2),
  );
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + (cue === "home_run" ? 0.52 : 0.22));
}
