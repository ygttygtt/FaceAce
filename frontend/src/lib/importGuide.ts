export const AGENT_IMPORT_PROMPT = `请读取我附带的面试题文档，并整理成 FaceAce 可导入的 JSON。

要求：
1. 只输出合法 JSON，不要解释、不要 Markdown 代码块。
2. 顶层格式为 {"questions":[...]}。
3. 每道题必须包含：question_text、question_type、difficulty、tags、options、standard_answer、answer_points、explanation、code_template、source_raw_index。
4. question_type 只能是 single_choice、multiple_choice、short_answer、essay、coding、behavioral、case、concept。
5. difficulty 只能是 easy、medium、hard。
6. 去掉“题1 / Q1 / 1.”等题号；一道题一个对象，不要把多题合并。
7. 没有参考答案时 standard_answer 和 explanation 填 null，但仍需根据题干生成 answer_points。
8. 选择题把选项放入 options；非选择题 options 填 null。
9. 原文中的答案、表格、代码和分点说明尽量保留为 Markdown。
10. 最后检查题目数量，确保没有漏题或重复题。

单题字段示例请参考我随后提供的 JSON 示例。`;

export const IMPORT_DEMO = {
  questions: [
    {
      question_text: "什么是 RAG？它主要解决什么问题？",
      question_type: "short_answer",
      difficulty: "medium",
      tags: ["RAG", "LLM"],
      options: null,
      standard_answer: "RAG 先从外部知识库检索相关内容，再将其作为上下文交给模型生成回答。",
      answer_points: ["说明检索与生成两个阶段", "提到外部知识更新或减少幻觉"],
      explanation: null,
      code_template: null,
      source_raw_index: 1,
      group_id: null,
      group_seq: null,
      group_label: null,
    },
  ],
};

export const IMPORT_DEMO_TEXT = JSON.stringify(IMPORT_DEMO, null, 2);
