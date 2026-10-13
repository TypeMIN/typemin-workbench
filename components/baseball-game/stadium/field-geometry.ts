import {
  fieldCircle,
  projectPoint,
  projectPolygon,
  projectSamples,
  sampleFieldPath,
  toPathData,
} from "@/lib/baseball-game/field-projection";
import type { FieldPoint } from "@/lib/baseball-game/types";

/*
 * Ground art in the top-down field plane. It never depends on game state, so
 * it is projected once at module load and every render reuses the strings.
 */

const HOME: FieldPoint = { x: 450, y: 650 };
const MOUND: FieldPoint = { x: 450, y: 560 };
const LEFT_POLE: FieldPoint = { x: 55, y: 263 };
const RIGHT_POLE: FieldPoint = { x: 845, y: 263 };
const FENCE = "M55 263 Q450 -24 845 263";
const GRASS_EDGE = "M77 279 Q450 18 823 279";
// Outline samples: enough that arcs stay smooth after projection.
const ARC_SAMPLES = 40;
const CURVE_SAMPLES = 64;
// Field units; the outfield wall is drawn this tall and the bleachers rise
// from its top edge to the back row.
const WALL_HEIGHT = 12;
const BLEACHER_HEIGHT = 120;
const BLEACHER_DEPTH = 1.22;
const BLEACHER_ROWS = 5;
const FOUL_POLE_HEIGHT = 120;
const MOW_BAND_WIDTH = 46;
const MOW_BANDS = 14;

function outline(d: string, samples = CURVE_SAMPLES) {
  return sampleFieldPath(d, samples);
}

function pushOut(point: FieldPoint, factor: number): FieldPoint {
  return {
    x: HOME.x + (point.x - HOME.x) * factor,
    y: HOME.y + (point.y - HOME.y) * factor,
  };
}

const fencePoints = outline(FENCE, ARC_SAMPLES);
const grassEdgePoints = outline(GRASS_EDGE, ARC_SAMPLES);

function bleacherBand(fromRow: number, toRow: number) {
  const depthAt = (row: number) =>
    1 + ((BLEACHER_DEPTH - 1) * row) / BLEACHER_ROWS;
  const heightAt = (row: number) =>
    WALL_HEIGHT + ((BLEACHER_HEIGHT - WALL_HEIGHT) * row) / BLEACHER_ROWS;
  const front = fencePoints.map((point) =>
    projectPoint(pushOut(point, depthAt(fromRow)), heightAt(fromRow)),
  );
  const back = fencePoints
    .map((point) =>
      projectPoint(pushOut(point, depthAt(toRow)), heightAt(toRow)),
    )
    .reverse();
  return `${toPathData([...front, ...back])} Z`;
}

function sideStands(side: "left" | "right") {
  const mirror = (point: FieldPoint) =>
    side === "left" ? point : { x: 900 - point.x, y: point.y };
  const inner = [
    { x: 385, y: 712 },
    { x: 10, y: 330 },
  ].map(mirror);
  const outer = [
    { x: 300, y: 790 },
    { x: -80, y: 400 },
  ].map(mirror);
  return `${toPathData([
    projectPoint(inner[0], WALL_HEIGHT * 0.5),
    projectPoint(inner[1], WALL_HEIGHT * 0.5),
    projectPoint(outer[1], BLEACHER_HEIGHT * 0.7),
    projectPoint(outer[0], BLEACHER_HEIGHT * 0.7),
  ])} Z`;
}

function mowBands() {
  const bands: string[] = [];
  for (let band = 1; band < MOW_BANDS; band += 2) {
    const inner = fieldCircle(HOME, band * MOW_BAND_WIDTH, 24, 220, 320);
    const outer = fieldCircle(HOME, (band + 1) * MOW_BAND_WIDTH, 24, 220, 320);
    bands.push(projectPolygon([...inner, ...outer.reverse()]));
  }
  return bands;
}

function lightTower(base: FieldPoint, height: number) {
  const foot = projectPoint(base);
  const top = projectPoint(base, height);
  return {
    pole: toPathData([foot, top]),
    lamp: { x: top.x, y: top.y, width: 34 * top.scale, height: 14 * top.scale },
  };
}

