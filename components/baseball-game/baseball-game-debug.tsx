"use client";

import { ArrowRight, House, Layers3, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { WorkbenchAccountControl } from "@/components/workbench-account-control";
import {
  BaseballActionFeedback,
  useBaseballActionFeedback,
} from "@/components/baseball-game/baseball-action-feedback";
import { BaseballSoundControls } from "@/components/baseball-game/audio/baseball-sound-controls";
import { useBaseballSoundscape } from "@/components/baseball-game/audio/use-baseball-soundscape";
import {
  BaseballPlayReceipt,
  BroadcastLineScore,
} from "@/components/baseball-game/baseball-broadcast";
import {
  BaseballDuelControl,
  pendingDuelChoice,
  type DuelRole,
} from "@/components/baseball-game/baseball-duel-control";
import { BaseballStadium } from "@/components/baseball-game/stadium/baseball-stadium";
import { useStagedView } from "@/components/baseball-game/use-staged-view";
import { BaseballCardFace } from "@/components/baseball-game/baseball-card-face";
import { chooseAiAction } from "@/lib/baseball-game/ai";
import { CARD_DEFINITIONS } from "@/lib/baseball-game/cards";
import {
  createGame,
  getActionOwner,
  getGameView,
  getLegalCards,
  getPendingOwners,
  transition,
} from "@/lib/baseball-game/engine";
import {
  getPresentationDuration,
  hasResolutionOutcome,
} from "@/lib/baseball-game/presentation";
import { FACE_LABELS } from "@/lib/baseball-game/rules";
import type {
  CardAvailability,
  CardRole,
  GameAction,
  GameConfig,
  GameEvent,
  GameState,
  ScheduledInnings,
  TeamSide,
} from "@/lib/baseball-game/types";

const DEFAULT_CONFIG: GameConfig = {
  innings: 3,
  awayTeamName: "원정팀",
  homeTeamName: "홈팀",
};

type PlayMode = "solo_ai" | "multiplayer" | "party";

type SessionConfig = {
  mode: PlayMode;
  humanTeam: TeamSide;
};

const DEFAULT_SESSION: SessionConfig = {
  mode: "solo_ai",
  humanTeam: "home",
};

const AI_TURN_DELAY_MS = 650;

export default function BaseballGameDebug({
  initialSeed,
}: {
  initialSeed?: number;
}) {
  const router = useRouter();
  const setupDetailsRef = useRef<HTMLDetailsElement>(null);
  const [draft, setDraft] = useState<GameConfig>(DEFAULT_CONFIG);
  const [draftSession, setDraftSession] =
    useState<SessionConfig>(DEFAULT_SESSION);
  const [game, setGame] = useState(() =>
    createGame(DEFAULT_CONFIG, { seed: initialSeed }),
  );
  const [session, setSession] = useState<SessionConfig>(DEFAULT_SESSION);
  const [multiplayerCode, setMultiplayerCode] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presentationActive, setPresentationActive] = useState(false);
  const [acknowledgedInterlude, setAcknowledgedInterlude] = useState<
    number | null
  >(null);
  const {
    feedback: actionFeedback,
    show: showActionFeedback,
    clear: clearActionFeedback,
  } = useBaseballActionFeedback();
  const currentRevisionEvents = game.eventLog.filter(
    (event) => event.revision === game.revision,
  );
  const currentPresentationDuration = getPresentationDuration(
    currentRevisionEvents,
  );
  const concealingOutcome =
    presentationActive && hasResolutionOutcome(currentRevisionEvents);
  const lastResult = game.eventLog.findLast((event) =>
    ["pitch_result", "batted_ball", "die_roll"].includes(event.kind),
  );
  const actionOwner = getActionOwner(game);
  const playerView = getGameView(game, session.humanTeam);
  const staged = useStagedView(game);
  const display = staged.view;
  const aiTeam =
    session.mode === "solo_ai" ? oppositeTeam(session.humanTeam) : null;
  const soundscape = useBaseballSoundscape({
    game: playerView,
    perspective: session.mode === "solo_ai" ? session.humanTeam : "neutral",
    presenting: presentationActive,
  });
  const interludeKind = staged.settled
    ? getInterludeKind(
        currentRevisionEvents,
        acknowledgedInterlude === game.revision,
      )
    : null;
  const modalOpen = Boolean(interludeKind);
  const isAiTurn = Boolean(
    aiTeam &&
    getPendingOwners(game).includes(aiTeam) &&
    game.phase !== "finished",
  );
  const humanRole: DuelRole =
    session.humanTeam === game.battingTeam ? "batter" : "pitcher";
  const humanChoice = getPendingOwners(game).includes(session.humanTeam)
    ? pendingDuelChoice(playerView, humanRole)
    : null;
  const cardViewer =
    session.mode === "solo_ai" ? session.humanTeam : actionOwner;

  useEffect(() => {
    if (!isAiTurn || !aiTeam || modalOpen) return;
    const action = chooseAiAction(game, aiTeam);
    if (!action) return;

    const timer = window.setTimeout(
      () => {
        const result = transition(game, action);
        if (!result.ok) {
          setError(result.error.message);
          showActionFeedback({
            status: "error",
            title: "AI 행동을 처리하지 못했습니다",
            detail: result.error.message,
          });
          return;
        }
        setError(null);
        setGame(result.state);
        // A duel pick stays secret and results belong to the scene.
        const secret =
          action.type === "SELECT_PITCH" || action.type === "SELECT_SWING";
        showActionFeedback({
          status: "success",
          title: `${teamNameFor(game, aiTeam)}이 ${secret ? "선택을 마쳤습니다" : gameActionLabel(action, game)}`,
          detail: "결과는 경기장에서 확인하세요.",
        });
      },
      Math.max(AI_TURN_DELAY_MS, currentPresentationDuration + 180),
    );

    return () => window.clearTimeout(timer);
  }, [
    aiTeam,
    currentPresentationDuration,
    game,
    isAiTurn,
    modalOpen,
    showActionFeedback,
  ]);

  function dispatchAction(action: GameAction) {
    const result = transition(game, action);
    if (!result.ok) {
      setError(result.error.message);
      showActionFeedback({
        status: "error",
        title: "행동을 반영하지 못했습니다",
        detail: result.error.message,
      });
      return;
    }
    setError(null);
    setGame(result.state);
    showActionFeedback({
      status: "success",
      title: gameActionLabel(action, game),
      detail: result.events.at(-1)?.summary,
    });
  }

  async function startGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftSession.mode === "multiplayer" || draftSession.mode === "party") {
      const roomCode = multiplayerCode.trim().toUpperCase();
      if (roomCode) {
        if (!/^[A-Z2-9]{6}$/.test(roomCode)) {
          setError("방 코드는 영문과 숫자 6자리입니다.");
          return;
        }
        router.push(
          draftSession.mode === "party"
            ? "/baseball-game/party/" + roomCode + "/join"
            : "/baseball-game/rooms/" + roomCode,
        );
        return;
      }

      setCreatingRoom(true);
      setError(null);
      try {
        const response = await fetch("/api/baseball-game/rooms", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ config: draft, mode: draftSession.mode }),
        });
        const payload = (await response.json()) as {
          roomCode?: string;
          roomUrl?: string;
          joinUrl?: string;
          error?: string;
        };
        if (!response.ok || !payload.roomUrl) {
          setError(payload.error ?? "멀티플레이 방을 만들지 못했습니다.");
          return;
        }
        router.push(payload.roomUrl);
      } catch {
        setError("멀티플레이 서버에 연결하지 못했습니다.");
      } finally {
        setCreatingRoom(false);
      }
      return;
    }

    setGame(createGame(draft, { seed: createRandomSeed() }));
    setSession(draftSession);
    setError(null);
    clearActionFeedback();
    setAcknowledgedInterlude(null);
    setupDetailsRef.current?.removeAttribute("open");
  }

  function restartGame() {
    setGame(createGame(game.config, { seed: createRandomSeed() }));
    setDraft(game.config);
    setDraftSession(session);
    setError(null);
    clearActionFeedback();
    setAcknowledgedInterlude(null);
  }

  function openGameSetup() {
    setAcknowledgedInterlude(game.revision);
    setupDetailsRef.current?.setAttribute("open", "");
  }

  return (
    <div className="bbg-shell bbg-solo-shell">
      <header className="bbg-topbar">
        <Link
          aria-label="Workbench 홈으로 돌아가기"
          className="bbg-brand"
          href="/"
        >
          <span className="bbg-brand-mark" aria-hidden="true">
            BB
          </span>
          <span>
            <strong>야구 게임</strong>
          </span>
        </Link>
        <div className="bbg-topbar-side">
          <button
            aria-label={`게임 모드 변경, 현재 ${
              session.mode === "solo_ai"
                ? `AI 대전 ${teamNameFor(game, session.humanTeam)}`
                : session.mode === "multiplayer"
                  ? "멀티플레이"
                  : "파티플레이"
            }`}
            className="bbg-mode-badge"
            onClick={openGameSetup}
            type="button"
          >
            {session.mode === "solo_ai"
              ? `AI 대전 · ${teamNameFor(game, session.humanTeam)}`
              : session.mode === "multiplayer"
                ? "멀티플레이"
                : "파티플레이"}
          </button>
          <WorkbenchAccountControl />
        </div>
      </header>

      <main
        aria-hidden={modalOpen ? true : undefined}
        className="bbg-main"
        inert={modalOpen ? true : undefined}
      >
        <div className="bbg-game-console">
          <section
            className="bbg-field-panel bbg-broadcast-field"
            aria-labelledby="field-heading"
          >
            <div className="bbg-broadcast-stage">
              <div className="bbg-broadcast-heading">
                <h1 id="field-heading">야구 게임 라이브</h1>
                <BroadcastScoreboard game={display} />
                <BaseballSoundControls soundscape={soundscape} />
              </div>

              <div className="bbg-field-content">
                <BaseballStadium
                  face={lastResult?.face}
                  game={playerView}
                  onBeat={soundscape.onBeat}
                  onPresentationChange={setPresentationActive}
                  onPresentedRevision={staged.onPresentedRevision}
                />
                {!presentationActive && staged.settled && humanChoice ? (
                  <div className="bbg-choice-dock">
                    <BaseballDuelControl
                      game={playerView}
                      onAction={dispatchAction}
                      role={humanRole}
                    />
                  </div>
                ) : null}
              </div>

              <PlayResult
                events={currentRevisionEvents}
                game={game}
                key={game.revision}
                presenting={concealingOutcome}
              />
            </div>
          </section>

          <section
            aria-busy={presentationActive}
            className="bbg-control-panel bbg-control-panel--broadcast"
            data-presentation-active={presentationActive}
            inert={presentationActive ? true : undefined}
            aria-label="전략카드와 경기 조작"
          >
            {display.phase === "finished" ? (
              <div className="bbg-winner-card">
                <span>FINAL</span>
                <strong>
                  {display.winner === "home"
                    ? display.config.homeTeamName
                    : display.config.awayTeamName}
                </strong>
                <p>
                  {display.score.away} : {display.score.home} 승리
                </p>
              </div>
            ) : isAiTurn && aiTeam && !humanChoice ? (
              <AiTurnIndicator game={display} team={aiTeam} />
            ) : staged.settled && game.phase === "awaiting_card" ? (
              <CardDecision
                game={game}
                onPass={() => dispatchAction({ type: "PASS_CARD_WINDOW" })}
              />
            ) : null}

            <div className="bbg-control-feedback-slot">
              <BaseballActionFeedback feedback={actionFeedback} />
            </div>

            <CardHands
              game={display}
              viewer={cardViewer}
              onPlay={(cardInstanceId) =>
                dispatchAction({ type: "PLAY_CARD", cardInstanceId })
              }
            />

            {error ? (
              <p className="bbg-error" role="alert">
                {error}
              </p>
            ) : null}
          </section>
        </div>

        <div className="bbg-utility-strip">
          <details className="bbg-utility-card bbg-log-panel">
            <summary>
              <span>최근 기록</span>
              <strong>{display.eventLog.length}</strong>
            </summary>
            {display.eventLog.length === 0 ? (
              <p className="bbg-empty-log">아직 기록된 플레이가 없습니다.</p>
            ) : (
              <ol className="bbg-event-list">
                {display.eventLog
                  .slice(-6)
                  .toReversed()
                  .map((event) => (
                    <li key={event.sequence}>
                      <span>
                        {event.inning}회{event.half === "top" ? "초" : "말"}
                      </span>
                      <strong>{event.summary}</strong>
                      <small>#{event.sequence}</small>
                    </li>
                  ))}
              </ol>
            )}
          </details>

          <details
            className="bbg-utility-card bbg-setup-panel"
            ref={setupDetailsRef}
          >
            <summary>
              <span>새 경기 설정</span>
              <House aria-hidden="true" size={16} />
            </summary>
            <form className="bbg-setup-form" onSubmit={startGame}>
              <label className="bbg-setup-mode">
                게임 모드
                <select
                  aria-label="게임 모드"
                  onChange={(event) =>
                    setDraftSession((current) => ({
                      ...current,
                      mode: event.target.value as PlayMode,
                    }))
                  }
                  value={draftSession.mode}
                >
                  <option value="solo_ai">싱글플레이 · AI 대전</option>
                  <option value="multiplayer">멀티플레이 · 두 기기</option>
                  <option value="party">
                    파티플레이 · 공용 화면 + 개인 기기
                  </option>
                </select>
              </label>
              {draftSession.mode === "solo_ai" ? (
                <label className="bbg-setup-team">
                  내 팀
                  <select
                    aria-label="내 팀"
                    onChange={(event) =>
                      setDraftSession((current) => ({
                        ...current,
                        humanTeam: event.target.value as TeamSide,
                      }))
                    }
                    value={draftSession.humanTeam}
                  >
                    <option value="away">{draft.awayTeamName} · 원정</option>
                    <option value="home">{draft.homeTeamName} · 홈</option>
                  </select>
                </label>
              ) : null}
              {draftSession.mode === "multiplayer" ||
              draftSession.mode === "party" ? (
                <label className="bbg-setup-room">
                  참가할 방 코드
                  <input
                    aria-label="참가할 방 코드"
                    autoCapitalize="characters"
                    inputMode="text"
                    maxLength={6}
                    onChange={(event) =>
                      setMultiplayerCode(
                        event.target.value
                          .toUpperCase()
                          .replace(/[^A-Z2-9]/g, ""),
                      )
                    }
                    placeholder="6자리 코드 · 비우면 새 방"
                    value={multiplayerCode}
                  />
                </label>
              ) : null}
              <label>
                원정팀
                <input
                  maxLength={20}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      awayTeamName: event.target.value,
                    }))
                  }
                  value={draft.awayTeamName}
                />
              </label>
              <label>
                홈팀
                <input
                  maxLength={20}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      homeTeamName: event.target.value,
                    }))
                  }
                  value={draft.homeTeamName}
                />
              </label>
              <label>
                경기 길이
                <select
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      innings: Number(event.target.value) as ScheduledInnings,
                    }))
                  }
                  value={draft.innings}
                >
                  {[3, 5, 7, 9].map((innings) => (
                    <option key={innings} value={innings}>
                      {innings}이닝
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={creatingRoom} type="submit">
                <RotateCcw aria-hidden="true" size={17} />
                {draftSession.mode === "multiplayer"
                  ? creatingRoom
                    ? "방 만드는 중"
                    : multiplayerCode
                      ? "방 참가하기"
                      : "멀티플레이 방 만들기"
                  : draftSession.mode === "party"
                    ? creatingRoom
                      ? "파티 경기 만드는 중"
                      : multiplayerCode
                        ? "파티 방 참가하기"
                        : "파티플레이 경기 만들기"
                    : "새 경기 시작"}
              </button>
            </form>
          </details>
        </div>
      </main>

      {interludeKind ? (
        <GameInterlude
          game={game}
          kind={interludeKind}
          onContinue={() => {
            setAcknowledgedInterlude(game.revision);
          }}
          onOpenSetup={openGameSetup}
          onRestart={restartGame}
        />
      ) : null}
    </div>
  );
}

type InterludeKind = "side_change" | "game_end";

function getInterludeKind(
  events: GameEvent[],
  acknowledged: boolean,
): InterludeKind | null {
  if (acknowledged) return null;
  if (events.some((event) => event.kind === "game_end")) return "game_end";
  if (events.some((event) => event.kind === "half_inning")) {
    return "side_change";
  }
  return null;
}

function GameInterlude({
  game,
  kind,
  onContinue,
  onOpenSetup,
  onRestart,
}: {
  game: GameState;
  kind: InterludeKind;
  onContinue: () => void;
  onOpenSetup: () => void;
  onRestart: () => void;
}) {
  const nextTeamName = teamNameFor(game, game.battingTeam);
  const winnerName = game.winner ? teamNameFor(game, game.winner) : null;
  return (
    <section
      aria-labelledby="interlude-title"
      aria-modal="true"
      className={`bbg-takeover bbg-interlude is-${kind}`}
      role="dialog"
    >
      <div className="bbg-takeover-card">
        <span className="bbg-takeover-kicker">
          {kind === "game_end" ? "FINAL" : "3 OUT"}
        </span>
        <p className="bbg-takeover-inning">
          {kind === "game_end"
            ? `${game.inning}회 경기 종료`
            : `${game.inning}회${game.half === "top" ? "초" : "말"} 시작`}
        </p>
        <h2 id="interlude-title">
          {kind === "game_end" ? `${winnerName} 승리` : "공수 교대"}
        </h2>
        <p className="bbg-takeover-copy">
          {kind === "game_end"
            ? `${game.config.awayTeamName} ${game.score.away} : ${game.score.home} ${game.config.homeTeamName}`
            : `${nextTeamName} 공격이 시작됩니다. 이닝이 바뀌며 양쪽 손패도 새로 배분됐습니다.`}
        </p>
        <MiniScore game={game} />
        {kind === "game_end" ? (
          <div className="bbg-final-actions">
            <button onClick={onRestart} type="button">
              <RotateCcw aria-hidden="true" size={17} /> 같은 설정으로 재경기
            </button>
            <button onClick={onOpenSetup} type="button">
              새 경기 설정
            </button>
          </div>
        ) : (
          <div className="bbg-handoff-action">
            <small>{nextTeamName} 공격 준비</small>
            <button onClick={onContinue} type="button">
              다음 공격 준비
              <ArrowRight aria-hidden="true" size={18} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function MiniScore({ game }: { game: GameState }) {
  return (
    <div className="bbg-mini-score" aria-label="인계 화면 점수">
      <span>
        <small>원정</small>
        <strong>{game.config.awayTeamName}</strong>
        <b>{game.score.away}</b>
      </span>
      <i aria-hidden="true">:</i>
      <span>
        <small>홈</small>
        <strong>{game.config.homeTeamName}</strong>
        <b>{game.score.home}</b>
      </span>
    </div>
  );
}

function AiTurnIndicator({ game, team }: { game: GameState; team: TeamSide }) {
  return (
    <div className="bbg-ai-turn" role="status" aria-live="polite">
      <span>AI</span>
      <strong>{teamNameFor(game, team)} 판단 중</strong>
      <i aria-hidden="true" />
    </div>
  );
}

function CardDecision({
  game,
  onPass,
}: {
  game: GameState;
  onPass: () => void;
}) {
  const role = currentCardRole(game);
  const respondingTo = game.cardWindow?.respondingTo;
  return (
    <div className="bbg-card-decision" aria-live="polite">
      <div>
        <span>
          <Layers3 aria-hidden="true" size={14} />
          {respondingTo ? "RESPONSE" : "STRATEGY"}
        </span>
        <strong>
          {respondingTo
            ? `${CARD_DEFINITIONS[respondingTo.cardId].name} 대응`
            : `${role === "offense" ? "공격" : "수비"} 카드 선택`}
        </strong>
      </div>
      <div className="bbg-card-decision-actions">
        <button onClick={onPass} type="button">
          카드 없이 진행
        </button>
      </div>
    </div>
  );
}

function CardHands({
  game,
  onPlay,
  viewer,
}: {
  game: GameState;
  onPlay: (cardInstanceId: string) => void;
  viewer: TeamSide | null;
}) {
  const activeRole =
    game.phase === "awaiting_card" ? currentCardRole(game) : null;
  const visibleRole = viewer ? roleForTeam(game, viewer) : null;
  return (
    <div
      className="bbg-card-hands"
      data-card-window={game.phase === "awaiting_card"}
      aria-label="싱글플레이 전략카드 손패"
    >
      {(["offense", "defense"] as const).map((role) => (
        <CardHand
          active={activeRole === role && visibleRole === role}
          availability={visibleRole === role ? getLegalCards(game, role) : []}
          game={game}
          key={role}
          onPlay={onPlay}
          revealed={visibleRole === role}
          role={role}
        />
      ))}
    </div>
  );
}

function CardHand({
  active,
  availability,
  game,
  onPlay,
  revealed,
  role,
}: {
  active: boolean;
  availability: CardAvailability[];
  game: GameState;
  onPlay: (cardInstanceId: string) => void;
  revealed: boolean;
  role: CardRole;
}) {
  const team =
    role === "offense"
      ? game.battingTeam
      : game.battingTeam === "away"
        ? "home"
        : "away";
  const teamName =
    game.config[team === "away" ? "awayTeamName" : "homeTeamName"];
  return (
    <section
      className={["bbg-card-hand", active ? "is-active" : null]
        .filter(Boolean)
        .join(" ")}
      data-active={active}
      data-revealed={revealed}
      aria-label={`${teamName} ${role === "offense" ? "공격" : "수비"} ${revealed ? "손패" : "비공개 손패"}`}
    >
      <header>
        <span>{role === "offense" ? "OFFENSE" : "DEFENSE"}</span>
        <strong>{teamName}</strong>
        <small>
          {revealed
            ? active
              ? "선택 가능"
              : `덱 ${game.cards[role].drawPile.length}`
            : `패 ${game.cards[role].hand.length}장`}
        </small>
      </header>
      <div data-concealed={!revealed}>
        {revealed
          ? availability.map(({ instance, playable, reason }) => {
              const definition = CARD_DEFINITIONS[instance.cardId];
              return (
                <button
                  aria-label={`${definition.id} ${definition.name}${playable ? " 사용 가능, 누르면 즉시 사용" : ` 사용 불가: ${reason}`}`}
                  className="bbg-card-preview"
                  data-playable={playable}
                  data-tier={definition.tier}
                  disabled={!playable}
                  key={instance.instanceId}
                  onClick={() => onPlay(instance.instanceId)}
                  title={reason ?? definition.description}
                  type="button"
                >
                  <BaseballCardFace definition={definition} />
                </button>
              );
            })
          : game.cards[role].hand.map((card) => (
              <span
                aria-hidden="true"
                className="bbg-card-back"
                key={card.instanceId}
              >
                <i>BB</i>
              </span>
            ))}
      </div>
    </section>
  );
}

function currentCardRole(game: GameState): CardRole {
  const window = game.cardWindow;
  if (!window) return "offense";
  if (window.respondingTo) {
    return window.respondingTo.role === "offense" ? "defense" : "offense";
  }
  return window.priorityOrder[window.priorityIndex] ?? "offense";
}

function roleForTeam(game: GameState, team: TeamSide): CardRole {
  return team === game.battingTeam ? "offense" : "defense";
}

function teamNameFor(game: GameState, team: TeamSide) {
  return game.config[team === "away" ? "awayTeamName" : "homeTeamName"];
}

function oppositeTeam(team: TeamSide): TeamSide {
  return team === "away" ? "home" : "away";
}

function createRandomSeed() {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0];
}

function BroadcastScoreboard({ game }: { game: GameState }) {
  return (
    <section
      className="bbg-scoreboard"
      data-scheduled-innings={game.config.innings}
      aria-label={`경기 점수판, ${game.inning}회${game.half === "top" ? "초" : "말"}, ${formatOuts(game.outs)}, ${formatBases(game)}`}
    >
      <div className="bbg-live-channel">
        <span>
          <i aria-hidden="true" /> LIVE
        </span>
        <small>{game.config.innings}이닝 경기</small>
      </div>
      <div className="bbg-score-teams">
        <BroadcastLineScore game={game} />
      </div>
      <div className="bbg-score-status">
        <div
          className="bbg-inning-block"
          aria-label={`${game.inning}회${game.half === "top" ? "초" : "말"}`}
        >
          <span aria-hidden="true">{game.half === "top" ? "▲" : "▼"}</span>
          <strong>
            {game.inning}회{game.half === "top" ? "초" : "말"}
          </strong>
          {game.inning > game.config.innings ? <em>연장</em> : null}
        </div>
        <BroadcastBases game={game} />
        <div
          className="bbg-counts bbg-broadcast-counts"
          aria-label="현재 카운트"
        >
          <CountLights count={game.balls} label="B" tone="ball" total={3} />
          <CountLights count={game.strikes} label="S" tone="strike" total={2} />
          <CountLights count={game.outs} label="O" tone="out" total={2} />
        </div>
      </div>
    </section>
  );
}

function CountLights({
  count,
  label,
  tone,
  total,
}: {
  count: number;
  label: "B" | "S" | "O";
  tone: "ball" | "strike" | "out";
  total: number;
}) {
  const accessibleLabel =
    label === "B" ? "볼" : label === "S" ? "스트라이크" : "아웃";
  return (
    <span
      aria-label={`${accessibleLabel} ${count}`}
      className="bbg-count-line"
      data-tone={tone}
    >
      <b aria-hidden="true">{label}</b>
      <span aria-hidden="true" className="bbg-count-lights">
        {Array.from({ length: total }, (_, index) => (
          <i data-active={index < count} key={index} />
        ))}
      </span>
    </span>
  );
}

function BroadcastBases({ game }: { game: GameState }) {
  return (
    <div className="bbg-broadcast-bases" aria-label={formatBases(game)}>
      <div aria-hidden="true">
        <i className="is-second" data-occupied={game.bases.second} />
        <i className="is-third" data-occupied={game.bases.third} />
        <i className="is-first" data-occupied={game.bases.first} />
      </div>
    </div>
  );
}

function PlayResult({
  events,
  game,
  presenting,
}: {
  events: GameEvent[];
  game: GameState;
  presenting: boolean;
}) {
  const event =
    events.findLast((item) => item.kind === "game_end") ??
    events.findLast((item) => item.kind === "plate_appearance") ??
    events.findLast((item) => item.kind === "count") ??
    events.findLast((item) => item.kind === "half_inning") ??
    events.at(-1);
  const tone = presenting
    ? "playing"
    : !event
      ? "ready"
      : event.kind === "game_end"
        ? "final"
        : event.runs > 0
          ? "score"
          : event.outsRecorded > 0
            ? "out"
            : game.phase === "awaiting_batting" || game.phase === "awaiting_hit"
              ? "contact"
              : "count";

  return (
    <div
      className="bbg-play-result"
      data-tone={tone}
      aria-live="polite"
      data-testid="play-result"
    >
      <div className="bbg-result-die" aria-hidden="true">
        <strong>
          {presenting
            ? "•"
            : !event
              ? "▶"
              : event.kind === "game_end"
                ? "F"
                : event.runs > 0
                  ? "+"
                  : event.outsRecorded > 0
                    ? "O"
                    : "•"}
        </strong>
      </div>
      <div className="bbg-result-copy">
        <h2>
          {presenting
            ? "플레이 진행 중"
            : (event?.summary ?? "첫 투구를 준비하세요")}
        </h2>
        {presenting ? null : <BaseballPlayReceipt game={game} />}
      </div>
    </div>
  );
}

function formatOuts(outs: GameState["outs"]) {
  if (outs === 0) return "무사";
  return `${outs}사`;
}

function formatBases(game: GameState) {
  const bases = [
    game.bases.first ? "1" : null,
    game.bases.second ? "2" : null,
    game.bases.third ? "3" : null,
  ].filter(Boolean);
  if (bases.length === 0) return "주자 없음";
  if (bases.length === 3) return "만루";
  return `${bases.join("·")}루`;
}

function gameActionLabel(action: GameAction, game: GameState) {
  if (action.type === "PASS_CARD_WINDOW") return "카드 없이 진행했습니다";
  if (action.type === "PLAY_CARD") {
    const card = [...game.cards.offense.hand, ...game.cards.defense.hand].find(
      (item) => item.instanceId === action.cardInstanceId,
    );
    return card
      ? `${CARD_DEFINITIONS[card.cardId].name} 카드를 사용했습니다`
      : "전략카드를 사용했습니다";
  }
  if (action.type === "SELECT_PITCH") {
    return action.target === "ball"
      ? "볼을 선택했습니다"
      : "스트라이크를 선택했습니다";
  }
  if (action.type === "SELECT_SWING") {
    return action.decision === "swing"
      ? "스윙을 선택했습니다"
      : "공을 지켜봤습니다";
  }
  return `${action.face} · ${FACE_LABELS[action.face]} 판정을 선택했습니다`;
}
