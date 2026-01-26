import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/room-code";
import {
  IDENTITY_COOKIE_NAME,
  identityCookieAttributes,
  refreshIdentityToken,
  resolveIdentity,
  shouldRefreshIdentity,
} from "@/lib/identity";
import { emitPresenceUpdate } from "@/server/realtime";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;

  if (!code || !isValidRoomCode(code)) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }

  const roomCode = normalizeRoomCode(code);

  const identity = await resolveIdentity(
    request.cookies.get(IDENTITY_COOKIE_NAME)?.value
  );

  const room = await prisma.room.findUnique({
    where: { code: roomCode },
    select: { id: true, currentRound: true },
  });

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (room.currentRound !== "DECISIONS" && room.currentRound !== "SUMMARY") {
    return NextResponse.json(
      { error: "Enjoyment can only be shared during the Decisions or Summary round" },
      { status: 409 }
    );
  }

  const membership = await prisma.roomMembership.findUnique({
    where: {
      roomId_userId: {
        roomId: room.id,
        userId: identity.user.id,
      },
    },
  });

  if (!membership) {
    return NextResponse.json(
      { error: "Not a member of this room" },
      { status: 403 }
    );
  }

  let body: { enjoyment?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const enjoyment = body.enjoyment?.trim();
  if (!enjoyment) {
    return NextResponse.json({ error: "Enjoyment is required" }, { status: 400 });
  }

  if (enjoyment.length > 2000) {
    return NextResponse.json(
      { error: "Enjoyment must be 2000 characters or less" },
      { status: 400 }
    );
  }

  if (shouldRefreshIdentity(identity.payload)) {
    refreshIdentityToken(identity);
  }

  await prisma.roomMembership.update({
    where: { id: membership.id },
    data: { enjoyment },
  });

  emitPresenceUpdate({ roomId: room.id, reason: "updated" });

  const response = NextResponse.json({ success: true }, { status: 200 });
  if (identity.shouldSetCookie) {
    response.cookies.set(
      IDENTITY_COOKIE_NAME,
      identity.token,
      identityCookieAttributes(identity.payload.expiresAt)
    );
  }
  return response;
}
