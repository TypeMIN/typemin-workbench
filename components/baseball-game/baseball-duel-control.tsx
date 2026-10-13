"use client";

import { PITCH_TARGET_LABELS, PITCH_TARGETS } from "@/lib/baseball-game/duel";
import type {
  GameAction,
  GameState,
  GameView,
  PitchTarget,
} from "@/lib/baseball-game/types";

type DuelGame = GameState | GameView;
export type DuelRole = "pitcher" | "batter";

export function isBatterLocked(game: DuelGame) {
  return "batterLocked" in game
    ? game.batterLocked
    : Boolean((game as GameState).earlySwing);
}

/** Which choice this role still owes, or null once it has locked one. */
export function pendingDuelChoice(
  game: DuelGame,
  role: DuelRole,
): "pitch" | "swing" | null {
  if (role === "pitcher") {
    return game.phase === "awaiting_pitch" ? "pitch" : null;
  }
  if (game.phase === "awaiting_swing") return "swing";
  const earlyOpen =
    game.phase === "awaiting_pitch" &&
    game.rulesetVersion === "pitch-duel-v4" &&
    game.activeStrategy?.cardId !== "HNR" &&
    !isBatterLocked(game);
  return earlyOpen ? "swing" : null;
}

export function BaseballDuelControl({
  busy = false,
  canAct = true,
  game,
  onAction,
  role,
}: {
  busy?: boolean;
  canAct?: boolean;
  game: DuelGame;
  onAction: (action: GameAction) => void;
  /** Without a role the control follows the sequential v3 phase order. */
  role?: DuelRole;
}) {
  const choice = role
    ? pendingDuelChoice(game, role)
    : game.phase === "awaiting_pitch"
      ? "pitch"
      : game.phase === "awaiting_swing"
        ? "swing"
        : null;

  if (choice === "pitch") {
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

  if (choice === "swing") {
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
