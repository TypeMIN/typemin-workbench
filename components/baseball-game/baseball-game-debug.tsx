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
import {
  BaseballAudio,
  BroadcastLineScore,
  usePresentation,
} from "@/components/baseball-game/baseball-broadcast";
import { BaseballDuelControl } from "@/components/baseball-game/baseball-duel-control";
import { chooseAiAction } from "@/lib/baseball-game/ai";
import { CARD_DEFINITIONS } from "@/lib/baseball-game/cards";
import { PITCH_TARGET_LABELS } from "@/lib/baseball-game/duel";
import {
  createGame,
  getActionOwner,
  getGameView,
  getLegalCards,
  transition,
} from "@/lib/baseball-game/engine";
import { getPlateAppearancePitchHistory } from "@/lib/baseball-game/presentation";
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
  PitchLocation,
  PresentationCue,
  RunnerDestination,
  RunnerOrigin,
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

const AI_TURN_DELAY_MS = 900;
const CHOICE_FLASH_MS = 800;

type ChoiceFlash = {
  id: number;
  label: string;
  tone: "pitch" | "swing" | "card";
};

const PHASE_TITLE: Record<GamePhase, string> = {
  awaiting_pitch: "투구 선택",
  awaiting_swing: "타격 선택",
  awaiting_batting: "타구 판정",
  awaiting_hit: "주루 판정",
  awaiting_card: "전략카드 결정",
  finished: "경기 종료",
};

