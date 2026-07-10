import { useState } from "react";
import { api } from "../lib/api";
import MarkdownView from "./MarkdownView";

interface Props {
  questionId: string;
  currentAnswer: string | null;
  onSaved: (newAnswer: string | null) => void;
  onClose: () => void;
}

export default function AnswerEditor({ questionId, currentAnswer, onSaved, onClose }: Props) {
  const [answer, setAnswer] = useState(currentAnswer || "");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const val = answer.trim() || null;
      await api.updateAnswerOverride(questionId, val);
      onSaved(val);
      onClose();
    } catch (e: any) {
      alert(e.message);
    }
    setSaving(false);
  };

  const reset = async () => {
    if (!confirm("恢复为标准答案?")) return;
    setSaving(true);
    try {
      await api.updateAnswerOverride(questionId, null);
      onSaved(null);
      onClose();
    } catch (e: any) {
      alert(e.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="font-bold text-lg">编辑答案</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setPreview(false)}
              className={`px-3 py-1 text-sm rounded ${!preview ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}
            >
              编辑
            </button>
            <button
              onClick={() => setPreview(true)}
              className={`px-3 py-1 text-sm rounded ${preview ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}
            >
              预览
            </button>
          </div>
          {preview ? (
            <div className="border rounded p-3 min-h-[200px]">
              <MarkdownView>{answer || "（空答案）"}</MarkdownView>
            </div>
          ) : (
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={12}
              placeholder="修改或完善答案(Markdown 格式)..."
              className="w-full border rounded p-2 text-sm font-mono"
            />
          )}
        </div>
        <div className="flex justify-between p-4 border-t">
          <button onClick={reset} className="text-red-600 text-sm hover:underline" disabled={!currentAnswer}>
            恢复标准答案
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 border rounded text-sm">取消</button>
            <button onClick={save} disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
              {saving ? "保存中..." : "保存修改"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
