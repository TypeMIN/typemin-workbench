import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createGame } from "../engine";
import type { TeamSide } from "../types";
import type { SeatVisibility, StoredSeatPresence } from "./presence";
import { seatTokenHash } from "./security";
import { REACTION_COOLDOWN_MS, REACTION_VISIBLE_MS } from "./reactions";
import {
  callMultiplayerTimeout,
  claimMultiplayerForfeit,
  getMultiplayerSnapshot,
  heartbeatMultiplayerSeat,
  sendMultiplayerReaction,
  submitMultiplayerCommand,
  timeoutIdempotencyKey,
  voteMultiplayerRematch,
} from "./service";
import {
  DECISION_LIMIT_MS,
  FORFEIT_AFTER_CONSECUTIVE_TIMEOUTS,
  PRESENTATION_SYNC_BUFFER_MS,
  RECONNECT_GRACE_MS,
  TIMEOUT_EXTENSION_MS,
  createClockState,
} from "./shot-clock";
import type { MultiplayerStorage } from "./storage";
import type {
  MultiplayerClockUpdateInput,
  MultiplayerCommitInput,
  MultiplayerReactionInput,
  MultiplayerRematchInput,
  MultiplayerCommitResult,
  MultiplayerRoomRecord,
} from "./types";

const AWAY_TOKEN = "away-seat-token";
const HOME_TOKEN = "home-seat-token";
const START = Date.parse("2026-10-13T00:00:00.000Z");
const FIRST_PITCH_DEADLINE =
  START + PRESENTATION_SYNC_BUFFER_MS + DECISION_LIMIT_MS.awaiting_pitch;

class TestStorage implements MultiplayerStorage {
  room: MultiplayerRoomRecord = {
    id: randomUUID(),
    roomCode: "ABC234",
    status: "playing",
    state: createGame({
      innings: 3,
      awayTeamName: "원정",
      homeTeamName: "홈",
    }),
    revision: 0,
    revisionStartedAt: new Date(START).toISOString(),
    clock: null,
    reactions: [],
    series: null,
    expiresAt: new Date(START + 24 * 60 * 60_000).toISOString(),
  };
  seats = new Map<TeamSide, string>([
    ["away", seatTokenHash(AWAY_TOKEN)],
    ["home", seatTokenHash(HOME_TOKEN)],
  ]);
  idempotency = new Map<string, number>();
  presence = new Map<TeamSide, StoredSeatPresence>([
    [
      "away",
      { lastSeenAt: new Date(START).toISOString(), visibility: "visible" },
    ],
    [
      "home",
      { lastSeenAt: new Date(START).toISOString(), visibility: "visible" },
    ],
  ]);
  commits: MultiplayerCommitInput[] = [];

  async createRoom() {
    return structuredClone(this.room);
  }

  async getRoom(roomCode: string) {
    return roomCode === this.room.roomCode ? structuredClone(this.room) : null;
  }

  async getSeatContext(roomId: string, tokenHash: string) {
    let seat: TeamSide | null = null;
    for (const [team, hash] of this.seats) {
      if (roomId === this.room.id && hash === tokenHash) seat = team;
    }
    return {
      seat,
      occupied: {
        away: roomId === this.room.id && this.seats.has("away"),
        home: roomId === this.room.id && this.seats.has("home"),
      },
      presence: {
        away: this.presence.get("away") ?? null,
        home: this.presence.get("home") ?? null,
      },
    };
  }

  async touchSeat(
    roomId: string,
    tokenHash: string,
    visibility: SeatVisibility,
  ) {
    for (const [team, hash] of this.seats) {
      if (roomId === this.room.id && hash === tokenHash) {
        this.presence.set(team, {
          lastSeenAt: new Date(Date.now()).toISOString(),
          visibility,
        });
        return team;
      }
    }
    return null;
  }

