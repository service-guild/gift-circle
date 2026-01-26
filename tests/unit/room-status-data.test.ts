import { describe, expect, it, beforeEach, vi } from "vitest";

const mockListActiveMemberships = vi.fn();

vi.mock("@/server/realtime", () => ({
  listActiveMemberships: mockListActiveMemberships,
}));

const { buildSnapshot } = await import("@/app/rooms/[code]/room-status-data");

type RoomInput = Parameters<typeof buildSnapshot>[0];

function buildRoom(overrides: Partial<RoomInput> = {}): RoomInput {
  const now = new Date("2025-01-01T00:00:00.000Z");
  return {
    id: "room-1",
    code: "vow-empowerment",
    title: null,
    expiresAt: null,
    hostId: "user-host",
    createdAt: now,
    updatedAt: now,
    host: {
      id: "user-host",
      createdAt: now,
      updatedAt: now,
      displayName: "Host User",
    },
    memberships: [
      {
        id: "membership-host",
        roomId: "room-1",
        userId: "user-host",
        role: "HOST",
        nickname: "Host",
        enjoyment: null,
        readyForRound: null,
        createdAt: now,
        updatedAt: now,
        user: {
          id: "user-host",
          createdAt: now,
          updatedAt: now,
          displayName: "Host User",
        },
      },
      {
        id: "membership-guest",
        roomId: "room-1",
        userId: "user-guest",
        role: "PARTICIPANT",
        nickname: "Guest",
        enjoyment: null,
        readyForRound: null,
        createdAt: new Date("2025-01-01T00:05:00.000Z"),
        updatedAt: now,
        user: {
          id: "user-guest",
          createdAt: now,
          updatedAt: now,
          displayName: "Guest User",
        },
      },
    ],
    offers: [],
    desires: [],
    claims: [],
    ...overrides,
  } satisfies RoomInput;
}

describe("buildSnapshot", () => {
  beforeEach(() => {
    mockListActiveMemberships.mockReset();
  });

  it("marks non-active memberships but keeps them in the list", () => {
    const room = buildRoom();

    mockListActiveMemberships.mockReturnValue(
      new Map([
        ["membership-host", { membershipId: "membership-host", connectedAt: 1 }],
      ])
    );

    const snapshot = buildSnapshot(room);

    expect(snapshot.members).toHaveLength(2);
    expect(snapshot.members[0]).toMatchObject({
      membershipId: "membership-host",
      role: "HOST",
      isActive: true,
    });
    expect(snapshot.members[1]).toMatchObject({
      membershipId: "membership-guest",
      role: "PARTICIPANT",
      isActive: false,
    });
  });

  it("includes all active memberships with stable ordering", () => {
    const room = buildRoom();

    mockListActiveMemberships.mockReturnValue(
      new Map([
        ["membership-host", { membershipId: "membership-host", connectedAt: 1 }],
        ["membership-guest", { membershipId: "membership-guest", connectedAt: 2 }],
      ])
    );

    const snapshot = buildSnapshot(room);

    expect(snapshot.members).toHaveLength(2);
    expect(snapshot.members[0]).toMatchObject({
      membershipId: "membership-host",
      isActive: true,
    });
    expect(snapshot.members[1]).toMatchObject({
      membershipId: "membership-guest",
      isActive: true,
    });
  });

  it("maps offers and desires into summaries", () => {
    const room = buildRoom({
      offers: [
        {
          id: "offer-2",
          roomId: "room-1",
          authorMembershipId: "membership-guest",
          title: "Second offer",
          details: null,
          status: "OPEN",
          createdAt: new Date("2025-01-01T00:10:00.000Z"),
          updatedAt: new Date("2025-01-01T00:15:00.000Z"),
        },
        {
          id: "offer-1",
          roomId: "room-1",
          authorMembershipId: "membership-host",
          title: "First offer",
          details: "Details",
          status: "FULFILLED",
          createdAt: new Date("2025-01-01T00:03:00.000Z"),
          updatedAt: new Date("2025-01-01T00:04:00.000Z"),
        },
      ],
      desires: [
        {
          id: "desire-1",
          roomId: "room-1",
          authorMembershipId: "membership-host",
          title: "Need help",
          details: null,
          status: "OPEN",
          createdAt: new Date("2025-01-01T00:06:00.000Z"),
          updatedAt: new Date("2025-01-01T00:07:00.000Z"),
        },
      ],
      claims: [],
    });

    mockListActiveMemberships.mockReturnValue(
      new Map([
        ["membership-host", { membershipId: "membership-host", connectedAt: 1 }],
        ["membership-guest", { membershipId: "membership-guest", connectedAt: 2 }],
      ])
    );

    const snapshot = buildSnapshot(room);

    expect(snapshot.offers).toHaveLength(2);
    expect(snapshot.offers[0]).toMatchObject({ id: "offer-1", title: "First offer" });
    expect(snapshot.offers[1]).toMatchObject({ id: "offer-2", title: "Second offer" });

    expect(snapshot.desires).toHaveLength(1);
    expect(snapshot.desires[0]).toMatchObject({ id: "desire-1", title: "Need help" });
  });

  it("maps claims into summaries", () => {
    const room = buildRoom({
      claims: [
        {
          id: "claim-2",
          roomId: "room-1",
          claimerMembershipId: "membership-guest",
          offerId: "offer-2",
          desireId: null,
          status: "WITHDRAWN",
          note: "No longer needed",
          createdAt: new Date("2025-01-01T00:11:00.000Z"),
          updatedAt: new Date("2025-01-01T00:16:00.000Z"),
        },
        {
          id: "claim-1",
          roomId: "room-1",
          claimerMembershipId: "membership-host",
          offerId: null,
          desireId: "desire-1",
          status: "PENDING",
          note: null,
          createdAt: new Date("2025-01-01T00:08:00.000Z"),
          updatedAt: new Date("2025-01-01T00:09:00.000Z"),
        },
      ],
    });

    mockListActiveMemberships.mockReturnValue(new Map());

    const snapshot = buildSnapshot(room);

    expect(snapshot.claims).toHaveLength(2);
    expect(snapshot.claims[0]).toMatchObject({ id: "claim-1", status: "PENDING" });
    expect(snapshot.claims[1]).toMatchObject({ id: "claim-2", status: "WITHDRAWN" });
  });
  it("includes round metadata with state", () => {
    const room = buildRoom({
      currentRound: "DESIRES",
    });

    mockListActiveMemberships.mockReturnValue(new Map());

    const snapshot = buildSnapshot(room);

    expect(snapshot.currentRound).toBe("DESIRES");
    expect(snapshot.nextRound).toBe("CONNECTIONS");
    expect(snapshot.canAdvance).toBe(true);
    expect(snapshot.rounds).toHaveLength(6);
    const activeRound = snapshot.rounds.find((round) => round.isActive);
    expect(activeRound?.round).toBe("DESIRES");
    const completedRounds = snapshot.rounds.filter((round) => round.isComplete);
    expect(completedRounds.map((round) => round.round)).toEqual(["WAITING", "OFFERS"]);
  });
});
