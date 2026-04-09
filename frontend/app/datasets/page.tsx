'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { Dataset, getDatasets } from '@/lib/api';

const categories = [
  'all',
  'administrative',
  'land-use',
  'raster',
  'climate',
  'hazard',
  'transport',
  'demography',
  'environment',
  'hydrology',
  'satellite',
];

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const payload = await getDatasets({ query, category });
        setDatasets(payload.datasets);
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [query, category]);

  const sources = useMemo(
    () => ['all', ...Array.from(new Set(datasets.map((item) => item.source)))],
    [datasets],
  );

  const visible = useMemo(() => {
    if (sourceFilter === 'all') {
      return datasets;
    }
    return datasets.filter((item) => item.source === sourceFilter);
  }, [datasets, sourceFilter]);

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-3xl font-black tracking-tight">
          GeoLearn AI
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-700 md:flex">
          <Link href="/">Home</Link>
          <span className="border-b-2 border-[var(--color-primary)] pb-1 text-slate-900">
            Datasets
          </span>
          <Link href="/tutor">Tutor</Link>
          <Link href="/about">About</Link>
        </nav>
        <UserButton />
      </header>

      <section className="mx-auto w-full max-w-7xl px-6 pb-16">
        <h1 className="text-5xl font-extrabold leading-tight">
          Nigerian GIS Dataset Explorer
        </h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          Find data by category, keyword, or source and move directly into your
          workflow.
        </p>

        <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-white p-4">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by dataset name, description, or source"
              className="rounded-xl border border-[var(--color-border)] bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
            />
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              className="rounded-xl border border-[var(--color-border)] bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
            >
              {sources.map((source) => (
                <option key={source} value={source}>
                  {source === 'all' ? 'All sources' : source}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={`rounded-full px-4 py-2 text-xs font-semibold capitalize ${
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

        {loading ? (
          <p className="mt-5 text-sm text-slate-500">Loading datasets...</p>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((dataset) => (
            <article
              key={dataset.id}
              className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="rounded bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-900">
                  {dataset.category}
                </p>
                <span className="text-[11px] font-semibold text-slate-500">
                  {dataset.source}
                </span>
              </div>
              <h3 className="mt-3 text-xl font-bold">{dataset.name}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {dataset.description}
              </p>
              <a
                href={dataset.download_url}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
              >
                Download Dataset
              </a>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
