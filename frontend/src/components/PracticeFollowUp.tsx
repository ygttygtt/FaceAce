import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import MarkdownView from "./MarkdownView";

export default function PracticeFollowUp({ recordId }: { recordId: string }) {
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const queryKey = ["practiceFollowUps", recordId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.listPracticeFollowUps(recordId),
    enabled: !!recordId,
  });
  const send = useMutation({
    mutationFn: (content: string) => api.createPracticeFollowUp(recordId, content),
    onSuccess: () => {
      setMessage("");
      qc.invalidateQueries({ queryKey });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const content = message.trim();
    if (content && !send.isPending) send.mutate(content);
  };

  return (
    <details
      className="rounded-lg border bg-white p-3"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer select-none text-sm font-medium text-blue-700">
        继续追问 AI
        <span className="ml-2 text-xs font-normal text-gray-400">
          {data?.items?.length ? `${data.items.length} 条消息` : "围绕本题和本次回答展开"}
        </span>
      </summary>
      <div className="mt-3 space-y-3">
        {isLoading && <div className="text-xs text-gray-400">正在读取对话...</div>}
        {data?.items?.map((item) => (
          <div key={item.id} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${
              item.role === "user" ? "bg-blue-600 text-white" : "border bg-gray-50"
            }`}>
              <div className="mb-1 text-[11px] opacity-70">{item.role === "user" ? "我" : "AI 助教"}</div>
              <MarkdownView>{item.content}</MarkdownView>
            </div>
          </div>
        ))}
        <form onSubmit={submit} className="space-y-2">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={2}
            disabled={send.isPending}
            placeholder="哪里没听懂？可以让 AI 换个角度解释、举例或继续追问……"
            className="w-full resize-y rounded-lg border p-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-400">对话会保存在这次作答记录中</span>
            <button
              type="submit"
              disabled={!message.trim() || send.isPending}
              className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {send.isPending ? "思考中..." : "发送追问"}
            </button>
          </div>
          {send.error && <div className="text-xs text-red-600">{(send.error as Error).message}</div>}
        </form>
      </div>
    </details>
  );
}
