import Link from 'next/link';
import { SignInButton } from '@clerk/nextjs';
import Image from 'next/image';
import { Show } from '@/components/show';

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-3xl font-black tracking-tight">
          GeoLearn AI
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-700 md:flex">
          <Link
            href="/"
            className="border-b-2 border-[var(--color-primary)] pb-1 text-slate-900"
          >
            Home
          </Link>
          <Link href="/datasets">Datasets</Link>
          <Link href="/tutor">Tutor</Link>
          <Link href="/about">About</Link>
        </nav>
        <Show when="signed-out">
          <SignInButton>
            <button
              type="button"
              className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"
            >
              Sign In
            </button>
          </SignInButton>
        </Show>
        <Show when="signed-in">
          <Link
            href="/dashboard"
            className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            Dashboard
          </Link>
        </Show>
      </header>

      <section className="mx-auto grid w-full max-w-7xl items-center gap-12 px-6 pb-20 pt-8 lg:grid-cols-2">
        <div>
          <h1 className="text-6xl font-black leading-[0.95] tracking-tight sm:text-7xl">
            Your GIS Learning Assistant,{' '}
            <span className="text-emerald-700">Built for Nigeria</span>
          </h1>
          <p className="mt-7 max-w-xl text-xl leading-8 text-slate-600">
            Find free Nigerian geospatial datasets and get instant AI help with
            QGIS, ArcGIS, and remote sensing workflows.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/datasets"
              className="rounded-lg bg-[var(--color-primary)] px-6 py-3 font-semibold text-white shadow-sm"
            >
              Explore Datasets
            </Link>
            <Link
              href="/tutor"
              className="rounded-lg border border-[var(--color-border)] bg-white px-6 py-3 font-semibold text-slate-800"
            >
              Try AI Tutor
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="rounded-2xl border border-emerald-900/20 bg-gradient-to-br from-emerald-950 to-emerald-800 p-4 shadow-2xl">
            <Image
              src="/nigeria-map.svg"
              alt="Nigeria map"
              width={640}
              height={640}
              className="h-auto w-full rounded-xl"
              priority
            />
          </div>
          <div className="absolute -bottom-6 left-6 max-w-xs rounded-xl border border-[var(--color-border)] bg-white/90 p-4 shadow-lg backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
              AI Insights
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              I analyzed your Lagos coastline shapefile. Check for topology
              errors before running weighted overlays.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[var(--color-primary)] py-10 text-white">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 md:grid-cols-3">
          <article>
            <p className="text-6xl font-black">90%</p>
            <p className="text-sm uppercase tracking-[0.1em] text-emerald-100">
              Of GIS students struggle finding datasets
            </p>
          </article>
          <article>
            <p className="text-6xl font-black">100%</p>
            <p className="text-sm uppercase tracking-[0.1em] text-emerald-100">
              Found an AI tutor useful
            </p>
          </article>
          <article>
            <p className="text-6xl font-black">10,000+</p>
            <p className="text-sm uppercase tracking-[0.1em] text-emerald-100">
              Nigerian GIS students
            </p>
          </article>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-20">
        <div className="mb-10 flex items-end justify-between gap-6">
          <h2 className="max-w-3xl text-5xl font-black leading-tight">
            Expertise for the Nigerian Geospatial Landscape
          </h2>
          <p className="hidden text-sm text-slate-500 md:block">
            Focusing on local data precision.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <article className="rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
            <h3 className="text-2xl font-bold">Dataset Library</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Access high-quality Nigerian geospatial datasets including
              administrative boundaries and satellite imagery.
            </p>
            <div className="mt-5 h-24 rounded-xl bg-[radial-gradient(circle_at_20%_20%,#d6e9dc,#e2e8f0_60%,#f1f5f9)]" />
          </article>
          <article className="rounded-2xl border border-emerald-900/20 bg-gradient-to-br from-emerald-900 to-emerald-700 p-6 text-white shadow-lg">
            <h3 className="text-2xl font-bold">AI GIS Tutor</h3>
            <p className="mt-3 text-sm leading-6 text-emerald-100">
              Solve GIS errors with step-by-step support for QGIS, ArcGIS, and
              remote sensing tasks.
            </p>
            <div className="mt-5 rounded-lg bg-white/20 px-3 py-2 text-xs font-semibold">
              AI Tutor Online
            </div>
          </article>
          <article className="rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
            <h3 className="text-2xl font-bold">YouTube Tutorials</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Integrated tutorial recommendations for visual learners with
              context-aware video suggestions.
            </p>
            <div className="mt-5 h-24 rounded-xl bg-[radial-gradient(circle_at_10%_40%,#cbd5e1,#e2e8f0_55%,#f8fafc)]" />
          </article>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 pb-20">
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-10 text-center">
          <h3 className="text-4xl font-black">
            Join the Next Generation of Nigerian GIS Experts
          </h3>
          <p className="mx-auto mt-4 max-w-xl text-slate-600">
            Get monthly updates on new Nigerian datasets and GIS training
            materials delivered to your inbox.
          </p>
          <form className="mx-auto mt-7 flex max-w-lg flex-col gap-3 sm:flex-row">
            <input
              type="email"
              placeholder="Your academic email"
              className="w-full rounded-lg border border-[var(--color-border)] bg-slate-50 px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-primary)] px-6 py-3 text-sm font-bold text-white"
            >
              Join Free
            </button>
          </form>
        </div>
      </section>

      <footer className="border-t border-[var(--color-border)] bg-slate-100">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-6 py-6 text-sm text-slate-600 md:flex-row">
          <p className="font-bold text-slate-800">GeoLearn AI</p>
          <div className="flex items-center gap-4">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>Contact Support</span>
          </div>
          <p>© 2026 GeoLearn AI.</p>
        </div>
      </footer>
    </main>
  );
}
