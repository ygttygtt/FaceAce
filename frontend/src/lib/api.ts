import type {
  Bookmark,
  Deck,
  GradingResult,
  IngestJob,
  IngestJobDetail,
  LLMProfile,
  Note,
  PracticeRecordDetail,
  PromptTemplate,
  Question,
  SimulationReport,
  SimulationSession,
  SimulationSessionDetail,
  UserConfig,
} from "../types";

const BASE = (import.meta.env.VITE_API_BASE as string) || "";

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BASE}/api${normalized}`;
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

function qs(params: Record<string, any>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) sp.set(k, v.join(","));
    else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  // ---- questions ----
  listQuestions: (params: {
    keyword?: string;
    difficulty?: string;
    qtype?: string;
    tags?: string;
    deck_id?: string;
    bookmarked?: boolean;
    limit?: number;
    offset?: number;
  }) => req<{ items: Question[]; total: number }>(`/questions${qs(params)}`),

  drawQuestions: (params: {
    mode?: string;
    limit?: number;
    tags?: string;
    difficulty?: string;
    deck_id?: string;
    group_mode?: boolean;
  }) => req<{ items: Question[] }>(`/questions/draw${qs(params)}`),

  getQuestion: (id: string) => req<Question>(`/questions/${id}`),
  createQuestion: (data: Partial<Question>) =>
    req<Question>("/questions", { method: "POST", body: JSON.stringify(data) }),
  updateQuestion: (id: string, data: Partial<Question>) =>
    req<Question>(`/questions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteQuestion: (id: string, opts: { deleteRelated?: boolean; deleteBookmarksNotes?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (opts.deleteRelated) p.set("delete_related", "true");
    if (opts.deleteBookmarksNotes) p.set("delete_bookmarks_notes", "true");
    const qs = p.toString();
    return req<void>(`/questions/${id}${qs ? "?" + qs : ""}`, { method: "DELETE" });
  },
  exportQuestions: () => req<{ questions: any[] }>(`/questions/export`),
  batchDelete: (ids: string[]) =>
    req<{ deleted: number }>(`/questions/batch-delete`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  batchMove: (ids: string[], deck_id: string | null) =>
    req<{ moved: number }>(`/questions/batch-move`, {
      method: "POST",
      body: JSON.stringify({ ids, deck_id }),
    }),

  // ---- decks ----
  listDecks: () => req<{ items: Deck[] }>(`/decks`),
  createDeck: (data: { name: string; description?: string; color?: string }) =>
    req<Deck>(`/decks`, { method: "POST", body: JSON.stringify(data) }),
  updateDeck: (id: string, data: Partial<Deck>) =>
    req<Deck>(`/decks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDeck: (id: string, deleteQuestions: boolean = false) =>
    req<void>(`/decks/${id}${deleteQuestions ? "?delete_questions=true" : ""}`, { method: "DELETE" }),

  // ---- practice ----
  createPracticeRecord: (data: {
    question_id: string;
    user_answer?: string;
    revealed?: boolean;
    duration_sec?: number;
  }) => req<any>(`/practice/records`, { method: "POST", body: JSON.stringify(data) }),

  grade: (data: {
    question_id: string;
    user_answer: string;
    practice_record_id?: string;
  }) => req<GradingResult>(`/practice/grade`, { method: "POST", body: JSON.stringify(data) }),

  listRecords: (question_id?: string) =>
    req<{ items: any[] }>(`/practice/records${qs({ question_id })}`),
  deleteRecord: (record_id: string) =>
    req<void>(`/practice/records/${record_id}`, { method: "DELETE" }),
  batchDeleteRecords: (ids: string[]) =>
    req<{ deleted: number }>(`/practice/records/batch-delete`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  wrongQuestions: () => req<{ items: Question[] }>(`/practice/wrong-questions`),

  // ---- bookmarks ----
  toggleBookmark: (question_id: string) =>
    req<{ bookmarked: boolean; bookmark_id: string | null }>(`/bookmarks/toggle`, {
      method: "POST",
      body: JSON.stringify({ question_id }),
    }),
  listBookmarks: () => req<{ items: Bookmark[] }>(`/bookmarks`),
  checkBookmark: (question_id: string) =>
    req<{ bookmarked: boolean }>(`/bookmarks/check/${question_id}`),
  deleteBookmark: (id: string) => req<void>(`/bookmarks/${id}`, { method: "DELETE" }),

  // ---- notes ----
  getNote: (question_id: string) => req<Note | { content: string }>(`/notes/${question_id}`),
  upsertNote: (question_id: string, content: string) =>
    req<Note>(`/notes/${question_id}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  deleteNote: (question_id: string) =>
    req<void>(`/notes/${question_id}`, { method: "DELETE" }),

  // ---- answer override ----
  updateAnswerOverride: (question_id: string, answer: string | null) =>
    req<{ id: string; user_answer_override: string | null }>(
      `/questions/${question_id}/answer-override`,
      { method: "PUT", body: JSON.stringify({ answer }) }
    ),

  // ---- practice detail ----
  getPracticeRecordDetail: (record_id: string) =>
    req<PracticeRecordDetail>(`/practice/records/${record_id}/detail`),

  // ---- simulation ----
  createSession: (data: {
    title?: string;
    role_context?: string;
    llm_profile_id?: string;
    interviewer_persona?: string;
    question_pool_ids?: string[];
  }) => req<SimulationSession>(`/simulation/sessions`, { method: "POST", body: JSON.stringify(data) }),

  listSessions: () => req<{ items: SimulationSession[] }>(`/simulation/sessions`),
  getSession: (id: string) => req<SimulationSessionDetail>(`/simulation/sessions/${id}`),
  finishSession: (id: string) =>
    req<SimulationReport>(`/simulation/sessions/${id}/finish`, { method: "POST" }),
  getReport: (id: string) => req<SimulationReport>(`/simulation/sessions/${id}/report`),
  deleteSession: (id: string) => req<void>(`/simulation/sessions/${id}`, { method: "DELETE" }),

  // ---- ingest ----
  uploadFile: async (
    file: File,
    params: { profile_id?: string; auto_approve?: boolean; deck_id?: string }
  ): Promise<IngestJob> => {
    const fd = new FormData();
    fd.append("file", file);
    const sp = new URLSearchParams();
    if (params.profile_id) sp.set("profile_id", params.profile_id);
    if (params.auto_approve) sp.set("auto_approve", "true");
    if (params.deck_id) sp.set("deck_id", params.deck_id);
    const s = sp.toString();
    const res = await fetch(apiUrl(`/ingest/upload${s ? `?${s}` : ""}`), {
      method: "POST",
      body: fd,
    });
    if (!res.ok) throw new Error((await res.text()) || "上传失败");
    return res.json();
  },
  listJobs: () => req<{ items: IngestJob[] }>(`/ingest/jobs`),
  getJob: (id: string) => req<IngestJobDetail>(`/ingest/jobs/${id}`),
  updateReviewItem: (jid: string, index: number, data: any) =>
    req<any>(`/ingest/jobs/${jid}/questions/${index}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  approve: (
    jid: string,
    indices: number[],
    auto_approve_all = false,
    deck_id?: string | null
  ) =>
    req<{ approved: number; status: string }>(`/ingest/jobs/${jid}/approve`, {
      method: "POST",
      body: JSON.stringify({ indices, auto_approve_all, deck_id: deck_id ?? null }),
    }),
  importJson: (questions: any[], deck_id?: string | null) =>
    req<{ inserted: number; skipped: number }>(`/ingest/import-json`, {
      method: "POST",
      body: JSON.stringify({ questions, deck_id: deck_id ?? null }),
    }),
  deleteJob: (jid: string) => req<void>(`/ingest/jobs/${jid}`, { method: "DELETE" }),

  // ---- config ----
  listProfiles: () => req<{ items: LLMProfile[] }>(`/config/llm-profiles`),
  createProfile: (data: any) =>
    req<LLMProfile>(`/config/llm-profiles`, { method: "POST", body: JSON.stringify(data) }),
  updateProfile: (id: string, data: any) =>
    req<LLMProfile>(`/config/llm-profiles/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProfile: (id: string) =>
    req<void>(`/config/llm-profiles/${id}`, { method: "DELETE" }),
  testProfile: (id: string) =>
    req<{ ok: boolean; message: string; reply: string }>(`/config/llm-profiles/${id}/test`, {
      method: "POST",
    }),
  discoverModels: (data: { base_url?: string; api_key?: string; profile_id?: string }) =>
    req<{ ok: boolean; message: string; models: string[] }>(`/config/llm-models/discover`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listPrompts: () => req<{ items: PromptTemplate[] }>(`/config/prompts`),
  updatePrompt: (key: string, data: { content?: string; name?: string }) =>
    req<PromptTemplate>(`/config/prompts/${key}`, { method: "PUT", body: JSON.stringify(data) }),
  getUser: () => req<UserConfig>(`/config/user`),
  updateUser: (data: Partial<UserConfig>) =>
    req<UserConfig>(`/config/user`, { method: "PUT", body: JSON.stringify(data) }),
};

export const SSE_BASE = BASE;
