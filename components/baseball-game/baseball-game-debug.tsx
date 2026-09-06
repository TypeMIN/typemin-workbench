"use client";

import { ArrowRight, Dices, House, Layers3, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { WorkbenchAccountControl } from "@/components/workbench-account-control";
import { chooseAiAction } from "@/lib/baseball-game/ai";
import { CARD_DEFINITIONS } from "@/lib/baseball-game/cards";
import {
  createGame,
  getActionOwner,
  getLegalCards,
  transition,
} from "@/lib/baseball-game/engine";
import {
  DIE_FACES,
  DIE_LABELS,
  FACE_LABELS,
  rollDie,
} from "@/lib/baseball-game/rules";
import type {
  BattingFace,
  CardAvailability,
  CardRole,
  DieFace,
  DieKind,
  GameAction,
  GameConfig,
  GameEvent,
  GamePhase,
  GameState,
  HitFace,
  PitchFace,
  ScheduledInnings,
  TeamSide,
} from "@/lib/baseball-game/types";

const DEFAULT_CONFIG: GameConfig = {
  innings: 3,
  awayTeamName: "원정팀",
  homeTeamName: "홈팀",
};

type PlayMode = "solo_ai" | "local_two_player" | "multiplayer";

type SessionConfig = {
  mode: PlayMode;
  humanTeam: TeamSide;
};

const DEFAULT_SESSION: SessionConfig = {
  mode: "local_two_player",
  humanTeam: "away",
};

const AI_TURN_DELAY_MS = 650;

const PHASE_DIE: Partial<Record<GamePhase, DieKind>> = {
  awaiting_pitch: "pitch",
  awaiting_batting: "batting",
  awaiting_hit: "hit",
};

const PHASE_COPY: Record<GamePhase, string> = {
  awaiting_pitch:
    "투구 결과를 정합니다. 볼·스트라이크 또는 컨택으로 이어집니다.",
  awaiting_batting:
    "공이 배트에 맞았습니다. 아웃·안타·홈런 중 타구 결과를 정합니다.",
  awaiting_hit: "안타성 타구입니다. 타구 방향과 모든 주자의 진루를 정합니다.",
  awaiting_card: "사용할 전략카드를 고르거나 카드 없이 진행하세요.",
  finished: "경기가 종료되었습니다.",
};

const PHASE_TITLE: Record<GamePhase, string> = {
  awaiting_pitch: "투구할 차례",
  awaiting_batting: "타격 결과를 정할 차례",
  awaiting_hit: "안타 결과를 정할 차례",
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
  const [acknowledgedInterlude, setAcknowledgedInterlude] = useState<
    number | null
  >(null);
  const currentDie = PHASE_DIE[game.phase] ?? null;
  const currentFaces = currentDie ? DIE_FACES[currentDie] : [];
  const currentRevisionEvents = game.eventLog.filter(
    (event) => event.revision === game.revision,
  );
  const lastRoll = game.eventLog.findLast((event) => event.kind === "die_roll");
  const actionOwner = getActionOwner(game);
  const aiTeam =
    session.mode === "solo_ai" ? oppositeTeam(session.humanTeam) : null;
  const actionOwnerLabel = actionOwner
    ? `${game.config[actionOwner === "away" ? "awayTeamName" : "homeTeamName"]} ${actionOwner === game.battingTeam ? "공격" : "수비"}`
    : "경기 종료";
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
    if (!isAiTurn || !aiTeam || modalOpen) return;
    const action = chooseAiAction(game, aiTeam);
    if (!action) return;

    const timer = window.setTimeout(() => {
      const result = transition(game, action);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setGame(result.state);
    }, AI_TURN_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [aiTeam, game, isAiTurn, modalOpen]);

  function dispatchResult(kind: DieKind, face: DieFace) {
    const action = actionFor(kind, face);
    const result = transition(game, action);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setGame(result.state);
  }

  function dispatchAction(action: GameAction) {
    const result = transition(game, action);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setGame(result.state);
  }

  function rollCurrentDie() {
    if (!currentDie) return;
    dispatchResult(currentDie, rollDie(currentDie));
  }

  async function startGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftSession.mode === "multiplayer") {
      const roomCode = multiplayerCode.trim().toUpperCase();
      if (roomCode) {
        if (!/^[A-Z2-9]{6}$/.test(roomCode)) {
          setError("방 코드는 영문과 숫자 6자리입니다.");
          return;
        }
        router.push(`/baseball-game/rooms/${roomCode}`);
        return;
      }

      setCreatingRoom(true);
      setError(null);
      try {
        const response = await fetch("/api/baseball-game/rooms", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ config: draft }),
        });
        const payload = (await response.json()) as {
          roomUrl?: string;
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
    setAcknowledgedInterlude(null);
    setupDetailsRef.current?.removeAttribute("open");
  }

  function restartGame() {
    setGame(createGame(game.config, { seed: createRandomSeed() }));
    setDraft(game.config);
    setDraftSession(session);
    setError(null);
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
            <small>
              PRO-CARDS-V1 ·{" "}
              {session.mode === "solo_ai" ? "SOLO AI" : "LOCAL 2P"}
            </small>
          </span>
        </Link>
        <div className="bbg-topbar-side">
          <button
            aria-label={`게임 모드 변경, 현재 ${
              session.mode === "solo_ai"
                ? `AI 대전 ${teamNameFor(game, session.humanTeam)}`
                : "로컬 2인"
            }`}
            className="bbg-local-badge"
            onClick={openGameSetup}
            type="button"
          >
            {session.mode === "solo_ai"
              ? `AI 대전 · ${teamNameFor(game, session.humanTeam)}`
              : "로컬 2인"}
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
              </div>

              <div className="bbg-field-content">
                <BaseballStadium
                  face={lastRoll?.face}
                  game={game}
                  key={`field-${game.revision}`}
                />
                <StadiumHighlight
                  events={currentRevisionEvents}
                  key={`highlight-${game.revision}`}
                />
              </div>

              <PlayResult
                events={currentRevisionEvents}
                face={lastRoll?.face}
                game={game}
                key={game.revision}
              />
            </div>
          </section>

          <section
            className="bbg-control-panel bbg-control-panel--broadcast"
            aria-labelledby="control-heading"
          >
            <div className="bbg-panel-heading">
              <div>
                <p>ON DECK</p>
                <h2 id="control-heading">현재 판정</h2>
              </div>
              {currentDie ? <span>D12 · {DIE_LABELS[currentDie]}</span> : null}
            </div>

            <div className="bbg-phase-copy" aria-live="polite">
              <span>NOW</span>
              <strong>
                {game.phase === "finished" ? "경기 종료" : actionOwnerLabel}
              </strong>
              <p>{PHASE_TITLE[game.phase]}</p>
            </div>

            <GameProgress game={game} />

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
            ) : currentDie ? (
              <QuickRollButton
                actionOwnerLabel={actionOwnerLabel}
                currentDie={currentDie}
                face={lastRoll?.face}
                key={`${game.revision}-${currentDie}`}
                onRoll={rollCurrentDie}
              />
            ) : null}

            <p className="bbg-die-help">{PHASE_COPY[game.phase]}</p>

            <CardHands
              game={game}
              viewer={cardViewer}
              onPlay={(cardInstanceId) =>
                dispatchAction({ type: "PLAY_CARD", cardInstanceId })
              }
            />

            {game.phase !== "finished" && !isAiTurn ? (
              <details className="bbg-force-panel">
                <summary>특정 면 강제 입력</summary>
                <div className="bbg-face-grid">
                  {currentFaces.map((face, index) => (
                    <button
                      aria-label={`${index + 1}번 면 ${face} ${FACE_LABELS[face]}`}
                      key={`${face}-${index}`}
                      onClick={() =>
                        currentDie && dispatchResult(currentDie, face)
                      }
                      type="button"
                    >
                      <small>{String(index + 1).padStart(2, "0")}</small>
                      <strong>{face}</strong>
                      <span>{FACE_LABELS[face]}</span>
                    </button>
                  ))}
                </div>
              </details>
            ) : null}

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
                  <option value="local_two_player">로컬 2인 · 한 기기</option>
                  <option value="multiplayer">멀티플레이 · 두 기기</option>
                  <option disabled>파티플레이 · 준비 중</option>
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
              {draftSession.mode === "multiplayer" ? (
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
                    placeholder="비우면 새 방 생성"
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
            : `${DIE_LABELS[PHASE_DIE[game.phase] ?? "pitch"]} 주사위를 굴립니다.`}
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
        <p>{describeCardWindow(game)} 사용할 카드를 누르면 즉시 적용됩니다.</p>
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
    <div className="bbg-card-hands" aria-label="한 기기 전략카드 손패">
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

function GameProgress({ game }: { game: GameState }) {
  const active =
    game.phase === "awaiting_card"
      ? game.pendingResolution?.kind === "hit"
        ? "hit"
        : game.pendingResolution?.kind === "batting"
          ? "batting"
          : game.pendingResolution?.kind === "contact"
            ? "batting"
            : "pitch"
      : game.phase === "awaiting_hit"
        ? "hit"
        : game.phase === "awaiting_batting"
          ? "batting"
          : game.phase === "finished"
            ? "finished"
            : "pitch";
  const steps = [
    ["pitch", "투구"],
    ["batting", "타구"],
    ["hit", "안타"],
    ["finished", "종료"],
  ] as const;
  return (
    <div
      className="bbg-game-progress"
      aria-label={`현재 진행 단계 ${steps.find(([key]) => key === active)?.[1]}`}
    >
      {steps.map(([key, label], index) => (
        <span data-active={key === active} key={key}>
          <b>{index + 1}</b>
          {label}
        </span>
      ))}
      {game.activeStrategy ? (
        <strong>{game.activeStrategy.cardId} 진행 중</strong>
      ) : null}
    </div>
  );
}

function describeCardWindow(game: GameState) {
  const respondingTo = game.cardWindow?.respondingTo;
  if (respondingTo) {
    return `${CARD_DEFINITIONS[respondingTo.cardId].name}에 대응할 차례입니다.`;
  }
  const timing = game.cardWindow?.timing;
  const copy: Partial<Record<NonNullable<typeof timing>, string>> = {
    before_pitch: "투구 전에 작전을 결정합니다.",
    after_pitch: "방금 투구 결과에 개입할 수 있습니다.",
    after_contact: "컨택 뒤 번트 작전을 결정합니다.",
    after_batting: "타구 판정을 바꿀 수 있습니다.",
    after_hit: "안타와 주자 진루 판정을 바꿀 수 있습니다.",
  };
  return timing
    ? (copy[timing] ?? "전략카드를 결정합니다.")
    : "전략카드를 결정합니다.";
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

function actionFor(kind: DieKind, face: DieFace): GameAction {
  if (kind === "pitch")
    return { type: "PITCH_RESULT", face: face as PitchFace };
  if (kind === "batting")
    return { type: "BATTING_RESULT", face: face as BattingFace };
  return { type: "HIT_RESULT", face: face as HitFace };
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
        <TeamScore game={game} side="away" />
        <TeamScore game={game} side="home" />
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

function TeamScore({ game, side }: { game: GameState; side: "away" | "home" }) {
  const isBatting = game.battingTeam === side && game.phase !== "finished";
  return (
    <div
      className={["bbg-team-score", isBatting && "is-batting"]
        .filter(Boolean)
        .join(" ")}
    >
      <span>{side === "away" ? "원정" : "홈"}</span>
      <strong>
        {game.config[side === "away" ? "awayTeamName" : "homeTeamName"]}
      </strong>
      <b key={game.score[side]}>{game.score[side]}</b>
    </div>
  );
}

type BallFlight = {
  kind: "ground" | "fly" | "line" | "contact";
  label: string;
  path: string;
  target: { x: number; y: number };
};

export function BaseballStadium({
  face,
  game,
}: {
  face?: DieFace;
  game: Pick<GameState, "bases" | "battingTeam" | "config">;
}) {
  const occupied = [
    game.bases.first ? "1루" : null,
    game.bases.second ? "2루" : null,
    game.bases.third ? "3루" : null,
  ].filter(Boolean);
  const flight = getBallFlight(face);
  const battingTeamName =
    game.config[game.battingTeam === "away" ? "awayTeamName" : "homeTeamName"];
  const baseLabel = occupied.length
    ? `${occupied.join(", ")} 주자 있음`
    : "주자 없음";

  return (
    <div
      aria-label={`${battingTeamName} 공격, ${baseLabel}${flight ? `, ${flight.label} 타구 표시` : ""}`}
      className="bbg-diamond bbg-stadium"
      role="img"
    >
      <svg
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
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
      </svg>
    </div>
  );
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
  face,
  game,
}: {
  events: GameEvent[];
  face?: DieFace;
  game: GameState;
}) {
  const event =
    events.findLast((item) => item.kind === "game_end") ??
    events.findLast((item) => item.kind === "plate_appearance") ??
    events.findLast((item) => item.kind === "count") ??
    events.findLast((item) => item.kind === "half_inning") ??
    events.at(-1);
  const sideChange = events.some((item) => item.kind === "half_inning");
  const lastDieIndex = game.eventLog.findLastIndex(
    (item) => item.kind === "die_roll",
  );
  const cardChain = game.eventLog
    .slice(lastDieIndex + 1)
    .filter((item) => item.kind === "card_play")
    .slice(-4);
  const resolutionChain = events
    .filter((item) =>
      ["card_play", "card_resolve", "rule", "plate_appearance"].includes(
        item.kind,
      ),
    )
    .slice(-4);
  const displayToken = event?.cardId ?? face;
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
        <small>{event?.cardId ? "CARD" : face ? "D12" : "NEXT"}</small>
        <strong>{displayToken ?? "▶"}</strong>
      </div>
      <div className="bbg-result-copy">
        <span>{event ? "방금 판정" : "PLAY BALL"}</span>
        <h2>{event?.summary ?? "첫 투구를 준비하세요"}</h2>
        <p>
          {event?.cardId
            ? CARD_DEFINITIONS[event.cardId].description
            : face
              ? `${face} · ${FACE_LABELS[face]}`
              : "투구 주사위부터 경기 흐름을 시작합니다."}
        </p>
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
          {cardChain.map((cardEvent) =>
            cardEvent.cardId ? (
              <b className="is-card" key={cardEvent.sequence}>
                {cardEvent.cardId}
              </b>
            ) : null,
          )}
        </div>
        {resolutionChain.length > 1 ? (
          <ol className="bbg-resolution-chain" aria-label="이번 판정 진행 순서">
            {resolutionChain.map((item, index) => (
              <li key={item.sequence}>
                <b>{index + 1}</b>
                <span>{item.summary}</span>
              </li>
            ))}
          </ol>
        ) : null}
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

function QuickRollButton({
  actionOwnerLabel,
  currentDie,
  face,
  onRoll,
}: {
  actionOwnerLabel: string;
  currentDie: DieKind;
  face?: DieFace;
  onRoll: () => void;
}) {
  return (
    <button
      aria-label={`${DIE_LABELS[currentDie]} 주사위 굴리기`}
      className="bbg-d12-button"
      onClick={onRoll}
      type="button"
    >
      <span className="bbg-d12" aria-hidden="true">
        <i className="bbg-d12-facet bbg-d12-facet--one" />
        <i className="bbg-d12-facet bbg-d12-facet--two" />
        <i className="bbg-d12-facet bbg-d12-facet--three" />
        <i className="bbg-d12-facet bbg-d12-facet--four" />
        <small>D12</small>
        <strong>{face ?? "?"}</strong>
      </span>
      <span className="bbg-roll-caption">
        <small>{actionOwnerLabel}</small>
        <strong>
          <Dices aria-hidden="true" size={18} />
          {DIE_LABELS[currentDie]} 주사위 굴리기
        </strong>
      </span>
    </button>
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
