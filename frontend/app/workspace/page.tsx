"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, UserButton } from "@clerk/nextjs";
import { createProject, getProjects, Project } from "@/lib/api";

export default function WorkspacePage() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Unable to authenticate.");
      const result = await getProjects(token);
      setProjects(result.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        !target.closest("[data-mobile-nav]") &&
        !target.closest("[data-mobile-nav-toggle]")
      ) {
        setMobileNavOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;

    setCreating(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Unable to authenticate.");
      const project = await createProject({ name }, token);
      setShowNewForm(false);
      setNewName("");
      router.push(`/workspace/${project.workspace_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-(--color-bg) text-(--color-text)">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-2xl font-bold tracking-tight">
          GeoLearn AI
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-700 md:flex">
          <Link href="/">Home</Link>
          <span className="border-b-2 border-(--color-primary) pb-1 text-slate-900">
            Workspace
          </span>
          <Link href="/datasets">Datasets</Link>
          <Link href="/tutor">Tutor</Link>
          <Link href="/about">About</Link>
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
              className="block rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-slate-900"
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
              className="block rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              About
            </Link>
          </nav>
        </div>
      ) : null}

      <section className="mx-auto w-full max-w-6xl px-6 pb-20 pt-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-black">My Projects</h1>
          <button
            type="button"
            onClick={() => setShowNewForm((prev) => !prev)}
            className="rounded-lg bg-(--color-primary) px-5 py-2 text-sm font-semibold text-white"
          >
            New Project
          </button>
        </div>

        {showNewForm ? (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-(--color-border) bg-white p-4 shadow-sm">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
              placeholder="Project name..."
              className="flex-1 rounded-lg border border-(--color-border) px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
              autoFocus
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !newName.trim()}
              className="rounded-lg bg-(--color-primary) px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewForm(false);
                setNewName("");
              }}
              className="text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-2xl border border-(--color-border) bg-slate-100"
              />
            ))}
          </div>
        ) : null}

        {!loading && projects.length === 0 ? (
          <div className="rounded-2xl border border-(--color-border) bg-white p-12 text-center shadow-sm">
            <p className="text-lg font-semibold text-slate-500">
              No projects yet — create your first one
            </p>
          </div>
        ) : null}

        {!loading && projects.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="rounded-2xl border border-(--color-border) bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <h3 className="text-lg font-bold">{project.name}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Created {new Date(project.created_at).toLocaleDateString()}
                </p>
                <Link
                  href={`/workspace/${project.workspace_id}`}
                  className="mt-4 inline-block rounded-lg bg-(--color-primary) px-4 py-2 text-sm font-semibold text-white"
                >
                  Open
                </Link>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
