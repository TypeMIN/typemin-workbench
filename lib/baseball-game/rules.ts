import type {
  BattingFace,
  DieFace,
  DieKind,
  HitFace,
  PitchFace,
} from "./types";

export const PITCH_DIE_FACES = [
  "S",
  "S",
  "SM",
  "F",
  "B",
  "B",
  "B",
  "B",
  "C",
  "C",
  "C",
  "C",
] as const satisfies readonly PitchFace[];

export const BATTING_DIE_FACES = [
  "GF",
  "G3",
  "GA",
  "PO",
  "FO",
  "F2",
  "F3",
  "FA",
  "HIT",
  "HIT",
  "HIT",
  "HR",
] as const satisfies readonly BattingFace[];

export const HIT_DIE_FACES = [
  "IH",
  "L1",
  "L2",
  "L2",
  "C1",
  "C2",
  "R1",
  "R2",
  "R2",
  "D2",
  "D3",
  "T3",
] as const satisfies readonly HitFace[];

export const DIE_FACES = {
  pitch: PITCH_DIE_FACES,
  batting: BATTING_DIE_FACES,
  hit: HIT_DIE_FACES,
} as const satisfies Record<DieKind, readonly DieFace[]>;

export const DIE_LABELS: Record<DieKind, string> = {
  pitch: "투구",
  batting: "타격",
  hit: "안타",
};

export const FACE_LABELS: Record<DieFace, string> = {
  S: "스트라이크",
  SM: "헛스윙",
  F: "파울",
  B: "볼",
  C: "컨택",
  GF: "선행주자 땅볼",
  G3: "3루 주자 진루 땅볼",
  GA: "모든 주자 진루 땅볼",
  PO: "내야 플라이",
  FO: "외야 플라이",
  F2: "2·3루 태그업 플라이",
  F3: "3루 태그업 플라이",
  FA: "모든 주자 태그업 플라이",
  HIT: "안타",
  HR: "홈런",
  IH: "내야 안타",
  L1: "좌전 1",
  L2: "좌전 2",
  C1: "중전 1",
  C2: "중전 2",
  R1: "우전 1",
  R2: "우전 2",
  D2: "2루타 D2",
  D3: "2루타 D3",
  T3: "3루타",
};

export function rollDie<K extends DieKind>(
  kind: K,
  random: () => number = Math.random,
): (typeof DIE_FACES)[K][number] {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("random 함수는 0 이상 1 미만의 값을 반환해야 합니다.");
  }
  const faces = DIE_FACES[kind];
  return faces[Math.floor(value * faces.length)];
}
