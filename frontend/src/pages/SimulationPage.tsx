import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { streamSSE } from "../lib/sse";
import { ttsSpeak } from "../lib/tts";
import ChatBubble from "../components/ChatBubble";
import TTSButton from "../components/TTSButton";
import { useUIStore } from "../store/useConfigStore";
import type { SimulationMessage } from "../types";

export default function SimulationPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { ttsAutoPlay, setTtsAutoPlay } = useUIStore();
  const { data: userConfig } = useQuery({
    queryKey: ["userConfig"],
    queryFn: api.getUser,
  });
  const { data: session } = useQuery({
    queryKey: ["session", id],
    queryFn: () => api.getSession(id!),
    enabled: !!id,
  });

  const [messages, setMessages] = useState<SimulationMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [finishing, setFinishing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const openingTried = useRef(false);

  useEffect(() => {
    if (session) setMessages(session.messages);
  }, [session]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, streamingText]);

  // Auto-generate opening line for a fresh session.
  useEffect(() => {
    if (session && session.messages.length === 0 && !streaming && !openingTried.current) {
      openingTried.current = true;
      doOpening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const speakLast = (msgs: SimulationMessage[]) => {
    if (!ttsAutoPlay || !userConfig?.tts_enabled || msgs.length === 0) return;
    const last = msgs[msgs.length - 1];
    if (last.role === "interviewer") {
      ttsSpeak(last.content, {
        voice: userConfig.tts_voice,
        rate: userConfig.tts_rate,
        enabled: true,
      });
    }
  };

  const doOpening = async () => {
    setStreaming(true);
    setStreamingText("");
    await streamSSE(`/simulation/sessions/${id}/opening`, {}, {
      onDelta: (d) => setStreamingText((t) => t + d),
      onDone: async () => {
        const s = await api.getSession(id!);
        setMessages(s.messages);
        setStreamingText("");
        setStreaming(false);
        speakLast(s.messages);
      },
      onError: (m) => {
        alert(m);
        setStreaming(false);
        setStreamingText("");
      },
    });
  };

  const send = async () => {
    if (!input.trim() || streaming) return;
    const content = input;
    setMessages((m) => [
      ...m,
      {
        id: "tmp_c",
        session_id: id!,
        role: "candidate",
        content,
        seq: 0,
        tts_played: false,
        created_at: "",
      },
    ]);
    setInput("");
    setStreaming(true);
    setStreamingText("");
    await streamSSE(`/simulation/sessions/${id}/messages`, { content }, {
      onDelta: (d) => setStreamingText((t) => t + d),
      onDone: async () => {
        const s = await api.getSession(id!);
        setMessages(s.messages);
        setStreamingText("");
        setStreaming(false);
        speakLast(s.messages);
      },
      onError: (m) => {
        alert(m);
        setStreaming(false);
        setStreamingText("");
      },
    });
  };

  const finish = async () => {
    setFinishing(true);
    try {
      await api.finishSession(id!);
      nav(`/simulation/${id}/report`);
    } catch (e: any) {
      alert(e.message);
    }
    setFinishing(false);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-3 border-b bg-white flex justify-between items-center">
        <div className="font-medium">{session?.title}</div>
        <div className="flex gap-3 items-center">
          <label className="text-xs flex items-center gap-1 text-gray-600">
            <input
              type="checkbox"
              checked={ttsAutoPlay}
              onChange={(e) => setTtsAutoPlay(e.target.checked)}
              disabled={!userConfig?.tts_enabled}
            />
            自动朗读
          </label>
          {session?.status === "active" && (
            <button
              onClick={finish}
              disabled={finishing || messages.length < 2}
              className="px-3 py-1 bg-red-600 text-white rounded text-sm disabled:opacity-50"
            >
              {finishing ? "生成报告中..." : "结束并生成报告"}
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto p-6 space-y-3 max-w-3xl mx-auto w-full"
      >
        {messages.map((m) => (
          <div key={m.id}>
            <ChatBubble role={m.role} content={m.content} />
            {m.role === "interviewer" && (
              <div className="flex justify-start mt-1">
                <TTSButton text={m.content} />
              </div>
            )}
          </div>
        ))}
        {streaming && (
          <ChatBubble role="interviewer" content={streamingText || "思考中..."} />
        )}
      </div>

      <div className="border-t bg-white p-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="输入回答(Enter 发送,Shift+Enter 换行)"
            className="flex-1 border rounded p-2 text-sm"
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            className="px-4 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
          >
            {streaming ? "回复中..." : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
