export const knockoutStages = [
  "r32",
  "r16",
  "qf",
  "sf",
  "third",
  "final",
] as const;

export type KnockoutStage = (typeof knockoutStages)[number];

export type LocalMatch = {
  id: string;
  stage: KnockoutStage;
  team_a: string;
  team_b: string;
  team_a_crest: string | null;
  team_b_crest: string | null;
  external_id: string | null;
  synced_pre: boolean;
  kickoff: string | null;
  result_team: "A" | "B" | null;
  result_regular: "win" | "draw" | null;
  result_home: number | null;
  result_away: number | null;
  result_pen_home: number | null;
  result_pen_away: number | null;
  result_duration: string | null;
};

export type FootballDataMatch = {
  id: number;
  stage?: string | null;
  utcDate: string;
  status: string;
  homeTeam: {
    name?: string | null;
    shortName?: string | null;
    tla?: string | null;
    crest?: string | null;
  };
  awayTeam: {
    name?: string | null;
    shortName?: string | null;
    tla?: string | null;
    crest?: string | null;
  };
  score: {
    winner?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    duration?: string | null;
    regularTime?: ScorePair | null;
    extraTime?: ScorePair | null;
    penalties?: ScorePair | null;
    fullTime?: ScorePair | null;
  };
};

type ScorePair = {
  home?: number | null;
  away?: number | null;
};

export type FootballDataUpdate = {
  id: string;
  external_id: string;
  team_a: string;
  team_b: string;
  team_a_crest: string | null;
  team_b_crest: string | null;
  kickoff: string;
  synced_pre: true;
  apply_result: boolean;
  result_team: "A" | "B" | null;
  result_regular: "win" | "draw" | null;
  result_home: number | null;
  result_away: number | null;
  result_pen_home: number | null;
  result_pen_away: number | null;
  result_duration: string | null;
};

export type PreparedFootballData = {
  updates: FootballDataUpdate[];
  total: number;
  linked: number;
  finished: number;
};

const expectedStageCounts: Record<KnockoutStage, number> = {
  r32: 16,
  r16: 8,
  qf: 4,
  sf: 2,
  third: 1,
  final: 1,
};

export function prepareFootballDataUpdates(
  localMatches: LocalMatch[],
  remoteMatches: FootballDataMatch[],
): PreparedFootballData {
  validateLocalMatches(localMatches);

  const remoteByStage = groupRemoteMatches(remoteMatches);
  const usedRemoteIds = new Set<number>();
  const updates: FootballDataUpdate[] = [];
  let finished = 0;

  for (const local of sortLocalMatches(localMatches)) {
    const remote = findRemoteMatch(local, remoteByStage[local.stage]);
    if (!remote) {
      throw new Error(
        `${local.id} 경기에 대응하는 외부 경기를 찾지 못했습니다.`,
      );
    }
    if (usedRemoteIds.has(remote.id)) {
      throw new Error(
        `외부 경기 ${remote.id}가 둘 이상의 경기에 연결됐습니다.`,
      );
    }
    usedRemoteIds.add(remote.id);

    const update = buildUpdate(local, remote);
    if (remote.status === "FINISHED") finished += 1;
    if (hasChanges(local, update)) updates.push(update);
  }

  return {
    updates,
    total: usedRemoteIds.size,
    linked: usedRemoteIds.size,
    finished,
  };
}

export function normalizeStage(value?: string | null): KnockoutStage | null {
  const stage = String(value || "").toUpperCase();
  if (stage === "LAST_32" || stage === "ROUND_OF_32") return "r32";
  if (stage === "LAST_16" || stage === "ROUND_OF_16") return "r16";
  if (stage === "QUARTER_FINALS") return "qf";
  if (stage === "SEMI_FINALS") return "sf";
  if (stage === "THIRD_PLACE") return "third";
  if (stage === "FINAL") return "final";
  return null;
}

export function buildResult(
  match: FootballDataMatch,
): Pick<
  FootballDataUpdate,
  | "result_team"
  | "result_regular"
  | "result_home"
  | "result_away"
  | "result_pen_home"
  | "result_pen_away"
  | "result_duration"
> {
  if (match.status !== "FINISHED") {
    return emptyResult();
  }

  const duration = match.score.duration ?? null;
  const regularTime = match.score.regularTime ?? {};
  const extraTime = match.score.extraTime ?? {};
  const fullTime = match.score.fullTime ?? {};
  const penalties = match.score.penalties ?? {};
  const playedExtraTime =
    duration === "EXTRA_TIME" || duration === "PENALTY_SHOOTOUT";
  const home =
    regularTime.home != null
      ? Number(regularTime.home) + Number(extraTime.home ?? 0)
      : numberOrNull(fullTime.home);
  const away =
    regularTime.away != null
      ? Number(regularTime.away) + Number(extraTime.away ?? 0)
      : numberOrNull(fullTime.away);
  const team = winnerSide(match, home, away);

  if (!team || home == null || away == null) {
    throw new Error(`종료된 외부 경기 ${match.id}의 결과가 완전하지 않습니다.`);
  }

  return {
    result_team: team,
    result_regular: playedExtraTime ? "draw" : home === away ? "draw" : "win",
    result_home: home,
    result_away: away,
    result_pen_home:
      duration === "PENALTY_SHOOTOUT" ? numberOrNull(penalties.home) : null,
    result_pen_away:
      duration === "PENALTY_SHOOTOUT" ? numberOrNull(penalties.away) : null,
    result_duration: duration,
  };
}

