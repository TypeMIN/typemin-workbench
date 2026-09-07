"use client";

import {
  Check,
  Copy,
  ExternalLink,
  Radio,
  RefreshCw,
  Smartphone,
  Tv,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BaseballStadium } from "@/components/baseball-game/baseball-game-debug";
import {
  partyInviteStorageKey,
  type PartyInviteLinks,
  type PartyRoomSnapshot,
} from "@/lib/baseball-game/multiplayer/types";
import type { GameView, TeamSide } from "@/lib/baseball-game/types";

export default function BaseballPartyScreen({
  roomCode,
}: {
  roomCode: string;
}) {
  const [snapshot, setSnapshot] = useState<PartyRoomSnapshot | null>(null);
  const [invites, setInvites] = useState<PartyInviteLinks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedTeam, setCopiedTeam] = useState<TeamSide | null>(null);

  const loadSnapshot = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const response = await fetch(
          `/api/baseball-game/rooms/${encodeURIComponent(roomCode)}/public-view`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          snapshot?: PartyRoomSnapshot;
          error?: string;
        };
        if (!response.ok || !payload.snapshot) {
          setError(payload.error ?? "파티 경기 상태를 불러오지 못했습니다.");
          return;
        }
        setSnapshot((current) =>
          !current || payload.snapshot!.view.revision >= current.view.revision
            ? payload.snapshot!
            : current,
        );
        setError(null);
      } catch {
        if (!quiet) setError("파티 경기 서버에 연결하지 못했습니다.");
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [roomCode],
  );

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      const stored = window.sessionStorage.getItem(
        partyInviteStorageKey(roomCode),
      );
      if (stored) {
        try {
          setInvites(JSON.parse(stored) as PartyInviteLinks);
        } catch {
          window.sessionStorage.removeItem(partyInviteStorageKey(roomCode));
        }
      }
      void loadSnapshot();
    }, 0);
    const pollTimer = window.setInterval(() => void loadSnapshot(true), 900);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(pollTimer);
    };
  }, [loadSnapshot, roomCode]);

  async function copyControllerLink(team: TeamSide) {
    const relativeUrl =
      team === "away"
        ? invites?.awayControllerUrl
        : (invites?.homeControllerUrl ??
          `/baseball-game/party/${roomCode}/home`);
    if (!relativeUrl) {
      setError(
        "원정팀 초대 링크는 이 파티 경기를 만든 공용 화면에서만 확인할 수 있습니다.",
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(
        new URL(relativeUrl, window.location.origin).toString(),
      );
      setCopiedTeam(team);
      window.setTimeout(() => setCopiedTeam(null), 1600);
    } catch {
      setError("개인 화면 링크를 복사하지 못했습니다.");
    }
  }

  function openController(team: TeamSide) {
    const relativeUrl =
      team === "away"
        ? invites?.awayControllerUrl
        : (invites?.homeControllerUrl ??
          `/baseball-game/party/${roomCode}/home`);
    if (!relativeUrl) {
      setError(
        "원정팀 초대 링크는 이 파티 경기를 만든 공용 화면에서만 확인할 수 있습니다.",
      );
      return;
    }
    window.open(relativeUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="bbg-shell bbg-party-shell">
      <header className="bbg-topbar bbg-party-topbar">
        <Link className="bbg-brand" href="/baseball-game">
          <span className="bbg-brand-mark" aria-hidden="true">
            BB
          </span>
          <span>
            <strong>야구 게임</strong>
            <small>PARTY PLAY · PUBLIC BOARD</small>
          </span>
        </Link>
        <div className="bbg-mp-room-chip" aria-label={`방 코드 ${roomCode}`}>
          <Radio aria-hidden="true" size={13} />
          <span>ROOM</span>
          <strong>{roomCode}</strong>
        </div>
      </header>

      <main className="bbg-party-main">
        {loading && !snapshot ? (
          <PartyMessage title="공용 경기장을 불러오는 중" />
        ) : snapshot ? (
          <PartyBoard
            copiedTeam={copiedTeam}
            error={error}
            invites={invites}
            onCopy={copyControllerLink}
            onOpen={openController}
            onRefresh={() => void loadSnapshot()}
            snapshot={snapshot}
          />
        ) : (
          <PartyMessage
            copy={error ?? "방 코드를 다시 확인해 주세요."}
            title="공용 경기장을 열 수 없습니다"
          />
        )}
      </main>
    </div>
  );
}

function PartyBoard({
  copiedTeam,
  error,
  invites,
  onCopy,
  onOpen,
  onRefresh,
  snapshot,
}: {
  copiedTeam: TeamSide | null;
  error: string | null;
  invites: PartyInviteLinks | null;
  onCopy: (team: TeamSide) => void;
  onOpen: (team: TeamSide) => void;
  onRefresh: () => void;
  snapshot: PartyRoomSnapshot;
}) {
  const game = snapshot.view;
  const latestEvent = game.eventLog.at(-1);
  const latestFace = game.eventLog.findLast(
    (event) => event.kind === "die_roll",
  )?.face;

  return (
    <div className="bbg-party-board" data-room-status={snapshot.status}>
      <section className="bbg-party-field" aria-label="파티플레이 공용 경기장">
        <PartyScoreboard game={game} />
        <BaseballStadium
          face={latestFace}
          game={game}
          key={`party-field-${game.revision}`}
        />
        <div className="bbg-party-result" aria-live="polite">
          <span aria-hidden="true">
            <small>{latestFace ? "D12" : "LIVE"}</small>
            <b>{latestFace ?? "▶"}</b>
          </span>
          <div>
            <small>{latestEvent ? "방금 판정" : "PLAY BALL"}</small>
            <strong>
              {latestEvent?.summary ?? "개인 화면 연결을 기다립니다"}
            </strong>
          </div>
          <em>REV {game.revision}</em>
        </div>
      </section>

      <aside
        aria-label="개인 화면 연결"
        className="bbg-party-rail"
        role="region"
      >
        <header>
          <div>
            <small>PARTY CONTROL</small>
            <h1>개인 화면 연결</h1>
          </div>
          <button
            aria-label="경기 상태 새로고침"
            onClick={onRefresh}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={15} />
          </button>
        </header>

        <div className="bbg-party-status">
          <Tv aria-hidden="true" size={18} />
          <div>
            <small>공용 화면</small>
            <strong>
              {snapshot.status === "lobby"
                ? "개인기기 연결 대기"
                : snapshot.status === "finished"
                  ? "경기 종료"
                  : "경기 진행 중"}
            </strong>
          </div>
          <i data-live={snapshot.status === "playing"} />
        </div>

        <div className="bbg-party-seats">
          {(["away", "home"] as const).map((team) => (
            <section data-connected={snapshot.seats[team]} key={team}>
              <div className="bbg-party-seat-heading">
                <span>
                  <Smartphone aria-hidden="true" size={16} />
                </span>
                <div>
                  <small>{team === "away" ? "AWAY" : "HOME"}</small>
                  <strong>{teamName(game, team)}</strong>
                </div>
                <em>{snapshot.seats[team] ? "연결됨" : "대기"}</em>
              </div>
              <p>
                {team === "away"
                  ? "원정팀 전용 손패와 공격 결정을 표시합니다."
                  : "홈팀 전용 손패와 수비 결정을 표시합니다."}
              </p>
              <div>
                <button onClick={() => onCopy(team)} type="button">
                  {copiedTeam === team ? (
                    <Check aria-hidden="true" size={14} />
                  ) : (
                    <Copy aria-hidden="true" size={14} />
                  )}
                  {copiedTeam === team ? "복사됨" : "링크 복사"}
                </button>
                <button
                  aria-label={`${team === "away" ? "원정팀" : "홈팀"} 개인 화면 새 탭에서 열기`}
                  disabled={team === "away" && !invites?.awayControllerUrl}
                  onClick={() => onOpen(team)}
                  type="button"
                >
                  <ExternalLink aria-hidden="true" size={14} />
                </button>
              </div>
            </section>
          ))}
        </div>

        <p className="bbg-party-privacy">
          공용 화면에는 점수와 경기 상황만 전송됩니다. 양쪽 손패는 각 개인
          화면에서만 볼 수 있습니다.
        </p>
        {error ? (
          <p className="bbg-error" role="alert">
            {error}
          </p>
        ) : null}
      </aside>
    </div>
  );
}

function PartyScoreboard({ game }: { game: GameView }) {
  return (
    <section
      aria-label={`공용 경기 점수판 ${inningLabel(game)}`}
      className="bbg-party-scoreboard"
    >
      <div className="bbg-party-team-scores">
        {(["away", "home"] as const).map((team) => (
          <div data-batting={game.battingTeam === team} key={team}>
            <small>{team === "away" ? "원정" : "홈"}</small>
            <strong>{teamName(game, team)}</strong>
            <b>{game.score[team]}</b>
          </div>
        ))}
      </div>
      <div className="bbg-party-inning">
        <strong>{inningLabel(game)}</strong>
        <small>
          {teamName(game, game.battingTeam)}{" "}
          {game.phase === "finished" ? "종료" : "공격"}
        </small>
      </div>
      <PartyDiamond game={game} />
      <div className="bbg-party-counts">
        <PartyLights active={game.balls} label="B" tone="ball" total={3} />
        <PartyLights active={game.strikes} label="S" tone="strike" total={2} />
        <PartyLights active={game.outs} label="O" tone="out" total={2} />
      </div>
    </section>
  );
}

function PartyDiamond({ game }: { game: GameView }) {
  return (
    <div
      aria-label={`주자 ${baseLabel(game)}`}
      className="bbg-party-diamond"
      role="img"
    >
      <i data-base="second" data-occupied={game.bases.second} />
      <i data-base="third" data-occupied={game.bases.third} />
      <i data-base="first" data-occupied={game.bases.first} />
    </div>
  );
}

function PartyLights({
  active,
  label,
  tone,
  total,
}: {
  active: number;
  label: string;
  tone: string;
  total: number;
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

function PartyMessage({ title, copy }: { title: string; copy?: string }) {
  return (
    <section className="bbg-mp-message">
      <span className="bbg-mp-message-icon">
        <RefreshCw aria-hidden="true" />
      </span>
      <h1>{title}</h1>
      <p>{copy ?? "점수판과 개인 화면 연결 상태를 확인하고 있습니다."}</p>
      <Link href="/baseball-game">야구 게임으로 돌아가기</Link>
    </section>
  );
}

function inningLabel(game: GameView) {
  return `${game.inning}회${game.half === "top" ? "초" : "말"}`;
}

function teamName(game: GameView, team: TeamSide) {
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
