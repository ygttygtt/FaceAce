import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ttsSpeak, ttsStop, ttsAvailable } from "../lib/tts";
import { playCloudTts, stopCloudTts } from "../lib/ttsCloud";

export default function TTSButton({ text }: { text: string }) {
  const { data: userConfig } = useQuery({
    queryKey: ["userConfig"],
    queryFn: api.getUser,
  });
  const [speaking, setSpeaking] = useState(false);

  if (!userConfig?.tts_enabled) return null;

  const isCloud = userConfig.tts_cloud_provider === "mimo";

  // Hide button if local TTS not available and not using cloud
  if (!isCloud && !ttsAvailable()) return null;

  const stop = () => {
    if (isCloud) {
      stopCloudTts();
    } else {
      ttsStop();
    }
    setSpeaking(false);
  };

  const toggle = async () => {
    if (speaking) {
      stop();
      return;
    }

    if (isCloud) {
      setSpeaking(true);
      try {
        await playCloudTts(text, userConfig.tts_voice || "冰糖");
      } catch {
        // silently fail
      }
      setSpeaking(false);
    } else {
      ttsSpeak(text, {
        voice: userConfig.tts_voice,
        rate: userConfig.tts_rate,
        enabled: true,
      });
      setSpeaking(true);
      setTimeout(() => setSpeaking(false), Math.max(2000, text.length * 120));
    }
  };

  return (
    <button
      onClick={toggle}
      className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
    >
      {speaking ? "停止朗读" : "朗读"}
    </button>
  );
}
