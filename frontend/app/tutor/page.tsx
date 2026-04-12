'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useUser, UserButton } from '@clerk/nextjs';
import {
  askTutor,
  createSession,
  deleteSession,
  getSessionMessages,
  getSessions,
  getYoutubeVideos,
  SessionItem,
  YoutubeVideo,
} from '@/lib/api';

type Message = {
  id: string;
  question: string;
  answer: string;
  videos: YoutubeVideo[];
};

export default function TutorPage() {
  const { user, isLoaded } = useUser();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loadingSend, setLoadingSend] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const canSend = useMemo(
    () => prompt.trim().length > 2 && !loadingSend,
    [prompt, loadingSend],
  );

  useEffect(() => {
    if (!isLoaded || !user?.id) {
      return;
    }

    let active = true;

    const fetchSessions = async () => {
      setLoadingSessions(true);
      try {
        const result = await getSessions(user.id);
        if (!active) {
          return;
        }
        setSessions(result.sessions);
        setActiveSessionId(null);
        setMessages([]);
      } catch (err) {
        if (!active) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load sessions right now.',
        );
      } finally {
        if (active) {
          setLoadingSessions(false);
        }
      }
    };

    void fetchSessions();

    return () => {
      active = false;
    };
  }, [isLoaded, user?.id]);

  async function openSession(sessionId: number) {
    setActiveSessionId(sessionId);
    setLoadingMessages(true);
    setError(null);

    try {
      const result = await getSessionMessages(sessionId);
      setMessages(
        result.messages.map((message) => ({
          id: String(message.id),
          question: message.question,
          answer: message.answer,
          videos: [],
        })),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load messages for this session.',
      );
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }

  function startNewChat() {
    setActiveSessionId(null);
    setMessages([]);
    setPrompt('');
    setError(null);
  }

  async function handleDeleteSession(sessionId: number) {
    setDeletingSessionId(sessionId);
    setError(null);

    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to delete session right now.',
      );
    } finally {
      setDeletingSessionId(null);
    }
  }

  async function handleSend() {
    if (!canSend || !user?.id) {
      return;
    }

    const question = prompt.trim();
    setPrompt('');
    setLoadingSend(true);
    setError(null);

    try {
      let sessionId = activeSessionId;

      if (sessionId === null) {
        const title = question.slice(0, 50);
        const created = await createSession({
          user_id: user.id,
          title,
          email: user.primaryEmailAddress?.emailAddress,
          name: user.fullName ?? undefined,
        });

        const newSessionId = created.session_id;
        sessionId = newSessionId;
        setActiveSessionId(newSessionId);
        setSessions((prev) => [
          {
            id: newSessionId,
            title: created.title,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
      }

      const tutor = await askTutor({
        question,
        user_id: user.id,
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName ?? undefined,
        session_id: sessionId,
      });

      const messageId = String(tutor.chat_id);
      setMessages((prev) => [
        ...prev,
        {
          id: messageId,
          question,
          answer: tutor.answer,
          videos: [],
        },
      ]);

      try {
        const youtube = await getYoutubeVideos(question);
        setMessages((prev) =>
          prev.map((message) =>
            message.id === messageId
              ? { ...message, videos: youtube.results }
              : message,
          ),
        );
      } catch {
        // YouTube is best-effort; do not block tutor response.
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to get a tutor response right now.',
      );
    } finally {
      setLoadingSend(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-3xl font-black tracking-tight">
          GeoLearn AI
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-700 md:flex">
          <Link href="/">Home</Link>
          <Link href="/datasets">Datasets</Link>
          <span className="border-b-2 border-[var(--color-primary)] pb-1 text-slate-900">
            Tutor
          </span>
          <Link href="/about">About</Link>
        </nav>
        <UserButton />
      </header>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-6 pb-10 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
          <button
            type="button"
            onClick={startNewChat}
            className="w-full rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white"
          >
            New Chat
          </button>
          <div className="mt-4 space-y-2">
            {loadingSessions ? (
              <p className="text-sm text-slate-500">Loading sessions...</p>
            ) : null}
            {!loadingSessions && sessions.length === 0 ? (
              <p className="text-sm text-slate-500">No sessions yet.</p>
            ) : null}
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`flex items-center gap-2 rounded-lg border p-2 ${
                  activeSessionId === session.id
                    ? 'border-[var(--color-primary)] bg-emerald-50'
                    : 'border-[var(--color-border)] bg-slate-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => void openSession(session.id)}
                  className="min-w-0 flex-1 truncate text-left text-sm"
                >
                  {session.title}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteSession(session.id)}
                  disabled={deletingSessionId === session.id}
                  className="text-xs font-semibold text-red-600 disabled:opacity-50"
                >
                  Del
                </button>
              </div>
            ))}
          </div>
        </aside>

        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
          <div className="h-[68vh] space-y-5 overflow-y-auto rounded-xl bg-slate-50 p-4">
            {loadingMessages ? (
              <p className="text-sm text-slate-500">Loading messages...</p>
            ) : null}
            {!loadingMessages && messages.length === 0 ? (
              <p className="text-sm text-slate-500">
                Start a new conversation.
              </p>
            ) : null}

            {messages.map((message) => (
              <article
                key={message.id}
                className="space-y-3 rounded-xl border border-[var(--color-border)] bg-white p-4"
              >
                <div className="rounded-lg bg-[var(--color-primary)] p-3 text-sm text-white">
                  {message.question}
                </div>
                <div className="text-sm leading-7 text-slate-700 whitespace-pre-wrap">
                  {message.answer}
                </div>
                {message.videos.length ? (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      Recommended Tutorials
                    </p>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      {message.videos.map((video) => (
                        <a
                          key={video.video_url}
                          href={video.video_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-[var(--color-border)] p-2"
                        >
                          {video.thumbnail ? (
                            <Image
                              loader={({ src }) => src}
                              unoptimized
                              src={video.thumbnail}
                              alt={video.title}
                              width={320}
                              height={160}
                              className="h-28 w-full rounded object-cover"
                            />
                          ) : null}
                          <p className="mt-2 line-clamp-2 text-sm font-semibold">
                            {video.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            {video.channel}
                          </p>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <div className="mt-4 flex gap-2 rounded-xl border border-[var(--color-border)] bg-slate-100 p-2">
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleSend();
                }
              }}
              placeholder="Describe your GIS challenge..."
              className="w-full bg-transparent px-2 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!canSend}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
          {loadingSend ? (
            <p className="mt-2 text-xs text-slate-500">
              Generating response...
            </p>
          ) : null}
          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
