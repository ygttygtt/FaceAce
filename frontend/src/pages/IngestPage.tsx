import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { IngestJobDetail } from "../types";

const STATUS_LABEL: Record<string, string> = {
  queued: "排队中",
  extracting: "提取中",
  normalizing: "AI 归一化中",
  pending_review: "待审核",
  done: "已完成",
  failed: "失败",
};

export default function IngestPage() {
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const qc = useQueryClient();
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
    <div className="p-6 h-full flex flex-col">
      <h1 className="text-xl font-bold mb-4">文档导入</h1>

      <div className="grid grid-cols-2 gap-4 mb-4">
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
                <a href="/api/questions/export" target="_blank" className="text-blue-600 hover:underline">导出现有题库</a>
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

      <div className="grid grid-cols-2 gap-4 flex-1 overflow-hidden">
        <div className="overflow-auto">
          <div className="text-sm font-medium text-gray-600 mb-2">导入任务</div>
          {(jobsData?.items || []).length === 0 ? (
            <div className="text-gray-400 text-sm">暂无任务</div>
          ) : (
            <div className="space-y-2">
              {jobsData?.items.map((j) => (
                <div
                  key={j.id}
                  className={`bg-white border rounded p-3 text-sm cursor-pointer hover:border-blue-400 ${
                    reviewJobId === j.id ? "border-blue-500" : ""
                  }`}
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
              ))}
            </div>
          )}
        </div>

        <div className="overflow-auto">
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
    await api.approve(jobId, indices, all, deckId || null);
    qc.invalidateQueries({ queryKey: ["ingestJobs"] });
    qc.invalidateQueries({ queryKey: ["questions"] });
    qc.invalidateQueries({ queryKey: ["decks"] });
    setSelected(new Set());
    alert(all ? "已全部入库" : `已入库 ${indices.length} 题`);
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
      <div className="space-y-2">
        {job.questions.map((q, i) => (
          <div
            key={i}
            className={`bg-white border rounded p-3 text-sm ${
              selected.has(i) ? "border-blue-500 bg-blue-50" : ""
            }`}
            onClick={() => toggle(i)}
          >
            <div className="text-gray-900">{q.question_text}</div>
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
    </div>
  );
}
