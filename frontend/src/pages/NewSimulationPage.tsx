import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function NewSimulationPage() {
  const nav = useNavigate();
  const [title, setTitle] = useState("模拟面试");
  const [roleContext, setRoleContext] = useState("");
  const [persona, setPersona] = useState("");
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      const s = await api.createSession({
        title,
        role_context: roleContext || undefined,
        interviewer_persona: persona || undefined,
      });
      nav(`/simulation/${s.id}`);
    } catch (e: any) {
      alert(e.message);
    }
    setCreating(false);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4">新建仿真面试</h1>
      <div className="bg-white border rounded p-4 space-y-4">
        <label className="block text-sm">
          <span className="text-gray-600">会话标题</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="block border rounded px-3 py-1.5 mt-1 w-full"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">
            岗位/简历背景(可选,帮助面试官贴合岗位)
          </span>
          <textarea
            value={roleContext}
            onChange={(e) => setRoleContext(e.target.value)}
            rows={4}
            placeholder="如:3 年前端,求职高级前端,熟悉 React/Vue,项目经历..."
            className="block border rounded px-3 py-1.5 mt-1 w-full"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">
            面试官人设(可选,留空用默认严格面试官)
          </span>
          <textarea
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            rows={4}
            placeholder="自定义 system prompt,如:你是一位温柔鼓励型的面试官..."
            className="block border rounded px-3 py-1.5 mt-1 w-full"
          />
        </label>
        <button
          onClick={create}
          disabled={creating}
          className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? "创建中..." : "开始面试"}
        </button>
      </div>
    </div>
  );
}
