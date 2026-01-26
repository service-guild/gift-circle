import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomSnapshot } from "@/lib/rooms-client";
import ConnectionsPage from "@/app/rooms/[code]/connections/page";

vi.mock("@/app/rooms/[code]/room-context", () => {
  return {
    useRoom: vi.fn(),
  };
});

vi.mock("@/lib/rooms-client", () => {
  return {
    createClaimApi: vi.fn(),
    withdrawClaimApi: vi.fn(),
  };
});

const { useRoom } = await import("@/app/rooms/[code]/room-context");
const { createClaimApi, withdrawClaimApi } = await import("@/lib/rooms-client");

function buildRoomSnapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  const now = new Date().toISOString();
  return {
    id: "room-1",
    code: "vow-empowerment",
    hostId: "user-host",
    hostName: "Host User",
    currentRound: "CONNECTIONS",
    nextRound: "DECISIONS",
    canAdvance: true,
    rounds: [
      {
        round: "WAITING",
        title: "Waiting",
        description: "",
        guidance: "",
        isActive: false,
        isComplete: true,
      },
      {
        round: "OFFERS",
        title: "Offers",
        description: "",
        guidance: "",
        isActive: false,
        isComplete: true,
      },
      {
        round: "DESIRES",
        title: "Desires",
        description: "",
        guidance: "",
        isActive: false,
        isComplete: true,
      },
      {
        round: "CONNECTIONS",
        title: "Connections",
        description: "",
        guidance: "",
        isActive: true,
        isComplete: false,
      },
      {
        round: "DECISIONS",
        title: "Decisions",
        description: "",
        guidance: "",
        isActive: false,
        isComplete: false,
      },
    ],
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
        membershipId: "membership-1",
        userId: "user-1",
        displayName: "Alice",
        nickname: null,
        role: "PARTICIPANT",
        joinedAt: now,
        isActive: true,
      enjoyment: null,
      readyForRound: null,
      },
      {
        membershipId: "membership-2",
        userId: "user-2",
        displayName: "Bob",
        nickname: null,
        role: "PARTICIPANT",
        joinedAt: now,
        isActive: true,
      enjoyment: null,
      readyForRound: null,
      },
    ],
    updatedAt: now,
    offers: [
      {
        id: "offer-1",
        roomId: "room-1",
        authorMembershipId: "membership-2",
        title: "Fresh baked bread",
        details: "",
        status: "OPEN",
        updatedAt: now,
      },
    ],
    desires: [
      {
        id: "desire-1",
        roomId: "room-1",
        authorMembershipId: "membership-2",
        title: "Need moving help",
        details: "",
        status: "OPEN",
        updatedAt: now,
      },
    ],
    claims: [],
    ...overrides,
  } satisfies RoomSnapshot;
}

describe("ConnectionsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows gating message when room is not in Connections round", () => {
    useRoom.mockReturnValue({
      room: buildRoomSnapshot({ currentRound: "DESIRES" }),
      membershipId: "membership-1",
      refresh: vi.fn(),
      isLoading: false,
      error: undefined,
    });

    render(<ConnectionsPage />);

    expect(
      screen.getByText(/Bids are only available during the Bids round/i)
    ).toBeInTheDocument();
  });

  it("submits a claim and resets the composer", async () => {
    const refreshMock = vi.fn().mockResolvedValue(undefined);
    useRoom.mockReturnValue({
      room: buildRoomSnapshot(),
      membershipId: "membership-1",
      refresh: refreshMock,
      isLoading: false,
      error: undefined,
    });

    createClaimApi.mockResolvedValue({});

    render(<ConnectionsPage />);

    fireEvent.click(screen.getByRole("button", { name: /request to receive/i }));

    await waitFor(() => {
      expect(createClaimApi).toHaveBeenCalledWith("vow-empowerment", {
        offerId: "offer-1",
      });
    });

    expect(refreshMock).toHaveBeenCalled();
  });

  it("withdraws a pending claim", async () => {
    const now = new Date().toISOString();
    const refreshMock = vi.fn().mockResolvedValue(undefined);
    useRoom.mockReturnValue({
      room: buildRoomSnapshot({
        claims: [
          {
            id: "claim-1",
            roomId: "room-1",
            claimerMembershipId: "membership-1",
            offerId: "offer-1",
            desireId: null,
            status: "PENDING",
            note: "Please",
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
      membershipId: "membership-1",
      refresh: refreshMock,
      isLoading: false,
      error: undefined,
    });

    withdrawClaimApi.mockResolvedValue({});

    render(<ConnectionsPage />);

    fireEvent.click(screen.getByRole("button", { name: /^withdraw$/i }));

    await waitFor(() => {
      expect(withdrawClaimApi).toHaveBeenCalledWith("vow-empowerment", "claim-1");
    });

    expect(refreshMock).toHaveBeenCalled();
  });
});


