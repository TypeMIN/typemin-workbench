"use client";

import {
  BATTER_DUEL_HIT_BONUS,
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
            <div className="bbg-duel-bonus">
              <b>READ BONUS</b>
              스트라이크에 스윙하면 안타 확률 +{BATTER_DUEL_HIT_BONUS}%p
            </div>
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
  const hitRisk = tendency.hit + tendency.homeRun;
  return (
    <button
      aria-label={`${PITCH_TARGET_LABELS[target]} 선택`}
      className={`bbg-pitch-choice is-${target.replaceAll("_", "-")}`}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <span className="bbg-pitch-choice-head">
        <i className="bbg-target-icon" aria-hidden="true">
          <b />
        </i>
        <strong>{PITCH_TARGET_LABELS[target]}</strong>
      </span>
      <span
        className="bbg-pitch-probability"
        aria-label={`스윙 시 컨택 ${tendency.contact}%, 헛스윙 ${tendency.whiff}%. 인플레이 시 땅볼 ${tendency.ground}%, 뜬공 ${tendency.air}%, 안타 ${hitRisk}%`}
      >
        <i>
          컨택 <b>{tendency.contact}%</b>
        </i>
        <i>
          헛스윙 <b>{tendency.whiff}%</b>
        </i>
      </span>
      <span className="bbg-tendency-bars" aria-hidden="true">
        <i style={{ "--value": `${tendency.ground}%` } as CSSProperties}>
          땅 {tendency.ground}
        </i>
        <i style={{ "--value": `${tendency.air}%` } as CSSProperties}>
          뜬 {tendency.air}
        </i>
        <i style={{ "--value": `${hitRisk}%` } as CSSProperties}>
          안타 {hitRisk}
        </i>
      </span>
      <small className="bbg-pitch-compact" aria-hidden="true">
        헛 {tendency.whiff}% · 안타 {hitRisk}%
      </small>
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
        <>
          <span
            className="bbg-read-halo"
            data-read={hint.read}
            style={{
              left: `${hint.x}%`,
              top: `${hint.y}%`,
              width: `${hint.radius * 2}%`,
            }}
          />
          <span
            aria-hidden="true"
            className="bbg-read-crosshair"
            style={{ left: `${hint.x}%`, top: `${hint.y}%` }}
          />
        </>
      ) : null}
      <small>{hint ? hintLabel(hint) : "위치 분석 중"}</small>
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
      ? "코스마다 스윙 결과와 맞은 뒤 타구 성향이 달라집니다."
      : "예상 원의 중심과 존의 겹침을 보고 한 번에 결정하세요.";
  if (game.strikes === 2) {
    copy =
      role === "pitcher"
        ? "2스트라이크 · 볼 유인과 낮은 코스의 가치가 높습니다."
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

function hintLabel(hint: PitchHint) {
  if (hint.read === "likely_strike") return "스트라이크 가능성이 높아 보입니다";
  if (hint.read === "likely_ball") return "존을 벗어날 가능성이 높아 보입니다";
  return "존 경계의 승부구로 보입니다";
}
