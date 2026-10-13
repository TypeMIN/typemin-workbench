"use client";

import { useEffect, useRef } from "react";

import { usePresentation } from "@/components/baseball-game/baseball-broadcast";
import { getBallFlight } from "@/components/baseball-game/stadium/ball-flight";
import { BaseballFieldView } from "@/components/baseball-game/stadium/baseball-field-view";
import {
  getPlateAppearancePitchHistory,
  getPresentationBases,
} from "@/lib/baseball-game/presentation";
import { FACE_LABELS } from "@/lib/baseball-game/rules";
import type {
  DieFace,
  GamePhase,
  GameState,
  GameView,
  PitchFace,
  PitchLocation,
  PresentationBeat,
  PresentationCue,
  PresentationScene,
} from "@/lib/baseball-game/types";

function presentationLabel(cue: PresentationCue) {
  if (cue.type === "choice") {
    const actor = {
      pitcher: "투수 선택",
      batter: "타자 선택",
      offense: "공격 카드",
      defense: "수비 카드",
    }[cue.actor];
    return { primary: actor, detail: cue.label };
  }
  if (cue.type === "call") {
    const label = {
      ball: ["BALL", "볼"],
      strike: ["STRIKE", "스트라이크"],
      foul: ["FOUL", "파울"],
      contact: ["CONTACT", "타격"],
    }[cue.call];
    return { primary: label[0], detail: label[1] };
  }
  if (cue.type === "decision") {
    return {
      primary: cue.result.toUpperCase(),
      detail: cue.label,
    };
  }
  if (cue.type === "pitch") {
    return { primary: `${cue.location.pitchNumber}구`, detail: "투구" };
  }
  if (cue.type === "interlude") {
    return { primary: cue.label, detail: cue.detail };
  }
  if (cue.type === "batted_ball") {
    return { primary: "타격", detail: cue.label };
  }
  if (cue.type === "catch") {
    return { primary: "포구", detail: cue.label };
  }
  if (cue.type === "throw") {
    return {
      primary:
        cue.kind === "error"
          ? "악송구"
          : cue.kind === "pickoff"
            ? "견제"
            : cue.kind === "caught_stealing"
              ? "도루 저지"
              : "송구",
      detail: cue.label,
    };
  }
  const primary = {
    batter_run: "타자 주루",
    advance: "주자 진루",
    tag_up: "태그업",
    steal: "도루 시도",
    pickoff_return: "귀루",
    force_play: "포스 플레이",
    score: "홈 쇄도",
  }[cue.action];
  return { primary, detail: cue.label };
}

