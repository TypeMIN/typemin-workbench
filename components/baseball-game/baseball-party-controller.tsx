"use client";

import { ArrowLeft, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { MultiplayerRoomSnapshot } from "@/lib/baseball-game/multiplayer/types";
import type { TeamSide } from "@/lib/baseball-game/types";

export default function BaseballPartyController({
  roomCode,
  team,
}: {
  roomCode: string;
  team: TeamSide;
}) {
  const router = useRouter();
  const seatTokenRef = useRef<string | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      let endpoint = `/api/baseball-game/rooms/${encodeURIComponent(roomCode)}/join`;
      let options: RequestInit = { method: "POST" };
      if (team === "away") {
        const hash = new URLSearchParams(window.location.hash.slice(1));
        seatTokenRef.current ??= hash.get("token");
        const seatToken = seatTokenRef.current;
        window.history.replaceState(
          null,
          "",
          `/baseball-game/party/${roomCode}/away`,
        );
        if (!seatToken) {
          setError(
            "원정팀 참가 토큰이 없습니다. 공용 화면에서 링크를 다시 복사해 주세요.",
          );
          return;
        }
        endpoint = `/api/baseball-game/rooms/${encodeURIComponent(roomCode)}/seat`;
        options = {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ seatToken }),
        };
      }

      const response = await fetch(endpoint, options);
      const payload = (await response.json()) as {
        seat?: TeamSide;
        roomUrl?: string;
        snapshot?: MultiplayerRoomSnapshot;
        error?: string;
      };
      const claimedSeat = payload.seat ?? payload.snapshot?.seat;
      const roomUrl = payload.roomUrl ?? `/baseball-game/rooms/${roomCode}`;
      if (!response.ok || claimedSeat !== team) {
        setError(
          payload.error ??
            (claimedSeat
              ? "이 브라우저에는 다른 팀 좌석이 연결되어 있습니다."
              : "개인 화면을 연결하지 못했습니다."),
        );
        return;
      }
      router.replace(roomUrl);
    } catch {
      setError("파티 경기 서버에 연결하지 못했습니다.");
    } finally {
      setConnecting(false);
    }
  }, [roomCode, router, team]);

  useEffect(() => {
    const timer = window.setTimeout(() => void connect(), 0);
    return () => window.clearTimeout(timer);
  }, [connect]);

  return (
    <div className="bbg-shell bbg-party-controller-shell">
      <main className="bbg-party-controller-main">
        <section aria-labelledby="party-controller-title">
          <span className="bbg-party-controller-icon">
            {error ? (
              <Smartphone aria-hidden="true" />
            ) : (
              <ShieldCheck aria-hidden="true" />
            )}
          </span>
          <small>PARTY PLAY · {roomCode}</small>
          <h1 id="party-controller-title">
            {team === "away" ? "원정팀" : "홈팀"} 개인 화면
          </h1>
          <p>
            {connecting
              ? "이 기기에 전용 좌석과 비공개 손패를 연결하고 있습니다."
              : (error ?? "연결이 완료되었습니다.")}
          </p>
          {connecting ? (
            <span className="bbg-party-controller-loading" role="status">
              <RefreshCw aria-hidden="true" size={15} /> 연결 중
            </span>
          ) : error ? (
            <button onClick={() => void connect()} type="button">
              다시 연결
            </button>
          ) : null}
          <Link href={`/baseball-game/party/${roomCode}`}>
            <ArrowLeft aria-hidden="true" size={15} /> 공용 화면으로
          </Link>
        </section>
      </main>
    </div>
  );
}
