import { ApiError } from '@/lib/http';
import { LOGIN_PATH, PUBLIC_PATHS } from '@/lib/auth/routes';

type ParsedEvent = { event: string; data: string };

// Parses a text/event-stream body into { event, data } records. Only the `event` and `data`
// fields are used; `id`, `retry` and comment lines are ignored.
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<ParsedEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseBlock(block);
        if (parsed) yield parsed;
        boundary = buffer.indexOf('\n\n');
      }
    }
    const tail = parseBlock(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function parseBlock(block: string): ParsedEvent | null {
  let event = 'message';
  const data: string[] = [];
  for (const rawLine of block.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  return data.length ? { event, data: data.join('\n') } : null;
}

// POSTs JSON to the BFF and returns the SSE body. Mirrors the axios interceptor's behaviour
// for non-stream responses: 401 redirects to sign-in, other failures throw ApiError.
export async function postSse(
  path: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(payload),
    credentials: 'same-origin',
    signal,
  });

  if (!response.ok) {
    if (response.status === 401) redirectToSignIn();
    const body = (await response.json().catch(() => null)) as {
      error?: string | { message?: string };
    } | null;
    const message =
      typeof body?.error === 'string'
        ? body.error
        : (body?.error?.message ?? `Request failed with status ${response.status}`);
    throw new ApiError(response.status, message);
  }
  if (!response.body) throw new ApiError(response.status, 'Empty response body');
  return response.body;
}

function redirectToSignIn() {
  if (typeof window === 'undefined') return;
  if (PUBLIC_PATHS.some((path) => window.location.pathname.startsWith(path))) return;
  window.location.assign(`${LOGIN_PATH}?reason=expired`);
}
