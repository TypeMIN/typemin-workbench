import { createGame } from "../engine";
import type { GameState, TeamSide } from "../types";
import type { MultiplayerClockState } from "./shot-clock";

export type SeriesGame = {
  number: number;
  awayName: string;
  homeName: string;
  score: Record<TeamSide, number>;
  winnerName: string | null;
  forfeit: boolean;
};

export type MultiplayerSeries = {
  version: 1;
  games: SeriesGame[];
  rematchVotes: Record<TeamSide, boolean>;
};

export type SeriesView = {
  games: SeriesGame[];
  wins: Array<{ name: string; wins: number }>;
  rematchVotes: Record<TeamSide, boolean>;
};

export function createSeries(): MultiplayerSeries {
  return { version: 1, games: [], rematchVotes: { away: false, home: false } };
}

export function getFinalWinner(
  state: GameState,
  clock: MultiplayerClockState,
): TeamSide | null {
  if (clock.forfeitedBy) return clock.forfeitedBy === "away" ? "home" : "away";
  return state.winner;
}

export function isGameOver(
  state: GameState,
  clock: MultiplayerClockState,
): boolean {
  return state.phase === "finished" || clock.forfeitedBy !== null;
}

export function summarizeGame(
  state: GameState,
  clock: MultiplayerClockState,
  number: number,
): SeriesGame {
  const winner = getFinalWinner(state, clock);
  return {
    number,
    awayName: state.config.awayTeamName,
    homeName: state.config.homeTeamName,
    score: { ...state.score },
    winnerName: winner
      ? state.config[winner === "away" ? "awayTeamName" : "homeTeamName"]
      : null,
    forfeit: clock.forfeitedBy !== null,
  };
}

/**
 * Teams swap home and away for the rematch. Seats swap too, so every device
 * keeps its own team name. The revision keeps counting up because action log
 * rows are keyed by revision for the whole room.
 */
export function buildRematchState(previous: GameState, seed: number) {
  const next = createGame(
    {
      innings: previous.config.innings,
      awayTeamName: previous.config.homeTeamName,
      homeTeamName: previous.config.awayTeamName,
    },
    { seed },
  );
  next.revision = previous.revision + 1;
  return next;
}

export function buildSeriesView(
  series: MultiplayerSeries | null,
  state: GameState,
  clock: MultiplayerClockState,
): SeriesView {
  const base = series ?? createSeries();
  const games = isGameOver(state, clock)
    ? [...base.games, summarizeGame(state, clock, base.games.length + 1)]
    : base.games;
  const names = [state.config.awayTeamName, state.config.homeTeamName];
  return {
    games,
    wins: names.map((name) => ({
      name,
      wins: games.filter((game) => game.winnerName === name).length,
    })),
    rematchVotes: base.rematchVotes,
  };
}