function scoreboard() {
  const corners = [
    projectPoint({ x: 380, y: -70 }, 150),
    projectPoint({ x: 520, y: -70 }, 150),
    projectPoint({ x: 520, y: -70 }, 82),
    projectPoint({ x: 380, y: -70 }, 82),
  ];
  const center = projectPoint({ x: 450, y: -70 }, 116);
  return {
    panel: `${toPathData(corners)} Z`,
    center,
    width: corners[1].x - corners[0].x,
  };
}

export const FIELD_ART = {
  foulGround: projectPolygon(
    outline("M450 760 L-140 200 Q450 -170 1040 200 Z", ARC_SAMPLES),
  ),
  bleachers: Array.from({ length: BLEACHER_ROWS }, (_, row) =>
    bleacherBand(row, row + 1),
  ),
  wall: `${toPathData([
    ...fencePoints.map((point) => projectPoint(point)),
    ...[...fencePoints]
      .reverse()
      .map((point) => projectPoint(point, WALL_HEIGHT)),
  ])} Z`,
  fence: toPathData(
    fencePoints.map((point) => projectPoint(point, WALL_HEIGHT)),
  ),
  sideStands: [sideStands("left"), sideStands("right")],
  warningTrack: projectPolygon([HOME, ...fencePoints]),
  outfield: projectPolygon([HOME, ...grassEdgePoints]),
  mowBands: mowBands(),
  infieldDirt: projectPolygon(
    outline(
      "M450 438 C507 443 558 491 571 548 C582 598 542 641 450 670 C358 641 318 598 329 548 C342 491 393 443 450 438",
    ),
  ),
  infieldGrass: projectPolygon(
    outline("M450 488 L522 560 L450 632 L378 560 L450 488", 8),
  ),
  baseLines: [
    toPathData(
      projectSamples(
        outline("M450 650 L540 560 L450 470 L360 560 L450 650", 8),
      ),
    ),
  ],
  foulLines: [LEFT_POLE, RIGHT_POLE].map((pole) =>
    toPathData(
      projectSamples(outline(`M${HOME.x} ${HOME.y} L${pole.x} ${pole.y}`, 12)),
    ),
  ),
  foulPoles: [LEFT_POLE, RIGHT_POLE].map((pole) =>
    toPathData([projectPoint(pole), projectPoint(pole, FOUL_POLE_HEIGHT)]),
  ),
  mound: projectPolygon(fieldCircle(MOUND, 20, 24)),
  rubber: toPathData([
    projectPoint({ x: 444, y: 560 }, 1),
    projectPoint({ x: 456, y: 560 }, 1),
  ]),
  homeDirt: projectPolygon(fieldCircle(HOME, 28, 24)),
  battersBoxes: [-1, 1].map((side) =>
    projectPolygon([
      { x: 450 + side * 8, y: 638 },
      { x: 450 + side * 22, y: 638 },
      { x: 450 + side * 22, y: 662 },
      { x: 450 + side * 8, y: 662 },
    ]),
  ),
  homePlate: projectPolygon([
    { x: 444, y: 646 },
    { x: 456, y: 646 },
    { x: 456, y: 651 },
    { x: 450, y: 656 },
    { x: 444, y: 651 },
  ]),
  lightTowers: [
    lightTower({ x: 60, y: 120 }, 250),
    lightTower({ x: 250, y: -60 }, 270),
    lightTower({ x: 650, y: -60 }, 270),
    lightTower({ x: 840, y: 120 }, 250),
  ],
  scoreboard: scoreboard(),
};

export const BASE_POINTS = {
  first: { x: 540, y: 560 },
  second: { x: 450, y: 470 },
  third: { x: 360, y: 560 },
} as const satisfies Record<string, FieldPoint>;

/** A base bag drawn flat on the ground plane. */
export function basePolygon(center: FieldPoint, half = 7) {
  return projectPolygon([
    { x: center.x, y: center.y - half },
    { x: center.x + half, y: center.y },
    { x: center.x, y: center.y + half },
    { x: center.x - half, y: center.y },
  ]);
}

/** A ground ring drawn as a projected ellipse. */
export function groundEllipse(center: FieldPoint, radius: number) {
  const screen = projectPoint(center);
  const edge = projectPoint({ x: center.x + radius, y: center.y });
  const depth = projectPoint({ x: center.x, y: center.y - radius });
  return {
    cx: screen.x,
    cy: screen.y,
    rx: Math.abs(edge.x - screen.x),
    ry: Math.max(1, Math.abs(screen.y - depth.y)),
  };
}
