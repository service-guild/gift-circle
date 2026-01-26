"use client";

import React, { useCallback, useMemo, useState } from "react";

import {
  createClaimApi,
  withdrawClaimApi,
  type ClaimSummary,
  type DesireSummary,
  type OfferSummary,
} from "@/lib/rooms-client";
import { useRoom } from "@/app/rooms/[code]/room-context";

type ActionState =
  | { status: "idle" }
  | { status: "creating"; targetId: string }
  | { status: "withdrawing"; claimId: string };

type RequestTab = "offers" | "desires";
type ViewMode = "by-item" | "by-person";

export default function ConnectionsPage() {
  const { room, membershipId, refresh } = useRoom();
  const [actionState, setActionState] = useState<ActionState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RequestTab>("offers");
  const [viewMode, setViewMode] = useState<ViewMode>("by-item");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedPeople, setExpandedPeople] = useState<Set<string>>(new Set());

  const isConnectionsRound = room.currentRound === "CONNECTIONS";

  const getMemberDisplayName = useCallback(
    (membership: string) => {
      const entry = room.members.find((member) => member.membershipId === membership);
      if (!entry) {
        return "Unknown";
      }
      const nickname = entry.nickname?.trim();
      const name = entry.displayName?.trim();
      if (nickname) {
        return nickname;
      }
      if (name) {
        return name;
      }
      return entry.role === "HOST" ? "Host" : "Participant";
    },
    [room.members]
  );

  const myClaimerClaims = useMemo(() => {
    if (!membershipId) {
      return [] as ClaimSummary[];
    }
    return room.claims
      .filter((claim) => claim.claimerMembershipId === membershipId)
      .slice()
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
  }, [room.claims, membershipId]);

  type ClaimTarget =
    | { kind: "offer"; item: OfferSummary }
    | { kind: "desire"; item: DesireSummary };

  const handleCreateClaim = async (target: ClaimTarget) => {
    if (!membershipId || actionState.status !== "idle") {
      return;
    }

    setError(null);
    const payload =
      target.kind === "offer"
        ? { offerId: target.item.id }
        : { desireId: target.item.id };

    setActionState({ status: "creating", targetId: target.item.id });

    try {
      await createClaimApi(room.code, payload);
      await refresh();
    } catch (err) {
      console.error(err);
      const message = (err as Error)?.message ?? "Failed to send request.";
      setError(message);
    } finally {
      setActionState({ status: "idle" });
    }
  };

  const handleWithdrawClaim = async (claim: ClaimSummary) => {
    if (actionState.status !== "idle") {
      return;
    }

    setError(null);
    setActionState({ status: "withdrawing", claimId: claim.id });

    try {
      await withdrawClaimApi(room.code, claim.id);
      await refresh();
    } catch (err) {
      console.error(err);
      const message = (err as Error)?.message ?? "Unable to withdraw request.";
      setError(message);
    } finally {
      setActionState({ status: "idle" });
    }
  };

  const canStartClaim = (
    entity: OfferSummary | DesireSummary,
    kind: ClaimTarget["kind"]
  ) => {
    if (!membershipId) {
      return { allowed: false, reason: "Join the room to place bids." };
    }
    if (entity.authorMembershipId === membershipId) {
      return { allowed: false, reason: "You cannot request your own entry." };
    }
    if (entity.status !== "OPEN") {
      return { allowed: false, reason: "This entry is closed to new bids." };
    }
    const hasPendingRequest = myClaimerClaims.some(
      (c) =>
        c.status === "PENDING" &&
        ((kind === "offer" && c.offerId === entity.id) ||
          (kind === "desire" && c.desireId === entity.id))
    );
    if (hasPendingRequest) {
      return { allowed: false, reason: "You already have a pending bid here." };
    }
    return { allowed: true };
  };

  const matchesSearch = useCallback(
    (item: OfferSummary | DesireSummary) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const titleMatch = item.title.toLowerCase().includes(term);
      const detailsMatch = item.details?.toLowerCase().includes(term) ?? false;
      const authorName = getMemberDisplayName(item.authorMembershipId).toLowerCase();
      const authorMatch = authorName.includes(term);
      return titleMatch || detailsMatch || authorMatch;
    },
    [searchTerm, getMemberDisplayName]
  );

  const visibleOffers = useMemo(() => {
    return room.offers.filter((offer) => {
      if (offer.status !== "OPEN") {
        return false;
      }
      if (membershipId && offer.authorMembershipId === membershipId) {
        return false;
      }
      return matchesSearch(offer);
    });
  }, [membershipId, room.offers, matchesSearch]);

  const visibleDesires = useMemo(() => {
    return room.desires.filter((desire) => {
      if (desire.status !== "OPEN") {
        return false;
      }
      if (membershipId && desire.authorMembershipId === membershipId) {
        return false;
      }
      return matchesSearch(desire);
    });
  }, [membershipId, room.desires, matchesSearch]);

  const offersByPerson = useMemo(() => {
    const grouped = new Map<string, OfferSummary[]>();
    for (const offer of visibleOffers) {
      const existing = grouped.get(offer.authorMembershipId) ?? [];
      existing.push(offer);
      grouped.set(offer.authorMembershipId, existing);
    }
    return Array.from(grouped.entries())
      .map(([membershipId, offers]) => ({
        membershipId,
        name: getMemberDisplayName(membershipId),
        offers,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [visibleOffers, getMemberDisplayName]);

  const desiresByPerson = useMemo(() => {
    const grouped = new Map<string, DesireSummary[]>();
    for (const desire of visibleDesires) {
      const existing = grouped.get(desire.authorMembershipId) ?? [];
      existing.push(desire);
      grouped.set(desire.authorMembershipId, existing);
    }
    return Array.from(grouped.entries())
      .map(([membershipId, desires]) => ({
        membershipId,
        name: getMemberDisplayName(membershipId),
        desires,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [visibleDesires, getMemberDisplayName]);

  const togglePersonExpanded = (membershipId: string) => {
    setExpandedPeople((prev) => {
      const next = new Set(prev);
      if (next.has(membershipId)) {
        next.delete(membershipId);
      } else {
        next.add(membershipId);
      }
      return next;
    });
  };

  const renderOfferCard = (offer: OfferSummary, showAuthor: boolean = true) => {
    const claimGate = canStartClaim(offer, "offer");
    const isCreating =
      actionState.status === "creating" && actionState.targetId === offer.id;
    const myPendingClaim = myClaimerClaims.find(
      (c) => c.offerId === offer.id && c.status === "PENDING"
    );
    const isWithdrawing =
      actionState.status === "withdrawing" && myPendingClaim && actionState.claimId === myPendingClaim.id;

    return (
      <li
        key={offer.id}
        className="card p-4 sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-semibold" style={{ color: "var(--earth-900)" }}>{offer.title}</p>
            {offer.details ? (
              <p className="text-sm whitespace-pre-line" style={{ color: "var(--earth-600)" }}>{offer.details}</p>
            ) : null}
            {showAuthor && (
              <p className="text-xs" style={{ color: "var(--earth-500)" }}>
                From {getMemberDisplayName(offer.authorMembershipId)}
              </p>
            )}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            {myPendingClaim ? (
              <button
                type="button"
                className="btn-danger text-xs"
                onClick={() => handleWithdrawClaim(myPendingClaim)}
                disabled={isWithdrawing || actionState.status !== "idle"}
              >
                {isWithdrawing ? "Withdrawing…" : "Withdraw"}
              </button>
            ) : (
              <button
                type="button"
                className="btn-emerald text-xs"
                onClick={() => {
                  if (!claimGate.allowed) {
                    return;
                  }
                  handleCreateClaim({ kind: "offer", item: offer });
                }}
                disabled={
                  !claimGate.allowed || isCreating || actionState.status !== "idle"
                }
                title={claimGate.allowed ? undefined : claimGate.reason}
              >
                {isCreating ? "Submitting…" : "Request to Receive"}
              </button>
            )}
          </div>
        </div>
      </li>
    );
  };

  const renderDesireCard = (desire: DesireSummary, showAuthor: boolean = true) => {
    const claimGate = canStartClaim(desire, "desire");
    const isCreating =
      actionState.status === "creating" && actionState.targetId === desire.id;
    const myPendingClaim = myClaimerClaims.find(
      (c) => c.desireId === desire.id && c.status === "PENDING"
    );
    const isWithdrawing =
      actionState.status === "withdrawing" && myPendingClaim && actionState.claimId === myPendingClaim.id;

    return (
      <li
        key={desire.id}
        className="card p-4 sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-semibold" style={{ color: "var(--earth-900)" }}>{desire.title}</p>
            {desire.details ? (
              <p className="text-sm whitespace-pre-line" style={{ color: "var(--earth-600)" }}>{desire.details}</p>
            ) : null}
            {showAuthor && (
              <p className="text-xs" style={{ color: "var(--earth-500)" }}>
                For {getMemberDisplayName(desire.authorMembershipId)}
              </p>
            )}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            {myPendingClaim ? (
              <button
                type="button"
                className="btn-danger text-xs"
                onClick={() => handleWithdrawClaim(myPendingClaim)}
                disabled={isWithdrawing || actionState.status !== "idle"}
              >
                {isWithdrawing ? "Withdrawing…" : "Withdraw"}
              </button>
            ) : (
              <button
                type="button"
                className="btn-emerald text-xs"
                onClick={() => {
                  if (!claimGate.allowed) {
                    return;
                  }
                  handleCreateClaim({ kind: "desire", item: desire });
                }}
                disabled={
                  !claimGate.allowed || isCreating || actionState.status !== "idle"
                }
                title={claimGate.allowed ? undefined : claimGate.reason}
              >
                {isCreating ? "Submitting…" : "Request to Give"}
              </button>
            )}
          </div>
        </div>
      </li>
    );
  };

  const renderByItemView = () => (
    <>
      {activeTab === "offers" ? (
        <section className="section-card space-y-4" aria-labelledby="open-offers-heading">
          <h2 id="open-offers-heading" className="section-heading">
            Open Offers
          </h2>
          {visibleOffers.length === 0 ? (
            <div className="empty-state">
              {searchTerm ? "No offers match your search." : "The other participants did not share any offers."}
            </div>
          ) : (
            <ul className="space-y-4">{visibleOffers.map((o) => renderOfferCard(o))}</ul>
          )}
        </section>
      ) : null}

      {activeTab === "desires" ? (
        <section className="section-card space-y-4" aria-labelledby="open-desires-heading">
          <h2 id="open-desires-heading" className="section-heading">
            Open Desires
          </h2>
          {visibleDesires.length === 0 ? (
            <div className="empty-state">
              {searchTerm ? "No desires match your search." : "The other participants did not share any desires."}
            </div>
          ) : (
            <ul className="space-y-4">{visibleDesires.map((d) => renderDesireCard(d))}</ul>
          )}
        </section>
      ) : null}
    </>
  );

  const renderByPersonView = () => {
    const peopleData = activeTab === "offers" ? offersByPerson : desiresByPerson;
    const itemType = activeTab === "offers" ? "offers" : "desires";

    if (peopleData.length === 0) {
      return (
        <section className="section-card space-y-4">
          <h2 className="section-heading">
            {activeTab === "offers" ? "Open Offers" : "Open Desires"} by Person
          </h2>
          <div className="empty-state">
            {searchTerm
              ? `No ${itemType} match your search.`
              : `The other participants did not share any ${itemType}.`}
          </div>
        </section>
      );
    }

    return (
      <section className="section-card space-y-4">
        <h2 className="section-heading">
          {activeTab === "offers" ? "Open Offers" : "Open Desires"} by Person
        </h2>
        <div className="space-y-3">
          {peopleData.map((person) => {
            const isExpanded = expandedPeople.has(person.membershipId);
            const itemCount =
              activeTab === "offers"
                ? (person as { offers: OfferSummary[] }).offers.length
                : (person as { desires: DesireSummary[] }).desires.length;

            return (
              <div
                key={person.membershipId}
                className="rounded-xl overflow-hidden"
                style={{ border: "2px solid var(--earth-200)" }}
              >
                <button
                  type="button"
                  onClick={() => togglePersonExpanded(person.membershipId)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--earth-50)]"
                  style={{ background: isExpanded ? "var(--earth-50)" : "white" }}
                >
                  <span className="font-semibold" style={{ color: "var(--earth-900)" }}>
                    {person.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className="text-sm px-2 py-0.5 rounded-full"
                      style={{ background: "var(--earth-100)", color: "var(--earth-600)" }}
                    >
                      {itemCount} {itemCount === 1 ? (activeTab === "offers" ? "offer" : "desire") : (activeTab === "offers" ? "offers" : "desires")}
                    </span>
                    <span
                      className="text-lg transition-transform"
                      style={{
                        color: "var(--earth-400)",
                        transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      }}
                    >
                      ▼
                    </span>
                  </span>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2" style={{ background: "var(--earth-50)" }}>
                    <ul className="space-y-3">
                      {activeTab === "offers"
                        ? (person as { offers: OfferSummary[] }).offers.map((o) =>
                            renderOfferCard(o, false)
                          )
                        : (person as { desires: DesireSummary[] }).desires.map((d) =>
                            renderDesireCard(d, false)
                          )}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-6">
      <header className="section-card space-y-4" role="banner">
        <div className="space-y-3">
          <h1 className="font-display text-3xl font-semibold" style={{ color: "var(--earth-900)" }}>Bids</h1>
          <p className="text-sm" style={{ color: "var(--earth-600)" }}>
            Place bids to receive offers and fulfill desires.
          </p>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      {!isConnectionsRound ? (
        <section className="section-card space-y-2">
          <h2 className="section-heading">Waiting for Bids</h2>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            Bids are only available during the Bids round.
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {/* Search and View Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search by title, details, or person..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field w-full pl-10 pr-4"
              />
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-lg"
                style={{ color: "var(--earth-400)" }}
              >
                ⌕
              </span>
            </div>
            <div
              className="flex gap-1 rounded-lg p-1"
              style={{ background: "var(--earth-100)" }}
            >
              <button
                type="button"
                onClick={() => setViewMode("by-item")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  viewMode === "by-item"
                    ? "bg-white shadow-sm"
                    : "hover:bg-white/50"
                }`}
                style={{
                  color: viewMode === "by-item" ? "var(--earth-900)" : "var(--earth-600)"
                }}
              >
                By Item
              </button>
              <button
                type="button"
                onClick={() => setViewMode("by-person")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  viewMode === "by-person"
                    ? "bg-white shadow-sm"
                    : "hover:bg-white/50"
                }`}
                style={{
                  color: viewMode === "by-person" ? "var(--earth-900)" : "var(--earth-600)"
                }}
              >
                By Person
              </button>
            </div>
          </div>

          {/* Offers/Desires Tabs */}
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
              Open Offers ({visibleOffers.length})
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
              Open Desires ({visibleDesires.length})
            </button>
          </div>

          {viewMode === "by-item" ? renderByItemView() : renderByPersonView()}
        </div>
      )}
    </div>
  );
}
