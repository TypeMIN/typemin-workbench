"use client";

import {
  PITCH_TARGET_LABELS,
  PITCH_TARGETS,
  PITCH_TENDENCIES,
} from "@/lib/baseball-game/duel";
import type {
  GameAction,
  GameState,
  GameView,
  PitchHint,
  PitchTarget,
} from "@/lib/baseball-game/types";
import type { CSSProperties } from "react";

type DuelGame = GameState | GameView;

export function BaseballDuelControl({
  busy = false,
  canAct = true,
  game,
  onAction,
}: {
  busy?: boolean;
  canAct?: boolean;
  game: DuelGame;
  onAction: (action: GameAction) => void;
}) {
  if (game.phase === "awaiting_pitch") {
    return (
      <section className="bbg-duel" aria-label="투구 코스 선택">
        <div className="bbg-duel-heading">
          <span>PITCH</span>
          <div>
            <strong>
              {canAct ? "투구 코스를 선택하세요" : "투수의 선택을 기다리는 중"}
            </strong>
            <small>한 번의 선택으로 투구가 확정됩니다.</small>
          </div>
        </div>
        {canAct ? (
          <div className="bbg-pitch-choice-grid">
            {PITCH_TARGETS.map((target) => (
              <PitchChoice
                disabled={busy}
                key={target}
                onSelect={() => onAction({ type: "SELECT_PITCH", target })}
                target={target}
              />
            ))}
          </div>
        ) : (
          <WaitingPulse label="투수가 코스를 고르고 있습니다" />
        )}
      </section>
    );
  }

  if (game.phase === "awaiting_swing") {
    const hint = game.pitchDuel?.hint ?? null;
    return (
      <section className="bbg-duel" aria-label="타격 판단">
        <div className="bbg-duel-heading">
          <span>READ</span>
          <div>
            <strong>
              {canAct ? "공을 읽고 결정하세요" : "타자의 판단을 기다리는 중"}
            </strong>
            <small>
              {hint ? hintLabel(hint) : "투구 정보는 타자에게만 공개됩니다."}
            </small>
          </div>
        </div>
        {canAct ? (
          <>
            <PitchRead hint={hint} />
            <div className="bbg-swing-actions">
              <button
                className="is-swing"
                disabled={busy}
                onClick={() =>
                  onAction({ type: "SELECT_SWING", decision: "swing" })
                }
                type="button"
              >
                <small>공략</small>
                <strong>스윙</strong>
              </button>
              <button
                className="is-take"
                disabled={busy}
                onClick={() =>
                  onAction({ type: "SELECT_SWING", decision: "take" })
                }
                type="button"
              >
                <small>선구</small>
                <strong>지켜보기</strong>
              </button>
            </div>
          </>
        ) : (
          <WaitingPulse label="타자가 공을 읽고 있습니다" />
        )}
      </section>
    );
  }

  return null;
}

function PitchChoice({
  disabled,
  onSelect,
  target,
}: {
  disabled: boolean;
  onSelect: () => void;
  target: PitchTarget;
}) {
  const tendency = PITCH_TENDENCIES[target];
  return (
    <button
      aria-label={`${PITCH_TARGET_LABELS[target]} 선택`}
      className={`bbg-pitch-choice is-${target.replaceAll("_", "-")}`}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <strong>{PITCH_TARGET_LABELS[target]}</strong>
      <span className="bbg-tendency-bars" aria-hidden="true">
        <i style={{ "--value": `${tendency.ground}%` } as CSSProperties}>땅</i>
        <i style={{ "--value": `${tendency.air}%` } as CSSProperties}>뜬</i>
        <i style={{ "--value": `${tendency.whiff}%` } as CSSProperties}>헛</i>
      </span>
    </button>
  );
}

function PitchRead({ hint }: { hint: PitchHint | null }) {
  return (
    <div
      className="bbg-pitch-read"
      aria-label={hint ? hintLabel(hint) : "투구 예상 위치 없음"}
    >
      <span className="bbg-read-zone" aria-hidden="true" />
      {hint ? (
        <span
          className="bbg-read-halo"
          data-read={hint.read}
          style={{
            left: `${hint.x}%`,
            top: `${hint.y}%`,
            width: `${hint.radius * 2}%`,
          }}
        />
      ) : null}
      <small>{hint ? hintLabel(hint) : "위치 분석 중"}</small>
    </div>
  );
}

function WaitingPulse({ label }: { label: string }) {
  return (
    <div className="bbg-duel-waiting" role="status">
      <i aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function hintLabel(hint: PitchHint) {
  if (hint.read === "likely_strike") return "스트라이크 가능성이 높아 보입니다";
  if (hint.read === "likely_ball") return "존을 벗어날 가능성이 높아 보입니다";
  return "존 경계의 승부구로 보입니다";
}
