# FaceAce

本地 Web 面试助手：将杂乱的面试题文档归一化为结构化题库，支持「盖答案刷题 + AI 批改」和「全流程仿真面试（SSE 流式 + TTS）」两种模式。后台 LLM 走通用 OpenAI 兼容接口，可配置。

## 功能

**文档处理**
- 支持 `.md`、`.txt`、`.docx`、`.pdf`（需可复制文字，扫描件不支持）
- 文本提取 -> 启发式切题 -> LLM 归一化为 `问题+答案+解析+评分要点` 标准结构 -> 人工审核 -> 入库
- 提供 CLI 与 Web 上传两种入口

**刷题模式**
- 像背单词一样先盖住答案，思考后揭晓
- 可把自己的答案提交给 AI 批改（评分+优点+不足+改进答案）
- 抽题策略：随机 / 按标签 / 按难度 / 错题重练

**仿真模式**
- 与 LLM 面试官多轮流式对话，可追问
- 面试官消息可 TTS 朗读
- 结束后生成结构化报告（总分+各题反馈+改进建议）

**配置系统**
- 多 LLM profile（OpenAI 兼容，base_url+key+model）
- Prompt 模板前端可编辑
- TTS 偏好

## 技术栈

- **后端**：Python 3.13 + FastAPI + SQLAlchemy 2.0 + SQLite + httpx + python-docx + pdfplumber
- **前端**：React 18 + TypeScript + Vite + Tailwind CSS + zustand + TanStack Query + react-markdown
- **LLM**：自封装 OpenAI 兼容 adapter（httpx 直调，不耦合厂商 SDK），支持 chat / 流式 / 结构化输出（三级降级：json_schema -> json_object -> 文本提取）
- **TTS**：浏览器 Web Speech API（免费，预留云 TTS 接口）

## 快速开始

### 环境要求

- Python 3.13+
- Node.js 18+
- OpenAI 兼容的 LLM API key（DeepSeek、OpenAI 等）

### 1. 后端

```bash
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
# 配置默认 LLM（可选，也可启动后在「设置」页配）
cp .env.example .env   # 填入 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

### 2. 前端

```bash
cd frontend
npm install
npm run dev    # 打开 http://localhost:5173
```

### 3. 首次使用

1. 打开 `http://localhost:5173` -> 「设置」-> 「LLM 配置」：新增一个 profile（填 base_url / api_key / model，例如 DeepSeek `https://api.deepseek.com/v1` + `deepseek-chat`），设为默认，点「测试连接」。若不确定是否支持 json_schema，保持关闭即可（会自动降级）。
2. （可选）「TTS & 偏好」：开启 TTS 并选中文语音。
3. 「导入文档」：上传面试题文档 -> 等待 AI 归一化完成（状态变「待审核」）-> 审核题目 -> 入库。
4. 「刷题」：选抽题模式开始；「仿真面试」：新建会话开始多轮对话。

### CLI 导入（可选）

```bash
cd backend
.venv\Scripts\python.exe -m app.ingest path/to/file.docx                 # 导入后到 Web 审核
.venv\Scripts\python.exe -m app.ingest path/to/file.docx --auto-approve  # 跳过审核直接入库
```

### 一键启动脚本

- **开发模式**（双进程热重载）：双击 `dev.bat`
- **生产模式**（单进程，后端托管前端）：双击 `start.bat`

## 题库标准格式（单题）

```jsonc
{
  "question_text": "什么是闭包?",
  "question_type": "short_answer",      // single_choice|multiple_choice|short_answer|essay|coding|behavioral|case|concept
  "difficulty": "medium",               // easy|medium|hard
  "tags": ["JavaScript", "闭包"],
  "options": null,                      // 选择题为 string[]
  "standard_answer": "...",
  "answer_points": ["要点1", "要点2"],   // 给 AI 批改用
  "explanation": "...",
  "source": { "file": "x.docx", "page": 12, "raw_index": 3 }
}
```

「题库」页可一键导出全量 JSON 备份。

## 项目结构

```
FaceAce/
├── backend/                 FastAPI 后端
│   ├── app/
│   │   ├── main.py          入口
│   │   ├── core/            config / logging / ids
│   │   ├── db/              base / session / seed / migrate
│   │   ├── models/          ORM 模型
│   │   ├── schemas/         Pydantic schema（含 LLM 结构化输出）
│   │   ├── api/routes/      REST 端点
│   │   ├── llm/             adapter（唯一外部交互）/ service / prompts
│   │   ├── ingest/          文档处理流水线（extract -> chunk -> normalize -> store）
│   │   └── services/        业务编排
│   └── requirements.txt
├── frontend/                React 前端
│   └── src/
│       ├── lib/             API client / SSE handler / TTS wrapper
│       ├── components/      可复用 UI 组件
│       ├── pages/           页面组件
│       ├── store/           Zustand 状态管理
│       └── types/           TypeScript 类型定义
├── docs/                    文档
└── dev.bat / start.bat      一键启动脚本
```

## 架构说明

- **LLM 解耦**：`app/llm/adapter.py` 是唯一与外部 LLM 交互的地方，所有 provider（DeepSeek / OpenAI / 通义 / Ollama 等 OpenAI 兼容服务）统一处理。
- **结构化输出三级降级**：`LLMService.structured()` 按 `json_schema -> json_object -> 纯文本+正则提取` 逐级降级，每级用 Pydantic 校验。
- **Prompt 模板系统**：`default_prompts.py` 定义内置模板，DB 中 `prompt_templates` 表存储用户编辑后的版本，前端「设置」页可修改。模板用 `{{var}}` 占位符。
- **单进程部署**：当 `frontend/dist` 存在时，FastAPI 直接托管前端 SPA（`main.py` 中的 SPA fallback）。
- **ID 生成**：所有实体 ID 使用 `uuid.uuid4().hex`（32 位 hex 字符串），见 `app/core/ids.py`。
- **数据库迁移**：`db/migrate.py` 通过 `run_migrations(engine)` 在 `init_db()` 时自动补丁缺失列，无需 Alembic。

## 环境变量

```bash
# backend/.env（可从 .env.example 复制）
DATABASE_URL=sqlite:///./data/faceace.db
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=your_key_here
LLM_MODEL=deepshake-chat
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=2048
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# frontend/.env（可选）
VITE_API_BASE=           # 留空表示同源，开发时 Vite proxy 会转发
```

## 注意事项

- 所有 LLM key 只在后端存储，API 返回时脱敏（`mask_key()`）。
- TTS 依赖系统中文语音引擎（Windows 自带 Huihui/Yaoyao，若无在系统「设置-语音」安装）。
- 扫描版 PDF / 图片题不支持（轻量路线，不上 OCR/VLM）。
- SQLite 数据库文件位于 `backend/data/faceace.db`，导入暂存在 `backend/data/ingest/`。

## 开源协议

MIT
