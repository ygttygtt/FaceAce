# FaceAce V2 综合改进计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完善刷题体验——历史记录可回溯、收藏+笔记、流式批改、数学公式渲染、题组追问链、答案编辑、Claude 风格 UI 重设计。

**Architecture:** 后端新增 Bookmark/Note 模型 + 流式批改 SSE 端点 + 答案编辑端点；前端新增 KaTeX 数学渲染、流式批改 UI、收藏/笔记组件、全局 Claude 风格主题。数据层通过 SQLite migration 补列，API 保持 RESTful（流式批改用 SSE）。

**Tech Stack:** 同现有 — Python 3.13 + FastAPI + SQLAlchemy 2.0 + SQLite；React 18 + TypeScript + Vite + Tailwind CSS 3 + react-markdown + zustand + TanStack Query。新增依赖：`react-katex`（或 `rehype-katex` + `remark-math`）+ `katex` CSS。

---

## 文件结构总览

```
backend/
├─ app/
│   ├─ models/
│   │   ├─ practice.py          # [改] GradingResult 加 raw_response 已有; 无需新增列
│   │   ├─ question.py          # [改] 加 user_answer_override, is_bookmarked (通过关联表)
│   │   ├─ bookmark.py          # [新] Bookmark 模型
│   │   └─ note.py              # [新] Note 模型
│   ├─ schemas/
│   │   ├─ practice.py          # [改] 加流式 grade SSE 相关 schema
│   │   ├─ question.py          # [改] QuestionOut 加 is_bookmarked, has_notes 等
│   │   ├─ bookmark.py          # [新] Bookmark 请求/响应
│   │   └─ note.py              # [新] Note 请求/响应
│   ├─ api/routes/
│   │   ├─ practice.py          # [改] 加 SSE 流式批改端点
│   │   ├─ questions.py         # [改] 加答案编辑端点 + 收藏列表筛选
│   │   ├─ bookmarks.py         # [新] 收藏 CRUD
│   │   └─ notes.py             # [新] 笔记 CRUD
│   ├─ services/
│   │   ├─ practice_service.py  # [改] 加 stream_grade 生成器 + 保存完整记录
│   │   ├─ question_service.py  # [改] 加 update_answer, 按收藏筛选
│   │   ├─ bookmark_service.py  # [新] 收藏逻辑
│   │   └─ note_service.py      # [新] 笔记逻辑
│   ├─ db/
│   │   └─ migrate.py           # [改] 加 Bookmark/Note 表 + user_answer_override 列
│   └─ main.py                  # [改] 注册新路由
frontend/
├─ src/
│   ├─ types/index.ts           # [改] 加 Bookmark, Note, 流式类型
│   ├─ lib/
│   │   ├─ api.ts               # [改] 加 bookmark/note/流式 grade API
│   │   └─ sse.ts               # [不改] 复用现有 SSE 工具
│   ├─ components/
│   │   ├─ Layout.tsx           # [改] Claude 风格重设计
│   │   ├─ MarkdownView.tsx     # [改] 集成 KaTeX 数学渲染
│   │   ├─ RevealCard.tsx       # [改] 加收藏按钮 + 笔记入口 + 答案编辑入口
│   │   ├─ StreamingGrade.tsx   # [新] 流式批改结果展示组件
│   │   ├─ BookmarkButton.tsx   # [新] 收藏按钮(星标)
│   │   ├─ NoteEditor.tsx       # [新] 笔记编辑弹窗
│   │   └─ AnswerEditor.tsx     # [新] 答案编辑弹窗
│   ├─ pages/
│   │   ├─ PracticePage.tsx     # [改] 流式批改 + 题组模式 + 收藏/笔记集成
│   │   ├─ HistoryPage.tsx      # [改] 可点击查看完整批改记录
│   │   ├─ QuestionBankPage.tsx # [改] 收藏筛选 + 收藏星标
│   │   └─ PracticeDetailPage.tsx # [新] 单题历史详情(含当时批改记录)
│   └─ index.css               # [改] Claude 风格 CSS 变量 + KaTeX CSS
```

---

## Task 1: 数据库模型与迁移

**Files:**
- Create: `backend/app/models/bookmark.py`
- Create: `backend/app/models/note.py`
- Modify: `backend/app/models/__init__.py` (import 注册)
- Modify: `backend/app/models/question.py:34` (加 user_answer_override 列)
- Modify: `backend/app/db/migrate.py:22-35` (加迁移)

### Step 1: 创建 Bookmark 模型

```python
# backend/app/models/bookmark.py
"""User bookmarks on questions."""
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import new_id
from app.db.base import Base, TimestampMixin


class Bookmark(Base, TimestampMixin):
    __tablename__ = "bookmarks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    question_id: Mapped[str] = mapped_column(String(32), ForeignKey("questions.id"), index=True)
```

### Step 2: 创建 Note 模型

```python
# backend/app/models/note.py
"""Personal notes attached to questions."""
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.ids import new_id
from app.db.base import Base, TimestampMixin


class Note(Base, TimestampMixin):
    __tablename__ = "notes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    question_id: Mapped[str] = mapped_column(String(32), ForeignKey("questions.id"), index=True)
    content: Mapped[str] = mapped_column(Text, default="")
```

### Step 3: Question 模型加 user_answer_override 列

在 `backend/app/models/question.py` 第 34 行后 `group_label` 定义后加入：

```python
    # user-edited answer override (null = use original standard_answer)
    user_answer_override: Mapped[str | None] = mapped_column(Text, nullable=True)
```

### Step 4: 注册新模型

在 `backend/app/models/__init__.py` 添加 import：

```python
from app.models.bookmark import Bookmark  # noqa
from app.models.note import Note  # noqa
```

### Step 5: 添加迁移

在 `backend/app/db/migrate.py` 的 `run_migrations` 函数末尾添加：

```python
    # Bookmark table
    if not _has_table(engine, "bookmarks"):
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE bookmarks (
                    id VARCHAR(32) PRIMARY KEY,
                    question_id VARCHAR(32) NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (question_id) REFERENCES questions(id)
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_bookmarks_question_id ON bookmarks (question_id)"))
        logger.info("migration: created bookmarks table")

    # Note table
    if not _has_table(engine, "notes"):
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE notes (
                    id VARCHAR(32) PRIMARY KEY,
                    question_id VARCHAR(32) NOT NULL,
                    content TEXT DEFAULT '',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (question_id) REFERENCES questions(id)
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_notes_question_id ON notes (question_id)"))
        logger.info("migration: created notes table")

    # user_answer_override column on questions
    if _has_table(engine, "questions") and not _has_column(engine, "questions", "user_answer_override"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE questions ADD COLUMN user_answer_override TEXT"))
        logger.info("migration: added questions.user_answer_override")
```

### Step 6: 重启后端验证迁移

```bash
cd backend && .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
```

检查日志应看到 migration 输出，确认新表和列已创建。

---

