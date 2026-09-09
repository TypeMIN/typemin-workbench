"use client";

import { ArrowLeft, Check, Copy, Radio, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  BaseballActionFeedback,
  useAdaptiveGamePolling,
  useBaseballActionFeedback,
} from "@/components/baseball-game/baseball-action-feedback";
import { BaseballStadium } from "@/components/baseball-game/baseball-game-debug";
import { BaseballDuelControl } from "@/components/baseball-game/baseball-duel-control";
import {
  BaseballAudio,
  BroadcastLineScore,
} from "@/components/baseball-game/baseball-broadcast";
import { CARD_DEFINITIONS } from "@/lib/baseball-game/cards";
import type {
  MultiplayerCommand,
  MultiplayerRoomSnapshot,
} from "@/lib/baseball-game/multiplayer/types";
import type { CardRole, GameAction, GameView } from "@/lib/baseball-game/types";

const PHASE_LABEL = {
  awaiting_pitch: "투구",
  awaiting_swing: "타격 판단",
  awaiting_batting: "타격",
  awaiting_hit: "안타",
  awaiting_card: "전략카드",
  finished: "경기 종료",
} as const;

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
  const seatEstablishedRef = useRef(false);
  const actionFeedback = useBaseballActionFeedback();

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
        const incoming = payload.snapshot;
        seatEstablishedRef.current = true;
        setNeedsSeat(false);
        setSnapshot((current) =>
          !current || shouldReplaceSnapshot(current, incoming)
            ? incoming
            : current,
        );
        setError(null);
      } catch {
        if (!quiet) setError("멀티플레이 서버에 연결하지 못했습니다.");
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [roomCode],
  );

  useAdaptiveGamePolling(loadSnapshot, {
    activeMs: snapshot?.isYourTurn ? 550 : 250,
  });

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
      setSnapshot(payload.snapshot);
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
      setSnapshot(payload.snapshot);
      actionFeedback.show({
        status: "success",
        title: `${intent} 반영 완료`,
        detail: revisionSummary(payload.snapshot.view, previousRevision),
      });
    } catch {
      const message = "경기 행동을 서버에 보내지 못했습니다.";
      setError(message);
      actionFeedback.show({
        status: "error",
        title: `${intent} 전송 실패`,
        detail: "연결을 확인한 뒤 다시 시도해 주세요.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function copyRoomLink() {
    try {
      const roomUrl = `${window.location.origin}/baseball-game/rooms/${roomCode}`;
      await navigator.clipboard.writeText(roomUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError(
        "참가 링크를 복사하지 못했습니다. 주소창의 링크를 공유해 주세요.",
      );
    }
  }

  return (
    <div className="bbg-shell bbg-mp-shell">
      <header className="bbg-topbar bbg-mp-topbar">
        <Link className="bbg-brand" href="/baseball-game">
          <span className="bbg-brand-mark" aria-hidden="true">
            BB
          </span>
          <span>
            <strong>야구 게임</strong>
            <small>MULTIPLAYER · SERVER MATCH</small>
          </span>
        </Link>
        <div className="bbg-mp-room-chip" aria-label={`방 코드 ${roomCode}`}>
          <Radio aria-hidden="true" size={13} />
          <span>ROOM</span>
          <strong>{roomCode}</strong>
        </div>
      </header>

      <main className="bbg-mp-main">
        {loading && !snapshot ? (
          <RoomMessage
            title="경기장을 불러오는 중"
            copy="방과 좌석을 확인하고 있습니다."
          />
        ) : needsSeat ? (
          <RoomJoin
            roomCode={roomCode}
            joining={joining}
            onJoin={joinRoom}
            error={error}
          />
        ) : snapshot ? (
          <MultiplayerBoard
            copied={copied}
            error={error}
            feedback={actionFeedback.feedback}
            onCopy={copyRoomLink}
            onRefresh={() => void loadSnapshot()}
            onSubmit={submitCommand}
            snapshot={snapshot}
            submitting={submitting}
          />
        ) : (
          <RoomMessage
            title="경기장을 열 수 없습니다"
            copy={error ?? "방 코드를 다시 확인해 주세요."}
          />
        )}
      </main>
    </div>
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
    <section className="bbg-mp-message" aria-labelledby="join-title">
      <span className="bbg-mp-message-icon">
        <Users aria-hidden="true" />
      </span>
      <small>MULTIPLAYER · {roomCode}</small>
      <h1 id="join-title">홈팀으로 참가할까요?</h1>
      <p>이 기기에는 홈팀 손패만 표시되고, 상대 손패는 전송되지 않습니다.</p>
      {error ? (
        <p className="bbg-error" role="alert">
          {error}
        </p>
      ) : null}
      <button disabled={joining} onClick={onJoin} type="button">
        {joining ? "좌석 확인 중" : "홈팀으로 참가"}
      </button>
      <Link href="/baseball-game">
        <ArrowLeft aria-hidden="true" size={15} /> 돌아가기
      </Link>
    </section>
  );
}

function RoomMessage({ title, copy }: { title: string; copy: string }) {
  return (
    <section className="bbg-mp-message">
      <span className="bbg-mp-message-icon">
        <RefreshCw aria-hidden="true" />
      </span>
      <h1>{title}</h1>
      <p>{copy}</p>
      <Link href="/baseball-game">
        <ArrowLeft aria-hidden="true" size={15} /> 돌아가기
      </Link>
    </section>
  );
}

function MultiplayerBoard({
  copied,
  error,
  feedback,
  onCopy,
  onRefresh,
  onSubmit,
  snapshot,
  submitting,
}: {
  copied: boolean;
  error: string | null;
  feedback: ReturnType<typeof useBaseballActionFeedback>["feedback"];
  onCopy: () => void;
  onRefresh: () => void;
  onSubmit: (command: MultiplayerCommand) => void;
  snapshot: MultiplayerRoomSnapshot;
  submitting: boolean;
}) {
  const game = snapshot.view;
  const ownRole: CardRole =
    snapshot.seat === game.battingTeam ? "offense" : "defense";
  const ownHand = game.cards[ownRole].hand ?? [];
  const legalById = useMemo(
    () =>
      new Map(
        snapshot.legalCards.map((item) => [item.instance.instanceId, item]),
      ),
    [snapshot.legalCards],
  );
  const latestEvent = game.eventLog.at(-1);
  const latestFace = game.eventLog.findLast(
    (event) =>
      event.kind === "pitch_result" ||
      event.kind === "batted_ball" ||
      event.kind === "die_roll",
  )?.face;
  const seatName = teamName(game, snapshot.seat);

  return (
    <div
      aria-busy={submitting}
      className="bbg-mp-board"
      data-room-status={snapshot.status}
    >
      <BaseballActionFeedback
        className="bbg-mp-action-feedback"
        feedback={feedback}
      />
      <section className="bbg-mp-field" aria-label="야구 경기장">
        <section
          className="bbg-mp-broadcast"
          aria-label={`멀티플레이 경기 점수판 ${inningLabel(game)}`}
        >
          <div className="bbg-mp-score">
            <BroadcastLineScore game={game} />
          </div>
          <div className="bbg-mp-score-status">
            <div className="bbg-mp-inning">
              <strong>{inningLabel(game)}</strong>
            </div>
            <MiniDiamond game={game} />
            <div className="bbg-mp-counts">
              <CountLights
                label="B"
                active={game.balls}
                total={3}
                tone="ball"
              />
              <CountLights
                label="S"
                active={game.strikes}
                total={2}
                tone="strike"
              />
              <CountLights label="O" active={game.outs} total={2} tone="out" />
            </div>
          </div>
          <BaseballAudio events={game.eventLog} />
        </section>
        <BaseballStadium
          face={latestFace}
          game={game}
          key={`multiplayer-field-${game.revision}`}
        />
        <div className="bbg-mp-field-result" aria-live="polite">
          <span className="bbg-mp-result-token" aria-hidden="true">
            <small>{latestFace ? "PLAY" : "NEXT"}</small>
            <b>{latestFace ?? "▶"}</b>
          </span>
          <small>{latestEvent ? "방금 판정" : "PLAY BALL"}</small>
          <strong>{latestEvent?.summary ?? "첫 투구를 준비하세요"}</strong>
        </div>
      </section>

      <aside className="bbg-mp-controls" aria-label="멀티플레이 조작부">
        <div className="bbg-panel-heading bbg-mp-panel-heading">
          <div>
            <p>ON DECK</p>
            <h2>현재 판정</h2>
          </div>
          <span>PITCH DUEL · {PHASE_LABEL[game.phase]}</span>
        </div>
        <div className="bbg-mp-connection">
          <span data-online={snapshot.opponentConnected} />
          <div>
            <small>
              {snapshot.seat === "away" ? "원정팀" : "홈팀"} · 내 좌석
            </small>
            <strong>{seatName}</strong>
          </div>
          <button
            aria-label="경기 상태 새로고침"
            onClick={onRefresh}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={14} />
          </button>
        </div>

        {snapshot.status === "lobby" ? (
          <div className="bbg-mp-waiting">
            <span>
              <Users aria-hidden="true" size={19} />
            </span>
            <strong>홈팀 참가 대기 중</strong>
            <p>상대 기기에서 아래 링크를 열면 경기가 시작됩니다.</p>
            <button onClick={onCopy} type="button">
              {copied ? (
                <Check aria-hidden="true" size={15} />
              ) : (
                <Copy aria-hidden="true" size={15} />
              )}
              {copied ? "링크 복사됨" : "참가 링크 복사"}
            </button>
          </div>
        ) : (
          <TurnControl
            disabled={submitting}
            game={game}
            isYourTurn={snapshot.isYourTurn}
            onSubmit={onSubmit}
          />
        )}

        <section
          className="bbg-mp-hand"
          aria-label={`${seatName} ${ownRole === "offense" ? "공격" : "수비"} 손패`}
        >
          <header>
            <div>
              <small>MY HAND</small>
              <strong>
                {ownRole === "offense" ? "공격 카드" : "수비 카드"}
              </strong>
            </div>
            <span>{ownHand.length}장</span>
          </header>
          <div>
            {ownHand.map((card) => {
              const definition = CARD_DEFINITIONS[card.cardId];
              const availability = legalById.get(card.instanceId);
              const playable =
                snapshot.isYourTurn && Boolean(availability?.playable);
              return (
                <button
                  aria-label={`${definition.id} ${definition.name}${playable ? " 사용 가능" : " 사용 불가"}`}
                  data-playable={playable}
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
                  <b>{definition.id}</b>
                  <strong>{definition.name}</strong>
                  <small>{definition.description}</small>
                </button>
              );
            })}
          </div>
        </section>
        {error ? (
          <p className="bbg-error" role="alert">
            {error}
          </p>
        ) : null}
      </aside>
    </div>
  );
}

function TurnControl({
  disabled,
  game,
  isYourTurn,
  onSubmit,
}: {
  disabled: boolean;
  game: GameView;
  isYourTurn: boolean;
  onSubmit: (command: MultiplayerCommand) => void;
}) {
  if (game.phase === "finished") {
    return (
      <div className="bbg-mp-turn is-waiting">
        <small>FINAL</small>
        <strong>
          {game.winner ? `${teamName(game, game.winner)} 승리` : "경기 종료"}
        </strong>
      </div>
    );
  }
  if (!isYourTurn) {
    return (
      <div className="bbg-mp-turn is-waiting">
        <small>OPPONENT TURN</small>
        <strong>상대 팀의 결정을 기다리는 중</strong>
        <span>경기 상태는 자동으로 동기화됩니다.</span>
      </div>
    );
  }
  if (game.phase === "awaiting_card") {
    return (
      <div className="bbg-mp-turn is-yours">
        <small>YOUR TURN · STRATEGY</small>
        <strong>사용할 카드를 선택하세요</strong>
        <button
          disabled={disabled}
          onClick={() => onSubmit({ type: "PASS_CARD_WINDOW" })}
          type="button"
        >
          {disabled ? "서버 확인 중…" : "카드 없이 진행"}
        </button>
      </div>
    );
  }
  if (game.phase === "awaiting_pitch" || game.phase === "awaiting_swing") {
    return (
      <div className="bbg-mp-turn is-yours bbg-mp-turn--duel">
        <BaseballDuelControl
          busy={disabled}
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
    );
  }
  return (
    <div className="bbg-mp-turn is-waiting">
      <small>AUTO RESOLVE</small>
      <strong>{PHASE_LABEL[game.phase]} 처리 중</strong>
    </div>
  );
}

function MiniDiamond({ game }: { game: GameView }) {
  return (
    <div
      className="bbg-mp-diamond"
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

function teamName(game: GameView, team: "away" | "home") {
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
  if (command.type === "SELECT_PITCH") return "투구 코스 선택";
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
