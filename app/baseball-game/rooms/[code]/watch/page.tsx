import type { Metadata } from "next";

import BaseballRoomSpectator from "@/components/baseball-game/baseball-room-spectator";

export const metadata: Metadata = {
  title: { absolute: "야구 게임 관전" },
};

export default async function BaseballRoomWatchPage(props: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await props.params;
  return <BaseballRoomSpectator roomCode={code.toUpperCase()} />;
}
