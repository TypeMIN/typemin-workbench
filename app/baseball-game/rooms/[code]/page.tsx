import BaseballMultiplayerRoom from "@/components/baseball-game/baseball-multiplayer-room";

export default async function BaseballMultiplayerRoomPage(props: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await props.params;
  return <BaseballMultiplayerRoom roomCode={code.toUpperCase()} />;
}
