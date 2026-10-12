"use client";

import { ArrowLeft, Check, Copy, Flag, Timer, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BaseballSoundControls } from "@/components/baseball-game/audio/baseball-sound-controls";
import {
  useBaseballSoundscape,
  type BaseballSoundscape,
} from "@/components/baseball-game/audio/use-baseball-soundscape";
import {
  BaseballActionFeedback,
  useAdaptiveGamePolling,
  useBaseballActionFeedback,
} from "@/components/baseball-game/baseball-action-feedback";
import {
  BaseballPlayReceipt,
  BroadcastLineScore,
} from "@/components/baseball-game/baseball-broadcast";
import { BaseballCardFace } from "@/components/baseball-game/baseball-card-face";
import { BaseballDuelControl } from "@/components/baseball-game/baseball-duel-control";
import { BaseballStadium } from "@/components/baseball-game/baseball-game-debug";
import { isClutch } from "@/lib/baseball-game/audio/leverage";
import { CARD_DEFINITIONS } from "@/lib/baseball-game/cards";
import { PITCH_TARGET_LABELS } from "@/lib/baseball-game/duel";
import {
  CARD_TIMING_LABELS,
  describeOpponentActivity,
} from "@/lib/baseball-game/multiplayer/activity";
import {
  SEAT_HEARTBEAT_INTERVAL_MS,
  type OpponentStatus,
} from "@/lib/baseball-game/multiplayer/presence";
import type { ShotClockView } from "@/lib/baseball-game/multiplayer/shot-clock";
import type {
  MultiplayerCommand,
  MultiplayerRoomSnapshot,
} from "@/lib/baseball-game/multiplayer/types";
import { hasResolutionOutcome } from "@/lib/baseball-game/presentation";
import type {
  CardRole,
  GameAction,
  GameView,
  TeamSide,
} from "@/lib/baseball-game/types";

const CLOCK_REFRESH_MS = 200;
const COPIED_RESET_MS = 1_600;
const FINAL_TICK_SECONDS = 3;

type ClockCommand = "CALL_TIMEOUT" | "CLAIM_FORFEIT";

