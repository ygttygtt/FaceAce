import { useEffect, useRef } from "react";
import MarkdownView from "./MarkdownView";
import type { GradingResult } from "../types";
import { VERDICT_LABELS, labelOf } from "../lib/labels";

const VERDICT_COLOR: Record<string, string> = {
  correct: "bg-green-100 text-green-700",
  partially_correct: "bg-yellow-100 text-yellow-700",
  incorrect: "bg-red-100 text-red-700",
};

interface Props {
  streamingText: string;
  result: GradingResult | null;
  error: string | null;
  done: boolean;
}

export default function StreamingGrade({ streamingText, result, error, done }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamingText, result]);

  if (error) {
    return <div className="text-red-600 text-sm p-3 bg-red-50 rounded">{error}</div>;
  }

  return (
    <div className="border-t pt-3 space-y-2">
      {streamingText && (
        <div>
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            AI 正在批改...
          </div>
          <div className="bg-gray-50 rounded p-3 text-sm max-h-60 overflow-auto">
            <MarkdownView>{streamingText}</MarkdownView>
          </div>
        </div>
      )}

      {done && result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-sm font-bold ${VERDICT_COLOR[result.verdict] || ""}`}>
              {labelOf(VERDICT_LABELS, result.verdict)}
            </span>
            <span className="text-lg font-bold">{result.score} 分</span>
          </div>
          {result.strengths?.length > 0 && (
            <div>
              <div className="text-xs text-green-700 font-medium">优点</div>
              <ul className="list-disc pl-5 text-sm">
                {result.strengths.map((s, i) => (<li key={i}>{s}</li>))}
              </ul>
            </div>
          )}
          {result.weaknesses?.length > 0 && (
            <div>
              <div className="text-xs text-red-700 font-medium">不足</div>
              <ul className="list-disc pl-5 text-sm">
                {result.weaknesses.map((s, i) => (<li key={i}>{s}</li>))}
              </ul>
            </div>
          )}
          {result.missing_points?.length > 0 && (
            <div>
              <div className="text-xs text-gray-600 font-medium">未覆盖要点</div>
              <ul className="list-disc pl-5 text-sm">
                {result.missing_points.map((s, i) => (<li key={i}>{s}</li>))}
              </ul>
            </div>
          )}
          <div>
            <div className="text-xs text-gray-600 mb-1 font-medium">详细点评</div>
            <MarkdownView>{result.detailed_feedback}</MarkdownView>
          </div>
          {result.improved_answer && (
            <div>
              <div className="text-xs text-gray-600 mb-1 font-medium">参考改进答案</div>
              <MarkdownView>{result.improved_answer}</MarkdownView>
            </div>
          )}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
