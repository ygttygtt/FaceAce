import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { PracticeRecordDetail } from "../types";

const VERDICT_COLOR: Record<string, string> = {
  correct: "text-green-600",
  partially_correct: "text-yellow-600",
  incorrect: "text-red-600",
};

type Tab = "records" | "wrong" | "bookmarks" | "simulations";

export default function HistoryPage() {
  const [tab, setTab] = useState<Tab>("records");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

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

  const deleteRecord = useMutation({
    mutationFn: (id: string) => api.deleteRecord(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["practiceRecords"] }),
  });
  const batchDeleteRecords = useMutation({
    mutationFn: (ids: string[]) => api.batchDeleteRecords(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["practiceRecords"] });
      setSelected(new Set());
    },
  });

  const toggle = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const toggleAll = () => {
    if (selected.size === records.length) setSelected(new Set());
    else setSelected(new Set(records.map((r) => r.id)));
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "records", label: "刷题记录", count: records.length },
    { key: "wrong", label: "错题集", count: wrong?.items?.length || 0 },
    { key: "bookmarks", label: "收藏题目", count: bookmarks?.items?.length || 0 },
    { key: "simulations", label: "仿真面试", count: sessions?.items?.length || 0 },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold mb-4">历史记录</h1>

      {/* tab bar */}
      <div className="flex gap-1 mb-4 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSelected(new Set()); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* tab content */}
      {tab === "records" && (
        <div>
          {/* batch action bar */}
          {records.length > 0 && (
            <div className="flex items-center gap-3 mb-3 px-1">
              <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === records.length}
                  onChange={toggleAll}
                />
                {selected.size > 0 ? `已选 ${selected.size}` : "全选"}
              </label>
              {selected.size > 0 && (
                <button
                  onClick={() => {
                    if (confirm(`删除选中的 ${selected.size} 条记录？`))
                      batchDeleteRecords.mutate(Array.from(selected));
                  }}
                  className="text-sm text-red-600 hover:underline"
                >
                  批量删除（{selected.size}）
                </button>
              )}
            </div>
          )}
          <div className="space-y-2">
            {records.length === 0 ? (
              <div className="text-gray-400 text-sm py-8 text-center">暂无刷题记录</div>
            ) : (
              records.map((r) => {
                const qText = r.question?.question_text || (r as any).question_text || "（题目已删除）";
                return (
                  <div key={r.id} className="bg-white border rounded-lg p-3 hover:border-blue-300 transition-colors group flex gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="mt-1 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <div className="text-sm font-medium truncate flex-1">{qText}</div>
                        <div className="flex items-center gap-2 ml-3 shrink-0">
                          <Link
                            to={`/practice/record/${r.id}`}
                            className="px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
                          >
                            详情
                          </Link>
                          <button
                            onClick={() => {
                              if (confirm("删除此条记录？")) deleteRecord.mutate(r.id);
                            }}
                            className="px-2 py-1 text-xs text-red-400 border border-red-200 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            删除
                          </button>
                        </div>
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
                      {r.grading && (
                        <div className="mt-1 pt-1 border-t text-xs space-y-0.5">
                          {r.grading.strengths?.length > 0 && (
                            <div className="text-green-700">✓ {r.grading.strengths.slice(0, 2).join("；")}</div>
                          )}
                          {r.grading.weaknesses?.length > 0 && (
                            <div className="text-red-700">✗ {r.grading.weaknesses.slice(0, 2).join("；")}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {tab === "wrong" && (
        <div className="space-y-2">
          {(wrong?.items || []).length === 0 ? (
            <div className="text-gray-400 text-sm py-8 text-center">暂无错题</div>
          ) : (
            wrong?.items.map((q) => (
              <Link
                key={q.id}
                to="/practice"
                className="block bg-white border rounded-lg p-3 text-sm hover:border-red-300 transition-colors"
              >
                <div className="text-gray-900 truncate">{q.question_text}</div>
                <div className="text-xs text-gray-400 mt-1">{q.question_type} · {q.difficulty}</div>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === "bookmarks" && (
        <div>
          {(bookmarks?.items || []).length === 0 ? (
            <div className="text-gray-400 text-sm py-8 text-center">暂无收藏</div>
          ) : (
            <div className="space-y-2">
              {bookmarks?.items.map((b) => (
                <div key={b.id} className="bg-white border rounded-lg p-3 text-sm">
                  <div className="text-xs text-gray-400">题目 ID: {b.question_id}</div>
                  <div className="text-xs text-gray-400 mt-0.5">收藏于 {new Date(b.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
          <Link to="/bank?bookmarked=true" className="text-sm text-blue-600 hover:underline mt-4 inline-block">
            在题库中查看收藏 →
          </Link>
        </div>
      )}

      {tab === "simulations" && (
        <div className="space-y-2">
          {(sessions?.items || []).length === 0 ? (
            <div className="text-gray-400 text-sm py-8 text-center">暂无仿真面试记录</div>
          ) : (
            sessions?.items.map((s) => (
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
            ))
          )}
        </div>
      )}
    </div>
  );
}
