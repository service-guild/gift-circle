"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useRoom } from "@/app/rooms/[code]/room-context";
import { buildCommitmentPreview } from "@/lib/room-commitments";

type DownloadState =
  | { status: "idle" }
  | { status: "loading"; format: "pdf" | "markdown" }
  | { status: "success" }
  | { status: "error"; message: string };

type EnjoymentState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success" }
  | { status: "error"; message: string };

function sanitizeForFilename(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

type HostDownloadState =
  | { status: "idle" }
  | { status: "loading"; format: "pdf" | "markdown" }
  | { status: "success" }
  | { status: "error"; message: string };

export default function SummaryPage() {
  const { room, membershipId, refresh, isHost } = useRoom();
  const [downloadState, setDownloadState] = useState<DownloadState>({ status: "idle" });
  const [enjoymentDraft, setEnjoymentDraft] = useState("");
  const [enjoymentState, setEnjoymentState] = useState<EnjoymentState>({ status: "idle" });
  const [hostDownloadState, setHostDownloadState] = useState<HostDownloadState>({ status: "idle" });

  const isSummaryRound = room.currentRound === "SUMMARY";

  const commitmentPreview = useMemo(() => buildCommitmentPreview(room), [room]);

  const currentMember = useMemo(() => {
    if (!membershipId) return null;
    return room.members.find((m) => m.membershipId === membershipId) ?? null;
  }, [room.members, membershipId]);

  const hasSubmittedEnjoyment = Boolean(currentMember?.enjoyment);

  const hasAcceptedCommitment = useMemo(() => {
    if (!membershipId) {
      return false;
    }
    const viewerCommitments = commitmentPreview.get(membershipId);
    if (!viewerCommitments) {
      return false;
    }
    return (
      viewerCommitments.giving.length > 0 || viewerCommitments.receiving.length > 0
    );
  }, [commitmentPreview, membershipId]);

  const handleDownload = useCallback(async (format: "pdf" | "markdown") => {
    if (!membershipId || downloadState.status === "loading" || !hasAcceptedCommitment) {
      return;
    }

    setDownloadState({ status: "loading", format });

    try {
      const response = await fetch(`/api/rooms/${room.code}/export?format=${format}`, {
        headers: {
          Accept: format === "pdf" ? "application/pdf" : "text/markdown",
        },
      });

      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({ message: `Failed to generate ${format.toUpperCase()}.` }));
        const message =
          (payload as { message?: string; error?: string }).message ??
          (payload as { error?: string }).error ??
          `Failed to generate ${format.toUpperCase()}.`;
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const userName = sanitizeForFilename(currentMember?.nickname || currentMember?.displayName || "participant");
      const ext = format === "pdf" ? "pdf" : "md";
      const filename = room.title
        ? `gift-circle-${sanitizeForFilename(room.title)}-${userName}.${ext}`
        : `gift-circle-${userName}.${ext}`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setDownloadState({ status: "success" });
    } catch (err) {
      const message = (err as Error)?.message ?? `Failed to generate ${format.toUpperCase()}.`;
      setDownloadState({ status: "error", message });
    }
  }, [membershipId, downloadState.status, room.code, room.title, hasAcceptedCommitment, currentMember]);

  useEffect(() => {
    if (downloadState.status === "success" || downloadState.status === "error") {
      const timer = window.setTimeout(() => {
        setDownloadState({ status: "idle" });
      }, 4000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [downloadState.status]);

  useEffect(() => {
    if (hostDownloadState.status === "success" || hostDownloadState.status === "error") {
      const timer = window.setTimeout(() => {
        setHostDownloadState({ status: "idle" });
      }, 4000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [hostDownloadState.status]);

  const handleHostDownload = useCallback(async (format: "pdf" | "markdown") => {
    if (!membershipId || !isHost || hostDownloadState.status === "loading") {
      return;
    }

    setHostDownloadState({ status: "loading", format });

    try {
      const response = await fetch(
        `/api/rooms/${room.code}/export-all?format=${format}`,
        { headers: { Accept: format === "pdf" ? "application/pdf" : "text/markdown" } }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ message: "Failed to generate export." }));
        const message =
          (payload as { message?: string; error?: string }).message ??
          (payload as { error?: string }).error ??
          "Failed to generate export.";
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const roomName = sanitizeForFilename(room.title || "gift-circle");
      const ext = format === "pdf" ? "pdf" : "md";
      link.download = `${roomName}-summary.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setHostDownloadState({ status: "success" });
    } catch (err) {
      const message = (err as Error)?.message ?? "Failed to generate export.";
      setHostDownloadState({ status: "error", message });
    }
  }, [membershipId, isHost, hostDownloadState.status, room.code, room.title]);

  const handleSubmitEnjoyment = useCallback(async () => {
    if (!membershipId || enjoymentState.status === "saving") {
      return;
    }

    const trimmedEnjoyment = enjoymentDraft.trim();
    if (!trimmedEnjoyment) {
      return;
    }

    setEnjoymentState({ status: "saving" });

    try {
      const response = await fetch(`/api/rooms/${room.code}/enjoyment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enjoyment: trimmedEnjoyment }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ message: "Failed to save." }));
        throw new Error(
          (payload as { message?: string; error?: string }).message ??
            (payload as { error?: string }).error ??
            "Failed to save."
        );
      }

      setEnjoymentState({ status: "success" });
      setEnjoymentDraft("");
      await refresh();
    } catch (err) {
      const message = (err as Error)?.message ?? "Failed to save.";
      setEnjoymentState({ status: "error", message });
    }
  }, [membershipId, enjoymentState.status, enjoymentDraft, room.code, refresh]);

  const getMemberDisplayName = useCallback(
    (memberId: string) => {
      const member = room.members.find((entry) => entry.membershipId === memberId);
      if (!member) {
        return "Unknown";
      }
      const nickname = member.nickname?.trim();
      const name = member.displayName?.trim();
      if (nickname) {
        return nickname;
      }
      if (name) {
        return name;
      }
      return member.role === "HOST" ? "Host" : "Participant";
    },
    [room.members]
  );

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    // Total unique commitments (count each claim only once)
    const acceptedClaims = room.claims.filter((c) => c.status === "ACCEPTED");
    const totalCommitments = acceptedClaims.length;

    // Calculate giving/receiving counts per member
    const givingCounts = new Map<string, number>();
    const receivingCounts = new Map<string, number>();

    for (const [membershipId, data] of commitmentPreview.entries()) {
      givingCounts.set(membershipId, data.giving.length);
      receivingCounts.set(membershipId, data.receiving.length);
    }

    // Find top giver
    let topGiver: { membershipId: string; count: number } | null = null;
    for (const [memberId, count] of givingCounts.entries()) {
      if (count > 0 && (!topGiver || count > topGiver.count)) {
        topGiver = { membershipId: memberId, count };
      }
    }

    // Find top receiver
    let topReceiver: { membershipId: string; count: number } | null = null;
    for (const [memberId, count] of receivingCounts.entries()) {
      if (count > 0 && (!topReceiver || count > topReceiver.count)) {
        topReceiver = { membershipId: memberId, count };
      }
    }

    // Calculate average commitments per person (total commitments * 2 / number of participants with commitments)
    // Since each commitment involves 2 people, we count each side
    const participantsWithCommitments = new Set<string>();
    for (const claim of acceptedClaims) {
      participantsWithCommitments.add(claim.claimerMembershipId);
      const offer = claim.offerId ? room.offers.find((o) => o.id === claim.offerId) : null;
      const desire = claim.desireId ? room.desires.find((d) => d.id === claim.desireId) : null;
      if (offer) {
        participantsWithCommitments.add(offer.authorMembershipId);
      }
      if (desire) {
        participantsWithCommitments.add(desire.authorMembershipId);
      }
    }

    const avgCommitmentsPerPerson =
      participantsWithCommitments.size > 0
        ? (totalCommitments * 2) / participantsWithCommitments.size
        : 0;

    return {
      totalCommitments,
      avgCommitmentsPerPerson,
      topGiver,
      topReceiver,
    };
  }, [room.claims, room.offers, room.desires, commitmentPreview]);

  // Get all enjoyment submissions (including current user's)
  const allEnjoyments = useMemo(() => {
    return room.members
      .filter((m) => m.enjoyment)
      .map((m) => ({
        membershipId: m.membershipId,
        name: getMemberDisplayName(m.membershipId),
        enjoyment: m.enjoyment!,
        isCurrentUser: m.membershipId === membershipId,
      }));
  }, [room.members, membershipId, getMemberDisplayName]);

  return (
    <div className="space-y-6">
      <header className="section-card space-y-4" role="banner">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h1 className="font-display text-4xl font-semibold text-center md:text-left flex-1" style={{ color: "var(--earth-900)" }}>
            Summary
          </h1>
          {membershipId ? (
            <div className="flex flex-col items-center gap-2 md:items-end">
              <span className="text-xs font-medium" style={{ color: "var(--earth-500)" }}>
                Download my commitments:
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`btn-outline text-xs ${
                    !hasAcceptedCommitment || downloadState.status === "loading"
                      ? "cursor-not-allowed opacity-50"
                      : ""
                  }`}
                  onClick={() => handleDownload("pdf")}
                  disabled={downloadState.status === "loading" || !hasAcceptedCommitment}
                  title={
                    !hasAcceptedCommitment
                      ? "Available after you have at least one accepted commitment."
                      : undefined
                  }
                >
                  {downloadState.status === "loading" && downloadState.format === "pdf"
                    ? "Preparing…"
                    : "PDF"}
                </button>
                <button
                  type="button"
                  className={`btn-outline text-xs ${
                    !hasAcceptedCommitment || downloadState.status === "loading"
                      ? "cursor-not-allowed opacity-50"
                      : ""
                  }`}
                  onClick={() => handleDownload("markdown")}
                  disabled={downloadState.status === "loading" || !hasAcceptedCommitment}
                  title={
                    !hasAcceptedCommitment
                      ? "Available after you have at least one accepted commitment."
                      : undefined
                  }
                >
                  {downloadState.status === "loading" && downloadState.format === "markdown"
                    ? "Preparing…"
                    : "Markdown"}
                </button>
              </div>
              {downloadState.status === "success" ? (
                <span className="text-xs" style={{ color: "var(--green-600)" }}>Download started.</span>
              ) : null}
              {downloadState.status === "error" ? (
                <span className="text-xs text-red-600">{downloadState.message}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        {!isSummaryRound ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            The summary will be available once the host advances the room to the Summary round.
          </p>
        ) : null}

        {/* Host Download Section */}
        {isSummaryRound && isHost && (
          <div
            className="rounded-xl p-4"
            style={{ background: "var(--earth-50)", border: "1px solid var(--earth-200)" }}
          >
            <p className="text-sm font-semibold mb-3" style={{ color: "var(--earth-700)" }}>
              Host: Download Everything
            </p>
            <p className="text-xs mb-3" style={{ color: "var(--earth-500)" }}>
              Export all commitments, statistics, and shared experiences.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-outline text-xs"
                onClick={() => handleHostDownload("pdf")}
                disabled={hostDownloadState.status === "loading"}
              >
                {hostDownloadState.status === "loading" && hostDownloadState.format === "pdf"
                  ? "Preparing…"
                  : "PDF"}
              </button>
              <button
                type="button"
                className="btn-outline text-xs"
                onClick={() => handleHostDownload("markdown")}
                disabled={hostDownloadState.status === "loading"}
              >
                {hostDownloadState.status === "loading" && hostDownloadState.format === "markdown"
                  ? "Preparing…"
                  : "Markdown"}
              </button>
            </div>
            {hostDownloadState.status === "success" ? (
              <p className="mt-2 text-xs" style={{ color: "var(--green-600)" }}>Download started.</p>
            ) : null}
            {hostDownloadState.status === "error" ? (
              <p className="mt-2 text-xs text-red-600">{hostDownloadState.message}</p>
            ) : null}
          </div>
        )}
      </header>

      {/* Share Your Experience - Prominent at the top */}
      {isSummaryRound && membershipId ? (
        <section
          className="rounded-xl p-6"
          style={{
            background: "linear-gradient(135deg, var(--gold-50), var(--earth-50))",
            border: "2px solid var(--gold-200)"
          }}
          aria-labelledby="share-experience-heading"
        >
          <div className="space-y-4">
            <div>
              <h2 id="share-experience-heading" className="font-display text-2xl font-semibold" style={{ color: "var(--earth-900)" }}>
                Share Your Experience
              </h2>
              <p className="mt-2 text-sm" style={{ color: "var(--earth-600)" }}>
                What did you enjoy most about this Gift Circle?
              </p>
              <p
                className="mt-2 flex items-center gap-2 text-xs font-medium"
                style={{ color: "var(--gold-700)" }}
              >
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs"
                  style={{ background: "var(--gold-100)" }}
                >
                  !
                </span>
                Your response will be shared with the group and your name will be attached.
              </p>
            </div>

            {hasSubmittedEnjoyment ? (
              <div
                className="rounded-xl p-4"
                style={{
                  background: "var(--green-50)",
                  border: "2px solid var(--green-200)"
                }}
              >
                <p className="text-sm font-medium" style={{ color: "var(--green-700)" }}>You shared:</p>
                <p className="mt-2 text-sm whitespace-pre-line" style={{ color: "var(--earth-700)" }}>
                  {currentMember?.enjoyment}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  className="input-field w-full"
                  rows={4}
                  placeholder="Share what you enjoyed about this experience..."
                  value={enjoymentDraft}
                  onChange={(e) => setEnjoymentDraft(e.target.value)}
                  disabled={enjoymentState.status === "saving"}
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="btn-gold"
                    onClick={handleSubmitEnjoyment}
                    disabled={
                      enjoymentState.status === "saving" || !enjoymentDraft.trim()
                    }
                  >
                    {enjoymentState.status === "saving" ? "Sharing..." : "Share with Group"}
                  </button>
                  {enjoymentState.status === "error" ? (
                    <span className="text-xs text-red-600">{enjoymentState.message}</span>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {isSummaryRound ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card p-4 text-center">
              <p className="font-display text-3xl font-bold" style={{ color: "var(--earth-900)" }}>
                {summaryStats.totalCommitments}
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--earth-600)" }}>Total Commitments</p>
            </div>

            <div className="card p-4 text-center">
              <p className="font-display text-3xl font-bold" style={{ color: "var(--earth-900)" }}>
                {summaryStats.avgCommitmentsPerPerson.toFixed(1)}
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--earth-600)" }}>Avg per Person</p>
            </div>

            <div
              className="rounded-xl p-4 text-center"
              style={{
                background: "var(--green-50)",
                border: "2px solid var(--green-200)"
              }}
            >
              {summaryStats.topGiver ? (
                <>
                  <p className="text-lg font-bold" style={{ color: "var(--green-700)" }}>
                    {getMemberDisplayName(summaryStats.topGiver.membershipId)}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--earth-600)" }}>
                    Top Giver ({summaryStats.topGiver.count} {summaryStats.topGiver.count === 1 ? "gift" : "gifts"})
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold" style={{ color: "var(--earth-400)" }}>—</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--earth-600)" }}>Top Giver</p>
                </>
              )}
            </div>

            <div
              className="rounded-xl p-4 text-center"
              style={{
                background: "var(--gold-50)",
                border: "2px solid var(--gold-200)"
              }}
            >
              {summaryStats.topReceiver ? (
                <>
                  <p className="text-lg font-bold" style={{ color: "var(--gold-700)" }}>
                    {getMemberDisplayName(summaryStats.topReceiver.membershipId)}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--earth-600)" }}>
                    Top Receiver ({summaryStats.topReceiver.count} {summaryStats.topReceiver.count === 1 ? "gift" : "gifts"})
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold" style={{ color: "var(--earth-400)" }}>—</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--earth-600)" }}>Top Receiver</p>
                </>
              )}
            </div>
          </div>
      ) : null}

      {isSummaryRound && allEnjoyments.length > 0 ? (
        <section
          className="section-card space-y-4"
          aria-labelledby="shared-experiences-heading"
        >
          <div>
            <h2 id="shared-experiences-heading" className="section-heading">
              What Everyone Shared
            </h2>
          </div>
          <ul className="space-y-4">
            {allEnjoyments.map((entry) => (
              <li
                key={entry.membershipId}
                className="rounded-xl p-4"
                style={{
                  background: entry.isCurrentUser ? "var(--green-50)" : "white",
                  border: entry.isCurrentUser ? "2px solid var(--green-200)" : "2px solid var(--earth-200)"
                }}
              >
                <p className="text-sm font-semibold" style={{ color: "var(--earth-900)" }}>
                  {entry.name}
                  {entry.isCurrentUser ? (
                    <span className="ml-2 text-xs font-normal" style={{ color: "var(--earth-500)" }}>(You)</span>
                  ) : null}
                </p>
                <p className="mt-2 text-sm whitespace-pre-line" style={{ color: "var(--earth-700)" }}>
                  {entry.enjoyment}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
