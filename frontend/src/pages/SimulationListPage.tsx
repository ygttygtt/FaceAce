import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export default function SimulationListPage() {
  const { data } = useQuery({ queryKey: ["sessions"], queryFn: api.listSessions });
  const items = data?.items || [];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">仿真面试</h1>
        <Link
          to="/simulation/new"
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          新建面试
        </Link>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-gray-400 text-sm">暂无面试记录,点击「新建面试」开始。</div>
        ) : (
          items.map((s) => (
            <Link
              key={s.id}
              to={`/simulation/${s.id}`}
              className="block bg-white border rounded p-3 hover:border-blue-400"
            >
              <div className="flex justify-between">
                <span className="font-medium">{s.title}</span>
                <span
                  className={s.status === "active" ? "text-green-600" : "text-gray-500"}
                >
                  {s.status === "active" ? "进行中" : "已结束"}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {new Date(s.created_at).toLocaleString()}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
