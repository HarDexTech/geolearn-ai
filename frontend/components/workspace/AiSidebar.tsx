"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { useWorkspaceStore, Message } from "@/lib/workspace-store";
import { runAgentStream, runCode } from "@/lib/api";

export default function AiSidebar() {
  const { getToken } = useAuth();
  const messages = useWorkspaceStore((s) => s.messages);
  const addMessage = useWorkspaceStore((s) => s.addMessage);
  const appendToLastMessage = useWorkspaceStore((s) => s.appendToLastMessage);
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const isAgentRunning = useWorkspaceStore((s) => s.isAgentRunning);
  const setAgentRunning = useWorkspaceStore((s) => s.setAgentRunning);
  const setCodeRunning = useWorkspaceStore((s) => s.setCodeRunning);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const setTerminalOutput = useWorkspaceStore((s) => s.setTerminalOutput);
  const [input, setInput] = useState("");
  const messageListRef = useRef<HTMLDivElement>(null);
  const [expandedResults, setExpandedResults] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isAgentRunning || workspaceId === null) return;

    setInput("");
    setAgentRunning(true);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    addMessage(userMsg);

    const placeholderId = crypto.randomUUID();
    const placeholderMsg: Message = {
      id: placeholderId,
      role: "assistant",
      content: "",
    };
    addMessage(placeholderMsg);

    try {
      const token = await getToken();
      if (!token) throw new Error("Unable to authenticate.");

      const lastMessageId = placeholderId;

      await runAgentStream(
        { workspace_id: workspaceId, message: text, auto_run: false },
        token,
        (event) => {
          if (event.type === "chunk") {
            appendToLastMessage(event.text);
          } else if (event.type === "running_code") {
            // Update the last message's code field
            useWorkspaceStore.setState((state) => {
              const msgs = [...state.messages];
              const last = msgs[msgs.length - 1];
              if (last && last.id === lastMessageId) {
                msgs[msgs.length - 1] = { ...last, code: event.code };
              }
              return { messages: msgs };
            });
          } else if (event.type === "execution_result") {
            useWorkspaceStore.setState((state) => {
              const msgs = [...state.messages];
              const last = msgs[msgs.length - 1];
              if (last && last.id === lastMessageId) {
                msgs[msgs.length - 1] = {
                  ...last,
                  executionResult: {
                    stdout: event.stdout,
                    stderr: event.stderr,
                    exit_code: event.exit_code,
                    duration_ms: event.duration_ms,
                  },
                };
              }
              return { messages: msgs };
            });
          } else if (event.type === "error") {
            useWorkspaceStore.setState((state) => {
              const msgs = [...state.messages];
              const last = msgs[msgs.length - 1];
              if (last && last.id === lastMessageId) {
                msgs[msgs.length - 1] = { ...last, content: event.message };
              }
              return { messages: msgs };
            });
            setAgentRunning(false);
          } else if (event.type === "done") {
            setAgentRunning(false);
          }
        },
      );
    } catch (err) {
      useWorkspaceStore.setState((state) => {
        const msgs = [...state.messages];
        const last = msgs[msgs.length - 1];
        if (last) {
          msgs[msgs.length - 1] = {
            ...last,
            content: err instanceof Error ? err.message : "An error occurred.",
          };
        }
        return { messages: msgs };
      });
    } finally {
      setAgentRunning(false);
    }
  }, [input, isAgentRunning, workspaceId, getToken, addMessage, appendToLastMessage, setAgentRunning]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleRunGeneratedCode = useCallback(
    async (messageId: string, code: string) => {
      if (!workspaceId) return;

      setCodeRunning(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Unable to authenticate.");

        const result = await runCode(
          { workspace_id: workspaceId, code, timeout: 30 },
          token,
        );

        const terminalText = [
          result.stdout,
          result.stderr ? `STDERR:\n${result.stderr}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        setTerminalOutput(terminalText);
        setActiveTab("terminal");

        useWorkspaceStore.setState((state) => ({
          messages: state.messages.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  executionResult: {
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exit_code: result.exit_code,
                    duration_ms: result.duration_ms,
                  },
                }
              : m,
          ),
        }));
      } catch (err) {
        useWorkspaceStore.setState((state) => ({
          messages: state.messages.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  executionResult: {
                    stdout: "",
                    stderr:
                      err instanceof Error ? err.message : "Execution failed.",
                    exit_code: 1,
                    duration_ms: 0,
                  },
                }
              : m,
          ),
        }));
        setTerminalOutput(
          err instanceof Error ? err.message : "Execution failed.",
        );
        setActiveTab("terminal");
      } finally {
        setCodeRunning(false);
      }
    },
    [workspaceId, getToken, setCodeRunning, setTerminalOutput, setActiveTab],
  );

  const handleCopyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard not available — silent fail.
    }
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-3" ref={messageListRef}>
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-slate-400">
            Ask the AI agent to help you write geospatial code.
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="mb-4">
            {msg.role === "user" ? (
              <div className="rounded-lg bg-(--color-primary) px-3 py-2 text-sm text-white">
                {msg.content}
              </div>
            ) : (
              <div className="rounded-lg border border-(--color-border) bg-white px-3 py-2 text-sm">
                {msg.content ? (
                  <div className="prose prose-xs max-w-none text-slate-700 prose-p:my-1 prose-code:before:content-[''] prose-code:after:content-['']">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeSanitize]}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : msg === messages[messages.length - 1] && isAgentRunning ? (
                  <span className="text-slate-400">Thinking...</span>
                ) : null}
                {msg.code && (
                  <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-2 text-xs font-mono text-slate-700">
                    {msg.code}
                  </pre>
                )}
                {msg.code && !msg.executionResult && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-(--color-border) bg-slate-50 p-2">
                    <span className="text-xs text-slate-600 flex-1">AI generated code. Run it?</span>
                    <button
                      type="button"
                      onClick={() => void handleRunGeneratedCode(msg.id, msg.code!)}
                      className="rounded-md bg-(--color-primary) px-2 py-1 text-xs font-semibold text-white"
                    >
                      Run
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyCode(msg.code!)}
                      className="rounded-md border border-(--color-border) bg-white px-2 py-1 text-xs font-semibold text-slate-600"
                    >
                      Copy
                    </button>
                  </div>
                )}
                {msg.executionResult && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedResults((prev) => ({
                          ...prev,
                          [msg.id]: !prev[msg.id],
                        }))
                      }
                      className="rounded border border-(--color-border) bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
                    >
                      {expandedResults[msg.id]
                        ? "Hide Result"
                        : "Show Result"}
                    </button>
                    {expandedResults[msg.id] && (
                      <pre className="mt-1 overflow-x-auto rounded bg-gray-900 p-2 text-xs font-mono text-green-400">
                        {msg.executionResult.stdout}
                        {msg.executionResult.stderr
                          ? `\nSTDERR:\n${msg.executionResult.stderr}`
                          : ""}
                        <span className="block pt-1 text-slate-500">
                          Exit code: {msg.executionResult.exit_code} |{" "}
                          {msg.executionResult.duration_ms}ms
                        </span>
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-(--color-border) p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the AI agent... (Ctrl+Enter to send)"
          rows={3}
          className="w-full resize-none rounded-lg border border-(--color-border) bg-slate-50 p-2 text-sm outline-none focus:border-(--color-primary)"
          disabled={isAgentRunning || workspaceId === null}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isAgentRunning || workspaceId === null || !input.trim()}
          className="mt-2 w-full rounded-lg bg-(--color-primary) px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isAgentRunning ? "Running..." : "Send"}
        </button>
      </div>
    </div>
  );
}
