"use client";

import { PITCH_TARGET_LABELS, PITCH_TARGETS } from "@/lib/baseball-game/duel";
import type {
  GameAction,
  GameState,
  GameView,
  PitchTarget,
} from "@/lib/baseball-game/types";

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
      <section className="bbg-duel bbg-duel--simple" aria-label="투구 선택">
        <div className="bbg-duel-heading">
          <strong>{canAct ? "투구 선택" : "투수 선택 대기"}</strong>
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
          <WaitingPulse label="투수 선택 대기" />
        )}
      </section>
    );
  }

  if (game.phase === "awaiting_swing") {
    return (
      <section className="bbg-duel bbg-duel--simple" aria-label="타격 선택">
        <div className="bbg-duel-heading">
          <strong>{canAct ? "타격 선택" : "타자 선택 대기"}</strong>
        </div>
        {canAct ? (
          <div className="bbg-swing-actions">
            <button
              className="is-swing"
              disabled={busy}
              onClick={() =>
                onAction({ type: "SELECT_SWING", decision: "swing" })
              }
              type="button"
            >
              <i aria-hidden="true" />
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
              <i aria-hidden="true" />
              <strong>지켜보기</strong>
            </button>
          </div>
        ) : (
          <WaitingPulse label="타자 선택 대기" />
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
  return (
    <button
      aria-label={`${PITCH_TARGET_LABELS[target]} 선택`}
      className={`bbg-pitch-choice is-${target.replaceAll("_", "-")}`}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <i aria-hidden="true" />
      <strong>{PITCH_TARGET_LABELS[target]}</strong>
    </button>
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
