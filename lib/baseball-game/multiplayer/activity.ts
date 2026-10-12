import type { CardTiming, GameView, TeamSide } from "../types";
import type { OpponentStatus } from "./presence";

export const CARD_TIMING_LABELS: Record<CardTiming, string> = {
  before_pitch: "투구 전",
  after_pitch: "투구 직후",
  after_contact: "컨택 직후",
  after_batting: "타구 직후",
  after_hit: "안타 직후",
};

export type OpponentActivity = {
  tone: "thinking" | "away" | "offline" | "idle";
  title: string;
  detail: string | null;
};

export function describeOpponentActivity(
  view: Pick<GameView, "phase" | "battingTeam" | "cardWindow">,
  opponent: TeamSide,
  actionOwner: TeamSide | null,
  status: OpponentStatus,
): OpponentActivity {
  if (status.presence === "absent") {
    return { tone: "idle", title: "상대 팀 참가 대기 중", detail: null };
  }
  if (status.presence === "offline") {
    return {
      tone: "offline",
      title: "상대 연결 끊김",
      detail: "재접속을 기다리는 중입니다.",
    };
  }
  const awayDetail =
    status.presence === "away" ? "상대가 경기 화면을 벗어나 있습니다." : null;
  if (actionOwner !== opponent || view.phase === "finished") {
    return {
      tone: status.presence === "away" ? "away" : "idle",
      title: "상대 대기 중",
      detail: awayDetail,
    };
  }
  const opponentBats = view.battingTeam === opponent;
  const tone = status.presence === "away" ? "away" : "thinking";
  if (view.phase === "awaiting_pitch") {
    return { tone, title: "상대 투수가 사인을 고르는 중", detail: awayDetail };
  }
  if (view.phase === "awaiting_swing") {
    return {
      tone,
      title: "상대 타자가 노림수를 정하는 중",
      detail: awayDetail,
    };
  }
  if (view.phase === "awaiting_card") {
    const timing = view.cardWindow
      ? `${CARD_TIMING_LABELS[view.cardWindow.timing]} `
      : "";
    return {
      tone,
      title: `상대 ${opponentBats ? "공격이" : "수비가"} ${timing}카드를 검토 중`,
      detail: awayDetail,
    };
  }
  return { tone, title: "상대 결정 처리 중", detail: awayDetail };
}
