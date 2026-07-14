import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getVoices, ttsSpeak, ttsAvailable } from "../lib/tts";
import { playCloudTts, stopCloudTts, MIMO_VOICES } from "../lib/ttsCloud";
import type { LLMProfile, PromptTemplate, UserConfig } from "../types";

const EMPTY_PROFILE = {
  name: "",
  base_url: "https://api.deepseek.com/v1",
  api_key: "",
  model: "deepseek-v4-flash",
  temperature: 0.7,
  max_tokens: 2048,
  is_default: true,
  supports_json_schema: false,
};

type ProviderPreset = {
  id: string;
  name: string;
  provider: string;
  description: string;
  base_url: string;
  model: string;
  apply_url: string;
  docs_url: string;
  badge?: string;
};

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "deepseek",
    name: "DeepSeek V4 Flash",
    provider: "DeepSeek 官方",
    description: "使用人数多、价格低，适合作为日常默认模型。",
    base_url: "https://api.deepseek.com/v1",
    model: "deepseek-v4-flash",
    apply_url: "https://platform.deepseek.com/api_keys",
    docs_url: "https://api-docs.deepseek.com/",
    badge: "推荐",
  },
  {
    id: "longcat",
    name: "LongCat 2.0",
    provider: "美团龙猫",
    description: "OpenAI 兼容接口，近期活动和免费额度以开放平台为准。",
    base_url: "https://api.longcat.chat/openai/v1",
    model: "LongCat-2.0",
    apply_url: "https://longcat.chat/platform/",
    docs_url: "https://longcat.chat/platform/docs/zh",
    badge: "活动额度",
  },
  {
    id: "sensenova",
    name: "DeepSeek V4 Flash",
    provider: "商汤日日新",
    description: "日日新 Token Plan 接口，默认使用 DeepSeek V4 Flash。",
    base_url: "https://token.sensenova.cn/v1",
    model: "deepseek-v4-flash",
    apply_url: "https://platform.sensenova.cn/console/keys",
    docs_url: "https://platform.sensenova.cn/docs",
    badge: "免费额度",
  },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<"llm" | "prompts" | "tts">("llm");
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4">设置</h1>
      <div className="flex gap-2 mb-4 border-b">
        {([
          ["llm", "LLM 配置"],
          ["prompts", "Prompt 模板"],
          ["tts", "TTS & 偏好"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              tab === k
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "llm" && <LLMSection />}
      {tab === "prompts" && <PromptsSection />}
      {tab === "tts" && <TTSSection />}
    </div>
  );
}

function LLMSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["profiles"], queryFn: api.listProfiles });
  const [editing, setEditing] = useState<LLMProfile | null>(null);
  const [form, setForm] = useState<any>(EMPTY_PROFILE);
  const [testResult, setTestResult] = useState<string>("");
  const [testing, setTesting] = useState(false);
  const [quickKeys, setQuickKeys] = useState<Record<string, string>>({});
  const [quickResult, setQuickResult] = useState<Record<string, string>>({});
  const [quickModels, setQuickModels] = useState<Record<string, string[]>>({});
  const [quickSelectedModels, setQuickSelectedModels] = useState<Record<string, string>>({});
  const [discoveringPreset, setDiscoveringPreset] = useState<string | null>(null);
  const [customModels, setCustomModels] = useState<string[]>([EMPTY_PROFILE.model]);
  const [discoveringCustom, setDiscoveringCustom] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const profiles = data?.items || [];

  const save = useMutation({
    mutationFn: async (p: any) => {
      if (editing) return api.updateProfile(editing.id, p);
      return api.createProfile(p);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles"] });
      setEditing(null);
      setForm(EMPTY_PROFILE);
      setShowAdvanced(false);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api.deleteProfile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });

  const startEdit = (p: LLMProfile) => {
    setEditing(p);
    setForm({ ...p, api_key: "" });
    setCustomModels([p.model]);
    setTestResult("");
    setShowAdvanced(true);
  };

  const quickSave = useMutation({
    mutationFn: async ({ preset, apiKey, model }: { preset: ProviderPreset; apiKey: string; model: string }) => {
      const existing = profiles.find((p) => p.base_url === preset.base_url);
      const payload = {
        name: `${preset.provider} · ${model}`,
        base_url: preset.base_url,
        api_key: apiKey.trim(),
        model,
        temperature: 0.7,
        max_tokens: 4096,
        is_default: true,
        supports_json_schema: false,
      };
      const saved = existing
        ? await api.updateProfile(existing.id, payload)
        : await api.createProfile(payload);
      const tested = await api.testProfile(saved.id);
      return { saved, tested };
    },
    onSuccess: ({ tested }, { preset }) => {
      qc.invalidateQueries({ queryKey: ["profiles"] });
      setQuickKeys((keys) => ({ ...keys, [preset.id]: "" }));
      setQuickResult((results) => ({
        ...results,
        [preset.id]: tested.ok
          ? `✓ 已保存为默认配置，连接成功：${tested.reply}`
          : `配置已保存，但连接测试失败：${tested.message}`,
      }));
    },
    onError: (e: any, { preset }) => {
      setQuickResult((results) => ({
        ...results,
        [preset.id]: `✗ ${e.message || "保存失败"}`,
      }));
    },
  });

  const discoverPresetModels = async (preset: ProviderPreset, existing?: LLMProfile) => {
    const key = (quickKeys[preset.id] || "").trim();
    if (!key && !existing) {
      setQuickResult((result) => ({ ...result, [preset.id]: "请先填写 API Key" }));
      return;
    }
    setDiscoveringPreset(preset.id);
    setQuickResult((result) => ({ ...result, [preset.id]: "" }));
    try {
      const discovered = await api.discoverModels({
        base_url: preset.base_url,
        api_key: key || undefined,
        profile_id: existing?.id,
      });
      setQuickResult((result) => ({ ...result, [preset.id]: discovered.message }));
      if (discovered.ok) {
        setQuickModels((models) => ({ ...models, [preset.id]: discovered.models }));
        const current = quickSelectedModels[preset.id] || existing?.model || preset.model;
        const next = discovered.models.includes(current) ? current : discovered.models[0];
        setQuickSelectedModels((models) => ({ ...models, [preset.id]: next }));
      }
    } catch (e: any) {
      setQuickResult((result) => ({ ...result, [preset.id]: `✗ ${e.message}` }));
    } finally {
      setDiscoveringPreset(null);
    }
  };

  const discoverCustomModels = async () => {
    if (!form.base_url?.trim()) {
      setTestResult("请先填写 Base URL");
      return;
    }
    setDiscoveringCustom(true);
    setTestResult("");
    try {
      const discovered = await api.discoverModels({
        base_url: form.base_url,
        api_key: form.api_key || undefined,
        profile_id: editing?.id,
      });
      setTestResult(discovered.ok ? `✓ ${discovered.message}` : `✗ ${discovered.message}`);
      if (discovered.ok) {
        setCustomModels(discovered.models);
        const model = discovered.models.includes(form.model) ? form.model : discovered.models[0];
        setForm({ ...form, model });
      }
    } catch (e: any) {
      setTestResult(`✗ ${e.message}`);
    } finally {
      setDiscoveringCustom(false);
    }
  };

  const test = async () => {
    if (!editing) {
      setTestResult("请先保存后再测试");
      return;
    }
    setTesting(true);
    setTestResult("");
    try {
      const r = await api.testProfile(editing.id);
      setTestResult(r.ok ? `✓ 连接成功:${r.reply}` : `✗ ${r.message}`);
    } catch (e: any) {
      setTestResult(`✗ ${e.message}`);
    }
    setTesting(false);
  };

  return (
    <div className="space-y-4">
      <section>
        <div className="mb-2">
          <div className="text-sm font-medium text-gray-800">快速配置</div>
          <div className="text-xs text-gray-500 mt-0.5">
            选择服务商后只需填写 API Key。保存成功后会自动设为默认并测试连接。
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {PROVIDER_PRESETS.map((preset) => {
            const existing = profiles.find((p) => p.base_url === preset.base_url);
            const configured = Boolean(existing?.has_api_key);
            const savingThis = quickSave.isPending && quickSave.variables?.preset.id === preset.id;
            const models = quickModels[preset.id] || [existing?.model || preset.model];
            const selectedModel = quickSelectedModels[preset.id] || existing?.model || preset.model;
            return (
              <div key={preset.id} className="bg-white border rounded-xl p-4 flex flex-col gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm">{preset.provider}</div>
                    {preset.badge && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                        {preset.badge}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-medium text-gray-700 mt-1">{preset.name}</div>
                  <div className="text-xs text-gray-500 mt-1 leading-relaxed">{preset.description}</div>
                  <div className="mt-2 flex gap-3 text-xs">
                    <a href={preset.apply_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                      申请 API Key ↗
                    </a>
                    <a href={preset.docs_url} target="_blank" rel="noreferrer" className="text-gray-500 hover:underline">
                      查看文档
                    </a>
                  </div>
                </div>
                <div className="mt-auto">
                  <input
                    type="password"
                    value={quickKeys[preset.id] || ""}
                    onChange={(e) => setQuickKeys((keys) => ({ ...keys, [preset.id]: e.target.value }))}
                    placeholder={configured ? "输入新 Key 可更新现有配置" : "粘贴 API Key"}
                    autoComplete="new-password"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => discoverPresetModels(preset, existing)}
                    disabled={discoveringPreset === preset.id || (!(quickKeys[preset.id] || "").trim() && !existing)}
                    className="mt-2 w-full rounded-lg border px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                  >
                    {discoveringPreset === preset.id ? "检测中..." : "检测 Key / URL 并获取模型"}
                  </button>
                  <label className="block mt-2">
                    <span className="text-xs text-gray-500">使用模型</span>
                    <select
                      value={selectedModel}
                      onChange={(e) => setQuickSelectedModels((selected) => ({ ...selected, [preset.id]: e.target.value }))}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                    >
                      {models.map((model) => <option key={model} value={model}>{model}</option>)}
                    </select>
                  </label>
                  <button
                    onClick={() => quickSave.mutate({
                      preset,
                      apiKey: quickKeys[preset.id] || "",
                      model: selectedModel,
                    })}
                    disabled={savingThis || (!(quickKeys[preset.id] || "").trim() && !existing) || !selectedModel}
                    className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingThis ? "保存并测试中..." : configured ? "更新并设为默认" : "保存并设为默认"}
                  </button>
                  {quickResult[preset.id] && (
                    <div className={`mt-2 text-xs ${quickResult[preset.id].startsWith("✓") ? "text-green-700" : "text-amber-700"}`}>
                      {quickResult[preset.id]}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-[11px] text-gray-400">
          免费额度和活动规则可能调整，请以各服务商申请页面展示为准。
        </div>
      </section>

      <div className="text-sm font-medium text-gray-800 pt-2">已保存配置</div>
      {profiles.map((p) => (
        <div key={p.id} className="bg-white border rounded p-3 flex justify-between items-center">
          <div>
            <div className="font-medium text-sm">
              {p.name} {p.is_default && <span className="text-xs text-blue-600">(默认)</span>}
            </div>
            <div className="text-xs text-gray-500">
              {p.model} · {p.base_url} {p.has_api_key ? `· ${p.api_key_masked}` : "· 未设 key"}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => startEdit(p)} className="text-xs text-blue-600 hover:underline">
              编辑
            </button>
            <button
              onClick={() => { if (confirm("删除该 profile?")) del.mutate(p.id); }}
              className="text-xs text-red-600 hover:underline"
            >
              删除
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => {
          setShowAdvanced((v) => !v);
          if (showAdvanced && editing) {
            setEditing(null);
            setForm(EMPTY_PROFILE);
            setCustomModels([EMPTY_PROFILE.model]);
          }
        }}
        className="text-sm text-blue-600 hover:underline"
      >
        {showAdvanced ? "收起高级自定义配置" : "＋ 高级自定义配置"}
      </button>

      {showAdvanced && <div className="bg-white border rounded p-4 space-y-3">
        <div className="text-sm font-medium">{editing ? "编辑 profile" : "新增 profile"}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Field label="名称" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field
            label="Base URL"
            value={form.base_url}
            onChange={(v) => setForm({ ...form, base_url: v })}
            full
          />
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={discoverCustomModels}
              disabled={discoveringCustom || !form.base_url?.trim()}
              className="px-3 py-1.5 border rounded text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"
            >
              {discoveringCustom ? "检测中..." : "检测 Key / URL 并获取可用模型"}
            </button>
            <span className="text-xs text-gray-400">已保存配置可留空 API Key，系统会使用原 Key 检测。</span>
          </div>
          <SelectField
            label="模型"
            value={form.model}
            options={customModels}
            onChange={(v) => setForm({ ...form, model: v })}
            full
          />
          <Field
            label={editing ? "API Key(留空则不变)" : "API Key"}
            value={form.api_key}
            onChange={(v) => setForm({ ...form, api_key: v })}
            full
          />
          <Field
            label="Temperature"
            value={String(form.temperature)}
            onChange={(v) => setForm({ ...form, temperature: Number(v) })}
          />
          <Field
            label="Max Tokens"
            value={String(form.max_tokens)}
            onChange={(v) => setForm({ ...form, max_tokens: Number(v) })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
          />
          设为默认
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.supports_json_schema}
            onChange={(e) => setForm({ ...form, supports_json_schema: e.target.checked })}
          />
          支持 response_format json_schema(部分模型不支持,默认关)
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => save.mutate(form)}
            disabled={!form.name || !form.base_url || !form.model}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
          >
            保存
          </button>
          {editing && (
            <button onClick={test} disabled={testing} className="px-3 py-1.5 border rounded text-sm">
              {testing ? "测试中..." : "测试连接"}
            </button>
          )}
          {editing && (
            <button
              onClick={() => { setEditing(null); setForm(EMPTY_PROFILE); }}
              className="px-3 py-1.5 border rounded text-sm"
            >
              取消
            </button>
          )}
        </div>
        {testResult && <div className="text-xs text-gray-600">{testResult}</div>}
      </div>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  full?: boolean;
}) {
  return (
    <label className={full ? "sm:col-span-2" : ""}>
      <span className="text-gray-600 text-xs">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block border rounded px-2 py-1.5 mt-1 w-full"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  full,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  full?: boolean;
}) {
  const values = Array.from(new Set([value, ...options].filter(Boolean)));
  return (
    <label className={full ? "sm:col-span-2" : ""}>
      <span className="text-gray-600 text-xs">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block border rounded px-2 py-1.5 mt-1 w-full"
      >
        {values.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function PromptsSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["prompts"], queryFn: api.listPrompts });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [content, setContent] = useState("");

  const items = data?.items || [];
  const selected = items.find((p) => p.key === selectedKey) || items[0];

  useEffect(() => {
    if (selected) setContent(selected.content);
  }, [selected?.key]);

  const save = useMutation({
    mutationFn: ({ key, content }: { key: string; content: string }) =>
      api.updatePrompt(key, { content }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompts"] }),
  });

  if (items.length === 0) return <div className="text-gray-400 text-sm">加载中...</div>;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {items.map((p: PromptTemplate) => (
          <button
            key={p.key}
            onClick={() => setSelectedKey(p.key)}
            className={`px-3 py-1 rounded text-sm ${
              selected?.key === p.key ? "bg-blue-600 text-white" : "bg-white border"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>
      {selected && (
        <div>
          <div className="text-xs text-gray-400 mb-1">
            变量:{selected.variables.map((v) => `{{${v}}}`).join("  ")}
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={18}
            className="w-full border rounded p-2 text-xs font-mono"
          />
          <button
            onClick={() => save.mutate({ key: selected.key, content })}
            className="mt-2 px-3 py-1.5 bg-blue-600 text-white rounded text-sm"
          >
            保存
          </button>
        </div>
      )}
    </div>
  );
}

function TTSSection() {
  const qc = useQueryClient();
  const { data: userConfig } = useQuery({ queryKey: ["userConfig"], queryFn: api.getUser });
  const { data: profiles } = useQuery({ queryKey: ["profiles"], queryFn: api.listProfiles });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [testText, setTestText] = useState("你好，欢迎参加今天的面试，请简单做一下自我介绍。");
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    const load = () => setVoices(getVoices());
    load();
    if (ttsAvailable()) window.speechSynthesis.onvoiceschanged = load;
  }, []);

  const update = useMutation({
    mutationFn: (data: Partial<UserConfig>) => api.updateUser(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["userConfig"] }),
  });

  const stopTts = () => {
    if (ttsAvailable()) window.speechSynthesis.cancel();
    stopCloudTts();
    setSpeaking(false);
  };

  const playLocal = () => {
    if (!ttsAvailable() || !testText.trim()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(testText);
    u.lang = "zh-CN";
    u.rate = userConfig?.tts_rate ?? 1.0;
    if (userConfig?.tts_voice) {
      const v = voices.find((v) => v.voiceURI === userConfig.tts_voice);
      if (v) u.voice = v;
    }
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  const playCloud = async () => {
    if (!testText.trim()) return;
    setSpeaking(true);
    try {
      await playCloudTts(testText, userConfig?.tts_voice || "Chloe");
    } catch (e: any) {
      alert("云端 TTS 失败: " + e.message);
    }
    setSpeaking(false);
  };

  if (!userConfig) return <div className="text-gray-400 text-sm">加载中...</div>;

  const currentVoice = voices.find((v) => v.voiceURI === userConfig.tts_voice);
  const ttsMode = userConfig.tts_cloud_provider || "local";

  return (
    <div className="bg-white border rounded p-4 space-y-4 text-sm">
      <div>
        <div className="font-medium mb-2">LLM 默认 profile</div>
        <select
          value={userConfig.active_llm_profile_id || ""}
          onChange={(e) => update.mutate({ active_llm_profile_id: e.target.value })}
          className="border rounded px-2 py-1.5"
        >
          {(profiles?.items || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="border-t pt-4">
        <div className="font-medium mb-2">语音朗读 (TTS)</div>

        {/* TTS mode selector */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => update.mutate({ tts_cloud_provider: null })}
            className={`px-3 py-1.5 rounded text-sm border transition-colors ${
              ttsMode === "local" ? "bg-blue-100 border-blue-300 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            本地语音（浏览器自带）
          </button>
          <button
            onClick={() => update.mutate({ tts_cloud_provider: "mimo" })}
            className={`px-3 py-1.5 rounded text-sm border transition-colors ${
              ttsMode === "mimo" ? "bg-blue-100 border-blue-300 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            云端语音（mimo TTS）
          </button>
        </div>

        {/* Local TTS settings */}
        {ttsMode === "local" && (
          <div className="space-y-3">
            {!ttsAvailable() ? (
              <div className="text-xs text-red-500">当前浏览器不支持 Web Speech API，建议用 Chrome/Edge。</div>
            ) : (
              <>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={userConfig.tts_enabled}
                    onChange={(e) => update.mutate({ tts_enabled: e.target.checked })}
                  />
                  启用 TTS（朗读面试官消息）
                </label>
                <label className="block">
                  <span className="text-gray-600 text-xs">语音</span>
                  <select
                    value={userConfig.tts_voice}
                    onChange={(e) => update.mutate({ tts_voice: e.target.value })}
                    className="block border rounded px-2 py-1.5 mt-1 w-full"
                  >
                    <option value="">系统默认</option>
                    {voices
                      .filter((v) => v.lang.startsWith("zh") || v.lang.startsWith("cmn"))
                      .map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                      ))}
                  </select>
                  {voices.filter((v) => v.lang.startsWith("zh")).length === 0 && (
                    <span className="text-xs text-gray-400">
                      未检测到中文语音，Windows 可在系统「设置-时间和语言-语音」安装中文语音包。
                    </span>
                  )}
                </label>
                <label className="block">
                  <span className="text-gray-600 text-xs">语速 ({userConfig.tts_rate}x)</span>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={userConfig.tts_rate}
                    onChange={(e) => update.mutate({ tts_rate: Number(e.target.value) })}
                    className="block w-full mt-1"
                  />
                </label>
                {currentVoice && (
                  <div className="text-xs text-gray-400">当前语音: {currentVoice.name}（{currentVoice.lang}）</div>
                )}
              </>
            )}
          </div>
        )}

        {/* Cloud TTS settings */}
        {ttsMode === "mimo" && (
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={userConfig.tts_enabled}
                onChange={(e) => update.mutate({ tts_enabled: e.target.checked })}
              />
              启用 TTS（朗读面试官消息）
            </label>
            <label className="block">
              <span className="text-gray-600 text-xs">语音角色</span>
              <select
                value={userConfig.tts_voice}
                onChange={(e) => update.mutate({ tts_voice: e.target.value })}
                className="block border rounded px-2 py-1.5 mt-1 w-full"
              >
                {MIMO_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
            </label>
            <div className="text-xs text-gray-400">
              使用 mimo-v2.5-tts 模型，通过 LLM profile 的 API Key 调用。音质远好于本地语音。
            </div>
          </div>
        )}

        {/* Test area */}
        <div className="border-t pt-3 mt-3">
          <div className="text-xs text-gray-500 mb-1.5">试听测试</div>
          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            rows={2}
            className="w-full border rounded p-2 text-sm"
          />
          <div className="flex gap-2 mt-2">
            {ttsMode === "mimo" ? (
              <button
                onClick={playCloud}
                disabled={speaking || !testText.trim()}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
              >
                {speaking ? "生成中..." : "播放（云端）"}
              </button>
            ) : (
              <button
                onClick={playLocal}
                disabled={speaking || !testText.trim()}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
              >
                {speaking ? "朗读中..." : "播放（本地）"}
              </button>
            )}
            {speaking && (
              <button onClick={stopTts} className="px-3 py-1.5 border border-red-200 text-red-600 rounded text-sm">
                停止
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