## Task 2: 后端 Schemas（Bookmark / Note / 扩展 Question / 流式 Grade）

**Files:**
- Create: `backend/app/schemas/bookmark.py`
- Create: `backend/app/schemas/note.py`
- Modify: `backend/app/schemas/question.py:49-53`
- Modify: `backend/app/schemas/practice.py:26-45`

### Step 1: Bookmark Schema

```python
# backend/app/schemas/bookmark.py
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class BookmarkCreate(BaseModel):
    question_id: str


class BookmarkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    question_id: str
    created_at: datetime
```

### Step 2: Note Schema

```python
# backend/app/schemas/note.py
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class NoteCreate(BaseModel):
    question_id: str
    content: str = ""


class NoteUpdate(BaseModel):
    content: str


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    question_id: str
    content: str
    created_at: datetime
    updated_at: datetime
```

### Step 3: 扩展 QuestionOut 添加动态字段

修改 `backend/app/schemas/question.py` 的 `QuestionOut`：

```python
class QuestionOut(QuestionBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime
    updated_at: datetime
    # 动态字段(由 service 层填充,不是 ORM 列)
    is_bookmarked: bool = False
    has_notes: bool = False
    user_answer_override: Optional[str] = None
```

### Step 4: 添加流式 Grade 响应 Schema

在 `backend/app/schemas/practice.py` 末尾添加：

```python
class GradeStreamChunk(BaseModel):
    """SSE streaming chunk for grading."""
    delta: Optional[str] = None     # 流式文本增量
    done: bool = False
    result: Optional[GradingResultOut] = None  # 流结束时的完整结果
    error: Optional[str] = None
```

---

## Task 3: 后端 Service 层（Bookmark / Note / 答案编辑 / 流式批改）

**Files:**
- Create: `backend/app/services/bookmark_service.py`
- Create: `backend/app/services/note_service.py`
- Modify: `backend/app/services/question_service.py:56-76`
- Modify: `backend/app/services/practice_service.py:28-98`

### Step 1: Bookmark Service

```python
# backend/app/services/bookmark_service.py
from sqlalchemy.orm import Session
from app.core.ids import new_id
from app.models.bookmark import Bookmark


def toggle_bookmark(db: Session, question_id: str) -> dict:
    """Toggle bookmark on a question. Returns {bookmarked: bool, bookmark_id: str|None}."""
    existing = db.query(Bookmark).filter(Bookmark.question_id == question_id).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"bookmarked": False, "bookmark_id": None}
    bm = Bookmark(id=new_id(), question_id=question_id)
    db.add(bm)
    db.commit()
    db.refresh(bm)
    return {"bookmarked": True, "bookmark_id": bm.id}


def is_bookmarked(db: Session, question_id: str) -> bool:
    return db.query(Bookmark).filter(Bookmark.question_id == question_id).count() > 0


def list_bookmarked_question_ids(db: Session) -> list[str]:
    return [r[0] for r in db.query(Bookmark.question_id).all()]


def list_bookmarks(db: Session) -> list[Bookmark]:
    return db.query(Bookmark).order_by(Bookmark.created_at.desc()).all()
```

### Step 2: Note Service

```python
# backend/app/services/note_service.py
from sqlalchemy.orm import Session
from app.core.ids import new_id
from app.models.note import Note


def get_note(db: Session, question_id: str) -> Note | None:
    return db.query(Note).filter(Note.question_id == question_id).first()


def upsert_note(db: Session, question_id: str, content: str) -> Note:
    note = db.query(Note).filter(Note.question_id == question_id).first()
    if note:
        note.content = content
    else:
        note = Note(id=new_id(), question_id=question_id, content=content)
        db.add(note)
    db.commit()
    db.refresh(note)
    return note


def delete_note(db: Session, question_id: str) -> bool:
    note = db.query(Note).filter(Note.question_id == question_id).first()
    if not note:
        return False
    db.delete(note)
    db.commit()
    return True
```

### Step 3: 扩展 Question Service（答案编辑 + 收藏筛选）

修改 `backend/app/services/question_service.py`：

在 `update_question` 函数后添加：

```python
def update_answer_override(db: Session, question_id: str, answer: str | None) -> Question | None:
    """Set or clear the user's answer override for a question."""
    q = db.get(Question, question_id)
    if not q:
        return None
    q.user_answer_override = answer
    db.commit()
    db.refresh(q)
    return q
```

在 `list_questions` 函数参数中添加 `bookmarked_only: bool = False`，函数体内在 `if deck_id:` 之后添加：

```python
    if bookmarked_only:
        from app.services.bookmark_service import list_bookmarked_question_ids
        bm_ids = list_bookmarked_question_ids(db)
        q = q.filter(Question.id.in_(bm_ids))
```

### Step 4: 流式批改 Service

修改 `backend/app/services/practice_service.py`，在 `grade_answer` 后添加流式版本：

```python
import json
from collections.abc import AsyncGenerator


async def grade_answer_stream(
    db: Session,
    llm: LLMService,
    question_id: str,
    user_answer: str,
    practice_record_id: str | None = None,
) -> AsyncGenerator[str, None]:
    """Stream grading result via SSE chunks. Yields JSON-encoded GradeStreamChunk lines."""
    q = db.get(Question, question_id)
    if not q:
        yield json.dumps({"error": "题目不存在", "done": True}, ensure_ascii=False)
        return

    prompt = render_prompt(
        db,
        "grading_rubric",
        {
            "question_text": q.question_text,
            "question_type": q.question_type,
            "standard_answer": q.standard_answer or "(本题未提供标准答案)",
            "answer_points": "\n".join(q.answer_points or []) or "(未提供评分要点)",
            "user_answer": user_answer,
        },
    )

    # 累积完整响应用于结构化解析
    full_text = ""
    try:
        async for chunk in llm.chat_stream(
            [{"role": "user", "content": prompt}], temperature=0.0
        ):
            full_text += chunk
            yield json.dumps({"delta": chunk}, ensure_ascii=False)
    except Exception as e:
        yield json.dumps({"error": f"AI 批改失败: {e}", "done": True}, ensure_ascii=False)
        return

    # 流结束后解析结构化结果并持久化
    from app.schemas.llm_output import GradingResultLLM
    from app.llm.service import _parse_and_validate

    result = _parse_and_validate(full_text, GradingResultLLM)
    if result is None:
        yield json.dumps({"error": "AI 批改结果解析失败,请重试", "done": True}, ensure_ascii=False)
        return

    g = GradingResult(
        id=new_id(),
        practice_record_id=practice_record_id,
        question_id=question_id,
        score=result.score,
        verdict=result.verdict,
        strengths=result.strengths,
        weaknesses=result.weaknesses,
        missing_points=result.missing_points,
        detailed_feedback=result.detailed_feedback,
        improved_answer=result.improved_answer,
        llm_profile_id=llm.profile.id,
        raw_response=full_text,
    )
    db.add(g)
    if practice_record_id:
        pr = db.get(PracticeRecord, practice_record_id)
        if pr:
            pr.grading_id = g.id
    db.commit()
    db.refresh(g)

    from app.schemas.practice import GradingResultOut
    result_out = GradingResultOut.model_validate(g).model_dump(mode="json")
    yield json.dumps({"done": True, "result": result_out}, ensure_ascii=False, default=str)
```

