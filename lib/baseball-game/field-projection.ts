import type { FieldPoint } from "./types";

/**
 * Broadcast camera behind and above home plate. Field data stays in the
 * 900×700 top-down plane (home at 450,650; second base at 450,470) and is
 * only projected when drawn, so every device projects the same scene.
 */
const HOME = { x: 450, y: 650 };
// Distance from the camera to home in field units; smaller means a wider lens.
const CAMERA_DEPTH = 520;
// Where home plate and the vanishing horizon land on screen.
const SCREEN_HOME_Y = 640;
const SCREEN_HORIZON_Y = -40;
// Spreads the field across the 900-wide frame so both foul poles stay in view.
const LATERAL_SPREAD = 1.7;
// Keeps points behind the camera from flipping through the vanishing point.
const MIN_FORWARD = -CAMERA_DEPTH * 0.6;

export type ScreenPoint = { x: number; y: number; scale: number };

export function projectField(x: number, y: number, z = 0): ScreenPoint {
  const forward = Math.max(MIN_FORWARD, HOME.y - y);
  const scale = CAMERA_DEPTH / (CAMERA_DEPTH + forward);
  return {
    x: HOME.x + (x - HOME.x) * scale * LATERAL_SPREAD,
    y:
      SCREEN_HORIZON_Y +
      (SCREEN_HOME_Y - SCREEN_HORIZON_Y) * scale -
      z * scale * LATERAL_SPREAD,
    scale,
  };
}

export function projectPoint(point: FieldPoint, z = 0) {
  return projectField(point.x, point.y, z);
}

type Segment =
  | { kind: "L"; from: FieldPoint; to: FieldPoint }
  | { kind: "Q"; from: FieldPoint; control: FieldPoint; to: FieldPoint }
  | {
      kind: "C";
      from: FieldPoint;
      control: FieldPoint;
      control2: FieldPoint;
      to: FieldPoint;
    };

const PATH_TOKEN = /([MLQCZ])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;

/** Parses absolute M/L/Q/C paths: presentation routes and field outlines. */
export function parseFieldPath(d: string): Segment[] {
  const tokens = [...d.matchAll(PATH_TOKEN)].map((match) => match[0]);
  const segments: Segment[] = [];
  let cursor: FieldPoint | null = null;
  let command = "";
  let index = 0;
  const read = () => {
    const point = {
      x: Number(tokens[index]),
      y: Number(tokens[index + 1]),
    };
    index += 2;
    return point;
  };
  while (index < tokens.length) {
    if (/^[MLQCZ]$/i.test(tokens[index])) {
      command = tokens[index].toUpperCase();
      index += 1;
      continue;
    }
    if (command === "M") {
      cursor = read();
      command = "L";
    } else if (command === "L" && cursor) {
      const to = read();
      segments.push({ kind: "L", from: cursor, to });
      cursor = to;
    } else if (command === "Q" && cursor) {
      const control = read();
      const to = read();
      segments.push({ kind: "Q", from: cursor, control, to });
      cursor = to;
    } else if (command === "C" && cursor) {
      const control = read();
      const control2 = read();
      const to = read();
      segments.push({ kind: "C", from: cursor, control, control2, to });
      cursor = to;
    } else {
      break;
    }
  }
  return segments;
}

function pointOnSegment(segment: Segment, t: number): FieldPoint {
  if (segment.kind === "L") {
    return {
      x: segment.from.x + (segment.to.x - segment.from.x) * t,
      y: segment.from.y + (segment.to.y - segment.from.y) * t,
    };
  }
  const inverse = 1 - t;
  if (segment.kind === "C") {
    const a = inverse * inverse * inverse;
    const b = 3 * inverse * inverse * t;
    const c = 3 * inverse * t * t;
    const d = t * t * t;
    return {
      x:
        a * segment.from.x +
        b * segment.control.x +
        c * segment.control2.x +
        d * segment.to.x,
      y:
        a * segment.from.y +
        b * segment.control.y +
        c * segment.control2.y +
        d * segment.to.y,
    };
  }
  return {
    x:
      inverse * inverse * segment.from.x +
      2 * inverse * t * segment.control.x +
      t * t * segment.to.x,
    y:
      inverse * inverse * segment.from.y +
      2 * inverse * t * segment.control.y +
      t * t * segment.to.y,
  };
}

/**
 * Samples a field path at evenly spaced parameters. Each segment gets the
 * same share of samples, so a multi-base run keeps its rhythm per base.
 */
export function sampleFieldPath(d: string, samples: number): FieldPoint[] {
  const segments = parseFieldPath(d);
  if (!segments.length) return [];
  const perSegment = Math.max(1, Math.round(samples / segments.length));
  const points: FieldPoint[] = [segments[0].from];
  for (const segment of segments) {
    for (let step = 1; step <= perSegment; step += 1) {
      points.push(pointOnSegment(segment, step / perSegment));
    }
  }
  return points;
}

/** A parabola that starts and ends on the ground and peaks at `peak`. */
export function arcHeight(peak: number) {
  return (t: number) => 4 * peak * t * (1 - t);
}

export function projectSamples(
  points: FieldPoint[],
  height: (t: number) => number = () => 0,
) {
  const last = Math.max(1, points.length - 1);
  return points.map((point, index) =>
    projectPoint(point, height(index / last)),
  );
}

export function toPathData(points: Array<{ x: number; y: number }>) {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${round(point.x)} ${round(point.y)}`,
    )
    .join(" ");
}

/** `animateMotion` values: equal time per sample keeps ball and shadow in step. */
export function toMotionValues(points: Array<{ x: number; y: number }>) {
  return points.map((point) => `${round(point.x)},${round(point.y)}`).join(";");
}

export function projectPolygon(points: FieldPoint[], z = 0) {
  return `${toPathData(points.map((point) => projectPoint(point, z)))} Z`;
}

/** Points on a circle in the field plane, for mounds, dirt cuts and arcs. */
export function fieldCircle(
  center: FieldPoint,
  radius: number,
  samples: number,
  fromDegrees = 0,
  toDegrees = 360,
) {
  const points: FieldPoint[] = [];
  for (let step = 0; step <= samples; step += 1) {
    const angle =
      ((fromDegrees + ((toDegrees - fromDegrees) * step) / samples) * Math.PI) /
      180;
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    });
  }
  return points;
}

export function rotateAroundHome(point: FieldPoint, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const x = point.x - HOME.x;
  const y = point.y - HOME.y;
  return {
    x: HOME.x + x * Math.cos(radians) - y * Math.sin(radians),
    y: HOME.y + x * Math.sin(radians) + y * Math.cos(radians),
  };
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
