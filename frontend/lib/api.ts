export type Dataset = {
  id: string;
  name: string;
  description: string;
  source: string;
  category: string;
  download_url: string;
};

export type YoutubeVideo = {
  title: string;
  thumbnail: string | null;
  video_url: string;
  channel: string;
};

export type ChatItem = {
  id: number;
  question: string;
  answer: string;
  created_at: string;
};

export type SessionItem = {
  id: number;
  title: string;
  created_at: string;
};

export type SessionMessage = {
  id: number;
  question: string;
  answer: string;
};

export type TutorStreamEvent =
  | { type: "chunk"; text: string }
  | { type: "done"; chat_id: number }
  | { type: "error"; message: string };

export type Layer = {
  id: number;
  name: string;
  source: string;
  layer_type: string;
  visible: boolean;
  style: object | null;
  metadata: object | null;
};

export type WorkspaceData = {
  id: number;
  project_id: number;
  code: string | null;
  map_state: object | null;
  layers: Layer[];
  updated_at: string;
};

export type Project = {
  id: number;
  name: string;
  workspace_id: number;
  created_at: string;
};

export type AgentStreamEvent =
  | { type: "chunk"; text: string }
  | { type: "running_code"; code: string }
  | {
      type: "execution_result";
      stdout: string;
      stderr: string;
      exit_code: number;
      duration_ms: number;
      output_files: string[];
    }
  | { type: "done" }
  | { type: "error"; message: string };

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

async function request<T>(
  path: string,
  init?: RequestInit,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        errorMessage = payload.detail;
      }
    } catch {
      // Ignore JSON parsing errors and return generic message.
    }
    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}

export async function getDatasets(params?: {
  query?: string;
  category?: string;
}): Promise<{ count: number; datasets: Dataset[] }> {
  const search = new URLSearchParams();
  if (params?.query) {
    search.set("query", params.query);
  }
  if (params?.category && params.category !== "all") {
    search.set("category", params.category);
  }

  const suffix = search.toString() ? `?${search.toString()}` : "";
  return request<{ count: number; datasets: Dataset[] }>(
    `/api/datasets${suffix}`,
  );
}

export async function askTutor(
  payload: {
    question: string;
    session_id?: number;
  },
  token?: string,
): Promise<{ answer: string; chat_id: number }> {
  return request<{ answer: string; chat_id: number }>(
    "/api/tutor",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function askTutorStream(
  payload: {
    question: string;
    session_id?: number;
  },
  token: string,
  onEvent: (event: TutorStreamEvent) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/tutor/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const data = (await response.json()) as { detail?: string };
      if (data.detail) {
        errorMessage = data.detail;
      }
    } catch {
      // Ignore JSON parsing errors and use the generic fallback.
    }
    throw new Error(errorMessage);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming is not supported by this browser.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  const processEventBlock = (block: string) => {
    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());

    if (!dataLines.length) {
      return;
    }

    const payloadText = dataLines.join("\n");
    const event = JSON.parse(payloadText) as TutorStreamEvent;
    onEvent(event);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex !== -1) {
      const block = buffer.slice(0, boundaryIndex).trim();
      buffer = buffer.slice(boundaryIndex + 2);

      if (block) {
        processEventBlock(block);
      }

      boundaryIndex = buffer.indexOf("\n\n");
    }
  }

  const trailing = buffer.trim();
  if (trailing) {
    processEventBlock(trailing);
  }
}

export async function getYoutubeVideos(
  query: string,
  token?: string,
): Promise<{ count: number; results: YoutubeVideo[] }> {
  const search = new URLSearchParams({ query });
  return request<{ count: number; results: YoutubeVideo[] }>(
    `/api/youtube?${search.toString()}`,
    undefined,
    token,
  );
}

export async function getChats(token?: string): Promise<{ chats: ChatItem[] }> {
  return request<{ chats: ChatItem[] }>("/api/chats", undefined, token);
}

export async function createSession(
  payload: {
    title: string;
  },
  token?: string,
): Promise<{ session_id: number; title: string }> {
  return request<{ session_id: number; title: string }>(
    "/api/sessions",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function getSessions(
  token?: string,
): Promise<{ sessions: SessionItem[] }> {
  return request<{ sessions: SessionItem[] }>(
    "/api/sessions",
    undefined,
    token,
  );
}

export async function deleteSession(
  sessionId: number,
  token?: string,
): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(
    `/api/sessions/${sessionId}`,
    {
      method: "DELETE",
    },
    token,
  );
}

export async function getSessionMessages(
  sessionId: number,
  token?: string,
): Promise<{ messages: SessionMessage[] }> {
  return request<{ messages: SessionMessage[] }>(
    `/api/sessions/${sessionId}/messages`,
    undefined,
    token,
  );
}

export async function createProject(
  payload: { name: string; description?: string },
  token: string,
): Promise<{ id: number; name: string; workspace_id: number; created_at: string }> {
  return request("/api/workspace/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  }, token);
}

export async function getProjects(
  token: string,
): Promise<{ projects: Project[] }> {
  return request("/api/workspace/projects", undefined, token);
}

export async function getWorkspace(
  workspaceId: number,
  token: string,
): Promise<WorkspaceData> {
  return request(`/api/workspace/workspaces/${workspaceId}`, undefined, token);
}

export async function updateWorkspace(
  workspaceId: number,
  payload: { code?: string; map_state?: object },
  token: string,
): Promise<WorkspaceData> {
  return request(`/api/workspace/workspaces/${workspaceId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, token);
}

export async function addLayer(
  workspaceId: number,
  payload: {
    name: string;
    source: string;
    layer_type: string;
    metadata?: object;
    file_url?: string;
    style?: object;
  },
  token: string,
): Promise<Layer> {
  return request(`/api/workspace/workspaces/${workspaceId}/layers`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, token);
}

export async function removeLayer(
  workspaceId: number,
  layerId: number,
  token: string,
): Promise<{ deleted: boolean }> {
  return request(`/api/workspace/workspaces/${workspaceId}/layers/${layerId}`, {
    method: "DELETE",
  }, token);
}

export async function runAgentStream(
  payload: { workspace_id: number; message: string; auto_run?: boolean },
  token: string,
  onEvent: (event: AgentStreamEvent) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/agent/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const data = (await response.json()) as { detail?: string };
      if (data.detail) {
        errorMessage = data.detail;
      }
    } catch {
      // Ignore JSON parsing errors and use the generic fallback.
    }
    throw new Error(errorMessage);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming is not supported by this browser.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  const processEventBlock = (block: string) => {
    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());

    if (!dataLines.length) {
      return;
    }

    const payloadText = dataLines.join("\n");
    const event = JSON.parse(payloadText) as AgentStreamEvent;
    onEvent(event);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex !== -1) {
      const block = buffer.slice(0, boundaryIndex).trim();
      buffer = buffer.slice(boundaryIndex + 2);

      if (block) {
        processEventBlock(block);
      }

      boundaryIndex = buffer.indexOf("\n\n");
    }
  }

  const trailing = buffer.trim();
  if (trailing) {
    processEventBlock(trailing);
  }
}

export async function runCode(
  payload: { workspace_id: number; code: string; timeout?: number },
  token: string,
): Promise<{
  execution_id: number;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  output_files: string[];
}> {
  return request("/api/code/run", {
    method: "POST",
    body: JSON.stringify(payload),
  }, token);
}
