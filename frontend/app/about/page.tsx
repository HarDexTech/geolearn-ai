'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';

export default function AboutPage() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        !target.closest('[data-mobile-nav]') &&
        !target.closest('[data-mobile-nav-toggle]')
      ) {
        setMobileNavOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
    };
  }, []);

  return (
    <main className="min-h-screen bg-(--color-bg) text-(--color-text)">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-2xl font-bold tracking-tight">
          GeoLearn AI
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-700 md:flex">
          <Link href="/">Home</Link>
          <Link href="/workspace">Workspace</Link>
          <Link href="/datasets">Datasets</Link>
          <Link href="/tutor">Tutor</Link>
          <span className="border-b-2 border-(--color-primary) pb-1 text-slate-900">
            About
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
        <div className="mx-auto w-full max-w-6xl px-6 pb-2 md:hidden">
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
              className="block rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Tutor
            </Link>
            <Link
              href="/about"
              onClick={() => setMobileNavOpen(false)}
              className="block rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-slate-900"
            >
              About
            </Link>
          </nav>
        </div>
      ) : null}

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-24 pt-8 lg:grid-cols-2">
        <article className="rounded-2xl border border-(--color-border) bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--color-primary)">
            Mission
          </p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight">
            Empowering Nigerian GIS learners with local-first guidance.
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-600">
            GeoLearn AI helps students discover trusted datasets, solve GIS
            workflows faster, and find practical tutorials tailored to Nigerian
            geospatial challenges.
          </p>
        </article>

        <article className="rounded-2xl border border-(--color-border) bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--color-primary)">
            Founder Story
          </p>
          <h2 className="mt-3 text-2xl font-bold">Ayomide Adesina</h2>
          <p className="mt-5 text-base leading-7 text-slate-600">
            Ayomide created GeoLearn AI to close the gap between GIS theory and
            practical local data workflows for students across Nigeria. The
            platform is focused on clear, reliable, and actionable learning
            support.
          </p>
        </article>

        <article className="rounded-2xl border border-(--color-border) bg-white p-8 shadow-sm lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--color-primary)">
            Contact
          </p>
          <h2 className="mt-3 text-2xl font-bold">Reach out</h2>
          <p className="mt-4 text-slate-600">
            Email:{' '}
            <a
              className="font-semibold text-(--color-primary)"
              href="mailto:adesinayomide2@gmail.com"
            >
              adesinayomide2@gmail.com
            </a>
          </p>
        </article>
      </section>
    </main>
  );
}
