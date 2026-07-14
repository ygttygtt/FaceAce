import { useEffect, useState } from "react";
import MarkdownView from "./MarkdownView";
import type { Question } from "../types";
import { DIFFICULTY_LABELS, QUESTION_TYPE_LABELS, labelOf } from "../lib/labels";

function difficultyColor(d: string): string {
  if (d === "easy") return "bg-green-100 text-green-700";
  if (d === "hard") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-700";
}

interface Props {
  question: Question;
  onRevealed?: () => void;
  customAnswer?: string | null;
  onEditAnswer?: () => void;
  onOpenNote?: () => void;
}

export default function RevealCard({ question, onRevealed, customAnswer, onEditAnswer, onOpenNote }: Props) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return; // 打字时不抢空格
      if (e.code === "Space" && !revealed) {
        e.preventDefault();
        setRevealed(true);
        onRevealed?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, onRevealed]);

  const reveal = () => {
    setRevealed(true);
    onRevealed?.();
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">
          {labelOf(QUESTION_TYPE_LABELS, question.question_type)}
        </span>
        <span className={`px-2 py-0.5 rounded ${difficultyColor(question.difficulty)}`}>
          {labelOf(DIFFICULTY_LABELS, question.difficulty)}
        </span>
        {question.tags?.map((t) => (
          <span key={t} className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">
            {t}
          </span>
        ))}
      </div>

      <div className="text-base text-gray-900 whitespace-pre-wrap leading-relaxed">
        {question.question_text}
      </div>

      {question.options && (
        <ul className="text-sm text-gray-700 space-y-1">
          {question.options.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
      )}

      <div className="border-t pt-4">
        {!revealed ? (
          <div className="text-center py-6">
            <div className="text-gray-400 mb-3 text-sm">先思考,准备好再看答案</div>
            <button
              onClick={reveal}
              className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              点击揭晓答案(或按空格)
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-gray-500 mb-1 font-medium">
                  {customAnswer ? "答案（已自定义）" : "标准答案"}
                </div>
                {onEditAnswer && (
                  <button type="button" onClick={onEditAnswer}
                    className="text-xs text-blue-600 hover:underline mb-1">
                    {customAnswer ? "编辑" : "完善答案"}
                  </button>
                )}
                {onOpenNote && (
                  <button type="button" onClick={onOpenNote}
                    className="text-xs text-gray-500 hover:underline mb-1">
                    笔记
                  </button>
                )}
              </div>
              <MarkdownView>{customAnswer || question.standard_answer || "(本题无标准答案)"}</MarkdownView>
            </div>
            {question.explanation && (
              <div>
                <div className="text-xs text-gray-500 mb-1 font-medium">解析</div>
                <MarkdownView>{question.explanation}</MarkdownView>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
