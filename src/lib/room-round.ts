import type { RoomRound } from "@prisma/client";

export const ROOM_ROUND_SEQUENCE: readonly RoomRound[] = [
  "WAITING",
  "OFFERS",
  "DESIRES",
  "CONNECTIONS",
  "DECISIONS",
  "SUMMARY",
] as const;

export type RoomRoundInfo = {
  key: RoomRound;
  title: string;
  description: string;
  guidance: string;
};

const ROUND_INFO: Record<RoomRound, RoomRoundInfo> = {
  WAITING: {
    key: "WAITING",
    title: "Waiting Room",
    description: "The host is getting everyone settled before the session begins.",
    guidance: "",
  },
  OFFERS: {
    key: "OFFERS",
    title: "Offers",
    description: "Participants share what they would like to offer to the circle.",
    guidance: "Add what you want to offer to others.",
  },
  DESIRES: {
    key: "DESIRES",
    title: "Desires",
    description: "Participants share what support or items they would like to receive.",
    guidance: "Add what you desire to receive from others.",
  },
  CONNECTIONS: {
    key: "CONNECTIONS",
    title: "Bids",
    description:
      "Participants place bids to receive offers or to fulfill desires from others.",
    guidance: "Review others' offers and desires and place bids.",
  },
  DECISIONS: {
    key: "DECISIONS",
    title: "Decisions",
    description:
      "Participants review incoming bids and decide which to accept or decline.",
    guidance: "Review your pending bids and make decisions.",
  },
  SUMMARY: {
    key: "SUMMARY",
    title: "Summary",
    description: "Review the gift circle results and share what you enjoyed.",
    guidance: "See a summary of the gift circle.",
  },
};

export function getNextRound(current: RoomRound): RoomRound | null {
  const index = ROOM_ROUND_SEQUENCE.indexOf(current);
  if (index === -1 || index === ROOM_ROUND_SEQUENCE.length - 1) {
    return null;
  }
  return ROOM_ROUND_SEQUENCE[index + 1] ?? null;
}

export function canAdvanceRound(current: RoomRound): boolean {
  return getNextRound(current) !== null;
}

export function getRoundInfo(round: RoomRound): RoomRoundInfo {
  return ROUND_INFO[round];
}

export function getAdvanceLabel(nextRound: RoomRound | null): string {
  if (!nextRound) {
    return "Final round reached";
  }
  return `Advance to ${ROUND_INFO[nextRound].title}`;
}

export function isRoundOrderValid(current: RoomRound, next: RoomRound) {
  const currentIndex = ROOM_ROUND_SEQUENCE.indexOf(current);
  const nextIndex = ROOM_ROUND_SEQUENCE.indexOf(next);
  return nextIndex === currentIndex + 1;
}
