import { describe, expect, it } from "vitest";
import {
  buildResult,
  knockoutStages,
  prepareFootballDataUpdates,
  type FootballDataMatch,
  type FootballDataUpdate,
  type LocalMatch,
} from "../../supabase/functions/_shared/football-data";

const stageFixtures = {
  r32: { remote: "LAST_32", count: 16 },
  r16: { remote: "LAST_16", count: 8 },
  qf: { remote: "QUARTER_FINALS", count: 4 },
  sf: { remote: "SEMI_FINALS", count: 2 },
  third: { remote: "THIRD_PLACE", count: 1 },
  final: { remote: "FINAL", count: 1 },
} as const;

describe("football-data.org 월드컵 변환", () => {
  it("정규시간 종료 결과를 변환한다", () => {
    expect(
      buildResult(
        remoteMatch({
          id: 1,
          stage: "FINAL",
          fullTime: { home: 2, away: 1 },
        }),
      ),
    ).toEqual({
      result_team: "A",
      result_regular: "win",
      result_home: 2,
      result_away: 1,
      result_pen_home: null,
      result_pen_away: null,
      result_duration: "REGULAR",
    });
  });

  it("연장전은 정규시간 무승부와 최종 승자를 함께 기록한다", () => {
    expect(
      buildResult(
        remoteMatch({
          id: 2,
          stage: "SEMI_FINALS",
          duration: "EXTRA_TIME",
          regularTime: { home: 1, away: 1 },
          extraTime: { home: 1, away: 0 },
          fullTime: { home: 2, away: 1 },
        }),
      ),
    ).toMatchObject({
      result_team: "A",
      result_regular: "draw",
      result_home: 2,
      result_away: 1,
      result_duration: "EXTRA_TIME",
    });
  });

  it("승부차기 점수를 본 경기 점수와 분리한다", () => {
    expect(
      buildResult(
        remoteMatch({
          id: 3,
          stage: "QUARTER_FINALS",
          duration: "PENALTY_SHOOTOUT",
          regularTime: { home: 1, away: 1 },
          extraTime: { home: 0, away: 0 },
          fullTime: { home: 1, away: 1 },
          penalties: { home: 4, away: 3 },
        }),
      ),
    ).toEqual({
      result_team: "A",
      result_regular: "draw",
      result_home: 1,
      result_away: 1,
      result_pen_home: 4,
      result_pen_away: 3,
      result_duration: "PENALTY_SHOOTOUT",
    });
  });

  it("32개 토너먼트 경기를 고유하게 연결하고 재실행해도 변경이 없다", () => {
    const locals = localMatches();
    const remotes = remoteMatches();
    const first = prepareFootballDataUpdates(locals, remotes);

    expect(first.total).toBe(32);
    expect(first.linked).toBe(32);
    expect(first.finished).toBe(32);
    expect(first.updates).toHaveLength(32);
    expect(
      new Set(first.updates.map((update) => update.external_id)).size,
    ).toBe(32);

    const synced = locals.map((local) => {
      const update = first.updates.find((item) => item.id === local.id);
      return update ? applyUpdate(local, update) : local;
    });
    expect(prepareFootballDataUpdates(synced, remotes).updates).toEqual([]);
  });

  it("단계별 외부 경기 수가 다르면 반영 전에 거부한다", () => {
    const remotes = remoteMatches().filter((match) => match.stage !== "FINAL");

    expect(() => prepareFootballDataUpdates(localMatches(), remotes)).toThrow(
      "final 외부 경기 수가 1개가 아닙니다.",
    );
  });
});

function localMatches(): LocalMatch[] {
  return knockoutStages.flatMap((stage) =>
    Array.from({ length: stageFixtures[stage].count }, (_, index) => ({
      id:
        stage === "third" || stage === "final"
          ? stage
          : stage === "qf" || stage === "sf"
            ? `${stage}${index + 1}`
            : `${stage}_${index + 1}`,
      stage,
      team_a: `팀 ${index * 2 + 1}`,
      team_b: `팀 ${index * 2 + 2}`,
      team_a_crest: null,
      team_b_crest: null,
      external_id: null,
      synced_pre: false,
      kickoff: null,
      result_team: null,
      result_regular: null,
      result_home: null,
      result_away: null,
      result_pen_home: null,
      result_pen_away: null,
      result_duration: null,
    })),
  );
}

function remoteMatches(): FootballDataMatch[] {
  let id = 1000;
  return knockoutStages.flatMap((stage) =>
    Array.from({ length: stageFixtures[stage].count }, (_, index) =>
      remoteMatch({
        id: id++,
        stage: stageFixtures[stage].remote,
        date: new Date(Date.UTC(2026, 5, index + 1)).toISOString(),
        home: `${stage} 홈 ${index + 1}`,
        away: `${stage} 원정 ${index + 1}`,
        fullTime: { home: 2, away: 1 },
      }),
    ),
  );
}

function remoteMatch({
  id,
  stage,
  date = "2026-07-19T19:00:00Z",
  home = "대한민국",
  away = "일본",
  duration = "REGULAR",
  regularTime,
  extraTime,
  penalties,
  fullTime,
}: {
  id: number;
  stage: string;
  date?: string;
  home?: string;
  away?: string;
  duration?: string;
  regularTime?: { home: number; away: number };
  extraTime?: { home: number; away: number };
  penalties?: { home: number; away: number };
  fullTime: { home: number; away: number };
}): FootballDataMatch {
  return {
    id,
    stage,
    utcDate: date,
    status: "FINISHED",
    homeTeam: { name: home, shortName: home, crest: `https://a/${id}.svg` },
    awayTeam: { name: away, shortName: away, crest: `https://b/${id}.svg` },
    score: {
      winner: "HOME_TEAM",
      duration,
      regularTime,
      extraTime,
      penalties,
      fullTime,
    },
  };
}

function applyUpdate(
  local: LocalMatch,
  update: FootballDataUpdate,
): LocalMatch {
  return {
    ...local,
    external_id: update.external_id,
    team_a: update.team_a,
    team_b: update.team_b,
    team_a_crest: update.team_a_crest,
    team_b_crest: update.team_b_crest,
    kickoff: update.kickoff,
    synced_pre: update.synced_pre,
    result_team: update.result_team,
    result_regular: update.result_regular,
    result_home: update.result_home,
    result_away: update.result_away,
    result_pen_home: update.result_pen_home,
    result_pen_away: update.result_pen_away,
    result_duration: update.result_duration,
  };
}
