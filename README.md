# FaceAce

<div align="center">

**本地 AI 面试准备助手**

[![Python](https://img.shields.io/badge/Python-3.13-blue?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-blue?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

[English](README_EN.md) | [中文](README.md)

</div>

---

## FaceAce 是什么？

FaceAce 是一个**本地 Web 应用**，能将杂乱的面试题文档转化为**结构化题库**，并通过两种强大模式帮助你准备面试：

```
+------------------+     +------------------+     +------------------+
|   你的文档       | --> |   AI 处理        | --> |  结构化题库      |
| (.md/.txt/.pdf)  |     (提取 + LLM归一化)     | (问题+答案+解析) |
+------------------+     +------------------+     +------------------+
                                                            |
                              +-----------------------------+
                              |
                  +-----------+-----------+
                  |                       |
          +-------v-------+      +-------v-------+
          |   刷题模式    |      |   仿真模式    |
          | (盖答案 +     |      | (实时对话 +   |
          |  AI 批改)     |      |  TTS + 报告)  |
          +---------------+      +---------------+
```

---

## 核心功能

### 文档智能处理

| 功能 | 说明 |
|------|------|
| **多格式支持** | 导入 `.md`、`.txt`、`.docx`、`.pdf` 文件 |
| **智能提取** | 自动检测题目边界并切分 |
| **AI 归一化** | LLM 将原始文本转换为结构化 Q&A 格式 |
| **人工审核** | 入库前可编辑和审批 |

### 刷题模式

```
+--------------------------------------------------+
|  题目：什么是 JavaScript 中的闭包？               |
+--------------------------------------------------+
|                                                  |
|  [你的思考区域...]                                |
|                                                  |
+--------------------------------------------------+
|  [揭晓答案]  [提交 AI 批改]                       |
+--------------------------------------------------+
         |
         v
+--------------------------------------------------+
|  AI 批改结果                                     |
|  评分：85/100                                    |
|  优点：对作用域链理解正确                         |
|  不足：缺少实际应用示例                           |
|  改进答案：[详细解释...]                          |
+--------------------------------------------------+
```

**抽题策略：**
- 随机抽题
- 按标签 / 难度筛选
- 错题重练
- 自定义题组过滤

### 仿真模式

```
+--------------------------------------------------+
|  面试会话：前端开发工程师                         |
+--------------------------------------------------+
|                                                  |
|  面试官：请介绍一下你自己和你的 React 经验。      |
|                                                  |
|  候选人：我有3年经验...                           |
|                                                  |
|  面试官：很有意思。你能解释一下 React 的虚拟     |
|          DOM 是如何工作的吗？为什么它很有用？     |
|                                                  |
|  [输入你的回答...]                                |
+--------------------------------------------------+
|  [发送]  [语音朗读]  [结束面试]                   |
+--------------------------------------------------+
         |
         v
+--------------------------------------------------+
|  面试报告                                        |
|  综合评分：78/100                                |
|  优点：表达清晰，基础扎实                         |
|  不足：需要更深入的系统设计知识                   |
|  建议：学习分布式系统...                          |
+--------------------------------------------------+
```

**特性：**
- 多轮流式对话（SSE）
- 基于回答的追问
- 面试官消息 TTS 朗读
- 结构化报告（逐题反馈）

### 使用体验

- DeepSeek、美团龙猫、商汤日日新预设，默认使用 DeepSeek V4 Flash
- 自动检测 API Key / Base URL，并获取可用模型供下拉选择
- 界面自动跟随系统浅色或深色模式
- Windows 便携发行版，解压后双击 `FaceAce.exe` 即可启动

---

## 技术栈

<div align="center">

| 层级 | 技术 | 用途 |
|------|------|------|
| **后端** | Python 3.13 + FastAPI | 高性能异步 API |
| **数据库** | SQLAlchemy 2.0 + SQLite | 零配置本地存储 |
| **LLM** | httpx + OpenAI 兼容 API | 供应商无关的 AI 集成 |
| **前端** | React 18 + TypeScript + Vite | 现代 SPA + HMR |
| **样式** | Tailwind CSS | 工具优先的 CSS 框架 |
| **状态管理** | Zustand + TanStack Query | 轻量级状态 + 数据获取 |
| **TTS** | Web Speech API | 免费浏览器端语音合成 |

</div>

---

## 快速开始

### 环境要求

- Python 3.13+（带 pip）
- Node.js 18+（带 npm）
- OpenAI 兼容的 API key（DeepSeek、OpenAI、SiliconFlow 等）

### 安装

**Windows 便携版（推荐）：**

从 Releases 下载 `FaceAce-v*-win64.zip`，完整解压后双击 `FaceAce.exe`。无需安装 Python 或 Node.js，数据保存在程序目录的 `data/` 文件夹。

**源码开发：**

```bash
# 克隆仓库
git clone https://github.com/ygttygtt/FaceAce.git
cd FaceAce

# Windows 一键启动开发环境
dev.bat
```

### 手动安装

**后端：**
```bash
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
cp .env.example .env   # 编辑填入 LLM_API_KEY
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

**前端：**
```bash
cd frontend
npm install
npm run dev    # 打开 http://localhost:5173
```

### 首次使用

1. **配置 LLM**：设置 -> LLM 配置 -> 添加 profile
2. **导入文档**：上传面试题文档
3. **审核入库**：检查归一化后的题目，按需编辑
4. **开始练习**：选择刷题或仿真模式

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      前端 (React)                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ 刷题    │  │ 仿真    │  │ 题库    │  │ 设置    │       │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘       │
│       │            │            │            │             │
│       └────────────┼────────────┼────────────┘             │
│                    │            │                           │
│              ┌─────v────────────v─────┐                    │
│              │      API 客户端        │                    │
│              │  (REST + SSE + TTS)    │                    │
│              └───────────┬────────────┘                    │
└──────────────────────────┼──────────────────────────────────┘
                           │
                           │ HTTP
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                    后端 (FastAPI)                            │
│              ┌───────────v────────────┐                    │
│              │      API 路由          │                    │
│              │  /questions /practice   │                    │
│              │  /simulation /ingest    │                    │
│              └───────────┬────────────┘                    │
│                          │                                 │
│       ┌──────────────────┼──────────────────┐              │
│       │                  │                  │              │
│  ┌────v────┐      ┌─────v─────┐      ┌─────v─────┐        │
│  │ LLM     │      │ 导入      │      │ 服务层    │        │
│  │ 适配器  │      │ 流水线    │      │ (业务)    │        │
│  └────┬────┘      └─────┬─────┘      └─────┬─────┘        │
│       │                 │                  │              │
│       │           ┌─────v─────┐            │              │
│       │           │ 提取器    │            │              │
│       │           │ 切分器    │            │              │
│       │           │ 归一化器  │            │              │
│       │           └───────────┘            │              │
│       │                                    │              │
│  ┌────v────────────────────────────────────v────┐         │
│  │              SQLAlchemy ORM                  │         │
│  │  Questions | Practice | Simulation | Config  │         │
│  └──────────────────┬──────────────────────────┘         │
│                     │                                    │
│  ┌──────────────────v──────────────────────────┐         │
│  │              SQLite 数据库                   │         │
│  │           (backend/data/faceace.db)          │         │
│  └─────────────────────────────────────────────┘         │
└────────────────────────────────────────────────────────────┘
                           │
                           │ OpenAI 兼容 API
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                    外部 LLM 服务                            │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      │
│  │ DeepSeek│  │ OpenAI  │  │ Silicon │  │  Ollama │      │
│  │         │  │         │  │  Flow   │  │ (本地)  │      │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘      │
└────────────────────────────────────────────────────────────┘
```

---

## 项目结构

```
FaceAce/
├── backend/                      FastAPI 后端
│   ├── app/
│   │   ├── main.py               应用入口
│   │   ├── core/                 配置、日志、ID 生成
│   │   ├── db/                   数据库会话、迁移
│   │   ├── models/               SQLAlchemy ORM 模型
│   │   ├── schemas/              Pydantic 模式
│   │   ├── api/routes/           REST API 端点
│   │   ├── llm/                  LLM 适配器（唯一外部接口）
│   │   ├── ingest/               文档处理流水线
│   │   └── services/             业务逻辑
│   └── requirements.txt
├── frontend/                     React 前端
│   └── src/
│       ├── lib/                  API 客户端、SSE、TTS
│       ├── components/           可复用 UI 组件
│       ├── pages/                页面组件
│       ├── store/                状态管理
│       └── types/                TypeScript 类型定义
├── docs/                         文档
├── dev.bat                       开发启动脚本
└── start.bat                     生产启动脚本
```

---

## 关键设计决策

| 决策 | 理由 |
|------|------|
| **LLM 适配器模式** | 与外部 LLM 的唯一接触点。所有支持 OpenAI 协议的供应商（DeepSeek、OpenAI、通义、Ollama）统一处理。 |
| **三级结构化输出** | `json_schema` -> `json_object` -> 正则提取。每级用 Pydantic 验证。跨供应商优雅降级。 |
| **Prompt 模板系统** | 内置模板在 `default_prompts.py`，用户可在 DB 中编辑，前端设置页修改。使用 `{{var}}` 占位符。 |
| **前后端严格分离** | 开发时使用 Vite，发行版由独立启动器运行静态前端服务和纯 API 后端。 |
| **UUID4 Hex ID** | 所有实体 ID 使用 `uuid.uuid4().hex`（32 位 hex）。无自增，无冲突。 |
| **自动迁移** | `db/migrate.py` 在启动时补丁缺失列。简单模式变更无需 Alembic。 |

---

## 环境变量

```bash
# backend/.env
DATABASE_URL=sqlite:///./data/faceace.db
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=your_api_key_here
LLM_MODEL=deepseek-v4-flash
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=2048
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# frontend/.env（可选）
VITE_API_BASE=           # 留空表示同源
```

---

## 注意事项

- **安全**：所有 LLM API key 仅在服务端存储，API 返回时脱敏
- **TTS**：需要系统中文语音引擎（Windows：设置 > 语音 安装 Huihui/Yaoyao）
- **PDF 支持**：仅支持文字 PDF（不支持扫描件 OCR）
- **数据存储**：SQLite 位于 `backend/data/faceace.db`，导入暂存于 `backend/data/ingest/`
- **发行版数据**：便携版的数据位于解压目录的 `data/`，复制该目录即可备份

### 构建 Windows 便携版

```powershell
powershell -ExecutionPolicy Bypass -File release/build_release.ps1
```

产物位于 `release/dist/`，包含可直接运行的目录和 ZIP 压缩包。

---

## 开源协议

MIT License - 详见 [LICENSE](LICENSE)

---

<div align="center">

**使用 FastAPI + React + LLM 构建**

[报告问题](https://github.com/ygttygtt/FaceAce/issues) · [功能建议](https://github.com/ygttygtt/FaceAce/issues)

</div>
