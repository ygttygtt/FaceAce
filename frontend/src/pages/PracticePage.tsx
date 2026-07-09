import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import RevealCard from "../components/RevealCard";
import MarkdownView from "../components/MarkdownView";
import type { GradingResult, Question } from "../types";

const VERDICT_COLOR: Record<string, string> = {
  correct: "bg-green-100 text-green-700",
  partially_correct: "bg-yellow-100 text-yellow-700",
  incorrect: "bg-red-100 text-red-700",
};

export default function PracticePage() {
  const [mode, setMode] = useState("random");
  const [difficulty, setDifficulty] = useState("");
  const [tags, setTags] = useState("");
  const [deckId, setDeckId] = useState("");
  const [limit, setLimit] = useState(10);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [grading, setGrading] = useState<GradingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [grading2, setGrading2] = useState(false);

  const { data: decksData } = useQuery({ queryKey: ["decks"], queryFn: api.listDecks });
  const decks = decksData?.items || [];

  const current = questions[idx];

  const draw = async () => {
    setLoading(true);
    setGrading(null);
    setUserAnswer("");
    try {
      const r = await api.drawQuestions({
        mode,
        limit,
        difficulty: difficulty || undefined,
        tags: tags || undefined,
        deck_id: deckId || undefined,
      });
      setQuestions(r.items);
      setIdx(0);
      if (r.items.length === 0) alert("没有符合条件的题目");
    } catch (e: any) {
      alert(e.message);
    }
    setLoading(false);
  };

  const doGrade = async () => {
    if (!current || !userAnswer.trim()) return;
    setGrading2(true);
    try {
      const rec = await api.createPracticeRecord({
        question_id: current.id,
        user_answer: userAnswer,
        revealed: true,
        duration_sec: 0,
      });
      const g = await api.grade({
        question_id: current.id,
        user_answer: userAnswer,
        practice_record_id: rec.id,
      });
      setGrading(g);
    } catch (e: any) {
      alert(e.message);
    }
    setGrading2(false);
  };

  const next = () => {
    setGrading(null);
    setUserAnswer("");
    setIdx((i) => i + 1);
  };

  if (questions.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-xl font-bold mb-4">刷题(盖答案)</h1>
        <div className="bg-white border rounded p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              抽题模式
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="block border rounded px-2 py-1.5 mt-1 w-full"
              >
                <option value="random">随机</option>
                <option value="wrong">错题重练</option>
                <option value="tag">按标签</option>
              </select>
            </label>
            <label className="text-sm">
              难度
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="block border rounded px-2 py-1.5 mt-1 w-full"
              >
                <option value="">不限</option>
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
            </label>
            <label className="text-sm">
              标签(逗号分隔)
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="如:JavaScript,闭包"
                className="block border rounded px-2 py-1.5 mt-1 w-full"
              />
            </label>
            <label className="text-sm">
              数量
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="block border rounded px-2 py-1.5 mt-1 w-full"
              />
            </label>
            <label className="text-sm col-span-2">
              题库
              <select
                value={deckId}
                onChange={(e) => setDeckId(e.target.value)}
                className="block border rounded px-2 py-1.5 mt-1 w-full"
              >
                <option value="">全部题库</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}({d.question_count})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            onClick={draw}
            disabled={loading}
            className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "抽题中..." : "开始刷题"}
          </button>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="p-6 text-center">
        <div className="text-gray-600 mb-4">本轮已刷完!</div>
        <button
          onClick={() => setQuestions([])}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          再来一组
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-3 text-sm text-gray-500">
        <span>
          第 {idx + 1} / {questions.length} 题
        </span>
        <button onClick={() => setQuestions([])} className="hover:underline">
          结束本轮
        </button>
      </div>

      <RevealCard key={current.id} question={current} />

      <div className="bg-white border rounded p-4 mt-4 space-y-3">
        <div className="text-xs text-gray-500 font-medium">我的答案</div>
        <textarea
          value={userAnswer}
          onChange={(e) => setUserAnswer(e.target.value)}
          rows={5}
          placeholder="输入你的答案,提交给 AI 面试官批改..."
          className="w-full border rounded p-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            onClick={doGrade}
            disabled={grading2 || !userAnswer.trim()}
            className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {grading2 ? "批改中..." : "提交 AI 批改"}
          </button>
          <button
            onClick={next}
            className="px-4 py-1.5 border rounded text-sm hover:bg-gray-50"
          >
            下一题
          </button>
        </div>

        {grading && (
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-sm font-bold ${VERDICT_COLOR[grading.verdict] || ""}`}
              >
                {grading.verdict}
              </span>
              <span className="text-lg font-bold">{grading.score} 分</span>
            </div>
            {grading.strengths?.length > 0 && (
              <div>
                <div className="text-xs text-green-700">优点</div>
                <ul className="list-disc pl-5 text-sm">
                  {grading.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {grading.weaknesses?.length > 0 && (
              <div>
                <div className="text-xs text-red-700">不足</div>
                <ul className="list-disc pl-5 text-sm">
                  {grading.weaknesses.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {grading.missing_points?.length > 0 && (
              <div>
                <div className="text-xs text-gray-600">未覆盖要点</div>
                <ul className="list-disc pl-5 text-sm">
                  {grading.missing_points.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <div className="text-xs text-gray-600 mb-1">详细点评</div>
              <MarkdownView>{grading.detailed_feedback}</MarkdownView>
            </div>
            {grading.improved_answer && (
              <div>
                <div className="text-xs text-gray-600 mb-1">参考改进答案</div>
                <MarkdownView>{grading.improved_answer}</MarkdownView>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
