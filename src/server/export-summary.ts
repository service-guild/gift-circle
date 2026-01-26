import PDFDocument from "pdfkit";
import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

type MembershipWithUser = Prisma.RoomMembershipGetPayload<{
  include: { user: true };
}>;

type ClaimWithRelations = Prisma.ClaimGetPayload<{
  include: {
    offer: {
      include: {
        author: {
          include: { user: true };
        };
      };
    };
    desire: {
      include: {
        author: {
          include: { user: true };
        };
      };
    };
    claimer: {
      include: { user: true };
    };
  };
}>;

export type MemberCommitmentEntry = {
  claimId: string;
  itemType: "offer" | "desire";
  itemTitle: string;
  itemDetails: string | null;
  role: "giving" | "receiving";
  counterpartName: string;
  note: string | null;
  updatedAt: string;
};

export type MemberCommitments = {
  giving: MemberCommitmentEntry[];
  receiving: MemberCommitmentEntry[];
};

const PDFKIT_DATA_DIR = path.join(
  process.cwd(),
  "node_modules",
  "pdfkit",
  "js",
  "data"
);
const LOG_PREFIX = "[pdf-export]";
const STANDARD_FONT_FILENAMES = [
  "Courier.afm",
  "Courier-Bold.afm",
  "Courier-Oblique.afm",
  "Courier-BoldOblique.afm",
  "Helvetica.afm",
  "Helvetica-Bold.afm",
  "Helvetica-Oblique.afm",
  "Helvetica-BoldOblique.afm",
  "Times-Roman.afm",
  "Times-Bold.afm",
  "Times-Italic.afm",
  "Times-BoldItalic.afm",
  "Symbol.afm",
  "ZapfDingbats.afm",
];

