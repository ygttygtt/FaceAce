import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { PracticeRecordDetail } from "../types";

const VERDICT_COLOR: Record<string, string> = {
  correct: "text-green-600",
  partially_correct: "text-yellow-600",
  incorrect: "text-red-600",
};

export default function HistoryPage() {
  const { data: sessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: api.listSessions,
  });
  const { data: recordsData } = useQuery({
    queryKey: ["practiceRecords"],
    queryFn: () => api.listRecords(),
  });
  const { data: wrong } = useQuery({
    queryKey: ["wrongQuestions"],
    queryFn: api.wrongQuestions,
  });
  const { data: bookmarks } = useQuery({
    queryKey: ["bookmarks"],
    queryFn: api.listBookmarks,
  });

  const records: PracticeRecordDetail[] = recordsData?.items || [];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <h1 className="text-xl font-bold">历史记录</h1>

      {/* practice records with full grading info */}
      <section>
        <div className="text-sm font-medium text-gray-600 mb-3">刷题记录</div>
        {records.length === 0 ? (
          <div className="text-gray-400 text-sm">暂无刷题记录</div>
        ) : (
          <div className="space-y-2">
            {records.map((r) => (
              <div key={r.id} className="bg-white border rounded-lg p-3 hover:border-blue-300 transition-colors">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {r.question?.question_text || "（题目已删除）"}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      <span>{new Date(r.created_at).toLocaleString()}</span>
                      {r.grading && (
                        <span className={VERDICT_COLOR[r.grading.verdict] || ""}>
                          {r.grading.verdict} · {r.grading.score}分
                        </span>
                      )}
                    </div>
                    {r.user_answer && (
                      <div className="text-xs text-gray-400 mt-1 truncate">
                        我的答案: {r.user_answer.slice(0, 80)}{r.user_answer.length > 80 ? "..." : ""}
                      </div>
                    )}
                  </div>
                  <Link
                    to={`/practice/record/${r.id}`}
                    className="ml-3 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50 shrink-0"
                  >
                    查看详情
                  </Link>
                </div>
                {r.grading && (
                  <div className="mt-2 pt-2 border-t text-xs space-y-1">
                    {r.grading.strengths?.length > 0 && (
                      <div className="text-green-700">✓ {r.grading.strengths.slice(0, 2).join("；")}</div>
                    )}
                    {r.grading.weaknesses?.length > 0 && (
                      <div className="text-red-700">✗ {r.grading.weaknesses.slice(0, 2).join("；")}</div>
                    )}
                    {r.grading.improved_answer && (
                      <div className="text-gray-500">💡 已生成参考改进答案</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* wrong questions */}
      <section>
        <div className="text-sm font-medium text-gray-600 mb-3">错题集</div>
        {(wrong?.items || []).length === 0 ? (
          <div className="text-gray-400 text-sm">暂无错题</div>
        ) : (
          <div className="space-y-2">
            {wrong?.items.map((q) => (
              <Link
                key={q.id}
                to={`/practice`}
                className="block bg-white border rounded-lg p-3 text-sm hover:border-red-300 transition-colors"
              >
                <div className="text-gray-900 truncate">{q.question_text}</div>
                <div className="text-xs text-gray-400 mt-1">{q.question_type} · {q.difficulty}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* bookmarks summary */}
      <section>
        <div className="text-sm font-medium text-gray-600 mb-3">
          收藏题目（{bookmarks?.items?.length || 0}）
        </div>
        <Link to="/bank?bookmarked=true" className="text-sm text-blue-600 hover:underline">
          在题库中查看收藏 →
        </Link>
      </section>

      {/* simulation records */}
      <section>
        <div className="text-sm font-medium text-gray-600 mb-3">仿真面试记录</div>
        {(sessions?.items || []).length === 0 ? (
          <div className="text-gray-400 text-sm">暂无</div>
        ) : (
          <div className="space-y-2">
            {sessions?.items.map((s) => (
              <div key={s.id} className="bg-white border rounded-lg p-3 flex justify-between items-center">
                <div>
                  <div className="font-medium text-sm">{s.title}</div>
                  <div className="text-xs text-gray-400">{new Date(s.created_at).toLocaleString()}</div>
                </div>
                <div className="flex gap-2">
                  {s.status === "finished" && (
                    <Link to={`/simulation/${s.id}/report`} className="text-xs text-blue-600 hover:underline">查看报告</Link>
                  )}
                  <Link to={`/simulation/${s.id}`} className="text-xs text-gray-600 hover:underline">打开</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
