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

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://127.0.0.1:8000';

async function request<T>(
  path: string,
  init?: RequestInit,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
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
    search.set('query', params.query);
  }
  if (params?.category && params.category !== 'all') {
    search.set('category', params.category);
  }

  const suffix = search.toString() ? `?${search.toString()}` : '';
  return request<{ count: number; datasets: Dataset[] }>(
    `/api/datasets${suffix}`,
  );
}

export async function askTutor(
  payload: {
    question: string;
    user_id: string;
    email?: string;
    name?: string;
    session_id?: number;
  },
  token?: string,
): Promise<{ answer: string; chat_id: number }> {
  return request<{ answer: string; chat_id: number }>(
    '/api/tutor',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
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

export async function getChats(userId: string): Promise<{ chats: ChatItem[] }> {
  return request<{ chats: ChatItem[] }>(
    `/api/chats/${encodeURIComponent(userId)}`,
  );
}

export async function createSession(
  payload: {
    user_id: string;
    title: string;
    email?: string;
    name?: string;
  },
  token?: string,
): Promise<{ session_id: number; title: string }> {
  return request<{ session_id: number; title: string }>(
    '/api/sessions',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function getSessions(
  userId: string,
  token?: string,
): Promise<{ sessions: SessionItem[] }> {
  return request<{ sessions: SessionItem[] }>(
    `/api/sessions/${encodeURIComponent(userId)}`,
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
      method: 'DELETE',
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
