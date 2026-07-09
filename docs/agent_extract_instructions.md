# 用另一个 AI Agent 整理面试题文档(尤其 PDF)为可导入格式

当文档较难整理(如扫描/复杂排版的 PDF,不像 Markdown 那么好读),可让另一个 AI Agent(支持读 PDF/图片的,如 Claude、GPT、通义千问 VL 等)按本规范产出一份标准 JSON,再用 FaceAce「导入页 → 方式二:导入已结构化 JSON」一键导入,跳过 FaceAce 自带的 LLM 归一化。

## 一、给 Agent 看的材料

把以下三样丢给 Agent:
1. **原始文档**(PDF / Word / 图片 / 文本均可,Agent 能读就行);
2. **本规范**(`docs/schema.md` 的"单题结构"表,见下文摘要);
3. **下方的指令 prompt**(直接复制粘贴)。

## 二、输出格式摘要(给 Agent 看的标准)

每个题目输出一个 JSON 对象,最终产出 `{"questions": [ ... ]}` 或一个数组。字段:

| 字段 | 必填 | 说明 |
|---|---|---|
| `question_text` | ✅ | 题干,**去掉题号前缀**(1. / Q1 / (1) / 一、 / 问:),只保留正文 |
| `question_type` | ✅ | `single_choice` / `multiple_choice` / `short_answer` / `essay` / `coding` / `behavioral` / `case` / `concept` |
| `difficulty` | ✅ | `easy` / `medium` / `hard` |
| `tags` | ✅ | 1~5 个标签数组 |
| `options` | ✅ | 选择题填 `["A. ..","B. .."]`,其余 `null` |
| `standard_answer` | ✅ | 标准答案(markdown),无则 `null` |
| `answer_points` | ✅ | 评分要点数组(无答案也要按题干给出应覆盖的要点) |
| `explanation` | ✅ | 解析(markdown),无则 `null` |
| `code_template` | ✅ | 代码题模板,其余 `null` |
| `source_raw_index` | ✅ | 在原文中的序号,从 1 递增 |
| `group_id` | 可选 | 追问链 id:同一条「基础→追问→进阶」链用同一 id;孤立题 `null` |
| `group_seq` | 可选 | 链内顺序(基础=1,追问=2…) |
| `group_label` | 可选 | 链标题(基础题处填,如"Attention 深挖") |

## 三、复制给 Agent 的指令 prompt

```
你是一个面试题文档结构化专家。我会给你一份面试题文档(PDF/图片/文本)。
请把它整理成标准 JSON,输出格式为 {"questions": [题目对象, ...]}。

【硬性要求】
1. 只输出 JSON 对象,不要任何额外说明文字、不要 markdown 代码块包裹。
2. 每个题目对象字段:
   question_text(题干,去掉题号前缀)、question_type、difficulty、tags、options、
   standard_answer、answer_points、explanation、code_template、source_raw_index、
   group_id、group_seq、group_label。
3. question_type 枚举:single_choice|multiple_choice|short_answer|essay|coding|behavioral|case|concept。
4. difficulty 枚举:easy|medium|hard。

【内容处理规则】
- 题号前缀(1. / Q1 / (1) / 一、 / 第1题 / 问:):必须剥离,question_text 只保留题干正文。
- 只有题没有答案:standard_answer 与 explanation 填 null;answer_points 仍要根据题干给出"理想答案应覆盖的要点"。
- 答案与解析混合:直接回答问题的入 standard_answer,补充原理/扩展入 explanation;分不开就全放 standard_answer,explanation 填 null。
- 答案尾部不要混入下一题或下一章节的内容(章节标题、分隔线 --- 等必须截断)。
- 选择题选项与题干粘连时:题干取到选项前,选项入 options 数组,question_type 设为 single_choice。
- 一段文本含多道题:拆成多个数组元素,不要合并。
- 题干不完整/乱码:跳过,不要输出。
- 难度未标注:概念题 easy、简答/选择 medium、论述/编程/案例 hard。
- tags 从题干核心知识点提取 1~5 个,中英文均可,不要编造。

【追问链/题组(重要)】
- 若一道题是前一道题的「追问/进阶/场景延伸」(题干常含"追问/进阶/场景"标记,或明显基于前题深挖),
  则它与前题属于同一 group,用同一个 group_id:
  - group_id:同一条链用同一个 id(如 "g1");孤立题填 null。
  - group_seq:链内顺序,基础题=1,第一个追问=2,依此递增。
  - group_label:链标题(只在基础题 group_seq=1 处填,如"闭包深挖";其余题填 null)。
- 孤立的、无追问关系的题:group_id / group_seq / group_label 全填 null。
- 一条链至少 2 题才算 group;单题不要编造 group_id。

【示例(节选)】
输入含:"讲一下 Attention 完整计算流程。" ... "(追问)Self-Attention 里 K 和 V 能相同吗?" ... "(进阶)还了解哪些注意力变体?"
输出(节选):
{"questions":[
  {"question_text":"讲一下 Attention 的完整计算流程。","question_type":"short_answer","difficulty":"easy","tags":["Transformer","Attention"],"options":null,"standard_answer":"...","answer_points":["Q/K/V 投影","缩放点积","softmax 加权"],"explanation":"...","code_template":null,"source_raw_index":1,"group_id":"g1","group_seq":1,"group_label":"Attention 深挖"},
  {"question_text":"Self-Attention 里 Key 和 Value 能相同吗?","question_type":"short_answer","difficulty":"medium","tags":["Attention"],"options":null,"standard_answer":"...","answer_points":["数值通常不同","投影矩阵独立"],"explanation":null,"code_template":null,"source_raw_index":2,"group_id":"g1","group_seq":2,"group_label":null},
  {"question_text":"还了解哪些注意力变体?","question_type":"essay","difficulty":"hard","tags":["Attention","稀疏注意力"],"options":null,"standard_answer":"...","answer_points":["稀疏注意力","线性注意力"],"explanation":null,"code_template":null,"source_raw_index":3,"group_id":"g1","group_seq":3,"group_label":null}
]}

现在请处理我提供的文档,只输出 {"questions":[...]}。
```

## 四、Agent 产出后怎么导入

1. 让 Agent 把结果保存为 `xxx.json`(内容是 `{"questions":[...]}` 或直接的 `[...]` 数组都行)。
2. 打开 FaceAce →「导入」页 →「方式二:导入已结构化 JSON」→ 选该文件 → 直接入库(可选先在「方式二」旁选目标题库)。
3. 导入接口会校验每题,不合规的跳过并返回 `inserted / skipped` 计数。

## 五、校验小贴士(给 Agent 的复检清单)

- [ ] 每题 question_text 无题号前缀、无尾部章节泄露
- [ ] 非选择题 options 为 null
- [ ] 无答案的题 answer_points 仍非空
- [ ] 追问链 group_id 一致、group_seq 递增、仅基础题填 group_label
- [ ] 孤立题 group_* 全 null
- [ ] 整体是合法 JSON(可用 `python -m json.tool xxx.json` 验证)