export function BaseballStadium({
  face,
  game,
  onBeat,
  onPresentationChange,
  onPresentedRevision,
  replayLatestOnMount = true,
}: {
  face?: DieFace;
  game: Pick<GameState, "bases" | "battingTeam" | "config" | "eventLog"> & {
    phase?: GamePhase;
    pitchDuel?: GameState["pitchDuel"] | GameView["pitchDuel"];
  };
  onBeat?: (beat: PresentationBeat, scene: PresentationScene) => void;
  onPresentationChange?: (active: boolean) => void;
  /** Reports the newest revision whose scenes have finished playing. */
  onPresentedRevision?: (revision: number) => void;
  /** Live rooms start idle after a reload; highlight replays start playing. */
  replayLatestOnMount?: boolean;
}) {
  const { cue, cues, index, isPresenting, scene, skip } = usePresentation(
    game.eventLog,
    { replayLatestOnMount },
  );
  const pitchHistory = visiblePitchHistory(
    getPlateAppearancePitchHistory(game.eventLog),
    scene,
    index,
  );
  useEffect(() => {
    onPresentationChange?.(isPresenting);
  }, [isPresenting, onPresentationChange]);
  const latestRevision = game.eventLog.at(-1)?.revision ?? 0;
  useEffect(() => {
    if (!isPresenting) onPresentedRevision?.(latestRevision);
  }, [isPresenting, latestRevision, onPresentedRevision]);
  const onBeatRef = useRef(onBeat);
  useEffect(() => {
    onBeatRef.current = onBeat;
  }, [onBeat]);
  const activeBeat = scene?.beats[index];
  const playedBeatRef = useRef<string | null>(null);
  useEffect(() => {
    // Polling rebuilds scene objects for the same beat, so play by beat id.
    if (!activeBeat || !scene || playedBeatRef.current === activeBeat.id) {
      return;
    }
    playedBeatRef.current = activeBeat.id;
    onBeatRef.current?.(activeBeat, scene);
  }, [activeBeat, scene]);
  const latestPitchLocation = pitchHistory.at(-1)?.location;
  const activeBattedBallCue = cue?.type === "batted_ball" ? cue : undefined;
  const flight = activeBattedBallCue
    ? getBallFlight(activeBattedBallCue.face, activeBattedBallCue.variation)
    : null;
  const displayedBases = cue
    ? getPresentationBases(game.bases, cues, index)
    : game.bases;
  const occupied = [
    displayedBases.first ? "1루" : null,
    displayedBases.second ? "2루" : null,
    displayedBases.third ? "3루" : null,
  ].filter(Boolean);
  const fieldAction = Boolean(
    cue &&
    (["batted_ball", "catch", "throw", "runner_move"].includes(cue.type) ||
      (cue.type === "decision" && cue.camera === "field")),
  );
  const pitchAction = Boolean(
    cue &&
    (cue.type === "pitch" ||
      cue.type === "call" ||
      (cue.type === "choice" &&
        (cue.actor === "pitcher" || cue.actor === "batter")) ||
      (cue.type === "decision" && cue.camera === "catcher")),
  );
  const catcherView =
    pitchAction || (!fieldAction && shouldUseCatcherView(game.phase, face));
  const cueLabel = cue ? presentationLabel(cue) : null;
  const battingTeamName =
    game.config[game.battingTeam === "away" ? "awayTeamName" : "homeTeamName"];
  const baseLabel = occupied.length
    ? `${occupied.join(", ")} 주자 있음`
    : "주자 없음";

  return (
    <div
      aria-label={`${battingTeamName} 공격, ${baseLabel}${flight ? `, ${flight.label} 타구 표시` : ""}`}
      className="bbg-diamond bbg-stadium"
      data-camera={catcherView ? "catcher" : "field"}
      data-cue={cue?.type ?? "idle"}
      data-scene={scene?.template ?? "idle"}
    >
      {catcherView ? (
        <CatcherPitchStage cue={cue} pitchHistory={pitchHistory} />
      ) : null}
      <BaseballFieldView
        ariaLabel={`${battingTeamName} 공격, ${baseLabel}${flight ? `, ${flight.label} 타구 표시` : ""}`}
        bases={displayedBases}
        battingTeam={game.battingTeam}
        beatId={activeBeat?.id}
        cue={cue}
        cues={cues}
        face={activeBattedBallCue?.face}
        flight={flight}
        index={index}
        lastPitch={catcherView ? undefined : latestPitchLocation}
        score={presentedScore(game, isPresenting ? scene?.revision : undefined)}
        sky={skyForInning(game)}
      />
      {!catcherView ? (
        <>
          <div className="bbg-strike-zone" aria-label="투구 위치">
            <span className="bbg-strike-zone-label">PITCH MAP</span>
            <div aria-hidden="true" className="bbg-zone-grid" />
            <PitchMarkers pitchHistory={pitchHistory} />
          </div>
          <PitchSequence pitchHistory={pitchHistory} />
        </>
      ) : null}
      {cue && cueLabel ? (
        <button
          aria-label={`현재 연출 ${index + 1}/${cues.length}, 다음 장면 보기`}
          className="bbg-presentation-cue"
          data-cue={cue.type}
          data-result={cue.type === "decision" ? cue.result : undefined}
          onClick={skip}
          type="button"
        >
          <strong>{cueLabel.primary}</strong>
          <span>{cueLabel.detail}</span>
          <em aria-hidden="true">
            {index + 1}/{cues.length}
          </em>
        </button>
      ) : null}
    </div>
  );
}

// Innings split evenly into a sunset, a blue hour and full night lights.
const SKY_STAGES = ["dusk", "twilight", "night"] as const;

function skyForInning(game: Pick<GameState, "config" | "eventLog">) {
  const inning = game.eventLog.at(-1)?.inning ?? 1;
  const progress = (inning - 1) / Math.max(1, game.config.innings);
  return SKY_STAGES[
    Math.min(SKY_STAGES.length - 1, Math.floor(progress * SKY_STAGES.length))
  ];
}

/** The outfield board only counts runs whose scenes have already played. */
function presentedScore(
  game: Pick<GameState, "config" | "eventLog">,
  presentingRevision: number | undefined,
) {
  const score = { away: 0, home: 0 };
  for (const event of game.eventLog) {
    if (
      presentingRevision !== undefined &&
      event.revision >= presentingRevision
    )
      continue;
    score[event.half === "top" ? "away" : "home"] += event.runs;
  }
  return {
    ...score,
    awayName: game.config.awayTeamName,
    homeName: game.config.homeTeamName,
  };
}

/**
 * A pitch only appears on the zone once its flight beat has played, so the
 * marker never announces the call before the ball arrives.
 */
