import { describe, expect, it } from "vitest";
import {
  calculateScore,
  createInitialState,
  isRoundLocked,
  isRoundOpen,
  joinFailureMessage,
  parsePick,
  teamFlagSource,
} from "./worldcup";

describe("월드컵 예측 규칙", () => {
  it("정규 결과와 최종 진출팀 적중 점수를 합산한다", () => {
    const state = createInitialState();
    state.predictions[0] = { qf1: { team: "A", regular: "draw" } };
    state.results.qf1 = { team: "A", regular: "draw" };

    expect(calculateScore(state, 0)).toBe(3);
  });

  it("운영 백엔드와 동일한 라운드별 경기 ID를 만든다", () => {
    const matchIds = createInitialState().matches.map((match) => match.id);

    expect(matchIds).toContain("r32_1");
    expect(matchIds).toContain("r16_1");
    expect(matchIds).toContain("qf1");
    expect(matchIds).toContain("sf1");
    expect(matchIds).not.toContain("qf_1");
    expect(matchIds).not.toContain("sf_1");
  });

  it("이전 라운드가 끝나야 다음 라운드를 연다", () => {
    const state = createInitialState();
    expect(isRoundOpen(state, "r16")).toBe(false);

    state.matches
      .filter((match) => match.stage === "r32")
      .forEach((match) => {
        state.results[match.id] = { team: "A", regular: "win" };
      });

    expect(isRoundOpen(state, "r16")).toBe(true);
  });

  it("라운드 첫 경기 시작 시 전체 라운드를 잠근다", () => {
    const state = createInitialState();
    state.matches[0]!.kickoff = "2026-07-20T10:00";

    expect(
      isRoundLocked(state, "r32", new Date("2026-07-20T09:59").getTime()),
    ).toBe(false);
    expect(
      isRoundLocked(state, "r32", new Date("2026-07-20T10:00").getTime()),
    ).toBe(true);
  });

  it("허용된 선택 문자열만 해석한다", () => {
    expect(parsePick("B:draw")).toEqual({ team: "B", regular: "draw" });
    expect(parsePick("C:win")).toBeNull();
  });

  it("이전 참가자의 로그인 차단 사유를 전용 문구로 안내한다", () => {
    expect(joinFailureMessage("historical")).toBe(
      "이전 참가 기록은 점수판에서만 볼 수 있으며 로그인할 수 없습니다.",
    );
  });

  it("동일한 4:3 국기 데이터셋으로 현재 토너먼트 팀을 표시한다", () => {
    const teams = [
      "South Africa",
      "Canada",
      "Brazil",
      "Japan",
      "Germany",
      "Paraguay",
      "Netherlands",
      "Morocco",
      "Ivory Coast",
      "Norway",
      "France",
      "Sweden",
      "Mexico",
      "Ecuador",
      "England",
      "Congo DR",
      "Belgium",
      "Senegal",
      "USA",
      "Bosnia-H.",
      "Spain",
      "Austria",
      "Portugal",
      "Croatia",
      "Switzerland",
      "Algeria",
      "Australia",
      "Egypt",
      "Argentina",
      "Cape Verde",
      "Colombia",
      "Ghana",
    ];

    expect(teams.map((team) => teamFlagSource(team))).toSatisfy(
      (sources: string[]) =>
        sources.every((source) =>
          /^https:\/\/cdn\.jsdelivr\.net\/npm\/flag-icons@7\.5\.0\/flags\/4x3\/.+\.svg$/.test(
            source,
          ),
        ),
    );
    expect(teamFlagSource("Argentina")).toMatch(/\/4x3\/ar\.svg$/);
  });

  it("API 팀명 별칭을 처리하고 알 수 없는 팀은 기존 이미지를 유지한다", () => {
    expect(teamFlagSource("Côte d’Ivoire")).toMatch(/\/4x3\/ci\.svg$/);
    expect(teamFlagSource("United States")).toMatch(/\/4x3\/us\.svg$/);
    expect(
      teamFlagSource("알 수 없는 팀", "https://example.com/crest.svg"),
    ).toBe("https://example.com/crest.svg");
  });
});
