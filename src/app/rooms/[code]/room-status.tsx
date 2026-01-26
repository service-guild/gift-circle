"use client";

import React, { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { RoomMember, OfferSummary, DesireSummary } from "@/lib/rooms-client";
import { buildCommitmentPreview } from "@/lib/room-commitments";
import { getRoundInfo, ROOM_ROUND_SEQUENCE } from "@/lib/room-round";
import { useRoom } from "@/app/rooms/[code]/room-context";

type MemberCommitmentSummary = ReturnType<typeof buildCommitmentPreview> extends Map<
  string,
  infer Entry
>
  ? Entry
  : never;

function MemberList({
  members,
  currentMembershipId,
  commitments,
  showCommitments,
  resolveDisplayName,
  filterByMembershipId,
  onFilterByMember,
}: {
  members: RoomMember[];
  currentMembershipId?: string | null;
  commitments?: Map<string, MemberCommitmentSummary>;
  showCommitments?: boolean;
  resolveDisplayName: (membershipId: string) => string;
  filterByMembershipId?: string | null;
  onFilterByMember?: (membershipId: string | null) => void;
}) {
  return (
    <ul className="mt-4 space-y-2 select-none">
      {members.map((member) => {
        const isHost = member.role === "HOST";
        const isViewer = member.membershipId === currentMembershipId;
        const nickname = member.nickname?.trim();
        const fallBackName = member.displayName?.trim();
        const primaryName = nickname || fallBackName || (isHost ? "Host" : "Anonymous");
        const isClickable = !!onFilterByMember;
        const isFiltered = filterByMembershipId === member.membershipId;

        const summary = commitments?.get(member.membershipId);
        const giving = summary?.giving ?? [];
        const receiving = summary?.receiving ?? [];
        const hasCommitmentDetails = showCommitments && summary && (giving.length > 0 || receiving.length > 0);
        const MAX_ENTRIES = 3;

        return (
          <li
            key={member.membershipId}
            className={`member-card ${!member.isActive ? "opacity-60" : ""}`}
            data-filtered={isFiltered}
            onClick={isClickable ? () => onFilterByMember(isFiltered ? null : member.membershipId) : undefined}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={isClickable ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onFilterByMember(isFiltered ? null : member.membershipId);
              }
            } : undefined}
            style={{ cursor: isClickable ? "pointer" : "default" }}
          >
            <div className="flex w-full items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`truncate text-sm font-semibold ${isFiltered ? "text-[var(--gold-700)]" : "text-[var(--earth-900)]"}`}>
                    {primaryName}
                  </p>
                  {isHost && (
                    <span className="badge-gold">
                      Host
                    </span>
                  )}
                  {isViewer && (
                    <span className="badge-neutral">
                      You
                    </span>
                  )}
                  {showCommitments && summary && (
                    <span className="flex flex-wrap gap-2">
                      {giving.length > 0 && (
                        <span className="badge-green">
                          Giving: {giving.length}
                        </span>
                      )}
                      {receiving.length > 0 && (
                        <span className="badge-gold">
                          Receiving: {receiving.length}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {hasCommitmentDetails && (
              <div className="mt-3 w-full space-y-2 rounded-lg p-3 text-xs" style={{ background: "var(--earth-50)" }}>
                {giving.length > 0 && (
                  <div>
                    <p className="font-semibold" style={{ color: "var(--green-700)" }}>Giving</p>
                    <ul className="mt-1 space-y-1">
                      {giving.slice(0, MAX_ENTRIES).map((entry, index) => (
                        <li
                          key={`${entry.claimId}-giving-${index}`}
                          className="flex flex-wrap gap-1 text-sm"
                        >
                          <span className="font-semibold" style={{ color: "var(--earth-900)" }}>{entry.itemTitle}</span>
                          <span style={{ color: "var(--earth-600)" }}>
                            to {resolveDisplayName(entry.counterpartMembershipId)}
                          </span>
                        </li>
                      ))}
                      {giving.length > MAX_ENTRIES && (
                        <li style={{ color: "var(--earth-500)" }}>
                          +{giving.length - MAX_ENTRIES} more commitment
                          {giving.length - MAX_ENTRIES === 1 ? "" : "s"}
                        </li>
                      )}
                    </ul>
                  </div>
                )}
                {receiving.length > 0 && (
                  <div>
                    <p className="font-semibold" style={{ color: "var(--gold-700)" }}>Receiving</p>
                    <ul className="mt-1 space-y-1">
                      {receiving.slice(0, MAX_ENTRIES).map((entry, index) => (
                        <li
                          key={`${entry.claimId}-receiving-${index}`}
                          className="flex flex-wrap gap-1 text-sm"
                        >
                          <span className="font-semibold" style={{ color: "var(--earth-900)" }}>{entry.itemTitle}</span>
                          <span style={{ color: "var(--earth-600)" }}>
                            from {resolveDisplayName(entry.counterpartMembershipId)}
                          </span>
                        </li>
                      ))}
                      {receiving.length > MAX_ENTRIES && (
                        <li style={{ color: "var(--earth-500)" }}>
                          +{receiving.length - MAX_ENTRIES} more commitment
                          {receiving.length - MAX_ENTRIES === 1 ? "" : "s"}
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type ItemListProps = {
  title: string;
  items: (OfferSummary | DesireSummary)[];
  emptyLabel: string;
  controls?: ReactNode;
  getAuthorName?: (membershipId: string) => string | null;
  authorLabel?: string;
};

function ItemList({
  title,
  items,
  emptyLabel,
  controls,
  getAuthorName,
  authorLabel,
}: ItemListProps) {
  const headingId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-heading`;
  return (
    <section className="section-card space-y-4" aria-labelledby={headingId}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id={headingId} className="section-heading">
          {title}
        </h2>
        {controls && (
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--earth-600)" }}>{controls}</div>
        )}
      </div>
      {items.length === 0 ? (
        <div className="empty-state">{emptyLabel}</div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const authorName = getAuthorName
              ? getAuthorName(item.authorMembershipId)
              : null;
            return (
              <li
                key={item.id}
                className="card p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold" style={{ color: "var(--earth-900)" }}>
                      {item.title}
                    </p>
                    {item.details && (
                      <p className="text-sm whitespace-pre-line" style={{ color: "var(--earth-600)" }}>
                        {item.details}
                      </p>
                    )}
                    {authorName && (
                      <p className="text-xs" style={{ color: "var(--earth-500)" }}>
                        {authorLabel ? `${authorLabel}: ${authorName}` : authorName}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type SortOption = "chronological" | "author";

type ItemTab = "offers" | "desires";

export default function RoomStatus() {
  const { room, membershipId, isHost, refresh } = useRoom();
  const [offerSort, setOfferSort] = useState<SortOption>("author");
  const [desireSort, setDesireSort] = useState<SortOption>("author");
  const [activeTab, setActiveTab] = useState<ItemTab>("offers");
  const [filterByMembershipId, setFilterByMembershipId] = useState<string | null>(null);

  const hostMembershipId = useMemo(() => {
    return room.members.find((member) => member.role === "HOST")?.membershipId ?? null;
  }, [room.members]);

  const roundIndex = useMemo(
    () => ROOM_ROUND_SEQUENCE.indexOf(room.currentRound),
    [room.currentRound]
  );

  const offersEnabled = roundIndex >= ROOM_ROUND_SEQUENCE.indexOf("OFFERS");
  const desiresEnabled = roundIndex >= ROOM_ROUND_SEQUENCE.indexOf("DESIRES");

  const visibleMembers = useMemo(() => {
    return room.members.slice().sort((a, b) => {
      if (a.role === "HOST") {
        return -1;
      }
      if (b.role === "HOST") {
        return 1;
      }

      return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    });
  }, [room.members]);

  const getMemberDisplayName = useCallback(
    (authorMembershipId: string) => {
      const member = room.members.find(
        (entry) => entry.membershipId === authorMembershipId
      );
      if (!member) {
        return "Unknown";
      }
      const nickname = member.nickname?.trim();
      const displayName = member.displayName?.trim();
      return nickname || displayName || (member.role === "HOST" ? "Host" : "Anonymous");
    },
    [room.members]
  );

  const sortedOffers = useMemo(() => {
    let items = room.offers;
    if (filterByMembershipId) {
      items = items.filter((o) => o.authorMembershipId === filterByMembershipId);
    }
    if (offerSort === "author") {
      return [...items].sort((a, b) =>
        getMemberDisplayName(a.authorMembershipId).localeCompare(
          getMemberDisplayName(b.authorMembershipId),
          undefined,
          { sensitivity: "base" }
        )
      );
    }
    return items;
  }, [room.offers, offerSort, getMemberDisplayName, filterByMembershipId]);

  const sortedDesires = useMemo(() => {
    let items = room.desires;
    if (filterByMembershipId) {
      items = items.filter((d) => d.authorMembershipId === filterByMembershipId);
    }
    if (desireSort === "author") {
      return [...items].sort((a, b) =>
        getMemberDisplayName(a.authorMembershipId).localeCompare(
          getMemberDisplayName(b.authorMembershipId),
          undefined,
          { sensitivity: "base" }
        )
      );
    }
    return items;
  }, [room.desires, desireSort, getMemberDisplayName, filterByMembershipId]);

  const commitmentPreview = useMemo(() => buildCommitmentPreview(room), [room]);
  // Show commitments for host once we're in DECISIONS round or later
  const showCommitments = isHost && roundIndex >= ROOM_ROUND_SEQUENCE.indexOf("DECISIONS");
  const showSecondaryColumn = offersEnabled || desiresEnabled;

  const offerSortControls = (
    <label className="flex items-center gap-2 text-xs" style={{ color: "var(--earth-600)" }}>
      <span>Sort by</span>
      <select
        className="rounded-lg border-2 px-3 py-1.5 text-xs font-medium"
        style={{
          background: "white",
          borderColor: "var(--earth-200)",
          color: "var(--earth-700)"
        }}
        value={offerSort}
        onChange={(event) => setOfferSort(event.target.value as SortOption)}
      >
        <option value="chronological">Chronological</option>
        <option value="author">Participant</option>
      </select>
    </label>
  );

  const desireSortControls = (
    <label className="flex items-center gap-2 text-xs" style={{ color: "var(--earth-600)" }}>
      <span>Sort by</span>
      <select
        className="rounded-lg border-2 px-3 py-1.5 text-xs font-medium"
        style={{
          background: "white",
          borderColor: "var(--earth-200)",
          color: "var(--earth-700)"
        }}
        value={desireSort}
        onChange={(event) => setDesireSort(event.target.value as SortOption)}
      >
        <option value="chronological">Chronological</option>
        <option value="author">Participant</option>
      </select>
    </label>
  );

  const participantSection = (
    <section
      className="section-card space-y-4"
      aria-labelledby="participants-heading"
    >
      <h2 id="participants-heading" className="section-heading">
        Participants
      </h2>
      <MemberList
        members={visibleMembers}
        currentMembershipId={membershipId}
        commitments={commitmentPreview}
        showCommitments={showCommitments}
        resolveDisplayName={getMemberDisplayName}
        filterByMembershipId={filterByMembershipId}
        onFilterByMember={setFilterByMembershipId}
      />
    </section>
  );

  return (
    <section className="space-y-6">
      {showSecondaryColumn ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.75fr)] lg:items-start">
          {participantSection}
          <div className="space-y-4">
            {filterByMembershipId && (
              <div
                className="flex min-w-0 max-w-full items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                style={{
                  background: "var(--gold-100)",
                  border: "1.5px solid var(--gold-400)",
                  color: "var(--gold-700)"
                }}
              >
                <span className="min-w-0 truncate">
                  Filtering by: <strong className="truncate">{getMemberDisplayName(filterByMembershipId)}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setFilterByMembershipId(null)}
                  className="shrink-0 rounded-full p-1 transition-colors hover:bg-[var(--gold-200)]"
                  aria-label="Clear filter"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            {offersEnabled && desiresEnabled && (
              <div
                className="flex gap-1 rounded-lg p-1"
                style={{ background: "var(--earth-100)" }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab("offers")}
                  className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition-all ${
                    activeTab === "offers"
                      ? "bg-white shadow-sm"
                      : "hover:bg-white/50"
                  }`}
                  style={{
                    color: activeTab === "offers" ? "var(--green-700)" : "var(--earth-600)"
                  }}
                >
                  Offers ({sortedOffers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("desires")}
                  className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition-all ${
                    activeTab === "desires"
                      ? "bg-white shadow-sm"
                      : "hover:bg-white/50"
                  }`}
                  style={{
                    color: activeTab === "desires" ? "var(--gold-700)" : "var(--earth-600)"
                  }}
                >
                  Desires ({sortedDesires.length})
                </button>
              </div>
            )}
            {offersEnabled && (activeTab === "offers" || !desiresEnabled) && (
              <ItemList
                title="Offers"
                items={sortedOffers}
                emptyLabel={filterByMembershipId ? "No offers from this participant." : "None."}
                controls={offerSortControls}
                getAuthorName={getMemberDisplayName}
                authorLabel="From"
              />
            )}
            {desiresEnabled && (activeTab === "desires" || !offersEnabled) && (
              <ItemList
                title="Desires"
                items={sortedDesires}
                emptyLabel={filterByMembershipId ? "No desires from this participant." : "None."}
                controls={desireSortControls}
                getAuthorName={getMemberDisplayName}
                authorLabel="For"
              />
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {participantSection}
        </div>
      )}
    </section>
  );
}
