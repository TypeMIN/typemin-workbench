import BaseballPartyPlayer from "@/components/baseball-game/baseball-party-player";

export default async function BaseballPartyPlayPage(props: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await props.params;
  return <BaseballPartyPlayer roomCode={code.toUpperCase()} />;
}
