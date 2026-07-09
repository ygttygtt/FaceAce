import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import MarkdownView from "../components/MarkdownView";
import type { Deck, Question } from "../types";

export default function QuestionBankPage() {
  const [keyword, setKeyword] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [qtype, setQtype] = useState("");
  const [deckId, setDeckId] = useState<string | null>(null); // null = all
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Question | null>(null);
  const [newDeckName, setNewDeckName] = useState("");
  const [showNewDeck, setShowNewDeck] = useState(false);
  const qc = useQueryClient();

  const { data: decksData } = useQuery({ queryKey: ["decks"], queryFn: api.listDecks });
  const decks: Deck[] = decksData?.items || [];

  const { data, isLoading } = useQuery({
    queryKey: ["questions", keyword, difficulty, qtype, deckId],
    queryFn: () =>
      api.listQuestions({
        keyword: keyword || undefined,
        difficulty: difficulty || undefined,
        qtype: qtype || undefined,
        deck_id: deckId || undefined,
        limit: 500,
      }),
  });
  const items = data?.items || [];

  const del = useMutation({
    mutationFn: (id: string) => api.deleteQuestion(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["questions"] });
      qc.invalidateQueries({ queryKey: ["decks"] });
      setDetail(null);
    },
  });
  const batchDel = useMutation({
    mutationFn: (ids: string[]) => api.batchDelete(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["questions"] });
      qc.invalidateQueries({ queryKey: ["decks"] });
      setSelected(new Set());
    },
  });
  const batchMove = useMutation({
    mutationFn: ({ ids, deck_id }: { ids: string[]; deck_id: string | null }) =>
      api.batchMove(ids, deck_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["questions"] });
      qc.invalidateQueries({ queryKey: ["decks"] });
      setSelected(new Set());
    },
  });
  const createDeck = useMutation({
    mutationFn: (name: string) => api.createDeck({ name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decks"] });
      setShowNewDeck(false);
      setNewDeckName("");
    },
  });

  const toggle = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((q) => q.id)));
  };

  const exportAll = async () => {
    const r = await api.exportQuestions();
    const blob = new Blob([JSON.stringify(r.questions, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "faceace_questions.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const selIds = Array.from(selected);

  return (
    <div className="p-6 h-full flex gap-4">
      {/* deck sidebar */}
      <div className="w-48 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-600">题库</span>
          <button
            onClick={() => setShowNewDeck((v) => !v)}
            className="text-xs text-blue-600 hover:underline"
          >
            +新建
          </button>
        </div>
        {showNewDeck && (
          <div className="mb-2 flex gap-1">
            <input
              value={newDeckName}
              onChange={(e) => setNewDeckName(e.target.value)}
              placeholder="题库名"
              className="border rounded px-2 py-1 text-xs flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newDeckName.trim()) createDeck.mutate(newDeckName.trim());
              }}
            />
            <button
              onClick={() => newDeckName.trim() && createDeck.mutate(newDeckName.trim())}
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded"
            >
              建
            </button>
          </div>
        )}
        <div
          className={`px-2 py-1.5 rounded cursor-pointer text-sm ${
            deckId === null ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"
          }`}
          onClick={() => {
            setDeckId(null);
            setSelected(new Set());
          }}
        >
          全部题目
        </div>
        {decks.map((d) => (
          <div
            key={d.id}
            className={`px-2 py-1.5 rounded cursor-pointer text-sm flex justify-between ${
              deckId === d.id ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"
            }`}
            onClick={() => {
              setDeckId(d.id);
              setSelected(new Set());
            }}
          >
            <span className="truncate">{d.name}</span>
            <span className="text-xs text-gray-400">{d.question_count}</span>
          </div>
        ))}
        {decks.length === 0 && (
          <div className="text-xs text-gray-400 mt-1">点「+新建」创建题库分组</div>
        )}
      </div>

      {/* main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold">
            题库管理{deckId && decks.find((d) => d.id === deckId)
              ? ` · ${decks.find((d) => d.id === deckId)!.name}`
              : ""}
          </h1>
          <div className="flex gap-2">
            <Link
              to="/ingest"
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              导入文档
            </Link>
            <button
              onClick={exportAll}
              className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
            >
              导出全部
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索题干"
            className="border rounded px-3 py-1.5 text-sm flex-1"
          />
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm"
          >
            <option value="">全部难度</option>
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
          <select
            value={qtype}
            onChange={(e) => setQtype(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm"
          >
            <option value="">全部题型</option>
            <option value="short_answer">简答</option>
            <option value="single_choice">单选</option>
            <option value="coding">编程</option>
            <option value="essay">论述</option>
            <option value="behavioral">行为面</option>
          </select>
        </div>

        {selIds.length > 0 && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-blue-50 rounded text-sm">
            <span>已选 {selIds.length} 题</span>
            <select
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value || null;
                batchMove.mutate({ ids: selIds, deck_id: v });
                e.target.value = "";
              }}
              className="border rounded px-2 py-1 text-xs"
            >
              <option value="">移动到题库...</option>
              <option value="">不归入任何题库</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                if (confirm(`删除选中的 ${selIds.length} 题?`)) batchDel.mutate(selIds);
              }}
              className="text-red-600 hover:underline text-xs"
            >
              批量删除
            </button>
            <button onClick={() => setSelected(new Set())} className="text-gray-500 text-xs">
              取消选择
            </button>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          <div className="flex items-center gap-2 px-2 py-1 text-xs text-gray-500 border-b">
            <input
              type="checkbox"
              checked={selected.size > 0 && selected.size === items.length}
              onChange={toggleAll}
            />
            <span>{selected.size > 0 ? `已选 ${selected.size}/${items.length}` : `共 ${items.length} 题`}</span>
          </div>
          {isLoading ? (
            <div className="text-gray-500 p-4">加载中...</div>
          ) : items.length === 0 ? (
            <div className="text-gray-500 text-center py-10">
              {decks.length === 0 ? "题库为空,点击右上角「导入文档」开始。" : "该题库下暂无题目。"}
            </div>
          ) : (
            <div className="space-y-1 mt-1">
              {items.map((q) => (
                <div
                  key={q.id}
                  className="bg-white border rounded p-2 flex items-start gap-2 hover:border-blue-400"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(q.id)}
                    onChange={() => toggle(q.id)}
                    className="mt-1"
                  />
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setDetail(q)}
                  >
                    <div className="text-sm text-gray-900 truncate">{q.question_text}</div>
                    <div className="flex gap-2 mt-1 text-xs text-gray-500">
                      <span>{q.question_type}</span>
                      <span>{q.difficulty}</span>
                      {q.tags?.slice(0, 3).map((t) => (
                        <span key={t} className="text-blue-600">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {detail && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-6 z-50"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-3">
              <h2 className="font-bold">题目详情</h2>
              <button
                onClick={() => del.mutate(detail.id)}
                className="text-red-600 text-sm hover:underline"
              >
                删除
              </button>
            </div>
            <div className="text-gray-900 mb-3 whitespace-pre-wrap">{detail.question_text}</div>
            {detail.standard_answer && (
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1">标准答案</div>
                <MarkdownView>{detail.standard_answer}</MarkdownView>
              </div>
            )}
            {detail.explanation && (
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1">解析</div>
                <MarkdownView>{detail.explanation}</MarkdownView>
              </div>
            )}
            {detail.answer_points?.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-1">评分要点</div>
                <ul className="list-disc pl-5 text-sm">
                  {detail.answer_points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
