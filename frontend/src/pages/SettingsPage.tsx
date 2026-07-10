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
  model: "deepseek-chat",
  temperature: 0.7,
  max_tokens: 2048,
  is_default: true,
  supports_json_schema: false,
};

export default function SettingsPage() {
  const [tab, setTab] = useState<"llm" | "prompts" | "tts">("llm");
  return (
    <div className="p-6 max-w-3xl mx-auto">
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

  const save = useMutation({
    mutationFn: async (p: any) => {
      if (editing) return api.updateProfile(editing.id, p);
      return api.createProfile(p);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles"] });
      setEditing(null);
      setForm(EMPTY_PROFILE);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api.deleteProfile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });

  const startEdit = (p: LLMProfile) => {
    setEditing(p);
    setForm({ ...p, api_key: "" });
    setTestResult("");
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

  const profiles = data?.items || [];

  return (
    <div className="space-y-4">
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

      <div className="bg-white border rounded p-4 space-y-3">
        <div className="text-sm font-medium">{editing ? "编辑 profile" : "新增 profile"}</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="名称" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="模型" value={form.model} onChange={(v) => setForm({ ...form, model: v })} />
          <Field
            label="Base URL"
            value={form.base_url}
            onChange={(v) => setForm({ ...form, base_url: v })}
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
      </div>
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
    <label className={full ? "col-span-2" : ""}>
      <span className="text-gray-600 text-xs">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block border rounded px-2 py-1.5 mt-1 w-full"
      />
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
                  <option key={v} value={v}>{v}</option>
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
