"use client";

import { ArrowLeft, Eye } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { useBaseballSoundscape } from "@/components/baseball-game/audio/use-baseball-soundscape";
import { useAdaptiveGamePolling } from "@/components/baseball-game/baseball-action-feedback";
import {
  BaseballPlayReceipt,
  BroadcastLineScore,
} from "@/components/baseball-game/baseball-broadcast";
import {
  RoomBar,
  Scorebug,
} from "@/components/baseball-game/baseball-multiplayer-room";
import { BaseballStadium } from "@/components/baseball-game/stadium/baseball-stadium";
import {
  REALTIME_FALLBACK_POLL_MS,
  useRoomRealtime,
} from "@/components/baseball-game/use-room-realtime";
import { useStagedView } from "@/components/baseball-game/use-staged-view";
import { getPendingTeams } from "@/lib/baseball-game/multiplayer/activity";
import type { MultiplayerSpectatorSnapshot } from "@/lib/baseball-game/multiplayer/types";
import { hasResolutionOutcome } from "@/lib/baseball-game/presentation";
import type { GameView, TeamSide } from "@/lib/baseball-game/types";

const PRESENCE_LABEL = {
  online: "접속 중",
  away: "자리 비움",
  offline: "연결 끊김",
  absent: "참가 대기",
} as const;

/** Read-only room view: the shared stadium and score, never a hand. */
export default function BaseballRoomSpectator({
  roomCode,
}: {
  roomCode: string;
}) {
  const [snapshot, setSnapshot] = useState<MultiplayerSpectatorSnapshot | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/baseball-game/rooms/${encodeURIComponent(roomCode)}/watch`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        snapshot?: MultiplayerSpectatorSnapshot;
        error?: string;
      };
      if (!response.ok || !payload.snapshot) {
        throw new Error(payload.error ?? "경기를 불러오지 못했습니다.");
      }
      const incoming = payload.snapshot;
      setSnapshot((current) =>
        !current || incoming.view.revision >= current.view.revision
          ? incoming
          : current,
      );
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "경기를 불러오지 못했습니다.",
      );
    }
  }, [roomCode]);

  const realtime = useRoomRealtime(
    snapshot?.realtimeTopic ?? null,
    useCallback(() => void load(), [load]),
  );
  useAdaptiveGamePolling(
    load,
    realtime ? { activeMs: REALTIME_FALLBACK_POLL_MS } : {},
  );

  if (!snapshot) {
    return (
      <div className="bbg-room">
        <RoomBar label="관전" roomCode={roomCode} />
        <main className="bbg-room-main is-message">
          <section className="bbg-room-message">
            <small>Spectator · {roomCode}</small>
            <h1>{error ? "관전할 수 없습니다" : "경기 연결 중"}</h1>
            <p>{error ?? "경기장을 불러오고 있습니다."}</p>
            <Link className="bbg-room-back" href="/baseball-game">
              <ArrowLeft aria-hidden="true" size={15} /> 돌아가기
            </Link>
          </section>
        </main>
      </div>
    );
  }
  return <SpectatorBoard snapshot={snapshot} />;
}

function SpectatorBoard({
  snapshot,
}: {
  snapshot: MultiplayerSpectatorSnapshot;
}) {
  const [presentationActive, setPresentationActive] = useState(false);
  const liveGame = snapshot.view;
  const staged = useStagedView(liveGame);
  const game = staged.view;
  const soundscape = useBaseballSoundscape({
    game: liveGame,
    perspective: "neutral",
    presenting: presentationActive,
  });
  const latestEvent = game.eventLog.at(-1);
  const concealingOutcome =
    presentationActive &&
    hasResolutionOutcome(
      liveGame.eventLog.filter((event) => event.revision === liveGame.revision),
    );
  const latestFace = game.eventLog.findLast(
    (event) =>
      event.kind === "pitch_result" ||
      event.kind === "batted_ball" ||
      event.kind === "die_roll",
  )?.face;
  const pending =
    staged.settled && snapshot.status === "playing"
      ? getPendingTeams(game)
      : [];

  return (
    <div className="bbg-room">
      <RoomBar
        label="관전"
        roomCode={snapshot.roomCode}
        soundscape={soundscape}
      />
      <main className="bbg-room-main">
        <div
          className="bbg-room-board bbg-room-board--watch"
          data-room-status={snapshot.status}
        >
          <section className="bbg-room-stage" aria-label="야구 경기장">
            <Scorebug game={game} seat={null} />
            <BaseballStadium
              face={latestFace}
              game={liveGame}
              onBeat={soundscape.onBeat}
              onPresentationChange={setPresentationActive}
              onPresentedRevision={staged.onPresentedRevision}
              replayLatestOnMount={false}
            />
            <div className="bbg-room-lower-third" aria-live="polite">
              <span className="bbg-room-lower-tag">
                {concealingOutcome ? "Live" : latestEvent ? "Play" : "Next"}
              </span>
              <div>
                <strong>
                  {concealingOutcome
                    ? "플레이 진행 중"
                    : (latestEvent?.summary ?? "첫 투구를 기다리는 중")}
                </strong>
                {concealingOutcome ? null : <BaseballPlayReceipt game={game} />}
              </div>
            </div>
          </section>

          <aside aria-label="관전 정보" className="bbg-room-rail">
            <section className="bbg-room-panel bbg-room-watch">
              <header>
                <Eye aria-hidden="true" size={14} />
                <strong>관전 중</strong>
                <span>{statusLabel(snapshot.status)}</span>
              </header>
              <ul>
                {(["away", "home"] as const).map((team) => (
                  <li data-team={team} key={team}>
                    <strong>{teamName(game, team)}</strong>
                    <span data-presence={snapshot.presence[team].presence}>
                      {PRESENCE_LABEL[snapshot.presence[team].presence]}
                    </span>
                    <em>{deciderLabel(game, team, pending)}</em>
                  </li>
                ))}
              </ul>
              <p>
                손패와 선택은 경기가 끝날 때까지 관전 화면에 보이지 않습니다.
              </p>
            </section>
            <section className="bbg-room-panel">
              <BroadcastLineScore game={game} />
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

function teamName(game: Pick<GameView, "config">, team: TeamSide) {
  return team === "away" ? game.config.awayTeamName : game.config.homeTeamName;
}

function statusLabel(status: MultiplayerSpectatorSnapshot["status"]) {
  if (status === "lobby") return "상대 참가 대기";
  if (status === "finished") return "경기 종료";
  if (status === "expired") return "만료된 방";
  return "경기 중";
}

function deciderLabel(game: GameView, team: TeamSide, pending: TeamSide[]) {
  if (!pending.includes(team)) return "";
  if (game.phase === "awaiting_card") return "카드 검토 중";
  return team === game.battingTeam ? "타자 선택 중" : "투수 선택 중";
}
