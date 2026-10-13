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
  usePresentation,
} from "@/components/baseball-game/baseball-broadcast";
import {
  BaseballDuelControl,
  pendingDuelChoice,
  type DuelRole,
} from "@/components/baseball-game/baseball-duel-control";
import { getBallFlight } from "@/components/baseball-game/stadium/ball-flight";
import { BaseballFieldView } from "@/components/baseball-game/stadium/baseball-field-view";
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
  getPlateAppearancePitchHistory,
  getPresentationBases,
  getPresentationDuration,
  hasResolutionOutcome,
} from "@/lib/baseball-game/presentation";
import { FACE_LABELS } from "@/lib/baseball-game/rules";
import type {
  CardAvailability,
  CardRole,
  DieFace,
  GameAction,
  GameConfig,
  GameEvent,
  GamePhase,
  GameState,
  GameView,
  PitchFace,
  PitchLocation,
  PresentationBeat,
  PresentationCue,
  PresentationScene,
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
