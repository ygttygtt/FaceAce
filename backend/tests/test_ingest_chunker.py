from app.ingest.chunker import chunk, plan_document


def test_markdown_question_headings_are_split_one_per_chunk():
    text = """# AI 面试题

## RAG 类（4 道）

### 题1｜第一题？
答案一。

### 题2｜第二题？
答案二。

### 题3｜第三题？
答案三。

### 题4｜第四题？
答案四。

## Agent 类（4 道）

### 题5｜第五题？
答案五。

### 题6｜第六题？
答案六。

### 题7｜第七题？
答案七。

### 题8｜第八题？
答案八。
"""

    chunks = chunk(text)

    assert len(chunks) == 8
    assert all(item.count("### 题") == 1 for item in chunks)
    assert chunks[0].startswith("【所属章节】RAG 类（4 道）")
    assert chunks[4].startswith("【所属章节】Agent 类（4 道）")
    assert "Agent 类" not in chunks[3]


def test_plain_numbered_questions_are_batched_conservatively():
    text = "\n".join(f"{index}. 第 {index} 题？\n答案 {index}" for index in range(1, 8))

    chunks = chunk(text, max_chars=1000)

    assert len(chunks) == 3
    assert chunks[0].count("题？") == 3
    assert chunks[-1].count("题？") == 1


def test_numeric_markdown_headings_are_recognized_as_questions():
    text = """## 基础题
### 1. 第一题？
答案一
### 2. 第二题？
答案二
"""

    chunks = chunk(text)

    assert len(chunks) == 2
    assert "第一题" in chunks[0]
    assert "第二题" in chunks[1]


def test_internal_subheadings_and_answer_lists_stay_in_eighth_question():
    text = """## Agent 类（8 道）
### 题1｜第一题？
答案一
### 题2｜第二题？
答案二
### 题3｜第三题？
答案三
### 题4｜第四题？
答案四
### 题5｜第五题？
答案五
### 题6｜第六题？
答案六
### 题7｜第七题？
答案七
### 题8｜设计一个实时语音 Agent
#### 用户打断如何处理？
1. 立即停止播放
2. 取消正在生成的请求
#### 低延迟 RAG
- 并行召回
#### 可观测与降级策略
答案中的多个子项不能变成新题。
"""

    plan = plan_document(text)

    assert plan.explicit_question_count == 8
    assert len(plan.chunks) == 8
    assert all(item.expected_count == 1 for item in plan.chunks)
    assert "用户打断如何处理" in plan.chunks[-1].text
    assert "低延迟 RAG" in plan.chunks[-1].text
    assert "降级策略" in plan.chunks[-1].text


def test_small_headings_can_remain_sections_instead_of_questions():
    text = """# 后端知识
## Redis
### 数据结构
字符串、哈希和有序集合的适用场景。

1. Redis 为什么快？
答案：内存访问和事件循环。
2. 如何处理缓存穿透？
答案：布隆过滤器或空值缓存。
"""

    plan = plan_document(text)

    assert plan.explicit_question_count == 0
    assert all(item.expected_count is None for item in plan.chunks)
    classifications = {item.title: item.category for item in plan.heading_decisions}
    assert classifications["Redis"] == "section"
    assert classifications["数据结构"] == "unknown"


def test_unstructured_long_document_uses_overlapping_natural_block_windows():
    paragraphs = [
        f"这是第 {index} 段背景材料，讨论系统设计中的容量、延迟、容错和一致性取舍。"
        for index in range(1, 25)
    ]
    text = "\n\n".join(paragraphs)

    plan = plan_document(text, max_chars=180, overlap_ratio=0.2)

    assert len(plan.chunks) > 2
    assert all(item.boundary_type == "semantic_window" for item in plan.chunks)
    assert all(item.expected_count is None for item in plan.chunks)
    assert plan.chunks[0].block_end >= plan.chunks[1].block_start
    # Natural paragraphs remain intact instead of arbitrary character slicing.
    assert all("这是第" in item.text for item in plan.chunks)
