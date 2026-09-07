"use client";

import { ArrowLeft, Radio, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { PartyPublicSnapshot } from "@/lib/baseball-game/party/types";
import type { TeamSide } from "@/lib/baseball-game/types";

export default function BaseballPartyJoin({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<PartyPublicSnapshot | null>(null);
  const [nickname, setNickname] = useState("");
  const [team, setTeam] = useState<TeamSide>("away");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const playerResponse = await fetch(
        `/api/baseball-game/rooms/${roomCode}/party/view`,
        { cache: "no-store" },
      );
      if (playerResponse.ok) {
        router.replace(`/baseball-game/party/${roomCode}/play`);
        return;
      }
      const response = await fetch(
        `/api/baseball-game/rooms/${roomCode}/public-view`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        snapshot?: PartyPublicSnapshot;
        error?: string;
      };
      if (!response.ok || !payload.snapshot)
        throw new Error(payload.error ?? "방을 찾을 수 없습니다.");
      setSnapshot(payload.snapshot);
      if (payload.snapshot.players.away.length >= 8) setTeam("home");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "방을 불러오지 못했습니다.",
      );
    }
  }, [roomCode, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function join() {
    if (!snapshot || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/baseball-game/rooms/${roomCode}/party/join`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            nickname,
            team,
            expectedRoomRevision: snapshot.roomRevision,
          }),
        },
      );
      const payload = (await response.json()) as {
        playerUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.playerUrl) {
        if (response.status === 409) await load();
        throw new Error(payload.error ?? "참가하지 못했습니다.");
      }
      router.replace(payload.playerUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "참가하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (snapshot && snapshot.status !== "lobby") {
    return (
      <main className="bbg-party-mobile-shell">
        <section className="bbg-party-join-card">
          <Radio />
          <small>PARTY · {roomCode}</small>
          <h1>경기가 시작되었습니다</h1>
          <p>지금 입장한 기기는 공개 관전 화면으로 연결됩니다.</p>
          <Link
            className="bbg-party-primary-link"
            href={`/baseball-game/party/${roomCode}`}
          >
            관전 화면 열기
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="bbg-party-mobile-shell">
      <section
        className="bbg-party-join-card"
        aria-labelledby="party-join-title"
      >
        <Users />
        <small>PARTY · {roomCode}</small>
        <h1 id="party-join-title">팀에 참가하세요</h1>
        <p>같은 팀은 4장의 전략카드를 함께 보고, 현재 선수만 행동합니다.</p>
        <label>
          닉네임
          <input
            autoComplete="nickname"
            maxLength={12}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="1~12자"
            value={nickname}
          />
        </label>
        <fieldset>
          <legend>참가 팀</legend>
          {(["away", "home"] as const).map((side) => {
            const full = (snapshot?.players[side].length ?? 0) >= 8;
            return (
              <button
                aria-pressed={team === side}
                data-selected={team === side}
                disabled={full}
                key={side}
                onClick={() => setTeam(side)}
                type="button"
              >
                <span>{side === "away" ? "원정" : "홈"}</span>
                <strong>
                  {snapshot
                    ? side === "away"
                      ? snapshot.view.config.awayTeamName
                      : snapshot.view.config.homeTeamName
                    : "불러오는 중"}
                </strong>
                <small>
                  {snapshot?.players[side].length ?? 0}/8{full ? " · 마감" : ""}
                </small>
              </button>
            );
          })}
        </fieldset>
        {error ? (
          <p className="bbg-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="bbg-party-join-submit"
          disabled={!snapshot || !nickname.trim() || busy}
          onClick={() => void join()}
          type="button"
        >
          {busy ? "참가 중" : "이 팀으로 참가"}
        </button>
        <Link href={`/baseball-game/party/${roomCode}`}>
          <ArrowLeft size={14} />
          공용 화면
        </Link>
      </section>
    </main>
  );
}
