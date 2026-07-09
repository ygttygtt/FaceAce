/** Browser Web Speech API TTS wrapper with long-text chunking. */

export function ttsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function getVoices(): SpeechSynthesisVoice[] {
  if (!ttsAvailable()) return [];
  return window.speechSynthesis.getVoices();
}

export function ttsStop(): void {
  if (ttsAvailable()) window.speechSynthesis.cancel();
}

function splitText(text: string, max = 200): string[] {
  const sentences = text.split(/(?<=[。！？!?\.])/);
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + s).length > max) {
      if (buf) out.push(buf);
      buf = s;
    } else {
      buf += s;
    }
  }
  if (buf) out.push(buf);
  return out;
}

export function ttsSpeak(
  text: string,
  opts?: { voice?: string; rate?: number; enabled?: boolean }
): void {
  if (!opts?.enabled) return;
  if (!ttsAvailable()) return;
  window.speechSynthesis.cancel();
  const chunks = splitText(text);
  const voices = window.speechSynthesis.getVoices();
  let i = 0;
  const speakNext = () => {
    if (i >= chunks.length) return;
    const u = new SpeechSynthesisUtterance(chunks[i]);
    u.lang = "zh-CN";
    u.rate = opts.rate ?? 1.0;
    if (opts.voice) {
      const v = voices.find((v) => v.voiceURI === opts.voice);
      if (v) u.voice = v;
    }
    u.onend = () => {
      i += 1;
      speakNext();
    };
    window.speechSynthesis.speak(u);
  };
  speakNext();
}
