import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import MarkdownView from "../components/MarkdownView";
import type { PracticeRecordDetail, Question } from "../types";

const VERDICT_COLOR: Record<string, string> = {
  correct: "text-green-600",
  partially_correct: "text-yellow-600",
  incorrect: "text-red-600",
};

type Tab = "records" | "wrong" | "bookmarks" | "simulations";

export default function HistoryPage() {
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "records";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bookmarkDetail, setBookmarkDetail] = useState<Question | null>(null);
  const [wrongDetail, setWrongDetail] = useState<Question | null>(null);
  const [wrongThreshold, setWrongThreshold] = useState(50);
  const qc = useQueryClient();

  const { data: sessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: api.listSessions,
  });
  const { data: recordsData } = useQuery({
    queryKey: ["practiceRecords"],
    queryFn: () => api.listRecords(undefined, 500),
  });
  const { data: wrong } = useQuery({
    queryKey: ["lowScoreQuestions", wrongThreshold],
    queryFn: () => api.lowScoreQuestions(wrongThreshold),
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
  const deleteSession = useMutation({
    mutationFn: (id: string) => api.deleteSession(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
  const deleteBookmark = useMutation({
    mutationFn: (id: string) => api.deleteBookmark(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
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
    { key: "wrong", label: "低分错题", count: wrong?.items?.length || 0 },
    { key: "bookmarks", label: "收藏题目", count: bookmarks?.items?.length || 0 },
    { key: "simulations", label: "仿真面试", count: sessions?.items?.length || 0 },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold mb-4">历史记录</h1>

      {/* tab bar */}
      <div className="flex gap-1 mb-4 border-b overflow-x-auto">
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
                        {r.revealed && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">看答案后提交</span>
                        )}
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
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <div>
              <div className="font-medium text-amber-800">低分错题</div>
              <div className="text-xs text-amber-700">按每题最近一次批改筛选，答好后自动移出，历史作答不会删除。</div>
            </div>
            <label className="shrink-0 text-xs text-amber-800">
              最近得分不高于
              <input
                type="number"
                min={0}
                max={100}
                value={wrongThreshold}
                onChange={(event) => setWrongThreshold(Math.max(0, Math.min(100, Number(event.target.value))))}
                className="ml-2 w-16 rounded border px-2 py-1 text-center"
              />
            </label>
          </div>
          {(wrong?.items || []).length === 0 ? (
            <div className="text-gray-400 text-sm py-8 text-center">暂无最近得分不高于 {wrongThreshold} 分的题目</div>
          ) : (
            wrong?.items.map((q) => (
              <div
                key={q.id}
                onClick={() => setWrongDetail(q)}
                className="bg-white border rounded-lg p-3 text-sm hover:border-red-300 transition-colors cursor-pointer"
              >
                <div className="text-gray-900 truncate">{q.question_text}</div>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                  <span>{q.question_type}</span>
                  <span>{q.difficulty}</span>
                  {q.tags?.slice(0, 3).map((t) => <span key={t} className="text-blue-600">#{t}</span>)}
                </div>
              </div>
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
              {bookmarks?.items.map((b) => {
                const q = (b as any).question;
                const deleted = !q;
                return (
                  <div
                    key={b.id}
                    className={`bg-white border rounded-lg p-3 text-sm group ${
                      deleted ? "border-red-200" : "hover:border-yellow-300 cursor-pointer"
                    } ${q ? "cursor-pointer" : ""}`}
                    onClick={() => q && setBookmarkDetail(q)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {q?.question_text || `题目 ${b.question_id.slice(0, 8)}…（已删除）`}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                          {q?.difficulty && <span>{q.difficulty}</span>}
                          {q?.question_type && <span>{q.question_type}</span>}
                          {q?.tags?.slice(0, 3).map((t: string) => (
                            <span key={t} className="text-blue-600">#{t}</span>
                          ))}
                          <span className="text-gray-400">收藏于 {new Date(b.created_at).toLocaleString()}</span>
                          {deleted && <span className="text-red-400">失效</span>}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(deleted ? "删除这条已失效的收藏记录？" : "取消收藏该题？")) {
                            deleteBookmark.mutate(b.id);
                          }
                        }}
                        className="text-xs text-red-500 hover:text-red-700 hover:underline opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "simulations" && (
        <div className="space-y-2">
          {(sessions?.items || []).length === 0 ? (
            <div className="text-gray-400 text-sm py-8 text-center">暂无仿真面试记录</div>
          ) : (
            sessions?.items.map((s) => (
              <div key={s.id} className="bg-white border rounded-lg p-3 flex justify-between items-center group">
                <div>
                  <div className="font-medium text-sm">{s.title}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(s.created_at).toLocaleString()} · {s.status === "finished" ? "已结束" : "进行中"}
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  {s.status === "finished" && (
                    <Link to={`/simulation/${s.id}/report`} className="text-xs text-blue-600 hover:underline">查看报告</Link>
                  )}
                  <Link to={`/simulation/${s.id}`} className="text-xs text-gray-600 hover:underline">打开</Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      if (confirm(`删除「${s.title}」及其所有对话记录和报告？此操作不可撤销。`)) {
                        deleteSession.mutate(s.id);
                      }
                    }}
                    className="text-xs text-red-500 hover:text-red-700 hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* question detail modal (for bookmarks) */}
      {bookmarkDetail && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-6 z-50"
          onClick={() => setBookmarkDetail(null)}
        >
          <div
            className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-3">
              <h2 className="font-bold">题目详情</h2>
              <button onClick={() => setBookmarkDetail(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>
            <div className="text-gray-900 mb-3 whitespace-pre-wrap">{bookmarkDetail.question_text}</div>
            {(bookmarkDetail.user_answer_override ?? bookmarkDetail.standard_answer) && (
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1">标准答案</div>
                <MarkdownView>{bookmarkDetail.user_answer_override ?? bookmarkDetail.standard_answer ?? ""}</MarkdownView>
              </div>
            )}
            {bookmarkDetail.explanation && (
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1">解析</div>
                <MarkdownView>{bookmarkDetail.explanation}</MarkdownView>
              </div>
            )}
            {bookmarkDetail.answer_points?.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1">评分要点</div>
                <ul className="list-disc pl-5 text-sm">
                  {bookmarkDetail.answer_points.map((p, i) => (<li key={i}>{p}</li>))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* wrong question detail modal */}
      {wrongDetail && (
        <WrongQuestionDetail
          question={wrongDetail}
          onClose={() => setWrongDetail(null)}
        />
      )}
    </div>
  );
}

function WrongQuestionDetail({ question, onClose }: { question: Question; onClose: () => void }) {
  const { data: records } = useQuery({
    queryKey: ["wrongRecords", question.id],
    queryFn: () => api.listRecords(question.id, 200),
  });
  const items = records?.items || [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-3">
          <h2 className="font-bold">错题详情</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
        </div>
        <div className="text-gray-900 mb-3 whitespace-pre-wrap">{question.question_text}</div>
        {(question.user_answer_override ?? question.standard_answer) && (
          <div className="mb-3">
            <div className="text-xs text-gray-500 mb-1">标准答案</div>
            <MarkdownView>{question.user_answer_override ?? question.standard_answer ?? ""}</MarkdownView>
          </div>
        )}
        {question.explanation && (
          <div className="mb-3">
            <div className="text-xs text-gray-500 mb-1">解析</div>
            <MarkdownView>{question.explanation}</MarkdownView>
          </div>
        )}
        {question.answer_points?.length > 0 && (
          <div className="mb-4">
            <div className="text-xs text-gray-500 mb-1">评分要点</div>
            <ul className="list-disc pl-5 text-sm">
              {question.answer_points.map((p, i) => (<li key={i}>{p}</li>))}
            </ul>
          </div>
        )}

        <div className="border-t pt-3">
          <div className="text-sm font-medium text-gray-700 mb-2">
            历史刷题记录 ({items.length} 次，可逐次打开对比)
          </div>
          {items.length === 0 ? (
            <div className="text-gray-400 text-sm">暂无刷题记录</div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-auto">
              {items.map((r: any) => (
                <Link
                  key={r.id}
                  to={`/practice/record/${r.id}`}
                  onClick={onClose}
                  className="block border rounded p-2 text-xs hover:bg-gray-50"
                >
                  <div className="flex justify-between text-gray-500">
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                    {r.grading && (
                      <span className={VERDICT_COLOR[r.grading.verdict] || ""}>
                        {r.grading.verdict} · {r.grading.score}分
                      </span>
                    )}
                  </div>
                  <div className="text-gray-600 mt-1 truncate">答: {r.user_answer}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
