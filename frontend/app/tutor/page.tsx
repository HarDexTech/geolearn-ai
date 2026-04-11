'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useUser, UserButton } from '@clerk/nextjs';
import { askTutor, getYoutubeVideos, YoutubeVideo } from '@/lib/api';

type TutorThread = {
  id: string;
  prompt: string;
  response: string;
  videos: YoutubeVideo[];
};

export default function TutorPage() {
  const { user } = useUser();
  const [threads, setThreads] = useState<TutorThread[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = useMemo(
    () => prompt.trim().length > 2 && !loading,
    [prompt, loading],
  );

  async function handleSend() {
    if (!canSend) {
      return;
    }

    const question = prompt.trim();
    const threadId = crypto.randomUUID();
    setPrompt('');
    setLoading(true);
    setError(null);

    try {
      const tutor = await askTutor({
        question,
        user_id: user?.id ?? 'user_demo',
        email: user?.primaryEmailAddress?.emailAddress,
        name: user?.fullName ?? undefined,
      });

      setThreads((prev) => [
        {
          id: threadId,
          prompt: question,
          response: tutor.answer,
          videos: [],
        },
        ...prev,
      ]);

      try {
        const youtube = await getYoutubeVideos(question);
        setThreads((prev) =>
          prev.map((thread) =>
            thread.id === threadId
              ? { ...thread, videos: youtube.results }
              : thread,
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
      setLoading(false);
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
          <h2 className="text-lg font-bold">Chat History</h2>
          <div className="mt-3 space-y-2">
            {threads.length === 0 ? (
              <p className="text-sm text-slate-500">No chats yet.</p>
            ) : null}
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className="w-full rounded-lg border border-[var(--color-border)] bg-slate-50 p-3 text-left text-sm"
              >
                {thread.prompt}
              </button>
            ))}
          </div>
        </aside>

        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
          <div className="h-[68vh] space-y-5 overflow-y-auto rounded-xl bg-slate-50 p-4">
            {threads.length === 0 ? (
              <p className="text-sm text-slate-500">
                Ask GeoLearn AI about QGIS, ArcGIS, remote sensing, or Nigerian
                geospatial analysis.
              </p>
            ) : null}

            {threads.map((thread) => (
              <article
                key={thread.id}
                className="space-y-3 rounded-xl border border-[var(--color-border)] bg-white p-4"
              >
                <div className="rounded-lg bg-[var(--color-primary)] p-3 text-sm text-white">
                  {thread.prompt}
                </div>
                <div className="text-sm leading-7 text-slate-700 whitespace-pre-wrap">
                  {thread.response}
                </div>
                {thread.videos.length ? (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      Recommended Tutorials
                    </p>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      {thread.videos.map((video) => (
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
          {loading ? (
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
