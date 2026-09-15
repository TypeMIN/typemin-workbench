import type { CardDefinition } from "@/lib/baseball-game/cards";
import type { CardTiming } from "@/lib/baseball-game/types";

const CARD_TIMING_LABEL: Record<CardTiming, string> = {
  before_pitch: "투구 전",
  after_pitch: "투구 직후",
  after_contact: "공에 맞힌 뒤",
  after_batting: "타구 판정 후",
  after_hit: "안타 판정 후",
};

export function BaseballCardFace({
  definition,
}: {
  definition: CardDefinition;
}) {
  return (
    <>
      <b className="bbg-card-code">{definition.id}</b>
      <strong className="bbg-card-name">{definition.name}</strong>
      <small className="bbg-card-effect">{definition.description}</small>
      <em className="bbg-card-timing">
        {CARD_TIMING_LABEL[definition.timing]}
      </em>
    </>
  );
}
