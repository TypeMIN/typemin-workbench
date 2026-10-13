"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";

import {
  arcHeight,
  projectPoint,
  projectSamples,
  rotateAroundHome,
  sampleFieldPath,
  toMotionValues,
  toPathData,
} from "@/lib/baseball-game/field-projection";
import type {
  Bases,
  DieFace,
  FieldPoint,
  PitchLocation,
  PresentationCue,
  RunnerMove,
  TeamSide,
} from "@/lib/baseball-game/types";

import type { BallFlight } from "./ball-flight";
import {
  BASE_POINTS,
  FIELD_ART,
  basePolygon,
  groundEllipse,
} from "./field-geometry";
import {
  BATTER_SPOT,
  FIELDER_SPOTS,
  FieldFigure,
  FigureShape,
  UMPIRE_SPOT,
  nearestFielder,
  type FielderPosition,
} from "./field-figures";

export type FieldSky = "dusk" | "twilight" | "night";

// Samples per animated path; ball and shadow share the count so they stay
// in step frame by frame.
const FLIGHT_SAMPLES = 24;
const ROUTE_SAMPLES = 16;
const PLAY_MOTION_MS = 820;
const PITCH_MOTION_MS = 420;
// Throws are flat line drives across the infield, measured in field units.
const THROW_PEAK = 22;
const PITCH_RELEASE_HEIGHT = 16;
const PITCH_PLATE_HEIGHT = 6;
// A runner leads a step off the bag toward the next base.
const LEAD_OFF = 12;
// Camera: deep plays stay wide, infield plays punch in; never past 1.6x.
const MAX_ZOOM = 1.6;
const INFIELD_ZOOM = 1.45;
const OUTFIELD_ZOOM = 1.22;
const INFIELD_SCALE_THRESHOLD = 0.68;
// The camera eases only part of the way to the action so the frame edges
// never pull past the drawn stadium.
const CAMERA_FOLLOW = 0.55;
const FRAME_CENTER = { x: 450, y: 380 };
// The fence sits 530–553 field units from home; a fielder chasing a ball
// over it stops on the warning track.
const MAX_CHASE_DISTANCE = 505;

// Devices at or under these budgets skip the crowd, lamp glow and mowing
// layers; the play itself draws the same everywhere.
const LOW_END_CORES = 4;
const LOW_END_MEMORY_GB = 4;

function isLowEndDevice() {
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  return (
    (navigator.hardwareConcurrency ?? LOW_END_CORES + 1) <= LOW_END_CORES ||
    (memory !== undefined && memory <= LOW_END_MEMORY_GB)
  );
}

function subscribeToNothing() {
  return () => {};
}

const NEXT_BASE: Record<keyof typeof BASE_POINTS, FieldPoint> = {
  first: BASE_POINTS.second,
  second: BASE_POINTS.third,
  third: { x: 450, y: 650 },
};

