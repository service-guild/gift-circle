import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  IDENTITY_COOKIE_NAME,
  identityCookieAttributes,
  refreshIdentityToken,
  resolveIdentity,
  shouldRefreshIdentity,
} from "@/lib/identity";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/room-code";
import { emitRoomEvent } from "@/server/realtime";

const toggleReadySchema = z.object({
  ready: z.boolean(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;

  if (!code || !isValidRoomCode(code)) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }

  const identity = await resolveIdentity(
    request.cookies.get(IDENTITY_COOKIE_NAME)?.value
  );

  const roomCode = normalizeRoomCode(code);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = toggleReadySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { ready } = parsed.data;

  const room = await prisma.room.findUnique({
    where: { code: roomCode },
    include: {
      memberships: true,
    },
  });

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const membership = room.memberships.find((m) => m.userId === identity.user.id);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  }

  const newReadyForRound = ready ? room.currentRound : null;

  if (shouldRefreshIdentity(identity.payload)) {
    refreshIdentityToken(identity);
  }

  await prisma.roomMembership.update({
    where: { id: membership.id },
    data: { readyForRound: newReadyForRound },
  });

  emitRoomEvent(room.id, {
    type: "member:ready",
    roomId: room.id,
    membershipId: membership.id,
    readyForRound: newReadyForRound,
  });

  const response = NextResponse.json({
    success: true,
    readyForRound: newReadyForRound,
  });

  if (identity.shouldSetCookie) {
    response.cookies.set(
      IDENTITY_COOKIE_NAME,
      identity.token,
      identityCookieAttributes(identity.payload.expiresAt)
    );
  }

  return response;
}
