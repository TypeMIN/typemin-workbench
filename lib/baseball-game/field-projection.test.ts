import { describe, expect, it } from "vitest";

import {
  arcHeight,
  parseFieldPath,
  projectField,
  projectSamples,
  rotateAroundHome,
  sampleFieldPath,
  toMotionValues,
} from "./field-projection";

const HOME = { x: 450, y: 650 };
const FIRST = { x: 540, y: 560 };
const SECOND = { x: 450, y: 470 };
const THIRD = { x: 360, y: 560 };
const LEFT_POLE = { x: 77, y: 279 };
const RIGHT_POLE = { x: 823, y: 279 };
const CENTER_FENCE = { x: 450, y: 18 };

function project(point: { x: number; y: number }, z = 0) {
  return projectField(point.x, point.y, z);
}

describe("field projection", () => {
  it("keeps home plate fixed at full scale", () => {
    expect(project(HOME)).toEqual({ x: 450, y: 640, scale: 1 });
  });

  it("mirrors first and third base around the center line", () => {
    const first = project(FIRST);
    const third = project(THIRD);
    expect(first.y).toBeCloseTo(third.y);
    expect(first.x - 450).toBeCloseTo(450 - third.x);
    expect(project(SECOND).x).toBe(450);
  });

  it("shrinks and raises points as they move toward the fence", () => {
    const depths = [HOME, FIRST, SECOND, CENTER_FENCE].map((point) =>
      project(point),
    );
    for (let index = 1; index < depths.length; index += 1) {
      expect(depths[index].scale).toBeLessThan(depths[index - 1].scale);
      expect(depths[index].y).toBeLessThan(depths[index - 1].y);
    }
  });

  it("keeps the whole fair territory inside the 900×700 frame", () => {
    for (const point of [HOME, LEFT_POLE, RIGHT_POLE, CENTER_FENCE]) {
      const screen = project(point);
      expect(screen.x).toBeGreaterThanOrEqual(0);
      expect(screen.x).toBeLessThanOrEqual(900);
      expect(screen.y).toBeGreaterThanOrEqual(0);
      expect(screen.y).toBeLessThanOrEqual(700);
    }
  });

  it("lifts a point by its height without moving it sideways", () => {
    const ground = project(SECOND);
    const air = project(SECOND, 60);
    expect(air.x).toBe(ground.x);
    expect(air.y).toBeLessThan(ground.y);
  });

  it("does not flip points behind the camera", () => {
    const behind = projectField(450, 2_000);
    expect(Number.isFinite(behind.y)).toBe(true);
    expect(behind.y).toBeGreaterThan(640);
  });
});

describe("field paths", () => {
  it("parses the presentation layer's line and curve paths", () => {
    expect(parseFieldPath("M450 650 L540 560 L450 470")).toHaveLength(2);
    expect(parseFieldPath("M450 650 Q495 605 540 560")).toEqual([
      {
        kind: "Q",
        from: HOME,
        control: { x: 495, y: 605 },
        to: FIRST,
      },
    ]);
  });

  it("reads the cubic outlines of the ground art and ignores Z", () => {
    const segments = parseFieldPath("M450 438 C507 443 558 491 571 548 Z");
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe("C");
    expect(
      sampleFieldPath("M450 438 C507 443 558 491 571 548", 4).at(-1),
    ).toEqual({ x: 571, y: 548 });
  });

  it("samples every segment from start to end", () => {
    const points = sampleFieldPath("M450 650 L540 560 L450 470", 8);
    expect(points[0]).toEqual(HOME);
    expect(points).toContainEqual(FIRST);
    expect(points.at(-1)).toEqual(SECOND);
  });

  it("keeps ball and shadow motion in step with the same sample count", () => {
    const samples = sampleFieldPath("M450 650 Q450 420 450 250", 12);
    const shadow = toMotionValues(projectSamples(samples));
    const ball = toMotionValues(projectSamples(samples, arcHeight(120)));
    expect(shadow.split(";")).toHaveLength(ball.split(";").length);
    expect(ball.split(";")[0]).toBe(shadow.split(";")[0]);
    expect(ball.split(";").at(-1)).toBe(shadow.split(";").at(-1));
  });

  it("rotates spray angles around home", () => {
    const rotated = rotateAroundHome(SECOND, 90);
    expect(rotated.x).toBeCloseTo(630);
    expect(rotated.y).toBeCloseTo(650);
    expect(rotateAroundHome(HOME, 30)).toEqual(HOME);
  });
});
