"use client";

import { useEffect, useRef } from "react";
import { useWorkspaceStore } from "@/lib/workspace-store";

export default function Terminal() {
  const terminalOutput = useWorkspaceStore((s) => s.terminalOutput);
  const setTerminalOutput = useWorkspaceStore((s) => s.setTerminalOutput);
  const containerRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  return (
    <div className="relative h-full w-full">
      <button
        type="button"
        onClick={() => setTerminalOutput("")}
        className="absolute right-2 top-2 z-10 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-400 hover:text-white"
      >
        Clear
      </button>
      <pre
        ref={containerRef}
        className="h-full w-full overflow-auto bg-gray-900 p-4 font-mono text-xs leading-5 text-green-400"
      >
        {terminalOutput || (
          <span className="text-slate-500">Ready to run code...</span>
        )}
      </pre>
    </div>
  );
}
