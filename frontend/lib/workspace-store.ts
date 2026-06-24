import { create } from "zustand";

export type Layer = {
  id: number;
  name: string;
  source: string;
  layer_type: string;
  visible: boolean;
  style: object | null;
  metadata: object | null;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  code?: string;
  executionResult?: {
    stdout: string;
    stderr: string;
    exit_code: number;
    duration_ms: number;
  };
};

type WorkspaceState = {
  workspaceId: number | null;
  projectName: string;
  code: string;
  layers: Layer[];
  messages: Message[];
  terminalOutput: string;
  isAgentRunning: boolean;
  isCodeRunning: boolean;
  activeTab: "editor" | "terminal";

  setWorkspaceId: (id: number) => void;
  setProjectName: (name: string) => void;
  setCode: (code: string) => void;
  addLayer: (layer: Layer) => void;
  removeLayer: (id: number) => void;
  toggleLayerVisibility: (id: number) => void;
  addMessage: (message: Message) => void;
  appendToLastMessage: (text: string) => void;
  setTerminalOutput: (output: string) => void;
  appendToTerminal: (text: string) => void;
  setAgentRunning: (v: boolean) => void;
  setCodeRunning: (v: boolean) => void;
  setActiveTab: (tab: "editor" | "terminal") => void;
  resetWorkspace: () => void;
};

const initialState = {
  workspaceId: null as number | null,
  projectName: "",
  code: "",
  layers: [] as Layer[],
  messages: [] as Message[],
  terminalOutput: "",
  isAgentRunning: false,
  isCodeRunning: false,
  activeTab: "editor" as "editor" | "terminal",
};

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  ...initialState,

  setWorkspaceId: (id) => set({ workspaceId: id }),

  setProjectName: (name) => set({ projectName: name }),

  setCode: (code) => set({ code }),

  addLayer: (layer) =>
    set((state) => ({ layers: [...state.layers, layer] })),

  removeLayer: (id) =>
    set((state) => ({ layers: state.layers.filter((l) => l.id !== id) })),

  toggleLayerVisibility: (id) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l,
      ),
    })),

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  appendToLastMessage: (text) =>
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last) {
        messages[messages.length - 1] = {
          ...last,
          content: last.content + text,
        };
      }
      return { messages };
    }),

  setTerminalOutput: (output) => set({ terminalOutput: output }),

  appendToTerminal: (text) =>
    set((state) => ({
      terminalOutput: state.terminalOutput
        ? `${state.terminalOutput}\n${text}`
        : text,
    })),

  setAgentRunning: (v) => set({ isAgentRunning: v }),

  setCodeRunning: (v) => set({ isCodeRunning: v }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  resetWorkspace: () => set(initialState),
}));
