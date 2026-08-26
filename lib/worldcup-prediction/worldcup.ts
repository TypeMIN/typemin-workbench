export const stages = ["r32", "r16", "qf", "sf", "third", "final"] as const;

export type Stage = (typeof stages)[number];
export type TeamSide = "A" | "B";
export type RegularPick = "win" | "draw";

export type Pick = {
  team: TeamSide;
  regular: RegularPick;
};

export type MatchResult = Pick & {
  home?: number | null;
  away?: number | null;
  penHome?: number | null;
  penAway?: number | null;
  duration?: string | null;
};

export type Match = {
  id: string;
  stage: Stage;
  label: string;
  teamA: string;
  teamB: string;
  kickoff: string;
  externalId: string;
  crestA: string;
  crestB: string;
};

export type WorldCupState = {
  participants: string[];
  pins: string[];
  registered: boolean[];
  matches: Match[];
  predictions: Record<number, Record<string, Pick>>;
  results: Record<string, MatchResult>;
  api: {
    lastSync: string;
    lastMessage: string;
  };
};

const FLAG_ICONS_VERSION = "7.5.0";

const teamFlagCodes: Record<string, string> = {
  algeria: "dz",
  argentina: "ar",
  australia: "au",
  austria: "at",
  belgium: "be",
  "bosnia h": "ba",
  "bosnia and herzegovina": "ba",
  brazil: "br",
  canada: "ca",
  "cabo verde": "cv",
  "cape verde": "cv",
  colombia: "co",
  "congo dr": "cd",
  "democratic republic of the congo": "cd",
  "dr congo": "cd",
  croatia: "hr",
  ecuador: "ec",
  egypt: "eg",
  england: "gb-eng",
  france: "fr",
  germany: "de",
  ghana: "gh",
  "cote d ivoire": "ci",
  "ivory coast": "ci",
  japan: "jp",
  mexico: "mx",
  morocco: "ma",
  netherlands: "nl",
  norway: "no",
  paraguay: "py",
  portugal: "pt",
  senegal: "sn",
  "south africa": "za",
  spain: "es",
  sweden: "se",
  switzerland: "ch",
  "united states": "us",
  "united states of america": "us",
  usa: "us",
};

function normalizeTeamName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function teamFlagSource(name: string, fallback = ""): string {
  const code = teamFlagCodes[normalizeTeamName(name)];
  return code
    ? `https://cdn.jsdelivr.net/npm/flag-icons@${FLAG_ICONS_VERSION}/flags/4x3/${code}.svg`
    : fallback;
}

export const stageLabels: Record<Stage, string> = {
  r32: "32강",
  r16: "16강",
  qf: "8강",
  sf: "4강",
  third: "3·4위전",
  final: "결승",
};

export const stageScores: Record<Stage, { regular: number; final: number }> = {
  r32: { regular: 1, final: 1 },
  r16: { regular: 1, final: 1 },
  qf: { regular: 2, final: 1 },
  sf: { regular: 4, final: 2 },
  third: { regular: 4, final: 2 },
  final: { regular: 6, final: 3 },
};

const stageMatchCounts: Record<Stage, number> = {
  r32: 16,
  r16: 8,
  qf: 4,
  sf: 2,
  third: 1,
  final: 1,
};

function buildMatches(): Match[] {
  return stages.flatMap((stage) =>
    Array.from({ length: stageMatchCounts[stage] }, (_, index) => {
      const number = index + 1;
      const singleMatchStage = stage === "third" || stage === "final";
      const compactMatchId = stage === "qf" || stage === "sf";
      return {
        id: singleMatchStage
          ? stage
          : compactMatchId
            ? `${stage}${number}`
            : `${stage}_${number}`,
        stage,
        label: singleMatchStage
          ? stageLabels[stage]
          : `${stageLabels[stage]} ${number}경기`,
        teamA: `팀 ${number * 2 - 1}`,
        teamB: `팀 ${number * 2}`,
        kickoff: "",
        externalId: "",
        crestA: "",
        crestB: "",
      };
    }),
  );
}

