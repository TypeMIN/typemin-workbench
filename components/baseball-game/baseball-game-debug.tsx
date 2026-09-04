"use client";

import { ArrowRight, Dices, House, Radio, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { WorkbenchAccountControl } from "@/components/workbench-account-control";
import { createGame, transition } from "@/lib/baseball-game/engine";
import {
  DIE_FACES,
  DIE_LABELS,
  FACE_LABELS,
  rollDie,
} from "@/lib/baseball-game/rules";
import type {
  BattingFace,
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
} from "@/lib/baseball-game/types";

const DEFAULT_CONFIG: GameConfig = {
  innings: 3,
  awayTeamName: "원정팀",
  homeTeamName: "홈팀",
};

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
  finished: "경기가 종료되었습니다.",
};

const PHASE_TITLE: Record<GamePhase, string> = {
  awaiting_pitch: "투구할 차례",
  awaiting_batting: "타격 결과를 정할 차례",
  awaiting_hit: "안타 결과를 정할 차례",
  finished: "경기 종료",
};

export default function BaseballGameDebug() {
  const setupDetailsRef = useRef<HTMLDetailsElement>(null);
  const [draft, setDraft] = useState<GameConfig>(DEFAULT_CONFIG);
  const [game, setGame] = useState(() => createGame(DEFAULT_CONFIG));
  const [error, setError] = useState<string | null>(null);
  const currentDie = PHASE_DIE[game.phase] ?? null;
  const currentFaces = currentDie ? DIE_FACES[currentDie] : [];
  const currentRevisionEvents = game.eventLog.filter(
    (event) => event.revision === game.revision,
  );
  const lastRoll = currentRevisionEvents.find(
    (event) => event.kind === "die_roll",
  );
  const battingTeamName =
    game.config[game.battingTeam === "away" ? "awayTeamName" : "homeTeamName"];
  const fieldingTeamName =
    game.config[game.battingTeam === "away" ? "homeTeamName" : "awayTeamName"];
  const actionOwnerLabel =
    game.phase === "awaiting_pitch"
      ? `${fieldingTeamName} 수비`
      : `${battingTeamName} 공격`;

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

  function rollCurrentDie() {
    if (!currentDie) return;
    dispatchResult(currentDie, rollDie(currentDie));
  }

  function startGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGame(createGame(draft));
    setError(null);
    setupDetailsRef.current?.removeAttribute("open");
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
            <small>CORE-V1 · LOCAL DEBUG</small>
          </span>
        </Link>
        <div className="bbg-topbar-side">
          <span className="bbg-local-badge">브라우저에서만 진행</span>
          <WorkbenchAccountControl />
        </div>
      </header>

      <main className="bbg-main">
        <div className="bbg-game-console">
          <section
            className="bbg-field-panel bbg-broadcast-field"
            aria-labelledby="field-heading"
          >
            <div className="bbg-broadcast-stage">
              <div className="bbg-broadcast-heading">
                <div>
                  <span>
                    <Radio aria-hidden="true" size={13} /> LIVE
                  </span>
                  <h1 id="field-heading">야구 게임 라이브</h1>
                </div>
                <p>
                  {game.config.innings}이닝 경기 · {game.rulesetVersion} · REV{" "}
                  {game.revision}
                </p>
              </div>

              <div className="bbg-field-content">
                <BaseballStadium
                  face={lastRoll?.face}
                  game={game}
                  key={`field-${game.revision}`}
                />
                <OffenseIndicator
                  battingTeamName={battingTeamName}
                  fieldingTeamName={fieldingTeamName}
                  game={game}
                  key={`${game.inning}-${game.half}-${game.battingTeam}`}
                />
                <BroadcastScoreboard game={game} />
                <aside className="bbg-broadcast-situation" aria-live="polite">
                  <span>NOW AT BAT</span>
                  <strong>{battingTeamName}</strong>
                  <small>
                    {game.battingTeam === "away" ? "원정팀" : "홈팀"} 공격
                  </small>
                  <div className="bbg-situation-facts">
                    <p>
                      <span>이닝</span>
                      <strong>
                        {game.inning}회{game.half === "top" ? "초" : "말"}
                      </strong>
                    </p>
                    <p>
                      <span>아웃</span>
                      <strong>{formatOuts(game.outs)}</strong>
                    </p>
                    <p>
                      <span>주자</span>
                      <strong>{formatBases(game)}</strong>
                    </p>
                  </div>
                  <p className="bbg-situation-count">
                    <span>볼 {game.balls}</span>
                    <span>스트라이크 {game.strikes}</span>
                  </p>
                  <PhaseStepper phase={game.phase} />
                </aside>
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

            {game.phase !== "finished" ? (
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
              <button type="submit">
                <RotateCcw aria-hidden="true" size={17} />새 경기 시작
              </button>
            </form>
          </details>
        </div>
      </main>
    </div>
  );
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
      <div className="bbg-inning-block" aria-label="현재 이닝">
        <span aria-hidden="true">{game.half === "top" ? "▲" : "▼"}</span>
        <strong>{game.inning}</strong>
        <small>회</small>
        <b>{game.half === "top" ? "초" : "말"}</b>
        {game.inning > game.config.innings ? <em>연장</em> : null}
      </div>
      <div className="bbg-counts bbg-broadcast-counts" aria-label="현재 카운트">
        <CountRow
          label="B"
          name="볼"
          active={game.balls}
          total={3}
          tone="ball"
        />
        <CountRow
          label="S"
          name="스트라이크"
          active={game.strikes}
          total={2}
          tone="strike"
        />
        <CountRow
          label="O"
          name="아웃"
          active={game.outs}
          total={2}
          tone="out"
        />
      </div>
      <BroadcastBases game={game} />
    </section>
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
      <small>{formatBases(game)}</small>
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
      <span>{side === "away" ? "AWAY" : "HOME"}</span>
      <strong>
        {game.config[side === "away" ? "awayTeamName" : "homeTeamName"]}
      </strong>
      <b key={game.score[side]}>{game.score[side]}</b>
    </div>
  );
}