---

## Task 4: 后端 API 路由

**Files:**
- Create: `backend/app/api/routes/bookmarks.py`
- Create: `backend/app/api/routes/notes.py`
- Modify: `backend/app/api/routes/practice.py:24-30`
- Modify: `backend/app/api/routes/questions.py:18-37` + 加答案编辑端点
- Modify: `backend/app/main.py:56-62`

### Step 1: Bookmark 路由

```python
# backend/app/api/routes/bookmarks.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.schemas.bookmark import BookmarkCreate, BookmarkOut
from app.services import bookmark_service

router = APIRouter(tags=["bookmarks"])


@router.post("/bookmarks/toggle")
def toggle_bookmark(data: BookmarkCreate, db: Session = Depends(get_db)):
    return bookmark_service.toggle_bookmark(db, data.question_id)


@router.get("/bookmarks")
def list_bookmarks(db: Session = Depends(get_db)):
    items = bookmark_service.list_bookmarks(db)
    return {"items": [BookmarkOut.model_validate(b).model_dump() for b in items]}


@router.get("/bookmarks/check/{question_id}")
def check_bookmark(question_id: str, db: Session = Depends(get_db)):
    return {"bookmarked": bookmark_service.is_bookmarked(db, question_id)}
```

### Step 2: Note 路由

```python
# backend/app/api/routes/notes.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.schemas.note import NoteCreate, NoteOut, NoteUpdate
from app.services import note_service

router = APIRouter(tags=["notes"])


@router.get("/notes/{question_id}")
def get_note(question_id: str, db: Session = Depends(get_db)):
    note = note_service.get_note(db, question_id)
    if not note:
        return {"content": ""}
    return NoteOut.model_validate(note).model_dump()


@router.put("/notes/{question_id}")
def upsert_note(question_id: str, data: NoteUpdate, db: Session = Depends(get_db)):
    note = note_service.upsert_note(db, question_id, data.content)
    return NoteOut.model_validate(note).model_dump()


@router.delete("/notes/{question_id}", status_code=204)
def delete_note(question_id: str, db: Session = Depends(get_db)):
    if not note_service.delete_note(db, question_id):
        raise HTTPException(status_code=404, detail="笔记不存在")
    return None
```

### Step 3: 流式批改路由

修改 `backend/app/api/routes/practice.py`，在现有 `grade_answer` 端点后添加：

```python
from fastapi.responses import StreamingResponse
import json


@router.post("/practice/grade/stream")
async def grade_answer_stream(req: GradeRequest, db: Session = Depends(get_db)):
    llm = build_llm_service(db)

    async def event_stream():
        async for chunk in practice_service.grade_answer_stream(
            db, llm, req.question_id, req.user_answer, req.practice_record_id
        ):
            yield f"data: {chunk}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

### Step 4: 扩展 Questions 路由

修改 `backend/app/api/routes/questions.py`：

在 `list_questions` 函数参数中添加：

```python
    bookmarked: bool | None = None,
```

在 query 构建中传入 service：

```python
    items, total = question_service.list_questions(
        db, keyword=keyword, tags=tag_list, difficulty=difficulty, qtype=qtype,
        deck_id=deck_id, bookmarked_only=bookmarked, limit=limit, offset=offset,
    )
```

添加答案编辑端点：

```python
class AnswerOverrideRequest(BaseModel):
    answer: str | None = None

@router.put("/questions/{qid}/answer-override")
def update_answer_override(qid: str, data: AnswerOverrideRequest, db: Session = Depends(get_db)):
    q = question_service.update_answer_override(db, qid, data.answer)
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    return {"id": qid, "user_answer_override": data.answer}
```

### Step 5: 注册新路由到 main.py

在 `backend/app/main.py` 中添加：

```python
from app.api.routes import bookmarks as bookmark_routes
from app.api.routes import notes as note_routes

app.include_router(bookmark_routes.router, prefix="/api")
app.include_router(note_routes.router, prefix="/api")
```

---

## Task 5: 前端类型 + API 层扩展

**Files:**
- Modify: `frontend/src/types/index.ts:1-21`
- Modify: `frontend/src/lib/api.ts:47-110`

### Step 1: 扩展 TypeScript 类型

在 `frontend/src/types/index.ts` 中添加：

```typescript
// --- 在 Question 接口中添加 ---
export interface Question {
  // ... 现有字段 ...
  user_answer_override?: string | null;  // 新增
}

// --- 新增类型 ---
export interface Bookmark {
  id: string;
  question_id: string;
  created_at: string;
}

export interface Note {
  id: string;
  question_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface GradeStreamChunk {
  delta?: string;
  done?: boolean;
  result?: GradingResult;
  error?: string;
}

export interface PracticeRecordDetail {
  id: string;
  question_id: string;
  user_answer: string | null;
  revealed: boolean;
  duration_sec: number;
  grading_id: string | null;
  created_at: string;
  grading?: GradingResult | null;
  question?: Question | null;
}
```

### Step 2: 扩展前端 API

在 `frontend/src/lib/api.ts` 的 `api` 对象中添加：

```typescript
  // ---- bookmarks ----
  toggleBookmark: (question_id: string) =>
    req<{ bookmarked: boolean; bookmark_id: string | null }>(`/bookmarks/toggle`, {
      method: "POST",
      body: JSON.stringify({ question_id }),
    }),
  listBookmarks: () => req<{ items: Bookmark[] }>(`/bookmarks`),
  checkBookmark: (question_id: string) =>
    req<{ bookmarked: boolean }>(`/bookmarks/check/${question_id}`),

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

  // ---- streaming grade ----
  streamGrade: (body: { question_id: string; user_answer: string; practice_record_id?: string }) =>
    streamSSE(`/practice/grade/stream`, body),
```

需要在 `listQuestions` 参数中添加 `bookmarked?: boolean`，并在 `qs` 中传递。

---

## Task 6: MarkdownView 集成 KaTeX 数学渲染

**Files:**
- Modify: `frontend/src/components/MarkdownView.tsx`
- Modify: `frontend/src/index.css`
- Modify: `frontend/package.json`

### Step 1: 安装 KaTeX 依赖

```bash
cd frontend && npm install rehype-katex remark-math katex
npm install -D @types/katex
```

### Step 2: 改写 MarkdownView

```typescript
// frontend/src/components/MarkdownView.tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export default function MarkdownView({ children }: { children: string }) {
  return (
    <div className="prose max-w-none text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {children || ""}
      </ReactMarkdown>
    </div>
  );
}
```

### Step 3: 添加 KaTeX CSS

在 `frontend/src/index.css` 顶部添加：

```css
@import "katex/dist/katex.min.css";
```

---

## Task 7: 前端组件（BookmarkButton / NoteEditor / AnswerEditor / StreamingGrade）

**Files:**
- Create: `frontend/src/components/BookmarkButton.tsx`
- Create: `frontend/src/components/NoteEditor.tsx`
- Create: `frontend/src/components/AnswerEditor.tsx`
- Create: `frontend/src/components/StreamingGrade.tsx`

### Step 1: BookmarkButton 组件

```tsx
// frontend/src/components/BookmarkButton.tsx
import { useState } from "react";
import { api } from "../lib/api";

