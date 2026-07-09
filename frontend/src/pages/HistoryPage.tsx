import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export default function HistoryPage() {
  const { data: sessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: api.listSessions,
  });
  const { data: wrong } = useQuery({
    queryKey: ["wrongQuestions"],
    queryFn: api.wrongQuestions,
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">历史记录</h1>

      <div>
        <div className="text-sm font-medium text-gray-600 mb-2">
          仿真面试记录
        </div>
        {(sessions?.items || []).length === 0 ? (
          <div className="text-gray-400 text-sm">暂无</div>
        ) : (
          <div className="space-y-2">
            {sessions?.items.map((s) => (
              <div
                key={s.id}
                className="bg-white border rounded p-3 flex justify-between items-center"
              >
                <div>
                  <div className="font-medium text-sm">{s.title}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(s.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  {s.status === "finished" && (
                    <Link
                      to={`/simulation/${s.id}/report`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      查看报告
                    </Link>
                  )}
                  <Link
                    to={`/simulation/${s.id}`}
                    className="text-xs text-gray-600 hover:underline"
                  >
                    打开
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-sm font-medium text-gray-600 mb-2">错题集</div>
        {(wrong?.items || []).length === 0 ? (
          <div className="text-gray-400 text-sm">
            暂无错题(刷题被批改为非 correct 的题会出现在这里)
          </div>
        ) : (
          <div className="space-y-2">
            {wrong?.items.map((q) => (
              <Link
                key={q.id}
                to="/practice"
                className="block bg-white border rounded p-3 text-sm hover:border-blue-400"
              >
                <div className="text-gray-900 truncate">{q.question_text}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {q.question_type} · {q.difficulty}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