function OffenseIndicator({
  battingTeamName,
  fieldingTeamName,
  game,
}: {
  battingTeamName: string;
  fieldingTeamName: string;
  game: GameState;
}) {
  return (
    <div
      aria-label={`${battingTeamName} 공격 중`}
      className="bbg-offense-indicator"
      data-team={game.battingTeam}
    >
      <span>
        {game.half === "top" ? "▲" : "▼"} {game.inning}회
        {game.half === "top" ? "초" : "말"}
      </span>
      <strong>{battingTeamName} 공격</strong>
      <small>{fieldingTeamName} 수비</small>
    </div>
  );
}

type BallFlight = {
  kind: "ground" | "fly" | "line" | "contact";
  label: string;
  path: string;
  target: { x: number; y: number };
};

function BaseballStadium({ face, game }: { face?: DieFace; game: GameState }) {
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
      <svg aria-hidden="true" viewBox="0 0 900 650">
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
            height="64"
            id="mow-pattern"
            patternUnits="userSpaceOnUse"
            width="64"
            x="0"
            y="0"
          >
            <rect fill="rgba(255,255,255,.018)" height="64" width="32" />
            <rect fill="rgba(0,0,0,.035)" height="64" width="32" x="32" />
          </pattern>
          <filter id="ball-glow" height="300%" width="300%" x="-100%" y="-100%">
            <feGaussianBlur result="blur" stdDeviation="6" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect fill="url(#stands)" height="650" rx="30" width="900" />
        <path
          className="bbg-stands-ring"
          d="M35 80 Q450 -62 865 80 L830 130 Q450 8 70 130 Z"
        />
        <path
          className="bbg-warning-track"
          d="M450 610 L48 92 Q450 -48 852 92 Z"
        />
        <path
          className="bbg-outfield"
          d="M450 590 L76 105 Q450 -18 824 105 Z"
          fill="url(#grass)"
        />
        <path
          d="M450 590 L76 105 Q450 -18 824 105 Z"
          fill="url(#mow-pattern)"
          opacity=".72"
        />
        <path className="bbg-fence" d="M76 105 Q450 -18 824 105" />
        <path className="bbg-foul-line-svg" d="M450 580 L76 105" />
        <path className="bbg-foul-line-svg" d="M450 580 L824 105" />
        <path
          className="bbg-infield-dirt"
          d="M450 326 L584 460 L450 594 L316 460 Z"
        />
        <path
          className="bbg-infield-grass"
          d="M450 354 L556 460 L450 566 L344 460 Z"
        />
        <circle className="bbg-mound-dirt" cx="450" cy="460" r="31" />
        <circle className="bbg-home-dirt" cx="450" cy="574" r="33" />

        <g className="bbg-distance-marks">
          <text x="92" y="115">
            99m
          </text>
          <text textAnchor="middle" x="450" y="43">
            122m
          </text>
          <text textAnchor="end" x="808" y="115">
            99m
          </text>
        </g>

        <g className="bbg-fielders">
          <Fielder label="LF" x={235} y={215} />
          <Fielder label="CF" x={450} y={150} />
          <Fielder label="RF" x={665} y={215} />
          <Fielder label="SS" x={395} y={405} />
          <Fielder label="2B" x={505} y={405} />
          <Fielder label="3B" x={325} y={463} />
          <Fielder label="1B" x={575} y={463} />
          <Fielder label="C" x={450} y={607} />
        </g>

        {flight ? <BallFlightVisual face={face} flight={flight} /> : null}
      </svg>

      <BaseMarker base="second" label="2루" occupied={game.bases.second} />
      <BaseMarker base="third" label="3루" occupied={game.bases.third} />
      <BaseMarker base="first" label="1루" occupied={game.bases.first} />
      <span className="bbg-home-plate" aria-hidden="true">
        <i />
        <small>홈</small>
      </span>
      <span className="bbg-mound" aria-hidden="true">
        투수
      </span>
    </div>
  );
}

