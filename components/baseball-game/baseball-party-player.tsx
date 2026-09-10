"use client";

import { Radio, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  BaseballActionFeedback,
  useAdaptiveGamePolling,
  useBaseballActionFeedback,
} from "./baseball-action-feedback";
import { CARD_DEFINITIONS } from "@/lib/baseball-game/cards";
import type { MultiplayerCommand } from "@/lib/baseball-game/multiplayer/types";
import type { PartyPlayerSnapshot } from "@/lib/baseball-game/party/types";
import { BaseballAudio, BroadcastLineScore } from "./baseball-broadcast";
import { BaseballDuelControl } from "./baseball-duel-control";
import type { CardRole, GameAction, GameView } from "@/lib/baseball-game/types";

const PHASE = {
  awaiting_pitch: "투구",
  awaiting_swing: "타격 판단",
  awaiting_batting: "타격",
  awaiting_hit: "안타",
  awaiting_card: "전략카드",
  finished: "종료",
} as const;

export default function BaseballPartyPlayer({
  roomCode,
}: {
  roomCode: string;
}) {
  const [snapshot, setSnapshot] = useState<PartyPlayerSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const actionFeedback = useBaseballActionFeedback();

  const load = useCallback(
    async (quiet = false) => {
      try {
        const response = await fetch(
          `/api/baseball-game/rooms/${roomCode}/party/view`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          snapshot?: PartyPlayerSnapshot;
          error?: string;
        };
        if (response.status === 401) {
          setRemoved(true);
          setSnapshot(null);
          setError(payload.error ?? "참가자 세션이 만료되었습니다.");
          return;
        }
        if (!response.ok || !payload.snapshot)
          throw new Error(payload.error ?? "선수 화면을 불러오지 못했습니다.");
        setSnapshot((current) =>
          !current || payload.snapshot!.roomRevision >= current.roomRevision
            ? payload.snapshot!
            : current,
        );
        setError(null);
      } catch (cause) {
        if (!quiet)
          setError(
            cause instanceof Error
              ? cause.message
              : "서버에 연결하지 못했습니다.",
          );
      }
    },
    [roomCode],
  );

  useAdaptiveGamePolling(load);

  useEffect(() => {
    const heartbeat = window.setInterval(
      () =>
        void fetch(`/api/baseball-game/rooms/${roomCode}/party/heartbeat`, {
          method: "POST",
        }),
      10_000,
    );
    return () => {
      window.clearInterval(heartbeat);
    };
  }, [roomCode]);

  async function submit(command: MultiplayerCommand) {
    if (!snapshot || busy || !snapshot.canAct) return;
    const intent = partyCommandLabel(command, snapshot.view);
    const previousRevision = snapshot.view.revision;
    setBusy(true);
    setError(null);
    actionFeedback.show({
      status: "pending",
      title: `${intent} 요청 중`,
      detail: "서버 판정이 끝날 때까지 입력을 유지합니다.",
    });
    try {
      const response = await fetch(
        `/api/baseball-game/rooms/${roomCode}/party/actions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            command,
            expectedRevision: snapshot.view.revision,
            expectedRoomRevision: snapshot.roomRevision,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const payload = (await response.json()) as {
        snapshot?: PartyPlayerSnapshot;
        error?: string;
      };
      if (!response.ok || !payload.snapshot) {
        if (response.status === 409) {
          await load(true);
          actionFeedback.show({
            status: "error",
            title: "팀의 다른 행동이 먼저 반영됐습니다",
            detail: "최신 경기 상태로 자동 동기화했습니다.",
          });
          return;
        }
        throw new Error(payload.error ?? "행동을 처리하지 못했습니다.");
      }
      setSnapshot(payload.snapshot);
      actionFeedback.show({
        status: "success",
        title: `${intent} 반영 완료`,
        detail: revisionSummary(payload.snapshot.view, previousRevision),
      });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "행동을 보내지 못했습니다.";
      setError(message);
      actionFeedback.show({
        status: "error",
        title: `${intent} 전송 실패`,
        detail: message,
      });
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot)
    return (
      <main className="bbg-party-mobile-shell">
        <section className="bbg-party-join-card">
          <RefreshCw />
          <h1>{removed ? "관전 모드로 전환" : "선수 화면 연결 중"}</h1>
          <p>{error ?? "참가 정보를 확인하고 있습니다."}</p>
          {removed ? (
            <Link
              className="bbg-party-primary-link"
              href={`/baseball-game/party/${roomCode}`}
            >
              공개 관전 화면
            </Link>
          ) : null}
        </section>
      </main>
    );
  return (
    <PartyPlayerBoard
      busy={busy}
      error={error}
      feedback={actionFeedback.feedback}
      onSubmit={submit}
      snapshot={snapshot}
    />
  );
}

function PartyPlayerBoard({
  busy,
  error,
  feedback,
  onSubmit,
  snapshot,
}: {
  busy: boolean;
  error: string | null;
  feedback: ReturnType<typeof useBaseballActionFeedback>["feedback"];
  onSubmit: (command: MultiplayerCommand) => void;
  snapshot: PartyPlayerSnapshot;
}) {
  const game = snapshot.view;
  const ownRole: CardRole =
    snapshot.me.team === game.battingTeam ? "offense" : "defense";
  const hand = game.cards[ownRole].hand ?? [];
  const legal = useMemo(
    () =>
      new Map(
        snapshot.legalCards.map((item) => [item.instance.instanceId, item]),
      ),
    [snapshot.legalCards],
  );
  const activeId =
    snapshot.actionOwner === game.battingTeam
      ? snapshot.activeBatterId
      : snapshot.activeDefenderId;
  const active = [...snapshot.players.away, ...snapshot.players.home].find(
    (player) => player.id === activeId,
  );
  return (
    <main aria-busy={busy} className="bbg-party-player-shell">
      <BaseballAudio events={game.eventLog} mode="personal" />
      <BaseballActionFeedback
        className="bbg-party-player-feedback"
        feedback={feedback}
      />
      <header>
        <Link href="/baseball-game">
          <span>BB</span>
          <strong>파티플레이</strong>
        </Link>
        <div>
          <Radio size={12} />
          {roomCodeLabel(snapshot.roomCode)}
        </div>
      </header>
      <PartyMiniScore game={game} />
      <section
        className="bbg-party-player-status"
        data-active={snapshot.canAct}
      >
        <BroadcastLineScore game={game} />
        <small>{snapshot.canAct ? "YOUR TURN" : "WAITING"}</small>
        <h1>
          {snapshot.canAct
            ? `${PHASE[game.phase]} 차례입니다`
            : `현재 ${active?.nickname ?? "다른 선수"}님의 차례`}
        </h1>
        <p>
          {snapshot.status === "paused"
            ? "방장이 경기를 일시정지했습니다."
            : snapshot.me.team === game.battingTeam
              ? `타자 · ${snapshot.me.nickname}`
              : `수비 · ${snapshot.me.nickname}`}
        </p>
      </section>
      <section className="bbg-party-player-roster" aria-label="내 팀 순서">
        <header>
          <strong>
            {snapshot.me.team === "away"
              ? game.config.awayTeamName
              : game.config.homeTeamName}
          </strong>
          <small>
            공용 손패 · {snapshot.players[snapshot.me.team].length}명
          </small>
        </header>
        <ol>
          {snapshot.players[snapshot.me.team].map((player) => (
            <li
              data-active={player.id === activeId}
              data-me={player.id === snapshot.me.id}
              key={player.id}
            >
              <span>{player.nickname.slice(0, 1)}</span>
              <strong>{player.nickname}</strong>
              {player.id === activeId ? (
                <em>NOW</em>
              ) : player.id === snapshot.me.id ? (
                <em>ME</em>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
      <section
        className="bbg-party-player-hand"
        aria-label={`${snapshot.me.team === "away" ? "원정팀" : "홈팀"} ${ownRole === "offense" ? "공격" : "수비"} 공용 손패`}
      >
        <header>
          <div>
            <small>TEAM HAND</small>
            <strong>{ownRole === "offense" ? "공격 카드" : "수비 카드"}</strong>
          </div>
          <span>{hand.length}장</span>
        </header>
        <div>
          {hand.map((card) => {
            const definition = CARD_DEFINITIONS[card.cardId];
            const availability = legal.get(card.instanceId);
            const highlighted = Boolean(availability?.playable);
            return (
              <button
                aria-label={`${definition.id} ${definition.name}${highlighted ? " 사용 가능" : " 사용 불가"}`}
                data-playable={highlighted}
                disabled={!snapshot.canAct || !highlighted || busy}
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
      <PartyAction
        busy={busy}
        game={game}
        onSubmit={onSubmit}
        snapshot={snapshot}
      />
      {error ? (
        <p className="bbg-error" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}

function PartyAction({
  busy,
  game,
  onSubmit,
  snapshot,
}: {
  busy: boolean;
  game: GameView;
  onSubmit: (command: MultiplayerCommand) => void;
  snapshot: PartyPlayerSnapshot;
}) {
  if (game.phase === "finished")
    return (
      <section className="bbg-party-player-action">
        <small>FINAL</small>
        <strong>
          {game.winner
            ? `${game.winner === "away" ? game.config.awayTeamName : game.config.homeTeamName} 승리`
            : "경기 종료"}
        </strong>
      </section>
    );
  if (!snapshot.canAct)
    return (
      <section className="bbg-party-player-action is-waiting">
        <Users />
        <strong>팀원의 결정을 기다리는 중</strong>
      </section>
    );
  if (game.phase === "awaiting_card")
    return (
      <section className="bbg-party-player-action">
        <small>STRATEGY</small>
        <strong>카드를 선택하거나 진행하세요</strong>
        <button
          disabled={busy}
          onClick={() => onSubmit({ type: "PASS_CARD_WINDOW" })}
          type="button"
        >
          {busy ? "서버 확인 중…" : "카드 없이 진행"}
        </button>
      </section>
    );
  if (game.phase === "awaiting_pitch" || game.phase === "awaiting_swing")
    return (
      <section className="bbg-party-player-action bbg-party-player-action--duel">
        <BaseballDuelControl
          busy={busy}
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
      </section>
    );
  return (
    <section className="bbg-party-player-action is-waiting">
      <strong>{PHASE[game.phase]} 자동 판정 중</strong>
    </section>
  );
}

function PartyMiniScore({ game }: { game: GameView }) {
  return (
    <section
      className="bbg-party-mini-score"
      aria-label={`개인 경기 점수판 ${game.inning}회${game.half === "top" ? "초" : "말"}`}
    >
      <div>
        {(["away", "home"] as const).map((team) => (
          <p data-batting={game.battingTeam === team} key={team}>
            <small>{team === "away" ? "원정" : "홈"}</small>
            <strong>
              {team === "away"
                ? game.config.awayTeamName
                : game.config.homeTeamName}
            </strong>
            <b>{game.score[team]}</b>
          </p>
        ))}
      </div>
      <span>
        <strong>
          {game.inning}회{game.half === "top" ? "초" : "말"}
        </strong>
        <small>
          B {game.balls} · S {game.strikes} · O {game.outs}
        </small>
      </span>
      <div className="bbg-party-mini-bases">
        <i data-on={game.bases.second} />
        <i data-on={game.bases.third} />
        <i data-on={game.bases.first} />
      </div>
    </section>
  );
}
function roomCodeLabel(value: string) {
  return `ROOM ${value}`;
}

function partyCommandLabel(command: MultiplayerCommand, game: GameView) {
  if (command.type === "SELECT_PITCH") return "투구 선택";
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
