/** Cloud TTS player using Web Audio API to play PCM16 stream from mimo TTS API. */

let audioCtx: AudioContext | null = null;
let scheduledTime = 0;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext({ sampleRate: 24000 });
    scheduledTime = 0;
  }
  return audioCtx;
}

export function stopCloudTts(): void {
  if (audioCtx && audioCtx.state !== "closed") {
    audioCtx.close();
  }
  audioCtx = null;
  scheduledTime = 0;
}

/** Convert raw Uint8Array bytes (PCM16LE) to Float32Array. */
function pcm16ToFloat32(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleCount = bytes.byteLength / 2;
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768.0;
  }
  return float32;
}

export async function playCloudTts(text: string, voice: string = "Chloe"): Promise<void> {
  const res = await fetch(`/api/tts/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`TTS 请求失败 (${res.status}): ${errText}`);
  }

  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  scheduledTime = ctx.currentTime + 0.1;
  const SAMPLE_RATE = 24000;
  const MIN_BYTES = SAMPLE_RATE; // 0.5s of PCM16 = 24000 bytes

  let byteBuf = new Uint8Array(0);

  const schedulePcm = (pcm: Float32Array) => {
    if (pcm.length === 0) return;
    const buffer = ctx.createBuffer(1, pcm.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(pcm);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(scheduledTime);
    scheduledTime += pcm.length / SAMPLE_RATE;
  };

  const flushSchedule = (force = false) => {
    const threshold = force ? 0 : MIN_BYTES;
    while (byteBuf.byteLength >= threshold) {
      const chunkSize = force ? byteBuf.byteLength : MIN_BYTES;
      const chunk = byteBuf.slice(0, chunkSize);
      byteBuf = byteBuf.slice(chunkSize);
      schedulePcm(pcm16ToFloat32(chunk));
    }
  };

  const reader = res.body!.getReader();
  let allDone = false;

  const readLoop = async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // Merge into buffer
      const merged = new Uint8Array(byteBuf.byteLength + value.byteLength);
      merged.set(byteBuf);
      merged.set(value, byteBuf.byteLength);
      byteBuf = merged;
      flushSchedule(false);
    }
    flushSchedule(true); // flush remaining
    allDone = true;
  };

  readLoop().catch(() => { allDone = true; });

  return new Promise((resolve) => {
    const check = () => {
      if (allDone && ctx.currentTime >= scheduledTime - 0.05) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

export const MIMO_VOICES = ["Chloe"];
