import { SSE_BASE } from "./api";

export interface SSEHandlers {
  onDelta: (text: string) => void;
  onDone?: () => void;
  onResult?: (result: any) => void;
  onError?: (msg: string) => void;
  signal?: AbortSignal;
}

/** POST to an SSE endpoint and parse `data: {...}` lines. */
export async function streamSSE(path: string, body: any, h: SSEHandlers): Promise<void> {
  const res = await fetch(`${SSE_BASE}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: h.signal,
  });
  if (!res.ok || !res.body) {
    let msg = `请求失败 (${res.status})`;
    try {
      const j = await res.json();
      msg = j.detail || msg;
    } catch {
      /* ignore */
    }
    h.onError?.(msg);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      try {
        const evt = JSON.parse(data);
        if (evt.delta) h.onDelta(evt.delta);
        if (evt.result) h.onResult?.(evt.result);
        if (evt.done) h.onDone?.();
        if (evt.error) h.onError?.(evt.error);
      } catch {
        /* ignore malformed */
      }
    }
  }
}
