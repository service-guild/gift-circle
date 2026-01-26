"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createRoom, joinRoom } from "@/lib/rooms-client";
import { useIdentity } from "@/lib/identity-client";

type ViewState =
  | { mode: "idle" }
  | { mode: "creating" }
  | { mode: "joining"; code: string };

type RoomAction = "host" | "join";

// Distinctive icon components
function HostIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
    </svg>
  );
}

function JoinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  );
}

function GiftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

export default function HomePage() {
  const { identity, setDisplayName, refresh } = useIdentity();
  const [viewState, setViewState] = useState<ViewState>({ mode: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [isNavigating, startTransition] = useTransition();
  const [selectedAction, setSelectedAction] = useState<RoomAction | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function handleSelectAction(action: RoomAction) {
    setSelectedAction(action);
    setError(null);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const displayName = (formData.get("hostDisplayName") as string | null)?.trim();

    if (!displayName) {
      setError("Please enter your name.");
      return;
    }

    setViewState({ mode: "creating" });
    try {
      const response = await createRoom({ hostDisplayName: displayName });
      await refresh();
      setViewState({ mode: "idle" });
      form.reset();
      startTransition(() => {
        router.push(
          `/rooms/${response.room.code}?membershipId=${response.membership.id}`
        );
      });
    } catch (err) {
      console.error(err);
      const message =
        (err as Error & { message?: string }).message ??
        "Something went wrong creating the room.";
      setError(message);
      setViewState({ mode: "idle" });
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const displayName = (formData.get("displayName") as string | null)?.trim();
    const code = (formData.get("roomCode") as string | null)?.trim();

    if (!displayName || !code) {
      setError("Enter your name and a room code.");
      return;
    }

    setViewState({ mode: "joining", code });

    try {
      const currentIdentity = identity ?? (await refresh());
      const shouldReset = currentIdentity
        ? currentIdentity.displayName !== null &&
          currentIdentity.displayName !== displayName
        : true;

      await setDisplayName(displayName, { reset: shouldReset });
      const response = await joinRoom({ code, displayName });
      setViewState({ mode: "idle" });
      form.reset();
      startTransition(() => {
        router.push(
          `/rooms/${response.room.code}?membershipId=${response.membership.id}`
        );
      });
    } catch (err) {
      console.error(err);
      const message =
        (err as Error).message ??
        "Unable to join that room. Double check the code and try again.";
      setError(message);
      setViewState({ mode: "idle" });
    }
  }

  const isBusy =
    viewState.mode === "creating" || viewState.mode === "joining" || isNavigating;

  return (
    <main className="layout-container flex min-h-screen flex-col gap-12 lg:gap-16">
      {/* Hero Section - Dramatic, memorable */}
      <header className="hero-section relative px-6 py-10 text-center sm:px-10 sm:py-12 lg:px-16 lg:py-14">
        {/* Decorative floating elements */}
        <div className="decorative-circle -left-20 -top-20 h-40 w-40 animate-float" />
        <div className="decorative-circle -bottom-10 -right-10 h-32 w-32 animate-float" style={{ animationDelay: "2s" }} />

        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center gap-8">
          {/* Animated icon */}
          <div
            className="flex h-20 w-20 items-center justify-center rounded-3xl opacity-0 animate-scale-in sm:h-24 sm:w-24"
            style={{
              background: "linear-gradient(135deg, #FEF3C7, #FDE68A)",
              boxShadow: "0 20px 40px -15px rgba(212, 175, 55, 0.4)"
            }}
          >
            <GiftIcon className="h-10 w-10 text-brand-gold-700 sm:h-12 sm:w-12" />
          </div>

          {/* Title with staggered animation */}
          <div className="space-y-4">
            <h1 className="font-display text-5xl font-bold tracking-tight text-brand-earth-900 opacity-0 animate-fade-up animate-stagger-1 sm:text-6xl lg:text-7xl">
              Gift Circle
            </h1>
            <p className="mx-auto max-w-lg text-lg leading-relaxed text-brand-earth-600 opacity-0 animate-fade-up animate-stagger-2 sm:text-xl">
              Share your offers and desires, enjoy the generosity of giving and receiving.
            </p>
          </div>
        </div>
      </header>

      {/* Action Selection - Bold, interactive cards */}
      <section className="space-y-8">
        <div className="text-center opacity-0 animate-fade-up animate-stagger-3">
          <p className="font-display text-xl font-semibold text-brand-earth-700 sm:text-2xl">
            Would U like to host or join a room?
          </p>
        </div>

        <div className="mx-auto grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => handleSelectAction("host")}
            className="action-card opacity-0 animate-fade-up animate-stagger-4"
            data-selected={selectedAction === "host"}
          >
            <div className="action-card-icon">
              <HostIcon className="h-8 w-8 text-brand-gold-700" />
            </div>
            <div className="space-y-1 text-center">
              <span className="font-display text-xl font-bold text-brand-earth-900">Host a room</span>
              <span className="block text-sm text-brand-earth-500">Create a new Gift Circle</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSelectAction("join")}
            className="action-card opacity-0 animate-fade-up animate-stagger-5"
            data-selected={selectedAction === "join"}
          >
            <div className="action-card-icon">
              <JoinIcon className="h-8 w-8 text-brand-gold-700" />
            </div>
            <div className="space-y-1 text-center">
              <span className="font-display text-xl font-bold text-brand-earth-900">Join a room</span>
              <span className="block text-sm text-brand-earth-500">Enter with a room code</span>
            </div>
          </button>
        </div>

        {/* Forms with smooth reveal */}
        {selectedAction === "host" && (
          <form
            ref={formRef}
            onSubmit={handleCreate}
            className="card-elevated mx-auto flex max-w-md flex-col gap-6 p-8 opacity-0 animate-scale-in sm:p-10"
          >
            <div className="space-y-2 text-center">
              <h2 className="font-display text-2xl font-bold text-brand-earth-900">Host a room</h2>
              <p className="text-brand-earth-500">You&apos;ll get a room code to share with others.</p>
            </div>
            <label className="flex flex-col gap-2">
              <span className="form-label">Your name</span>
              <input
                name="hostDisplayName"
                type="text"
                autoComplete="name"
                className="input-field"
                placeholder="Enter your name"
              />
            </label>
            <button
              type="submit"
              disabled={viewState.mode === "creating" || isBusy}
              className="btn-primary group"
            >
              {viewState.mode === "creating" || isBusy ? (
                "Creating..."
              ) : (
                <>
                  Create room
                  <ArrowRightIcon className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
        )}

        {selectedAction === "join" && (
          <form
            ref={formRef}
            onSubmit={handleJoin}
            className="card-elevated mx-auto flex max-w-md flex-col gap-6 p-8 opacity-0 animate-scale-in sm:p-10"
          >
            <div className="space-y-2 text-center">
              <h2 className="font-display text-2xl font-bold text-brand-earth-900">Join a room</h2>
              <p className="text-brand-earth-500">Enter the code shared by your host.</p>
            </div>
            <label className="flex flex-col gap-2">
              <span className="form-label">Your name</span>
              <input
                name="displayName"
                type="text"
                autoComplete="name"
                className="input-field"
                placeholder="Enter your name"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="form-label">Room code</span>
              <input
                name="roomCode"
                type="text"
                className="input-field font-mono text-center text-lg lowercase"
                placeholder="gift-courage"
              />
            </label>
            <button
              type="submit"
              disabled={viewState.mode === "joining" || isBusy}
              className="btn-primary group"
            >
              {viewState.mode === "joining" || isBusy ? (
                "Joining..."
              ) : (
                <>
                  Join room
                  <ArrowRightIcon className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Error Display */}
        {error && (
          <div className="mx-auto max-w-md animate-scale-in">
            <p className="rounded-2xl border-2 border-red-200 bg-red-50 px-5 py-4 text-center font-medium text-red-700">
              {error}
            </p>
          </div>
        )}
      </section>

      {/* Information Section - Elegant, organized */}
      <section className="section-card space-y-10">
        {/* What is a Gift Circle */}
        <div className="info-block">
          <div className="info-block-header">
            <div className="info-block-icon">
              <HeartIcon className="h-6 w-6 text-brand-gold-700" />
            </div>
            <h2 className="info-block-title">What is a Gift Circle?</h2>
          </div>
          <p className="text-lg leading-relaxed text-brand-earth-600">
            A Gift Circle is a gathering where people share gifts with each other in a spirit of generosity. It&apos;s a way to build community, support one another, and create a culture of abundance.
          </p>
        </div>

        {/* How to Participate */}
        <div className="info-block">
          <div className="info-block-header">
            <div className="info-block-icon">
              <SparklesIcon className="h-6 w-6 text-brand-gold-700" />
            </div>
            <h2 className="info-block-title">How to Participate</h2>
          </div>
          <p className="text-lg leading-relaxed text-brand-earth-600">
            Please bring a list of <span className="pill-green">OFFERS</span> and a list of <span className="pill-gold">DESIRES</span> U would be delighted to give and receive.
          </p>
          <p className="text-brand-earth-500 leading-relaxed">
            For example: a massage, an hour to be listened to, a friend to go on a road trip, money for a project... U are limited only by your imagination!
          </p>
          <p className="text-sm text-brand-earth-400 italic">
            This app works best on a laptop or desktop, but also works on tablets and phones.
          </p>
        </div>

        {/* The Format */}
        <div className="info-block">
          <div className="info-block-header">
            <div className="info-block-icon">
              <ListIcon className="h-6 w-6 text-brand-gold-700" />
            </div>
            <h2 className="info-block-title">The Format</h2>
          </div>
          <ol className="format-list">
            <li className="format-list-item">
              <span className="format-list-number">1</span>
              <span className="text-brand-earth-700">
                <a
                  href="https://tasshin.com/blog/the-value-of-emotional-check-ins/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold hover:underline"
                >
                  Check-Ins
                </a>
              </span>
            </li>
            <li className="format-list-item">
              <span className="format-list-number">2</span>
              <span className="font-semibold text-brand-earth-800">Welcoming and Guidelines</span>
            </li>
            <li className="format-list-item">
              <span className="format-list-number">3</span>
              <span className="text-brand-earth-700">
                <span className="font-semibold text-brand-earth-800">Desires Round</span>
                <span className="mx-2 text-brand-earth-400">&mdash;</span>
                <em className="text-brand-earth-500">&quot;This is what I&apos;d like to receive...&quot;</em>
              </span>
            </li>
            <li className="format-list-item">
              <span className="format-list-number">4</span>
              <span className="text-brand-earth-700">
                <span className="font-semibold text-brand-earth-800">Offers Round</span>
                <span className="mx-2 text-brand-earth-400">&mdash;</span>
                <em className="text-brand-earth-500">&quot;This is what I&apos;d like to give...&quot;</em>
              </span>
            </li>
            <li className="format-list-item">
              <span className="format-list-number">5</span>
              <span className="text-brand-earth-700">
                <span className="font-semibold text-brand-earth-800">Lightning Connections Round 1</span>
                <span className="mx-2 text-brand-earth-400">&mdash;</span>
                <em className="text-brand-earth-500">&quot;Mary, I want to take you up on a Listening Session...&quot;</em>
              </span>
            </li>
            <li className="format-list-item">
              <span className="format-list-number">6</span>
              <span className="text-brand-earth-700">
                <span className="font-semibold text-brand-earth-800">Lightning Connection Round 2</span>
                <span className="mx-2 text-brand-earth-400">&mdash;</span>
                <em className="text-brand-earth-500">&quot;Yes, I&apos;ll be happy to give you a back massage...&quot;</em>
              </span>
            </li>
            <li className="format-list-item">
              <span className="format-list-number">7</span>
              <span className="font-semibold text-brand-earth-800">Check-outs</span>
            </li>
          </ol>
        </div>

        {/* About This App */}
        <div className="space-y-5 border-t-2 border-brand-earth-100 pt-10">
          <p className="text-lg leading-relaxed text-brand-earth-600">
            This web app is designed to make it smoother for hosts and participants of Gift Circles to track which gifts are given by whom, to whom. We hope it makes it easier and more enjoyable for U to participate in Gift Circles&mdash;and that it inspires more people to do them!
          </p>
          <p className="text-sm text-brand-earth-500">
            Created by{" "}
            <a
              href="https://strangestloop.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:underline"
            >
              Loopy
            </a>
            , in collaboration with the{" "}
            <a
              href="https://serviceguild.fun/empowerment/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:underline"
            >
              Empowerment Department
            </a>
            {" "}of{" "}
            <a
              href="https://serviceguild.fun/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:underline"
            >
              The Service Guild
            </a>
            . We learned about Gift Circles through the WEALTH community, led by Carolyn Elliot.
          </p>
          <p className="text-sm text-brand-earth-500">
            This project is open source.{" "}
            <a
              href="https://github.com/service-guild/gift-circle"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:underline"
            >
              Contribute on GitHub
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
