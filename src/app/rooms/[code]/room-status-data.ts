import type {
  Claim,
  Desire,
  Offer,
  Room,
  RoomMembership,
  RoomRound,
  User,
} from "@prisma/client";

import { RoomSnapshot } from "@/lib/room-types";
import { toDesireSummary, toOfferSummary } from "@/lib/room-items";
import { toClaimSummary } from "@/lib/room-claims";
import {
  canAdvanceRound,
  getNextRound,
  getRoundInfo,
  ROOM_ROUND_SEQUENCE,
} from "@/lib/room-round";
import { listActiveMemberships } from "@/server/realtime";

function sortMembers(members: RoomSnapshot["members"]) {
  return [...members].sort((a, b) => {
    if (a.role === "HOST") {
      return -1;
    }
    if (b.role === "HOST") {
      return 1;
    }

    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });
}

function mapOffers(offers: Offer[]): RoomSnapshot["offers"] {
  return offers
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((offer) => toOfferSummary(offer));
}

function mapDesires(desires: Desire[]): RoomSnapshot["desires"] {
  return desires
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((desire) => toDesireSummary(desire));
}

function mapClaims(claims: Claim[]): RoomSnapshot["claims"] {
  return claims
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((claim) => toClaimSummary(claim));
}

export function buildSnapshot(
  room: Room & {
    host: User;
    memberships: (RoomMembership & { user: User })[];
    offers: Offer[];
    desires: Desire[];
    claims: Claim[];
    currentRound: RoomRound;
  }
): RoomSnapshot {
  const activeMemberships = listActiveMemberships(room.id);

  const members = sortMembers(
    room.memberships.map((membership) => ({
      membershipId: membership.id,
      userId: membership.userId,
      displayName: membership.user.displayName,
      nickname: membership.nickname,
      role: membership.role,
      joinedAt: membership.createdAt.toISOString(),
      isActive: activeMemberships.has(membership.id),
      enjoyment: membership.enjoyment,
      readyForRound: membership.readyForRound,
    }))
  );

  const hostName = room.host.displayName ?? "Host";
  const currentRoundIndex = Math.max(ROOM_ROUND_SEQUENCE.indexOf(room.currentRound), 0);

  return {
    id: room.id,
    code: room.code,
    title: room.title,
    hostId: room.hostId,
    hostName,
    currentRound: room.currentRound,
    nextRound: getNextRound(room.currentRound),
    canAdvance: canAdvanceRound(room.currentRound),
    rounds: ROOM_ROUND_SEQUENCE.map((round, index) => {
      const info = getRoundInfo(round);
      return {
        round,
        title: info.title,
        description: info.description,
        guidance: info.guidance,
        isActive: index === currentRoundIndex,
        isComplete: index < currentRoundIndex,
      } satisfies RoomSnapshot["rounds"][number];
    }),
    members,
    updatedAt: room.updatedAt.toISOString(),
    offers: mapOffers(room.offers),
    desires: mapDesires(room.desires),
    claims: mapClaims(room.claims),
  };
}

export async function getRoomSnapshot(
  room: Room & {
    host: User;
    memberships: (RoomMembership & { user: User })[];
    offers: Offer[];
    desires: Desire[];
    claims: Claim[];
    currentRound: RoomRound;
  }
) {
  return buildSnapshot(room);
}
