"use client";

import { useCallback, useState } from "react";

import type { GameEvent } from "@/lib/baseball-game/types";

type StageableView = { revision: number; eventLog: GameEvent[] };

/**
 * Everything around the stadium renders the newest view whose scenes have
 * finished playing. The stadium alone receives the latest view so it can
 * play the new scenes; scoreboards, panels and hands catch up afterwards.
 */
export function useStagedView<View extends StageableView>(latest: View) {
  const [presentedRevision, setPresentedRevision] = useState<number | null>(
    null,
  );
  const [staged, setStaged] = useState(latest);

  // A new game (restart) starts below the last presented revision.
  const restarted = latest.revision < staged.revision;
  if (restarted) setPresentedRevision(latest.revision);

  const canShowLatest =
    restarted ||
    presentedRevision === null ||
    !latest.eventLog.some((event) => event.revision > presentedRevision);
  if (canShowLatest && staged !== latest) setStaged(latest);

  const onPresentedRevision = useCallback((revision: number) => {
    setPresentedRevision((current) =>
      current === null ? revision : Math.max(current, revision),
    );
  }, []);

  const view = canShowLatest ? latest : staged;
  return {
    view,
    settled: view.revision === latest.revision,
    onPresentedRevision,
  };
}
