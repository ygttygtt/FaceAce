import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export default function AttemptHistory({
  questionId,
  currentRecordId,
  defaultOpen = false,
}: {
  questionId: string;
  currentRecordId?: string | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { data, isLoading } = useQuery({
    queryKey: ["questionAttempts", questionId],
    queryFn: () => api.listRecords(questionId, 200),
    enabled: !!questionId,
  });
  const attempts = data?.items || [];
  const newestScore = attempts[0]?.grading?.score;
  const previousScore = attempts[1]?.grading?.score;
  const scoreChange = newestScore != null && previousScore != null ? newestScore - previousScore : null;

  return (
    <details
      className="rounded-lg border bg-white p-3"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer select-none text-sm font-medium text-gray-700">
        历次作答对比
        <span className="ml-2 text-xs font-normal text-gray-400">
          {isLoading ? "加载中..." : `${attempts.length} 次记录`}
        </span>
        {scoreChange !== null && (
          <span className={`ml-2 text-xs ${scoreChange >= 0 ? "text-green-700" : "text-red-600"}`}>
            较上次 {scoreChange >= 0 ? "+" : ""}{scoreChange} 分
          </span>
        )}
      </summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {attempts.length === 0 && <div className="text-xs text-gray-400">暂无历史作答</div>}
        {attempts.map((attempt, index) => (
          <div
            key={attempt.id}
            className={`rounded-lg border p-3 text-sm ${attempt.id === currentRecordId ? "border-blue-300 bg-blue-50" : "bg-gray-50"}`}
          >
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-gray-500">
              <span>{index === 0 ? "最近一次" : `第 ${attempts.length - index} 次`} · {new Date(attempt.created_at).toLocaleString()}</span>
              {attempt.grading && <span className="shrink-0 font-bold text-gray-900">{attempt.grading.score} 分</span>}
            </div>
            <div className="line-clamp-4 whitespace-pre-wrap text-gray-700">{attempt.user_answer || "（未作答）"}</div>
            <Link to={`/practice/record/${attempt.id}`} className="mt-2 inline-block text-xs text-blue-600 hover:underline">
              查看完整批改
            </Link>
          </div>
        ))}
      </div>
    </details>
  );
}
