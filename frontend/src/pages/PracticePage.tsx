import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { streamSSE } from "../lib/sse";
import RevealCard from "../components/RevealCard";
import StreamingGrade from "../components/StreamingGrade";
import BookmarkButton from "../components/BookmarkButton";
import NoteEditor from "../components/NoteEditor";
import AnswerEditor from "../components/AnswerEditor";
import type { GradingResult, Question } from "../types";

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
  // streaming grade state
  const [streamText, setStreamText] = useState("");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamDone, setStreamDone] = useState(false);
  // modals
  const [showNote, setShowNote] = useState(false);
  const [showAnswerEditor, setShowAnswerEditor] = useState(false);
  // group mode
  const [groupMode, setGroupMode] = useState(true);

  const { data: decksData } = useQuery({ queryKey: ["decks"], queryFn: api.listDecks });
  const decks = decksData?.items || [];

  const current = questions[idx];

  const draw = async () => {
    setLoading(true);
    setGrading(null);
    setUserAnswer("");
    setStreamText("");
    setStreamError(null);
    setStreamDone(false);
    try {
      const r = await api.drawQuestions({
        mode,
        limit,
        difficulty: difficulty || undefined,
        tags: tags || undefined,
        deck_id: deckId || undefined,
      });
      // group mode: sort by group_id then group_seq, flatten groups together
      if (groupMode) {
        const grouped = new Map<string, Question[]>();
        const ungrouped: Question[] = [];
        for (const q of r.items) {
          if ((q as any).group_id) {
            if (!grouped.has((q as any).group_id)) grouped.set((q as any).group_id, []);
            grouped.get((q as any).group_id)!.push(q);
          } else {
            ungrouped.push(q);
          }
        }
        const sorted: Question[] = [];
        for (const g of grouped.values()) {
          g.sort((a, b) => ((a as any).group_seq || 0) - ((b as any).group_seq || 0));
          sorted.push(...g);
        }
        sorted.push(...ungrouped);
        setQuestions(sorted);
      } else {
        setQuestions(r.items);
      }
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
    setGrading(null);
    setStreamText("");
    setStreamError(null);
    setStreamDone(false);
    try {
      const rec = await api.createPracticeRecord({
        question_id: current.id,
        user_answer: userAnswer,
        revealed: true,
        duration_sec: 0,
      });
      await streamSSE(`/practice/grade/stream`, {
        question_id: current.id,
        user_answer: userAnswer,
        practice_record_id: rec.id,
      }, {
        onDelta: (d) => setStreamText((t) => t + d),
        onResult: (r) => setGrading(r),
        onDone: () => setStreamDone(true),
        onError: (m) => setStreamError(m),
      });
    } catch (e: any) {
      setStreamError(e.message);
    }
    setGrading2(false);
  };

  const next = () => {
    setGrading(null);
    setUserAnswer("");
    setStreamText("");
    setStreamError(null);
    setStreamDone(false);
    setIdx((i) => i + 1);
  };

  // --- draw UI (no questions yet) ---
  if (questions.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-xl font-bold mb-4">刷题（盖答案）</h1>
        <div className="bg-white border rounded-lg p-4 space-y-3 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              抽题模式
              <select value={mode} onChange={(e) => setMode(e.target.value)}
                className="block border rounded px-2 py-1.5 mt-1 w-full text-sm">
                <option value="random">随机</option>
                <option value="wrong">错题重练</option>
                <option value="tag">按标签</option>
              </select>
            </label>
            <label className="text-sm">
              难度
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
                className="block border rounded px-2 py-1.5 mt-1 w-full text-sm">
                <option value="">不限</option>
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
            </label>
            <label className="text-sm">
              标签（逗号分隔）
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="如:JavaScript,闭包"
                className="block border rounded px-2 py-1.5 mt-1 w-full text-sm" />
            </label>
            <label className="text-sm">
              数量
              <input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))}
                className="block border rounded px-2 py-1.5 mt-1 w-full text-sm" />
            </label>
            <label className="text-sm col-span-2">
              题库
              <select value={deckId} onChange={(e) => setDeckId(e.target.value)}
                className="block border rounded px-2 py-1.5 mt-1 w-full text-sm">
                <option value="">全部题库</option>
                {decks.map((d) => (<option key={d.id} value={d.id}>{d.name}（{d.question_count}）</option>))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={groupMode} onChange={(e) => setGroupMode(e.target.checked)} />
            整组抽取（追问题目连续出现）
          </label>
          <button onClick={draw} disabled={loading}
            className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {loading ? "抽题中..." : "开始刷题"}
          </button>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="p-6 text-center">
        <div className="text-gray-600 mb-4">本轮已刷完！</div>
        <button onClick={() => setQuestions([])} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          再来一组
        </button>
      </div>
    );
  }

  const displayAnswer = current.user_answer_override ?? current.standard_answer;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* progress bar */}
      <div className="flex justify-between items-center mb-3 text-sm text-gray-500">
        <span>第 {idx + 1} / {questions.length} 题</span>
        <div className="flex items-center gap-2">
          {(current as any).group_label && (
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
              {(current as any).group_label}
            </span>
          )}
          {groupMode && (current as any).group_id && (
            <span className="text-xs text-purple-600">
              追问链 ({questions.filter(q => (q as any).group_id === (current as any).group_id).length} 题)
            </span>
          )}
          <button onClick={() => setQuestions([])} className="hover:underline">结束本轮</button>
        </div>
      </div>

      {/* bookmark button */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex-1" />
        <BookmarkButton questionId={current.id} />
      </div>

      <RevealCard
        key={current.id}
        question={current}
        customAnswer={displayAnswer}
        onEditAnswer={() => setShowAnswerEditor(true)}
        onOpenNote={() => setShowNote(true)}
      />

      {/* answer area */}
      <div className="bg-white border rounded-lg p-4 mt-4 space-y-3 shadow-sm">
        <div className="text-xs text-gray-500 font-medium">我的答案</div>
        <textarea
          value={userAnswer}
          onChange={(e) => setUserAnswer(e.target.value)}
          rows={5}
          placeholder="输入你的答案，提交给 AI 面试官批改..."
          className="w-full border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
        />
        <div className="flex gap-2">
          <button
            onClick={doGrade}
            disabled={grading2 || !userAnswer.trim()}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {grading2 ? "批改中..." : "提交 AI 批改"}
          </button>
          <button onClick={next} className="px-4 py-1.5 border rounded-lg text-sm hover:bg-gray-50 transition-colors">
            下一题
          </button>
        </div>

        {/* streaming grade result */}
        {(streamText || streamError || streamDone) && (
          <StreamingGrade
            streamingText={streamText}
            result={grading}
            error={streamError}
            done={streamDone}
          />
        )}
      </div>

      {/* note modal */}
      {showNote && <NoteEditor questionId={current.id} onClose={() => setShowNote(false)} />}

      {/* answer editor modal */}
      {showAnswerEditor && (
        <AnswerEditor
          questionId={current.id}
          currentAnswer={current.user_answer_override ?? null}
          onSaved={(newAnswer) => {
            if (current) current.user_answer_override = newAnswer;
          }}
          onClose={() => setShowAnswerEditor(false)}
        />
      )}
    </div>
  );
}
