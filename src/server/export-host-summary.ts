import PDFDocument from "pdfkit";
import { promises as fs } from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/prisma";

type ParticipantInfo = {
  membershipId: string;
  name: string;
  role: "HOST" | "PARTICIPANT";
  enjoyment: string | null;
  givingCount: number;
  receivingCount: number;
};

type CommitmentInfo = {
  itemTitle: string;
  itemDetails: string | null;
  itemType: "offer" | "desire";
  giverName: string;
  giverMembershipId: string;
  receiverName: string;
  receiverMembershipId: string;
  note: string | null;
};

type ShareInfo = {
  membershipId: string;
  name: string;
  enjoyment: string;
};

export type HostSummaryData = {
  participants: ParticipantInfo[];
  commitments: CommitmentInfo[];
  shares: ShareInfo[];
  stats: {
    totalParticipants: number;
    totalOffers: number;
    totalDesires: number;
    totalCommitments: number;
    averageCommitmentsPerPerson: number;
    topGiver: { name: string; count: number } | null;
    topReceiver: { name: string; count: number } | null;
  };
};

function formatMemberDisplayName(member: {
  nickname: string | null;
  role: string;
  user: { displayName: string | null };
}) {
  const nickname = member.nickname?.trim();
  if (nickname) return nickname;
  const name = member.user.displayName?.trim();
  if (name) return name;
  return member.role === "HOST" ? "Host" : "Participant";
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export async function collectAllCommitments(roomId: string): Promise<HostSummaryData> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      memberships: {
        include: { user: true },
      },
      offers: true,
      desires: true,
      claims: {
        where: { status: "ACCEPTED" },
        include: {
          offer: {
            include: {
              author: { include: { user: true } },
            },
          },
          desire: {
            include: {
              author: { include: { user: true } },
            },
          },
          claimer: { include: { user: true } },
        },
      },
    },
  });

  if (!room) {
    return {
      participants: [],
      commitments: [],
      shares: [],
      stats: {
        totalParticipants: 0,
        totalOffers: 0,
        totalDesires: 0,
        totalCommitments: 0,
        averageCommitmentsPerPerson: 0,
        topGiver: null,
        topReceiver: null,
      },
    };
  }

  // Build participant info with giving/receiving counts
  const givingCounts = new Map<string, number>();
  const receivingCounts = new Map<string, number>();

  const commitments: CommitmentInfo[] = [];

  for (const claim of room.claims) {
    if (claim.offer) {
      const giver = claim.offer.author;
      const receiver = claim.claimer;

      givingCounts.set(giver.id, (givingCounts.get(giver.id) || 0) + 1);
      receivingCounts.set(receiver.id, (receivingCounts.get(receiver.id) || 0) + 1);

      commitments.push({
        itemTitle: claim.offer.title,
        itemDetails: claim.offer.details,
        itemType: "offer",
        giverName: formatMemberDisplayName(giver),
        giverMembershipId: giver.id,
        receiverName: formatMemberDisplayName(receiver),
        receiverMembershipId: receiver.id,
        note: claim.note,
      });
    }

    if (claim.desire) {
      const receiver = claim.desire.author;
      const giver = claim.claimer;

      givingCounts.set(giver.id, (givingCounts.get(giver.id) || 0) + 1);
      receivingCounts.set(receiver.id, (receivingCounts.get(receiver.id) || 0) + 1);

      commitments.push({
        itemTitle: claim.desire.title,
        itemDetails: claim.desire.details,
        itemType: "desire",
        giverName: formatMemberDisplayName(giver),
        giverMembershipId: giver.id,
        receiverName: formatMemberDisplayName(receiver),
        receiverMembershipId: receiver.id,
        note: claim.note,
      });
    }
  }

  const participants: ParticipantInfo[] = room.memberships.map((m) => ({
    membershipId: m.id,
    name: formatMemberDisplayName(m),
    role: m.role as "HOST" | "PARTICIPANT",
    enjoyment: m.enjoyment,
    givingCount: givingCounts.get(m.id) || 0,
    receivingCount: receivingCounts.get(m.id) || 0,
  }));

  const shares: ShareInfo[] = room.memberships
    .filter((m) => m.enjoyment)
    .map((m) => ({
      membershipId: m.id,
      name: formatMemberDisplayName(m),
      enjoyment: m.enjoyment!,
    }));

  // Calculate stats
  let topGiver: { name: string; count: number } | null = null;
  let topReceiver: { name: string; count: number } | null = null;

  for (const p of participants) {
    if (p.givingCount > 0 && (!topGiver || p.givingCount > topGiver.count)) {
      topGiver = { name: p.name, count: p.givingCount };
    }
    if (p.receivingCount > 0 && (!topReceiver || p.receivingCount > topReceiver.count)) {
      topReceiver = { name: p.name, count: p.receivingCount };
    }
  }

  const participantsWithCommitments = participants.filter(
    (p) => p.givingCount > 0 || p.receivingCount > 0
  );

  const stats = {
    totalParticipants: participants.length,
    totalOffers: room.offers.length,
    totalDesires: room.desires.length,
    totalCommitments: commitments.length,
    averageCommitmentsPerPerson:
      participantsWithCommitments.length > 0
        ? (commitments.length * 2) / participantsWithCommitments.length
        : 0,
    topGiver,
    topReceiver,
  };

  return { participants, commitments, shares, stats };
}

