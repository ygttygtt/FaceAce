/** Cloud TTS player using Web Audio API to play PCM16 stream from mimo TTS API. */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext({ sampleRate: 24000 });
  }
  return audioCtx;
}

export function stopCloudTts(): void {
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
}

/**
 * Fetch PCM16 stream from backend and play it via Web Audio API.
 * Returns a promise that resolves when playback finishes.
 */
export async function playCloudTts(text: string, voice: string = "Chloe"): Promise<void> {
  const BASE = (await import("../lib/api")).SSE_BASE;

  const res = await fetch(`${BASE}/api/tts/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });

  if (!res.ok) {
    throw new Error(`TTS 请求失败 (${res.status})`);
  }

  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const reader = res.body!.getReader();
  const chunks: Float32Array[] = [];
  let totalLength = 0;

  // Read all PCM16 data
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // value is Uint8Array of PCM16LE bytes
    const int16 = new Int16Array(value.buffer, value.byteOffset, value.byteLength / 2);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    chunks.push(float32);
    totalLength += float32.length;
  }

  if (totalLength === 0) return;

  // Combine into single buffer
  const pcm = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    pcm.set(chunk, offset);
    offset += chunk.length;
  }

  // Create AudioBuffer and play
  const buffer = ctx.createBuffer(1, pcm.length, 24000);
  buffer.getChannelData(0).set(pcm);

  return new Promise((resolve) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => resolve();
    source.start();
  });
}

/** List available voices from mimo TTS (hardcoded for now). */
export const MIMO_VOICES = [
  "Chloe", "Alloy", "Echo", "Fable", "Onyx", "Nova", "Shimmer",
];
