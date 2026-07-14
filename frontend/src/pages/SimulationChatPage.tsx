import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { streamSSE } from "../lib/sse";
import { ttsSpeak, ttsStop } from "../lib/tts";
import { playCloudTts, stopCloudTts } from "../lib/ttsCloud";
import ChatBubble from "../components/ChatBubble";
import TTSButton from "../components/TTSButton";
import { useUIStore } from "../store/useConfigStore";
import type { SimulationMessage } from "../types";

export default function SimulationChatPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { ttsAutoPlay, setTtsAutoPlay } = useUIStore();
  const { data: userConfig } = useQuery({
    queryKey: ["userConfig"],
    queryFn: api.getUser,
  });
  const { data: session, refetch: refetchSession } = useQuery({
    queryKey: ["session", id],
    queryFn: () => api.getSession(id!),
    enabled: !!id,
  });

  const [messages, setMessages] = useState<SimulationMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [streamError, setStreamError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const openingTried = useRef(false);

  useEffect(() => {
    if (session) setMessages(session.messages);
  }, [session]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, streamingText]);

  useEffect(() => () => {
    ttsStop();
    stopCloudTts();
  }, []);

  // Auto-generate opening line for a fresh session.
  useEffect(() => {
    if (session && session.messages.length === 0 && !streaming && !openingTried.current) {
      openingTried.current = true;
      doOpening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const speakLast = (msgs: SimulationMessage[]) => {
    if (!ttsAutoPlay || msgs.length === 0) return;
    const last = msgs[msgs.length - 1];
    if (last.role === "interviewer") {
      if (userConfig?.tts_cloud_provider === "mimo") {
        playCloudTts(last.content, userConfig?.tts_voice || "冰糖").catch(() => {});
      } else {
        ttsSpeak(last.content, {
          voice: userConfig?.tts_voice || "",
          rate: userConfig?.tts_rate || 1,
          enabled: true,
        });
      }
    }
  };

  const doOpening = async () => {
    setStreaming(true);
    setStreamingText("");
    setStreamError("");
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
        setStreamError(m);
        setStreaming(false);
        setStreamingText("");
      },
    });
  };

  const send = async () => {
    if (!input.trim() || streaming || session?.status !== "active") return;
    ttsStop();
    stopCloudTts();
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
    setStreamError("");
    await streamSSE(`/simulation/sessions/${id}/messages`, { content }, {
      onDelta: (d) => setStreamingText((t) => t + d),
      onDone: async () => {
        const s = await api.getSession(id!);
        setMessages(s.messages);
        setStreamingText("");
        setStreaming(false);
        speakLast(s.messages);
      },
      onError: async (m) => {
        setStreamError(m);
        setStreaming(false);
        setStreamingText("");
        const refreshed = await refetchSession();
        if (refreshed.data) setMessages(refreshed.data.messages);
      },
    });
  };

  const retryInterviewer = async () => {
    if (streaming || session?.status !== "active") return;
    setStreaming(true);
    setStreamingText("");
    setStreamError("");
    const isOpening = messages.length === 0;
    await streamSSE(
      isOpening ? `/simulation/sessions/${id}/opening` : `/simulation/sessions/${id}/retry`,
      {},
      {
        onDelta: (d) => setStreamingText((t) => t + d),
        onDone: async () => {
          const s = await api.getSession(id!);
          setMessages(s.messages);
          setStreamingText("");
          setStreaming(false);
          speakLast(s.messages);
        },
        onError: (m) => {
          setStreamError(m);
          setStreaming(false);
          setStreamingText("");
        },
      }
    );
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
      <div className="px-4 sm:px-6 py-3 border-b bg-white flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => nav("/simulation")}
            className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
          >
            ← 退出
          </button>
          <span className="font-medium truncate">{session?.title}</span>
        </div>
        <div className="flex gap-3 items-center">
          <label className="text-xs flex items-center gap-1 text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={ttsAutoPlay}
              onChange={(e) => setTtsAutoPlay(e.target.checked)}
            />
            自动朗读
          </label>
          {session?.status === "active" && (
            <button
              onClick={finish}
              disabled={finishing || streaming || messages.length < 2}
              className="px-3 py-1 bg-red-600 text-white rounded text-sm disabled:opacity-50"
            >
              {finishing ? "生成报告中..." : "结束并生成报告"}
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto p-4 sm:p-6 space-y-3 max-w-3xl mx-auto w-full"
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
        {streamError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <div>面试官回复失败：{streamError}</div>
            {session?.status === "active" && (
              <button
                onClick={retryInterviewer}
                disabled={streaming}
                className="mt-2 rounded border border-red-300 bg-white px-3 py-1 text-xs hover:bg-red-100 disabled:opacity-50"
              >
                重新生成面试官回复
              </button>
            )}
          </div>
        )}
      </div>

      <div className="border-t bg-white p-4">
        {session?.status !== "active" && (
          <div className="max-w-3xl mx-auto mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
            本场面试已结束，对话已进入只读状态。可前往报告页查看反馈。
          </div>
        )}
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row gap-2">
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
            disabled={session?.status !== "active" || streaming}
            placeholder={session?.status === "active" ? "输入回答（Enter 发送，Shift+Enter 换行）" : "面试已结束"}
            className="flex-1 border rounded p-2 text-sm"
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim() || session?.status !== "active"}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
          >
            {streaming ? "回复中..." : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
