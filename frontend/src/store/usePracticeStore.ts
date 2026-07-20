import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GradingResult, Question } from "../types";

interface PracticeFilters {
  mode: string;
  difficulty: string;
  tags: string[];
  deckId: string;
  limit: number;
  preferUnanswered: boolean;
  groupMode: boolean;
  lowScoreThreshold: number;
  includeIndependentAnalysis: boolean;
}

interface PracticeState {
  filters: PracticeFilters;
  questions: Question[];
  idx: number;
  drafts: Record<string, string>;
  results: Record<string, GradingResult>;
  recordIds: Record<string, string>;
  revealed: Record<string, boolean>;
  revealedAtSubmit: Record<string, boolean | null>;
  startedAt: Record<string, number>;
  grading: boolean;
  streamText: string;
  analysisStreamText: string;
  analysisError: string | null;
  streamError: string | null;
  streamDone: boolean;
  setFilter: <K extends keyof PracticeFilters>(key: K, value: PracticeFilters[K]) => void;
  startSession: (questions: Question[]) => void;
  updateQuestion: (questionId: string, patch: Partial<Question>) => void;
  setIdx: (idx: number) => void;
  setDraft: (questionId: string, value: string) => void;
  revealAnswer: (questionId: string) => void;
  setSubmitReveal: (questionId: string, value: boolean | null) => void;
  ensureStarted: (questionId: string) => void;
  resetQuestionOutput: (questionId: string) => void;
  beginGrade: (questionId: string, revealed: boolean) => void;
  appendStream: (value: string) => void;
  appendAnalysisStream: (value: string) => void;
  failAnalysis: (message: string) => void;
  finishGrade: (questionId: string, result: GradingResult, recordId: string) => void;
  failGrade: (message: string) => void;
  cancelGrade: (questionId: string) => void;
  nextQuestion: () => void;
  clearSession: () => void;
}

const initialFilters: PracticeFilters = {
  mode: "random",
  difficulty: "",
  tags: [],
  deckId: "",
  limit: 10,
  preferUnanswered: true,
  groupMode: true,
  lowScoreThreshold: 50,
  includeIndependentAnalysis: false,
};

const transientState = {
  grading: false,
  streamText: "",
  analysisStreamText: "",
  analysisError: null as string | null,
  streamError: null as string | null,
  streamDone: false,
};

export const usePracticeStore = create<PracticeState>()(
  persist(
    (set) => ({
      filters: initialFilters,
      questions: [],
      idx: 0,
      drafts: {},
      results: {},
      recordIds: {},
      revealed: {},
      revealedAtSubmit: {},
      startedAt: {},
      ...transientState,
      setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
      startSession: (questions) => set({
        questions,
        idx: 0,
        drafts: {},
        results: {},
        recordIds: {},
        revealed: {},
        revealedAtSubmit: {},
        startedAt: questions[0] ? { [questions[0].id]: Date.now() } : {},
        ...transientState,
      }),
      updateQuestion: (questionId, patch) => set((state) => ({
        questions: state.questions.map((question) =>
          question.id === questionId ? { ...question, ...patch } : question
        ),
      })),
      setIdx: (idx) => set({ idx, ...transientState }),
      setDraft: (questionId, value) => set((state) => ({
        drafts: { ...state.drafts, [questionId]: value },
      })),
      revealAnswer: (questionId) => set((state) => ({
        revealed: { ...state.revealed, [questionId]: true },
      })),
      setSubmitReveal: (questionId, value) => set((state) => ({
        revealedAtSubmit: { ...state.revealedAtSubmit, [questionId]: value },
      })),
      ensureStarted: (questionId) => set((state) => state.startedAt[questionId] ? state : ({
        startedAt: { ...state.startedAt, [questionId]: Date.now() },
      })),
      resetQuestionOutput: (questionId) => set((state) => {
        const results = { ...state.results };
        const recordIds = { ...state.recordIds };
        delete results[questionId];
        delete recordIds[questionId];
        return { results, recordIds, ...transientState };
      }),
      beginGrade: (questionId, revealed) => set((state) => {
        return {
          revealedAtSubmit: { ...state.revealedAtSubmit, [questionId]: revealed },
          grading: true,
          streamText: "",
          analysisStreamText: "",
          streamError: null,
          streamDone: false,
        };
      }),
      appendStream: (value) => set((state) => ({ streamText: state.streamText + value })),
      appendAnalysisStream: (value) => set((state) => ({ analysisStreamText: state.analysisStreamText + value })),
      failAnalysis: (message) => set({ analysisError: message }),
      finishGrade: (questionId, result, recordId) => set((state) => ({
        results: { ...state.results, [questionId]: result },
        recordIds: { ...state.recordIds, [questionId]: recordId },
        grading: false,
        streamDone: true,
      })),
      failGrade: (message) => set({ grading: false, streamError: message }),
      cancelGrade: (questionId) => set((state) => ({
        revealedAtSubmit: { ...state.revealedAtSubmit, [questionId]: null },
        ...transientState,
      })),
      nextQuestion: () => set((state) => {
        const nextIdx = state.idx + 1;
        const next = state.questions[nextIdx];
        return {
          idx: nextIdx,
          startedAt: next && !state.startedAt[next.id]
            ? { ...state.startedAt, [next.id]: Date.now() }
            : state.startedAt,
          ...transientState,
        };
      }),
      clearSession: () => set({
        questions: [],
        idx: 0,
        drafts: {},
        results: {},
        recordIds: {},
        revealed: {},
        revealedAtSubmit: {},
        startedAt: {},
        ...transientState,
      }),
    }),
    {
      name: "faceace-practice-session-v1",
      partialize: (state) => ({
        filters: state.filters,
        questions: state.questions,
        idx: state.idx,
        drafts: state.drafts,
        results: state.results,
        recordIds: state.recordIds,
        revealed: state.revealed,
        revealedAtSubmit: state.revealedAtSubmit,
        startedAt: state.startedAt,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<PracticeState>),
        filters: { ...initialFilters, ...(persisted as Partial<PracticeState>)?.filters },
        ...transientState,
      }),
    },
  ),
);
