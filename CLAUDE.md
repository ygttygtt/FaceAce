# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

FaceAce 是一个本地 Web 面试助手，核心功能：
- **刷题模式**：盖答案刷题 + AI 批改（评分+优点+不足+改进答案）
- **仿真模式**：与 LLM 面试官多轮流式对话（SSE 流式 + TTS 朗读），结束后生成结构化报告

## 常用命令

### 开发模式（唯一启动方式）

```bash
# 一键启动前后端（自动杀旧进程 → 启动后端 :8000 + 前端 :5173 → 打开浏览器）
dev.bat
```

- 后端是纯 API 服务器，不托管任何前端页面
- 前端始终通过 Vite dev server（`http://localhost:5173`）访问
- 访问 `http://localhost:8000` 只会看到 API 文档页，看不到前端

### CLI 导入文档

```bash
cd backend
.venv/Scripts/python.exe -m app.ingest path/to/file.docx                 # 导入后到 Web 审核
.venv/Scripts/python.exe -m app.ingest path/to/file.docx --auto-approve  # 跳过审核直接入库
```

### 测试

```bash
cd backend
.venv/Scripts/python.exe -m pytest
.venv/Scripts/python.exe -m pytest tests/test_xxx.py -v   # 单个测试文件
```

## 架构要点

### 后端（FastAPI + SQLAlchemy 2.0 + SQLite）

```
backend/app/
├─ main.py              # 入口，lifespan 初始化 DB + seed
├─ core/
│   ├─ config.py        # pydantic-settings，从 .env 加载
│   ├─ ids.py           # new_id() → 32 位 hex (uuid4)
│   └─ logging.py
├─ db/
│   ├─ base.py          # DeclarativeBase + TimestampMixin
│   ├─ session.py       # engine/session/get_db()/init_db()
│   ├─ seed.py          # 首次启动 seed LLM profile + prompt templates
│   └─ migrate.py       # 现有表的列补丁
├─ models/              # ORM 模型（导入 __init__.py 会注册所有表）
│   ├─ question.py      # Question（题库核心）
│   ├─ deck.py          # Deck（题目分组）
│   ├─ practice.py      # PracticeRecord + GradingResult
│   ├─ simulation.py    # SimulationSession + Message + Report
│   ├─ config.py        # LLMProfile + PromptTemplate + UserConfig
│   └─ ingest.py        # IngestJob
├─ schemas/             # Pydantic schema（请求/响应 + LLM 结构化输出）
├─ api/routes/          # REST 端点
│   ├─ questions.py     # 题库 CRUD + 抽题 + 批量操作
│   ├─ practice.py      # 刷题记录 + AI 批改
│   ├─ simulation.py    # 仿真会话 + SSE 流式对话 + 报告
│   ├─ ingest.py        # 文档上传 + 审核 + JSON 导入
│   ├─ config.py        # LLM profile/prompt/用户配置
│   └─ health.py
├─ llm/                 # LLM 交互（唯一对外接口层）
│   ├─ adapter.py       # OpenAI 兼容 httpx 直调（chat + stream）
│   ├─ service.py       # 高级封装：chat/stream/structured（三级降级）
│   ├─ prompts.py       # 模板渲染 {{var}} + DB 查找 + 默认 fallback
│   └─ default_prompts.py  # 内置 prompt 模板
├─ ingest/              # 文档导入流水线
│   ├─ extractor.py     # 文本提取（md/txt/docx/pdf）
│   ├─ chunker.py       # 启发式切题（题号标记 → 合并 → 滑动窗口）
│   ├─ normalizer.py    # LLM 归一化为结构化题目
│   ├─ pipeline.py      # 编排：extract → chunk → normalize → store
│   └─ __main__.py      # CLI 入口
└─ services/            # 业务编排
    ├─ practice_service.py    # 刷题记录 + AI 批改
    ├─ simulation_service.py  # 仿真会话 + SSE 流式
    ├─ report_service.py      # 面试报告生成
    └─ question_service.py    # 题库查询/抽题/导出
```

### 前端（React 18 + TypeScript + Vite + Tailwind）

```
frontend/src/
├─ lib/
│   ├─ api.ts           # fetch 封装（api 对象统一管理所有端点）
│   ├─ sse.ts           # SSE 流式解析（POST + ReadableStream）
│   └─ tts.ts           # Web Speech API TTS
├─ types/index.ts       # TypeScript 接口定义
├─ store/               # zustand 状态（目前仅 UI 偏好）
├─ components/          # Layout / RevealCard / ChatBubble / TTSButton / MarkdownView
└─ pages/               # QuestionBank / Ingest / Practice / Simulation / Report / History / Settings
```

### 关键设计决策

1. **LLM 解耦**：`app/llm/adapter.py` 是唯一与外部 LLM 交互的地方，所有 provider（DeepSeek/OpenAI/通义/Ollama 等 OpenAI 兼容服务）统一处理。

2. **结构化输出三级降级**：`LLMService.structured()` 按 `json_schema → json_object → 纯文本+正则提取` 逐级降级，每级用 Pydantic 校验。

3. **Prompt 模板系统**：`default_prompts.py` 定义内置模板，DB 中 `prompt_templates` 表存储用户编辑后的版本，前端「设置」页可修改。模板用 `{{var}}` 占位符。

4. **题库标准格式**：单题包含 `question_text / question_type / difficulty / tags / options / standard_answer / answer_points / explanation`。支持追问链分组（`group_id / group_seq / group_label`）。

5. **前后端严格分离**：后端是纯 JSON API 服务，不托管任何前端页面。前端由 Vite dev server 独立运行，通过 Vite proxy 转发 `/api` 到后端。永远不构建 `frontend/dist` 给后端用。

6. **ID 生成**：所有实体 ID 使用 `uuid.uuid4().hex`（32 位 hex 字符串），见 `app/core/ids.py`。

7. **数据库迁移**：`db/migrate.py` 通过 `run_migrations(engine)` 在 `init_db()` 时自动补丁缺失列，无需 Alembic。

## 环境配置

```bash
# backend/.env（可从 .env.example 复制）
DATABASE_URL=sqlite:///./data/faceace.db
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=your_key_here
LLM_MODEL=deepseek-chat

# frontend/.env（可选）
VITE_API_BASE=           # 留空表示同源，开发时 Vite proxy 会转发
```

## 注意事项

- LLM API key 只在后端存储，API 返回时脱敏（`mask_key()`）
- TTS 依赖系统中文语音引擎（Windows 自带 Huihui/Yaoyao）
- 扫描版 PDF / 图片题不支持（轻量路线，不上 OCR/VLM）
- SQLite 数据库文件位于 `backend/data/faceace.db`，导入暂存在 `backend/data/ingest/`
