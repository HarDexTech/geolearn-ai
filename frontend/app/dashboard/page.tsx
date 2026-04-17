"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth, useUser, UserButton } from "@clerk/nextjs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { askTutorStream, getYoutubeVideos, YoutubeVideo } from "@/lib/api";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  videos?: YoutubeVideo[];
};

export default function DashboardPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loadingTutor, setLoadingTutor] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = useMemo(
    () => question.trim().length > 2 && !loadingTutor,
    [question, loadingTutor],
  );

  async function getAuthTokenOrThrow() {
    const token = await getToken();
    if (!token) {
      throw new Error("Unable to authenticate request. Please sign in again.");
    }
    return token;
  }

  useEffect(() => {
    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
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

  async function handleAsk() {
    if (!canSend) {
      return;
    }

    if (!user?.id) {
      setError("Please sign in to use the tutor.");
      return;
    }

    const prompt = question.trim();
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
    };

    setQuestion("");
    setError(null);
    setLoadingTutor(true);
    setMessages((prev) => [...prev, userMessage]);

    try {
      const token = await getAuthTokenOrThrow();

      const assistantMessageId = `temp-${crypto.randomUUID()}`;
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        videos: [],
      };
      setMessages((prev) => [...prev, assistantMessage]);

      let finalMessageId = assistantMessageId;

      await askTutorStream(
        {
          question: prompt,
          email: user?.primaryEmailAddress?.emailAddress,
          name: user?.fullName ?? undefined,
        },
        token,
        (event) => {
          if (event.type === "chunk") {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === finalMessageId
                  ? { ...message, content: `${message.content}${event.text}` }
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
        const youtube = await getYoutubeVideos(prompt, token);
        setMessages((prev) =>
          prev.map((message) =>
            message.id === finalMessageId
              ? { ...message, videos: youtube.results }
              : message,
          ),
        );
      } catch {
        // Keep AI tutor answer visible even if YouTube fetch fails.
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to get tutor response.",
      );
    } finally {
      setLoadingTutor(false);
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
          <Link href="/tutor">Tutor</Link>
          <Link href="/about">About</Link>
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-mobile-nav-toggle
            onClick={() => setMobileNavOpen((prev) => !prev)}
            className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xl leading-none md:hidden"
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
            className="rounded-xl border border-[var(--color-border)] bg-white p-2 shadow-sm"
          >
            <Link
              href="/"
              onClick={() => setMobileNavOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Home
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
              className="block rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Tutor
            </Link>
            <Link
              href="/about"
              onClick={() => setMobileNavOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              About
            </Link>
          </nav>
        </div>
      ) : null}

      <section className="mx-auto w-full max-w-4xl px-6 pb-8">
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">AI GIS Tutor</h2>
              <p className="text-xs text-slate-500">
                Online | Powered by GeoLearn Engine
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMessages([])}
              className="text-sm font-semibold text-slate-600"
            >
              Clear Chat
            </button>
          </div>

          <div className="mt-4 h-[540px] space-y-4 overflow-y-auto rounded-xl bg-slate-50 p-4">
            {messages.length === 0 ? (
              <p className="text-sm text-slate-500">
                Ask a GIS question to get step-by-step help and related video
                tutorials.
              </p>
            ) : null}

            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user" ? "ml-auto w-[85%]" : "w-[92%]"
                }
              >
                <div
                  className={`rounded-xl p-4 text-sm leading-7 ${
                    message.role === "user"
                      ? "bg-[var(--color-primary)] text-white"
                      : "border border-[var(--color-border)] bg-white"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none text-slate-700 prose-p:my-2 prose-pre:overflow-x-auto prose-code:before:content-[''] prose-code:after:content-['']">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeSanitize]}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    message.content
                  )}
                </div>

                {message.role === "assistant" && message.videos?.length ? (
                  <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      Recommended Tutorials
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-slate-100 p-2">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleAsk();
                }
              }}
              placeholder="Describe your GIS problem..."
              className="w-full bg-transparent px-2 py-2 text-sm outline-none"
            />
            <button
              type="button"
              disabled={!canSend}
              onClick={() => void handleAsk()}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
          {loadingTutor ? (
            <p className="mt-2 text-xs text-slate-500">
              GeoLearn AI is thinking...
            </p>
          ) : null}
          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
