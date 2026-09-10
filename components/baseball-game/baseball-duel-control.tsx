"use client";

import {
  BATTER_DUEL_HIT_BONUS,
  PITCH_TARGET_LABELS,
  PITCH_TARGETS,
  PITCH_TENDENCIES,
  PITCHER_DUEL_HIT_PENALTY,
} from "@/lib/baseball-game/duel";
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
          <span>CHOOSE</span>
          <div>
            <strong>
              {canAct ? "스트라이크인가, 볼인가" : "투수의 선택을 기다리는 중"}
            </strong>
            <small>타자의 판단을 읽고 한 번에 선택하세요.</small>
          </div>
        </div>
        {canAct ? (
          <>
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
            <SituationTip game={game} role="pitcher" />
          </>
        ) : (
          <WaitingPulse label="투수가 승부를 고르고 있습니다" />
        )}
      </section>
    );
  }

  if (game.phase === "awaiting_swing") {
    return (
      <section className="bbg-duel bbg-duel--simple" aria-label="타격 선택">
        <div className="bbg-duel-heading">
          <span>DECIDE</span>
          <div>
            <strong>
              {canAct ? "스윙할까, 지켜볼까" : "타자의 판단을 기다리는 중"}
            </strong>
            <small>투수의 선택은 판정 전까지 공개되지 않습니다.</small>
          </div>
        </div>
        {canAct ? (
          <>
            <div className="bbg-swing-actions">
              <button
                className="is-swing"
                disabled={busy}
                onClick={() =>
                  onAction({ type: "SELECT_SWING", decision: "swing" })
                }
                type="button"
              >
                <small>스트라이크 예상</small>
                <strong>스윙</strong>
                <span>읽으면 컨택 82% · 안타성 54%</span>
              </button>
              <button
                className="is-take"
                disabled={busy}
                onClick={() =>
                  onAction({ type: "SELECT_SWING", decision: "take" })
                }
                type="button"
              >
                <small>볼 예상</small>
                <strong>지켜보기</strong>
                <span>읽으면 볼 · 틀리면 스트라이크</span>
              </button>
            </div>
            <DuelPayoff />
            <SituationTip game={game} role="batter" />
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
  const isStrike = target === "strike";
  return (
    <button
      aria-label={`${PITCH_TARGET_LABELS[target]} 선택`}
      className={`bbg-pitch-choice is-${target.replaceAll("_", "-")}`}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <small>{isStrike ? "정면 승부" : "스윙 유도"}</small>
      <strong>{PITCH_TARGET_LABELS[target]}</strong>
      <span>
        {isStrike
          ? `스윙 시 컨택 ${tendency.contact}%`
          : `속이면 헛스윙 ${tendency.whiff}%`}
      </span>
    </button>
  );
}

function DuelPayoff() {
  return (
    <div className="bbg-duel-payoff" aria-label="심리전 보상">
      <span>
        <b>타자 승리</b>
        컨택 82% · 안타성 +{BATTER_DUEL_HIT_BONUS}%p
      </span>
      <span>
        <b>투수 승리</b>
        헛스윙 80% · 안타성 -{PITCHER_DUEL_HIT_PENALTY}%p
      </span>
    </div>
  );
}

function SituationTip({
  game,
  role,
}: {
  game: DuelGame;
  role: "pitcher" | "batter";
}) {
  let copy =
    role === "pitcher"
      ? "스윙을 예상하면 볼, 지켜보기를 예상하면 스트라이크가 강합니다."
      : "스트라이크를 읽으면 스윙, 볼을 읽으면 지켜보기가 강합니다.";
  if (game.strikes === 2) {
    copy =
      role === "pitcher"
        ? "2스트라이크 · 볼 유인 성공은 곧 삼진 기회입니다."
        : "2스트라이크 · 지켜보면 삼진 위험, 스윙은 파울로 버틸 수 있습니다.";
  } else if (game.balls === 3) {
    copy =
      role === "pitcher"
        ? "3볼 · 볼을 한 번 더 고르면 볼넷입니다."
        : "3볼 · 존 밖을 읽고 참으면 볼넷입니다.";
  }
  return <p className="bbg-situation-tip">{copy}</p>;
}

function WaitingPulse({ label }: { label: string }) {
  return (
    <div className="bbg-duel-waiting" role="status">
      <i aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
