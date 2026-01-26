import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/room-code";
import {
  IDENTITY_COOKIE_NAME,
  identityCookieAttributes,
  resolveIdentity,
} from "@/lib/identity";
import {
  collectAllCommitments,
  renderHostSummaryPdf,
  renderHostSummaryMarkdown,
} from "@/server/export-host-summary";

const LOG_PREFIX = "[host-export]";

function sanitizeForFilename(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function withIdentityCookie(
  response: NextResponse,
  identity: Awaited<ReturnType<typeof resolveIdentity>>
) {
  if (identity.shouldSetCookie) {
    response.cookies.set(
      IDENTITY_COOKIE_NAME,
      identity.token,
      identityCookieAttributes(identity.payload.expiresAt)
    );
  }
  return response;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "pdf";

  console.log(LOG_PREFIX, "export-all route request", { roomCode: code, format });

  if (!code || !isValidRoomCode(code)) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  }
  const roomCode = normalizeRoomCode(code);

  const cookie = request.cookies.get(IDENTITY_COOKIE_NAME)?.value;
  const identity = await resolveIdentity(cookie);

  const room = await prisma.room.findUnique({
    where: { code: roomCode },
    select: {
      id: true,
      code: true,
      title: true,
      currentRound: true,
      hostId: true,
    },
  });

  if (!room) {
    console.warn(LOG_PREFIX, "room not found", { roomCode });
    return withIdentityCookie(
      NextResponse.json({ error: "Room not found" }, { status: 404 }),
      identity
    );
  }

  // Check if user is the host
  const membership = await prisma.roomMembership.findUnique({
    where: {
      roomId_userId: {
        roomId: room.id,
        userId: identity.user.id,
      },
    },
    include: {
      user: true,
    },
  });

  if (!membership) {
    console.warn(LOG_PREFIX, "membership not found", {
      roomId: room.id,
      userId: identity.user.id,
    });
    return withIdentityCookie(
      NextResponse.json({ error: "Not a member of this room" }, { status: 403 }),
      identity
    );
  }

  if (membership.role !== "HOST") {
    console.warn(LOG_PREFIX, "user is not host", {
      roomId: room.id,
      membershipId: membership.id,
      role: membership.role,
    });
    return withIdentityCookie(
      NextResponse.json({ error: "Only the host can export all data" }, { status: 403 }),
      identity
    );
  }

  if (room.currentRound !== "DECISIONS" && room.currentRound !== "SUMMARY") {
    console.warn(LOG_PREFIX, "room not in decisions or summary round", {
      roomId: room.id,
      currentRound: room.currentRound,
    });
    return withIdentityCookie(
      NextResponse.json(
        {
          error: "Export is only available during the Decisions or Summary round",
          message: `Room is currently in the ${room.currentRound} round`,
        },
        { status: 409 }
      ),
      identity
    );
  }

  console.log(LOG_PREFIX, "collecting all data", { roomId: room.id });
  const allData = await collectAllCommitments(room.id);
  console.log(LOG_PREFIX, "data collected", {
    commitments: allData.commitments.length,
    participants: allData.participants.length,
    shares: allData.shares.length,
  });

  const roomTitle = room.title || "Gift Circle";
  const filename = sanitizeForFilename(roomTitle);

  if (format === "markdown" || format === "md" || format === "txt") {
    const markdown = renderHostSummaryMarkdown({
      roomTitle,
      data: allData,
      generatedAt: new Date(),
    });

    const response = new NextResponse(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}-summary.md"`,
        "Cache-Control": "no-store",
      },
    });

    return withIdentityCookie(response, identity);
  }

  // Default to PDF
  let pdfBuffer: Buffer;
  try {
    console.log(LOG_PREFIX, "rendering PDF", { roomId: room.id });
    pdfBuffer = await renderHostSummaryPdf({
      roomTitle,
      data: allData,
      generatedAt: new Date(),
    });
    console.log(LOG_PREFIX, "PDF rendered", { byteLength: pdfBuffer.byteLength });
  } catch (error) {
    console.error("Failed to render host summary PDF", { roomId: room.id }, error);
    return withIdentityCookie(
      NextResponse.json(
        {
          error: "Failed to generate PDF",
          message: "An unexpected error occurred while rendering the report.",
        },
        { status: 500 }
      ),
      identity
    );
  }

  const response = new NextResponse(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}-summary.pdf"`,
      "Cache-Control": "no-store",
      "Content-Length": Buffer.byteLength(pdfBuffer).toString(),
    },
  });

  return withIdentityCookie(response, identity);
}
