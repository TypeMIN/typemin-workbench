import { projectPoint } from "@/lib/baseball-game/field-projection";
import type { FieldPoint, TeamSide } from "@/lib/baseball-game/types";

export type FigurePose = "ready" | "run" | "bat" | "crouch" | "pitch" | "ump";

export type FielderPosition =
  "P" | "C" | "1B" | "2B" | "SS" | "3B" | "LF" | "CF" | "RF";

/** Standard depths with nobody on, in the top-down field plane. */
export const FIELDER_SPOTS: Record<FielderPosition, FieldPoint> = {
  P: { x: 450, y: 562 },
  C: { x: 450, y: 668 },
  "1B": { x: 548, y: 530 },
  "2B": { x: 502, y: 490 },
  SS: { x: 398, y: 492 },
  "3B": { x: 352, y: 532 },
  LF: { x: 270, y: 330 },
  CF: { x: 450, y: 262 },
  RF: { x: 630, y: 330 },
};

export const BATTER_SPOT: FieldPoint = { x: 432, y: 650 };
export const UMPIRE_SPOT: FieldPoint = { x: 452, y: 684 };

// Shapes are about 26 units tall. Players are drawn several times life size
// against the bases so they still read on a phone, and shrink with depth.
const FIGURE_SCALE = 1.1;

const BODY: Record<FigurePose, string> = {
  ready:
    "M-3.4 -19 L3.4 -19 L4.6 -9 L6 0 L3 0 L1 -8 L-1 -8 L-3 0 L-6 0 L-4.6 -9 Z",
  run: "M-3 -19 L3.6 -18 L5.6 -10 L9 -2 L6.4 0 L2.6 -7 L-2 -6 L-7 0 L-9 -2 L-4.6 -10 Z",
  bat: "M-3.2 -20 L3.2 -20 L4.2 -9 L5.4 0 L2.6 0 L1 -8 L-1 -8 L-2.6 0 L-5.4 0 L-4.2 -9 Z",
  crouch:
    "M-4.6 -12 L4.6 -12 L6.4 -4 L7.4 0 L3.6 0 L2 -4 L-2 -4 L-3.6 0 L-7.4 0 L-6.4 -4 Z",
  pitch:
    "M-3.2 -20 L3.6 -19 L5 -10 L8.4 -1 L5.6 0 L1.6 -8 L-1.6 -8 L-4 0 L-6.6 0 L-4.6 -10 Z",
  ump: "M-5 -18 L5 -18 L6 -9 L6.4 0 L3 0 L1.4 -8 L-1.4 -8 L-3 0 L-6.4 0 L-6 -9 Z",
};

const HEAD_Y: Record<FigurePose, number> = {
  ready: -22.6,
  run: -22,
  bat: -23.6,
  crouch: -15.4,
  pitch: -23.4,
  ump: -21.6,
};

export function FieldFigure({
  at,
  className,
  pose,
  team,
  facing = 1,
}: {
  at: FieldPoint;
  className?: string;
  pose: FigurePose;
  team: TeamSide | "umpire";
  facing?: 1 | -1;
}) {
  const screen = projectPoint(at);
  const size = screen.scale * FIGURE_SCALE;
  return (
    <g
      className={`bbg-figure${className ? ` ${className}` : ""}`}
      data-pose={pose}
      data-team={team}
      style={{
        transform: `translate(${screen.x}px, ${screen.y}px) scale(${size * facing}, ${size})`,
      }}
    >
      <FigureShape pose={pose} />
    </g>
  );
}

/** Drawn at the origin, feet on y=0; callers place and scale it. */
export function FigureShape({ pose }: { pose: FigurePose }) {
  return (
    <>
      <ellipse className="bbg-figure-shadow" cx="0" cy="0.6" rx="7" ry="2" />
      <path className="bbg-figure-body" d={BODY[pose]} />
      <circle
        className="bbg-figure-head"
        cx={pose === "run" ? 1.6 : 0}
        cy={HEAD_Y[pose]}
        r="3.3"
      />
      {pose === "bat" ? (
        <path className="bbg-figure-bat" d="M2.6 -19 L9.6 -30" />
      ) : null}
    </>
  );
}

/** The fielder who goes after a ball landing at `target`. */
export function nearestFielder(target: FieldPoint): FielderPosition {
  let best: FielderPosition = "P";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [position, spot] of Object.entries(FIELDER_SPOTS) as Array<
    [FielderPosition, FieldPoint]
  >) {
    if (position === "C") continue;
    const distance = Math.hypot(spot.x - target.x, spot.y - target.y);
    if (distance < bestDistance) {
      best = position;
      bestDistance = distance;
    }
  }
  return best;
}
