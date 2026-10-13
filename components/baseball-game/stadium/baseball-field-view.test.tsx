import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Bases, PresentationCue } from "@/lib/baseball-game/types";

import { getBallFlight } from "./ball-flight";
import { BaseballFieldView } from "./baseball-field-view";

const EMPTY: Bases = { first: false, second: false, third: false };
const SCORE = { away: 3, home: 1, awayName: "블루스타즈", homeName: "레드" };

function renderField(
  overrides: Partial<Parameters<typeof BaseballFieldView>[0]> = {},
) {
  return render(
    <BaseballFieldView
      ariaLabel="경기장"
      bases={EMPTY}
      battingTeam="away"
      cues={[]}
      flight={null}
      index={0}
      score={SCORE}
      sky="dusk"
      {...overrides}
    />,
  );
}

function battedBall(face: "F3" | "HR" | "GA"): PresentationCue {
  return { type: "batted_ball", face, variation: 0, label: face };
}

function translation(element: Element | null) {
  const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(
    (element as HTMLElement | null)?.style.transform ?? "",
  );
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

describe("BaseballFieldView", () => {
  afterEach(() => vi.restoreAllMocks());

  it("puts nine fielders, the batter and the umpire on an empty field", () => {
    const { container } = renderField();
    const figures = container.querySelectorAll(
      ".bbg-field-players .bbg-figure",
    );
    expect(figures).toHaveLength(11);
    expect(
      container.querySelectorAll('.bbg-figure[data-team="home"]'),
    ).toHaveLength(9);
    expect(
      container.querySelector('.bbg-batter-figure[data-pose="bat"]'),
    ).toHaveAttribute("data-team", "away");
    expect(container.querySelector(".bbg-base-runner")).toBeNull();
  });

  it("shows a runner leading off each occupied base", () => {
    const { container } = renderField({
      bases: { first: true, second: false, third: true },
    });
    expect(container.querySelectorAll(".bbg-base-runner")).toHaveLength(2);
    expect(
      container.querySelector('.bbg-field-base--first[data-occupied="true"]'),
    ).not.toBeNull();
  });

  it("sends the nearest fielder after a fly ball and runs the batter", () => {
    const cue = battedBall("F3");
    const { container } = renderField({
      cue,
      cues: [cue],
      flight: getBallFlight("F3", 0),
    });
    const chasers = container.querySelectorAll(".bbg-figure.is-chasing");
    expect(chasers).toHaveLength(1);
    expect(chasers[0]).toHaveAttribute("data-pose", "run");
    expect(container.querySelector(".bbg-batter-figure")).toHaveAttribute(
      "data-pose",
      "run",
    );
    expect(container.querySelector(".bbg-field-camera")).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("stops the outfielder at the wall on a home run", () => {
    const fly = battedBall("F3");
    const homeRun = battedBall("HR");
    const atFly = translation(
      renderField({
        cue: fly,
        cues: [fly],
        flight: getBallFlight("F3", 0),
      }).container.querySelector(".is-chasing"),
    );
    const atWall = translation(
      renderField({
        cue: homeRun,
        cues: [homeRun],
        flight: getBallFlight("HR", 0),
      }).container.querySelector(".is-chasing"),
    );
    expect(atFly && atWall).toBeTruthy();
    expect(atWall!.y).toBeLessThan(atFly!.y);
    // The board above center field stays above the chasing fielder.
    expect(atWall!.y).toBeGreaterThan(150);
  });

  it("draws a ball and a ground shadow that move together", () => {
    const cue = battedBall("F3");
    const { container } = renderField({
      cue,
      cues: [cue],
      flight: getBallFlight("F3", 0),
    });
    const ball = container.querySelector(".bbg-live-ball animateMotion");
    const shadow = container.querySelector(
      ".bbg-live-ball-shadow animateMotion",
    );
    const ballSteps = ball?.getAttribute("values")?.split(";") ?? [];
    const shadowSteps = shadow?.getAttribute("values")?.split(";") ?? [];
    expect(ballSteps.length).toBeGreaterThan(10);
    expect(ballSteps).toHaveLength(shadowSteps.length);
    expect(ball).toHaveAttribute("begin", "indefinite");
  });

  it("keeps the camera still when nothing is in play", () => {
    const { container } = renderField();
    expect(container.querySelector(".bbg-field-camera")).toHaveAttribute(
      "data-active",
      "false",
    );
    expect(container.querySelector(".bbg-field-overview")).toHaveAttribute(
      "data-sky",
      "dusk",
    );
  });

  it("drops decorative layers on low-end devices", () => {
    const cores = vi
      .spyOn(navigator, "hardwareConcurrency", "get")
      .mockReturnValue(2);
    const { container, unmount } = renderField();
    expect(container.querySelector(".bbg-field-overview")).toHaveAttribute(
      "data-detail",
      "low",
    );
    unmount();
    cores.mockReturnValue(8);
    expect(
      renderField().container.querySelector(".bbg-field-overview"),
    ).toHaveAttribute("data-detail", "full");
  });

  it("shows the presented score with short team names", () => {
    const { container } = renderField();
    expect(container.querySelector(".bbg-field-scoreboard")).toHaveTextContent(
      "블루스 3 : 1 레드",
    );
  });
});
