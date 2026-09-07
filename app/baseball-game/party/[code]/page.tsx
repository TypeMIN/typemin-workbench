import BaseballPartyScreen from "@/components/baseball-game/baseball-party-screen";

export default async function BaseballPartyPage(props: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await props.params;
  return <BaseballPartyScreen roomCode={code.toUpperCase()} />;
}