export function BaseballFieldView({
  ariaLabel,
  bases,
  battingTeam,
  beatId,
  cue,
  cues,
  face,
  flight,
  index,
  lastPitch,
  score,
  sky,
}: {
  ariaLabel: string;
  bases: Bases;
  battingTeam: TeamSide;
  beatId?: string;
  cue?: PresentationCue;
  cues: PresentationCue[];
  face?: DieFace;
  flight: BallFlight | null;
  index: number;
  lastPitch?: PitchLocation;
  score: { away: number; home: number; awayName: string; homeName: string };
  sky: FieldSky;
}) {
  const ids = useId().replace(/:/g, "");
  const lowDetail = useSyncExternalStore(
    subscribeToNothing,
    isLowEndDevice,
    () => false,
  );
  const fielding: TeamSide = battingTeam === "away" ? "home" : "away";
  const chase = chaseTarget(cues, index, flight);
  const chaser = chase ? nearestFielder(chase) : null;
  const camera = cameraFocus(cue, flight);
  const movingRunner = cue?.type === "runner_move" ? cue.move : null;
  const batterRunning =
    movingRunner?.from === "batter" || cue?.type === "batted_ball";
  const fielders = (Object.keys(FIELDER_SPOTS) as FielderPosition[]).sort(
    (left, right) => FIELDER_SPOTS[left].y - FIELDER_SPOTS[right].y,
  );

  return (
    <svg
      aria-label={ariaLabel}
      className="bbg-field-overview"
      data-detail={lowDetail ? "low" : "full"}
      data-sky={sky}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      viewBox="0 0 900 700"
    >
      <defs>
        <linearGradient id={`${ids}-sky`} x1="0" x2="0" y1="0" y2="1">
          <stop className="bbg-sky-top" offset="0" />
          <stop className="bbg-sky-mid" offset="0.55" />
          <stop className="bbg-sky-low" offset="1" />
        </linearGradient>
        <linearGradient id={`${ids}-grass`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0f4d34" />
          <stop offset="0.6" stopColor="#16683f" />
          <stop offset="1" stopColor="#1b7a49" />
        </linearGradient>
        <radialGradient id={`${ids}-lamp`}>
          <stop offset="0" stopColor="rgb(255 246 214 / 85%)" />
          <stop offset="1" stopColor="rgb(255 246 214 / 0%)" />
        </radialGradient>
        <pattern
          height="5"
          id={`${ids}-crowd`}
          patternUnits="userSpaceOnUse"
          width="6"
        >
          <circle className="bbg-crowd-dot" cx="1.5" cy="1.5" r="1.1" />
          <circle className="bbg-crowd-dot is-alt" cx="4.5" cy="3.8" r="1" />
        </pattern>
        <clipPath id={`${ids}-outfield`}>
          <path d={FIELD_ART.outfield} />
        </clipPath>
      </defs>

      <g
        className="bbg-field-camera"
        data-active={camera !== null}
        style={camera ? { transform: camera } : undefined}
      >
        <rect
          className="bbg-field-sky"
          fill={`url(#${ids}-sky)`}
          height="1400"
          width="2000"
          x="-550"
          y="-600"
        />
        <rect
          className="bbg-foul-ground"
          height="1000"
          width="2000"
          x="-550"
          y="330"
        />
        <g aria-hidden="true" className="bbg-light-towers">
          {FIELD_ART.lightTowers.map((tower) => (
            <g key={tower.pole}>
              <circle
                className="bbg-light-glow"
                cx={tower.lamp.x}
                cy={tower.lamp.y}
                fill={`url(#${ids}-lamp)`}
                r={tower.lamp.width * 2.2}
              />
              <path className="bbg-light-pole" d={tower.pole} />
              <rect
                className="bbg-light-lamp"
                height={tower.lamp.height}
                rx="1.5"
                width={tower.lamp.width}
                x={tower.lamp.x - tower.lamp.width / 2}
                y={tower.lamp.y - tower.lamp.height}
              />
            </g>
          ))}
        </g>
        <path className="bbg-foul-ground" d={FIELD_ART.foulGround} />
        {FIELD_ART.sideStands.map((stand) => (
          <g key={stand}>
            <path className="bbg-side-stands" d={stand} />
            <path
              className="bbg-crowd-fill"
              d={stand}
              fill={`url(#${ids}-crowd)`}
              opacity="0.5"
            />
          </g>
        ))}
        {FIELD_ART.bleachers.map((row, rowIndex) => (
          <g key={row}>
            <path
              className="bbg-stands-ring"
              d={row}
              data-row={rowIndex % 2 === 0 ? "even" : "odd"}
            />
            <path
              className="bbg-crowd-fill"
              d={row}
              fill={`url(#${ids}-crowd)`}
              opacity="0.65"
            />
          </g>
        ))}
        <g aria-hidden="true" className="bbg-field-scoreboard">
          <path d={FIELD_ART.scoreboard.panel} />
          <text
            fontSize={FIELD_ART.scoreboard.width / 7.5}
            textAnchor="middle"
            x={FIELD_ART.scoreboard.center.x}
            y={FIELD_ART.scoreboard.center.y}
          >
            {`${shortName(score.awayName)} ${score.away} : ${score.home} ${shortName(score.homeName)}`}
          </text>
        </g>
        <path className="bbg-outfield-wall" d={FIELD_ART.wall} />
        <path className="bbg-fence" d={FIELD_ART.fence} />
        <path className="bbg-warning-track" d={FIELD_ART.warningTrack} />
        <path
          className="bbg-outfield"
          d={FIELD_ART.outfield}
          fill={`url(#${ids}-grass)`}
        />
        <g clipPath={`url(#${ids}-outfield)`}>
          {FIELD_ART.mowBands.map((band) => (
            <path className="bbg-mow-band" d={band} key={band} />
          ))}
        </g>
        <path className="bbg-infield-dirt" d={FIELD_ART.infieldDirt} />
        <path className="bbg-infield-grass" d={FIELD_ART.infieldGrass} />
        {FIELD_ART.baseLines.map((line) => (
          <path className="bbg-base-line" d={line} key={line} />
        ))}
        {FIELD_ART.foulLines.map((line) => (
          <path className="bbg-foul-line-svg" d={line} key={line} />
        ))}
        {FIELD_ART.foulPoles.map((pole) => (
          <path className="bbg-foul-pole" d={pole} key={pole} />
        ))}
        <path className="bbg-mound-dirt" d={FIELD_ART.mound} />
        <path className="bbg-mound-rubber" d={FIELD_ART.rubber} />
        <path className="bbg-home-dirt" d={FIELD_ART.homeDirt} />
        {FIELD_ART.battersBoxes.map((box) => (
          <path className="bbg-batters-box" d={box} key={box} />
        ))}
        <g className="bbg-field-home">
          <path d={FIELD_ART.homePlate} />
        </g>
        {(Object.keys(BASE_POINTS) as Array<keyof typeof BASE_POINTS>).map(
          (base) => (
            <g
              aria-hidden="true"
              className={`bbg-field-base bbg-field-base--${base}`}
              data-occupied={bases[base]}
              key={base}
            >
              <path d={basePolygon(BASE_POINTS[base])} />
            </g>
          ),
        )}

        {lastPitch && cue?.type !== "pitch" ? (
          <path className="bbg-last-pitch-path" d={pitchPath(lastPitch)} />
        ) : null}

        <g className="bbg-field-players" aria-hidden="true">
          {fielders
            .filter((position) => position !== "C")
            .map((position) => (
              <FieldFigure
                at={
                  position === chaser && chase ? chase : FIELDER_SPOTS[position]
                }
                className={position === chaser ? "is-chasing" : undefined}
                key={position}
                pose={
                  position === chaser
                    ? "run"
                    : position === "P"
                      ? "pitch"
                      : "ready"
                }
                team={fielding}
              />
            ))}
          {(Object.keys(BASE_POINTS) as Array<keyof typeof BASE_POINTS>)
            .filter((base) => bases[base] && movingRunner?.from !== base)
            .map((base) => (
              <FieldFigure
                at={leadOff(base)}
                className="bbg-base-runner"
                key={base}
                pose="ready"
                team={battingTeam}
              />
            ))}
          <FieldFigure at={UMPIRE_SPOT} facing={-1} pose="ump" team="umpire" />
          <FieldFigure at={FIELDER_SPOTS.C} pose="crouch" team={fielding} />
          {movingRunner?.from === "batter" ? null : (
            <FieldFigure
              at={batterRunning ? { x: 470, y: 630 } : BATTER_SPOT}
              className="bbg-batter-figure"
              pose={batterRunning ? "run" : "bat"}
              team={battingTeam}
            />
          )}
        </g>

        {flight ? (
          <BallFlightVisual
            face={face}
            flight={flight}
            key={`flight-${beatId ?? face}`}
          />
        ) : null}
        {cue?.type === "pitch" ? (
          <PitchFlight key={`pitch-${beatId}`} location={cue.location} />
        ) : null}
        {cue?.type === "throw" ? (
          <ThrowCue cue={cue} key={`throw-${beatId}`} />
        ) : null}
        {cue?.type === "catch" ? <CatchCue location={cue.location} /> : null}
        {cue?.type === "runner_move" ? (
          <RunnerCue cue={cue} key={`runner-${beatId}`} team={battingTeam} />
        ) : null}
      </g>
    </svg>
  );
}

function BallFlightVisual({
  face,
  flight,
}: {
  face?: DieFace;
  flight: BallFlight;
}) {
  const ground = sampleFieldPath(flight.path, FLIGHT_SAMPLES).map((point) =>
    rotateAroundHome(point, flight.rotation),
  );
  const target = rotateAroundHome(flight.target, flight.rotation);
  const shadow = projectSamples(ground);
  const air = projectSamples(ground, flightHeight(flight, target));
  const landing = groundEllipse(target, 24);
  const label = projectPoint(target, flight.kind === "fly" ? 18 : 6);
  return (
    <g
      aria-label={`${face ?? ""} ${flight.label} 타구 궤적`}
      className="bbg-ball-flight"
      data-kind={flight.kind}
      data-variation={flight.rotation.toFixed(2)}
      role="img"
    >
      <path className="bbg-ball-trail-shadow" d={toPathData(shadow)} />
      <path className="bbg-ball-trail-glow" d={toPathData(air)} />
      <path className="bbg-ball-trail" d={toPathData(air)} />
      {flight.kind === "ground" ? (
        <g className="bbg-ground-bounces">
          {[0.34, 0.67].map((share) => {
            const point = shadow[Math.round(share * (shadow.length - 1))];
            return (
              <circle
                cx={point.x}
                cy={point.y}
                key={share}
                r={5 * point.scale}
              />
            );
          })}
        </g>
      ) : null}
      <ellipse
        className="bbg-ball-landing bbg-ball-landing--outer"
        cx={landing.cx}
        cy={landing.cy}
        rx={landing.rx}
        ry={landing.ry}
      />
      <ellipse
        className="bbg-ball-landing bbg-ball-landing--inner"
        cx={landing.cx}
        cy={landing.cy}
        rx={landing.rx * 0.42}
        ry={landing.ry * 0.42}
      />
      <MovingDot
        className="bbg-live-ball-shadow"
        durationMs={PLAY_MOTION_MS}
        points={shadow}
        radius={5}
      />
      <MovingDot
        className="bbg-live-ball"
        durationMs={PLAY_MOTION_MS}
        points={air}
        radius={6}
      />
      <g
        className="bbg-flight-label"
        transform={`translate(${label.x} ${label.y - 27})`}
      >
        <rect height="29" rx="14" width="112" x="-56" y="-17" />
        <text dy="2" textAnchor="middle">
          {flight.label}
        </text>
      </g>
    </g>
  );
}

function flightHeight(flight: BallFlight, target: FieldPoint) {
  const distance = Math.hypot(target.x - 450, target.y - 650);
  if (flight.kind === "fly") return arcHeight(Math.max(140, distance * 0.45));
  if (flight.kind === "line") return arcHeight(distance * 0.08);
  if (flight.kind === "ground") {
    return (t: number) => Math.abs(Math.sin(t * Math.PI * 3)) * 9 * (1 - t);
  }
  return () => 0;
}

function MovingDot({
  className,
  durationMs,
  points,
  radius,
}: {
  className: string;
  durationMs: number;
  points: Array<{ x: number; y: number; scale: number }>;
  radius: number;
}) {
  const start = points[0];
  return (
    <circle
      className={className}
      cx={start.x}
      cy={start.y}
      r={radius * start.scale}
    >
      <Motion durationMs={durationMs} origin={start} points={points} />
    </circle>
  );
}

/**
 * SMIL timelines start with the document, so an animation mounted mid-game
 * would begin already finished. It waits instead and starts on mount, moving
 * relative to where its element is drawn.
 */
function Motion({
  durationMs,
  origin,
  points,
}: {
  durationMs: number;
  origin: { x: number; y: number };
  points: Array<{ x: number; y: number }>;
}) {
  const ref = useRef<SVGAnimateMotionElement>(null);
  useEffect(() => {
    ref.current?.beginElement?.();
  }, []);
  return (
    <animateMotion
      begin="indefinite"
      calcMode="linear"
      dur={`${durationMs}ms`}
      fill="freeze"
      ref={ref}
      values={toMotionValues(
        points.map((point) => ({
          x: point.x - origin.x,
          y: point.y - origin.y,
        })),
      )}
    />
  );
}

function pitchSamples(location: PitchLocation) {
  const path = `M450 555 Q${430 + location.x * 0.4} 600 ${438 + location.x * 0.24} 650`;
  return projectSamples(
    sampleFieldPath(path, ROUTE_SAMPLES),
    (t) =>
      PITCH_RELEASE_HEIGHT + (PITCH_PLATE_HEIGHT - PITCH_RELEASE_HEIGHT) * t,
  );
}

function pitchPath(location: PitchLocation) {
  return toPathData(pitchSamples(location));
}

function PitchFlight({ location }: { location: PitchLocation }) {
  const points = pitchSamples(location);
  return (
    <g className="bbg-pitch-flight">
      <path d={toPathData(points)} />
      <MovingDot
        className="bbg-pitch-ball"
        durationMs={PITCH_MOTION_MS}
        points={points}
        radius={6}
      />
    </g>
  );
}

function ThrowCue({
  cue,
}: {
  cue: Extract<PresentationCue, { type: "throw" }>;
}) {
  const ground = sampleFieldPath(cue.path, ROUTE_SAMPLES);
  const shadow = projectSamples(ground);
  const air = projectSamples(ground, arcHeight(THROW_PEAK));
  const target = groundEllipse(cue.to, 23);
  return (
    <g className="bbg-throw-cue" data-kind={cue.kind}>
      <path className="bbg-throw-route-shadow" d={toPathData(shadow)} />
      <path className="bbg-throw-route" d={toPathData(air)} />
      <ellipse
        className="bbg-throw-target bbg-throw-target--outer"
        cx={target.cx}
        cy={target.cy}
        rx={target.rx}
        ry={target.ry}
      />
      <ellipse
        className="bbg-throw-target bbg-throw-target--inner"
        cx={target.cx}
        cy={target.cy}
        rx={target.rx * 0.44}
        ry={target.ry * 0.44}
      />
      <MovingDot
        className="bbg-live-throw-shadow"
        durationMs={PLAY_MOTION_MS}
        points={shadow}
        radius={6}
      />
      <MovingDot
        className="bbg-live-throw"
        durationMs={PLAY_MOTION_MS}
        points={air}
        radius={6}
      />
    </g>
  );
}

function CatchCue({ location }: { location: FieldPoint }) {
  const ring = groundEllipse(location, 29);
  const glove = projectPoint(location, 14);
  return (
    <g className="bbg-catch-cue">
      <ellipse
        className="bbg-catch-ring bbg-catch-ring--outer"
        cx={ring.cx}
        cy={ring.cy}
        rx={ring.rx}
        ry={ring.ry}
      />
      <ellipse
        className="bbg-catch-ring bbg-catch-ring--inner"
        cx={ring.cx}
        cy={ring.cy}
        rx={ring.rx * 0.62}
        ry={ring.ry * 0.62}
      />
      <g transform={`translate(${glove.x} ${glove.y}) scale(${glove.scale})`}>
        <path className="bbg-catch-glove" d="M-9 1 L0 -9 L9 1 L0 10 Z" />
        <circle className="bbg-catch-ball" r="5" />
      </g>
    </g>
  );
}

function RunnerCue({
  cue,
  team,
}: {
  cue: Extract<PresentationCue, { type: "runner_move" }>;
  team: TeamSide;
}) {
  const route = projectSamples(sampleFieldPath(cue.path, ROUTE_SAMPLES));
  const origin = groundEllipse(cue.origin, 11);
  const destination = groundEllipse(cue.destination, 17);
  const size =
    (projectPoint(cue.origin).scale + projectPoint(cue.destination).scale) / 2;
  return (
    <g className="bbg-runner-cue" data-out={cue.move.to === "out"}>
      <path className="bbg-runner-route-shadow" d={toPathData(route)} />
      <path className="bbg-runner-route" d={toPathData(route)} />
      <ellipse
        className="bbg-runner-origin"
        cx={origin.cx}
        cy={origin.cy}
        rx={origin.rx}
        ry={origin.ry}
      />
      <ellipse
        className="bbg-runner-destination"
        cx={destination.cx}
        cy={destination.cy}
        rx={destination.rx}
        ry={destination.ry}
      />
      <g
        className="bbg-live-runner"
        transform={`translate(${route[0].x} ${route[0].y})`}
      >
        <Motion durationMs={PLAY_MOTION_MS} origin={route[0]} points={route} />
        <g
          className="bbg-figure"
          data-pose="run"
          data-team={team}
          transform={`scale(${size * 1.1 * runnerFacing(cue.move)} ${size * 1.1})`}
        >
          <FigureShape pose="run" />
        </g>
      </g>
    </g>
  );
}

function runnerFacing(move: RunnerMove): 1 | -1 {
  return move.from === "batter" || move.from === "first" ? 1 : -1;
}

function leadOff(base: keyof typeof BASE_POINTS): FieldPoint {
  const from = BASE_POINTS[base];
  const to = NEXT_BASE[base];
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  return {
    x: from.x + ((to.x - from.x) / length) * LEAD_OFF,
    y: from.y + ((to.y - from.y) / length) * LEAD_OFF,
  };
}

/** Where a fielder is heading in this scene, if anywhere. */
function chaseTarget(
  cues: PresentationCue[],
  index: number,
  flight: BallFlight | null,
): FieldPoint | null {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const cue = cues[cursor];
    if (!cue) continue;
    if (cue.type === "catch") return cue.location;
    if (cue.type === "batted_ball") {
      return flight && flight.kind !== "contact"
        ? insideFence(rotateAroundHome(flight.target, flight.rotation))
        : null;
    }
  }
  return null;
}