function validateLocalMatches(localMatches: LocalMatch[]) {
  const ids = new Set(localMatches.map((match) => match.id));
  if (localMatches.length !== 32 || ids.size !== localMatches.length) {
    throw new Error("로컬 토너먼트 경기는 고유한 32개여야 합니다.");
  }

  for (const stage of knockoutStages) {
    const count = localMatches.filter((match) => match.stage === stage).length;
    if (count !== expectedStageCounts[stage]) {
      throw new Error(
        `${stage} 로컬 경기 수가 ${expectedStageCounts[stage]}개가 아닙니다.`,
      );
    }
  }
}

function groupRemoteMatches(remoteMatches: FootballDataMatch[]) {
  const grouped = Object.fromEntries(
    knockoutStages.map((stage) => [stage, [] as FootballDataMatch[]]),
  ) as Record<KnockoutStage, FootballDataMatch[]>;
  const ids = new Set<number>();

  for (const match of remoteMatches) {
    const stage = normalizeStage(match.stage);
    if (!stage) continue;
    if (ids.has(match.id)) {
      throw new Error(`외부 경기 ID ${match.id}가 중복됐습니다.`);
    }
    ids.add(match.id);
    grouped[stage].push(match);
  }

  for (const stage of knockoutStages) {
    grouped[stage].sort(
      (first, second) =>
        new Date(first.utcDate).getTime() - new Date(second.utcDate).getTime(),
    );
    if (grouped[stage].length !== expectedStageCounts[stage]) {
      throw new Error(
        `${stage} 외부 경기 수가 ${expectedStageCounts[stage]}개가 아닙니다.`,
      );
    }
  }

  return grouped;
}

function sortLocalMatches(localMatches: LocalMatch[]) {
  return [...localMatches].sort((first, second) => {
    const stageOrder =
      knockoutStages.indexOf(first.stage) -
      knockoutStages.indexOf(second.stage);
    return stageOrder || localStageIndex(first.id) - localStageIndex(second.id);
  });
}

function findRemoteMatch(local: LocalMatch, stageMatches: FootballDataMatch[]) {
  if (local.external_id) {
    const externalIdMatch = stageMatches.find(
      (match) => String(match.id) === String(local.external_id),
    );
    if (externalIdMatch) return externalIdMatch;
  }

  const localHome = normalizeTeam(local.team_a);
  const localAway = normalizeTeam(local.team_b);
  const teamMatch = stageMatches.find((match) => {
    const homeNames = teamNames(match.homeTeam);
    const awayNames = teamNames(match.awayTeam);
    return (
      includesTeam(homeNames, localHome) && includesTeam(awayNames, localAway)
    );
  });
  return teamMatch ?? stageMatches[localStageIndex(local.id)];
}

function buildUpdate(
  local: LocalMatch,
  match: FootballDataMatch,
): FootballDataUpdate {
  const teamA = displayTeam(match.homeTeam);
  const teamB = displayTeam(match.awayTeam);
  if (!teamA || !teamB) {
    throw new Error(`외부 경기 ${match.id}의 팀 정보가 완전하지 않습니다.`);
  }

  const applyResult = match.status === "FINISHED";
  const result = applyResult ? buildResult(match) : emptyResult();
  return {
    id: local.id,
    external_id: String(match.id),
    team_a: teamA,
    team_b: teamB,
    team_a_crest: match.homeTeam.crest ?? null,
    team_b_crest: match.awayTeam.crest ?? null,
    kickoff: match.utcDate,
    synced_pre: true,
    apply_result: applyResult,
    ...result,
  };
}

function hasChanges(local: LocalMatch, update: FootballDataUpdate) {
  const externalChanged =
    String(local.external_id ?? "") !== update.external_id ||
    local.team_a !== update.team_a ||
    local.team_b !== update.team_b ||
    (local.team_a_crest ?? null) !== update.team_a_crest ||
    (local.team_b_crest ?? null) !== update.team_b_crest ||
    normalizeDate(local.kickoff) !== normalizeDate(update.kickoff) ||
    !local.synced_pre;
  if (externalChanged) return true;
  if (!update.apply_result) return false;
  return (
    local.result_team !== update.result_team ||
    local.result_regular !== update.result_regular ||
    local.result_home !== update.result_home ||
    local.result_away !== update.result_away ||
    local.result_pen_home !== update.result_pen_home ||
    local.result_pen_away !== update.result_pen_away ||
    local.result_duration !== update.result_duration
  );
}

function emptyResult() {
  return {
    result_team: null,
    result_regular: null,
    result_home: null,
    result_away: null,
    result_pen_home: null,
    result_pen_away: null,
    result_duration: null,
  } as const;
}

function winnerSide(
  match: FootballDataMatch,
  home: number | null,
  away: number | null,
) {
  if (match.score.winner === "HOME_TEAM") return "A" as const;
  if (match.score.winner === "AWAY_TEAM") return "B" as const;
  if (home == null || away == null || home === away) return null;
  return home > away ? ("A" as const) : ("B" as const);
}

function displayTeam(team: FootballDataMatch["homeTeam"]) {
  return String(team.shortName || team.name || "").trim();
}

function teamNames(team: FootballDataMatch["homeTeam"]) {
  return [team.name, team.shortName, team.tla].map(normalizeTeam);
}

function normalizeTeam(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function includesTeam(candidates: string[], target: string) {
  return candidates.some(
    (candidate) =>
      candidate &&
      target &&
      (candidate.includes(target) || target.includes(candidate)),
  );
}

function localStageIndex(id: string) {
  const match = id.match(/(\d+)$/);
  return match ? Math.max(0, Number(match[1]) - 1) : 0;
}

function numberOrNull(value?: number | null) {
  return value == null ? null : Number(value);
}

function normalizeDate(value: string | null) {
  if (!value) return "";
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? value : new Date(time).toISOString();
}