export function renderHostSummaryMarkdown({
  roomTitle,
  data,
  generatedAt,
}: {
  roomTitle: string;
  data: HostSummaryData;
  generatedAt: Date;
}): string {
  const lines: string[] = [];

  lines.push(`# ${roomTitle} - Gift Circle Summary`);
  lines.push("");
  lines.push(`*Generated: ${formatDate(generatedAt)}*`);
  lines.push("");

  // Stats
  lines.push("## Statistics");
  lines.push("");
  lines.push(`- **Participants:** ${data.stats.totalParticipants}`);
  lines.push(`- **Total Offers:** ${data.stats.totalOffers}`);
  lines.push(`- **Total Desires:** ${data.stats.totalDesires}`);
  lines.push(`- **Confirmed Commitments:** ${data.stats.totalCommitments}`);
  lines.push(`- **Avg Commitments per Person:** ${data.stats.averageCommitmentsPerPerson.toFixed(1)}`);
  if (data.stats.topGiver) {
    lines.push(`- **Top Giver:** ${data.stats.topGiver.name} (${data.stats.topGiver.count} gifts)`);
  }
  if (data.stats.topReceiver) {
    lines.push(`- **Top Receiver:** ${data.stats.topReceiver.name} (${data.stats.topReceiver.count} gifts)`);
  }
  lines.push("");

  // Participants
  lines.push("## Participants");
  lines.push("");
  for (const p of data.participants) {
    const role = p.role === "HOST" ? " (Host)" : "";
    const stats = `[Giving: ${p.givingCount}, Receiving: ${p.receivingCount}]`;
    lines.push(`- **${p.name}**${role} ${stats}`);
  }
  lines.push("");

  // Commitments
  lines.push("## All Commitments");
  lines.push("");
  if (data.commitments.length === 0) {
    lines.push("*No confirmed commitments.*");
  } else {
    for (const c of data.commitments) {
      lines.push(`### ${c.itemTitle}`);
      if (c.itemDetails) {
        lines.push(`*${c.itemDetails}*`);
      }
      lines.push("");
      lines.push(`- **From:** ${c.giverName}`);
      lines.push(`- **To:** ${c.receiverName}`);
      if (c.note) {
        lines.push(`- **Note:** "${c.note}"`);
      }
      lines.push("");
    }
  }

  // Shares
  lines.push("## What Everyone Shared");
  lines.push("");
  if (data.shares.length === 0) {
    lines.push("*No one has shared their experience yet.*");
  } else {
    for (const s of data.shares) {
      lines.push(`### ${s.name}`);
      lines.push("");
      lines.push(s.enjoyment);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push("*Exported from Gift Circle*");

  return lines.join("\n");
}

// Greyscale color palette
const COLORS = {
  black: "#000000",
  gray900: "#1a1a1a",
  gray700: "#404040",
  gray600: "#525252",
  gray500: "#6b6b6b",
  gray400: "#a3a3a3",
  gray300: "#d4d4d4",
  gray200: "#e5e5e5",
  gray100: "#f5f5f5",
  white: "#ffffff",
};

const PDFKIT_DATA_DIR = path.join(
  process.cwd(),
  "node_modules",
  "pdfkit",
  "js",
  "data"
);

let fontsReady: Promise<void> | null = null;

async function ensureStandardFontsAvailable() {
  if (!fontsReady) {
    fontsReady = (async () => {
      if (!process.env.PDFKIT_DATA_DIR) {
        process.env.PDFKIT_DATA_DIR = PDFKIT_DATA_DIR;
      }
    })();
  }
  return fontsReady;
}

export async function renderHostSummaryPdf({
  roomTitle,
  data,
  generatedAt,
}: {
  roomTitle: string;
  data: HostSummaryData;
  generatedAt: Date;
}): Promise<Buffer> {
  await ensureStandardFontsAvailable();

  const doc = new PDFDocument({ margin: 54, size: "LETTER" });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk) => {
    chunks.push(chunk as Buffer);
  });

  const completed = new Promise<void>((resolve) => {
    doc.on("end", () => resolve());
  });

  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 108;

  // === HEADER ===
  doc.rect(0, 0, pageWidth, 110).fill(COLORS.gray100);

  doc
    .font("Helvetica-Bold")
    .fontSize(24)
    .fillColor(COLORS.black)
    .text(roomTitle, 54, 36, { align: "center", width: contentWidth });

  doc
    .font("Helvetica")
    .fontSize(12)
    .fillColor(COLORS.gray600)
    .text("Host Summary Report", 54, 66, { align: "center", width: contentWidth });

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.gray500)
    .text(formatDate(generatedAt), 54, 86, { align: "center", width: contentWidth });

  doc.y = 130;

  // === STATISTICS ===
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(COLORS.black)
    .text("Statistics", 54);

  doc.moveDown(0.5);

  const statsY = doc.y;
  const statBoxWidth = (contentWidth - 20) / 3;
  const statBoxHeight = 50;

  const statBoxes = [
    { label: "Participants", value: data.stats.totalParticipants.toString() },
    { label: "Commitments", value: data.stats.totalCommitments.toString() },
    { label: "Avg/Person", value: data.stats.averageCommitmentsPerPerson.toFixed(1) },
  ];

  statBoxes.forEach((stat, i) => {
    const x = 54 + i * (statBoxWidth + 10);
    doc.roundedRect(x, statsY, statBoxWidth, statBoxHeight, 6).fill(COLORS.gray200);

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor(COLORS.black)
      .text(stat.value, x, statsY + 10, { align: "center", width: statBoxWidth });

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.gray600)
      .text(stat.label, x, statsY + 32, { align: "center", width: statBoxWidth });
  });

  doc.y = statsY + statBoxHeight + 20;

  // Top giver/receiver
  if (data.stats.topGiver || data.stats.topReceiver) {
    const highlightsY = doc.y;
    const highlightWidth = (contentWidth - 10) / 2;

    if (data.stats.topGiver) {
      doc.roundedRect(54, highlightsY, highlightWidth, 36, 4).fill(COLORS.gray100);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLORS.gray600)
        .text("Top Giver", 54, highlightsY + 6, { align: "center", width: highlightWidth });
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(COLORS.black)
        .text(`${data.stats.topGiver.name} (${data.stats.topGiver.count})`, 54, highlightsY + 18, {
          align: "center",
          width: highlightWidth,
        });
    }

    if (data.stats.topReceiver) {
      const x2 = 54 + highlightWidth + 10;
      doc.roundedRect(x2, highlightsY, highlightWidth, 36, 4).fill(COLORS.gray100);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLORS.gray600)
        .text("Top Receiver", x2, highlightsY + 6, { align: "center", width: highlightWidth });
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(COLORS.black)
        .text(`${data.stats.topReceiver.name} (${data.stats.topReceiver.count})`, x2, highlightsY + 18, {
          align: "center",
          width: highlightWidth,
        });
    }

    doc.y = highlightsY + 50;
  }

  // === COMMITMENTS ===
  doc.moveDown(0.5);
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(COLORS.black)
    .text("All Commitments", 54);
  doc.moveDown(0.5);

  if (data.commitments.length === 0) {
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor(COLORS.gray500)
      .text("No confirmed commitments.", 54);
  } else {
    for (const c of data.commitments) {
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
        doc.y = 54;
      }

      const cardY = doc.y;
      const cardHeight = c.itemDetails || c.note ? 70 : 50;

      doc.roundedRect(54, cardY, contentWidth, cardHeight, 6).fill(COLORS.gray100);

      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(COLORS.black)
        .text(c.itemTitle, 66, cardY + 10, { width: contentWidth - 24 });

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLORS.gray600)
        .text(`${c.giverName} → ${c.receiverName}`, 66, cardY + 26);

      let detailY = cardY + 40;
      if (c.itemDetails) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(COLORS.gray500)
          .text(c.itemDetails, 66, detailY, { width: contentWidth - 24 });
        detailY += 14;
      }

      if (c.note) {
        doc
          .font("Helvetica-Oblique")
          .fontSize(9)
          .fillColor(COLORS.gray500)
          .text(`"${c.note}"`, 66, detailY, { width: contentWidth - 24 });
      }

      doc.y = cardY + cardHeight + 8;
    }
  }

  // === SHARES ===
  doc.moveDown(1);
  if (doc.y > doc.page.height - 150) {
    doc.addPage();
    doc.y = 54;
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(COLORS.black)
    .text("What Everyone Shared", 54);
  doc.moveDown(0.5);

  if (data.shares.length === 0) {
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor(COLORS.gray500)
      .text("No one has shared their experience yet.", 54);
  } else {
    for (const s of data.shares) {
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
        doc.y = 54;
      }

      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(COLORS.black)
        .text(s.name, 54);

      doc.moveDown(0.3);

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(COLORS.gray700)
        .text(s.enjoyment, 54, doc.y, { width: contentWidth });

      doc.moveDown(1);
    }
  }

  doc.end();

  await completed;

  return Buffer.concat(chunks);
}
