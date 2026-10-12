import type { Bases, GameEvent, HalfInning } from "./types";

export const HIGHLIGHT_LIMIT = 8;

export type Highlight = {
  revision: number;
  inning: number;
  half: HalfInning;
  runs: number;
  kind: "home_run" | "score" | "final";
  label: string;
};

/** Scoring plays and the final out, oldest first, capped to the biggest ones. */
export function getHighlights(
  eventLog: GameEvent[],
  limit = HIGHLIGHT_LIMIT,
): Highlight[] {
  const byRevision = new Map<number, GameEvent[]>();
  for (const event of eventLog) {
    const list = byRevision.get(event.revision) ?? [];
    list.push(event);
    byRevision.set(event.revision, list);
  }
  const highlights: Highlight[] = [];
  for (const [revision, events] of byRevision) {
    const runs = events.reduce((total, event) => total + event.runs, 0);
    const homeRun = events.some(
      (event) => event.face === "HR" || event.cardId === "HRC",
    );
    const final = events.some((event) => event.kind === "game_end");
    if (!runs && !homeRun && !final) continue;
    const first = events[0];
    const summary =
      events.find((event) => event.runs > 0)?.summary ??
      events.findLast((event) => event.summary)?.summary ??
      "";
    highlights.push({
      revision,
      inning: first.inning,
      half: first.half,
      runs,
      kind: homeRun ? "home_run" : runs ? "score" : "final",
      label: summary,
    });
  }
  if (highlights.length <= limit) return highlights;
  const final = highlights.filter((item) => item.kind === "final");
  const ranked = highlights
    .filter((item) => item.kind !== "final")
    .sort(
      (left, right) =>
        right.runs - left.runs ||
        Number(right.kind === "home_run") - Number(left.kind === "home_run"),
    )
    .slice(0, limit - final.length);
  return [...ranked, ...final].sort(
    (left, right) => left.revision - right.revision,
  );
}

/** Rebuilds the base state right after a revision from runner moves alone. */
export function getBasesAfterRevision(
  eventLog: GameEvent[],
  revision: number,
): Bases {
  const bases: Bases = { first: false, second: false, third: false };
  for (const event of eventLog) {
    if (event.revision > revision) break;
    if (event.kind === "half_inning") {
      bases.first = false;
      bases.second = false;
      bases.third = false;
      continue;
    }
    for (const move of event.moves) {
      if (move.from !== "batter") bases[move.from] = false;
    }
    for (const move of event.moves) {
      if (move.to === "first" || move.to === "second" || move.to === "third") {
        bases[move.to] = true;
      }
    }
  }
  return bases;
}

export function getEventsThrough(eventLog: GameEvent[], revision: number) {
  return eventLog.filter((event) => event.revision <= revision);
}
