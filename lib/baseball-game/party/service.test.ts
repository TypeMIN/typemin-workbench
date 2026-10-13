import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGame } from "../engine";
import {
  DECISION_LIMIT_MS,
  MIN_DECISION_AFTER_LOCK_MS,
  PRESENTATION_SYNC_BUFFER_MS,
} from "../multiplayer/shot-clock";
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
  submitPartyCoHostCommand,
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
    // v4 duel: the away batter may act too, so pick the home pitcher here.
    const active = snapshots.find(
      (snapshot) => snapshot.canAct && snapshot.me.team === "home",
    )!;
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

  it("reads a room and its players in one storage call per poll", async () => {
    const storage = new MemoryPartyStorage();
    const { room, hostToken } = await createPartyRoom(CONFIG, storage);
    const joined = await joinPartyRoom(
      room.roomCode,
      { nickname: "타자", team: "away", expectedRoomRevision: 0 },
      storage,
    );
    const combined = vi.spyOn(storage, "getRoomWithPlayers");
    const reads = vi.spyOn(storage, "getRoom");
    await getPartyPlayerSnapshot(room.roomCode, joined.playerToken, storage);
    await getPartyPublicSnapshot(room.roomCode, hostToken, storage);
    expect(combined).toHaveBeenCalledTimes(2);
    expect(reads).toHaveBeenCalledTimes(2);
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

  it("lets a co-host run the game from a phone but not the roster", async () => {
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
    const started = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      { command: { type: "START_GAME" }, expectedRoomRevision: 2 },
      storage,
    );
    const granted = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      {
        command: { type: "SET_CO_HOST", playerId: away.snapshot.me.id },
        expectedRoomRevision: started.roomRevision,
      },
      storage,
    );
    expect(granted.coHostId).toBe(away.snapshot.me.id);

    const paused = await submitPartyCoHostCommand(
      room.roomCode,
      away.playerToken,
      {
        command: { type: "PAUSE_GAME" },
        expectedRoomRevision: granted.roomRevision,
      },
      storage,
    );
    expect(paused.status).toBe("paused");
    expect(paused.me.nickname).toBe("타자");

    for (const command of [
      { type: "SET_CO_HOST", playerId: home.snapshot.me.id },
      { type: "REMOVE_PLAYER", playerId: home.snapshot.me.id },
    ] as const) {
      await expect(
        submitPartyCoHostCommand(
          room.roomCode,
          away.playerToken,
          { command, expectedRoomRevision: paused.roomRevision },
          storage,
        ),
      ).rejects.toMatchObject({ code: "HOST_REQUIRED" });
    }
    await expect(
      submitPartyCoHostCommand(
        room.roomCode,
        home.playerToken,
        {
          command: { type: "RESUME_GAME" },
          expectedRoomRevision: paused.roomRevision,
        },
        storage,
      ),
    ).rejects.toMatchObject({ code: "HOST_REQUIRED" });

    const removed = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      {
        command: { type: "REMOVE_PLAYER", playerId: away.snapshot.me.id },
        expectedRoomRevision: paused.roomRevision,
      },
      storage,
    );
    expect(removed.coHostId).toBeNull();
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
      revisionStartedAt: new Date().toISOString(),
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
  it("makes party devices wait until the shared screen has played the pitch", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-14T00:00:00.000Z"));
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
    const started = await submitPartyHostCommand(
      room.roomCode,
      hostToken,
      { command: { type: "START_GAME" }, expectedRoomRevision: 2 },
      storage,
    );
    const swing = await submitPartyAction(
      room.roomCode,
      away.playerToken,
      {
        command: { type: "SELECT_SWING", decision: "take" },
        expectedRevision: 0,
        expectedRoomRevision: started.roomRevision,
        idempotencyKey: randomUUID(),
      },
      storage,
    );
    // A lock plays no scene, so the pitcher may answer at once.
    const pitched = await submitPartyAction(
      room.roomCode,
      home.playerToken,
      {
        command: { type: "SELECT_PITCH", target: "ball" },
        expectedRevision: swing.view.revision,
        expectedRoomRevision: swing.roomRevision,
        idempotencyKey: randomUUID(),
      },
      storage,
    );
    expect(pitched.presentationReadyAt).toBeGreaterThan(pitched.serverNow);

    // Random hands can open a card window after the pitch instead.
    const cardWindow = pitched.view.phase === "awaiting_card";
    const next = {
      command: cardWindow
        ? ({ type: "PASS_CARD_WINDOW" } as const)
        : ({ type: "SELECT_SWING", decision: "take" } as const),
      expectedRevision: pitched.view.revision,
      expectedRoomRevision: pitched.roomRevision,
    };
    const actor = cardWindow && pitched.actionOwner === "home" ? home : away;
    await expect(
      submitPartyAction(
        room.roomCode,
        actor.playerToken,
        { ...next, idempotencyKey: randomUUID() },
        storage,
      ),
    ).rejects.toMatchObject({ code: "PRESENTATION_IN_PROGRESS" });

    vi.setSystemTime(pitched.presentationReadyAt);
    const accepted = await submitPartyAction(
      room.roomCode,
      actor.playerToken,
      { ...next, idempotencyKey: randomUUID() },
      storage,
    );
    expect(accepted.view.revision).toBe(pitched.view.revision + 1);
  });

  describe("shot clock", () => {
    const START = Date.parse("2026-10-14T00:00:00.000Z");
    const FIRST_DEADLINE =
      START + PRESENTATION_SYNC_BUFFER_MS + DECISION_LIMIT_MS.awaiting_pitch;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(START);
    });

    async function startedRoom() {
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
      const started = await submitPartyHostCommand(
        room.roomCode,
        hostToken,
        { command: { type: "START_GAME" }, expectedRoomRevision: 2 },
        storage,
      );
      return { storage, room, hostToken, away, home, started };
    }

    it("shares one deadline for the duel and fills both sides when it runs out", async () => {
      const { storage, room, hostToken, started } = await startedRoom();
      expect(started.shotClock.deadlineAt).toBe(FIRST_DEADLINE);

      vi.setSystemTime(FIRST_DEADLINE - 1);
      const waiting = await getPartyPublicSnapshot(
        room.roomCode,
        hostToken,
        storage,
      );
      expect(waiting.view.revision).toBe(0);

      vi.setSystemTime(FIRST_DEADLINE);
      const settled = await getPartyPublicSnapshot(
        room.roomCode,
        hostToken,
        storage,
      );
      expect(settled.view.revision).toBe(2);
      expect(settled.view.eventLog.at(-1)).toMatchObject({ revision: 2 });
      expect(settled.shotClock.lastTimeout).toEqual({
        revision: 2,
        team: "away",
      });
      expect(settled.shotClock.deadlineAt).toBeGreaterThan(FIRST_DEADLINE);
    });

    it("keeps the duel deadline after a lock but leaves the other side time", async () => {
      const { storage, room, away, started } = await startedRoom();
      const lockAt = FIRST_DEADLINE - 1_000;
      vi.setSystemTime(lockAt);
      const locked = await submitPartyAction(
        room.roomCode,
        away.playerToken,
        {
          command: { type: "SELECT_SWING", decision: "swing" },
          expectedRevision: 0,
          expectedRoomRevision: started.roomRevision,
          idempotencyKey: randomUUID(),
        },
        storage,
      );
      expect(locked.view.batterLocked).toBe(true);
      expect(locked.shotClock.deadlineAt).toBe(
        lockAt + MIN_DECISION_AFTER_LOCK_MS,
      );
      expect(locked.shotClock.lastTimeout).toBeNull();
    });

    it("stops while paused and restarts in full on resume", async () => {
      const { storage, room, hostToken, started } = await startedRoom();
      const paused = await submitPartyHostCommand(
        room.roomCode,
        hostToken,
        {
          command: { type: "PAUSE_GAME" },
          expectedRoomRevision: started.roomRevision,
        },
        storage,
      );
      expect(paused.shotClock.deadlineAt).toBeNull();

      const resumeAt = FIRST_DEADLINE + 60_000;
      vi.setSystemTime(resumeAt);
      const idle = await getPartyPublicSnapshot(
        room.roomCode,
        hostToken,
        storage,
      );
      expect(idle.view.revision).toBe(0);
      const resumed = await submitPartyHostCommand(
        room.roomCode,
        hostToken,
        {
          command: { type: "RESUME_GAME" },
          expectedRoomRevision: paused.roomRevision,
        },
        storage,
      );
      expect(resumed.view.revision).toBe(0);
      expect(resumed.shotClock.deadlineAt).toBe(
        resumeAt + DECISION_LIMIT_MS.awaiting_pitch,
      );
    });
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
