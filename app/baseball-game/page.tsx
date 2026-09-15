import { randomInt } from "node:crypto";

import BaseballGameDebug from "@/components/baseball-game/baseball-game-debug";

export const dynamic = "force-dynamic";

export default function BaseballGamePage() {
  return <BaseballGameDebug initialSeed={randomInt(0, 0x1_0000_0000)} />;
}
