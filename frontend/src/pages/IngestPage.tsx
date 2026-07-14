import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, apiUrl } from "../lib/api";
import type { IngestJobDetail, NormalizedQuestion } from "../types";

const STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  extracting: "提取中",
  normalizing: "AI 归一化中",
  pending_review: "待审核",
  done: "已完成",
  failed: "失败",
};

export default function IngestPage() {
  const navigate = useNavigate();
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const qc = useQueryClient();
  const deleteJob = useMutation({
    mutationFn: (id: string) => api.deleteJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ingestJobs"] });
    },
  });
  const [searchParams] = useSearchParams();
  const defaultDeckId = searchParams.get("deck_id") || "";

  const { data: jobsData } = useQuery({
    queryKey: ["ingestJobs"],
    queryFn: api.listJobs,
    refetchInterval: (q) => {
      const items = (q.state.data as any)?.items || [];
      return items.some((j: any) =>
        ["queued", "extracting", "normalizing"].includes(j.status)
      )
        ? 2000
        : false;
    },
  });

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await api.uploadFile(file, { deck_id: defaultDeckId || undefined });
      qc.invalidateQueries({ queryKey: ["ingestJobs"] });
    } catch (err: any) {
      alert(err.message);
    }
    e.target.value = "";
  };

  const onImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const questions = Array.isArray(parsed) ? parsed : parsed.questions;
      if (!Array.isArray(questions)) throw new Error("JSON 需为题目数组或 {questions:[...]}");
      const r = await api.importJson(questions, defaultDeckId || null);
      alert(`导入完成:成功 ${r.inserted} 题,跳过 ${r.skipped} 题`);
      qc.invalidateQueries({ queryKey: ["questions"] });
      qc.invalidateQueries({ queryKey: ["decks"] });
    } catch (err: any) {
      alert("导入失败: " + err.message);
    }
    e.target.value = "";
  };

  return (
    <div className="p-4 sm:p-6 min-h-full flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate(-1)}
          className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
        >
          ← 返回
        </button>
        <h1 className="text-xl font-bold">文档导入</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border rounded p-4">
          <label className="block text-sm text-gray-600 mb-2">
            方式一:上传原始文档(LLM 自动归一化)
          </label>
          <input
            type="file"
            accept=".md,.txt,.docx,.pdf"
            onChange={onUpload}
            className="text-sm"
          />
          <p className="text-xs text-gray-400 mt-2">
            .md/.txt/.docx/.pdf(需可复制文字),后台调 LLM 归一化后进入「待审核」。
          </p>
          <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
            <strong>⚠️ PDF 限制：</strong>仅支持可复制文字的 PDF，扫描件/图片 PDF 无法解析。如果上传失败，请用方式二。
          </div>
        </div>
        <div className="bg-white border rounded p-4">
          <label className="block text-sm text-gray-600 mb-2">
            方式二:导入已结构化 JSON(推荐，尤其 PDF)
          </label>
          <input
            type="file"
            accept=".json,application/json"
            onChange={onImportJson}
            className="text-sm"
          />
          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800 space-y-1.5">
            <p><strong>推荐流程：</strong>用另一个 AI（Claude / GPT / 通义等能读 PDF 的）帮你整理文档。</p>
            <p><strong>需要发给 AI 的材料：</strong></p>
            <ol className="list-decimal pl-4 space-y-0.5">
              <li>原始文档（PDF/Word/图片）</li>
              <li>
                格式规范文档：
                <a href={apiUrl("/questions/export")} target="_blank" className="text-blue-600 hover:underline">导出现有题库</a>
                可参考格式，或查看{" "}
                <code className="bg-blue-100 px-1 rounded">docs/schema.md</code>
              </li>
              <li>
                Agent 指令文档：
                <code className="bg-blue-100 px-1 rounded">docs/agent_extract_instructions.md</code>
                ，里面有完整的 prompt 可直接复制粘贴给 AI
              </li>
            </ol>
            <p>AI 会输出 JSON 文件，在此选择该文件即可导入。</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        <div className="lg:overflow-auto">
          <div className="text-sm font-medium text-gray-600 mb-2">导入任务</div>
          {(jobsData?.items || []).length === 0 ? (
            <div className="text-gray-400 text-sm">暂无任务</div>
          ) : (
            <div className="space-y-2">
              {jobsData?.items.map((j) => (
                <div
                  key={j.id}
                  className={`bg-white border rounded p-3 text-sm hover:border-blue-400 group ${
                    reviewJobId === j.id ? "border-blue-500" : ""
                  }`}
                >
                  <div
                    className="cursor-pointer"
                    onClick={() => setReviewJobId(j.id)}
                  >
                    <div className="flex justify-between">
                      <span className="font-medium truncate">{j.file_name}</span>
                      <span
                        className={
                          j.status === "failed" ? "text-red-600" : "text-gray-500"
                        }
                      >
                        {STATUS_LABEL[j.status] || j.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {j.question_count} 题 · {new Date(j.created_at).toLocaleString()}
                    </div>
                    {j.error_message && (
                      <div className="text-xs text-red-500 mt-1">{j.error_message}</div>
                    )}
                  </div>
                  <div className="flex justify-end mt-1 pt-1 border-t border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`删除导入任务「${j.file_name}」？`)) {
                          deleteJob.mutate(j.id);
                          if (reviewJobId === j.id) setReviewJobId(null);
                        }
                      }}
                      className="text-xs text-red-500 hover:text-red-700 hover:underline"
                    >
                      删除任务
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:overflow-auto">
          {reviewJobId ? (
            <ReviewPanel jobId={reviewJobId} defaultDeckId={defaultDeckId} />
          ) : (
            <div className="text-gray-400 text-sm">选择左侧任务查看归一化结果</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewPanel({ jobId, defaultDeckId }: { jobId: string; defaultDeckId: string }) {
  const qc = useQueryClient();
  const { data: job, isLoading } = useQuery({
    queryKey: ["ingestJob", jobId],
    queryFn: () => api.getJob(jobId),
    enabled: !!jobId,
  });
  const { data: decksData } = useQuery({ queryKey: ["decks"], queryFn: api.listDecks });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deckId, setDeckId] = useState<string>(defaultDeckId);
  const [editing, setEditing] = useState<{ index: number; question: NormalizedQuestion } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const decks = decksData?.items || [];

  if (isLoading) return <div className="text-gray-400 text-sm">加载中...</div>;
  if (!job) return null;

  const toggle = (i: number) => {
    const s = new Set(selected);
    s.has(i) ? s.delete(i) : s.add(i);
    setSelected(s);
  };

  const approve = async (all: boolean) => {
    const indices = all ? [] : Array.from(selected);
    setActionError("");
    try {
      await api.approve(jobId, indices, all, deckId || null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["ingestJobs"] }),
        qc.invalidateQueries({ queryKey: ["ingestJob", jobId] }),
        qc.invalidateQueries({ queryKey: ["questions"] }),
        qc.invalidateQueries({ queryKey: ["decks"] }),
      ]);
      setSelected(new Set());
      setNotice(all ? "已全部入库" : `已入库 ${indices.length} 题，其余题目仍可继续审核`);
    } catch (e: any) {
      setActionError(e.message || "入库失败");
    }
  };

  const saveReviewItem = async (data: Partial<NormalizedQuestion>) => {
    if (!editing) return;
    setSaving(true);
    setActionError("");
    try {
      await api.updateReviewItem(jobId, editing.index, data);
      await qc.invalidateQueries({ queryKey: ["ingestJob", jobId] });
      setNotice(`第 ${editing.index + 1} 题已保存`);
      setEditing(null);
    } catch (e: any) {
      setActionError(e.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-gray-600">
          {job.file_name} · {job.questions.length} 题
        </div>
        {job.status === "pending_review" && (
          <div className="flex gap-2 items-center">
            <select
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            >
              <option value="">不归入题库</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  入库到「{d.name}」
                </option>
              ))}
            </select>
            <button
              onClick={() => approve(false)}
              disabled={selected.size === 0}
              className="px-3 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-50"
            >
              入库选中({selected.size})
            </button>
            <button
              onClick={() => approve(true)}
              className="px-3 py-1 border rounded text-xs hover:bg-gray-50"
            >
              全部入库
            </button>
          </div>
        )}
      </div>
      {notice && (
        <div className="mb-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
          {notice}
        </div>
      )}
      {actionError && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {actionError}
        </div>
      )}
      <div className="space-y-2">
        {job.questions.map((q, i) => (
          <div
            key={i}
            className={`bg-white border rounded p-3 text-sm ${
              selected.has(i) ? "border-blue-500 bg-blue-50" : ""
            }`}
            onClick={() => toggle(i)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-gray-900 flex-1">{q.question_text}</div>
              {job.status === "pending_review" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing({ index: i, question: q });
                  }}
                  className="shrink-0 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
                >
                  编辑
                </button>
              )}
            </div>
            <div className="flex gap-2 mt-1 text-xs text-gray-500">
              <span>{q.question_type}</span>
              <span>{q.difficulty}</span>
              {q.tags?.map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </div>
            {q.standard_answer && (
              <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                答:{q.standard_answer}
              </div>
            )}
          </div>
        ))}
      </div>
      {editing && (
        <ReviewQuestionEditor
          question={editing.question}
          index={editing.index}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={saveReviewItem}
        />
      )}
    </div>
  );
}

