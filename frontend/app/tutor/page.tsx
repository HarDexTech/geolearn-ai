"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth, useUser, UserButton } from "@clerk/nextjs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import {
  askTutorStream,
  createSession,
  deleteSession,
  getSessionMessages,
  getSessions,
  getYoutubeVideos,
  SessionItem,
  YoutubeVideo,
} from "@/lib/api";

type Message = {
  id: string;
  question: string;
  answer: string;
  videos: YoutubeVideo[];
};

type SessionMessagesCache = Record<string, Message[]>;

type PersistedTutorState = {
  userId: string;
  hasFetchedSessions: boolean;
  sessions: SessionItem[];
  activeSessionId: number | null;
  messages: Message[];
  sessionMessagesCache: SessionMessagesCache;
};

export default function TutorPage() {
  const { getToken } = useAuth();
  const { user, isLoaded } = useUser();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionMessagesCache, setSessionMessagesCache] =
    useState<SessionMessagesCache>({});
  const [hasFetchedSessions, setHasFetchedSessions] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loadingSend, setLoadingSend] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(
    null,
  );
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const storageKey = useMemo(
    () => (user?.id ? `tutor-page-state:${user.id}` : null),
    [user?.id],
  );

  const canSend = useMemo(
    () => prompt.trim().length > 2 && !loadingSend,
    [prompt, loadingSend],
  );

  const getAuthTokenOrThrow = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      throw new Error("Unable to authenticate request. Please sign in again.");
    }
    return token;
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded || !user?.id) {
      return;
    }

    let active = true;
    const fetchSessions = async () => {
      setLoadingSessions(true);
      setError(null);
      try {
        const token = await getAuthTokenOrThrow();
        const result = await getSessions(token);
        if (!active) {
          return;
        }

        setSessions(result.sessions);
        setHasFetchedSessions(true);
        if (result.sessions.length === 0) {
          setActiveSessionId(null);
          setMessages([]);
          setSessionMessagesCache({});
        } else {
          // Always enter tutor page in "new chat" mode.
          setActiveSessionId(null);
          setMessages([]);
          if (active) {
            setLoadingMessages(false);
          }
        }
      } catch (err) {
        if (!active) {
          return;
        }
        setHasFetchedSessions(false);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load sessions right now.",
        );
      } finally {
        if (active) {
          setLoadingSessions(false);
        }
      }
    };

    const hydrateFromStorage = (): boolean => {
      if (!storageKey) {
        return false;
      }

      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) {
        return false;
      }

      try {
        const parsed = JSON.parse(raw) as Partial<PersistedTutorState>;
        if (parsed.userId !== user.id || !parsed.hasFetchedSessions) {
          return false;
        }

        setSessions(Array.isArray(parsed.sessions) ? parsed.sessions : []);
        setSessionMessagesCache(
          parsed.sessionMessagesCache &&
            typeof parsed.sessionMessagesCache === "object"
            ? (parsed.sessionMessagesCache as SessionMessagesCache)
            : {},
        );
      } catch {
        window.sessionStorage.removeItem(storageKey);
        return false;
      }

      // Always enter tutor page in "new chat" mode.
      setActiveSessionId(null);
      setMessages([]);

      setHasFetchedSessions(true);
      setLoadingSessions(false);
      setLoadingMessages(false);
      setError(null);
      return true;
    };

    if (hydrateFromStorage()) {
      return () => {
        active = false;
      };
    }

    void fetchSessions();

    return () => {
      active = false;
    };
  }, [getAuthTokenOrThrow, isLoaded, user?.id, storageKey]);

  useEffect(() => {
    if (activeSessionId === null) {
      return;
    }

    const key = String(activeSessionId);
    setSessionMessagesCache((prev) => {
      if (prev[key] === messages) {
        return prev;
      }
      return { ...prev, [key]: messages };
    });
  }, [activeSessionId, messages]);

  useEffect(() => {
    if (!isLoaded || !user?.id || !storageKey) {
      return;
    }

    const payload: PersistedTutorState = {
      userId: user.id,
      hasFetchedSessions,
      sessions,
      activeSessionId,
      messages,
      sessionMessagesCache,
    };
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
  }, [
    isLoaded,
    user?.id,
    storageKey,
    hasFetchedSessions,
    sessions,
    activeSessionId,
    messages,
    sessionMessagesCache,
  ]);

  useEffect(() => {
    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (!target.closest("[data-session-menu]")) {
        setOpenMenuId(null);
      }

      if (
        !target.closest("[data-mobile-nav]") &&
        !target.closest("[data-mobile-nav-toggle]")
      ) {
        setMobileNavOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, []);

  async function openSession(sessionId: number) {
    setActiveSessionId(sessionId);
    setLoadingMessages(true);
    setError(null);
    setOpenMenuId(null);
    setSidebarOpen(false);

    const cachedMessages = sessionMessagesCache[String(sessionId)];
    if (cachedMessages) {
      setMessages(cachedMessages);
      setLoadingMessages(false);
      return;
    }

    try {
      const token = await getAuthTokenOrThrow();
      const result = await getSessionMessages(sessionId, token);
      const mappedMessages = result.messages.map((message) => ({
        id: String(message.id),
        question: message.question,
        answer: message.answer,
        videos: [],
      }));
      setMessages(mappedMessages);
      setSessionMessagesCache((prev) => ({
        ...prev,
        [String(sessionId)]: mappedMessages,
      }));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load messages for this session.",
      );
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleCopyResponse(messageId: string, text: string) {
    const value = text.trim();
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedMessageId(messageId);
      window.setTimeout(() => {
        setCopiedMessageId((current) =>
          current === messageId ? null : current,
        );
      }, 1500);
    } catch {
      setError("Unable to copy response right now.");
    }
  }

  function startNewChat() {
    setActiveSessionId(null);
    setMessages([]);
    setPrompt("");
    setError(null);
    setOpenMenuId(null);
    setSidebarOpen(false);
  }

  async function handleDeleteSession(sessionId: number) {
    setDeletingSessionId(sessionId);
    setError(null);
    setOpenMenuId(null);

    try {
      const token = await getAuthTokenOrThrow();
      await deleteSession(sessionId, token);
      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
      setSessionMessagesCache((prev) => {
        const next = { ...prev };
        delete next[String(sessionId)];
        return next;
      });
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete session right now.",
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
    setPrompt("");
    setLoadingSend(true);
    setError(null);

    try {
      const token = await getAuthTokenOrThrow();
      let sessionId = activeSessionId;

      if (sessionId === null) {
        const title = question.slice(0, 50);
        const created = await createSession(
          {
            title,
          },
          token,
        );

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

      const tempMessageId = `temp-${crypto.randomUUID()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: tempMessageId,
          question,
          answer: "",
          videos: [],
        },
      ]);

      let finalMessageId = tempMessageId;

      await askTutorStream(
        {
          question,
          session_id: sessionId,
        },
        token,
        (event) => {
          if (event.type === "chunk") {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === finalMessageId
                  ? { ...message, answer: `${message.answer}${event.text}` }
                  : message,
              ),
            );
            return;
          }

          if (event.type === "done") {
            const persistentId = String(event.chat_id);
            setMessages((prev) =>
              prev.map((message) =>
                message.id === finalMessageId
                  ? { ...message, id: persistentId }
                  : message,
              ),
            );
            finalMessageId = persistentId;
            return;
          }

          throw new Error(event.message);
        },
      );

      try {
        const youtube = await getYoutubeVideos(question, token);
        setMessages((prev) =>
          prev.map((message) =>
            message.id === finalMessageId
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
          : "Unable to get a tutor response right now.",
      );
    } finally {
      setLoadingSend(false);
    }
  }

  return (
    <main className="min-h-screen bg-(--color-bg) text-(--color-text)">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-3xl font-black tracking-tight">
          GeoLearn AI
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-700 md:flex">
          <Link href="/">Home</Link>
          <Link href="/workspace">Workspace</Link>
          <Link href="/datasets">Datasets</Link>
          <span className="border-b-2 border-(--color-primary) pb-1 text-slate-900">
            Tutor
          </span>
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-mobile-nav-toggle
            onClick={() => setMobileNavOpen((prev) => !prev)}
            className="rounded-md border border-(--color-border) px-3 py-2 text-xl leading-none md:hidden"
            aria-label="Toggle navigation menu"
          >
            ☰
          </button>
          <UserButton />
        </div>
      </header>

      {mobileNavOpen ? (
        <div className="mx-auto w-full max-w-7xl px-6 pb-2 md:hidden">
          <nav
            data-mobile-nav
            className="rounded-xl border border-(--color-border) bg-white p-2 shadow-sm"
          >
            <Link
              href="/"
              onClick={() => setMobileNavOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Home
            </Link>
            <Link
              href="/workspace"
              onClick={() => setMobileNavOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Workspace
            </Link>
            <Link
              href="/datasets"
              onClick={() => setMobileNavOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Datasets
            </Link>
            <Link
              href="/tutor"
              onClick={() => setMobileNavOpen(false)}
              className="block rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-slate-900"
            >
              Tutor
            </Link>
          </nav>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-7xl px-6 pb-2 lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen((prev) => !prev)}
          className="rounded-md border border-(--color-border) bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
          aria-label="Toggle chat history sidebar"
        >
          ☰ Chat History
        </button>
      </div>

      <section className="relative mx-auto grid w-full max-w-7xl gap-6 px-6 pb-10 lg:grid-cols-[280px_1fr]">
        {sidebarOpen ? (
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden"
            aria-label="Close session sidebar"
          />
        ) : null}

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-70 overflow-y-auto border-r border-(--color-border) bg-white p-4 transition-transform duration-300 lg:static lg:w-auto lg:rounded-2xl lg:border lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <button
            type="button"
            onClick={startNewChat}
            className="w-full rounded-lg bg-(--color-primary) px-3 py-2 text-sm font-semibold text-white"
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
                data-session-menu
                className={`flex items-center gap-2 rounded-lg border p-2 ${
                  activeSessionId === session.id
                    ? "border-(--color-primary) bg-emerald-50"
                    : "border-(--color-border) bg-slate-50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => void openSession(session.id)}
                  className="min-w-0 flex-1 truncate text-left text-sm"
                >
                  {session.title}
                </button>
                <div className="relative" data-session-menu>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenMenuId((prev) =>
                        prev === session.id ? null : session.id,
                      )
                    }
                    className="rounded px-2 py-1 text-lg leading-none text-slate-600 hover:bg-slate-200"
                    aria-label="Open session menu"
                  >
                    ⋯
                  </button>
                  {openMenuId === session.id ? (
                    <div className="absolute right-0 top-9 z-70 w-28 rounded-lg border border-(--color-border) bg-white p-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => void handleDeleteSession(session.id)}
                        disabled={deletingSessionId === session.id}
                        className="w-full rounded-md px-2 py-1 text-left text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="relative rounded-2xl border border-(--color-border) bg-white p-4">
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
                className="space-y-3 rounded-xl border border-(--color-border) bg-white p-4"
              >
                <div className="rounded-lg bg-(--color-primary) p-3 text-sm text-white">
                  {message.question}
                </div>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-700 prose-p:my-2 prose-pre:overflow-x-auto prose-code:before:content-[''] prose-code:after:content-['']">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize]}
                  >
                    {message.answer}
                  </ReactMarkdown>
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
                          className="rounded-lg border border-(--color-border) p-2"
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
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopyResponse(message.id, message.answer)
                    }
                    disabled={!message.answer.trim()}
                    className="rounded-md border border-(--color-border) bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copiedMessageId === message.id ? "Copied" : "Copy"}
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-4 flex gap-2 rounded-xl border border-(--color-border) bg-slate-100 p-2">
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
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
              className="rounded-lg bg-(--color-primary) px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