function insideFence(point: FieldPoint): FieldPoint {
  const dx = point.x - 450;
  const dy = point.y - 650;
  const distance = Math.hypot(dx, dy);
  if (distance <= MAX_CHASE_DISTANCE) return point;
  const share = MAX_CHASE_DISTANCE / distance;
  return { x: 450 + dx * share, y: 650 + dy * share };
}

function cameraFocus(
  cue: PresentationCue | undefined,
  flight: BallFlight | null,
) {
  const target =
    cue?.type === "batted_ball" && flight && flight.kind !== "contact"
      ? rotateAroundHome(flight.target, flight.rotation)
      : cue?.type === "catch"
        ? cue.location
        : cue?.type === "throw"
          ? cue.to
          : cue?.type === "runner_move"
            ? cue.destination
            : null;
  if (!target) return null;
  const screen = projectPoint(target);
  const zoom = Math.min(
    MAX_ZOOM,
    screen.scale >= INFIELD_SCALE_THRESHOLD ? INFIELD_ZOOM : OUTFIELD_ZOOM,
  );
  const focusX = FRAME_CENTER.x + (screen.x - FRAME_CENTER.x) * CAMERA_FOLLOW;
  const focusY = FRAME_CENTER.y + (screen.y - FRAME_CENTER.y) * CAMERA_FOLLOW;
  return `translate(${FRAME_CENTER.x}px, ${FRAME_CENTER.y}px) scale(${zoom}) translate(${-focusX}px, ${-focusY}px)`;
}

function shortName(name: string) {
  return [...name].slice(0, 3).join("");
}
