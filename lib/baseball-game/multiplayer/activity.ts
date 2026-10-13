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

type ActivityView = Pick<
  GameView,
  "phase" | "battingTeam" | "cardWindow" | "rulesetVersion" | "activeStrategy"
> & { batterLocked?: boolean };

/** View-side mirror of the engine's pending owners, from public fields only. */
export function getPendingTeams(view: ActivityView): TeamSide[] {
  const fielding: TeamSide = view.battingTeam === "away" ? "home" : "away";
  if (view.phase === "finished") return [];
  if (view.phase === "awaiting_card" && view.cardWindow) {
    const role = view.cardWindow.priorityOrder[view.cardWindow.priorityIndex];
    return [role === "offense" ? view.battingTeam : fielding];
  }
  if (view.phase === "awaiting_pitch") {
    const earlySwing =
      view.rulesetVersion === "pitch-duel-v4" &&
      view.activeStrategy?.cardId !== "HNR" &&
      !view.batterLocked;
    return earlySwing ? [fielding, view.battingTeam] : [fielding];
  }
  return [view.battingTeam];
}

export function hasLockedDuelChoice(view: ActivityView, team: TeamSide) {
  if (team === view.battingTeam) {
    return view.phase === "awaiting_pitch" && Boolean(view.batterLocked);
  }
  return view.phase === "awaiting_swing";
}

export function describeOpponentActivity(
  view: ActivityView,
  opponent: TeamSide,
  status: OpponentStatus,
): OpponentActivity {
  const opponentPending = getPendingTeams(view).includes(opponent);
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
  if (!opponentPending || view.phase === "finished") {
    return {
      tone: status.presence === "away" ? "away" : "idle",
      title: hasLockedDuelChoice(view, opponent)
        ? "상대 선택 완료"
        : "상대 대기 중",
      detail: awayDetail,
    };
  }
  const opponentBats = view.battingTeam === opponent;
  const tone = status.presence === "away" ? "away" : "thinking";
  if (view.phase === "awaiting_pitch" && !opponentBats) {
    return { tone, title: "상대 투수가 사인을 고르는 중", detail: awayDetail };
  }
  if (view.phase === "awaiting_pitch") {
    return {
      tone,
      title: "상대 타자가 노림수를 정하는 중",
      detail: awayDetail,
    };
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
