"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { useRoom } from "@/app/rooms/[code]/room-context";
import { getAdvanceLabel, getRoundInfo, ROOM_ROUND_SEQUENCE } from "@/lib/room-round";
import { advanceRoomRound, toggleReadyApi } from "@/lib/rooms-client";

const OFFERS_INDEX = ROOM_ROUND_SEQUENCE.indexOf("OFFERS");
const DESIRES_INDEX = ROOM_ROUND_SEQUENCE.indexOf("DESIRES");
const CONNECTIONS_INDEX = ROOM_ROUND_SEQUENCE.indexOf("CONNECTIONS");
const DECISIONS_INDEX = ROOM_ROUND_SEQUENCE.indexOf("DECISIONS");
const SUMMARY_INDEX = ROOM_ROUND_SEQUENCE.indexOf("SUMMARY");

type NavLink = {
  href: string;
  label: string;
  minRoundIndex: number;
};

const NAV_LINKS: NavLink[] = [
  { href: "", label: "Overview", minRoundIndex: OFFERS_INDEX },
  { href: "offers", label: "My Offers", minRoundIndex: OFFERS_INDEX },
  { href: "desires", label: "My Desires", minRoundIndex: DESIRES_INDEX },
  { href: "connections", label: "Bids", minRoundIndex: CONNECTIONS_INDEX },
  { href: "decisions", label: "Decisions", minRoundIndex: DECISIONS_INDEX },
  { href: "summary", label: "Summary", minRoundIndex: SUMMARY_INDEX },
];

