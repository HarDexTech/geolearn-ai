import Link from 'next/link';

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-2xl font-bold tracking-tight">
          GeoLearn AI
        </Link>
        <nav className="flex items-center gap-6 text-sm font-semibold text-slate-700">
          <Link href="/">Home</Link>
          <Link href="/datasets">Datasets</Link>
          <Link href="/tutor">Tutor</Link>
          <span className="border-b-2 border-[var(--color-primary)] pb-1 text-slate-900">
            About
          </span>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-24 pt-8 lg:grid-cols-2">
        <article className="rounded-2xl border border-[var(--color-border)] bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
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

        <article className="rounded-2xl border border-[var(--color-border)] bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
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

        <article className="rounded-2xl border border-[var(--color-border)] bg-white p-8 shadow-sm lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
            Contact
          </p>
          <h2 className="mt-3 text-2xl font-bold">Reach out</h2>
          <p className="mt-4 text-slate-600">
            Email:{' '}
            <a
              className="font-semibold text-[var(--color-primary)]"
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
