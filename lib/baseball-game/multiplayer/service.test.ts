import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createGame } from "../engine";
import type { TeamSide } from "../types";
import { seatTokenHash } from "./security";
import { getMultiplayerSnapshot, submitMultiplayerCommand } from "./service";
import type { MultiplayerStorage } from "./storage";
import type {
  MultiplayerCommitInput,
  MultiplayerCommitResult,
  MultiplayerRoomRecord,
} from "./types";

const AWAY_TOKEN = "away-seat-token";
const HOME_TOKEN = "home-seat-token";

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
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  seats = new Map<TeamSide, string>([
    ["away", seatTokenHash(AWAY_TOKEN)],
    ["home", seatTokenHash(HOME_TOKEN)],
  ]);
  idempotency = new Map<string, number>();

  async createRoom() {
    return structuredClone(this.room);
  }

  async getRoom(roomCode: string) {
    return roomCode === this.room.roomCode ? structuredClone(this.room) : null;
  }

  async findSeat(roomId: string, tokenHash: string) {
    if (roomId !== this.room.id) return null;
    for (const [team, hash] of this.seats) {
      if (hash === tokenHash) return team;
    }
    return null;
  }

  async hasSeat(roomId: string, team: TeamSide) {
    return roomId === this.room.id && this.seats.has(team);
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
    this.room.state = structuredClone(input.newState);
    this.room.revision = input.newState.revision;
    this.room.status =
      input.newState.phase === "finished" ? "finished" : "playing";
    this.idempotency.set(input.idempotencyKey, this.room.revision);
    return { status: "applied", revision: this.room.revision };
  }
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
          command: { type: "ROLL_DIE" },
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
      { command: { type: "ROLL_DIE" }, expectedRevision: 0, idempotencyKey },
      storage,
    );
    const retry = await submitMultiplayerCommand(
      "ABC234",
      HOME_TOKEN,
      { command: { type: "ROLL_DIE" }, expectedRevision: 0, idempotencyKey },
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
        command: { type: "ROLL_DIE" },
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
          command: { type: "ROLL_DIE" },
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
});