export function RoomShell({ children }: { children: ReactNode }) {
  const { room, membershipId, refresh } = useRoom();
  const pathname = usePathname();
  const router = useRouter();

  const [isCopying, setIsCopying] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(room.title ?? "");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isTogglingReady, setIsTogglingReady] = useState(false);
  const [showReadyDetails, setShowReadyDetails] = useState(false);

  const currentPath = pathname ?? "";
  const roundInfo = getRoundInfo(room.currentRound);
  const roundIndex = useMemo(
    () => ROOM_ROUND_SEQUENCE.indexOf(room.currentRound),
    [room.currentRound]
  );
  const showRoomMeta = room.currentRound === "WAITING";

  const isHost = useMemo(() => {
    if (!membershipId) return false;
    const membership = room.members.find((m) => m.membershipId === membershipId);
    return membership?.role === "HOST";
  }, [membershipId, room.members]);

  const availableLinks = useMemo(
    () => NAV_LINKS.filter((link) => roundIndex >= link.minRoundIndex),
    [roundIndex]
  );

  const currentMember = useMemo(() => {
    if (!membershipId) return null;
    return room.members.find((m) => m.membershipId === membershipId) ?? null;
  }, [membershipId, room.members]);

  const isReadyForCurrentRound = currentMember?.readyForRound === room.currentRound;

  const readyMembers = useMemo(() => {
    return room.members.filter((m) => m.readyForRound === room.currentRound);
  }, [room.members, room.currentRound]);

  const notReadyMembers = useMemo(() => {
    return room.members.filter((m) => m.readyForRound !== room.currentRound);
  }, [room.members, room.currentRound]);

  const readyCount = readyMembers.length;
  const totalMembers = room.members.length;
  const allReady = readyCount === totalMembers && totalMembers > 0;

  const membershipQuery = membershipId ? `?membershipId=${membershipId}` : "";

  const previousRoundRef = useRef(room.currentRound);

  useEffect(() => {
    const previousRound = previousRoundRef.current;
    if (previousRound !== room.currentRound) {
      let targetPath: string | null = null;
      if (room.currentRound === "OFFERS") {
        targetPath = `/rooms/${room.code}/offers`;
      } else if (room.currentRound === "DESIRES") {
        targetPath = `/rooms/${room.code}/desires`;
      } else if (room.currentRound === "CONNECTIONS") {
        targetPath = `/rooms/${room.code}/connections`;
      } else if (room.currentRound === "DECISIONS") {
        targetPath = `/rooms/${room.code}/decisions`;
      } else if (room.currentRound === "SUMMARY") {
        targetPath = `/rooms/${room.code}/summary`;
      }

      if (targetPath && currentPath !== targetPath) {
        router.push(`${targetPath}${membershipQuery}`);
      }

      previousRoundRef.current = room.currentRound;
    }
  }, [room.currentRound, room.code, currentPath, membershipQuery, router]);

  const handleCopyRoomCode = async () => {
    try {
      setIsCopying(true);
      await navigator.clipboard.writeText(room.code);
      setTimeout(() => setIsCopying(false), 1000);
    } catch (error) {
      console.error("Failed to copy room code", error);
      setIsCopying(false);
    }
  };

  const handleSaveTitle = async () => {
    if (isSavingTitle) return;

    const trimmedTitle = titleDraft.trim() || null;

    // Don't save if unchanged
    if (trimmedTitle === room.title) {
      setIsEditingTitle(false);
      return;
    }

    setIsSavingTitle(true);
    try {
      const response = await fetch(`/api/rooms/${room.code}/title`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle }),
      });

      if (!response.ok) {
        throw new Error("Failed to save title");
      }

      await refresh();
      setIsEditingTitle(false);
    } catch (error) {
      console.error("Failed to save room title", error);
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleCancelEditTitle = () => {
    setTitleDraft(room.title ?? "");
    setIsEditingTitle(false);
  };

  const handleAdvanceRound = async () => {
    if (isAdvancing || !room.nextRound) {
      return;
    }

    try {
      setIsAdvancing(true);
      await advanceRoomRound(room.code);
      await refresh();
    } catch (error) {
      console.error("Failed to advance round", error);
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleToggleReady = async () => {
    if (isTogglingReady || !membershipId) {
      return;
    }

    try {
      setIsTogglingReady(true);
      await toggleReadyApi(room.code, !isReadyForCurrentRound);
      await refresh();
    } catch (error) {
      console.error("Failed to toggle ready status", error);
    } finally {
      setIsTogglingReady(false);
    }
  };

  const getMemberDisplayName = (memberId: string) => {
    const member = room.members.find((m) => m.membershipId === memberId);
    if (!member) return "Unknown";
    return member.nickname?.trim() || member.displayName?.trim() || (member.role === "HOST" ? "Host" : "Participant");
  };

  // Show ready indicator for rounds where it makes sense (not WAITING or SUMMARY)
  const showReadyIndicator = room.currentRound !== "WAITING" && room.currentRound !== "SUMMARY";

  return (
    <div className="min-h-screen">
      <div className="layout-container flex min-h-screen flex-col gap-6">
        {/* Room Header */}
        <header className="room-header relative space-y-6" role="banner">
          <div className="relative z-10 flex flex-col gap-4 text-center">
            {/* Title Section */}
            <div className="space-y-3">
              {showRoomMeta && isHost && isEditingTitle ? (
                <div className="flex flex-col items-center gap-3">
                  <input
                    type="text"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    placeholder="Room Name"
                    className="input-field max-w-md text-center text-2xl font-semibold"
                    maxLength={100}
                    disabled={isSavingTitle}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-gold"
                      onClick={handleSaveTitle}
                      disabled={isSavingTitle}
                    >
                      {isSavingTitle ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={handleCancelEditTitle}
                      disabled={isSavingTitle}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <h1 className="font-display text-3xl font-bold sm:text-4xl" style={{ color: "var(--earth-900)" }}>
                    {room.title || "Gift Circle"}
                  </h1>
                  {showRoomMeta && isHost && (
                    <button
                      type="button"
                      className="text-sm font-medium underline transition-colors hover:text-[var(--gold-600)]"
                      style={{ color: "var(--earth-600)" }}
                      onClick={() => {
                        setTitleDraft(room.title ?? "");
                        setIsEditingTitle(true);
                      }}
                    >
                      Customize room name
                    </button>
                  )}
                </div>
              )}

              {/* Room Code Section */}
              {showRoomMeta && (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-base font-semibold" style={{ color: "var(--earth-700)" }}>
                    Room code: <span className="font-mono tracking-wider">{room.code}</span>
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleCopyRoomCode}
                    disabled={isCopying}
                  >
                    {isCopying ? "Copied!" : "Copy room code"}
                  </button>
                </div>
              )}
            </div>

            {/* Round Info */}
            <div className="space-y-1 text-sm" style={{ color: "var(--earth-600)" }}>
              <p>
                Current round:{" "}
                <span className="font-semibold" style={{ color: "var(--earth-900)" }}>{roundInfo.title}</span>
              </p>
              {roundInfo.guidance && (
                <p className="mx-auto max-w-xl">{roundInfo.guidance}</p>
              )}
            </div>

            {/* Advance Button */}
            {room.canAdvance && isHost && (
              <div className="pt-2">
                <button
                  type="button"
                  className="btn-gold"
                  onClick={handleAdvanceRound}
                  disabled={isAdvancing || !room.nextRound}
                  aria-live="polite"
                >
                  {isAdvancing ? "Advancing…" : getAdvanceLabel(room.nextRound)}
                </button>
              </div>
            )}

            {/* Ready Indicator */}
            {showReadyIndicator && membershipId && (
              <div className="space-y-3 pt-2">
                {/* Ready toggle button for current user */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleReady}
                    disabled={isTogglingReady}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                      isReadyForCurrentRound
                        ? "bg-[var(--green-100)] text-[var(--green-700)] hover:bg-[var(--green-200)]"
                        : "bg-[var(--earth-100)] text-[var(--earth-600)] hover:bg-[var(--earth-200)]"
                    }`}
                  >
                    {isTogglingReady
                      ? "Updating..."
                      : isReadyForCurrentRound
                        ? `✓  Done with ${roundInfo.title}`
                        : `I'm done with ${roundInfo.title}`}
                  </button>
                </div>

                {/* Ready status summary - HOST ONLY */}
                {isHost && (
                  <div className="flex flex-col items-center gap-2">
                    {/* All ready celebration indicator */}
                    {allReady && (
                      <div
                        className="mb-1 animate-pulse select-none rounded-full px-4 py-2 text-sm font-bold"
                        style={{
                          background: "linear-gradient(135deg, var(--green-100), var(--gold-100))",
                          color: "var(--green-700)",
                          border: "2px solid var(--green-300)",
                          boxShadow: "0 0 12px var(--green-200)",
                        }}
                      >
                        ✨ Everyone is ready! ✨
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowReadyDetails(!showReadyDetails)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        allReady
                          ? "bg-[var(--green-100)] text-[var(--green-700)]"
                          : "bg-[var(--earth-100)] text-[var(--earth-600)]"
                      }`}
                    >
                      {readyCount}/{totalMembers} ready {showReadyDetails ? "▲" : "▼"}
                    </button>

                    {/* Expandable details */}
                    {showReadyDetails && (
                      <div
                        className="w-full max-w-xs rounded-xl p-3 text-left text-xs"
                        style={{ background: "var(--earth-50)", border: "1px solid var(--earth-200)" }}
                      >
                        {readyMembers.length > 0 && (
                          <div className="mb-2">
                            <p className="font-semibold" style={{ color: "var(--green-700)" }}>
                              Ready ({readyMembers.length}):
                            </p>
                            <ul className="mt-1 space-y-0.5" style={{ color: "var(--earth-700)" }}>
                              {readyMembers.map((m) => (
                                <li key={m.membershipId}>
                                  {getMemberDisplayName(m.membershipId)}
                                  {m.membershipId === membershipId && " (you)"}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {notReadyMembers.length > 0 && (
                          <div>
                            <p className="font-semibold" style={{ color: "var(--earth-500)" }}>
                              Still working ({notReadyMembers.length}):
                            </p>
                            <ul className="mt-1 space-y-0.5" style={{ color: "var(--earth-500)" }}>
                              {notReadyMembers.map((m) => (
                                <li key={m.membershipId}>
                                  {getMemberDisplayName(m.membershipId)}
                                  {m.membershipId === membershipId && " (you)"}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation */}
          {availableLinks.length > 0 && (
            <nav aria-label="Room navigation" className="relative z-10">
              <div className="nav-container">
                <div className="nav-pills justify-center">
                  {availableLinks.map((entry) => {
                    const targetPath =
                      entry.href.length > 0
                        ? `/rooms/${room.code}/${entry.href}`
                        : `/rooms/${room.code}`;
                    const href = `${targetPath}${membershipQuery}`;
                    const isActive = currentPath === targetPath;

                    return (
                      <Link
                        key={entry.href || "overview"}
                        href={href}
                        className={isActive ? "nav-pill-active" : "nav-pill-inactive"}
                        aria-current={isActive ? "page" : undefined}
                      >
                        {entry.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </nav>
          )}
        </header>

        {/* Main Content */}
        <main className="flex-1 pb-8">
          <div className="space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
