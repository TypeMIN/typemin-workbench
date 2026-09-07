import BaseballPartyJoin from "@/components/baseball-game/baseball-party-join";

export default async function BaseballPartyJoinPage(props: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await props.params;
  return <BaseballPartyJoin roomCode={code.toUpperCase()} />;
}