function Fielder({ label, x, y }: { label: string; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="13" />
      <text dy="4" textAnchor="middle">
        {label}
      </text>
    </g>
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
      path: "M450 460 Q448 520 450 574",
      target: { x: 450, y: 574 },
    },
    GF: {
      kind: "ground",
      label: "1루 땅볼",
      path: "M450 574 Q500 515 565 463",
      target: { x: 565, y: 463 },
    },
    G3: {
      kind: "ground",
      label: "3루 땅볼",
      path: "M450 574 Q395 515 335 463",
      target: { x: 335, y: 463 },
    },
    GA: {
      kind: "ground",
      label: "유격수 땅볼",
      path: "M450 574 Q425 490 397 405",
      target: { x: 397, y: 405 },
    },
    PO: {
      kind: "fly",
      label: "내야 뜬공",
      path: "M450 574 Q390 410 444 382",
      target: { x: 444, y: 382 },
    },
    FO: {
      kind: "fly",
      label: "외야 뜬공",
      path: "M450 574 Q520 305 525 215",
      target: { x: 525, y: 215 },
    },
    F2: {
      kind: "fly",
      label: "좌익수 뜬공",
      path: "M450 574 Q330 320 248 218",
      target: { x: 248, y: 218 },
    },
    F3: {
      kind: "fly",
      label: "중견수 뜬공",
      path: "M450 574 Q450 300 450 157",
      target: { x: 450, y: 157 },
    },
    FA: {
      kind: "fly",
      label: "우익수 뜬공",
      path: "M450 574 Q570 320 652 218",
      target: { x: 652, y: 218 },
    },
    HIT: {
      kind: "line",
      label: "안타 방향 판정",
      path: "M450 574 Q450 365 450 255",
      target: { x: 450, y: 255 },
    },
    HR: {
      kind: "fly",
      label: "HOME RUN",
      path: "M450 574 Q535 270 490 36",
      target: { x: 490, y: 36 },
    },
    IH: {
      kind: "ground",
      label: "내야 안타",
      path: "M450 574 Q470 500 490 430",
      target: { x: 490, y: 430 },
    },
    L1: {
      kind: "line",
      label: "좌전 안타",
      path: "M450 574 Q340 380 260 260",
      target: { x: 260, y: 260 },
    },
    L2: {
      kind: "line",
      label: "좌중간 안타",
      path: "M450 574 Q350 315 300 188",
      target: { x: 300, y: 188 },
    },
    C1: {
      kind: "line",
      label: "중전 안타",
      path: "M450 574 Q450 355 450 244",
      target: { x: 450, y: 244 },
    },
    C2: {
      kind: "line",
      label: "중견수 앞 안타",
      path: "M450 574 Q450 300 450 183",
      target: { x: 450, y: 183 },
    },
    R1: {
      kind: "line",
      label: "우전 안타",
      path: "M450 574 Q560 380 640 260",
      target: { x: 640, y: 260 },
    },
    R2: {
      kind: "line",
      label: "우중간 안타",
      path: "M450 574 Q550 315 600 188",
      target: { x: 600, y: 188 },
    },
    D2: {
      kind: "fly",
      label: "좌중간 2루타",
      path: "M450 574 Q330 290 245 130",
      target: { x: 245, y: 130 },
    },
    D3: {
      kind: "fly",
      label: "중앙 펜스 2루타",
      path: "M450 574 Q450 245 450 86",
      target: { x: 450, y: 86 },
    },
    T3: {
      kind: "fly",
      label: "우중간 3루타",
      path: "M450 574 Q590 275 690 126",
      target: { x: 690, y: 126 },
    },
  };
  return flights[face] ?? null;
}

