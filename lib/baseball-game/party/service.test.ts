import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGame } from "../engine";
import type { GameEvent } from "../types";
import { partyTokenHash } from "./security";
import {
  createLineups,
  createPartyRoom,
  getPartyPlayerSnapshot,
  getPartyPublicSnapshot,
  heartbeatPartyPlayer,
  joinPartyRoom,
  rotatePartyStateAfterTransition,
  submitPartyAction,
  submitPartyHostCommand,
} from "./service";
import { MemoryPartyStorage, resetPartyMemoryStorage } from "./storage";
import {
  emptyPartyState,
  type PartyRoomRecord,
  type PartyStoredPlayer,
} from "./types";

const CONFIG = {
  innings: 3 as const,
  awayTeamName: "원정",
  homeTeamName: "홈",
};

describe("baseball party service", () => {
  beforeEach(() => resetPartyMemoryStorage());
  afterEach(() => vi.useRealTimers());

  it("allows 8 players per team, rejects a ninth and duplicate nicknames", async () => {
    const storage = new MemoryPartyStorage();
    const { room } = await createPartyRoom(CONFIG, storage);
    let revision = 0;
    for (let index = 0; index < 8; index += 1) {
      const joined = await joinPartyRoom(
        room.roomCode,
        {
          nickname: `원정${index + 1}`,
          team: "away",
          expectedRoomRevision: revision,
        },
        storage,
      );
      revision = joined.snapshot.roomRevision;
    }
    await expect(
      joinPartyRoom(
        room.roomCode,
        {
          nickname: "아홉째",
          team: "away",
          expectedRoomRevision: revision,
        },
        storage,
      ),
    ).rejects.toMatchObject({ code: "TEAM_FULL" });
    for (let index = 0; index < 8; index += 1) {
      const joined = await joinPartyRoom(
        room.roomCode,
        {
          nickname: `홈${index + 1}`,
          team: "home",
          expectedRoomRevision: revision,
        },
        storage,
      );
      revision = joined.snapshot.roomRevision;
    }
    const fullRoom = await getPartyPublicSnapshot(room.roomCode, null, storage);
    expect(fullRoom.players.away).toHaveLength(8);
    expect(fullRoom.players.home).toHaveLength(8);
    await expect(
      joinPartyRoom(
        room.roomCode,
        {
          nickname: "홈아홉째",
          team: "home",
          expectedRoomRevision: revision,
        },
        storage,
      ),
    ).rejects.toMatchObject({ code: "TEAM_FULL" });
    await expect(
      joinPartyRoom(
        room.roomCode,
        {
          nickname: "원정1",
          team: "home",
          expectedRoomRevision: revision,
        },
        storage,
      ),
    ).rejects.toMatchObject({ code: "NICKNAME_TAKEN" });
  });

  it("moves and removes lobby players, then locks lineups on start", async () => {
    const storage = new MemoryPartyStorage();
    const { room, hostToken } = await createPartyRoom(CONFIG, storage);
    const away = await joinPartyRoom(
      room.roomCode,
      { nickname: "타자", team: "away", expectedRoomRevision: 0 },
      storage,
    );
    const home = await joinPartyRoom(
      room.roomCode,
      { nickname: "투수", team: "home", expectedRoomRevision: 1 },
      storage,
    );
    const moved = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      {
        command: {
          type: "MOVE_PLAYER",
          playerId: away.snapshot.me.id,
          team: "home",
        },
        expectedRoomRevision: 2,
      },
      storage,
    );
    expect(moved.players.home).toHaveLength(2);
    const restored = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      {
        command: {
          type: "MOVE_PLAYER",
          playerId: away.snapshot.me.id,
          team: "away",
        },
        expectedRoomRevision: 3,
      },
      storage,
    );
    const started = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      {
        command: { type: "START_GAME" },
        expectedRoomRevision: restored.roomRevision,
      },
      storage,
    );
    expect(started.status).toBe("playing");
    await expect(
      submitPartyHostCommand(
        room.roomCode,
        hostToken,
        {
          command: {
            type: "MOVE_PLAYER",
            playerId: home.snapshot.me.id,
            team: "away",
          },
          expectedRoomRevision: started.roomRevision,
        },
        storage,
      ),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  });

  it("requires both teams before start and reproduces seeded lineups", async () => {
    const players = ["a", "b", "c", "d"].map((id, index) =>
      player(id, index < 2 ? "away" : "home"),
    );
    expect(createLineups(players, 123456)).toEqual(
      createLineups(players, 123456),
    );
    const storage = new MemoryPartyStorage();
    const { room, hostToken } = await createPartyRoom(CONFIG, storage);
    await joinPartyRoom(
      room.roomCode,
      { nickname: "혼자", team: "away", expectedRoomRevision: 0 },
      storage,
    );
    await expect(
      submitPartyHostCommand(
        room.roomCode,
        hostToken,
        {
          command: { type: "START_GAME" },
          expectedRoomRevision: 1,
        },
        storage,
      ),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  });

  it("shows only the same team hand and grants actions only to the active player", async () => {
    const storage = new MemoryPartyStorage();
    const { room, hostToken } = await createPartyRoom(CONFIG, storage);
    const away1 = await joinPartyRoom(
      room.roomCode,
      { nickname: "원정1", team: "away", expectedRoomRevision: 0 },
      storage,
    );
    await joinPartyRoom(
      room.roomCode,
      { nickname: "원정2", team: "away", expectedRoomRevision: 1 },
      storage,
    );
    const home1 = await joinPartyRoom(
      room.roomCode,
      { nickname: "홈1", team: "home", expectedRoomRevision: 2 },
      storage,
    );
    const home2 = await joinPartyRoom(
      room.roomCode,
      { nickname: "홈2", team: "home", expectedRoomRevision: 3 },
      storage,
    );
    const started = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      { command: { type: "START_GAME" }, expectedRoomRevision: 4 },
      storage,
    );
    const publicView = await getPartyPublicSnapshot(
      room.roomCode,
      null,
      storage,
    );
    expect(publicView.view.cards.offense.hand).toBeNull();
    expect(publicView.view.cards.defense.hand).toBeNull();
    expect(publicView.view).not.toHaveProperty("rng");
    const candidates = [away1, home1, home2];
    const snapshots = await Promise.all(
      candidates.map((candidate) =>
        getPartyPlayerSnapshot(room.roomCode, candidate.playerToken, storage),
      ),
    );
    const active = snapshots.find((snapshot) => snapshot.canAct)!;
    const inactive = snapshots.find(
      (snapshot) => snapshot.me.team === active.me.team && !snapshot.canAct,
    );
    expect(active.view.cards.defense.hand).toHaveLength(4);
    expect(active.view.cards.offense.hand).toBeNull();
    expect(inactive).toBeDefined();
    if (inactive) {
      await expect(
        submitPartyAction(
          room.roomCode,
          candidates[snapshots.indexOf(inactive)].playerToken,
          {
            command: { type: "SELECT_PITCH", target: "strike" },
            expectedRevision: inactive.view.revision,
            expectedRoomRevision: started.roomRevision,
            idempotencyKey: randomUUID(),
          },
          storage,
        ),
      ).rejects.toMatchObject({ code: "NOT_ACTIVE_PLAYER" });
    }
  });

  it("serializes simultaneous room mutations and blocks actions while paused", async () => {
    const storage = new MemoryPartyStorage();
    const { room, hostToken } = await createPartyRoom(CONFIG, storage);
    const [first, second] = await Promise.allSettled([
      joinPartyRoom(
        room.roomCode,
        { nickname: "동시1", team: "away", expectedRoomRevision: 0 },
        storage,
      ),
      joinPartyRoom(
        room.roomCode,
        { nickname: "동시2", team: "away", expectedRoomRevision: 0 },
        storage,
      ),
    ]);
    expect([first.status, second.status].sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const current = await getPartyPublicSnapshot(
      room.roomCode,
      hostToken,
      storage,
    );
    await joinPartyRoom(
      room.roomCode,
      {
        nickname: "홈",
        team: "home",
        expectedRoomRevision: current.roomRevision,
      },
      storage,
    );
    const beforeStart = await getPartyPublicSnapshot(
      room.roomCode,
      hostToken,
      storage,
    );
    const started = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      {
        command: { type: "START_GAME" },
        expectedRoomRevision: beforeStart.roomRevision,
      },
      storage,
    );
    const paused = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      {
        command: { type: "PAUSE_GAME" },
        expectedRoomRevision: started.roomRevision,
      },
      storage,
    );
    expect(paused.status).toBe("paused");
    const player =
      first.status === "fulfilled"
        ? first.value
        : second.status === "fulfilled"
          ? second.value
          : null;
    expect(player).not.toBeNull();
    if (player) {
      await expect(
        submitPartyAction(
          room.roomCode,
          player.playerToken,
          {
            command: { type: "SELECT_PITCH", target: "strike" },
            expectedRevision: paused.view.revision,
            expectedRoomRevision: paused.roomRevision,
            idempotencyKey: randomUUID(),
          },
          storage,
        ),
      ).rejects.toMatchObject({ code: "ROOM_UNAVAILABLE" });
    }
  });

  it("skips without consuming the engine revision and pauses if a team becomes empty", async () => {
    const storage = new MemoryPartyStorage();
    const { room, hostToken } = await createPartyRoom(CONFIG, storage);
    await joinPartyRoom(
      room.roomCode,
      { nickname: "원정", team: "away", expectedRoomRevision: 0 },
      storage,
    );
    const home1 = await joinPartyRoom(
      room.roomCode,
      { nickname: "홈1", team: "home", expectedRoomRevision: 1 },
      storage,
    );
    await joinPartyRoom(
      room.roomCode,
      { nickname: "홈2", team: "home", expectedRoomRevision: 2 },
      storage,
    );
    const started = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      { command: { type: "START_GAME" }, expectedRoomRevision: 3 },
      storage,
    );
    const originalDefender = started.activeDefenderId;
    const skipped = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      {
        command: { type: "SKIP_ACTIVE_PLAYER" },
        expectedRoomRevision: started.roomRevision,
      },
      storage,
    );
    expect(skipped.view.revision).toBe(started.view.revision);
    expect(skipped.activeDefenderId).not.toBe(originalDefender);
    const firstRemoval = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      {
        command: { type: "REMOVE_PLAYER", playerId: home1.snapshot.me.id },
        expectedRoomRevision: skipped.roomRevision,
      },
      storage,
    );
    const remainingHome = firstRemoval.players.home[0];
    const emptyTeam = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      {
        command: { type: "REMOVE_PLAYER", playerId: remainingHome.id },
        expectedRoomRevision: firstRemoval.roomRevision,
      },
      storage,
    );
    expect(emptyTeam.status).toBe("paused");
    expect(emptyTeam.players.home).toHaveLength(0);
  });

  it("rejects skipping when the active team has no next player", async () => {
    const storage = new MemoryPartyStorage();
    const { room, hostToken } = await createPartyRoom(CONFIG, storage);
    await joinPartyRoom(
      room.roomCode,
      { nickname: "원정", team: "away", expectedRoomRevision: 0 },
      storage,
    );
    await joinPartyRoom(
      room.roomCode,
      { nickname: "홈", team: "home", expectedRoomRevision: 1 },
      storage,
    );
    const started = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      { command: { type: "START_GAME" }, expectedRoomRevision: 2 },
      storage,
    );
    await expect(
      submitPartyHostCommand(
        room.roomCode,
        hostToken,
        {
          command: { type: "SKIP_ACTIVE_PLAYER" },
          expectedRoomRevision: started.roomRevision,
        },
        storage,
      ),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  });

  it("makes player actions idempotent and resolves a host/action race once", async () => {
    const storage = new MemoryPartyStorage();
    const { room, hostToken } = await createPartyRoom(CONFIG, storage);
    const away = await joinPartyRoom(
      room.roomCode,
      { nickname: "원정", team: "away", expectedRoomRevision: 0 },
      storage,
    );
    const home = await joinPartyRoom(
      room.roomCode,
      { nickname: "홈", team: "home", expectedRoomRevision: 1 },
      storage,
    );
    const started = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      { command: { type: "START_GAME" }, expectedRoomRevision: 2 },
      storage,
    );
    const idempotencyKey = randomUUID();
    const first = await submitPartyAction(
      room.roomCode,
      home.playerToken,
      {
        command: { type: "SELECT_PITCH", target: "strike" },
        expectedRevision: 0,
        expectedRoomRevision: started.roomRevision,
        idempotencyKey,
      },
      storage,
    );
    const paused = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      {
        command: { type: "PAUSE_GAME" },
        expectedRoomRevision: first.roomRevision,
      },
      storage,
    );
    const retry = await submitPartyAction(
      room.roomCode,
      home.playerToken,
      {
        command: { type: "SELECT_PITCH", target: "strike" },
        expectedRevision: 0,
        expectedRoomRevision: started.roomRevision,
        idempotencyKey,
      },
      storage,
    );
    expect(retry.view.revision).toBe(first.view.revision);
    expect(retry.status).toBe("paused");
    const resumed = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      {
        command: { type: "RESUME_GAME" },
        expectedRoomRevision: paused.roomRevision,
      },
      storage,
    );

    const currentSnapshots = await Promise.all(
      [away.playerToken, home.playerToken].map((token) =>
        getPartyPlayerSnapshot(room.roomCode, token, storage),
      ),
    );
    const current = currentSnapshots.find((snapshot) => snapshot.canAct)!;
    const activeToken =
      current.me.team === "away" ? away.playerToken : home.playerToken;
    const command =
      current.view.phase === "awaiting_card"
        ? ({ type: "PASS_CARD_WINDOW" } as const)
        : current.view.phase === "awaiting_pitch"
          ? ({ type: "SELECT_PITCH", target: "strike" } as const)
          : ({ type: "SELECT_SWING", decision: "take" } as const);
    const race = await Promise.allSettled([
      submitPartyAction(
        room.roomCode,
        activeToken,
        {
          command,
          expectedRevision: current.view.revision,
          expectedRoomRevision: current.roomRevision,
          idempotencyKey: randomUUID(),
        },
        storage,
      ),
      submitPartyHostCommand(
        room.roomCode,
        hostToken,
        {
          command: { type: "PAUSE_GAME" },
          expectedRoomRevision: resumed.roomRevision,
        },
        storage,
      ),
    ]);
    expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );
  });

  it("marks a silent player offline after 25 seconds and restores presence on heartbeat", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-09-08T00:00:00.000Z");
    vi.setSystemTime(now);
    const storage = new MemoryPartyStorage();
    const { room } = await createPartyRoom(CONFIG, storage);
    const joined = await joinPartyRoom(
      room.roomCode,
      { nickname: "잠깐자리비움", team: "away", expectedRoomRevision: 0 },
      storage,
    );
    vi.setSystemTime(new Date(now.getTime() + 25_001));
    const offline = await getPartyPublicSnapshot(room.roomCode, null, storage);
    expect(offline.players.away[0].connected).toBe(false);
    await heartbeatPartyPlayer(room.roomCode, joined.playerToken, storage);
    const online = await getPartyPublicSnapshot(room.roomCode, null, storage);
    expect(online.players.away[0].connected).toBe(true);
  });

  it("lets the host end a game without assigning a winner", async () => {
    const storage = new MemoryPartyStorage();
    const { room, hostToken } = await createPartyRoom(CONFIG, storage);
    await joinPartyRoom(
      room.roomCode,
      { nickname: "원정", team: "away", expectedRoomRevision: 0 },
      storage,
    );
    await joinPartyRoom(
      room.roomCode,
      { nickname: "홈", team: "home", expectedRoomRevision: 1 },
      storage,
    );
    const started = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      { command: { type: "START_GAME" }, expectedRoomRevision: 2 },
      storage,
    );
    const ended = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      {
        command: { type: "END_GAME" },
        expectedRoomRevision: started.roomRevision,
      },
      storage,
    );
    expect(ended.status).toBe("finished");
    expect(ended.view.phase).toBe("finished");
    expect(ended.view.winner).toBeNull();
  });

  it("advances a batter once per plate appearance and a defender once per new defensive half", () => {
    const state = createGame(CONFIG);
    const partyState = emptyPartyState();
    partyState.lineups = { away: ["a1", "a2"], home: ["h1", "h2"] };
    const room = {
      id: "r",
      roomCode: "ABC234",
      status: "playing",
      state,
      revision: 0,
      roomRevision: 0,
      hostTokenHash: partyTokenHash("host"),
      partyState,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    } satisfies PartyRoomRecord;
    const pa = event("plate_appearance");
    expect(
      rotatePartyStateAfterTransition(room, state, [pa]).battingIndex.away,
    ).toBe(1);
    const next = structuredClone(state);
    next.half = "bottom";
    next.battingTeam = "home";
    const rotated = rotatePartyStateAfterTransition(room, next, [
      pa,
      pa,
      event("half_inning"),
      event("half_inning"),
    ]);
    expect(rotated.battingIndex.away).toBe(1);
    expect(rotated.defenseIndex.away).toBe(0);
  });
});

function player(id: string, team: "away" | "home"): PartyStoredPlayer {
  return {
    id,
    nickname: id,
    team,
    tokenHash: id.repeat(64).slice(0, 64),
    joinedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    removedAt: null,
  };
}

function event(kind: GameEvent["kind"]): GameEvent {
  return {
    sequence: 1,
    revision: 1,
    inning: 1,
    half: "top",
    kind,
    summary: kind,
    runs: 0,
    outsRecorded: 0,
    moves: [],
  };
}
