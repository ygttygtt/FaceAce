import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { streamSSE } from "../lib/sse";
import RevealCard from "../components/RevealCard";
import StreamingGrade from "../components/StreamingGrade";
import BookmarkButton from "../components/BookmarkButton";
import NoteEditor from "../components/NoteEditor";
import AnswerEditor from "../components/AnswerEditor";
import AttemptHistory from "../components/AttemptHistory";
import PracticeFollowUp from "../components/PracticeFollowUp";
import { usePracticeStore } from "../store/usePracticeStore";
import type { Question } from "../types";

let activeGradeController: AbortController | null = null;

function groupQuestions(items: Question[], enabled: boolean): Question[] {
  if (!enabled) return items;
  const grouped = new Map<string, Question[]>();
  const ungrouped: Question[] = [];
  for (const question of items) {
    if (!question.group_id) {
      ungrouped.push(question);
      continue;
    }
    const group = grouped.get(question.group_id) || [];
    group.push(question);
    grouped.set(question.group_id, group);
  }
  const sorted: Question[] = [];
  for (const group of grouped.values()) {
    group.sort((a, b) => (a.group_seq || 0) - (b.group_seq || 0));
    sorted.push(...group);
  }
  return [...sorted, ...ungrouped];
}

export default function PracticePage() {
  const store = usePracticeStore();
  const {
    filters, questions, idx, drafts, results, recordIds, revealed, revealedAtSubmit, startedAt,
    grading, streamText, analysisStreamText, analysisError, streamError, streamDone,
  } = store;
  const [tagSearch, setTagSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showAnswerEditor, setShowAnswerEditor] = useState(false);
  const qc = useQueryClient();
  const current = questions[idx];
  const userAnswer = current ? drafts[current.id] || "" : "";
  const gradingResult = current ? results[current.id] || null : null;
  const currentRecordId = current ? recordIds[current.id] || null : null;
  const answerRevealed = current ? !!revealed[current.id] : false;
  const submitReveal = current ? revealedAtSubmit[current.id] ?? null : null;

  const { data: decksData } = useQuery({ queryKey: ["decks"], queryFn: api.listDecks });
  const decks = decksData?.items || [];
  const { data: tagsData } = useQuery({
    queryKey: ["question-tags", filters.difficulty, filters.deckId],
    queryFn: () => api.listQuestionTags({
      difficulty: filters.difficulty || undefined,
      deck_id: filters.deckId || undefined,
    }),
  });
  const filteredTags = (tagsData?.items || []).filter((tag) =>
    tag.name.toLocaleLowerCase().includes(tagSearch.trim().toLocaleLowerCase()),
  );

  useEffect(() => {
    if (current?.id) store.ensureStarted(current.id);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const draw = async () => {
    setLoading(true);
    try {
      const response = await api.drawQuestions({
        mode: filters.mode,
        limit: Math.max(1, Math.min(100, filters.limit)),
        difficulty: filters.difficulty || undefined,
        tags: filters.tags.length ? filters.tags.join(",") : undefined,
        deck_id: filters.deckId || undefined,
        group_mode: filters.groupMode,
        prefer_unanswered: filters.mode !== "wrong" && filters.preferUnanswered,
        low_score_threshold: filters.mode === "wrong" ? filters.lowScoreThreshold : undefined,
      });
      const items = groupQuestions(response.items, filters.groupMode);
      store.startSession(items);
      if (!items.length) alert(`没有符合条件的题目${filters.mode === "wrong" ? `（最近得分不高于 ${filters.lowScoreThreshold} 分）` : ""}`);
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const doGrade = async () => {
    if (!current || !userAnswer.trim() || grading) return;
    const answerAtSubmit = userAnswer.trim();
    const revealSnapshot = answerRevealed;
    const controller = new AbortController();
    activeGradeController = controller;
    store.beginGrade(current.id, revealSnapshot);
    let recordId: string | null = null;
    let resultReceived = false;
    try {
      const record = await api.createPracticeRecord({
        question_id: current.id,
        user_answer: answerAtSubmit,
        revealed: revealSnapshot,
        duration_sec: Math.max(1, Math.round((Date.now() - (startedAt[current.id] || Date.now())) / 1000)),
      });
      recordId = record.id;
      await streamSSE("/practice/grade/stream", {
        question_id: current.id,
        user_answer: answerAtSubmit,
        practice_record_id: record.id,
        include_independent_analysis: filters.includeIndependentAnalysis,
      }, {
        onDelta: store.appendStream,
        onAnalysisDelta: store.appendAnalysisStream,
        onAnalysisError: store.failAnalysis,
        onResult: (result) => {
          resultReceived = true;
          store.finishGrade(current.id, result, record.id);
          qc.invalidateQueries({ queryKey: ["questionAttempts", current.id] });
          qc.invalidateQueries({ queryKey: ["practiceRecords"] });
          qc.invalidateQueries({ queryKey: ["wrongQuestions"] });
          qc.invalidateQueries({ queryKey: ["lowScoreQuestions"] });
        },
        onDone: () => undefined,
        onError: store.failGrade,
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") store.failGrade((error as Error).message);
    } finally {
      if (recordId && !resultReceived) {
        try {
          await api.deleteRecord(recordId);
        } catch {
          // The server may already be finishing a canceled request.
        }
      }
      if (activeGradeController === controller) activeGradeController = null;
    }
  };

  const cancelGrade = () => {
    activeGradeController?.abort();
    activeGradeController = null;
    if (current) store.cancelGrade(current.id);
  };

  const endSession = () => {
    const hasDraft = Object.values(drafts).some((draft) => draft.trim());
    if (!hasDraft || confirm("结束本轮会清空当前进度和页面草稿；已提交的作答记录仍会保留。确定结束吗？")) {
      store.clearSession();
    }
  };

  if (!questions.length) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <h1 className="mb-4 text-xl font-bold">刷题（盖答案）</h1>
        <div className="space-y-4 rounded-lg border bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              抽题模式
              <select value={filters.mode} onChange={(event) => store.setFilter("mode", event.target.value)} className="mt-1 block w-full rounded border px-2 py-1.5 text-sm">
                <option value="random">随机</option>
                <option value="wrong">低分错题重练</option>
                <option value="tag">按标签</option>
              </select>
            </label>
            <label className="text-sm">
              难度
              <select value={filters.difficulty} onChange={(event) => store.setFilter("difficulty", event.target.value)} className="mt-1 block w-full rounded border px-2 py-1.5 text-sm">
                <option value="">不限</option>
                <option value="easy">简单</option>
                <option value="medium">中等</option>
                <option value="hard">困难</option>
              </select>
            </label>
            {filters.mode === "wrong" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-medium text-amber-800">
                    最近一次得分不高于
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={filters.lowScoreThreshold}
                      onChange={(event) => store.setFilter("lowScoreThreshold", Math.max(0, Math.min(100, Number(event.target.value))))}
                      className="mx-2 w-16 rounded border px-2 py-1 text-center"
                    />
                    分
                  </label>
                  <div className="flex gap-1">
                    {[40, 50, 60].map((score) => (
                      <button
                        type="button"
                        key={score}
                        onClick={() => store.setFilter("lowScoreThreshold", score)}
                        className={`rounded border px-2 py-1 text-xs ${filters.lowScoreThreshold === score ? "border-amber-500 bg-white text-amber-800" : "text-gray-500"}`}
                      >
                        {score} 分
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-1 text-xs text-amber-700">只看每道题最近一次批改，答好后会自动移出该分数段；之前的作答记录仍会保留。</p>
              </div>
            )}
            <div className="text-sm sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <span>标签（可多选）</span>
                {!!filters.tags.length && <button type="button" onClick={() => store.setFilter("tags", [])} className="text-xs text-blue-600 hover:underline">清空</button>}
              </div>
              <input value={tagSearch} onChange={(event) => setTagSearch(event.target.value)} placeholder="搜索已有标签" className="mt-1 block w-full rounded border px-2 py-1.5 text-sm" />
              <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-auto rounded border bg-gray-50 p-2">
                {filteredTags.length ? filteredTags.map((tag) => {
                  const selected = filters.tags.includes(tag.name);
                  return (
                    <button
                      type="button"
                      key={tag.name}
                      onClick={() => store.setFilter("tags", selected ? filters.tags.filter((item) => item !== tag.name) : [...filters.tags, tag.name])}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${selected ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-gray-600 hover:border-blue-400"}`}
                    >
                      {tag.name} <span className={selected ? "text-blue-100" : "text-gray-400"}>{tag.count}</span>
                    </button>
                  );
                }) : <span className="py-1 text-xs text-gray-500">没有匹配的已有标签</span>}
              </div>
            </div>
            <label className="text-sm">
              数量
              <input type="number" min={1} max={100} value={filters.limit} onChange={(event) => store.setFilter("limit", Number(event.target.value))} className="mt-1 block w-full rounded border px-2 py-1.5 text-sm" />
            </label>
            <label className="text-sm">
              题库
              <select value={filters.deckId} onChange={(event) => store.setFilter("deckId", event.target.value)} className="mt-1 block w-full rounded border px-2 py-1.5 text-sm">
                <option value="">全部题库</option>
                {decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}（{deck.question_count}）</option>)}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={filters.groupMode} onChange={(event) => store.setFilter("groupMode", event.target.checked)} />
            整组抽取（追问题目连续出现）
          </label>
          <label className={`flex items-start gap-2 text-sm ${filters.mode === "wrong" ? "text-gray-400" : "text-gray-600"}`}>
            <input type="checkbox" checked={filters.preferUnanswered} disabled={filters.mode === "wrong"} onChange={(event) => store.setFilter("preferUnanswered", event.target.checked)} className="mt-0.5" />
            <span>优先抽取未回答过的题目<span className="block text-xs text-gray-400">未答题不足时，再用已答题补足数量</span></span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border bg-gray-50 p-3 text-sm text-gray-700">
            <input type="checkbox" checked={filters.includeIndependentAnalysis} onChange={(event) => store.setFilter("includeIndependentAnalysis", event.target.checked)} className="mt-0.5" />
            <span>同时生成 AI 独立解析（可选）<span className="block text-xs text-gray-400">不依赖导入的参考答案，便于交叉验证；会增加一次模型推理的耗时和用量。</span></span>
          </label>
          <button onClick={draw} disabled={loading} className="w-full rounded-lg bg-blue-600 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
            {loading ? "抽题中..." : "开始刷题"}
          </button>
        </div>
      </div>
    );
  }

  if (!current) {
    const gradedCount = Object.keys(results).length;
    return (
      <div className="p-6 text-center">
        <div className="mb-2 text-gray-700">本轮已刷完！</div>
        <div className="mb-4 text-xs text-gray-400">完成批改 {gradedCount} / {questions.length} 题；作答记录均已保存</div>
        <div className="flex justify-center gap-2">
          <button onClick={() => store.setIdx(questions.length - 1)} className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">返回上一题</button>
          <button onClick={endSession} className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">再来一组</button>
        </div>
      </div>
    );
  }

  const displayAnswer = current.user_answer_override ?? current.standard_answer;
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-3 text-sm text-gray-500">
        <div>
          <span>第 {idx + 1} / {questions.length} 题</span>
          <span className="ml-2 text-xs text-green-700">进度与草稿已自动保存</span>
        </div>
        <div className="flex items-center gap-2">
          {current.group_label && <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">{current.group_label}</span>}
          {filters.groupMode && current.group_id && <span className="hidden text-xs text-purple-600 sm:inline">追问链（{questions.filter((question) => question.group_id === current.group_id).length} 题）</span>}
          <button onClick={endSession} disabled={grading} className="hover:underline disabled:opacity-40">结束本轮</button>
        </div>
      </div>
      <div className="mb-1 flex items-start justify-end"><BookmarkButton questionId={current.id} /></div>
      <RevealCard
        key={current.id}
        question={current}
        customAnswer={displayAnswer}
        onRevealed={() => store.revealAnswer(current.id)}
        onEditAnswer={() => setShowAnswerEditor(true)}
        onOpenNote={() => setShowNote(true)}
      />

      <div className="mt-4 space-y-3 rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-gray-500">我的答案</div>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input type="checkbox" checked={filters.includeIndependentAnalysis} disabled={grading} onChange={(event) => store.setFilter("includeIndependentAnalysis", event.target.checked)} />
            附加 AI 独立解析
          </label>
        </div>
        <textarea
          value={userAnswer}
          onChange={(event) => store.setDraft(current.id, event.target.value)}
          rows={5}
          disabled={grading}
          placeholder="输入你的答案，提交给 AI 面试官批改..."
          className="w-full resize-y rounded-lg border p-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
        />
        {answerRevealed && submitReveal === null && <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">你已查看参考答案；点击提交时，本次记录会标记为“看答案后作答”。</div>}
        {answerRevealed && submitReveal === false && <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">本次回答在揭晓答案前已经提交，当前查看不会改变本次批改记录。</div>}
        {submitReveal === true && <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">本次回答提交前已查看参考答案，记录已按提交时状态锁定。</div>}
        <div className="flex flex-wrap gap-2">
          <button onClick={doGrade} disabled={grading || !userAnswer.trim()} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
            {grading ? "批改中..." : gradingResult ? "再次提交并保留本次记录" : "提交 AI 批改"}
          </button>
          {idx > 0 && <button onClick={() => store.setIdx(idx - 1)} disabled={grading} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">上一题</button>}
          <button onClick={grading ? cancelGrade : store.nextQuestion} className={`rounded-lg border px-4 py-1.5 text-sm transition-colors ${grading ? "border-red-300 text-red-600 hover:bg-red-50" : "hover:bg-gray-50"}`}>
            {grading ? "取消批改" : "下一题"}
          </button>
        </div>

        {(streamText || analysisStreamText || streamError || streamDone || gradingResult) && (
          <StreamingGrade
            streamingText={streamText}
            analysisStreamingText={analysisStreamText}
            analysisError={analysisError}
            result={grading ? null : gradingResult}
            error={streamError}
            done={streamDone || (!grading && !!gradingResult)}
          />
        )}
        {gradingResult && <AttemptHistory questionId={current.id} currentRecordId={currentRecordId} defaultOpen />}
        {gradingResult && currentRecordId && <PracticeFollowUp recordId={currentRecordId} />}
      </div>

      {showNote && <NoteEditor questionId={current.id} onClose={() => setShowNote(false)} />}
      {showAnswerEditor && (
        <AnswerEditor
          questionId={current.id}
          currentAnswer={current.user_answer_override ?? null}
          onSaved={(newAnswer) => store.updateQuestion(current.id, { user_answer_override: newAnswer })}
          onClose={() => setShowAnswerEditor(false)}
        />
      )}
    </div>
  );
}
