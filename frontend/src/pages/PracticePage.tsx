import { useEffect, useRef, useState } from "react";
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
  const [tags, setTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [deckId, setDeckId] = useState("");
  const [limit, setLimit] = useState(10);
  const [preferUnanswered, setPreferUnanswered] = useState(true);
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
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [revealedAtSubmit, setRevealedAtSubmit] = useState<boolean | null>(null);
  const questionStartedAt = useRef(Date.now());
  const gradeAbortRef = useRef<AbortController | null>(null);

  const { data: decksData } = useQuery({ queryKey: ["decks"], queryFn: api.listDecks });
  const decks = decksData?.items || [];
  const { data: tagsData } = useQuery({
    queryKey: ["question-tags", difficulty, deckId],
    queryFn: () => api.listQuestionTags({
      difficulty: difficulty || undefined,
      deck_id: deckId || undefined,
    }),
  });
  const availableTags = tagsData?.items || [];
  const filteredTags = availableTags.filter((tag) =>
    tag.name.toLocaleLowerCase().includes(tagSearch.trim().toLocaleLowerCase()),
  );

  const current = questions[idx];

  useEffect(() => {
    if (current?.id) {
      questionStartedAt.current = Date.now();
      setAnswerRevealed(false);
      setRevealedAtSubmit(null);
    }
  }, [current?.id]);

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
        tags: tags.length ? tags.join(",") : undefined,
        deck_id: deckId || undefined,
        group_mode: groupMode,
        prefer_unanswered: mode !== "wrong" && preferUnanswered,
      });
      // group mode: sort by group_id then group_seq, flatten groups together
      if (groupMode) {
        const grouped = new Map<string, Question[]>();
        const ungrouped: Question[] = [];
        for (const q of r.items) {
          if (q.group_id) {
            if (!grouped.has(q.group_id)) grouped.set(q.group_id, []);
            grouped.get(q.group_id)!.push(q);
          } else {
            ungrouped.push(q);
          }
        }
        const sorted: Question[] = [];
        for (const g of grouped.values()) {
          g.sort((a, b) => (a.group_seq || 0) - (b.group_seq || 0));
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
    const answerAtSubmit = userAnswer.trim();
    const revealSnapshot = answerRevealed;
    const controller = new AbortController();
    gradeAbortRef.current = controller;
    setRevealedAtSubmit(revealSnapshot);
    setGrading2(true);
    setGrading(null);
    setStreamText("");
    setStreamError(null);
    setStreamDone(false);
    let recordId: string | null = null;
    let resultReceived = false;
    try {
      const rec = await api.createPracticeRecord({
        question_id: current.id,
        user_answer: answerAtSubmit,
        revealed: revealSnapshot,
        duration_sec: Math.max(1, Math.round((Date.now() - questionStartedAt.current) / 1000)),
      });
      recordId = rec.id;
      await streamSSE(`/practice/grade/stream`, {
        question_id: current.id,
        user_answer: answerAtSubmit,
        practice_record_id: rec.id,
      }, {
        onDelta: (d) => setStreamText((t) => t + d),
        onResult: (r) => {
          resultReceived = true;
          setGrading(r);
        },
        onDone: () => setStreamDone(true),
        onError: (m) => setStreamError(m),
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e?.name !== "AbortError") setStreamError(e.message);
    } finally {
      if (recordId && !resultReceived) {
        try {
          await api.deleteRecord(recordId);
        } catch {
          /* The server may already be finalizing the canceled request. */
        }
      }
      if (gradeAbortRef.current === controller) {
        gradeAbortRef.current = null;
        setGrading2(false);
      }
    }
  };

  const cancelGrade = () => {
    const controller = gradeAbortRef.current;
    gradeAbortRef.current = null;
    controller?.abort();
    setGrading2(false);
    setStreamText("");
    setStreamError(null);
    setStreamDone(false);
    setGrading(null);
    setRevealedAtSubmit(null);
  };

  const next = () => {
    setGrading(null);
    setUserAnswer("");
    setStreamText("");
    setStreamError(null);
    setStreamDone(false);
    setAnswerRevealed(false);
    setRevealedAtSubmit(null);
    setIdx((i) => i + 1);
  };

  // --- draw UI (no questions yet) ---
  if (questions.length === 0) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <h1 className="text-xl font-bold mb-4">刷题（盖答案）</h1>
        <div className="bg-white border rounded-lg p-4 space-y-3 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <option value="easy">简单</option>
                <option value="medium">中等</option>
                <option value="hard">困难</option>
              </select>
            </label>
            <div className="text-sm sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <span>标签（可多选）</span>
                {tags.length > 0 && (
                  <button type="button" onClick={() => setTags([])} className="text-xs text-blue-600 hover:underline">
                    清空
                  </button>
                )}
              </div>
              <input
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="搜索已有标签"
                className="block border rounded px-2 py-1.5 mt-1 w-full text-sm"
              />
              <div className="mt-2 max-h-32 overflow-auto rounded border bg-gray-50 p-2 flex flex-wrap gap-1.5">
                {filteredTags.length > 0 ? filteredTags.map((tag) => {
                  const selected = tags.includes(tag.name);
                  return (
                    <button
                      type="button"
                      key={tag.name}
                      onClick={() => setTags((currentTags) =>
                        selected ? currentTags.filter((item) => item !== tag.name) : [...currentTags, tag.name]
                      )}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        selected ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-gray-600 hover:border-blue-400"
                      }`}
                    >
                      {tag.name} <span className={selected ? "text-blue-100" : "text-gray-400"}>{tag.count}</span>
                    </button>
                  );
                }) : (
                  <span className="text-xs text-gray-500 py-1">没有匹配的已有标签</span>
                )}
              </div>
            </div>
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
          <label className={`flex items-start gap-2 text-sm ${mode === "wrong" ? "text-gray-400" : "text-gray-600"}`}>
            <input
              type="checkbox"
              checked={preferUnanswered}
              disabled={mode === "wrong"}
              onChange={(e) => setPreferUnanswered(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              优先抽取未回答过的题目
              <span className="block text-xs text-gray-400">未答题不足时，再用已答题补足数量</span>
            </span>
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
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      {/* progress bar */}
      <div className="flex justify-between items-center mb-3 text-sm text-gray-500">
        <span>第 {idx + 1} / {questions.length} 题</span>
        <div className="flex items-center gap-2">
          {current.group_label && (
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
              {current.group_label}
            </span>
          )}
          {groupMode && current.group_id && (
            <span className="text-xs text-purple-600">
              追问链 ({questions.filter(q => q.group_id === current.group_id).length} 题)
            </span>
          )}
          <button
            onClick={() => setQuestions([])}
            disabled={grading2}
            className="hover:underline disabled:opacity-40"
          >
            结束本轮
          </button>
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
        onRevealed={() => setAnswerRevealed(true)}
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
          disabled={grading2}
          placeholder="输入你的答案，提交给 AI 面试官批改..."
          className="w-full border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
        />
        {answerRevealed && revealedAtSubmit === null && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            你已查看参考答案；点击提交时，本次记录会标记为“看答案后作答”。
          </div>
        )}
        {answerRevealed && revealedAtSubmit === false && (
          <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
            本次回答在揭晓答案前已经提交，当前查看不会改变本次批改记录。
          </div>
        )}
        {revealedAtSubmit === true && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            本次回答提交前已查看参考答案，记录已按提交时状态锁定。
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={doGrade}
            disabled={grading2 || !userAnswer.trim()}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {grading2 ? "批改中..." : "提交 AI 批改"}
          </button>
          <button
            onClick={grading2 ? cancelGrade : next}
            className={`px-4 py-1.5 border rounded-lg text-sm transition-colors ${
              grading2 ? "border-red-300 text-red-600 hover:bg-red-50" : "hover:bg-gray-50"
            }`}
          >
            {grading2 ? "取消批改" : "下一题"}
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
