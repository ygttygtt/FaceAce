export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "简单",
  medium: "中等",
  hard: "困难",
};

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  short_answer: "简答题",
  single_choice: "单选题",
  multiple_choice: "多选题",
  coding: "编程题",
  essay: "论述题",
  behavioral: "行为面试",
  case: "案例题",
  concept: "概念题",
};

export const VERDICT_LABELS: Record<string, string> = {
  correct: "掌握",
  partially_correct: "部分掌握",
  incorrect: "待加强",
};

export function labelOf(labels: Record<string, string>, value: string): string {
  return labels[value] || value;
}
