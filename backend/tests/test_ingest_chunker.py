from app.ingest.chunker import chunk


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
