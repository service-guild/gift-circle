import type {
  ClaimSummary,
  DesireSummary,
  OfferSummary,
  RoomRound,
} from "@/lib/room-types";

export type RoomEvent =
  | {
      type: "offer:created";
      roomId: string;
      offer: OfferSummary;
    }
  | {
      type: "offer:updated";
      roomId: string;
      offer: OfferSummary;
    }
  | {
      type: "offer:deleted";
      roomId: string;
      offerId: string;
    }
  | {
      type: "desire:created";
      roomId: string;
      desire: DesireSummary;
    }
  | {
      type: "desire:updated";
      roomId: string;
      desire: DesireSummary;
    }
  | {
      type: "desire:deleted";
      roomId: string;
      desireId: string;
    }
  | {
      type: "claim:created";
      roomId: string;
      claim: ClaimSummary;
    }
  | {
      type: "claim:updated";
      roomId: string;
      claim: ClaimSummary;
    }
  | {
      type: "round:changed";
      roomId: string;
      round: RoomRound;
    }
  | {
      type: "room:updated";
      roomId: string;
      title: string | null;
    }
  | {
      type: "member:ready";
      roomId: string;
      membershipId: string;
      readyForRound: RoomRound | null;
    };
