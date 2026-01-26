import type {
  RoomSnapshot,
  RoomMember,
  MembershipRole,
  OfferSummary,
  DesireSummary,
  ClaimSummary,
  ItemStatus,
} from "./room-types";

type RoomResponse = {
  room: {
    id: string;
    code: string;
    hostId: string;
  };
  host?: {
    id: string;
    displayName: string | null;
  };
  user?: {
    id: string;
    displayName: string | null;
  };
  membership: {
    id: string;
    role: "HOST" | "PARTICIPANT";
    nickname: string | null;
  };
};

function buildApiError(response: Response, fallback: string) {
  return response
    .json()
    .catch(() => ({}))
    .then((payload) => {
      const err = new Error(
        typeof (payload as { message?: string }).message === "string"
          ? (payload as { message: string }).message
          : `${fallback}: ${response.status}`
      );
      const result = err as Error & { code?: string; status?: number };
      if (typeof (payload as { error?: string }).error === "string") {
        result.code = (payload as { error: string }).error;
      }
      result.status = response.status;
      return err;
    });
}

export async function createRoom({ hostDisplayName }: { hostDisplayName: string }) {
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ hostDisplayName }),
  });

  if (!response.ok) {
    throw await buildApiError(response, "Failed to create room");
  }

  return (await response.json()) as RoomResponse & {
    host: NonNullable<RoomResponse["host"]>;
  };
}

export async function joinRoom({
  code,
  displayName,
}: {
  code: string;
  displayName: string;
}) {
  const response = await fetch(`/api/rooms/${code}/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ displayName }),
  });

  if (!response.ok) {
    throw await buildApiError(response, "Failed to join room");
  }

  return (await response.json()) as RoomResponse & {
    user: NonNullable<RoomResponse["user"]>;
  };
}

export async function fetchRoomSnapshot(code: string): Promise<RoomSnapshot> {
  const response = await fetch(`/api/rooms/${code}`);
  if (!response.ok) {
    throw new Error(`Failed to load room: ${response.status}`);
  }
  return (await response.json()) as RoomSnapshot;
}

export async function advanceRoomRound(code: string): Promise<RoomSnapshot> {
  const response = await fetch(`/api/rooms/${code}/advance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw await buildApiError(response, "Failed to advance round");
  }

  return (await response.json()) as RoomSnapshot;
}

export type PresenceEvent = {
  roomId: string;
  membershipId: string;
  userId: string;
  displayName: string | null;
  nickname: string | null;
  role: MembershipRole;
  connectedAt: number;
};

type OfferPayload = {
  title: string;
  details?: string | null;
};

type OfferUpdatePayload = OfferPayload & {
  status?: ItemStatus;
};

type DesirePayload = {
  title: string;
  details?: string | null;
};

type DesireUpdatePayload = DesirePayload & {
  status?: ItemStatus;
};

type ClaimPayload = {
  offerId?: string;
  desireId?: string;
  note?: string | null;
};

export async function createOfferApi(code: string, payload: OfferPayload) {
  const response = await fetch(`/api/rooms/${code}/offers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await buildApiError(response, "Failed to create offer");
  }

  return (await response.json()) as OfferSummary;
}

export async function updateOfferApi(
  code: string,
  offerId: string,
  payload: OfferUpdatePayload
) {
  const response = await fetch(`/api/rooms/${code}/offers?offerId=${offerId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await buildApiError(response, "Failed to update offer");
  }

  return (await response.json()) as OfferSummary;
}

export async function deleteOfferApi(code: string, offerId: string) {
  const response = await fetch(`/api/rooms/${code}/offers?offerId=${offerId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw await buildApiError(response, "Failed to delete offer");
  }
}

export async function createDesireApi(code: string, payload: DesirePayload) {
  const response = await fetch(`/api/rooms/${code}/desires`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await buildApiError(response, "Failed to create desire");
  }

  return (await response.json()) as DesireSummary;
}

export async function updateDesireApi(
  code: string,
  desireId: string,
  payload: DesireUpdatePayload
) {
  const response = await fetch(`/api/rooms/${code}/desires?desireId=${desireId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await buildApiError(response, "Failed to update desire");
  }

  return (await response.json()) as DesireSummary;
}

export async function deleteDesireApi(code: string, desireId: string) {
  const response = await fetch(`/api/rooms/${code}/desires?desireId=${desireId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw await buildApiError(response, "Failed to delete desire");
  }
}

export async function listClaimsApi(code: string): Promise<ClaimSummary[]> {
  const response = await fetch(`/api/rooms/${code}/claims`);

  if (!response.ok) {
    throw await buildApiError(response, "Failed to load claims");
  }

  return (await response.json()) as ClaimSummary[];
}

export async function createClaimApi(code: string, payload: ClaimPayload) {
  const response = await fetch(`/api/rooms/${code}/claims`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await buildApiError(response, "Failed to create claim");
  }

  return (await response.json()) as ClaimSummary;
}

type ClaimStatusUpdatePayload = {
  status: "WITHDRAWN" | "ACCEPTED" | "DECLINED";
};

async function updateClaimStatusApi(
  code: string,
  claimId: string,
  payload: ClaimStatusUpdatePayload,
  errorMessage: string
): Promise<ClaimSummary> {
  const response = await fetch(
    `/api/rooms/${code}/claims?claimId=${encodeURIComponent(claimId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw await buildApiError(response, errorMessage);
  }

  return (await response.json()) as ClaimSummary;
}

export async function withdrawClaimApi(code: string, claimId: string) {
  return updateClaimStatusApi(code, claimId, { status: "WITHDRAWN" }, "Failed to withdraw claim");
}

export async function decideClaimApi(
  code: string,
  claimId: string,
  status: "ACCEPTED" | "DECLINED"
) {
  return updateClaimStatusApi(code, claimId, { status }, "Failed to update claim");
}

export async function toggleReadyApi(code: string, ready: boolean) {
  const response = await fetch(`/api/rooms/${code}/ready`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ready }),
  });

  if (!response.ok) {
    throw await buildApiError(response, "Failed to toggle ready status");
  }

  return (await response.json()) as { success: boolean; readyForRound: string | null };
}

export type { RoomSnapshot, RoomMember, OfferSummary, DesireSummary, ClaimSummary };