function BaseMarker({
  base,
  label,
  occupied,
}: {
  base: "first" | "second" | "third";
  label: string;
  occupied: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`bbg-base bbg-base--${base}`}
      data-occupied={occupied}
      key={`${base}-${occupied}`}
    >
      <i>{occupied ? "●" : ""}</i>
      <strong>{label}</strong>
      <small>{occupied ? "주자" : "비어 있음"}</small>
    </span>
  );
}

function PhaseStepper({ phase }: { phase: GamePhase }) {
  const steps: Array<{ phase: GamePhase; label: string; detail: string }> = [
    { phase: "awaiting_pitch", label: "투구", detail: "B · S · C" },
    { phase: "awaiting_batting", label: "타격", detail: "아웃 · 안타" },
    { phase: "awaiting_hit", label: "안타", detail: "방향 · 진루" },
  ];
  const currentIndex = steps.findIndex((step) => step.phase === phase);

  return (
    <div className="bbg-phase-steps" aria-label="현재 판정 단계">
      <span>판정 흐름</span>
      <ol>
        {steps.map((step, index) => {
          const state =
            phase === "finished"
              ? "done"
              : index === currentIndex
                ? "current"
                : index < currentIndex
                  ? "done"
                  : "upcoming";
          return (
            <li data-state={state} key={step.phase}>
              <b>{index + 1}</b>
              <span>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
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
        <small>{face ? "D12" : "NEXT"}</small>
        <strong>{face ?? "▶"}</strong>
      </div>
      <div className="bbg-result-copy">
        <span>{event ? "방금 판정" : "PLAY BALL"}</span>
        <h2>{event?.summary ?? "첫 투구를 준비하세요"}</h2>
        <p>
          {face
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

function CountRow({
  label,
  name,
  active,
  total,
  tone,
}: {
  label: string;
  name: string;
  active: number;
  total: number;
  tone: "ball" | "strike" | "out";
}) {
  return (
    <div className="bbg-count-row">
      <span className="bbg-count-label">
        <strong>{label}</strong>
        <em>{name}</em>
      </span>
      <span className="bbg-count-lights">
        {Array.from({ length: total }, (_, index) => (
          <i
            className={index < active ? `is-active is-${tone}` : ""}
            key={index}
          />
        ))}
      </span>
      <small>{active}</small>
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
