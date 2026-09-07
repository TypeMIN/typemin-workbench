import { notFound } from "next/navigation";

import BaseballPartyController from "@/components/baseball-game/baseball-party-controller";
import type { TeamSide } from "@/lib/baseball-game/types";

function isTeamSide(value: string): value is TeamSide {
  return value === "away" || value === "home";
}

export default async function BaseballPartyControllerPage(props: {
  params: Promise<{ code: string; team: string }>;
}) {
  const { code, team } = await props.params;
  if (!isTeamSide(team)) notFound();
  return <BaseballPartyController roomCode={code.toUpperCase()} team={team} />;
}