export function createInitialState(): WorldCupState {
  return {
    participants: Array.from(
      { length: 5 },
      (_, index) => `빈 자리 ${index + 1}`,
    ),
    pins: Array.from({ length: 5 }, () => ""),
    registered: Array.from({ length: 5 }, () => false),
    matches: buildMatches(),
    predictions: {},
    results: {},
    api: { lastSync: "", lastMessage: "" },
  };
}

export function parsePick(value: string): Pick | null {
  const [team, regular] = value.split(":");
  if (
    (team !== "A" && team !== "B") ||
    (regular !== "win" && regular !== "draw")
  ) {
    return null;
  }
  return { team, regular };
}

export function joinFailureMessage(reason?: string): string {
  if (reason === "historical") {
    return "이전 참가 기록은 점수판에서만 볼 수 있으며 로그인할 수 없습니다.";
  }
  if (reason === "full") return "참가 인원이 이미 5명입니다.";
  return "이름 또는 PIN을 확인해 주세요.";
}

export function formatPick(pick: Pick | undefined, match: Match): string {
  if (!pick) return "미제출";
  return `${pick.team === "A" ? match.teamA : match.teamB}(${pick.regular === "win" ? "승" : "무"})`;
}

export function calculateScore(
  state: WorldCupState,
  participantIndex: number,
): number {
  return state.matches.reduce((total, match) => {
    const pick = state.predictions[participantIndex]?.[match.id];
    const result = state.results[match.id];
    if (!pick || !result) return total;

    const score = stageScores[match.stage];
    const regularHit =
      result.regular === "draw"
        ? pick.regular === "draw"
        : pick.regular === "win" && pick.team === result.team;
    return (
      total +
      (regularHit ? score.regular : 0) +
      (pick.team === result.team ? score.final : 0)
    );
  }, 0);
}

export function isRoundComplete(state: WorldCupState, stage: Stage): boolean {
  const matches = state.matches.filter((match) => match.stage === stage);
  return (
    matches.length > 0 &&
    matches.every((match) => Boolean(state.results[match.id]))
  );
}

const feederStage: Partial<Record<Stage, Stage>> = {
  r16: "r32",
  qf: "r16",
  sf: "qf",
  third: "sf",
  final: "sf",
};

export function isRoundOpen(state: WorldCupState, stage: Stage): boolean {
  const feeder = feederStage[stage];
  return feeder ? isRoundComplete(state, feeder) : true;
}

export function firstKickoff(
  state: WorldCupState,
  stage: Stage,
): number | null {
  const times = state.matches
    .filter((match) => match.stage === stage && match.kickoff)
    .map((match) => new Date(match.kickoff).getTime())
    .filter((time) => !Number.isNaN(time));
  return times.length ? Math.min(...times) : null;
}

export function isRoundLocked(
  state: WorldCupState,
  stage: Stage,
  now = Date.now(),
): boolean {
  if (
    state.matches.some(
      (match) => match.stage === stage && state.results[match.id],
    )
  )
    return true;
  const kickoff = firstKickoff(state, stage);
  return kickoff === null ? false : now >= kickoff;
}

export function normalizeState(value: unknown): WorldCupState {
  const fallback = createInitialState();
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<WorldCupState>;

  return {
    participants: fallback.participants.map((name, index) =>
      String(candidate.participants?.[index] || name),
    ),
    pins: fallback.pins.map((pin, index) =>
      String(candidate.pins?.[index] || pin),
    ),
    registered: fallback.registered.map((registered, index) =>
      Boolean(candidate.registered?.[index] ?? registered),
    ),
    matches: fallback.matches.map((match) => {
      const saved = candidate.matches?.find((item) => item.id === match.id);
      return saved
        ? { ...match, ...saved, id: match.id, stage: match.stage }
        : match;
    }),
    predictions: candidate.predictions || {},
    results: candidate.results || {},
    api: {
      lastSync: String(candidate.api?.lastSync || ""),
      lastMessage: String(candidate.api?.lastMessage || ""),
    },
  };
}
