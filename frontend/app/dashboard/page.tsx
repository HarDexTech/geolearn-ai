'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useUser, UserButton } from '@clerk/nextjs';
import {
  askTutor,
  Dataset,
  getDatasets,
  getYoutubeVideos,
  YoutubeVideo,
} from '@/lib/api';
import { useEffect } from 'react';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  videos?: YoutubeVideo[];
};

const categories = [
  'all',
  'administrative',
  'climate',
  'satellite',
  'land-use',
  'hydrology',
  'hazard',
  'raster',
];

export default function DashboardPage() {
  const { user } = useUser();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [loadingTutor, setLoadingTutor] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoadingDatasets(true);
        const payload = await getDatasets({ query, category });
        setDatasets(payload.datasets);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Could not load datasets.',
        );
      } finally {
        setLoadingDatasets(false);
      }
    }
    void load();
  }, [query, category]);

  const canSend = useMemo(
    () => question.trim().length > 2 && !loadingTutor,
    [question, loadingTutor],
  );

  async function handleAsk() {
    if (!canSend) {
      return;
    }

    const prompt = question.trim();
    setQuestion('');
    setError(null);
    setLoadingTutor(true);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const tutor = await askTutor({
        question: prompt,
        user_id: user?.id ?? 'user_demo',
        email: user?.primaryEmailAddress?.emailAddress,
        name: user?.fullName ?? undefined,
      });

      const youtube = await getYoutubeVideos(prompt);
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: tutor.answer,
        videos: youtube.results,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to get tutor response.',
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
        <UserButton />
      </header>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-6 pb-8 lg:grid-cols-[2fr_3fr]">
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5">
          <h2 className="text-4xl font-extrabold">Dataset Library</h2>
          <div className="mt-5 space-y-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Nigerian geospatial data..."
              className="w-full rounded-xl border border-[var(--color-border)] bg-slate-100 px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
            />
            <div className="flex flex-wrap gap-2">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition ${
                    category === item
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-emerald-100 text-emerald-900'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {loadingDatasets ? (
              <p className="text-sm text-slate-500">Loading datasets...</p>
            ) : null}
            {datasets.map((dataset) => (
              <article
                key={dataset.id}
                className="rounded-xl border border-[var(--color-border)] bg-slate-50 p-4"
              >
                <p className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-800">
                  {dataset.category}
                </p>
                <h3 className="mt-2 text-2xl font-bold">{dataset.name}</h3>
                <p className="mt-2 text-sm text-slate-600">
                  {dataset.description}
                </p>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span>
                    Source: <strong>{dataset.source}</strong>
                  </span>
                  <a
                    href={dataset.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-[var(--color-primary)] px-4 py-2 font-semibold text-white"
                  >
                    Download
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>

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
                  message.role === 'user' ? 'ml-auto w-[85%]' : 'w-[92%]'
                }
              >
                <div
                  className={`rounded-xl p-4 text-sm leading-7 ${
                    message.role === 'user'
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'border border-[var(--color-border)] bg-white'
                  }`}
                >
                  {message.content}
                </div>

                {message.role === 'assistant' && message.videos?.length ? (
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
                if (event.key === 'Enter') {
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
