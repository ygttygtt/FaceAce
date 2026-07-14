import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Deck, Question } from "../types";

const DIRECTIONS = [
  {
    id: "ai_agent",
    name: "AI Agent 工程师",
    desc: "考察 Agent 架构、工具调用、ReAct/Plan-and-Execute、记忆与状态管理",
    prompt:
      "本次面试目标岗位为 AI Agent 工程师。请重点考察:Agent 架构设计(单/多 Agent)、工具调用与函数编排、ReAct/Plan-and-Execute 等范式、记忆(短期/长期/工作记忆)、异常处理与降级、评估与迭代。",
  },
  {
    id: "llm_finetune",
    name: "大模型微调工程师",
    desc: "考察预训练/SFT/RLHF、LoRA/QLoRA、评测、数据工程",
    prompt:
      "本次面试目标岗位为 LLM 微调工程师。请重点考察:预训练与预训练架构(SFT/DPO/RLHF)、参数高效微调(LoRA/QLoRA/Adapter)、训练数据工程与质量、评测方法与 benchmarks、推理优化与部署。",
  },
  {
    id: "backend",
    name: "通用后端工程师",
    desc: "考察基础架构、数据库、并发、分布式、系统设计",
    prompt:
      "本次面试目标岗位为后端工程师。请重点考察:基础架构、数据库与存储、并发与异步、分布式与微服务、系统设计与工程实践。",
  },
  {
    id: "custom",
    name: "自定义方向",
    desc: "手动填写面试考察重点",
    prompt: "",
  },
];

const PERSONA_PRESETS = [
  { label: "真实中性", value: "保持真实面试风格，不在每轮透露评分或标准答案，只做必要的澄清和追问。" },
  { label: "严格深挖", value: "风格严格、追问深入，重点检查边界条件、工程权衡和候选人是否真正做过。" },
  { label: "友好引导", value: "语气友好，在候选人卡住时给少量方向提示，但不直接给答案。" },
  { label: "压力面试", value: "节奏紧凑，会质疑模糊表述并要求候选人用数据、案例或原理证明观点。" },
];

