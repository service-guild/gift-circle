import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";

import RoomStatus from "@/app/rooms/[code]/room-status";
import type { RoomSnapshot } from "@/lib/rooms-client";

vi.mock("@/app/rooms/[code]/room-context", () => ({
  useRoom: vi.fn(),
}));

const { useRoom } = await import("@/app/rooms/[code]/room-context");

function buildRoomSnapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  const now = new Date().toISOString();
  return {
    id: "room-1",
    code: "gift-generosity",
    hostId: "host",
    hostName: "Host",
    currentRound: "DECISIONS",
    nextRound: null,
    canAdvance: false,
    updatedAt: now,
    rounds: [],
    members: [
      {
        membershipId: "membership-host",
        userId: "user-host",
        displayName: "Host User",
        nickname: "Host",
        role: "HOST",
        joinedAt: now,
        isActive: true,
      enjoyment: null,
      readyForRound: null,
      },
      {
        membershipId: "membership-guest",
        userId: "user-guest",
        displayName: "Guest User",
        nickname: "Guest",
        role: "PARTICIPANT",
        joinedAt: now,
        isActive: true,
      enjoyment: null,
      readyForRound: null,
      },
    ],
    offers: [],
    desires: [],
    claims: [],
    ...overrides,
  } satisfies RoomSnapshot;
}

describe("RoomStatus participants overview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows commitment badges for host in DECISIONS round", () => {
    const now = new Date().toISOString();

    useRoom.mockReturnValue({
      room: buildRoomSnapshot({
        offers: [
          {
            id: "offer-1",
            roomId: "room-1",
            authorMembershipId: "membership-host",
            title: "Fresh Bread",
            details: "Two loaves",
            status: "FULFILLED",
            updatedAt: now,
          },
        ],
        desires: [],
        claims: [
          {
            id: "claim-1",
            roomId: "room-1",
            claimerMembershipId: "membership-guest",
            offerId: "offer-1",
            desireId: null,
            status: "ACCEPTED",
            note: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
      membershipId: "membership-host",
      isHost: true,
      refresh: vi.fn(),
    });

    render(<RoomStatus />);

    // Host can see commitment badges in DECISIONS round
    expect(screen.queryByText(/Giving:/i)).toBeInTheDocument();
  });

  it("displays participant names correctly", () => {
    useRoom.mockReturnValue({
      room: buildRoomSnapshot({ currentRound: "CONNECTIONS" }),
      membershipId: "membership-host",
      isHost: true,
      refresh: vi.fn(),
    });

    render(<RoomStatus />);

    // Use selector to find the name specifically (not the Host badge)
    expect(screen.getAllByText(/^Host$/i, { selector: "p" })[0]).toBeInTheDocument();
    expect(screen.getByText(/^Guest$/i, { selector: "p" })).toBeInTheDocument();
  });
});