function ReviewQuestionEditor({
  question,
  index,
  saving,
  onClose,
  onSave,
}: {
  question: NormalizedQuestion;
  index: number;
  saving: boolean;
  onClose: () => void;
  onSave: (data: Partial<NormalizedQuestion>) => void;
}) {
  const [questionText, setQuestionText] = useState(question.question_text);
  const [questionType, setQuestionType] = useState(question.question_type);
  const [difficulty, setDifficulty] = useState(question.difficulty);
  const [tags, setTags] = useState((question.tags || []).join(", "));
  const [options, setOptions] = useState((question.options || []).join("\n"));
  const [standardAnswer, setStandardAnswer] = useState(question.standard_answer || "");
  const [answerPoints, setAnswerPoints] = useState((question.answer_points || []).join("\n"));
  const [explanation, setExplanation] = useState(question.explanation || "");
  const [groupId, setGroupId] = useState(question.group_id || "");
  const [groupSeq, setGroupSeq] = useState(question.group_seq?.toString() || "");
  const [groupLabel, setGroupLabel] = useState(question.group_label || "");

  const lines = (value: string) => value.split("\n").map((v) => v.trim()).filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[92vh] overflow-auto rounded-xl bg-white p-4 sm:p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`编辑第 ${index + 1} 题`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">编辑第 {index + 1} 题</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">✕</button>
        </div>

        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-gray-600">题干</span>
            <textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} rows={3}
              className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label>
              <span className="text-gray-600">题型</span>
              <select value={questionType} onChange={(e) => setQuestionType(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2">
                <option value="short_answer">简答题</option>
                <option value="single_choice">单选题</option>
                <option value="multiple_choice">多选题</option>
                <option value="coding">编程题</option>
                <option value="essay">论述题</option>
                <option value="behavioral">行为面试</option>
                <option value="case">案例题</option>
                <option value="concept">概念题</option>
              </select>
            </label>
            <label>
              <span className="text-gray-600">难度</span>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2">
                <option value="easy">简单</option>
                <option value="medium">中等</option>
                <option value="hard">困难</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-gray-600">标签（逗号分隔）</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-gray-600">选项（每行一个）</span>
            <textarea value={options} onChange={(e) => setOptions(e.target.value)} rows={3}
              className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-gray-600">标准答案</span>
            <textarea value={standardAnswer} onChange={(e) => setStandardAnswer(e.target.value)} rows={5}
              className="mt-1 w-full rounded border px-3 py-2 font-mono text-xs" />
          </label>
          <label className="block">
            <span className="text-gray-600">评分要点（每行一个）</span>
            <textarea value={answerPoints} onChange={(e) => setAnswerPoints(e.target.value)} rows={3}
              className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-gray-600">解析</span>
            <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={4}
              className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label>
              <span className="text-gray-600">追问链 ID</span>
              <input value={groupId} onChange={(e) => setGroupId(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <label>
              <span className="text-gray-600">链内顺序</span>
              <input type="number" min={1} value={groupSeq} onChange={(e) => setGroupSeq(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <label>
              <span className="text-gray-600">追问链标题</span>
              <input value={groupLabel} onChange={(e) => setGroupLabel(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
            </label>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 border rounded-lg text-sm">取消</button>
          <button
            onClick={() => onSave({
              question_text: questionText.trim(),
              question_type: questionType,
              difficulty,
              tags: tags.split(/[,，]/).map((v) => v.trim()).filter(Boolean),
              options: lines(options).length ? lines(options) : null,
              standard_answer: standardAnswer.trim() || null,
              answer_points: lines(answerPoints),
              explanation: explanation.trim() || null,
              group_id: groupId.trim() || null,
              group_seq: groupSeq ? Number(groupSeq) : null,
              group_label: groupLabel.trim() || null,
            })}
            disabled={saving || !questionText.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存修改"}
          </button>
        </div>
      </div>
    </div>
  );
}
