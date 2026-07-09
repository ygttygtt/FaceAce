import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ttsSpeak, ttsStop, ttsAvailable } from "../lib/tts";

export default function TTSButton({ text }: { text: string }) {
  const { data: userConfig } = useQuery({
    queryKey: ["userConfig"],
    queryFn: api.getUser,
  });
  const [speaking, setSpeaking] = useState(false);

  if (!userConfig?.tts_enabled || !ttsAvailable()) return null;

  const toggle = () => {
    if (speaking) {
      ttsStop();
      setSpeaking(false);
    } else {
      ttsSpeak(text, {
        voice: userConfig.tts_voice,
        rate: userConfig.tts_rate,
        enabled: true,
      });
      setSpeaking(true);
      // best-effort: reset flag after a delay
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