function visiblePitchHistory(
  history: ReturnType<typeof getPlateAppearancePitchHistory>,
  scene: PresentationScene | undefined,
  index: number,
) {
  if (!scene) return history;
  const pitchBeat = scene.beats.findIndex((beat) => beat.cue.type === "pitch");
  const pitchShown = pitchBeat >= 0 && index > pitchBeat;
  return history.filter(
    (item) =>
      item.event.revision < scene.revision ||
      (item.event.revision === scene.revision && pitchShown),
  );
}

function shouldUseCatcherView(phase: GamePhase | undefined, face?: DieFace) {
  if (phase === "awaiting_pitch" || phase === "awaiting_swing") return true;
  return !face || (["S", "SM", "F", "B"] as DieFace[]).includes(face);
}

function PitchMarkers({
  pitchHistory,
}: {
  pitchHistory: ReturnType<typeof getPlateAppearancePitchHistory>;
}) {
  return pitchHistory.map(({ event, face, location }, index) => (
    <i
      aria-label={`${location.pitchNumber}구 ${face}`}
      className="bbg-pitch-marker"
      data-current={index === pitchHistory.length - 1}
      data-zone={location.zone}
      key={event.sequence}
      style={{ left: `${location.x}%`, top: `${location.y}%` }}
    >
      <b>{location.pitchNumber}</b>
      <span>{shortPitchCall(face)}</span>
    </i>
  ));
}

function shortPitchCall(face: PitchFace) {
  if (face === "B") return "B";
  if (face === "F") return "F";
  if (face === "C") return "IN";
  return "S";
}