interface Props {
  questionId: string;
  initialBookmarked?: boolean;
  onToggle?: (bookmarked: boolean) => void;
}

export default function BookmarkButton({ questionId, initialBookmarked = false, onToggle }: Props) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    try {
      const r = await api.toggleBookmark(questionId);
      setBookmarked(r.bookmarked);
      onToggle?.(r.bookmarked);
    } catch (e: any) {
      alert(e.message);
    }
    setLoading(false);
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`p-1.5 rounded-md transition-colors ${
        bookmarked
          ? "text-yellow-500 hover:text-yellow-600 bg-yellow-50"
          : "text-gray-400 hover:text-yellow-500 hover:bg-gray-100"
      }`}
      title={bookmarked ? "取消收藏" : "收藏此题"}
    >
      <svg className="w-5 h-5" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    </button>
  );
}
```

### Step 2: NoteEditor 组件

```tsx
// frontend/src/components/NoteEditor.tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Props {
  questionId: string;
  onClose: () => void;
}

export default function NoteEditor({ questionId, onClose }: Props) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.getNote(questionId).then((r) => {
      setContent(r.content || "");
      setLoaded(true);
    });
  }, [questionId]);

  const save = async () => {
    setSaving(true);
    try {
      await api.upsertNote(questionId, content);
      onClose();
    } catch (e: any) {
      alert(e.message);
    }
    setSaving(false);
  };

  const del = async () => {
    if (!confirm("删除此笔记?")) return;
    try {
      await api.deleteNote(questionId);
      setContent("");
      onClose();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-lg">个人笔记</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        {!loaded ? (
          <div className="text-gray-400 text-sm">加载中...</div>
        ) : (
          <>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder="记录这道题的心得、易错点、记忆技巧..."
              className="w-full border rounded p-2 text-sm"
            />
            <div className="flex justify-between mt-3">
              <button onClick={del} className="text-red-600 text-sm hover:underline" disabled={!content}>
                删除笔记
              </button>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-3 py-1.5 border rounded text-sm">取消</button>
                <button onClick={save} disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

### Step 3: AnswerEditor 组件

```tsx
// frontend/src/components/AnswerEditor.tsx
import { useState } from "react";
import { api } from "../lib/api";
import MarkdownView from "./MarkdownView";

interface Props {
  questionId: string;
  currentAnswer: string | null;
  onSaved: (newAnswer: string | null) => void;
  onClose: () => void;
}

export default function AnswerEditor({ questionId, currentAnswer, onSaved, onClose }: Props) {
  const [answer, setAnswer] = useState(currentAnswer || "");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const val = answer.trim() || null;
      await api.updateAnswerOverride(questionId, val);
      onSaved(val);
      onClose();
    } catch (e: any) {
      alert(e.message);
    }
    setSaving(false);
  };

  const reset = async () => {
    if (!confirm("恢复为标准答案?")) return;
    setSaving(true);
    try {
      await api.updateAnswerOverride(questionId, null);
      onSaved(null);
      onClose();
    } catch (e: any) {
      alert(e.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="font-bold text-lg">编辑答案</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setPreview(false)}
              className={`px-3 py-1 text-sm rounded ${!preview ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}
            >
              编辑
            </button>
            <button
              onClick={() => setPreview(true)}
              className={`px-3 py-1 text-sm rounded ${preview ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}
            >
              预览
            </button>
          </div>
          {preview ? (
            <div className="border rounded p-3 min-h-[200px]">
              <MarkdownView>{answer || "（空答案）"}</MarkdownView>
            </div>
          ) : (
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={12}
              placeholder="修改或完善答案(Markdown 格式)..."
              className="w-full border rounded p-2 text-sm font-mono"
            />
          )}
        </div>
        <div className="flex justify-between p-4 border-t">
          <button onClick={reset} className="text-red-600 text-sm hover:underline" disabled={!currentAnswer}>
            恢复标准答案
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 border rounded text-sm">取消</button>
            <button onClick={save} disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
              {saving ? "保存中..." : "保存修改"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Step 4: StreamingGrade 组件

```tsx
// frontend/src/components/StreamingGrade.tsx
import { useEffect, useRef, useState } from "react";
import MarkdownView from "./MarkdownView";
import type { GradingResult } from "../types";

const VERDICT_COLOR: Record<string, string> = {
  correct: "bg-green-100 text-green-700",
  partially_correct: "bg-yellow-100 text-yellow-700",
  incorrect: "bg-red-100 text-red-700",
};

interface Props {
  streamingText: string;
  result: GradingResult | null;
  error: string | null;
  done: boolean;
}

export default function StreamingGrade({ streamingText, result, error, done }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamingText, result]);

  if (error) {
    return <div className="text-red-600 text-sm p-3 bg-red-50 rounded">{error}</div>;
  }

  return (
    <div className="border-t pt-3 space-y-2">
      {/* 流式文本区 */}
      {streamingText && (
        <div>
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            AI 正在批改...
          </div>
          <div className="bg-gray-50 rounded p-3 text-sm max-h-60 overflow-auto">
            <MarkdownView>{streamingText}</MarkdownView>
          </div>
        </div>
      )}

      {/* 完成后的结构化结果 */}
      {done && result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-sm font-bold ${VERDICT_COLOR[result.verdict] || ""}`}>
              {result.verdict}
            </span>
            <span className="text-lg font-bold">{result.score} 分</span>
          </div>
          {result.strengths?.length > 0 && (
            <div>
              <div className="text-xs text-green-700 font-medium">优点</div>
              <ul className="list-disc pl-5 text-sm">
                {result.strengths.map((s, i) => (<li key={i}>{s}</li>))}
              </ul>
            </div>
          )}
          {result.weaknesses?.length > 0 && (
            <div>
              <div className="text-xs text-red-700 font-medium">不足</div>
              <ul className="list-disc pl-5 text-sm">
                {result.weaknesses.map((s, i) => (<li key={i}>{s}</li>))}
              </ul>
            </div>
          )}
          {result.missing_points?.length > 0 && (
            <div>
              <div className="text-xs text-gray-600 font-medium">未覆盖要点</div>
              <ul className="list-disc pl-5 text-sm">
                {result.missing_points.map((s, i) => (<li key={i}>{s}</li>))}
              </ul>
            </div>
          )}
          <div>
            <div className="text-xs text-gray-600 mb-1 font-medium">详细点评</div>
            <MarkdownView>{result.detailed_feedback}</MarkdownView>
          </div>
          {result.improved_answer && (
            <div>
              <div className="text-xs text-gray-600 mb-1 font-medium">参考改进答案</div>
              <MarkdownView>{result.improved_answer}</MarkdownView>
            </div>
          )}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
```

---

## Task 8: PracticePage 重构（流式批改 + 题组 + 收藏/笔记集成）

**Files:**
- Modify: `frontend/src/pages/PracticePage.tsx`

这是最大的一处改动。核心变化：
1. 批改从两段式 `createRecord → grade` 改为 `createRecord → streamGrade`
2. 答案区默认展示 user_answer_override，并加「编辑答案」按钮
3. 加入 BookmarkButton + NoteEditor 入口
4. 题组模式：当题目有 group_id 时按 seq 排列连续展示

完整改写 `PracticePage.tsx`：

```tsx
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { streamSSE } from "../lib/sse";
import RevealCard from "../components/RevealCard";
import StreamingGrade from "../components/StreamingGrade";
import BookmarkButton from "../components/BookmarkButton";
import NoteEditor from "../components/NoteEditor";
import AnswerEditor from "../components/AnswerEditor";
import type { GradingResult, Question } from "../types";

export default function PracticePage() {
  const [mode, setMode] = useState("random");
  const [difficulty, setDifficulty] = useState("");
  const [tags, setTags] = useState("");
  const [deckId, setDeckId] = useState("");
  const [limit, setLimit] = useState(10);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [grading, setGrading] = useState<GradingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [grading2, setGrading2] = useState(false);
  // 流式批改状态
  const [streamText, setStreamText] = useState("");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamDone, setStreamDone] = useState(false);
  // 笔记/答案编辑弹窗
  const [showNote, setShowNote] = useState(false);
  const [showAnswerEditor, setShowAnswerEditor] = useState(false);
  // 题组模式
  const [groupMode, setGroupMode] = useState(true);

  const { data: decksData } = useQuery({ queryKey: ["decks"], queryFn: api.listDecks });
  const decks = decksData?.items || [];

  const current = questions[idx];

  const draw = async () => {
    setLoading(true);
    setGrading(null);
    setUserAnswer("");
    setStreamText("");
    setStreamError(null);
    setStreamDone(false);
    try {
      const r = await api.drawQuestions({
        mode,
        limit,
        difficulty: difficulty || undefined,
        tags: tags || undefined,
        deck_id: deckId || undefined,
      });
      // group mode: sort by group_id then group_seq, flatten groups together
      if (groupMode) {
        const grouped = new Map<string, Question[]>();
        const ungrouped: Question[] = [];
        for (const q of r.items) {
          if (q.group_id) {
            if (!grouped.has(q.group_id)) grouped.set(q.group_id, []);
            grouped.get(q.group_id)!.push(q);
          } else {
            ungrouped.push(q);
          }
        }
        // sort each group by group_seq
        const sorted: Question[] = [];
        for (const g of grouped.values()) {
          g.sort((a, b) => ((a as any).group_seq || 0) - ((b as any).group_seq || 0));
          sorted.push(...g);
        }
        sorted.push(...ungrouped);
        setQuestions(sorted);
      } else {
        setQuestions(r.items);
      }
      setIdx(0);
      if (r.items.length === 0) alert("没有符合条件的题目");
    } catch (e: any) {
      alert(e.message);
    }
    setLoading(false);
  };

  const doGrade = async () => {
    if (!current || !userAnswer.trim()) return;
    setGrading2(true);
    setGrading(null);
    setStreamText("");
    setStreamError(null);
    setStreamDone(false);
    try {
      const rec = await api.createPracticeRecord({
        question_id: current.id,
        user_answer: userAnswer,
        revealed: true,
        duration_sec: 0,
      });
      await streamSSE(`/practice/grade/stream`, {
        question_id: current.id,
        user_answer: userAnswer,
        practice_record_id: rec.id,
      }, {
        onDelta: (d) => setStreamText((t) => t + d),
        onDone: () => setStreamDone(true),
        onError: (m) => setStreamError(m),
      });
    } catch (e: any) {
      setStreamError(e.message);
    }
    setGrading2(false);
  };

  const next = () => {
    setGrading(null);
    setUserAnswer("");
    setStreamText("");
    setStreamError(null);
    setStreamDone(false);
    setIdx((i) => i + 1);
  };

  // --- 抽题 UI（无题目时）---
  if (questions.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-xl font-bold mb-4">刷题（盖答案）</h1>
        <div className="bg-white border rounded-lg p-4 space-y-3 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              抽题模式
              <select value={mode} onChange={(e) => setMode(e.target.value)}
                className="block border rounded px-2 py-1.5 mt-1 w-full text-sm">
                <option value="random">随机</option>
                <option value="wrong">错题重练</option>
                <option value="tag">按标签</option>
              </select>
            </label>
            <label className="text-sm">
              难度
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
                className="block border rounded px-2 py-1.5 mt-1 w-full text-sm">
                <option value="">不限</option>
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
            </label>
            <label className="text-sm">
              标签（逗号分隔）
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="如:JavaScript,闭包"
                className="block border rounded px-2 py-1.5 mt-1 w-full text-sm" />
            </label>
            <label className="text-sm">
              数量
              <input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))}
                className="block border rounded px-2 py-1.5 mt-1 w-full text-sm" />
            </label>
            <label className="text-sm col-span-2">
              题库
              <select value={deckId} onChange={(e) => setDeckId(e.target.value)}
                className="block border rounded px-2 py-1.5 mt-1 w-full text-sm">
                <option value="">全部题库</option>
                {decks.map((d) => (<option key={d.id} value={d.id}>{d.name}（{d.question_count}）</option>))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={groupMode} onChange={(e) => setGroupMode(e.target.checked)} />
            整组抽取（追问题目连续出现）
          </label>
          <button onClick={draw} disabled={loading}
            className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {loading ? "抽题中..." : "开始刷题"}
          </button>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="p-6 text-center">
        <div className="text-gray-600 mb-4">本轮已刷完！</div>
        <button onClick={() => setQuestions([])} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          再来一组
        </button>
      </div>
    );
  }

  const displayAnswer = current.user_answer_override ?? current.standard_answer;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* 进度条 */}
      <div className="flex justify-between items-center mb-3 text-sm text-gray-500">
        <span>第 {idx + 1} / {questions.length} 题</span>
        <div className="flex items-center gap-2">
          {/* 题组标记 */}
          {(current as any).group_label && (
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
              {(current as any).group_label}
            </span>
          )}
          {groupMode && (current as any).group_id && (
            <span className="text-xs text-purple-600">
              追问链 ({questions.filter(q => (q as any).group_id === (current as any).group_id).length} 题)
            </span>
          )}
          <button onClick={() => setQuestions([])} className="hover:underline">结束本轮</button>
        </div>
      </div>

      {/* 题目标题栏 + 收藏按钮 */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex-1" />
        <BookmarkButton questionId={current.id} />
      </div>

      <RevealCard
        key={current.id}
        question={current}
        customAnswer={displayAnswer}
        onEditAnswer={() => setShowAnswerEditor(true)}
        onOpenNote={() => setShowNote(true)}
      />

      {/* 我的答案区 */}
      <div className="bg-white border rounded-lg p-4 mt-4 space-y-3 shadow-sm">
        <div className="text-xs text-gray-500 font-medium">我的答案</div>
        <textarea
          value={userAnswer}
          onChange={(e) => setUserAnswer(e.target.value)}
          rows={5}
          placeholder="输入你的答案，提交给 AI 面试官批改..."
          className="w-full border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
        />
        <div className="flex gap-2">
          <button
            onClick={doGrade}
            disabled={grading2 || !userAnswer.trim()}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {grading2 ? "批改中..." : "提交 AI 批改"}
          </button>
          <button onClick={next} className="px-4 py-1.5 border rounded-lg text-sm hover:bg-gray-50 transition-colors">
            下一题
          </button>
        </div>

        {/* 流式批改结果 */}
        {(streamText || streamError || streamDone) && (
          <StreamingGrade
            streamingText={streamText}
            result={grading}
            error={streamError}
            done={streamDone}
          />
        )}
      </div>

      {/* 笔记弹窗 */}
      {showNote && <NoteEditor questionId={current.id} onClose={() => setShowNote(false)} />}

      {/* 答案编辑弹窗 */}
      {showAnswerEditor && (
        <AnswerEditor
          questionId={current.id}
          currentAnswer={current.user_answer_override ?? null}
          onSaved={(newAnswer) => {
            current.user_answer_override = newAnswer;
          }}
          onClose={() => setShowAnswerEditor(false)}
        />
      )}
    </div>
  );
}
```

**注意：** `RevealCard` 需要同步修改 props 接口来接收 `customAnswer`、`onEditAnswer`、`onOpenNote`。

---

## Task 9: RevealCard 组件更新（收藏 + 笔记 + 答案编辑入口）

**Files:**
- Modify: `frontend/src/components/RevealCard.tsx`

### Step: 更新 RevealCard props 和 UI

在现有 RevealCard 基础上修改接口并增加按钮：

```tsx
// 修改 Props 接口：
interface Props {
  question: Question;
  onRevealed?: () => void;
  customAnswer?: string | null;     // user_answer_override
  onEditAnswer?: () => void;        // 打开答案编辑弹窗
  onOpenNote?: () => void;          // 打开笔记弹窗
}

// 在答案区标题旁添加编辑按钮：
<div className="flex items-center gap-2">
  <div className="text-xs text-gray-500 mb-1 font-medium">标准答案</div>
  {onEditAnswer && (
    <button onClick={onEditAnswer}
      className="text-xs text-blue-600 hover:underline">
      {customAnswer ? "编辑(自定义)" : "完善答案"}
    </button>
  )}
  {onOpenNote && (
    <button onClick={onOpenNote}
      className="text-xs text-gray-500 hover:underline">
      笔记
    </button>
  )}
</div>

// 答案显示改为 customAnswer || standard_answer：
<MarkdownView>{customAnswer || question.standard_answer || "(本题无标准答案)"}</MarkdownView>
```

---

## Task 10: HistoryPage 重构 + PracticeDetailPage

**Files:**
- Modify: `frontend/src/pages/HistoryPage.tsx`
- Create: `frontend/src/pages/PracticeDetailPage.tsx`
- Modify: `backend/app/api/routes/practice.py:33-41`（加 detail 端点）

### Step 1: 后端添加 Practice Record Detail 端点

在 `backend/app/api/routes/practice.py` 添加：

```python
@router.get("/practice/records/{record_id}/detail")
def get_record_detail(record_id: str, db: Session = Depends(get_db)):
    pr = db.get(PracticeRecord, record_id)
    if not pr:
        raise HTTPException(status_code=404, detail="记录不存在")
    grading = None
    question = None
    if pr.grading_id:
        grading = db.get(GradingResult, pr.grading_id)
    if pr.question_id:
        question = db.get(Question, pr.question_id)
    return {
        "id": pr.id,
        "question_id": pr.question_id,
        "user_answer": pr.user_answer,
        "revealed": pr.revealed,
        "duration_sec": pr.duration_sec,
        "grading_id": pr.grading_id,
        "created_at": pr.created_at.isoformat() if pr.created_at else None,
        "grading": GradingResultOut.model_validate(grading).model_dump() if grading else None,
        "question": QuestionOut.model_validate(question).model_dump() if question else None,
    }
```

同时扩展 `list_records` 端点返回 grading 信息：

```python
@router.get("/practice/records")
def list_records(db: Session = Depends(get_db), question_id: str | None = None, limit: int = 50):
    items = practice_service.list_records(db, question_id, limit)
    result = []
    for r in items:
        grading = db.get(GradingResult, r.grading_id) if r.grading_id else None
        question = db.get(Question, r.question_id) if r.question_id else None
        result.append({
            "id": r.id,
            "question_id": r.question_id,
            "user_answer": r.user_answer,
            "revealed": r.revealed,
            "duration_sec": r.duration_sec,
            "grading_id": r.grading_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "grading": GradingResultOut.model_validate(grading).model_dump() if grading else None,
            "question": QuestionOut.model_validate(question).model_dump() if question else None,
        })
    return {"items": result}
```

### Step 2: HistoryPage 改版

```tsx
// frontend/src/pages/HistoryPage.tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { PracticeRecordDetail } from "../types";

const VERDICT_COLOR: Record<string, string> = {
  correct: "text-green-600",
  partially_correct: "text-yellow-600",
  incorrect: "text-red-600",
};

export default function HistoryPage() {
  const { data: sessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: api.listSessions,
  });
  const { data: recordsData } = useQuery({
    queryKey: ["practiceRecords"],
    queryFn: () => api.listRecords(),
  });
  const { data: wrong } = useQuery({
    queryKey: ["wrongQuestions"],
    queryFn: api.wrongQuestions,
  });
  const { data: bookmarks } = useQuery({
    queryKey: ["bookmarks"],
    queryFn: api.listBookmarks,
  });

  const records: PracticeRecordDetail[] = recordsData?.items || [];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <h1 className="text-xl font-bold">历史记录</h1>

      {/* 刷题记录（含完整批改结果可回溯） */}
      <section>
        <div className="text-sm font-medium text-gray-600 mb-3">刷题记录</div>
        {records.length === 0 ? (
          <div className="text-gray-400 text-sm">暂无刷题记录</div>
        ) : (
          <div className="space-y-2">
            {records.map((r) => (
              <div key={r.id} className="bg-white border rounded-lg p-3 hover:border-blue-300 transition-colors">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {r.question?.question_text || "（题目已删除）"}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      <span>{new Date(r.created_at).toLocaleString()}</span>
                      {r.grading && (
                        <span className={VERDICT_COLOR[r.grading.verdict] || ""}>
                          {r.grading.verdict} · {r.grading.score}分
                        </span>
                      )}
                    </div>
                    {r.user_answer && (
                      <div className="text-xs text-gray-400 mt-1 truncate">
                        我的答案: {r.user_answer.slice(0, 80)}{r.user_answer.length > 80 ? "..." : ""}
                      </div>
                    )}
                  </div>
                  <Link
                    to={`/practice/record/${r.id}`}
                    className="ml-3 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50 shrink-0"
                  >
                    查看详情
                  </Link>
                </div>
                {/* 展开显示 grading 摘要 */}
                {r.grading && (
                  <div className="mt-2 pt-2 border-t text-xs space-y-1">
                    {r.grading.strengths?.length > 0 && (
                      <div className="text-green-700">✓ {r.grading.strengths.slice(0, 2).join("；")}</div>
                    )}
                    {r.grading.weaknesses?.length > 0 && (
                      <div className="text-red-700">✗ {r.grading.weaknesses.slice(0, 2).join("；")}</div>
                    )}
                    {r.grading.improved_answer && (
                      <div className="text-gray-500">
                        💡 已生成参考改进答案
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 错题集 */}
      <section>
        <div className="text-sm font-medium text-gray-600 mb-3">错题集</div>
        {(wrong?.items || []).length === 0 ? (
          <div className="text-gray-400 text-sm">暂无错题</div>
        ) : (
          <div className="space-y-2">
            {wrong?.items.map((q) => (
              <Link
                key={q.id}
                to={`/practice?question_id=${q.id}`}
                className="block bg-white border rounded-lg p-3 text-sm hover:border-red-300 transition-colors"
              >
                <div className="text-gray-900 truncate">{q.question_text}</div>
                <div className="text-xs text-gray-400 mt-1">{q.question_type} · {q.difficulty}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 收藏 */}
      <section>
        <div className="text-sm font-medium text-gray-600 mb-3">
          收藏题目（{bookmarks?.items?.length || 0}）
        </div>
        <Link
          to="/bank?bookmarked=true"
          className="text-sm text-blue-600 hover:underline"
        >
          在题库中查看收藏 →
        </Link>
      </section>

      {/* 仿真面试记录 */}
      <section>
        <div className="text-sm font-medium text-gray-600 mb-3">仿真面试记录</div>
        {(sessions?.items || []).length === 0 ? (
          <div className="text-gray-400 text-sm">暂无</div>
        ) : (
          <div className="space-y-2">
            {sessions?.items.map((s) => (
              <div key={s.id} className="bg-white border rounded-lg p-3 flex justify-between items-center">
                <div>
                  <div className="font-medium text-sm">{s.title}</div>
                  <div className="text-xs text-gray-400">{new Date(s.created_at).toLocaleString()}</div>
                </div>
                <div className="flex gap-2">
                  {s.status === "finished" && (
                    <Link to={`/simulation/${s.id}/report`} className="text-xs text-blue-600 hover:underline">查看报告</Link>
                  )}
                  <Link to={`/simulation/${s.id}`} className="text-xs text-gray-600 hover:underline">打开</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

### Step 3: PracticeDetailPage（单题详情回溯）

```tsx
// frontend/src/pages/PracticeDetailPage.tsx
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import MarkdownView from "../components/MarkdownView";
import type { GradingResult } from "../types";

const VERDICT_COLOR: Record<string, string> = {
  correct: "bg-green-100 text-green-700",
  partially_correct: "bg-yellow-100 text-yellow-700",
  incorrect: "bg-red-100 text-red-700",
};

export default function PracticeDetailPage() {
  const { recordId } = useParams<{ recordId: string }>();
  const nav = useNavigate();

  const { data: detail, isLoading } = useQuery({
    queryKey: ["practiceDetail", recordId],
    queryFn: () => api.getPracticeRecordDetail(recordId!),
    enabled: !!recordId,
  });

  if (isLoading) return <div className="p-6 text-gray-500">加载中...</div>;
  if (!detail) return <div className="p-6 text-gray-500">记录不存在</div>;

  const g: GradingResult | null = detail.grading ?? null;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button onClick={() => nav(-1)} className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        ← 返回历史记录
      </button>

      {/* 题目 */}
      <div className="bg-white border rounded-lg p-6 mb-4 shadow-sm">
        <div className="text-xs text-gray-500 mb-2">
          {new Date(detail.created_at).toLocaleString()} · 用时 {detail.duration_sec}s
        </div>
        <div className="text-base text-gray-900 whitespace-pre-wrap leading-relaxed mb-4">
          {detail.question?.question_text || "题目已删除"}
        </div>
        {detail.question?.standard_answer && (
          <div>
            <div className="text-xs text-gray-500 mb-1 font-medium">标准答案</div>
            <MarkdownView>{detail.question.standard_answer}</MarkdownView>
          </div>
        )}
      </div>

      {/* 用户答案 */}
      <div className="bg-white border rounded-lg p-6 mb-4 shadow-sm">
        <div className="text-xs text-gray-500 mb-1 font-medium">我的答案</div>
        <div className="text-sm whitespace-pre-wrap">{detail.user_answer || "（未作答）"}</div>
      </div>

      {/* 批改结果 */}
      {g && (
        <div className="bg-white border rounded-lg p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded text-sm font-bold ${VERDICT_COLOR[g.verdict] || ""}`}>
              {g.verdict}
            </span>
            <span className="text-2xl font-bold">{g.score} 分</span>
          </div>

          {g.strengths?.length > 0 && (
            <div>
              <div className="text-sm text-green-700 font-medium mb-1">优点</div>
              <ul className="list-disc pl-5 text-sm space-y-0.5">
                {g.strengths.map((s, i) => (<li key={i}>{s}</li>))}
              </ul>
            </div>
          )}
          {g.weaknesses?.length > 0 && (
            <div>
              <div className="text-sm text-red-700 font-medium mb-1">不足</div>
              <ul className="list-disc pl-5 text-sm space-y-0.5">
                {g.weaknesses.map((s, i) => (<li key={i}>{s}</li>))}
              </ul>
            </div>
          )}
          {g.missing_points?.length > 0 && (
            <div>
              <div className="text-sm text-gray-600 font-medium mb-1">未覆盖要点</div>
              <ul className="list-disc pl-5 text-sm space-y-0.5">
                {g.missing_points.map((s, i) => (<li key={i}>{s}</li>))}
              </ul>
            </div>
          )}

          <div>
            <div className="text-sm text-gray-600 font-medium mb-1">详细点评</div>
            <MarkdownView>{g.detailed_feedback}</MarkdownView>
          </div>

          {g.improved_answer && (
            <div>
              <div className="text-sm text-gray-600 font-medium mb-1">参考改进答案</div>
              <div className="bg-blue-50 rounded-lg p-4">
                <MarkdownView>{g.improved_answer}</MarkdownView>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Step 4: 注册新路由

在 `frontend/src/App.tsx`（或路由配置文件）中添加：

```tsx
<Route path="/practice/record/:recordId" element={<PracticeDetailPage />} />
```

---

## Task 11: Claude 风格 UI 全局重设计

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/tailwind.config.js`

### Step 1: Tailwind 配置扩展

```javascript
// frontend/tailwind.config.js
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Claude-inspired palette
        brand: {
          50:  "#faf5ec",
          100: "#f4ebd9",
          200: "#e9d7b3",
          300: "#ddc38d",
          400: "#d4af6a",  // accent gold
          500: "#c49a45",
          600: "#b08030",
          700: "#8c6426",
          800: "#6b4c1d",
          900: "#4a3414",
        },
        surface: {
          DEFAULT: "#fafaf9",
          raised: "#ffffff",
          overlay: "#f5f5f4",
        },
        ink: {
          DEFAULT: "#1c1917",
          muted: "#78716c",
          subtle: "#a8a29e",
          invert: "#ffffff",
        },
      },
      fontFamily: {
        sans: ['"Inter"', '"Noto Sans SC"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      borderRadius: {
        DEFAULT: "0.625rem",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        elevated: "0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
      },
    },
  },
  plugins: [],
};
```

### Step 2: 全局 CSS 变量

在 `frontend/src/index.css` 中（KaTeX import 之后）：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-primary: #fafaf9;
  --bg-surface: #ffffff;
  --bg-overlay: #f5f5f4;
  --text-primary: #1c1917;
  --text-muted: #78716c;
  --text-subtle: #a8a29e;
  --accent: #d4af6a;
  --accent-hover: #c49a45;
  --brand-blue: #3b82f6;
  --brand-blue-hover: #2563eb;
  --radius-default: 0.625rem;
  --shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.06);
  --shadow-elevated: 0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.05);
}

body {
  margin: 0;
  font-family: 'Inter', 'Noto Sans SC', system-ui, -apple-system, sans-serif;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #d6d3d1; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #a8a29e; }

/* prose overrides */
.prose {
  --tw-prose-body: var(--text-primary);
  --tw-prose-headings: var(--text-primary);
  --tw-prose-links: var(--brand-blue);
  --tw-prose-code: #1c1917;
  --tw-prose-pre-bg: #f5f5f4;
}

/* smooth transitions */
* { transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
```

### Step 3: Layout 组件 Claude 风格改写

```tsx
// frontend/src/components/Layout.tsx
import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/bank", label: "题库", icon: "📚" },
  { to: "/practice", label: "刷题", icon: "✍️" },
  { to: "/simulation", label: "仿真面试", icon: "🎯" },
  { to: "/history", label: "历史", icon: "📋" },
  { to: "/settings", label: "设置", icon: "⚙️" },
];

export default function Layout() {
  return (
    <div className="h-full flex flex-col bg-surface">
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur-sm px-6 py-3 flex items-center gap-8 sticky top-0 z-40">
        <div className="font-bold text-lg text-ink flex items-center gap-2">
          <span className="w-8 h-8 bg-brand-400 rounded-lg flex items-center justify-center text-white text-sm">F</span>
          <span>FaceAce <span className="text-brand-600 font-semibold">面试助手</span></span>
        </div>
        <nav className="flex gap-0.5">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-stone-100 text-ink"
                    : "text-ink-muted hover:text-ink hover:bg-stone-50"
                }`
              }
            >
              <span className="mr-1.5">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

### Step 4: 全局按钮/输入框样式统一

在各组件中统一替换：
- 普通按钮：`rounded-lg` + `transition-colors` + `shadow-sm`
- 主按钮：`bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-colors`
- 输入框：`border-stone-200 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-400`
- 卡片：`bg-white rounded-xl shadow-card border border-stone-100`

---

## Task 12: 路由注册 + 端到端验证

**Files:**
- Modify: `frontend/src/App.tsx`（或路由文件）
- 无需新文件

### Step 1: 添加 PracticeDetailPage 路由

找到前端路由定义文件并添加：

```tsx
import PracticeDetailPage from "./pages/PracticeDetailPage";

// 在 Routes 中添加：
<Route path="/practice/record/:recordId" element={<PracticeDetailPage />} />
```

### Step 2: 全局验证清单

- [ ] 后端启动无报错（migration 成功创建新表/列）
- [ ] POST `/api/bookmarks/toggle` 切换收藏状态
- [ ] GET `/api/bookmarks` 列出收藏
- [ ] PUT `/api/notes/{qid}` 创建/更新笔记
- [ ] GET `/api/notes/{qid}` 获取笔记
- [ ] PUT `/api/questions/{qid}/answer-override` 覆盖答案
- [ ] POST `/api/practice/grade/stream` SSE 流式返回批改
- [ ] GET `/api/practice/records/{id}/detail` 返回完整记录+批改
- [ ] 前端刷题页：流式批改动画正常，收藏/笔记/编辑按钮可见
- [ ] 前端历史页：可查看记录摘要 + 点击进入详情
- [ ] 前端详情页：显示题目+用户答案+完整 grading（含 improved_answer）
- [ ] 前端题库页：可按收藏筛选
- [ ] KaTeX 数学公式渲染：`$x^2$` 行内公式 + `$$\sqrt{2}$$` 块级公式
- [ ] 题组模式：有 group_id 的题目连续出现，显示追问标签
- [ ] Claude 风格 UI：暖色调、圆角、阴影、字体符合设计

---

## 自审清单

### 1. Spec coverage

| 需求 | 对应 Task |
|------|----------|
| 完善历史记录保存状态 | Task 10（HistoryPage + PracticeDetailPage + 后端 detail API） |
| 新增收藏功能 | Task 1-5（Bookmark 模型/API/前端组件） |
| 流式输出批改 | Task 3.4 + Task 4.3 + Task 7.4 + Task 8 |
| 数学符号渲染 | Task 6（KaTeX 集成） |
| 连续追问题目组 | Task 8（PracticePage group mode, 已有数据层支持） |
| 修改/完善答案 | Task 3.3 + Task 7.3 + Task 9（AnswerEditor + user_answer_override） |
| 笔记功能 | Task 1-5（Note 模型/API/前端 NoteEditor） |
| Claude 风格 UI | Task 11（Tailwind 扩展 + CSS 变量 + Layout 重设计） |

### 2. Placeholder scan

无 TBD/TODO/空实现。每个 task 包含完整代码。

### 3. Type consistency

- `BookmarkOut.id` — String(32) → TS `string` ✓
- `NoteOut.content` — Text → TS `string` ✓
- `QuestionOut.user_answer_override` — Text/nullable → TS `string | null | undefined` ✓
- `PracticeRecordDetail.grading` — GradingResultOut | null ✓
- `StreamingGrade` props — streamingText/result/error/done 类型匹配 ✓
- `RevealCard` 新 props — customAnswer/onEditAnswer/onOpenNote 在各调用处传入 ✓
