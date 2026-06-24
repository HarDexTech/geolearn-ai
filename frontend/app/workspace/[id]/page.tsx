"use client";

import { useCallback, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth, UserButton } from "@clerk/nextjs";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { getWorkspace, updateWorkspace } from "@/lib/api";

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

  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const projectName = useWorkspaceStore((s) => s.projectName);
  const code = useWorkspaceStore((s) => s.code);
  const activeTab = useWorkspaceStore((s) => s.activeTab);

  const setWorkspaceId = useWorkspaceStore((s) => s.setWorkspaceId);
  const setCode = useWorkspaceStore((s) => s.setCode);
  const addLayer = useWorkspaceStore((s) => s.addLayer);
  const setProjectName = useWorkspaceStore((s) => s.setProjectName);

  const workspaceIdNum = Number(params.id);

  useEffect(() => {
    if (!workspaceIdNum) return;

    async function load() {
      try {
        const token = await getToken();
        if (!token) {
          router.push("/sign-in");
          return;
        }
        const data = await getWorkspace(workspaceIdNum, token);
        setWorkspaceId(data.id);
        setCode(data.code ?? "");
        data.layers.forEach((layer) =>
          addLayer({ ...layer, visible: true }),
        );
      } catch {
        router.push("/workspace");
      }
    }
    void load();
  }, [workspaceIdNum, getToken, setWorkspaceId, setCode, addLayer, router]);

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
    if (!workspaceIdNum) return;
    try {
      const token = await getToken();
      if (!token) return;
      await updateWorkspace(workspaceIdNum, { code }, token);
    } catch {
      // Silent save failure.
    }
  }, [workspaceIdNum, code, getToken]);

  return (
    <main className="flex h-screen flex-col bg-(--color-bg) text-(--color-text)">
      <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-(--color-border) bg-white px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/workspace"
            className="text-lg font-bold tracking-tight text-(--color-primary)"
          >
            GeoLearn AI
          </Link>
          <span className="text-sm font-semibold text-slate-500">/</span>
          <span className="text-sm font-semibold text-slate-700">
            {projectName || "Workspace"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-(--color-primary) px-4 py-1.5 text-sm font-semibold text-white"
          >
            Save
          </button>
          <UserButton />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col">
          <div className="flex-1">
            <MapView />
          </div>
          <div className="h-[45%] border-t border-(--color-border) bg-white">
            {activeTab === "editor" ? <CodeEditor /> : <Terminal />}
          </div>
        </div>
        <aside className="w-[360px] flex-shrink-0 border-l border-(--color-border) bg-white">
          <AiSidebar />
        </aside>
      </div>
    </main>
  );
}