function CatcherPitchStage({
  cue,
  pitchHistory,
}: {
  cue: PresentationCue | null | undefined;
  pitchHistory: ReturnType<typeof getPlateAppearancePitchHistory>;
}) {
  const pitchCue = cue?.type === "pitch" ? cue : null;
  const endPoint = pitchCue
    ? catcherPitchPoint(pitchCue.location)
    : { x: 450, y: 410 };
  const latestPitch = pitchHistory.at(-1);
  const latestPoint = latestPitch
    ? catcherPitchPoint(latestPitch.location)
    : null;
  return (
    <div
      aria-label="포수 시점 스트라이크존"
      className="bbg-catcher-view"
      data-last-zone={latestPitch?.location.zone}
      role="img"
    >
      <svg
        aria-hidden="true"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 900 700"
      >
        <defs>
          <linearGradient id="catcher-sky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#060a10" />
            <stop offset="0.6" stopColor="#0d1824" />
            <stop offset="1" stopColor="#13202c" />
          </linearGradient>
          <radialGradient id="catcher-light" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fff6dd" stopOpacity="0.55" />
            <stop offset="0.35" stopColor="#ffe7b0" stopOpacity="0.12" />
            <stop offset="1" stopColor="#ffe7b0" stopOpacity="0" />
          </radialGradient>
          <pattern
            height="9"
            id="catcher-crowd"
            patternUnits="userSpaceOnUse"
            width="11"
          >
            <rect fill="#0e1620" height="9" width="11" />
            <circle cx="2.5" cy="3" fill="#2a3644" r="1.6" />
            <circle cx="7.5" cy="6.5" fill="#1f2a36" r="1.5" />
            <circle cx="9.5" cy="2" fill="#3a4654" r="1.1" />
          </pattern>
          <linearGradient id="catcher-stand-shade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#05080c" stopOpacity="0.2" />
            <stop offset="1" stopColor="#05080c" stopOpacity="0.75" />
          </linearGradient>
          <pattern
            height="700"
            id="catcher-mow"
            patternTransform="skewX(-18)"
            patternUnits="userSpaceOnUse"
            width="120"
          >
            <rect fill="#1c5537" height="700" width="60" />
            <rect fill="#184c31" height="700" width="60" x="60" />
          </pattern>
          <linearGradient id="catcher-dirt" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#8a5f40" />
            <stop offset="1" stopColor="#4a3122" />
          </linearGradient>
          <linearGradient id="catcher-rim" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#c9d6e2" stopOpacity="0.38" />
            <stop offset="0.5" stopColor="#c9d6e2" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect fill="url(#catcher-sky)" height="700" width="900" />
        <circle cx="120" cy="40" fill="url(#catcher-light)" r="150" />
        <circle cx="780" cy="40" fill="url(#catcher-light)" r="150" />
        <path
          className="bbg-catcher-stands"
          d="M0 120 Q450 40 900 120 V300 Q450 214 0 300 Z"
          fill="url(#catcher-crowd)"
        />
        <path
          d="M0 120 Q450 40 900 120 V300 Q450 214 0 300 Z"
          fill="url(#catcher-stand-shade)"
        />
        <path
          className="bbg-catcher-wall"
          d="M0 296 Q450 210 900 296 V322 Q450 238 0 322 Z"
        />
        <path className="bbg-catcher-wall-line" d="M0 296 Q450 210 900 296" />
        <path
          className="bbg-catcher-grass"
          d="M0 320 Q450 236 900 320 V700 H0 Z"
          fill="url(#catcher-mow)"
        />
        <path fill="url(#catcher-dirt)" d="M0 548 Q450 282 900 548 V700 H0 Z" />
        <ellipse
          className="bbg-catcher-mound"
          cx="450"
          cy="312"
          rx="78"
          ry="17"
        />
        <g className="bbg-catcher-pitcher" transform="translate(450 306)">
          <path
            className="bbg-catcher-limb is-leg"
            d="M-5 -38 L-9 -18 L-13 0"
          />
          <path className="bbg-catcher-limb is-leg" d="M5 -38 L8 -18 L12 0" />
          <path d="M-11 -71 Q0 -76 11 -71 L9 -38 Q0 -34 -9 -38 Z" />
          <path
            className="bbg-catcher-limb is-arm"
            d="M-10 -68 L-13 -56 L-3 -55"
          />
          <path
            className="bbg-catcher-limb is-arm"
            d="M10 -68 L13 -56 L3 -55"
          />
          <circle className="bbg-catcher-glove" cx="0" cy="-56" r="5" />
          <circle cx="0" cy="-82" r="7.5" />
          <path d="M-8 -84 Q-7 -92 1 -92 Q8 -91 8 -85 L13 -84 L13 -82 H-8 Z" />
        </g>
        <g className="bbg-catcher-batter" transform="translate(660 690)">
          <path className="bbg-catcher-bat" d="M24 -170 L70 -262" />
          <path
            className="bbg-catcher-limb is-leg"
            d="M-16 -104 L-34 -54 L-46 -4"
          />
          <path
            className="bbg-catcher-limb is-leg"
            d="M14 -104 L26 -54 L40 -4"
          />
          <path d="M-26 -178 Q2 -190 28 -176 L22 -102 Q2 -94 -20 -102 Z" />
          <path
            className="bbg-catcher-limb is-arm"
            d="M-20 -172 L-2 -148 L22 -166"
          />
          <path
            className="bbg-catcher-limb is-arm"
            d="M24 -174 L38 -150 L24 -166"
          />
          <circle cx="0" cy="-202" r="16" />
          <path d="M-18 -204 Q-16 -226 3 -226 Q21 -224 21 -206 L28 -201 L-18 -199 Z" />
          <path
            className="bbg-catcher-rim"
            d="M-26 -178 Q2 -190 28 -176 L22 -102"
          />
        </g>
        <path className="bbg-catcher-box" d="M310 690 L355 520 H545 L590 690" />
        <path
          className="bbg-catcher-plate"
          d="M405 636 H495 L520 662 L450 696 L380 662 Z"
        />
        <path
          className="bbg-catcher-mask is-left"
          d="M0 540 Q72 485 130 540 L96 700 H0 Z"
        />
        <path
          className="bbg-catcher-mask is-right"
          d="M900 540 Q828 485 770 540 L804 700 H900 Z"
        />
        {pitchCue ? (
          <g className="bbg-catcher-pitch-flight">
            <path
              d={`M450 285 Q${410 + endPoint.x * 0.08} 320 ${endPoint.x} ${endPoint.y}`}
            />
            <circle r="10">
              <animateMotion
                dur="440ms"
                fill="freeze"
                path={`M450 285 Q${410 + endPoint.x * 0.08} 320 ${endPoint.x} ${endPoint.y}`}
              />
            </circle>
          </g>
        ) : null}
        {!pitchCue && latestPoint ? (
          <path
            className="bbg-last-pitch-path"
            d={`M450 285 Q${410 + latestPoint.x * 0.08} 320 ${latestPoint.x} ${latestPoint.y}`}
          />
        ) : null}
      </svg>
      <div className="bbg-catcher-zone" aria-label="투구 위치">
        <span aria-hidden="true" className="bbg-zone-grid" />
        <PitchMarkers pitchHistory={pitchHistory} />
      </div>
      <PitchSequence pitchHistory={pitchHistory} />
    </div>
  );
}

function PitchSequence({
  pitchHistory,
}: {
  pitchHistory: ReturnType<typeof getPlateAppearancePitchHistory>;
}) {
  if (pitchHistory.length === 0) return null;
  return (
    <ol className="bbg-pitch-sequence" aria-label="현재 타자 누적 투구">
      {pitchHistory.map(({ event, face, location }, index) => (
        <li
          data-current={index === pitchHistory.length - 1}
          data-zone={location.zone}
          key={event.sequence}
        >
          <b>{location.pitchNumber}</b>
          <span>{FACE_LABELS[face]}</span>
        </li>
      ))}
    </ol>
  );
}

function catcherPitchPoint(location: PitchLocation) {
  return {
    x: 300 + location.x * 3,
    y: 235 + location.y * 3,
  };
}