export default function BaseballGameDebug() {
  const router = useRouter();
  const setupDetailsRef = useRef<HTMLDetailsElement>(null);
  const [draft, setDraft] = useState<GameConfig>(DEFAULT_CONFIG);
  const [draftSession, setDraftSession] =
    useState<SessionConfig>(DEFAULT_SESSION);
  const [game, setGame] = useState(() => createGame(DEFAULT_CONFIG));
  const [session, setSession] = useState<SessionConfig>(DEFAULT_SESSION);
  const [multiplayerCode, setMultiplayerCode] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choiceFlash, setChoiceFlash] = useState<ChoiceFlash | null>(null);
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
  const lastResult = game.eventLog.findLast((event) =>
    ["pitch_result", "batted_ball", "die_roll"].includes(event.kind),
  );
  const actionOwner = getActionOwner(game);
  const playerView = getGameView(game, session.humanTeam);
  const aiTeam =
    session.mode === "solo_ai" ? oppositeTeam(session.humanTeam) : null;
  const interludeKind = getInterludeKind(
    currentRevisionEvents,
    acknowledgedInterlude === game.revision,
  );
  const modalOpen = Boolean(interludeKind);
  const isAiTurn = Boolean(
    aiTeam && actionOwner === aiTeam && game.phase !== "finished",
  );
  const cardViewer =
    session.mode === "solo_ai" ? session.humanTeam : actionOwner;

  useEffect(() => {
    if (!choiceFlash) return;
    const timer = window.setTimeout(
      () => setChoiceFlash(null),
      CHOICE_FLASH_MS,
    );
    return () => window.clearTimeout(timer);
  }, [choiceFlash]);

  useEffect(() => {
    if (!isAiTurn || !aiTeam || modalOpen) return;
    const action = chooseAiAction(game, aiTeam);
    if (!action) return;

    const timer = window.setTimeout(() => {
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
      setChoiceFlash(choiceFlashForAction(action, game, true));
      showActionFeedback({
        status: "success",
        title: `${teamNameFor(game, aiTeam)}이 ${gameActionLabel(action, game)}`,
        detail: result.events.at(-1)?.summary,
      });
    }, AI_TURN_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [aiTeam, game, isAiTurn, modalOpen, showActionFeedback]);

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
    setChoiceFlash(choiceFlashForAction(action, game, false));
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
    setChoiceFlash(null);
    setError(null);
    clearActionFeedback();
    setAcknowledgedInterlude(null);
    setupDetailsRef.current?.removeAttribute("open");
  }

  function restartGame() {
    setGame(createGame(game.config, { seed: createRandomSeed() }));
    setDraft(game.config);
    setDraftSession(session);
    setChoiceFlash(null);
    setError(null);
    clearActionFeedback();
    setAcknowledgedInterlude(null);
  }

  function openGameSetup() {
    setAcknowledgedInterlude(game.revision);
    setupDetailsRef.current?.setAttribute("open", "");
  }

  return (
    <div className="bbg-shell">
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
                <BroadcastScoreboard game={game} />
                <BaseballAudio events={game.eventLog} />
              </div>

              <div className="bbg-field-content">
                <BaseballStadium
                  face={lastResult?.face}
                  game={playerView}
                  key={`field-${game.revision}`}
                />
                <StadiumHighlight
                  events={currentRevisionEvents}
                  key={`highlight-${game.revision}`}
                />
                {choiceFlash ? (
                  <div
                    className="bbg-choice-flash"
                    data-tone={choiceFlash.tone}
                    key={choiceFlash.id}
                    role="status"
                  >
                    {choiceFlash.label}
                  </div>
                ) : !isAiTurn &&
                  (game.phase === "awaiting_pitch" ||
                    game.phase === "awaiting_swing") ? (
                  <div className="bbg-choice-dock">
                    <BaseballDuelControl
                      game={playerView}
                      onAction={dispatchAction}
                    />
                  </div>
                ) : null}
              </div>

              <PlayResult
                events={currentRevisionEvents}
                game={game}
                key={game.revision}
              />
            </div>
          </section>

          <section
            className="bbg-control-panel bbg-control-panel--broadcast"
            aria-label="전략카드와 경기 조작"
          >
            {game.phase === "finished" ? (
              <div className="bbg-winner-card">
                <span>FINAL</span>
                <strong>
                  {game.winner === "home"
                    ? game.config.homeTeamName
                    : game.config.awayTeamName}
                </strong>
                <p>
                  {game.score.away} : {game.score.home} 승리
                </p>
              </div>
            ) : isAiTurn && aiTeam ? (
              <AiTurnIndicator game={game} team={aiTeam} />
            ) : game.phase === "awaiting_card" ? (
              <CardDecision
                game={game}
                onPass={() => dispatchAction({ type: "PASS_CARD_WINDOW" })}
              />
            ) : null}

            <div className="bbg-control-feedback-slot">
              <BaseballActionFeedback feedback={actionFeedback} />
            </div>

            <CardHands
              game={game}
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
              <strong>{game.eventLog.length}</strong>
            </summary>
            {game.eventLog.length === 0 ? (
              <p className="bbg-empty-log">아직 기록된 플레이가 없습니다.</p>
            ) : (
              <ol className="bbg-event-list">
                {game.eventLog
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
                    파티플레이 · 공용 화면 + 두 기기
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

type Highlight = {
  label: string;
  summary: string;
  tone: "score" | "out" | "special";
};

function StadiumHighlight({ events }: { events: GameEvent[] }) {
  const highlight = getStadiumHighlight(events);
  if (!highlight) return null;
  return (
    <div
      aria-live="polite"
      className="bbg-stadium-highlight"
      data-tone={highlight.tone}
      role="status"
    >
      <strong>{highlight.label}</strong>
      <span>{highlight.summary}</span>
    </div>
  );
}

function getStadiumHighlight(events: GameEvent[]): Highlight | null {
  const event =
    events.findLast((item) => item.kind === "plate_appearance") ??
    events.findLast((item) => item.kind === "card_resolve");
  if (!event) return null;
  if (event.summary.includes("홈런")) {
    return { label: "HOME RUN", summary: event.summary, tone: "score" };
  }
  if (event.summary.includes("삼중살")) {
    return { label: "TRIPLE PLAY", summary: event.summary, tone: "special" };
  }
  if (event.summary.includes("병살")) {
    return { label: "DOUBLE PLAY", summary: event.summary, tone: "special" };
  }
  if (event.summary.includes("삼진")) {
    return { label: "STRIKE OUT", summary: event.summary, tone: "out" };
  }
  if (event.runs > 0) {
    return {
      label: `SCORE +${event.runs}`,
      summary: event.summary,
      tone: "score",
    };
  }
  return null;
}

function AiTurnIndicator({ game, team }: { game: GameState; team: TeamSide }) {
  const role = roleForTeam(game, team);
  const isCardDecision = game.phase === "awaiting_card";
  return (
    <div className="bbg-ai-turn" role="status" aria-live="polite">
      <span>AI</span>
      <div>
        <strong>{teamNameFor(game, team)} 판단 중</strong>
        <p>
          {isCardDecision
            ? `${role === "offense" ? "공격" : "수비"} 전략카드를 검토하고 있습니다.`
            : game.phase === "awaiting_pitch"
              ? "스트라이크와 볼 사이에서 승부를 고르고 있습니다."
              : "스윙과 지켜보기 사이에서 판단하고 있습니다."}
        </p>
      </div>
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
    <div className="bbg-card-hands" aria-label="싱글플레이 전략카드 손패">
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
                  data-playable={playable}
                  data-tier={definition.tier}
                  disabled={!playable}
                  key={instance.instanceId}
                  onClick={() => onPlay(instance.instanceId)}
                  title={reason ?? definition.description}
                  type="button"
                >
                  <i aria-hidden="true">
                    {definition.tier === "advanced"
                      ? "PRO"
                      : definition.tier === "intermediate"
                        ? "MID"
                        : "BASIC"}
                  </i>
                  <b>{definition.id}</b>
                  <span>{definition.name}</span>
                  <small>{playable ? "사용 가능" : reason}</small>
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

function choiceFlashForAction(
  action: GameAction,
  game: GameState,
  isAi: boolean,
): ChoiceFlash | null {
  if (action.type === "SELECT_PITCH") {
    return {
      id: Date.now(),
      label: isAi ? "투수 선택 완료" : PITCH_TARGET_LABELS[action.target],
      tone: "pitch",
    };
  }
  if (action.type === "SELECT_SWING") {
    return {
      id: Date.now(),
      label: action.decision === "swing" ? "스윙" : "지켜보기",
      tone: "swing",
    };
  }
  if (action.type === "PLAY_CARD") {
    const card = Object.values(game.cards)
      .flatMap((zone) => zone.hand)
      .find((item) => item.instanceId === action.cardInstanceId);
    if (!card) return null;
    return {
      id: Date.now(),
      label: CARD_DEFINITIONS[card.cardId].name,
      tone: "card",
    };
  }
  return null;
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

type BallFlight = {
  kind: "ground" | "fly" | "line" | "contact";
  label: string;
  path: string;
  target: { x: number; y: number };
};

const RUNNER_POINTS: Record<
  RunnerOrigin | RunnerDestination,
  [number, number]
> = {
  batter: [450, 650],
  home: [450, 650],
  first: [540, 560],
  second: [450, 470],
  third: [360, 560],
  out: [450, 560],
};

function runnerPath(from: RunnerOrigin, to: RunnerDestination) {
  const [fromX, fromY] = RUNNER_POINTS[from];
  const [toX, toY] = RUNNER_POINTS[to];
  return `M${fromX} ${fromY} L${toX} ${toY}`;
}

function presentationLabel(cue: PresentationCue) {
  if (cue.type === "call") {
    return {
      ball: "BALL",
      strike: "STRIKE",
      foul: "FOUL",
      contact: "CONTACT",
    }[cue.call];
  }
  if (cue.type === "decision") return cue.result.toUpperCase();
  if (cue.type === "pitch") return `${cue.location.pitchNumber}구`;
  if (cue.type === "batted_ball") return cue.face;
  if (cue.type === "catch") return "CATCH";
  if (cue.type === "throw") return "THROW";
  return "RUN";
}

export function BaseballStadium({
  face,
  game,
}: {
  face?: DieFace;
  game: Pick<GameState, "bases" | "battingTeam" | "config" | "eventLog"> & {
    phase?: GamePhase;
    pitchDuel?: GameState["pitchDuel"] | GameView["pitchDuel"];
  };
}) {
  const occupied = [
    game.bases.first ? "1루" : null,
    game.bases.second ? "2루" : null,
    game.bases.third ? "3루" : null,
  ].filter(Boolean);
  const flight = getBallFlight(face);
  const pitchHistory = getPlateAppearancePitchHistory(game.eventLog);
  const { cue, skip } = usePresentation(game.eventLog);
  const playTrace = getActivePlayTrace(
    game.eventLog,
    game.pitchDuel,
    game.phase,
  );
  const catcherView = shouldUseCatcherView(game.phase, face);
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
      data-duel-winner={playTrace?.winner ?? undefined}
    >
      {catcherView ? (
        <CatcherPitchStage cue={cue} pitchHistory={pitchHistory} />
      ) : null}
      <svg
        aria-label={`${battingTeamName} 공격, ${baseLabel}${flight ? `, ${flight.label} 타구 표시` : ""}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        className="bbg-field-overview"
        viewBox="0 0 900 700"
      >
        <defs>
          <linearGradient id="stands" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#17283a" />
            <stop offset="1" stopColor="#07111b" />
          </linearGradient>
          <linearGradient id="grass" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#176846" />
            <stop offset="0.5" stopColor="#0f573b" />
            <stop offset="1" stopColor="#0b412e" />
          </linearGradient>
          <pattern
            height="56"
            id="mow-pattern"
            patternUnits="userSpaceOnUse"
            width="56"
            x="0"
            y="0"
          >
            <rect fill="rgba(255,255,255,.018)" height="56" width="28" />
            <rect fill="rgba(0,0,0,.028)" height="56" width="28" x="28" />
          </pattern>
          <filter id="ball-glow" height="300%" width="300%" x="-100%" y="-100%">
            <feGaussianBlur result="blur" stdDeviation="6" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect fill="url(#stands)" height="700" rx="24" width="900" />
        <path
          className="bbg-stands-ring"
          d="M42 252 Q450 -38 858 252 L830 278 Q450 14 70 278 Z"
        />
        <path
          className="bbg-warning-track"
          d="M450 664 L55 263 Q450 -24 845 263 L823 288 Q450 23 77 288 Z"
        />
        <path
          className="bbg-outfield"
          d="M450 650 L77 279 Q450 18 823 279 Z"
          fill="url(#grass)"
        />
        <path
          d="M450 650 L77 279 Q450 18 823 279 Z"
          fill="url(#mow-pattern)"
          opacity=".58"
        />
        <path className="bbg-fence" d="M77 279 Q450 18 823 279" />
        <path className="bbg-foul-line-svg" d="M450 650 L77 279" />
        <path className="bbg-foul-line-svg" d="M450 650 L823 279" />
        <path
          className="bbg-infield-dirt"
          d="M450 438 C507 443 558 491 571 548 C582 598 542 641 450 670 C358 641 318 598 329 548 C342 491 393 443 450 438 Z"
        />
        <path
          className="bbg-infield-grass"
          d="M450 470 L540 560 L450 650 L360 560 Z"
        />
        <circle className="bbg-mound-dirt" cx="450" cy="560" r="27" />
        <circle className="bbg-home-dirt" cx="450" cy="650" r="27" />

        <SvgBaseMarker
          base="second"
          label="2루"
          occupied={game.bases.second}
          x={450}
          y={470}
        />
        <SvgBaseMarker
          base="third"
          label="3루"
          occupied={game.bases.third}
          x={360}
          y={560}
        />
        <SvgBaseMarker
          base="first"
          label="1루"
          occupied={game.bases.first}
          x={540}
          y={560}
        />
        <g className="bbg-field-mound" transform="translate(450 560)">
          <ellipse rx="22" ry="10" />
          <text dy="3" textAnchor="middle">
            투수
          </text>
        </g>
        <g className="bbg-field-home" transform="translate(450 650)">
          <path d="M-10 -9 H10 V2 L0 11 L-10 2 Z" />
          <text dy="26" textAnchor="middle">
            홈
          </text>
        </g>

        {flight ? <BallFlightVisual face={face} flight={flight} /> : null}
        {cue?.type === "pitch" ? (
          <g className="bbg-pitch-flight">
            <path
              d={`M450 555 Q${430 + cue.location.x * 0.4} 600 ${438 + cue.location.x * 0.24} 650`}
            />
            <circle r="6">
              <animateMotion
                dur="420ms"
                fill="freeze"
                path={`M450 555 Q${430 + cue.location.x * 0.4} 600 ${438 + cue.location.x * 0.24} 650`}
              />
            </circle>
          </g>
        ) : null}
        {cue?.type === "throw" ? (
          <g className="bbg-throw-cue">
            <path d={`M${cue.from.x} ${cue.from.y} L${cue.to.x} ${cue.to.y}`} />
            <circle cx={cue.to.x} cy={cue.to.y} r="7" />
          </g>
        ) : null}
        {cue?.type === "runner_move" ? (
          <path
            className="bbg-runner-cue"
            d={runnerPath(cue.move.from, cue.move.to)}
          />
        ) : null}
      </svg>
      {!catcherView ? (
        <div className="bbg-strike-zone" aria-label="투구 위치">
          <span className="bbg-strike-zone-label">PITCH MAP</span>
          <div aria-hidden="true" className="bbg-zone-grid" />
          <PitchMarkers pitchHistory={pitchHistory} />
        </div>
      ) : null}
      {playTrace ? (
        <BaseballPlayTrace
          key={playTrace.key}
          phase={game.phase}
          trace={playTrace}
        />
      ) : null}
      {cue ? (
        <button
          aria-label="현재 연출 빠르게 넘기기"
          className="bbg-presentation-cue"
          data-cue={cue.type}
          onClick={skip}
          type="button"
        >
          {presentationLabel(cue)}
        </button>
      ) : null}
    </div>
  );
}

type ActivePlayTrace = {
  key: string;
  pitcherChoice: string;
  batterChoice: string;
  cards: string;
  cardUsed: boolean;
  result: string | null;
  winner: "batter" | "pitcher" | null;
};

function getActivePlayTrace(
  events: GameEvent[],
  pitchDuel: GameState["pitchDuel"] | GameView["pitchDuel"] | undefined,
  phase: GamePhase | undefined,
): ActivePlayTrace | null {
  const commitIndex = events.findLastIndex(
    (event) => event.kind === "pitch_commit",
  );
  const resultIndex = events.findLastIndex(
    (event) => event.kind === "pitch_result",
  );
  const focusIndex = Math.max(commitIndex, resultIndex);
  const boundaryIndex = events.findLastIndex(
    (event, index) =>
      index < focusIndex &&
      (event.kind === "pitch_result" || event.kind === "plate_appearance"),
  );
  const segment = events.slice(boundaryIndex + 1);
  const commit = segment.findLast((event) => event.kind === "pitch_commit");
  const reveal = segment.findLast((event) => event.kind === "pitch_result");
  const cardEvents = segment.filter(
    (event) => event.kind === "card_play" && event.cardId,
  );

  if (!commit && !reveal && cardEvents.length === 0) return null;

  const visiblePitch = reveal?.pitchTarget ?? pitchDuel?.pitcherChoice;
  const cardNames = cardEvents.map(
    (event) => CARD_DEFINITIONS[event.cardId!].name,
  );
  const uniqueCardNames = [...new Set(cardNames)];
  const cardSummary = uniqueCardNames.length
    ? `${uniqueCardNames.slice(0, 2).join(" · ")}${uniqueCardNames.length > 2 ? ` +${uniqueCardNames.length - 2}` : ""}`
    : phase === "awaiting_card"
      ? "선택 중"
      : segment.some((event) => event.kind === "card_pass")
        ? "사용 안 함"
        : "개입 없음";
  const lastEvent = segment.at(-1);

  return {
    key: `${commit?.sequence ?? reveal?.sequence ?? "card"}-${lastEvent?.sequence ?? 0}`,
    pitcherChoice: visiblePitch
      ? PITCH_TARGET_LABELS[visiblePitch]
      : "선택 완료",
    batterChoice: reveal?.swingDecision
      ? reveal.swingDecision === "swing"
        ? "스윙"
        : "지켜보기"
      : phase === "awaiting_swing"
        ? "판단 중"
        : "선택 대기",
    cards: cardSummary,
    cardUsed: cardEvents.length > 0,
    result: reveal?.face ? FACE_LABELS[reveal.face] : null,
    winner: reveal?.duelWinner ?? null,
  };
}

function BaseballPlayTrace({
  phase,
  trace,
}: {
  phase: GamePhase | undefined;
  trace: ActivePlayTrace;
}) {
  const completed = Boolean(trace.result);
  return (
    <section
      aria-label="이번 승부 선택 기록"
      className="bbg-play-trace"
      data-completed={completed}
      data-winner={trace.winner ?? "pending"}
    >
      <div className="bbg-play-trace-choice is-pitcher">
        <small>투수</small>
        <strong>{trace.pitcherChoice}</strong>
      </div>
      <i aria-hidden="true" className="bbg-play-trace-link" />
      <div className="bbg-play-trace-choice is-batter">
        <small>타자</small>
        <strong>{trace.batterChoice}</strong>
      </div>
      <div className="bbg-play-trace-card" data-used={trace.cardUsed}>
        <small>카드</small>
        <strong>{trace.cards}</strong>
      </div>
      {trace.result ? (
        <p className="bbg-play-trace-result">
          <b>{trace.winner === "batter" ? "타자가 읽었다" : "투수가 잡았다"}</b>
          <span>{trace.result}</span>
        </p>
      ) : (
        <p className="bbg-play-trace-result is-pending">
          <b>
            {phase === "awaiting_swing" ? "타자 선택 대기" : "승부 진행 중"}
          </b>
        </p>
      )}
    </section>
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
      {location.pitchNumber}
    </i>
  ));
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
  return (
    <div
      aria-label="포수 시점 스트라이크존"
      className="bbg-catcher-view"
      role="img"
    >
      <svg
        aria-hidden="true"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 900 700"
      >
        <defs>
          <radialGradient id="catcher-sky" cx="50%" cy="30%" r="76%">
            <stop offset="0" stopColor="#23435c" />
            <stop offset="0.54" stopColor="#10283a" />
            <stop offset="1" stopColor="#06111b" />
          </radialGradient>
          <linearGradient id="catcher-dirt" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#92623f" />
            <stop offset="1" stopColor="#4c3024" />
          </linearGradient>
        </defs>
        <rect fill="url(#catcher-sky)" height="700" width="900" />
        <path
          className="bbg-catcher-stands"
          d="M0 245 Q450 105 900 245 V355 Q450 225 0 355 Z"
        />
        <path
          className="bbg-catcher-grass"
          d="M0 330 Q450 230 900 330 V700 H0 Z"
        />
        <path fill="url(#catcher-dirt)" d="M0 540 Q450 270 900 540 V700 H0 Z" />
        <ellipse
          className="bbg-catcher-mound"
          cx="450"
          cy="310"
          rx="75"
          ry="18"
        />
        <g className="bbg-catcher-pitcher" transform="translate(450 274)">
          <circle cy="-28" r="13" />
          <path d="M-13 -13 Q0 -24 13 -13 L18 26 L7 52 H-7 L-18 26 Z" />
          <path d="M-9 48 L-28 92 M9 48 L28 92" />
        </g>
        <g className="bbg-catcher-batter" transform="translate(675 425)">
          <circle cy="-92" r="24" />
          <path d="M-26 -65 Q4 -82 28 -54 L40 60 H-22 Z" />
          <path d="M-9 55 L-35 164 M25 54 L54 164" />
          <path className="bbg-catcher-bat" d="M-8 -48 L80 -145" />
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
    x: 340 + location.x * 2.2,
    y: 350 + location.y * 2.25,
  };
}

function BallFlightVisual({
  face,
  flight,
}: {
  face?: DieFace;
  flight: BallFlight;
}) {
  return (
    <g
      aria-label={`${face ?? ""} ${flight.label} 타구 궤적`}
      className="bbg-ball-flight"
      data-kind={flight.kind}
      role="img"
    >
      <path className="bbg-ball-trail-shadow" d={flight.path} />
      <path className="bbg-ball-trail" d={flight.path} />
      <circle
        className="bbg-ball-landing"
        cx={flight.target.x}
        cy={flight.target.y}
        r="18"
      />
      <circle className="bbg-live-ball" filter="url(#ball-glow)" r="7">
        <animateMotion dur="850ms" fill="freeze" path={flight.path} />
      </circle>
      <g
        className="bbg-flight-label"
        transform={`translate(${flight.target.x} ${flight.target.y - 27})`}
      >
        <rect height="29" rx="14" width="112" x="-56" y="-17" />
        <text dy="2" textAnchor="middle">
          {flight.label}
        </text>
      </g>
    </g>
  );
}

function getBallFlight(face?: DieFace): BallFlight | null {
  if (!face) return null;
  const flights: Partial<Record<DieFace, BallFlight>> = {
    C: {
      kind: "contact",
      label: "컨택",
      path: "M450 560 Q450 605 450 650",
      target: { x: 450, y: 650 },
    },
    GF: {
      kind: "ground",
      label: "1루 땅볼",
      path: "M450 650 Q495 605 540 560",
      target: { x: 540, y: 560 },
    },
    G3: {
      kind: "ground",
      label: "3루 땅볼",
      path: "M450 650 Q405 605 360 560",
      target: { x: 360, y: 560 },
    },
    GA: {
      kind: "ground",
      label: "유격수 땅볼",
      path: "M450 650 Q425 580 400 510",
      target: { x: 400, y: 510 },
    },
    PO: {
      kind: "fly",
      label: "내야 뜬공",
      path: "M450 650 Q398 515 445 490",
      target: { x: 445, y: 490 },
    },
    FO: {
      kind: "fly",
      label: "외야 뜬공",
      path: "M450 650 Q520 430 525 350",
      target: { x: 525, y: 350 },
    },
    F2: {
      kind: "fly",
      label: "좌익수 뜬공",
      path: "M450 650 Q320 430 230 330",
      target: { x: 230, y: 330 },
    },
    F3: {
      kind: "fly",
      label: "중견수 뜬공",
      path: "M450 650 Q450 420 450 250",
      target: { x: 450, y: 250 },
    },
    FA: {
      kind: "fly",
      label: "우익수 뜬공",
      path: "M450 650 Q580 430 670 330",
      target: { x: 670, y: 330 },
    },
    HIT: {
      kind: "line",
      label: "안타 방향 판정",
      path: "M450 650 Q450 440 450 320",
      target: { x: 450, y: 320 },
    },
    HR: {
      kind: "fly",
      label: "HOME RUN",
      path: "M450 650 Q530 350 490 60",
      target: { x: 490, y: 60 },
    },
    IH: {
      kind: "ground",
      label: "내야 안타",
      path: "M450 650 Q470 590 490 530",
      target: { x: 490, y: 530 },
    },
    L1: {
      kind: "line",
      label: "좌전 안타",
      path: "M450 650 Q345 485 270 390",
      target: { x: 270, y: 390 },
    },
    L2: {
      kind: "line",
      label: "좌중간 안타",
      path: "M450 650 Q350 400 300 275",
      target: { x: 300, y: 275 },
    },
    C1: {
      kind: "line",
      label: "중전 안타",
      path: "M450 650 Q450 470 450 370",
      target: { x: 450, y: 370 },
    },
    C2: {
      kind: "line",
      label: "중견수 앞 안타",
      path: "M450 650 Q450 410 450 290",
      target: { x: 450, y: 290 },
    },
    R1: {
      kind: "line",
      label: "우전 안타",
      path: "M450 650 Q555 485 630 390",
      target: { x: 630, y: 390 },
    },
    R2: {
      kind: "line",
      label: "우중간 안타",
      path: "M450 650 Q550 400 600 275",
      target: { x: 600, y: 275 },
    },
    D2: {
      kind: "fly",
      label: "좌중간 2루타",
      path: "M450 650 Q310 390 200 260",
      target: { x: 200, y: 260 },
    },
    D3: {
      kind: "fly",
      label: "중앙 펜스 2루타",
      path: "M450 650 Q450 340 450 180",
      target: { x: 450, y: 180 },
    },
    T3: {
      kind: "fly",
      label: "우중간 3루타",
      path: "M450 650 Q590 390 700 260",
      target: { x: 700, y: 260 },
    },
  };
  return flights[face] ?? null;
}

function SvgBaseMarker({
  base,
  label,
  occupied,
  x,
  y,
}: {
  base: "first" | "second" | "third";
  label: string;
  occupied: boolean;
  x: number;
  y: number;
}) {
  return (
    <g
      aria-hidden="true"
      className={`bbg-field-base bbg-field-base--${base}`}
      data-occupied={occupied}
      key={`${base}-${occupied}`}
      transform={`translate(${x} ${y})`}
    >
      <rect
        height="18"
        rx="2"
        transform="rotate(45)"
        width="18"
        x="-9"
        y="-9"
      />
      {occupied ? <circle className="bbg-runner-dot" cy="-1" r="5" /> : null}
      <text dy="27" textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

function PlayResult({
  events,
  game,
}: {
  events: GameEvent[];
  game: GameState;
}) {
  const event =
    events.findLast((item) => item.kind === "game_end") ??
    events.findLast((item) => item.kind === "plate_appearance") ??
    events.findLast((item) => item.kind === "count") ??
    events.findLast((item) => item.kind === "half_inning") ??
    events.at(-1);
  const sideChange = events.some((item) => item.kind === "half_inning");
  const tone = !event
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
          {!event
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
        <h2>{event?.summary ?? "첫 투구를 준비하세요"}</h2>
        <div className="bbg-impact-list">
          {event?.runs ? <b className="is-score">+{event.runs}점</b> : null}
          {event?.outsRecorded ? (
            <b className="is-out">+{event.outsRecorded}아웃</b>
          ) : null}
          {sideChange ? <b className="is-change">공수 교대</b> : null}
          {event?.kind === "count" ? (
            <b className="is-count">
              B {game.balls} · S {game.strikes}
            </b>
          ) : null}
        </div>
      </div>
      <div className="bbg-result-side">
        <div className="bbg-move-list">
          {event?.moves.length
            ? event.moves.map((move, index) => (
                <span key={`${move.runner}-${move.to}-${index}`}>
                  {formatRunner(move.from)}
                  <ArrowRight aria-hidden="true" size={14} />
                  <strong>{formatDestination(move.to)}</strong>
                </span>
              ))
            : null}
        </div>
        <p className="bbg-next-play">
          <span>NEXT</span>
          <strong>{formatNextPlay(event, game, sideChange)}</strong>
        </p>
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

function formatRunner(origin: "batter" | "first" | "second" | "third") {
  if (origin === "batter") return "타자";
  return `${origin === "first" ? "1" : origin === "second" ? "2" : "3"}루 주자`;
}

function formatDestination(
  destination: "first" | "second" | "third" | "home" | "out",
) {
  if (destination === "home") return "홈인";
  if (destination === "out") return "아웃";
  return `${destination === "first" ? "1" : destination === "second" ? "2" : "3"}루`;
}

function formatNextPlay(
  event: GameEvent | undefined,
  game: GameState,
  sideChange: boolean,
) {
  if (!event) return "경기 시작 대기";
  if (game.phase === "finished") return "경기 종료";
  if (game.phase !== "awaiting_pitch") return PHASE_TITLE[game.phase];
  if (sideChange) {
    const teamName =
      game.config[
        game.battingTeam === "away" ? "awayTeamName" : "homeTeamName"
      ];
    return `${teamName} 첫 타자에게 투구`;
  }
  return event.kind === "count"
    ? "같은 타자에게 다음 투구"
    : "다음 타자에게 투구";
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
