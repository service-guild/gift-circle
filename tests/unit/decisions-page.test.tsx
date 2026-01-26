import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";

import type { RoomSnapshot } from "@/lib/rooms-client";
import DecisionsPage from "@/app/rooms/[code]/decisions/page";

vi.mock("@/app/rooms/[code]/room-context", () => ({
  useRoom: vi.fn(),
}));

vi.mock("@/lib/rooms-client", () => ({
  decideClaimApi: vi.fn(),
}));

const { useRoom } = await import("@/app/rooms/[code]/room-context");
const { decideClaimApi } = await import("@/lib/rooms-client");

const originalFetch = global.fetch;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
let createObjectURLSpy: ReturnType<typeof vi.fn>;
let revokeObjectURLSpy: ReturnType<typeof vi.fn>;

beforeAll(() => {
  createObjectURLSpy = vi.fn(() => "blob:mock");
  revokeObjectURLSpy = vi.fn();

  Object.defineProperty(URL, "createObjectURL", {
    value: createObjectURLSpy,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: revokeObjectURLSpy,
    configurable: true,
    writable: true,
  });
});

afterAll(() => {
  Object.defineProperty(URL, "createObjectURL", {
    value: originalCreateObjectURL,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: originalRevokeObjectURL,
    configurable: true,
    writable: true,
  });
});

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
    rounds: [],
    members: [
      {
        membershipId: "membership-1",
        userId: "user-1",
        displayName: "Owner",
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
        displayName: "Guest",
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
        authorMembershipId: "membership-1",
        title: "Offer",
        details: "Details",
        status: "OPEN",
        updatedAt: now,
      },
    ],
    desires: [
      {
        id: "desire-1",
        roomId: "room-1",
        authorMembershipId: "membership-1",
        title: "Need",
        details: "Please help",
        status: "OPEN",
        updatedAt: now,
      },
    ],
    claims: [
      {
        id: "claim-1",
        roomId: "room-1",
        claimerMembershipId: "membership-2",
        offerId: "offer-1",
        desireId: null,
        status: "PENDING",
        note: "I'd love this",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "claim-2",
        roomId: "room-1",
        claimerMembershipId: "membership-2",
        offerId: null,
        desireId: "desire-1",
        status: "PENDING",
        note: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    ...overrides,
  } satisfies RoomSnapshot;
}

describe("DecisionsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob()),
      json: () => Promise.resolve({}),
    } as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("shows gating message when not in Decisions round", () => {
    useRoom.mockReturnValue({
      room: buildRoomSnapshot({ currentRound: "CONNECTIONS" }),
      membershipId: "membership-1",
      refresh: vi.fn(),
      isLoading: false,
      error: undefined,
    });

    render(<DecisionsPage />);

    expect(
      screen.getByText(/decisions are only available during the decisions round/i)
    ).toBeInTheDocument();
  });

  it("accepts claims and refreshes the snapshot", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    useRoom.mockReturnValue({
      room: buildRoomSnapshot(),
      membershipId: "membership-1",
      refresh,
      isLoading: false,
      error: undefined,
    });
    decideClaimApi.mockResolvedValue({});

    render(<DecisionsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /accept/i })[0]);

    await waitFor(() => {
      expect(decideClaimApi).toHaveBeenCalledWith("gift-generosity", "claim-1", "ACCEPTED");
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("declines claims and refreshes the snapshot", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    useRoom.mockReturnValue({
      room: buildRoomSnapshot(),
      membershipId: "membership-1",
      refresh,
      isLoading: false,
      error: undefined,
    });
    decideClaimApi.mockResolvedValue({});

    render(<DecisionsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /decline/i })[0]);

    await waitFor(() => {
      expect(decideClaimApi).toHaveBeenCalledWith("gift-generosity", "claim-1", "DECLINED");
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the commitments download buttons in the Decisions round", () => {
    useRoom.mockReturnValue({
      room: buildRoomSnapshot(),
      membershipId: "membership-1",
      refresh: vi.fn(),
      isLoading: false,
      error: undefined,
    });

    render(<DecisionsPage />);

    const pdfButton = screen.getByRole("button", { name: /^PDF$/i });
    const markdownButton = screen.getByRole("button", { name: /^Markdown$/i });
    expect(pdfButton).toBeDisabled();
    expect(markdownButton).toBeDisabled();
  });

  it("triggers PDF download workflow", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["test"], { type: "application/pdf" })),
      json: () => Promise.resolve({}),
    } as Response);
    global.fetch = mockFetch;

    useRoom.mockReturnValue({
      room: buildRoomSnapshot({
        claims: [
          {
            id: "claim-accepted",
            roomId: "room-1",
            claimerMembershipId: "membership-2",
            offerId: "offer-1",
            desireId: null,
            status: "ACCEPTED",
            note: "Thank you",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        offers: [
          {
            id: "offer-1",
            roomId: "room-1",
            authorMembershipId: "membership-1",
            title: "Offer",
            details: "Details",
            status: "FULFILLED",
            updatedAt: new Date().toISOString(),
          },
        ],
        desires: [],
      }),
      membershipId: "membership-1",
      refresh: vi.fn(),
      isLoading: false,
      error: undefined,
    });

    render(<DecisionsPage />);

    const pdfButton = screen.getByRole("button", { name: /^PDF$/i });
    expect(pdfButton).not.toBeDisabled();
    fireEvent.click(pdfButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/rooms/gift-generosity/export?format=pdf", {
        headers: { Accept: "application/pdf" },
      });

      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(screen.getByText(/download started/i)).toBeInTheDocument();
    });
  });
});

