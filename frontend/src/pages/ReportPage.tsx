import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import MarkdownView from "../components/MarkdownView";

export default function ReportPage() {
  const { id } = useParams();
  const { data: report, isLoading, error } = useQuery({
    queryKey: ["report", id],
    queryFn: () => api.getReport(id!),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-gray-500">加载报告中...</div>;
  if (error || !report)
    return (
      <div className="p-6">
        <div className="text-gray-500 mb-3">报告尚未生成或加载失败。</div>
        <Link to={`/simulation/${id}`} className="text-blue-600 hover:underline">
          返回面试
        </Link>
      </div>
    );

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">面试报告</h1>
        <Link to="/simulation" className="text-sm text-blue-600 hover:underline">
          返回列表
        </Link>
      </div>

      <div className="bg-white border rounded p-6 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="text-4xl font-bold text-blue-600">
            {report.overall_score}
          </div>
          <div className="text-gray-500">综合得分 / 100</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">总体评价</div>
          <MarkdownView>{report.overall_summary}</MarkdownView>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border rounded p-4">
          <div className="text-sm font-medium text-green-700 mb-2">优点</div>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {report.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="bg-white border rounded p-4">
          <div className="text-sm font-medium text-red-700 mb-2">不足</div>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {report.weaknesses.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-white border rounded p-4 mb-4">
        <div className="text-sm font-medium text-gray-700 mb-2">改进建议</div>
        <ul className="list-disc pl-5 text-sm space-y-1">
          {report.improvement_suggestions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>

      {report.question_feedbacks.length > 0 && (
        <div className="bg-white border rounded p-4">
          <div className="text-sm font-medium text-gray-700 mb-2">各题反馈</div>
          <div className="space-y-3">
            {report.question_feedbacks.map((q, i) => (
              <div key={i} className="border-l-2 border-blue-300 pl-3">
                <div className="text-sm font-medium">
                  {q.question}{" "}
                  <span className="text-gray-400">({q.score}分)</span>
                </div>
                <div className="text-sm text-gray-600">{q.feedback}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
