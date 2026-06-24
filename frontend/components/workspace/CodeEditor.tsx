"use client";

import { useCallback } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@clerk/nextjs";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { runCode } from "@/lib/api";
import type { Monaco } from "@monaco-editor/react";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  { ssr: false },
);

export default function CodeEditor() {
  const { getToken } = useAuth();
  const code = useWorkspaceStore((s) => s.code);
  const setCode = useWorkspaceStore((s) => s.setCode);
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const isCodeRunning = useWorkspaceStore((s) => s.isCodeRunning);
  const setCodeRunning = useWorkspaceStore((s) => s.setCodeRunning);
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const setTerminalOutput = useWorkspaceStore((s) => s.setTerminalOutput);

  const handleRun = useCallback(async () => {
    if (isCodeRunning || workspaceId === null) return;

    const token = await getToken();
    if (!token) return;

    setCodeRunning(true);
    try {
      const result = await runCode(
        { workspace_id: workspaceId, code, timeout: 30 },
        token,
      );
      let output = result.stdout;
      if (result.stderr) {
        output += `\nSTDERR:\n${result.stderr}`;
      }
      setTerminalOutput(output);
      setActiveTab("terminal");
    } catch (err) {
      setTerminalOutput(
        err instanceof Error ? err.message : "An error occurred while running code.",
      );
      setActiveTab("terminal");
    } finally {
      setCodeRunning(false);
    }
  }, [code, workspaceId, isCodeRunning, getToken, setCodeRunning, setTerminalOutput, setActiveTab]);

  const handleEditorDidMount = useCallback((_monaco: Monaco) => {
    // Editor ready
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1">
        <MonacoEditor
          language="python"
          theme="vs-dark"
          value={code}
          onChange={(value) => setCode(value ?? "")}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            fontFamily: "var(--font-sora), monospace",
            padding: { top: 8 },
          }}
        />
      </div>
      <div className="flex items-center justify-between border-t border-(--color-border) bg-slate-50 px-3 py-2">
        <button
          type="button"
          onClick={handleRun}
          disabled={isCodeRunning || workspaceId === null}
          className="rounded-lg bg-(--color-primary) px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isCodeRunning ? "Running..." : "Run"}
        </button>
        <div className="flex rounded-lg border border-(--color-border) text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("editor")}
            className={`px-3 py-1.5 ${
              activeTab === "editor"
                ? "bg-(--color-primary) text-white"
                : "bg-white text-slate-600"
            }`}
          >
            Editor
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("terminal")}
            className={`px-3 py-1.5 ${
              activeTab === "terminal"
                ? "bg-(--color-primary) text-white"
                : "bg-white text-slate-600"
            }`}
          >
            Terminal
          </button>
        </div>
      </div>
    </div>
  );
}
