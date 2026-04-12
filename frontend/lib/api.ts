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

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://127.0.0.1:8000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
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

export async function askTutor(payload: {
  question: string;
  user_id: string;
  email?: string;
  name?: string;
}): Promise<{ answer: string; chat_id: number }> {
  return request<{ answer: string; chat_id: number }>('/api/tutor', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getYoutubeVideos(
  query: string,
): Promise<{ count: number; results: YoutubeVideo[] }> {
  const search = new URLSearchParams({ query });
  return request<{ count: number; results: YoutubeVideo[] }>(
    `/api/youtube?${search.toString()}`,
  );
}

export async function getChats(userId: string): Promise<{ chats: ChatItem[] }> {
  return request<{ chats: ChatItem[] }>(
    `/api/chats/${encodeURIComponent(userId)}`,
  );
}