export default function SimulationPage() {
  const nav = useNavigate();
  const [direction, setDirection] = useState("ai_agent");
  const [customDirection, setCustomDirection] = useState("");
  const [title, setTitle] = useState("模拟面试");
  const [persona, setPersona] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const custom = direction === "custom";
  const dirPrompt = DIRECTIONS.find((d) => d.id === direction)?.prompt || customDirection;
  const roleContext = custom
    ? customDirection || "无特定方向,综合考察"
    : dirPrompt;

  const create = async () => {
    setCreating(true);
    try {
      const s = await api.createSession({
        title,
        role_context: roleContext,
        interviewer_persona: persona || undefined,
        question_pool_ids: selectedIds,
      });
      nav(`/simulation/${s.id}`);
    } catch (e: any) {
      alert(e.message);
    }
    setCreating(false);
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold mb-6">仿真面试 · 工作台</h1>

      {/* 方向选择 */}
      <section className="mb-6">
        <h2 className="text-sm font-medium text-gray-600 mb-2">面试方向</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DIRECTIONS.map((d) => (
            <button
              key={d.id}
              onClick={() => setDirection(d.id)}
              className={`text-left border rounded-lg p-3 transition-colors ${
                direction === d.id
                  ? "border-blue-500 bg-blue-50"
                  : "hover:border-blue-300 bg-white"
              }`}
            >
              <div className="text-sm font-medium">{d.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{d.desc}</div>
            </button>
          ))}
        </div>
        {custom && (
          <textarea
            value={customDirection}
            onChange={(e) => setCustomDirection(e.target.value)}
            rows={3}
            placeholder="描述面试考察方向,如:重点考察候选人在推荐系统落地中的工程权衡能力……"
            className="mt-2 w-full border rounded-lg px-3 py-2 text-sm"
          />
        )}
      </section>

      {/* 题库选题 */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-gray-600">
            题库选题
            <span className="text-xs text-gray-400 font-normal ml-2">
              {selectedIds.length > 0 ? `已选 ${selectedIds.length} 题` : "未选题(面试官将自由出题)"}
            </span>
          </h2>
          <button
            onClick={() => setShowPicker(true)}
            className="text-xs text-blue-600 hover:underline"
          >
            {selectedIds.length > 0 ? "修改选题" : "从题库选择"}
          </button>
        </div>
        {selectedIds.length > 0 && (
          <div className="text-xs text-blue-600">
            面试官将基于所选题目展开追问,也可自然延伸
          </div>
        )}
      </section>

      {/* 面试官风格 */}
      <section className="mb-6">
        <h2 className="text-sm font-medium text-gray-600 mb-2">
          面试官风格
          <span className="text-xs text-gray-400 font-normal ml-1">（可选）</span>
        </h2>
        <div className="flex flex-wrap gap-2 mb-2">
          {PERSONA_PRESETS.map((p) => (
            <button
              type="button"
              key={p.label}
              onClick={() => setPersona(p.value)}
              className={`px-3 py-1 rounded-full border text-xs transition-colors ${
                persona === p.value ? "border-blue-500 bg-blue-50 text-blue-700" : "bg-white hover:border-blue-300"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <textarea
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          rows={3}
          placeholder="补充面试官风格，例如：重视业务落地，会重点追问项目中的个人贡献和量化结果。"
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </section>

      {/* 标题 */}
      <section className="mb-6">
        <h2 className="text-sm font-medium text-gray-600 mb-2">会话标题</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </section>

      <button
        onClick={create}
        disabled={creating || (!custom && !dirPrompt) || (custom && !customDirection.trim())}
        className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {creating ? "创建中..." : "开始面试"}
      </button>

      {/* 选题弹窗 */}
      {showPicker && (
        <QuestionPicker
          selectedIds={selectedIds}
          onConfirm={(ids) => {
            setSelectedIds(ids);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function QuestionPicker({
  selectedIds,
  onConfirm,
  onClose,
}: {
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [deckId, setDeckId] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [qtype, setQtype] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set(selectedIds));

  const { data: decksData } = useQuery({ queryKey: ["decks"], queryFn: api.listDecks });
  const decks: Deck[] = decksData?.items || [];

  const { data } = useQuery({
    queryKey: ["pickerQuestions", deckId, difficulty, qtype],
    queryFn: () =>
      api.listQuestions({
        deck_id: deckId || undefined,
        difficulty: difficulty || undefined,
        qtype: qtype || undefined,
        limit: 200,
      }),
  });
  const items: Question[] = data?.items || [];

  const toggle = (id: string) => {
    const s = new Set(picked);
    s.has(id) ? s.delete(id) : s.add(id);
    setPicked(s);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-bold">从题库选题</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <div className="px-4 pt-3 flex gap-2">
          <select
            value={deckId}
            onChange={(e) => setDeckId(e.target.value)}
            className="border rounded px-2 py-1 text-xs"
          >
            <option value="">全部题库</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="border rounded px-2 py-1 text-xs"
          >
            <option value="">全部难度</option>
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
          <select
            value={qtype}
            onChange={(e) => setQtype(e.target.value)}
            className="border rounded px-2 py-1 text-xs"
          >
            <option value="">全部题型</option>
            <option value="short_answer">简答</option>
            <option value="single_choice">单选</option>
            <option value="coding">编程</option>
            <option value="essay">论述</option>
            <option value="behavioral">行为面</option>
          </select>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-1">
          {items.length === 0 ? (
            <div className="text-gray-400 text-sm text-center py-8">无符合条件的题目</div>
          ) : (
            items.map((q) => (
              <div
                key={q.id}
                onClick={() => toggle(q.id)}
                className={`border rounded p-2 cursor-pointer flex items-start gap-2 ${
                  picked.has(q.id) ? "border-blue-500 bg-blue-50" : "hover:border-blue-300"
                }`}
              >
                <input type="checkbox" checked={picked.has(q.id)} readOnly className="mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{q.question_text}</div>
                  <div className="flex gap-2 text-xs text-gray-500 mt-0.5">
                    <span>{q.question_type}</span>
                    <span>{q.difficulty}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t flex justify-between items-center">
          <span className="text-xs text-gray-500">
            已选 {picked.size} 题 · 留空则面试官自由出题
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onConfirm([])}
              className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
            >
              清空
            </button>
            <button
              onClick={() => onConfirm(Array.from(picked))}
              className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
