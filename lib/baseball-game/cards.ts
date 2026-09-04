import type { CardId, CardRole, CardTiming } from "./types";

export type CardDefinition = {
  id: CardId;
  role: CardRole;
  name: string;
  timing: CardTiming;
  copies: number;
  description: string;
};

export const CARD_DEFINITIONS: Record<CardId, CardDefinition> = {
  HBP: {
    id: "HBP",
    role: "offense",
    name: "몸에 맞는 공",
    timing: "after_pitch",
    copies: 2,
    description: "볼 판정을 대신해 타자가 출루하고 강제주자가 진루합니다.",
  },
  WP: {
    id: "WP",
    role: "offense",
    name: "폭투",
    timing: "after_pitch",
    copies: 3,
    description: "모든 주자가 한 베이스 진루한 뒤 원래 볼 판정을 처리합니다.",
  },
  BK: {
    id: "BK",
    role: "offense",
    name: "보크",
    timing: "before_pitch",
    copies: 2,
    description: "투구 전에 모든 주자가 한 베이스 진루합니다.",
  },
  POE: {
    id: "POE",
    role: "offense",
    name: "견제 송구 실책",
    timing: "before_pitch",
    copies: 2,
    description: "견제사를 무효로 하고 모든 주자가 한 베이스 진루합니다.",
  },
  SB2: {
    id: "SB2",
    role: "offense",
    name: "2루 도루",
    timing: "after_pitch",
    copies: 5,
    description: "1루 주자가 2루 도루를 시도합니다.",
  },
  SB3: {
    id: "SB3",
    role: "offense",
    name: "3루 도루",
    timing: "after_pitch",
    copies: 4,
    description: "2루 주자가 3루 도루를 시도합니다.",
  },
  SBH: {
    id: "SBH",
    role: "offense",
    name: "홈 도루",
    timing: "after_pitch",
    copies: 1,
    description: "3루 주자가 홈 도루를 시도합니다.",
  },
  SB: {
    id: "SB",
    role: "offense",
    name: "희생번트",
    timing: "after_contact",
    copies: 4,
    description: "타자는 아웃되고 모든 주자가 한 베이스 진루합니다.",
  },
  E: {
    id: "E",
    role: "offense",
    name: "수비 실책",
    timing: "after_batting",
    copies: 2,
    description: "타자와 모든 주자가 한 베이스 안전 진루합니다.",
  },
  CS2: {
    id: "CS2",
    role: "defense",
    name: "2루 도루 저지",
    timing: "after_pitch",
    copies: 3,
    description: "2루 도루를 시도한 주자를 아웃시킵니다.",
  },
  CS3: {
    id: "CS3",
    role: "defense",
    name: "3루 도루 저지",
    timing: "after_pitch",
    copies: 3,
    description: "3루 도루를 시도한 주자를 아웃시킵니다.",
  },
  CSH: {
    id: "CSH",
    role: "defense",
    name: "홈 도루 저지",
    timing: "after_pitch",
    copies: 1,
    description: "홈 도루를 시도한 주자를 아웃시킵니다.",
  },
  GDP: {
    id: "GDP",
    role: "defense",
    name: "땅볼 병살",
    timing: "after_batting",
    copies: 3,
    description: "가장 앞선 강제주자와 타자를 아웃시킵니다.",
  },
  PO1: {
    id: "PO1",
    role: "defense",
    name: "1루 견제",
    timing: "before_pitch",
    copies: 3,
    description: "투구 전에 1루 주자를 견제 아웃시킵니다.",
  },
  PO2: {
    id: "PO2",
    role: "defense",
    name: "2루 견제",
    timing: "before_pitch",
    copies: 2,
    description: "투구 전에 2루 주자를 견제 아웃시킵니다.",
  },
  BD: {
    id: "BD",
    role: "defense",
    name: "번트 수비",
    timing: "after_contact",
    copies: 3,
    description: "희생번트의 선행주자를 아웃시키고 타자를 1루에 둡니다.",
  },
  GBH: {
    id: "GBH",
    role: "defense",
    name: "주자 묶어두기",
    timing: "after_batting",
    copies: 3,
    description: "GA에서 주자를 묶어두고 타자만 아웃시킵니다.",
  },
};

export const CARD_DECK_COUNTS = {
  offense: ["HBP", "WP", "BK", "POE", "SB2", "SB3", "SBH", "SB", "E"],
  defense: ["CS2", "CS3", "CSH", "GDP", "PO1", "PO2", "BD", "GBH"],
} as const satisfies Record<CardRole, readonly CardId[]>;