  async updateClock(input: MultiplayerClockUpdateInput) {
    if (
      input.roomId !== this.room.id ||
      this.room.status !== "playing" ||
      input.revision !== this.room.revision ||
      JSON.stringify(input.expectedClock) !== JSON.stringify(this.room.clock)
    ) {
      return "conflict" as const;
    }
    this.room.clock = structuredClone(input.clock);
    if (input.finish) this.room.status = "finished";
    return "applied" as const;
  }

  async pushReaction(input: MultiplayerReactionInput) {
    const now = Date.now();
    if (
      this.room.reactions.some(
        (item) =>
          item.team === input.team &&
          now - Date.parse(item.at) < input.cooldownMs,
      )
    ) {
      return "cooldown" as const;
    }
    this.room.reactions = [
      ...this.room.reactions,
      {
        id: randomUUID(),
        team: input.team,
        kind: input.kind,
        at: new Date(now).toISOString(),
      },
    ].slice(-input.limit);
    return "applied" as const;
  }

  async voteRematch(input: MultiplayerRematchInput) {
    if (
      this.room.status !== "finished" ||
      input.revision !== this.room.revision ||
      JSON.stringify(input.expectedSeries) !== JSON.stringify(this.room.series)
    ) {
      return "conflict" as const;
    }
    this.room.series = structuredClone(input.series);
    if (!input.start) return "applied" as const;
    this.room.state = structuredClone(input.start.newState);
    this.room.revision = input.start.newState.revision;
    this.room.clock = structuredClone(input.start.clock);
    this.room.status = "playing";
    const away = this.seats.get("away")!;
    this.seats.set("away", this.seats.get("home")!);
    this.seats.set("home", away);
    return "applied" as const;
  }

  async getIdempotencyRevision(roomId: string, idempotencyKey: string) {
    return roomId === this.room.id
      ? (this.idempotency.get(idempotencyKey) ?? null)
      : null;
  }

  async claimHomeSeat(_roomCode: string, tokenHash: string) {
    if (this.seats.has("home")) return false;
    this.seats.set("home", tokenHash);
    this.room.status = "playing";
    return true;
  }

  async commitAction(
    input: MultiplayerCommitInput,
  ): Promise<MultiplayerCommitResult> {
    const duplicate = this.idempotency.get(input.idempotencyKey);
    if (duplicate !== undefined) {
      return { status: "duplicate", revision: duplicate };
    }
    if (
      input.roomId !== this.room.id ||
      input.expectedRevision !== this.room.revision
    ) {
      return { status: "conflict" };
    }
    this.commits.push(input);
    this.room.state = structuredClone(input.newState);
    this.room.revision = input.newState.revision;
    this.room.revisionStartedAt = new Date(Date.now()).toISOString();
    this.room.clock = structuredClone(input.clock);
    this.room.status =
      input.newState.phase === "finished" ? "finished" : "playing";
    this.idempotency.set(input.idempotencyKey, this.room.revision);
    return { status: "applied", revision: this.room.revision };
  }
}

afterEach(() => {
  vi.useRealTimers();
});

function at(ms: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(ms);
}

function markOnline(storage: TestStorage, team: TeamSide) {
  storage.presence.set(team, {
    lastSeenAt: new Date(Date.now()).toISOString(),
    visibility: "visible",
  });
}

function markOffline(storage: TestStorage, team: TeamSide) {
  storage.presence.set(team, {
    lastSeenAt: new Date(START - 60_000).toISOString(),
    visibility: "visible",
  });
}