async function resolveFontSource(filename: string) {
  const source = path.join(PDFKIT_DATA_DIR, filename);
  try {
    await fs.access(source);
    return source;
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} missing standard font file`,
      filename,
      "at",
      source,
      error
    );
    return null;
  }
}

let fontsReady: Promise<void> | null = null;
let cachedFontTargets: Promise<string[]> | null = null;

async function directoryExists(target: string) {
  try {
    const result = await fs.stat(target);
    return result.isDirectory();
  } catch {
    return false;
  }
}

async function discoverPdfkitFontTargets() {
  if (!cachedFontTargets) {
    cachedFontTargets = (async () => {
      const targets = new Set<string>();

      const serverRoot = path.join(process.cwd(), ".next", "server");

      async function enqueueIfPdfkitChunk(dir: string) {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && /^pdfkit(\..+)?\.js$/i.test(entry.name)) {
              const dataDir = path.join(dir, "data");
              targets.add(dataDir);
              console.log(
                LOG_PREFIX,
                "discovered pdfkit chunk",
                path.join(dir, entry.name),
                "->",
                dataDir
              );
            }
          }
        } catch {
          /** ignore */
        }
      }

      async function walk(current: string) {
        let entries: Dirent[];
        try {
          entries = await fs.readdir(current, { withFileTypes: true });
        } catch {
          return;
        }

        await enqueueIfPdfkitChunk(current);

        for (const entry of entries) {
          if (!entry.isDirectory()) {
            continue;
          }
          if (entry.name === "data" || entry.name.startsWith(".")) {
            continue;
          }
          await walk(path.join(current, entry.name));
        }
      }

      if (await directoryExists(serverRoot)) {
        await walk(serverRoot);
      }

      const vendorChunkDir = path.join(serverRoot, "vendor-chunks");
      if (await directoryExists(vendorChunkDir)) {
        const vendorDataDir = path.join(vendorChunkDir, "data");
        targets.add(vendorDataDir);
        console.log(LOG_PREFIX, "including vendor chunk data directory", vendorDataDir);
      }

      if (targets.size === 0) {
        const fallback = path.join(serverRoot, "vendor-chunks", "data");
        targets.add(fallback);
        console.warn(
          LOG_PREFIX,
          "no pdfkit chunks discovered; using fallback",
          fallback
        );
      }

      return Array.from(targets);
    })();
  }

  return cachedFontTargets;
}

async function mirrorFontsInto(
  targetDir: string,
  fonts: { filename: string; source: string }[]
) {
  try {
    await fs.mkdir(targetDir, { recursive: true });
    await Promise.all(
      fonts.map(async ({ filename, source }) => {
        const destination = path.join(targetDir, filename);
        try {
          await fs.access(destination);
        } catch {
          console.log(LOG_PREFIX, "copying font", source, "to", destination);
          await fs.copyFile(source, destination);
        }
      })
    );
  } catch (error) {
    console.warn(
      `${LOG_PREFIX} unable to mirror PDFKit font assets into ${targetDir}`,
      error
    );
  }
}

async function ensureStandardFontsAvailable() {
  if (!fontsReady) {
    fontsReady = (async () => {
      if (!process.env.PDFKIT_DATA_DIR) {
        process.env.PDFKIT_DATA_DIR = PDFKIT_DATA_DIR;
      }

      if (process.env.VERCEL === "1") {
        console.log(LOG_PREFIX, "skipping font mirroring in serverless runtime", {
          pdfkitDataDir: process.env.PDFKIT_DATA_DIR,
        });
        return;
      }

      console.log(LOG_PREFIX, "ensuring standard fonts are present", {
        pdfkitDataDir: PDFKIT_DATA_DIR,
      });

      const availableFontSources = (
        await Promise.all(
          STANDARD_FONT_FILENAMES.map(async (filename) => ({
            filename,
            source: await resolveFontSource(filename),
          }))
        )
      ).filter((entry): entry is { filename: string; source: string } => {
        return Boolean(entry.source);
      });

      if (availableFontSources.length === 0) {
        console.error(
          LOG_PREFIX,
          "No PDFKit AFM font files available; PDF export cannot proceed"
        );
        return;
      }

      if (availableFontSources.length !== STANDARD_FONT_FILENAMES.length) {
        console.warn(
          LOG_PREFIX,
          `Only ${availableFontSources.length} of ${STANDARD_FONT_FILENAMES.length} standard fonts available`
        );
      }

      const targets = await discoverPdfkitFontTargets();
      console.log(
        LOG_PREFIX,
        "mirroring",
        availableFontSources.length,
        "AFM fonts to",
        targets
      );
      await Promise.all(
        targets.map((target) => mirrorFontsInto(target, availableFontSources))
      );
      console.log(LOG_PREFIX, "font mirroring complete");
    })();
  }
  return fontsReady;
}

function getClient(client?: PrismaClient) {
  return client ?? prisma;
}

function formatMemberDisplayName(member: MembershipWithUser) {
  const nickname = member.nickname?.trim();
  if (nickname) {
    return nickname;
  }
  const name = member.user.displayName?.trim();
  if (name) {
    return name;
  }
  return member.role === "HOST" ? "Host" : "Participant";
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(value);
}

function pushGivingEntry(
  target: MemberCommitments["giving"],
  claim: ClaimWithRelations,
  itemType: "offer" | "desire",
  itemTitle: string,
  itemDetails: string | null,
  counterpartName: string
) {
  target.push({
    claimId: claim.id,
    itemType,
    itemTitle,
    itemDetails,
    role: "giving",
    counterpartName,
    note: claim.note,
    updatedAt: claim.updatedAt.toISOString(),
  });
}

function pushReceivingEntry(
  target: MemberCommitments["receiving"],
  claim: ClaimWithRelations,
  itemType: "offer" | "desire",
  itemTitle: string,
  itemDetails: string | null,
  counterpartName: string
) {
  target.push({
    claimId: claim.id,
    itemType,
    itemTitle,
    itemDetails,
    role: "receiving",
    counterpartName,
    note: claim.note,
    updatedAt: claim.updatedAt.toISOString(),
  });
}

export async function collectMemberCommitments(
  roomId: string,
  membershipId: string,
  client?: PrismaClient
): Promise<MemberCommitments> {
  const db = getClient(client);

  const claims = await db.claim.findMany({
    where: {
      roomId,
      status: "ACCEPTED",
      OR: [
        { claimerMembershipId: membershipId },
        { offer: { authorMembershipId: membershipId } },
        { desire: { authorMembershipId: membershipId } },
      ],
    },
    include: {
      offer: {
        include: {
          author: {
            include: { user: true },
          },
        },
      },
      desire: {
        include: {
          author: {
            include: { user: true },
          },
        },
      },
      claimer: {
        include: { user: true },
      },
    },
    orderBy: { updatedAt: "asc" },
  });

  const commitments: MemberCommitments = { giving: [], receiving: [] };

  for (const claim of claims as ClaimWithRelations[]) {
    if (claim.offer) {
      const author = claim.offer.author;
      const claimer = claim.claimer;

      if (author.id === membershipId) {
        pushGivingEntry(
          commitments.giving,
          claim,
          "offer",
          claim.offer.title,
          claim.offer.details ?? null,
          formatMemberDisplayName(claimer)
        );
      }

      if (claimer.id === membershipId) {
        pushReceivingEntry(
          commitments.receiving,
          claim,
          "offer",
          claim.offer.title,
          claim.offer.details ?? null,
          formatMemberDisplayName(author)
        );
      }
    }

    if (claim.desire) {
      const author = claim.desire.author;
      const claimer = claim.claimer;

      if (author.id === membershipId) {
        pushReceivingEntry(
          commitments.receiving,
          claim,
          "desire",
          claim.desire.title,
          claim.desire.details ?? null,
          formatMemberDisplayName(claimer)
        );
      }

      if (claimer.id === membershipId) {
        pushGivingEntry(
          commitments.giving,
          claim,
          "desire",
          claim.desire.title,
          claim.desire.details ?? null,
          formatMemberDisplayName(author)
        );
      }
    }
  }

  return commitments;
}

// Elegant color palette with warm earth tones
const COLORS = {
  // Primary colors
  charcoal: "#2d3436",
  warmGray: "#636e72",
  lightGray: "#b2bec3",
  paleGray: "#dfe6e9",
  cream: "#ffeaa7",

  // Accent colors for sections
  sageGreen: "#a8e6cf",
  sageGreenDark: "#6b9080",
  warmGold: "#f9ca24",
  warmGoldLight: "#ffeaa7",
  softCoral: "#fab1a0",
  dustyRose: "#e17055",

  // Background colors
  paperWhite: "#fdfbf7",
  softIvory: "#f8f4e8",
  warmWhite: "#fffef9",

  // Text colors
  textPrimary: "#2d3436",
  textSecondary: "#636e72",
  textMuted: "#b2bec3",
};

// Draw decorative circular motifs (representing gift-giving circles)
function drawDecorativeCircles(doc: PDFKit.PDFDocument, x: number, y: number, opacity: number = 0.15) {
  doc.save();
  doc.opacity(opacity);

  // Outer ring
  doc.circle(x, y, 40).stroke(COLORS.sageGreen);

  // Middle ring
  doc.circle(x, y, 28).stroke(COLORS.warmGold);

  // Inner ring
  doc.circle(x, y, 16).stroke(COLORS.softCoral);

  // Center dot
  doc.circle(x, y, 4).fill(COLORS.charcoal);

  doc.restore();
}

// Draw elegant corner ornaments
function drawCornerOrnament(doc: PDFKit.PDFDocument, x: number, y: number, rotation: number, size: number = 30) {
  doc.save();
  doc.translate(x, y);
  doc.rotate(rotation);
  doc.opacity(0.2);

  // Curved flourish
  doc
    .moveTo(0, 0)
    .bezierCurveTo(size * 0.3, -size * 0.2, size * 0.7, -size * 0.1, size, 0)
    .stroke(COLORS.sageGreenDark);

  doc
    .moveTo(0, 0)
    .bezierCurveTo(-size * 0.2, size * 0.3, -size * 0.1, size * 0.7, 0, size)
    .stroke(COLORS.sageGreenDark);

  doc.restore();
}

// Draw a decorative divider line
function drawDivider(doc: PDFKit.PDFDocument, x: number, y: number, width: number) {
  const centerX = x + width / 2;

  doc.save();
  doc.opacity(0.3);

  // Left line
  doc
    .moveTo(x, y)
    .lineTo(centerX - 20, y)
    .stroke(COLORS.lightGray);

  // Right line
  doc
    .moveTo(centerX + 20, y)
    .lineTo(x + width, y)
    .stroke(COLORS.lightGray);

  // Center diamond
  doc
    .moveTo(centerX, y - 4)
    .lineTo(centerX + 4, y)
    .lineTo(centerX, y + 4)
    .lineTo(centerX - 4, y)
    .closePath()
    .fill(COLORS.warmGold);

  doc.restore();
}

export async function renderMemberSummaryPdf({
  member,
  commitments,
  generatedAt,
}: {
  member: MembershipWithUser;
  commitments: MemberCommitments;
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

  const memberName = formatMemberDisplayName(member);
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const contentWidth = pageWidth - 108;
  const margin = 54;

  // === BACKGROUND & DECORATIONS ===
  // Soft cream background
  doc.rect(0, 0, pageWidth, pageHeight).fill(COLORS.paperWhite);

  // Decorative corner ornaments (top corners only)
  drawCornerOrnament(doc, margin, margin, 0, 35);
  drawCornerOrnament(doc, pageWidth - margin, margin, 90, 35);

  // Decorative circles
  drawDecorativeCircles(doc, pageWidth - 60, 60, 0.08);
  drawDecorativeCircles(doc, 60, pageHeight - 60, 0.08);

  // === HEADER SECTION ===
  // Elegant header with gradient-like effect
  doc.save();
  doc.rect(0, 0, pageWidth, 130).fill(COLORS.softIvory);

  // Subtle decorative line under header
  doc
    .moveTo(margin, 128)
    .lineTo(pageWidth - margin, 128)
    .lineWidth(1)
    .stroke(COLORS.paleGray);
  doc.restore();

  // Title with elegant styling
  doc
    .font("Times-Bold")
    .fontSize(32)
    .fillColor(COLORS.charcoal)
    .text("Gift Circle", margin, 38, { align: "center", width: contentWidth });

  // Subtitle
  doc
    .font("Times-Italic")
    .fontSize(14)
    .fillColor(COLORS.warmGray)
    .text("Commitment Summary", margin, 76, { align: "center", width: contentWidth });

  doc.y = 150;

  // === PARTICIPANT INFO CARD ===
  const infoCardY = doc.y;
  const infoCardHeight = 60;

  // Card with subtle shadow effect (using layered rectangles)
  doc.save();
  doc.opacity(0.05);
  doc.roundedRect(margin + 2, infoCardY + 2, contentWidth, infoCardHeight, 8).fill(COLORS.charcoal);
  doc.restore();

  doc.roundedRect(margin, infoCardY, contentWidth, infoCardHeight, 8).fill(COLORS.warmWhite);
  doc.roundedRect(margin, infoCardY, contentWidth, infoCardHeight, 8).stroke(COLORS.paleGray);

  // Participant name with decorative element
  doc
    .font("Times-Bold")
    .fontSize(18)
    .fillColor(COLORS.charcoal)
    .text(memberName, margin, infoCardY + 16, { align: "center", width: contentWidth });

  // Date with subtle styling
  doc
    .font("Times-Roman")
    .fontSize(11)
    .fillColor(COLORS.warmGray)
    .text(formatDate(generatedAt), margin, infoCardY + 38, { align: "center", width: contentWidth });

  doc.y = infoCardY + infoCardHeight + 30;

  // === COMMITMENTS SECTIONS ===
  if (commitments.giving.length === 0 && commitments.receiving.length === 0) {
    drawDivider(doc, margin, doc.y, contentWidth);
    doc.y += 20;

    const emptyY = doc.y;
    doc.roundedRect(margin, emptyY, contentWidth, 70, 10).fill(COLORS.softIvory);

    doc
      .font("Times-Italic")
      .fontSize(13)
      .fillColor(COLORS.warmGray)
      .text(
        "No commitments have been recorded yet.",
        margin,
        emptyY + 26,
        { align: "center", width: contentWidth }
      );
  } else {
    const writeSection = (
      title: string,
      items: MemberCommitmentEntry[],
      counterpartPrefix: "To" | "From",
      accentColor: string,
      bgColor: string
    ) => {
      // Section divider
      drawDivider(doc, margin, doc.y, contentWidth);
      doc.y += 16;

      // Section header with accent
      const headerY = doc.y;

      // Small decorative accent bar
      doc.rect(margin, headerY, 4, 22).fill(accentColor);

      doc
        .font("Times-Bold")
        .fontSize(16)
        .fillColor(COLORS.charcoal)
        .text(title, margin + 14, headerY + 2);

      doc.y = headerY + 30;

      if (items.length === 0) {
        doc
          .font("Times-Italic")
          .fontSize(11)
          .fillColor(COLORS.textMuted)
          .text("None", margin + 14);
        doc.y += 20;
        return;
      }

      items.forEach((entry, index) => {
        // Calculate card height
        let estimatedHeight = 54;
        if (entry.itemDetails) estimatedHeight += 18;
        if (entry.note) estimatedHeight += 18;

        // Page break check
        if (doc.y + estimatedHeight > pageHeight - 80) {
          doc.addPage();
          doc.rect(0, 0, pageWidth, pageHeight).fill(COLORS.paperWhite);
          doc.y = margin;
        }

        const cardY = doc.y;
        const cardX = margin;
        const cardWidth = contentWidth;

        // Card with subtle styling
        doc.save();
        doc.opacity(0.03);
        doc.roundedRect(cardX + 2, cardY + 2, cardWidth, estimatedHeight, 8).fill(COLORS.charcoal);
        doc.restore();

        doc.roundedRect(cardX, cardY, cardWidth, estimatedHeight, 8).fill(bgColor);

        // Left accent strip
        doc.save();
        doc.rect(cardX, cardY + 4, 3, estimatedHeight - 8).fill(accentColor);
        doc.restore();

        let textY = cardY + 12;
        const textX = cardX + 16;

        // Counterpart info
        doc
          .font("Times-Roman")
          .fontSize(10)
          .fillColor(COLORS.warmGray)
          .text(`${counterpartPrefix}:`, textX, textY, { continued: true })
          .font("Times-Bold")
          .fillColor(COLORS.textSecondary)
          .text(` ${entry.counterpartName}`);

        textY += 16;

        // Item title
        doc
          .font("Times-Bold")
          .fontSize(13)
          .fillColor(COLORS.textPrimary)
          .text(entry.itemTitle, textX, textY, { width: cardWidth - 32 });

        textY += 16;

        // Details
        if (entry.itemDetails) {
          doc
            .font("Times-Roman")
            .fontSize(10)
            .fillColor(COLORS.textSecondary)
            .text(entry.itemDetails, textX, textY, { width: cardWidth - 32 });
          textY += 16;
        }

        // Note
        if (entry.note) {
          doc
            .font("Times-Italic")
            .fontSize(10)
            .fillColor(COLORS.textMuted)
            .text(`"${entry.note}"`, textX, textY, { width: cardWidth - 32 });
        }

        doc.y = cardY + estimatedHeight + 10;
      });

      doc.y += 10;
    };

    // Giving section with sage green accent
    writeSection("Giving", commitments.giving, "To", COLORS.sageGreen, COLORS.warmWhite);

    // Receiving section with warm gold accent
    writeSection("Receiving", commitments.receiving, "From", COLORS.warmGold, COLORS.softIvory);
  }

  // === FOOTER LINE ===
  drawDivider(doc, margin, pageHeight - 50, contentWidth);

  doc.end();

  await completed;

  return Buffer.concat(chunks);
}

export function renderMemberSummaryMarkdown({
  member,
  commitments,
  generatedAt,
}: {
  member: MembershipWithUser;
  commitments: MemberCommitments;
  generatedAt: Date;
}): string {
  const memberName = formatMemberDisplayName(member);
  const lines: string[] = [];

  lines.push("# Gift Circle - Commitment Summary");
  lines.push("");
  lines.push(`**Participant:** ${memberName}`);
  lines.push(`**Date:** ${formatDate(generatedAt)}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  if (commitments.giving.length === 0 && commitments.receiving.length === 0) {
    lines.push("*No commitments have been recorded yet.*");
  } else {
    // Giving section
    lines.push("## Giving");
    lines.push("");
    if (commitments.giving.length === 0) {
      lines.push("*None*");
    } else {
      for (const entry of commitments.giving) {
        lines.push(`### ${entry.itemTitle}`);
        lines.push(`**To:** ${entry.counterpartName}`);
        if (entry.itemDetails) {
          lines.push(`**Details:** ${entry.itemDetails}`);
        }
        if (entry.note) {
          lines.push(`**Note:** "${entry.note}"`);
        }
        lines.push("");
      }
    }
    lines.push("");

    // Receiving section
    lines.push("## Receiving");
    lines.push("");
    if (commitments.receiving.length === 0) {
      lines.push("*None*");
    } else {
      for (const entry of commitments.receiving) {
        lines.push(`### ${entry.itemTitle}`);
        lines.push(`**From:** ${entry.counterpartName}`);
        if (entry.itemDetails) {
          lines.push(`**Details:** ${entry.itemDetails}`);
        }
        if (entry.note) {
          lines.push(`**Note:** "${entry.note}"`);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}
