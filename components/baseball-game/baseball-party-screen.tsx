"use client";

import {
  Check,
  Copy,
  Pause,
  Play,
  Radio,
  Settings2,
  SkipForward,
  Trash2,
  UserRoundX,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BaseballStadium } from "@/components/baseball-game/baseball-game-debug";
import {
  BaseballAudio,
  BroadcastLineScore,
} from "@/components/baseball-game/baseball-broadcast";
import type {
  PartyHostCommand,
  PartyPlayer,
  PartyPublicSnapshot,
} from "@/lib/baseball-game/party/types";
import type { GameConfig, GameView, TeamSide } from "@/lib/baseball-game/types";

export default function BaseballPartyScreen({
  roomCode,
}: {
  roomCode: string;
}) {
  const [snapshot, setSnapshot] = useState<PartyPublicSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  const [qr, setQr] = useState("");

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const response = await fetch(
          `/api/baseball-game/rooms/${encodeURIComponent(roomCode)}/public-view`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          snapshot?: PartyPublicSnapshot;
          error?: string;
        };
        if (!response.ok || !payload.snapshot)
          throw new Error(payload.error ?? "파티 방을 불러오지 못했습니다.");
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
              : "파티 서버에 연결하지 못했습니다.",
          );
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [roomCode],
  );

  useEffect(() => {
    const url = new URL(
      `/baseball-game/party/${roomCode}/join`,
      window.location.origin,
    ).toString();
    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(url, {
          width: 220,
          margin: 1,
          color: { dark: "#07141fff", light: "#f6fffaff" },
        }),
      )
      .then((dataUrl) => {
        setJoinUrl(url);
        setQr(dataUrl);
      });
    const first = window.setTimeout(() => void load(), 0);
    const poll = window.setInterval(() => void load(true), 1_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
    };
  }, [load, roomCode]);

  async function host(command: PartyHostCommand) {
    if (!snapshot || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/baseball-game/rooms/${roomCode}/party/host`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            command,
            expectedRoomRevision: snapshot.roomRevision,
          }),
        },
      );
      const payload = (await response.json()) as {
        snapshot?: PartyPublicSnapshot;
        error?: string;
      };
      if (!response.ok || !payload.snapshot)
        throw new Error(payload.error ?? "명령을 처리하지 못했습니다.");
      setSnapshot(payload.snapshot);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "명령을 처리하지 못했습니다.",
      );
      await load(true);
    } finally {
      setBusy(false);
    }
  }

  async function copyJoinLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setError("참가 링크를 복사하지 못했습니다.");
    }
  }

  return (
    <div className="bbg-shell bbg-party-v2-shell">
      <header className="bbg-topbar bbg-party-v2-topbar">
        <Link className="bbg-brand" href="/baseball-game">
          <span className="bbg-brand-mark">BB</span>
          <span>
            <strong>야구 게임</strong>
            <small>PARTY · TEAM PLAY</small>
          </span>
        </Link>
        <div className="bbg-mp-room-chip">
          <Radio size={13} />
          <span>ROOM</span>
          <strong>{roomCode}</strong>
        </div>
      </header>
      <main className="bbg-party-v2-main">
        {loading && !snapshot ? (
          <PartyMessage text="파티 경기장을 준비하고 있습니다." />
        ) : snapshot ? (
          snapshot.status === "lobby" ? (
            <PartyLobby
              busy={busy}
              copied={copied}
              joinUrl={joinUrl}
              onCopy={copyJoinLink}
              onHost={host}
              qr={qr}
              snapshot={snapshot}
            />
          ) : (
            <PartyLive
              busy={busy}
              error={error}
              onHost={host}
              snapshot={snapshot}
            />
          )
        ) : (
          <PartyMessage text={error ?? "방을 찾을 수 없습니다."} />
        )}
        {error && snapshot?.status === "lobby" ? (
          <p className="bbg-error" role="alert">
            {error}
          </p>
        ) : null}
      </main>
    </div>
  );
}

function PartyLobby({
  busy,
  copied,
  joinUrl,
  onCopy,
  onHost,
  qr,
  snapshot,
}: {
  busy: boolean;
  copied: boolean;
  joinUrl: string;
  onCopy: () => void;
  onHost: (command: PartyHostCommand) => void;
  qr: string;
  snapshot: PartyPublicSnapshot;
}) {
  const ready =
    snapshot.players.away.length > 0 && snapshot.players.home.length > 0;
  return (
    <div className="bbg-party-lobby">
      <section className="bbg-party-invite" aria-labelledby="party-lobby-title">
        <small>COMMON INVITE</small>
        <h1 id="party-lobby-title">선수를 초대하세요</h1>
        {qr ? (
          <Image
            alt="파티플레이 참가 QR 코드"
            height={220}
            src={qr}
            unoptimized
            width={220}
          />
        ) : (
          <div className="bbg-party-qr-loading" />
        )}
        <strong>{snapshot.roomCode}</strong>
        <button onClick={onCopy} type="button">
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "복사됨" : "참가 링크 복사"}
        </button>
        <div className="bbg-party-camera-fallback">
          <small>카메라 없이 참가</small>
          <p>
            야구 게임에서 파티플레이를 선택하고 방 코드{" "}
            <b>{snapshot.roomCode}</b>를 입력하세요.
          </p>
          <span>{joinUrl.replace(/^https?:\/\//, "")}</span>
        </div>
      </section>
      <section className="bbg-party-lobby-board">
        <header>
          <div>
            <small>TEAM LOBBY</small>
            <h2>최대 8명씩 참가</h2>
          </div>
          {snapshot.isHost ? <span>방장 화면</span> : <span>관전 화면</span>}
        </header>
        <div className="bbg-party-roster-grid">
          {(["away", "home"] as const).map((team) => (
            <RosterEditor
              busy={busy}
              key={team}
              onHost={onHost}
              players={snapshot.players[team]}
              team={team}
              teamName={teamName(snapshot.view, team)}
              canManage={snapshot.isHost}
            />
          ))}
        </div>
        {snapshot.isHost ? (
          <LobbySettings busy={busy} game={snapshot.view} onHost={onHost} />
        ) : (
          <p className="bbg-party-spectator-note">
            방장이 팀과 경기 설정을 준비하고 있습니다.
          </p>
        )}
        {snapshot.isHost ? (
          <button
            className="bbg-party-start"
            disabled={!ready || busy}
            onClick={() => onHost({ type: "START_GAME" })}
            type="button"
          >
            <Play size={18} />
            {ready ? "경기 시작" : "양 팀에 선수가 필요합니다"}
          </button>
        ) : null}
      </section>
    </div>
  );
}

function RosterEditor({
  busy,
  canManage,
  onHost,
  players,
  team,
  teamName: name,
}: {
  busy: boolean;
  canManage: boolean;
  onHost: (command: PartyHostCommand) => void;
  players: PartyPlayer[];
  team: TeamSide;
  teamName: string;
}) {
  const other = team === "away" ? "home" : "away";
  return (
    <section className="bbg-party-roster-card" aria-label={`${name} 참가자`}>
      <header>
        <span>{team === "away" ? "AWAY" : "HOME"}</span>
        <strong>{name}</strong>
        <b>{players.length}/8</b>
      </header>
      <ol>
        {players.length ? (
          players.map((player, index) => (
            <li key={player.id}>
              <i>{index + 1}</i>
              <span>{player.nickname}</span>
              {canManage ? (
                <div>
                  <button
                    aria-label={`${player.nickname} ${other === "away" ? "원정" : "홈"}팀으로 이동`}
                    disabled={busy}
                    onClick={() =>
                      onHost({
                        type: "MOVE_PLAYER",
                        playerId: player.id,
                        team: other,
                      })
                    }
                    type="button"
                  >
                    ↔
                  </button>
                  <button
                    aria-label={`${player.nickname} 퇴장`}
                    disabled={busy}
                    onClick={() =>
                      onHost({ type: "REMOVE_PLAYER", playerId: player.id })
                    }
                    type="button"
                  >
                    <UserRoundX size={13} />
                  </button>
                </div>
              ) : null}
            </li>
          ))
        ) : (
          <li className="is-empty">
            <Users size={17} />
            참가 대기
          </li>
        )}
      </ol>
    </section>
  );
}

function LobbySettings({
  busy,
  game,
  onHost,
}: {
  busy: boolean;
  game: GameView;
  onHost: (command: PartyHostCommand) => void;
}) {
  const [config, setConfig] = useState<GameConfig>(game.config);
  return (
    <form
      className="bbg-party-settings"
      onSubmit={(event) => {
        event.preventDefault();
        onHost({ type: "UPDATE_CONFIG", config });
      }}
    >
      <label>
        원정팀
        <input
          maxLength={20}
          onChange={(event) =>
            setConfig({ ...config, awayTeamName: event.target.value })
          }
          value={config.awayTeamName}
        />
      </label>
      <label>
        홈팀
        <input
          maxLength={20}
          onChange={(event) =>
            setConfig({ ...config, homeTeamName: event.target.value })
          }
          value={config.homeTeamName}
        />
      </label>
      <label>
        이닝
        <select
          onChange={(event) =>
            setConfig({
              ...config,
              innings: Number(event.target.value) as GameConfig["innings"],
            })
          }
          value={config.innings}
        >
          {[3, 5, 7, 9].map((inning) => (
            <option key={inning} value={inning}>
              {inning}이닝
            </option>
          ))}
        </select>
      </label>
      <button disabled={busy} type="submit">
        <Settings2 size={14} />
        설정 적용
      </button>
    </form>
  );
}

function PartyLive({
  busy,
  error,
  onHost,
  snapshot,
}: {
  busy: boolean;
  error: string | null;
  onHost: (command: PartyHostCommand) => void;
  snapshot: PartyPublicSnapshot;
}) {
  const game = snapshot.view;
  const latest = game.eventLog.at(-1);
  const face = game.eventLog.findLast(
    (event) => event.kind === "die_roll",
  )?.face;
  return (
    <div className="bbg-party-live">
      <TeamRail
        label="원정"
        players={snapshot.players.away}
        activeIds={[snapshot.activeBatterId, snapshot.activeDefenderId]}
      />
      <section
        className="bbg-party-live-field"
        aria-label="파티플레이 공용 경기장"
      >
        <PartyScoreboard game={game} />
        <BaseballAudio events={game.eventLog} />
        <BaseballStadium face={face} game={game} key={game.revision} />
        <div className="bbg-party-live-result">
          <span>{face ?? "▶"}</span>
          <div>
            <small>방금 판정</small>
            <strong>{latest?.summary ?? "경기 시작"}</strong>
          </div>
        </div>
      </section>
      <TeamRail
        label="홈"
        players={snapshot.players.home}
        activeIds={[snapshot.activeBatterId, snapshot.activeDefenderId]}
      />
      {snapshot.isHost ? (
        <details className="bbg-party-host-panel">
          <summary>
            <Settings2 size={14} />
            방장 운영
          </summary>
          <div>
            {snapshot.status === "paused" ? (
              <button
                disabled={busy}
                onClick={() => onHost({ type: "RESUME_GAME" })}
              >
                <Play size={14} />
                재개
              </button>
            ) : (
              <button
                disabled={busy || snapshot.status === "finished"}
                onClick={() => onHost({ type: "PAUSE_GAME" })}
              >
                <Pause size={14} />
                일시정지
              </button>
            )}
            <button
              disabled={busy || snapshot.status === "finished"}
              onClick={() => onHost({ type: "SKIP_ACTIVE_PLAYER" })}
            >
              <SkipForward size={14} />
              현재 선수 넘기기
            </button>
            <button
              disabled={busy || snapshot.status === "finished"}
              onClick={() => onHost({ type: "END_GAME" })}
            >
              <Trash2 size={14} />
              강제 종료
            </button>
            <div className="bbg-party-host-roster">
              {[...snapshot.players.away, ...snapshot.players.home].map(
                (player) => (
                  <button
                    aria-label={`${player.nickname} 경기에서 퇴장`}
                    disabled={busy || snapshot.status === "finished"}
                    key={player.id}
                    onClick={() =>
                      onHost({
                        type: "REMOVE_PLAYER",
                        playerId: player.id,
                      })
                    }
                    type="button"
                  >
                    <UserRoundX size={12} />
                    {player.nickname}
                  </button>
                ),
              )}
            </div>
          </div>
        </details>
      ) : null}
      {snapshot.status === "paused" ? (
        <div className="bbg-party-paused">경기가 일시정지되었습니다</div>
      ) : null}
      {error ? (
        <p className="bbg-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TeamRail({
  activeIds,
  label,
  players,
}: {
  activeIds: Array<string | null>;
  label: string;
  players: PartyPlayer[];
}) {
  return (
    <aside className="bbg-party-team-rail" aria-label={`${label}팀 로스터`}>
      <header>
        {label}
        <b>{players.length}</b>
      </header>
      <ol>
        {players.map((player) => (
          <li
            data-active={activeIds.includes(player.id)}
            data-connected={player.connected}
            key={player.id}
          >
            <span>{player.nickname.slice(0, 1)}</span>
            <strong>{player.nickname}</strong>
            {activeIds.includes(player.id) ? <em>NOW</em> : null}
          </li>
        ))}
      </ol>
    </aside>
  );
}

function PartyScoreboard({ game }: { game: GameView }) {
  return (
    <section
      className="bbg-party-v2-scoreboard"
      aria-label={`공용 경기 점수판 ${inningLabel(game)}`}
    >
      <div className="bbg-party-line-score">
        <BroadcastLineScore game={game} />
      </div>
      <strong className="bbg-party-v2-inning">{inningLabel(game)}</strong>
      <div className="bbg-party-v2-diamond" aria-label="주자 현황">
        <i data-base="second" data-on={game.bases.second} />
        <i data-base="third" data-on={game.bases.third} />
        <i data-base="first" data-on={game.bases.first} />
      </div>
      <div className="bbg-party-v2-counts">
        {[
          ["B", game.balls, 3],
          ["S", game.strikes, 2],
          ["O", game.outs, 2],
        ].map(([label, active, total]) => (
          <p data-tone={label} key={label}>
            <b>{label}</b>
            {Array.from({ length: Number(total) }, (_, index) => (
              <i data-on={index < Number(active)} key={index} />
            ))}
          </p>
        ))}
      </div>
    </section>
  );
}

function PartyMessage({ text }: { text: string }) {
  return (
    <section className="bbg-mp-message">
      <Users />
      <h1>파티플레이</h1>
      <p>{text}</p>
      <Link href="/baseball-game">돌아가기</Link>
    </section>
  );
}
function teamName(game: GameView, team: TeamSide) {
  return team === "away" ? game.config.awayTeamName : game.config.homeTeamName;
}
function inningLabel(game: GameView) {
  return `${game.inning}회${game.half === "top" ? "초" : "말"}`;
}
