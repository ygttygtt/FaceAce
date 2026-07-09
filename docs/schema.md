# FaceAce 题库标准格式规范

供 FaceAce「直接导入已结构化 JSON」功能使用,也方便其它 AI agent / 脚本按此规范产出题库后一键导入,或导出分享给别人。

## 导入接口

```
POST /api/ingest/import-json
Content-Type: application/json

{
  "deck_id": "可选,把这批题归到某个题库;不填则不归入任何题库",
  "questions": [ ...单题对象数组... ]
}
```

- 每个题目用 `NormalizedQuestion` 结构(见下)校验,不合规的题会被跳过(返回 `skipped` 计数)。
- 返回 `{ "inserted": N, "skipped": M }`。

## 单题结构(NormalizedQuestion)

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `question_text` | string | ✅ | 题干正文(markdown)。**去掉题号前缀**(如 `1.` / `Q1` / `(1)` / `一、` / `问:`),只保留题干 |
| `question_type` | string | ✅ | 题型枚举:`single_choice` / `multiple_choice` / `short_answer` / `essay` / `coding` / `behavioral` / `case` / `concept` |
| `difficulty` | string | ✅ | `easy` / `medium` / `hard` |
| `tags` | string[] | ✅ | 1~5 个标签(中英文均可),从题干核心知识点提取 |
| `options` | string[] \| null | ✅ | 仅选择题填(如 `["A. ...", "B. ..."]`),其余题型填 `null` |
| `standard_answer` | string \| null | ✅ | 标准答案(markdown)。无答案填 `null` |
| `answer_points` | string[] | ✅ | 评分要点,给 AI 批改当 rubric 用。**无答案时也要根据题干给出"理想答案应覆盖的要点"** |
| `explanation` | string \| null | ✅ | 解析/原理(markdown)。无则 `null` |
| `code_template` | string \| null | ✅ | 代码题的模板字符串,非代码题填 `null` |
| `source_raw_index` | int | ✅ | 该题在原输入中的序号(从 1 开始),便于回溯 |
| `group_id` | string \| null | 可选 | 追问链/题组 id。属于同一条深挖链(基础→追问→进阶)的题用同一个 id;孤立题填 `null` |
| `group_seq` | int \| null | 可选 | 链内顺序(基础题=1,第一个追问=2…)。无 group 填 `null` |
| `group_label` | string \| null | 可选 | 链标题(基础题处填,如"闭包深挖";其余填 `null`) |

> `group_*` 为可选字段,用于把"基础题 + 追问 + 进阶"连成一条深挖链。孤立题不填(全 `null`)。一条链至少 2 题才算 group。

## 完整示例

```json
{
  "deck_id": null,
  "questions": [
    {
      "question_text": "什么是闭包?请举例说明其应用场景。",
      "question_type": "short_answer",
      "difficulty": "medium",
      "tags": ["JavaScript", "闭包"],
      "options": null,
      "standard_answer": "闭包是指有权访问另一函数作用域中变量的函数。常用于回调、模块化、私有变量。",
      "answer_points": ["说出闭包定义", "举例说明应用场景", "可提及模块化/回调/私有变量"],
      "explanation": "闭包的本质是词法作用域链。",
      "code_template": null,
      "source_raw_index": 1
    },
    {
      "question_text": "以下哪个不是 JS 的基本类型?",
      "question_type": "single_choice",
      "difficulty": "easy",
      "tags": ["JavaScript", "类型"],
      "options": ["A. string", "B. number", "C. object", "D. boolean"],
      "standard_answer": "C. object",
      "answer_points": ["识别 object 是引用类型"],
      "explanation": "基本类型包括 string/number/boolean/null/undefined/symbol/bigint。",
      "code_template": null,
      "source_raw_index": 2
    }
  ]
}
```

## 产出要点(给其它 agent / 脚本的建议)

1. **题号剥离**:`question_text` 不要带 `1.` / `Q1` / `(1)` / `一、` / `第1题` / `问:` 等前缀。
2. **只有题没答案**:`standard_answer` 与 `explanation` 填 `null`,但 `answer_points` 仍要根据题干给出应覆盖的要点。
3. **答案与解析混合**:尽量拆分——直接回答问题的入 `standard_answer`,补充原理/扩展入 `explanation`;实在分不开就全放 `standard_answer`,`explanation` 填 `null`。
4. **答案尾部不要混入下一题/下一章节**的内容(章节标题、分隔线 `---` 等)。
5. **一道题一行**:`question_text` 是单题题干,不要把多道题合并。
6. **乱码/不完整**:跳过,不要输出。
7. **难度未标注**:概念题偏 `easy`,简答/选择偏 `medium`,论述/编程/案例偏 `hard`。

## 导出

「题库」页的「导出全部」会产出 `questions` 数组(含 `id` / `source` 等额外字段),结构与本规范兼容,可直接作为 `import-json` 的输入分享给别人。
