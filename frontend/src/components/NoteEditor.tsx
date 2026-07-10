import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Props {
  questionId: string;
  onClose: () => void;
}

export default function NoteEditor({ questionId, onClose }: Props) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.getNote(questionId).then((r) => {
      setContent(r.content || "");
      setLoaded(true);
    });
  }, [questionId]);

  const save = async () => {
    setSaving(true);
    try {
      await api.upsertNote(questionId, content);
      onClose();
    } catch (e: any) {
      alert(e.message);
    }
    setSaving(false);
  };

  const del = async () => {
    if (!confirm("删除此笔记?")) return;
    try {
      await api.deleteNote(questionId);
      setContent("");
      onClose();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-lg">个人笔记</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        {!loaded ? (
          <div className="text-gray-400 text-sm">加载中...</div>
        ) : (
          <>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder="记录这道题的心得、易错点、记忆技巧..."
              className="w-full border rounded p-2 text-sm"
            />
            <div className="flex justify-between mt-3">
              <button onClick={del} className="text-red-600 text-sm hover:underline" disabled={!content}>
                删除笔记
              </button>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-3 py-1.5 border rounded text-sm">取消</button>
                <button onClick={save} disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