describe("baseball multiplayer service", () => {
  it("returns only the seated team's hand and never returns RNG state", async () => {
    const storage = new TestStorage();
    const away = await getMultiplayerSnapshot("ABC234", AWAY_TOKEN, storage);
    const home = await getMultiplayerSnapshot("ABC234", HOME_TOKEN, storage);

    expect(away.view.cards.offense.hand).toHaveLength(4);
    expect(away.view.cards.defense.hand).toBeNull();
    expect(home.view.cards.offense.hand).toBeNull();
    expect(home.view.cards.defense.hand).toHaveLength(4);
    expect(away.view).not.toHaveProperty("rng");
    expect(home.view).not.toHaveProperty("rng");
    expect(away.isYourTurn).toBe(false);
    expect(home.isYourTurn).toBe(true);
  });

  it("rejects a command from the team that does not own the turn", async () => {
    const storage = new TestStorage();
    await expect(
      submitMultiplayerCommand(
        "ABC234",
        AWAY_TOKEN,
        {
          command: { type: "SELECT_PITCH", target: "strike" },
          expectedRevision: 0,
          idempotencyKey: randomUUID(),
        },
        storage,
      ),
    ).rejects.toMatchObject({
      code: "NOT_YOUR_TURN",
    });
  });

  it("commits one server-side roll and treats a retry as idempotent", async () => {
    const storage = new TestStorage();
    const idempotencyKey = randomUUID();
    const first = await submitMultiplayerCommand(
      "ABC234",
      HOME_TOKEN,
      {
        command: { type: "SELECT_PITCH", target: "strike" },
        expectedRevision: 0,
        idempotencyKey,
      },
      storage,
    );
    const retry = await submitMultiplayerCommand(
      "ABC234",
      HOME_TOKEN,
      {
        command: { type: "SELECT_PITCH", target: "strike" },
        expectedRevision: 0,
        idempotencyKey,
      },
      storage,
    );

    expect(first.view.revision).toBe(1);
    expect(retry.view.revision).toBe(1);
    expect(storage.idempotency).toHaveLength(1);
  });

  it("rejects stale revisions with a different idempotency key", async () => {
    const storage = new TestStorage();
    await submitMultiplayerCommand(
      "ABC234",
      HOME_TOKEN,
      {
        command: { type: "SELECT_PITCH", target: "strike" },
        expectedRevision: 0,
        idempotencyKey: randomUUID(),
      },
      storage,
    );
    await expect(
      submitMultiplayerCommand(
        "ABC234",
        HOME_TOKEN,
        {
          command: { type: "SELECT_PITCH", target: "strike" },
          expectedRevision: 0,
          idempotencyKey: randomUUID(),
        },
        storage,
      ),
    ).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
    });
  });

  it("requires a valid seat token", async () => {
    const storage = new TestStorage();
    await expect(
      getMultiplayerSnapshot("ABC234", "wrong-token", storage),
    ).rejects.toMatchObject({
      code: "SEAT_REQUIRED",
    });
  });

  it("reports the opponent's real presence instead of seat occupancy", async () => {
    at(START + 1_000);
    const storage = new TestStorage();
    await heartbeatMultiplayerSeat("ABC234", HOME_TOKEN, "hidden", storage);
    const away = await getMultiplayerSnapshot("ABC234", AWAY_TOKEN, storage);
    expect(away.opponent.presence).toBe("away");

    markOffline(storage, "home");
    const later = await getMultiplayerSnapshot("ABC234", AWAY_TOKEN, storage);
    expect(later.opponent.presence).toBe("offline");
  });

  it("rejects a heartbeat without a valid seat", async () => {
    const storage = new TestStorage();
    await expect(
      heartbeatMultiplayerSeat("ABC234", "wrong-token", "visible", storage),
    ).rejects.toMatchObject({ code: "SEAT_REQUIRED" });
  });

  it("leaves the game untouched before the deadline", async () => {
    at(FIRST_PITCH_DEADLINE - 1);
    const storage = new TestStorage();
    const snapshot = await getMultiplayerSnapshot(
      "ABC234",
      AWAY_TOKEN,
      storage,
    );
    expect(snapshot.view.revision).toBe(0);
    expect(snapshot.clock.deadlineAt).toBe(FIRST_PITCH_DEADLINE);
  });

  it("auto-resolves an expired decision exactly once across devices", async () => {
    at(FIRST_PITCH_DEADLINE + 1);
    const storage = new TestStorage();
    markOnline(storage, "home");
    const [away, home] = await Promise.all([
      getMultiplayerSnapshot("ABC234", AWAY_TOKEN, storage),
      getMultiplayerSnapshot("ABC234", HOME_TOKEN, storage),
    ]);
    expect(storage.commits).toHaveLength(1);
    expect(storage.commits[0]).toMatchObject({
      actorTeam: "home",
      idempotencyKey: timeoutIdempotencyKey(storage.room.id, 0),
    });
    expect(storage.commits[0].action.type).toBe("SELECT_PITCH");
    expect(Math.max(away.view.revision, home.view.revision)).toBe(1);
    const latest = await getMultiplayerSnapshot("ABC234", AWAY_TOKEN, storage);
    expect(latest.clock.lastTimeout).toEqual({ revision: 1, team: "home" });
    expect(latest.clock.consecutiveTimeouts.home).toBe(1);
  });

  it("gives an offline decider one reconnect grace before auto-resolving", async () => {
    at(FIRST_PITCH_DEADLINE + 1);
    const storage = new TestStorage();
    markOffline(storage, "home");
    const graced = await getMultiplayerSnapshot("ABC234", AWAY_TOKEN, storage);
    expect(graced.view.revision).toBe(0);
    expect(graced.clock.graceActive).toBe(true);
    expect(graced.clock.deadlineAt).toBe(
      FIRST_PITCH_DEADLINE + RECONNECT_GRACE_MS,
    );

    at(FIRST_PITCH_DEADLINE + RECONNECT_GRACE_MS + 1);
    const resolved = await getMultiplayerSnapshot(
      "ABC234",
      AWAY_TOKEN,
      storage,
    );
    expect(resolved.view.revision).toBe(1);
  });

  it("rejects a late decision after the server auto-resolved it", async () => {
    at(FIRST_PITCH_DEADLINE + 1);
    const storage = new TestStorage();
    markOnline(storage, "home");
    await expect(
      submitMultiplayerCommand(
        "ABC234",
        HOME_TOKEN,
        {
          command: { type: "SELECT_PITCH", target: "strike" },
          expectedRevision: 0,
          idempotencyKey: randomUUID(),
        },
        storage,
      ),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(storage.commits).toHaveLength(1);
  });

  it("extends the deadline with a called timeout and spends one", async () => {
    at(START + 5_000);
    const storage = new TestStorage();
    const snapshot = await callMultiplayerTimeout(
      "ABC234",
      HOME_TOKEN,
      0,
      storage,
    );
    expect(snapshot.clock.deadlineAt).toBe(
      FIRST_PITCH_DEADLINE + TIMEOUT_EXTENSION_MS,
    );
    expect(snapshot.clock.timeoutsRemaining).toEqual({ away: 2, home: 1 });
    await callMultiplayerTimeout("ABC234", HOME_TOKEN, 0, storage);
    await expect(
      callMultiplayerTimeout("ABC234", HOME_TOKEN, 0, storage),
    ).rejects.toMatchObject({ code: "INVALID_ACTION" });
  });

  it("only lets the deciding team call a timeout", async () => {
    at(START + 5_000);
    const storage = new TestStorage();
    await expect(
      callMultiplayerTimeout("ABC234", AWAY_TOKEN, 0, storage),
    ).rejects.toMatchObject({ code: "NOT_YOUR_TURN" });
  });

  it("allows a forfeit claim only after repeated opponent timeouts", async () => {
    at(START + 5_000);
    const storage = new TestStorage();
    await expect(
      claimMultiplayerForfeit("ABC234", AWAY_TOKEN, storage),
    ).rejects.toMatchObject({ code: "INVALID_ACTION" });

    storage.room.clock = {
      ...createClockState(0),
      consecutiveTimeouts: {
        away: 0,
        home: FORFEIT_AFTER_CONSECUTIVE_TIMEOUTS,
      },
    };
    const finished = await claimMultiplayerForfeit(
      "ABC234",
      AWAY_TOKEN,
      storage,
    );
    expect(finished.status).toBe("finished");
    expect(finished.clock.forfeitedBy).toBe("home");
    expect(finished.isYourTurn).toBe(false);
    await expect(
      submitMultiplayerCommand(
        "ABC234",
        HOME_TOKEN,
        {
          command: { type: "SELECT_PITCH", target: "strike" },
          expectedRevision: 0,
          idempotencyKey: randomUUID(),
        },
        storage,
      ),
    ).rejects.toMatchObject({ code: "ROOM_UNAVAILABLE" });
  });

  it("throttles reactions per team and expires them from snapshots", async () => {
    at(START + 1_000);
    const storage = new TestStorage();
    const sent = await sendMultiplayerReaction(
      "ABC234",
      AWAY_TOKEN,
      "clap",
      storage,
    );
    expect(sent.reactions).toMatchObject([{ team: "away", kind: "clap" }]);
    await expect(
      sendMultiplayerReaction("ABC234", AWAY_TOKEN, "gg", storage),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await sendMultiplayerReaction("ABC234", HOME_TOKEN, "nice", storage);

    at(START + 1_000 + REACTION_COOLDOWN_MS);
    await sendMultiplayerReaction("ABC234", AWAY_TOKEN, "gg", storage);

    at(START + 1_000 + REACTION_COOLDOWN_MS + REACTION_VISIBLE_MS);
    markOnline(storage, "home");
    const later = await getMultiplayerSnapshot("ABC234", AWAY_TOKEN, storage);
    expect(later.reactions.map((item) => item.kind)).toEqual(["gg"]);
  });

  it("refuses a rematch while the game is still running", async () => {
    at(START + 1_000);
    const storage = new TestStorage();
    await expect(
      voteMultiplayerRematch("ABC234", AWAY_TOKEN, storage),
    ).rejects.toMatchObject({ code: "ROOM_UNAVAILABLE" });
  });

  it("starts a swapped rematch once both teams vote and records the series", async () => {
    at(START + 1_000);
    const storage = new TestStorage();
    storage.room.status = "finished";
    storage.room.state = {
      ...storage.room.state,
      phase: "finished",
      winner: "home",
      score: { away: 1, home: 3 },
    };
    storage.room.revision = 40;
    storage.room.state.revision = 40;

    const first = await voteMultiplayerRematch("ABC234", AWAY_TOKEN, storage);
    expect(first.series.rematchVotes).toEqual({ away: true, home: false });
    expect(first.series.wins).toEqual([
      { name: "원정", wins: 0 },
      { name: "홈", wins: 1 },
    ]);
    const repeat = await voteMultiplayerRematch("ABC234", AWAY_TOKEN, storage);
    expect(repeat.status).toBe("finished");

    const started = await voteMultiplayerRematch("ABC234", HOME_TOKEN, storage);
    expect(started.status).toBe("playing");
    expect(started.seat).toBe("away");
    expect(started.view.revision).toBe(41);
    expect(started.view.config).toMatchObject({
      awayTeamName: "홈",
      homeTeamName: "원정",
    });
    expect(started.series.games).toHaveLength(1);
    expect(started.series.rematchVotes).toEqual({ away: false, home: false });
    expect(started.clock.timeoutsRemaining).toEqual({ away: 2, home: 2 });

    const formerAway = await getMultiplayerSnapshot(
      "ABC234",
      AWAY_TOKEN,
      storage,
    );
    expect(formerAway.seat).toBe("home");
    expect(formerAway.series.wins).toEqual([
      { name: "홈", wins: 1 },
      { name: "원정", wins: 0 },
    ]);
  });
});
