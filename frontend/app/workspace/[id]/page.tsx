"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth, UserButton } from "@clerk/nextjs";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { getWorkspace, updateWorkspace } from "@/lib/api";
import BackButton from "@/components/BackButton";

const MapView = dynamic(() => import("@/components/workspace/MapView"), {
  ssr: false,
});
const CodeEditor = dynamic(
  () => import("@/components/workspace/CodeEditor"),
  { ssr: false },
);
const AiSidebar = dynamic(() => import("@/components/workspace/AiSidebar"), {
  ssr: false,
});
const Terminal = dynamic(() => import("@/components/workspace/Terminal"), {
  ssr: false,
});

export default function WorkspacePage() {
  const { getToken } = useAuth();
  const params = useParams();
  const router = useRouter();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFetchedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const projectName = useWorkspaceStore((s) => s.projectName);
  const code = useWorkspaceStore((s) => s.code);
  const activeTab = useWorkspaceStore((s) => s.activeTab);

  const setWorkspaceId = useWorkspaceStore((s) => s.setWorkspaceId);
  const setCode = useWorkspaceStore((s) => s.setCode);
  const addLayer = useWorkspaceStore((s) => s.addLayer);
  const setProjectName = useWorkspaceStore((s) => s.setProjectName);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const resetWorkspace = useWorkspaceStore((s) => s.resetWorkspace);

  const workspaceIdNum = Number(params.id);

  const load = useCallback(async () => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        router.push("/sign-in");
        return;
      }
      const data = await getWorkspace(workspaceIdNum, token);
      setWorkspaceId(data.id);
      setCode(data.code ?? "");
      if (data.project_name) setProjectName(data.project_name);
      data.layers.forEach((layer) => addLayer(layer));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("404")) {
        setError("Workspace not found. Redirecting to your projects...");
        setTimeout(() => router.push("/workspace"), 2500);
        return;
      } else {
        console.error("[Workspace] Load error:", err);
        setError(msg || "Failed to load workspace. Check that the backend is running.");
      }
    }
  }, [workspaceIdNum, getToken, setWorkspaceId, setCode, addLayer, setProjectName, router]);

  useEffect(() => {
    if (!workspaceIdNum) return;
    resetWorkspace();
    hasFetchedRef.current = false;
    void load();
    return () => {
      hasFetchedRef.current = false;
    };
  }, [workspaceIdNum, load, resetWorkspace]);

  useEffect(() => {
    if (!workspaceIdNum) return;

    async function save(code: string) {
      try {
        const token = await getToken();
        if (!token) return;
        await updateWorkspace(workspaceIdNum, { code }, token);
      } catch {
        // Silent save failure — next save will retry.
      }
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      void save(code);
    }, 2000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [code, workspaceIdNum, getToken]);

  const handleSave = useCallback(async () => {
    if (!workspaceIdNum || isSaving) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const token = await getToken();
      if (!token) return;
      await updateWorkspace(workspaceIdNum, { code }, token);
      setSaveMessage("Saved");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch {
      // Silent save failure.
    } finally {
      setIsSaving(false);
    }
  }, [workspaceIdNum, code, getToken, isSaving]);

  return (
    <main className="flex h-screen flex-col bg-(--color-bg) text-(--color-text)">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-(--color-border) bg-white px-4">
        <div className="flex items-center gap-2">
          <BackButton href="/workspace" label="Projects" />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-lg bg-(--color-primary) px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-70 transition-opacity"
          >
            {isSaving ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Saving...
              </>
            ) : saveMessage ? (
              "✓ Saved"
            ) : (
              "Save"
            )}
          </button>
          <UserButton />
        </div>
      </header>

      {error ? (
        <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700">
          <span>{error}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                hasFetchedRef.current = false;
                void load();
              }}
              className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => router.push("/workspace")}
              className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              Back to Projects
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex-1">
            <MapView />
          </div>
          <div className={`border-t border-(--color-border) bg-white transition-all duration-200 ${bottomPanelOpen ? 'h-[45%]' : 'h-0 overflow-hidden'}`}>
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-(--color-border) bg-slate-50 px-3 py-1 flex-shrink-0">
                <div className="flex rounded-md border border-(--color-border) text-xs font-semibold overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setActiveTab("editor")}
                    className={`px-3 py-1 ${activeTab === "editor" ? "bg-(--color-primary) text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("terminal")}
                    className={`px-3 py-1 ${activeTab === "terminal" ? "bg-(--color-primary) text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    Terminal
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setBottomPanelOpen(false)}
                  className="rounded p-1 text-sm leading-none text-slate-500 hover:bg-slate-200"
                  aria-label="Close bottom panel"
                >
                  &times;
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                {activeTab === "editor" ? <CodeEditor /> : <Terminal />}
              </div>
            </div>
          </div>
          {!bottomPanelOpen ? (
            <button
              type="button"
              onClick={() => setBottomPanelOpen(true)}
              className="flex h-8 flex-shrink-0 items-center justify-center border-t border-(--color-border) bg-slate-50 text-xs font-semibold text-slate-500 hover:bg-slate-100"
              aria-label="Open bottom panel"
            >
              ▲ Open {activeTab === "editor" ? "Code Editor" : "Terminal"}
            </button>
          ) : null}
        </div>

        <div className="relative flex">
          {sidebarOpen ? (
            <aside className="w-[360px] flex-shrink-0 border-l border-(--color-border) bg-white flex flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-(--color-border) px-3 py-2">
                <span className="text-xs font-semibold text-slate-500">AI Assistant</span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="rounded p-1 text-sm leading-none text-slate-500 hover:bg-slate-200"
                  aria-label="Close sidebar"
                >
                  &times;
                </button>
              </div>
              <AiSidebar />
            </aside>
          ) : (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex w-8 flex-shrink-0 items-center justify-center border-l border-(--color-border) bg-white text-sm text-slate-500 hover:bg-slate-100"
              aria-label="Open sidebar"
            >
              &lsaquo;
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