export default function BaseballMultiplayerRoom({
  roomCode,
}: {
  roomCode: string;
}) {
  const [snapshot, setSnapshot] = useState<MultiplayerRoomSnapshot | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [needsSeat, setNeedsSeat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const seatEstablishedRef = useRef(false);
  const actionFeedback = useBaseballActionFeedback();

  const acceptSnapshot = useCallback((incoming: MultiplayerRoomSnapshot) => {
    setClockOffsetMs(incoming.clock.serverNow - Date.now());
    setSnapshot((current) =>
      !current || shouldReplaceSnapshot(current, incoming) ? incoming : current,
    );
  }, []);

  const loadSnapshot = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const response = await fetch(
          `/api/baseball-game/rooms/${encodeURIComponent(roomCode)}/view`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          snapshot?: MultiplayerRoomSnapshot;
          error?: string;
        };
        if (response.status === 401) {
          if (seatEstablishedRef.current) return;
          setNeedsSeat(true);
          setSnapshot(null);
          setError(null);
          return;
        }
        if (!response.ok || !payload.snapshot) {
          setError(payload.error ?? "경기 상태를 불러오지 못했습니다.");
          return;
        }
        seatEstablishedRef.current = true;
        setNeedsSeat(false);
        acceptSnapshot(payload.snapshot);
        setError(null);
      } catch {
        if (!quiet) setError("멀티플레이 서버에 연결하지 못했습니다.");
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [acceptSnapshot, roomCode],
  );

  useAdaptiveGamePolling(loadSnapshot, {
    activeMs: snapshot?.isYourTurn ? 550 : 250,
  });
  useSeatHeartbeat(roomCode, Boolean(snapshot));
  useRoomNotices(snapshot, actionFeedback.show);

  async function joinRoom() {
    setJoining(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/baseball-game/rooms/${encodeURIComponent(roomCode)}/join`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        snapshot?: MultiplayerRoomSnapshot;
        error?: string;
      };
      if (!response.ok || !payload.snapshot) {
        setError(payload.error ?? "방에 참가하지 못했습니다.");
        return;
      }
      seatEstablishedRef.current = true;
      acceptSnapshot(payload.snapshot);
      setNeedsSeat(false);
    } catch {
      setError("멀티플레이 서버에 연결하지 못했습니다.");
    } finally {
      setJoining(false);
      setLoading(false);
    }
  }

  async function submitCommand(command: MultiplayerCommand) {
    if (!snapshot || submitting) return;
    const intent = multiplayerCommandLabel(command, snapshot.view);
    const previousRevision = snapshot.view.revision;
    setSubmitting(true);
    setError(null);
    actionFeedback.show({
      status: "pending",
      title: `${intent} 요청 중`,
      detail: "입력은 한 번만 처리됩니다. 서버 판정을 기다려 주세요.",
    });
    try {
      const response = await fetch(
        `/api/baseball-game/rooms/${encodeURIComponent(roomCode)}/actions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            command,
            expectedRevision: snapshot.view.revision,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const payload = (await response.json()) as {
        snapshot?: MultiplayerRoomSnapshot;
        error?: string;
      };
      if (!response.ok || !payload.snapshot) {
        if (response.status === 409) {
          await loadSnapshot(true);
          actionFeedback.show({
            status: "error",
            title: "다른 행동이 먼저 반영됐습니다",
            detail: "최신 경기 상태로 자동 동기화했습니다.",
          });
          return;
        }
        const message = payload.error ?? "경기 행동을 처리하지 못했습니다.";
        setError(message);
        actionFeedback.show({
          status: "error",
          title: `${intent}을 반영하지 못했습니다`,
          detail: message,
        });
        return;
      }
      acceptSnapshot(payload.snapshot);
      actionFeedback.show({
        status: "success",
        title: `${intent} 반영 완료`,
        detail: revisionSummary(payload.snapshot.view, previousRevision),
      });
    } catch {
      setError("경기 행동을 서버에 보내지 못했습니다.");
      actionFeedback.show({
        status: "error",
        title: `${intent} 전송 실패`,
        detail: "연결을 확인한 뒤 다시 시도해 주세요.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitClock(type: ClockCommand) {
    if (!snapshot || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/baseball-game/rooms/${encodeURIComponent(roomCode)}/clock`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type,
            expectedRevision: snapshot.view.revision,
          }),
        },
      );
      const payload = (await response.json()) as {
        snapshot?: MultiplayerRoomSnapshot;
        error?: string;
      };
      if (!response.ok || !payload.snapshot) {
        const message = payload.error ?? "요청을 처리하지 못했습니다.";
        setError(message);
        if (response.status === 409) await loadSnapshot(true);
        return;
      }
      acceptSnapshot(payload.snapshot);
      actionFeedback.show({
        status: "success",
        title: type === "CALL_TIMEOUT" ? "작전 타임" : "몰수승 선언",
        detail:
          type === "CALL_TIMEOUT"
            ? "결정 시간이 늘어났습니다."
            : "상대의 연속 시간 초과로 경기가 종료됐습니다.",
      });
    } catch {
      setError("요청을 서버에 보내지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyRoomLink() {
    try {
      const roomUrl = `${window.location.origin}/baseball-game/rooms/${roomCode}`;
      await navigator.clipboard.writeText(roomUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      setError(
        "참가 링크를 복사하지 못했습니다. 주소창의 링크를 공유해 주세요.",
      );
    }
  }

  return (
    <div className="bbg-room">
      {loading && !snapshot ? (
        <RoomShell roomCode={roomCode}>
          <RoomMessage
            title="경기장을 불러오는 중"
            copy="방과 좌석을 확인하고 있습니다."
          />
        </RoomShell>
      ) : needsSeat ? (
        <RoomShell roomCode={roomCode}>
          <RoomJoin
            error={error}
            joining={joining}
            onJoin={joinRoom}
            roomCode={roomCode}
          />
        </RoomShell>
      ) : snapshot ? (
        <MultiplayerBoard
          clockOffsetMs={clockOffsetMs}
          copied={copied}
          error={error}
          feedback={actionFeedback.feedback}
          onClock={submitClock}
          onCopy={copyRoomLink}
          onSubmit={submitCommand}
          snapshot={snapshot}
          submitting={submitting}
        />
      ) : (
        <RoomShell roomCode={roomCode}>
          <RoomMessage
            title="경기장을 열 수 없습니다"
            copy={error ?? "방 코드를 다시 확인해 주세요."}
          />
        </RoomShell>
      )}
    </div>
  );
}

function useSeatHeartbeat(roomCode: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const url = `/api/baseball-game/rooms/${encodeURIComponent(roomCode)}/heartbeat`;
    const send = () => {
      void Promise.resolve()
        .then(() =>
          fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              visibility: document.hidden ? "hidden" : "visible",
            }),
            keepalive: true,
          }),
        )
        .catch(() => undefined);
    };
    send();
    const timer = window.setInterval(send, SEAT_HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", send);
    window.addEventListener("pagehide", send);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", send);
      window.removeEventListener("pagehide", send);
    };
  }, [enabled, roomCode]);
}

function useRoomNotices(
  snapshot: MultiplayerRoomSnapshot | null,
  show: ReturnType<typeof useBaseballActionFeedback>["show"],
) {
  const presenceRef = useRef<OpponentStatus["presence"] | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const presence = snapshot?.opponent.presence ?? null;
  const lastTimeout = snapshot?.clock.lastTimeout ?? null;
  const view = snapshot?.view;

  useEffect(() => {
    const previous = presenceRef.current;
    presenceRef.current = presence;
    if (previous === "offline" && presence === "online") {
      show({
        status: "success",
        title: "상대가 경기에 복귀했습니다",
        detail: "경기를 그대로 이어갑니다.",
      });
    }
  }, [presence, show]);

  useEffect(() => {
    if (!lastTimeout || !view) return;
    if (timeoutRef.current === null) {
      timeoutRef.current = lastTimeout.revision;
      return;
    }
    if (lastTimeout.revision <= timeoutRef.current) return;
    timeoutRef.current = lastTimeout.revision;
    show({
      status: "error",
      title: `${teamName(view, lastTimeout.team)} 시간 초과`,
      detail: "결정 시간이 지나 자동으로 진행했습니다.",
    });
  }, [lastTimeout, show, view]);
}

function RoomShell({
  children,
  roomCode,
}: {
  children: React.ReactNode;
  roomCode: string;
}) {
  return (
    <>
      <RoomBar roomCode={roomCode} />
      <main className="bbg-room-main is-message">{children}</main>
    </>
  );
}

function RoomBar({
  roomCode,
  soundscape,
}: {
  roomCode: string;
  soundscape?: BaseballSoundscape;
}) {
  return (
    <header className="bbg-room-bar">
      <Link className="bbg-room-brand" href="/baseball-game">
        <span aria-hidden="true" className="bbg-room-brand-mark" />
        <span>
          <strong>야구 게임</strong>
          <small>Multiplayer</small>
        </span>
      </Link>
      <div className="bbg-room-bar-tools">
        <div className="bbg-room-code" aria-label={`방 코드 ${roomCode}`}>
          <small>Room</small>
          <strong>{roomCode}</strong>
        </div>
        {soundscape ? <BaseballSoundControls soundscape={soundscape} /> : null}
      </div>
    </header>
  );
}

function RoomJoin({
  roomCode,
  joining,
  onJoin,
  error,
}: {
  roomCode: string;
  joining: boolean;
  onJoin: () => void;
  error: string | null;
}) {
  return (
    <section className="bbg-room-message" aria-labelledby="join-title">
      <small>Multiplayer · {roomCode}</small>
      <h1 id="join-title">홈팀으로 참가할까요?</h1>
      <p>이 기기에는 홈팀 손패만 표시되고, 상대 손패는 전송되지 않습니다.</p>
      {error ? (
        <p className="bbg-error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="bbg-room-primary"
        disabled={joining}
        onClick={onJoin}
        type="button"
      >
        <Users aria-hidden="true" size={16} />
        {joining ? "좌석 확인 중" : "홈팀으로 참가"}
      </button>
      <Link className="bbg-room-back" href="/baseball-game">
        <ArrowLeft aria-hidden="true" size={15} /> 돌아가기
      </Link>
    </section>
  );
}

function RoomMessage({ title, copy }: { title: string; copy: string }) {
  return (
    <section className="bbg-room-message">
      <h1>{title}</h1>
      <p>{copy}</p>
      <Link className="bbg-room-back" href="/baseball-game">
        <ArrowLeft aria-hidden="true" size={15} /> 돌아가기
      </Link>
    </section>
  );
}

function MultiplayerBoard({
  clockOffsetMs,
  copied,
  error,
  feedback,
  onClock,
  onCopy,
  onSubmit,
  snapshot,
  submitting,
}: {
  clockOffsetMs: number;
  copied: boolean;
  error: string | null;
  feedback: ReturnType<typeof useBaseballActionFeedback>["feedback"];
  onClock: (type: ClockCommand) => void;
  onCopy: () => void;
  onSubmit: (command: MultiplayerCommand) => void;
  snapshot: MultiplayerRoomSnapshot;
  submitting: boolean;
}) {
  const [presentationActive, setPresentationActive] = useState(false);
  const game = snapshot.view;
  const seat = snapshot.seat;
  const opponentSeat: TeamSide = seat === "away" ? "home" : "away";
  const soundscape = useBaseballSoundscape({
    game,
    perspective: seat,
    presenting: presentationActive,
  });
  const ownRole: CardRole = seat === game.battingTeam ? "offense" : "defense";
  const ownHand = game.cards[ownRole].hand ?? [];
  const legalById = useMemo(
    () =>
      new Map(
        snapshot.legalCards.map((item) => [item.instance.instanceId, item]),
      ),
    [snapshot.legalCards],
  );
  const latestEvent = game.eventLog.at(-1);
  const latestRevisionEvents = game.eventLog.filter(
    (event) => event.revision === game.revision,
  );
  const concealingOutcome =
    presentationActive && hasResolutionOutcome(latestRevisionEvents);
  const latestFace = game.eventLog.findLast(
    (event) =>
      event.kind === "pitch_result" ||
      event.kind === "batted_ball" ||
      event.kind === "die_roll",
  )?.face;
  const seatName = teamName(game, seat);
  const playing = snapshot.status === "playing" && !snapshot.clock.forfeitedBy;
  const clutch = playing && !presentationActive && isClutch(game);

  return (
    <>
      <RoomBar roomCode={snapshot.roomCode} soundscape={soundscape} />
      <main className="bbg-room-main">
        <div
          aria-busy={submitting}
          className="bbg-room-board"
          data-room-status={snapshot.status}
        >
          <BaseballActionFeedback
            className="bbg-room-feedback"
            feedback={feedback}
          />
          <section className="bbg-room-stage" aria-label="야구 경기장">
            <Scorebug game={game} seat={seat} />
            {clutch ? (
              <div className="bbg-room-clutch" aria-live="polite">
                승부처
              </div>
            ) : null}
            <BaseballStadium
              face={latestFace}
              game={game}
              onBeat={soundscape.onBeat}
              onPresentationChange={setPresentationActive}
            />
            {playing &&
            !presentationActive &&
            snapshot.isYourTurn &&
            (game.phase === "awaiting_pitch" ||
              game.phase === "awaiting_swing") ? (
              <div className="bbg-choice-dock bbg-room-dock">
                <BaseballDuelControl
                  busy={submitting}
                  game={game}
                  onAction={(action: GameAction) => {
                    if (
                      action.type === "SELECT_PITCH" ||
                      action.type === "SELECT_SWING"
                    ) {
                      onSubmit(action);
                    }
                  }}
                />
              </div>
            ) : null}
            <div className="bbg-room-lower-third" aria-live="polite">
              <span className="bbg-room-lower-tag">
                {concealingOutcome ? "Live" : latestEvent ? "Play" : "Next"}
              </span>
              <div>
                <strong>
                  {concealingOutcome
                    ? "플레이 진행 중"
                    : (latestEvent?.summary ?? "첫 투구를 준비하세요")}
                </strong>
                {concealingOutcome ? null : <BaseballPlayReceipt game={game} />}
              </div>
            </div>
          </section>

          <aside
            aria-busy={presentationActive}
            aria-label="멀티플레이 조작부"
            className="bbg-room-rail"
            data-presentation-active={presentationActive}
            inert={presentationActive ? true : undefined}
          >
            <Matchup
              game={game}
              opponent={snapshot.opponent}
              opponentSeat={opponentSeat}
              seat={seat}
            />

            {snapshot.status === "lobby" ? (
              <div className="bbg-room-panel bbg-room-waiting">
                <small>Waiting</small>
                <strong>홈팀 참가 대기 중</strong>
                <p>상대 기기에서 참가 링크를 열면 경기가 시작됩니다.</p>
                <button
                  className="bbg-room-secondary"
                  onClick={onCopy}
                  type="button"
                >
                  {copied ? (
                    <Check aria-hidden="true" size={15} />
                  ) : (
                    <Copy aria-hidden="true" size={15} />
                  )}
                  {copied ? "링크 복사됨" : "참가 링크 복사"}
                </button>
              </div>
            ) : (
              <DecisionPanel
                clockOffsetMs={clockOffsetMs}
                disabled={submitting}
                onClock={onClock}
                onSubmit={onSubmit}
                onTick={soundscape.playCue}
                opponentSeat={opponentSeat}
                snapshot={snapshot}
              />
            )}

            <section
              className="bbg-room-panel bbg-room-hand"
              aria-label={`${seatName} ${ownRole === "offense" ? "공격" : "수비"} 손패`}
            >
              <header>
                <small>My hand</small>
                <strong>
                  {ownRole === "offense" ? "공격 카드" : "수비 카드"}
                </strong>
                <span>{ownHand.length}장</span>
              </header>
              <div className="bbg-room-cards">
                {ownHand.map((card) => {
                  const definition = CARD_DEFINITIONS[card.cardId];
                  const availability = legalById.get(card.instanceId);
                  const playable =
                    snapshot.isYourTurn && Boolean(availability?.playable);
                  const unavailableReason = snapshot.isYourTurn
                    ? (availability?.reason ?? "현재 사용할 수 없습니다")
                    : "현재 행동 차례가 아닙니다";
                  return (
                    <button
                      aria-label={`${definition.id} ${definition.name}${playable ? " 사용 가능, 누르면 즉시 사용" : ` 사용 불가: ${unavailableReason}`}`}
                      className="bbg-card-preview bbg-room-card"
                      data-playable={playable}
                      data-tier={definition.tier}
                      disabled={!playable || submitting}
                      key={card.instanceId}
                      onClick={() =>
                        onSubmit({
                          type: "PLAY_CARD",
                          cardInstanceId: card.instanceId,
                        })
                      }
                      title={availability?.reason ?? definition.description}
                      type="button"
                    >
                      <BaseballCardFace definition={definition} />
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="bbg-room-panel bbg-room-box">
              <BroadcastLineScore game={game} />
            </section>

            {error ? (
              <p className="bbg-error" role="alert">
                {error}
              </p>
            ) : null}
          </aside>
        </div>
      </main>
    </>
  );
}

function Scorebug({ game, seat }: { game: GameView; seat: TeamSide }) {
  return (
    <div
      className="bbg-scorebug"
      aria-label={`멀티플레이 경기 점수판 ${inningLabel(game)}`}
      role="group"
    >
      <div className="bbg-scorebug-teams">
        {(["away", "home"] as const).map((team) => (
          <div
            className="bbg-scorebug-team"
            data-batting={game.battingTeam === team}
            data-mine={team === seat}
            data-team={team}
            key={team}
          >
            <span className="bbg-scorebug-name">{teamName(game, team)}</span>
            <strong>{game.score[team]}</strong>
          </div>
        ))}
      </div>
      <div className="bbg-scorebug-inning">
        <span aria-hidden="true" data-half={game.half} />
        <strong>{game.inning}</strong>
      </div>
      <MiniDiamond game={game} />
      <div className="bbg-scorebug-count">
        <CountLights label="B" active={game.balls} total={3} tone="ball" />
        <CountLights label="S" active={game.strikes} total={2} tone="strike" />
        <CountLights label="O" active={game.outs} total={2} tone="out" />
      </div>
    </div>
  );
}

function Matchup({
  game,
  opponent,
  opponentSeat,
  seat,
}: {
  game: GameView;
  opponent: OpponentStatus;
  opponentSeat: TeamSide;
  seat: TeamSide;
}) {
  return (
    <div className="bbg-room-matchup">
      <div className="bbg-room-side" data-team={seat}>
        <span className="bbg-room-presence" data-presence="online" />
        <div>
          <small>{seat === "away" ? "원정" : "홈"} · 내 좌석</small>
          <strong>{teamName(game, seat)}</strong>
        </div>
      </div>
      <span className="bbg-room-versus">vs</span>
      <div className="bbg-room-side is-opponent" data-team={opponentSeat}>
        <span
          aria-hidden="true"
          className="bbg-room-presence"
          data-presence={opponent.presence}
        />
        <div>
          <small>
            {opponentSeat === "away" ? "원정" : "홈"} ·{" "}
            {PRESENCE_LABELS[opponent.presence]}
          </small>
          <strong>{teamName(game, opponentSeat)}</strong>
        </div>
      </div>
    </div>
  );
}

const PRESENCE_LABELS: Record<OpponentStatus["presence"], string> = {
  online: "접속 중",
  away: "자리 비움",
  offline: "연결 끊김",
  absent: "참가 대기",
};

function DecisionPanel({
  clockOffsetMs,
  disabled,
  onClock,
  onSubmit,
  onTick,
  opponentSeat,
  snapshot,
}: {
  clockOffsetMs: number;
  disabled: boolean;
  onClock: (type: ClockCommand) => void;
  onSubmit: (command: MultiplayerCommand) => void;
  onTick: BaseballSoundscape["playCue"];
  opponentSeat: TeamSide;
  snapshot: MultiplayerRoomSnapshot;
}) {
  const game = snapshot.view;
  const clock = snapshot.clock;
  const seat = snapshot.seat;

  if (game.phase === "finished" || snapshot.status === "finished") {
    const forfeitWinner = clock.forfeitedBy
      ? clock.forfeitedBy === "away"
        ? "home"
        : "away"
      : null;
    const winner = forfeitWinner ?? game.winner;
    return (
      <div className="bbg-room-panel bbg-room-turn" data-state="final">
        <small>Final</small>
        <strong>
          {winner ? `${teamName(game, winner)} 승리` : "경기 종료"}
        </strong>
        {forfeitWinner ? <span>상대의 연속 시간 초과로 몰수승</span> : null}
      </div>
    );
  }

  const mine = snapshot.isYourTurn;
  const activity = describeOpponentActivity(
    game,
    opponentSeat,
    snapshot.actionOwner,
    snapshot.opponent,
  );
  const canForfeit =
    clock.forfeitedBy === null &&
    clock.consecutiveTimeouts[opponentSeat] >= clock.forfeitThreshold;
  const timeoutsLeft = clock.timeoutsRemaining[seat];

  return (
    <div
      className="bbg-room-panel bbg-room-turn"
      data-state={mine ? "mine" : "waiting"}
      data-tone={mine ? undefined : activity.tone}
    >
      <div className="bbg-room-turn-head">
        <div>
          <small>{mine ? "Your decision" : "Opponent"}</small>
          <strong>{mine ? myDecisionTitle(game) : activity.title}</strong>
          {mine ? (
            <span>{myDecisionDetail(game)}</span>
          ) : activity.detail ? (
            <span>{activity.detail}</span>
          ) : null}
        </div>
        {clock.deadlineAt !== null && clock.startsAt !== null ? (
          <ShotClock
            clock={clock}
            key={clock.deadlineAt}
            mine={mine}
            offsetMs={clockOffsetMs}
            onTick={onTick}
          />
        ) : null}
      </div>
      {mine && game.phase === "awaiting_card" ? (
        <button
          className="bbg-room-primary"
          disabled={disabled}
          onClick={() => onSubmit({ type: "PASS_CARD_WINDOW" })}
          type="button"
        >
          {disabled ? "서버 확인 중…" : "카드 없이 진행"}
        </button>
      ) : null}
      <div className="bbg-room-turn-tools">
        {mine ? (
          <button
            className="bbg-room-secondary"
            disabled={disabled || timeoutsLeft <= 0}
            onClick={() => {
              onTick("timeout_call");
              onClock("CALL_TIMEOUT");
            }}
            type="button"
          >
            <Timer aria-hidden="true" size={15} />
            작전 타임 · {timeoutsLeft}회 남음
          </button>
        ) : (
          <span className="bbg-room-meta">
            상대 작전 타임 {clock.timeoutsRemaining[opponentSeat]}회 남음
          </span>
        )}
        {clock.graceActive && clock.owner === opponentSeat ? (
          <span className="bbg-room-meta">재접속 유예 적용 중</span>
        ) : null}
      </div>
      {canForfeit ? (
        <div className="bbg-room-forfeit">
          <p>
            상대가 {clock.consecutiveTimeouts[opponentSeat]}번 연속 시간을
            넘겼습니다.
          </p>
          <button
            className="bbg-room-secondary is-danger"
            disabled={disabled}
            onClick={() => onClock("CLAIM_FORFEIT")}
            type="button"
          >
            <Flag aria-hidden="true" size={15} />
            몰수승 선언
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ShotClock({
  clock,
  mine,
  offsetMs,
  onTick,
}: {
  clock: ShotClockView;
  mine: boolean;
  offsetMs: number;
  onTick: BaseballSoundscape["playCue"];
}) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now() + offsetMs),
      CLOCK_REFRESH_MS,
    );
    return () => window.clearInterval(timer);
  }, [offsetMs]);

  const startsAt = clock.startsAt ?? 0;
  const deadlineAt = clock.deadlineAt ?? 0;
  const total = Math.max(1, deadlineAt - startsAt);
  const paused = now < startsAt;
  const remaining = paused
    ? total
    : Math.min(total, Math.max(0, deadlineAt - now));
  const seconds = Math.ceil(remaining / 1_000);
  const warning = !paused && remaining <= clock.warningMs;

  const tickRef = useRef<number | null>(null);
  useEffect(() => {
    if (!mine || !warning || seconds <= 0 || tickRef.current === seconds) {
      return;
    }
    tickRef.current = seconds;
    onTick(seconds <= FINAL_TICK_SECONDS ? "tick_final" : "tick");
  }, [mine, onTick, seconds, warning]);

  return (
    <div
      aria-label={`${mine ? "내" : "상대"} 결정 남은 시간 ${seconds}초`}
      className="bbg-room-clock"
      data-paused={paused}
      data-warning={warning}
      role="timer"
      style={{ "--clock-progress": remaining / total } as React.CSSProperties}
    >
      <svg aria-hidden="true" viewBox="0 0 40 40">
        <circle className="is-track" cx="20" cy="20" r="17" />
        <circle className="is-fill" cx="20" cy="20" pathLength="1" r="17" />
      </svg>
      <strong>{seconds}</strong>
    </div>
  );
}

function myDecisionTitle(game: GameView) {
  if (game.phase === "awaiting_pitch") return "투구를 선택하세요";
  if (game.phase === "awaiting_swing") return "스윙할지 정하세요";
  if (game.phase === "awaiting_card") return "사용할 카드를 선택하세요";
  return "판정 처리 중";
}

function myDecisionDetail(game: GameView) {
  if (game.phase === "awaiting_card" && game.cardWindow) {
    return `${CARD_TIMING_LABELS[game.cardWindow.timing]} 카드 창 · 손패에서 고르거나 넘기세요`;
  }
  if (game.phase === "awaiting_pitch" || game.phase === "awaiting_swing") {
    return "경기장 아래에서 선택합니다";
  }
  return "";
}

function MiniDiamond({ game }: { game: GameView }) {
  return (
    <div
      className="bbg-scorebug-diamond"
      aria-label={`주자 ${baseLabel(game)}`}
      role="img"
    >
      <i data-base="second" data-occupied={game.bases.second} />
      <i data-base="third" data-occupied={game.bases.third} />
      <i data-base="first" data-occupied={game.bases.first} />
    </div>
  );
}

function CountLights({
  label,
  active,
  total,
  tone,
}: {
  label: string;
  active: number;
  total: number;
  tone: string;
}) {
  return (
    <div data-tone={tone}>
      <b>{label}</b>
      {Array.from({ length: total }, (_, index) => (
        <i data-active={index < active} key={index} />
      ))}
    </div>
  );
}

function inningLabel(game: GameView) {
  return `${game.inning}회${game.half === "top" ? "초" : "말"}`;
}

function teamName(game: Pick<GameView, "config">, team: TeamSide) {
  return team === "away" ? game.config.awayTeamName : game.config.homeTeamName;
}

function baseLabel(game: GameView) {
  const occupied = [
    game.bases.first ? "1루" : null,
    game.bases.second ? "2루" : null,
    game.bases.third ? "3루" : null,
  ].filter(Boolean);
  return occupied.length ? occupied.join("·") : "없음";
}

function shouldReplaceSnapshot(
  current: MultiplayerRoomSnapshot,
  incoming: MultiplayerRoomSnapshot,
) {
  if (incoming.view.revision !== current.view.revision) {
    return incoming.view.revision > current.view.revision;
  }
  const rank = { lobby: 0, playing: 1, finished: 2, expired: 3 } as const;
  return rank[incoming.status] >= rank[current.status];
}

function multiplayerCommandLabel(command: MultiplayerCommand, game: GameView) {
  if (command.type === "SELECT_PITCH") {
    return `${PITCH_TARGET_LABELS[command.target]} 선택`;
  }
  if (command.type === "SELECT_SWING") {
    return command.decision === "swing" ? "스윙 선택" : "지켜보기 선택";
  }
  if (command.type === "PASS_CARD_WINDOW") return "카드 없이 진행";
  const card = [
    ...(game.cards.offense.hand ?? []),
    ...(game.cards.defense.hand ?? []),
  ].find((item) => item.instanceId === command.cardInstanceId);
  return card ? `${CARD_DEFINITIONS[card.cardId].name} 카드` : "전략카드";
}

function revisionSummary(game: GameView, previousRevision: number) {
  return (
    game.eventLog.findLast((event) => event.revision > previousRevision)
      ?.summary ?? "다음 경기 단계가 준비됐습니다."
  );
}
