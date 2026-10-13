import type { DieFace } from "@/lib/baseball-game/types";

export type BallFlight = {
  kind: "ground" | "fly" | "line" | "contact";
  label: string;
  path: string;
  target: { x: number; y: number };
  rotation: number;
};

export function getBallFlight(
  face?: DieFace,
  variation = 0,
): BallFlight | null {
  if (!face) return null;
  const flights: Partial<Record<DieFace, Omit<BallFlight, "rotation">>> = {
    C: {
      kind: "contact",
      label: "컨택",
      path: "M450 560 Q450 605 450 650",
      target: { x: 450, y: 650 },
    },
    GF: {
      kind: "ground",
      label: "1루 땅볼",
      path: "M450 650 Q495 605 540 560",
      target: { x: 540, y: 560 },
    },
    G3: {
      kind: "ground",
      label: "3루 땅볼",
      path: "M450 650 Q405 605 360 560",
      target: { x: 360, y: 560 },
    },
    GA: {
      kind: "ground",
      label: "유격수 땅볼",
      path: "M450 650 Q425 580 400 510",
      target: { x: 400, y: 510 },
    },
    PO: {
      kind: "fly",
      label: "내야 뜬공",
      path: "M450 650 Q398 515 445 490",
      target: { x: 445, y: 490 },
    },
    FO: {
      kind: "fly",
      label: "외야 뜬공",
      path: "M450 650 Q520 430 525 350",
      target: { x: 525, y: 350 },
    },
    F2: {
      kind: "fly",
      label: "좌익수 뜬공",
      path: "M450 650 Q320 430 230 330",
      target: { x: 230, y: 330 },
    },
    F3: {
      kind: "fly",
      label: "중견수 뜬공",
      path: "M450 650 Q450 420 450 250",
      target: { x: 450, y: 250 },
    },
    FA: {
      kind: "fly",
      label: "우익수 뜬공",
      path: "M450 650 Q580 430 670 330",
      target: { x: 670, y: 330 },
    },
    HIT: {
      kind: "line",
      label: "안타 방향 판정",
      path: "M450 650 Q450 440 450 320",
      target: { x: 450, y: 320 },
    },
    HR: {
      kind: "fly",
      label: "HOME RUN",
      path: "M450 650 Q530 350 490 60",
      target: { x: 490, y: 60 },
    },
    IH: {
      kind: "ground",
      label: "내야 안타",
      path: "M450 650 Q470 590 490 530",
      target: { x: 490, y: 530 },
    },
    L1: {
      kind: "line",
      label: "좌전 안타",
      path: "M450 650 Q345 485 270 390",
      target: { x: 270, y: 390 },
    },
    L2: {
      kind: "line",
      label: "좌중간 안타",
      path: "M450 650 Q350 400 300 275",
      target: { x: 300, y: 275 },
    },
    C1: {
      kind: "line",
      label: "중전 안타",
      path: "M450 650 Q450 470 450 370",
      target: { x: 450, y: 370 },
    },
    C2: {
      kind: "line",
      label: "중견수 앞 안타",
      path: "M450 650 Q450 410 450 290",
      target: { x: 450, y: 290 },
    },
    R1: {
      kind: "line",
      label: "우전 안타",
      path: "M450 650 Q555 485 630 390",
      target: { x: 630, y: 390 },
    },
    R2: {
      kind: "line",
      label: "우중간 안타",
      path: "M450 650 Q550 400 600 275",
      target: { x: 600, y: 275 },
    },
    D2: {
      kind: "fly",
      label: "좌중간 2루타",
      path: "M450 650 Q310 390 200 260",
      target: { x: 200, y: 260 },
    },
    D3: {
      kind: "fly",
      label: "중앙 펜스 2루타",
      path: "M450 650 Q450 340 450 180",
      target: { x: 450, y: 180 },
    },
    T3: {
      kind: "fly",
      label: "우중간 3루타",
      path: "M450 650 Q590 390 700 260",
      target: { x: 700, y: 260 },
    },
  };
  const flight = flights[face];
  if (!flight) return null;
  const maximumRotation =
    flight.kind === "contact"
      ? 0
      : flight.kind === "fly"
        ? 8
        : flight.kind === "line"
          ? 6
          : 5;
  return {
    ...flight,
    rotation: Math.max(-1, Math.min(1, variation)) * maximumRotation,
  };
}
