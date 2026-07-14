import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import MarkdownView from "../components/MarkdownView";
import type { GradingResult } from "../types";
import { VERDICT_LABELS, labelOf } from "../lib/labels";

const VERDICT_COLOR: Record<string, string> = {
  correct: "bg-green-100 text-green-700",
  partially_correct: "bg-yellow-100 text-yellow-700",
  incorrect: "bg-red-100 text-red-700",
};

export default function PracticeDetailPage() {
  const { recordId } = useParams<{ recordId: string }>();
  const nav = useNavigate();

  const { data: detail, isLoading } = useQuery({
    queryKey: ["practiceDetail", recordId],
    queryFn: () => api.getPracticeRecordDetail(recordId!),
    enabled: !!recordId,
  });

  if (isLoading) return <div className="p-6 text-gray-500">加载中...</div>;
  if (!detail) return <div className="p-6 text-gray-500">记录不存在</div>;

  const g: GradingResult | null = detail.grading ?? null;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button onClick={() => nav(-1)} className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        ← 返回历史记录
      </button>

      {/* question */}
      <div className="bg-white border rounded-lg p-6 mb-4 shadow-sm">
        <div className="text-xs text-gray-500 mb-2">
          {new Date(detail.created_at).toLocaleString()} · 用时 {detail.duration_sec}s
        </div>
        <div className="text-base text-gray-900 whitespace-pre-wrap leading-relaxed mb-4">
          {detail.question?.question_text || (detail as any).question_text || "（题目已删除）"}
        </div>
        {detail.question?.standard_answer && (
          <div>
            <div className="text-xs text-gray-500 mb-1 font-medium">标准答案</div>
            <MarkdownView>{detail.question.standard_answer}</MarkdownView>
          </div>
        )}
      </div>

      {/* user answer */}
      <div className="bg-white border rounded-lg p-6 mb-4 shadow-sm">
        <div className="text-xs text-gray-500 mb-1 font-medium">我的答案</div>
        <div className="text-sm whitespace-pre-wrap">{detail.user_answer || "（未作答）"}</div>
      </div>

      {/* grading result */}
      {g && (
        <div className="bg-white border rounded-lg p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded text-sm font-bold ${VERDICT_COLOR[g.verdict] || ""}`}>
              {labelOf(VERDICT_LABELS, g.verdict)}
            </span>
            <span className="text-2xl font-bold">{g.score} 分</span>
          </div>

          {g.strengths?.length > 0 && (
            <div>
              <div className="text-sm text-green-700 font-medium mb-1">优点</div>
              <ul className="list-disc pl-5 text-sm space-y-0.5">
                {g.strengths.map((s, i) => (<li key={i}>{s}</li>))}
              </ul>
            </div>
          )}
          {g.weaknesses?.length > 0 && (
            <div>
              <div className="text-sm text-red-700 font-medium mb-1">不足</div>
              <ul className="list-disc pl-5 text-sm space-y-0.5">
                {g.weaknesses.map((s, i) => (<li key={i}>{s}</li>))}
              </ul>
            </div>
          )}
          {g.missing_points?.length > 0 && (
            <div>
              <div className="text-sm text-gray-600 font-medium mb-1">未覆盖要点</div>
              <ul className="list-disc pl-5 text-sm space-y-0.5">
                {g.missing_points.map((s, i) => (<li key={i}>{s}</li>))}
              </ul>
            </div>
          )}

          <div>
            <div className="text-sm text-gray-600 font-medium mb-1">详细点评</div>
            <MarkdownView>{g.detailed_feedback}</MarkdownView>
          </div>

          {g.improved_answer && (
            <div>
              <div className="text-sm text-gray-600 font-medium mb-1">参考改进答案</div>
              <div className="bg-blue-50 rounded-lg p-4">
                <MarkdownView>{g.improved_answer}</MarkdownView>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
