# FaceAce

<div align="center">

**Local AI-Powered Interview Preparation Assistant**

[![Python](https://img.shields.io/badge/Python-3.13-blue?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-blue?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

[English](README.md) | [中文](README_CN.md)

</div>

---

## What is FaceAce?

FaceAce is a **local web application** that transforms messy interview question documents into a **structured question bank**, then helps you prepare through two powerful modes:

```
+------------------+     +------------------+     +------------------+
|   Your Documents | --> |   AI Processing  | --> |  Question Bank   |
|  (.md/.txt/.pdf) |     |  (Extract + LLM) |     | (Structured Q&A) |
+------------------+     +------------------+     +------------------+
                                                            |
                              +-----------------------------+
                              |
                  +-----------+-----------+
                  |                       |
          +-------v-------+      +-------v-------+
          | Practice Mode |      | Simulation    |
          | (Flashcards + |      | Mode          |
          |  AI Grading)  |      | (Live Chat +  |
          |               |      |  TTS + Report)|
          +---------------+      +---------------+
```

---

## Key Features

### Document Intelligence

| Feature | Description |
|---------|-------------|
| **Multi-format Support** | Import `.md`, `.txt`, `.docx`, `.pdf` files |
| **Smart Extraction** | Automatic question detection and splitting |
| **AI Normalization** | LLM converts raw text to structured Q&A format |
| **Human Review** | Edit and approve before adding to bank |

### Practice Mode

```
+--------------------------------------------------+
|  Question: What is a closure in JavaScript?       |
+--------------------------------------------------+
|                                                  |
|  [Your thinking area...]                         |
|                                                  |
+--------------------------------------------------+
|  [Reveal Answer]  [Submit for AI Grading]        |
+--------------------------------------------------+
         |
         v
+--------------------------------------------------+
|  AI Grading Result                               |
|  Score: 85/100                                   |
|  Strengths: Good understanding of scope chain    |
|  Weaknesses: Missing practical examples          |
|  Improved Answer: [Detailed explanation...]      |
+--------------------------------------------------+
```

**Drawing Strategies:**
- Random selection
- By tags / difficulty
- Wrong questions review
- Custom deck filtering

### Simulation Mode

```
+--------------------------------------------------+
|  Interview Session: Frontend Developer            |
+--------------------------------------------------+
|                                                  |
|  Interviewer: Tell me about yourself and your    |
|               experience with React.             |
|                                                  |
|  Candidate: I have 3 years of experience...      |
|                                                  |
|  Interviewer: That's interesting. Can you        |
|               explain how React's virtual DOM    |
|               works and why it's beneficial?     |
|                                                  |
|  [Type your answer...]                           |
+--------------------------------------------------+
|  [Send]  [TTS]  [End Interview]                  |
+--------------------------------------------------+
         |
         v
+--------------------------------------------------+
|  Interview Report                                |
|  Overall Score: 78/100                           |
|  Strengths: Clear communication, good basics     |
|  Weaknesses: Need deeper system design knowledge |
|  Suggestions: Study distributed systems...       |
+--------------------------------------------------+
```

**Features:**
- Multi-turn streaming conversation (SSE)
- Follow-up questions based on your answers
- TTS playback of interviewer messages
- Structured report with per-question feedback

---

## Tech Stack

<div align="center">

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Backend** | Python 3.13 + FastAPI | High-performance async API |
| **Database** | SQLAlchemy 2.0 + SQLite | Zero-config local storage |
| **LLM** | httpx + OpenAI-compatible API | Vendor-agnostic AI integration |
| **Frontend** | React 18 + TypeScript + Vite | Modern SPA with HMR |
| **Styling** | Tailwind CSS | Utility-first CSS framework |
| **State** | Zustand + TanStack Query | Lightweight state + data fetching |
| **TTS** | Web Speech API | Free browser-based text-to-speech |

</div>

---

## Quick Start

### Prerequisites

- Python 3.13+ (with pip)
- Node.js 18+ (with npm)
- An OpenAI-compatible API key (DeepSeek, OpenAI, SiliconFlow, etc.)

### Installation

```bash
# Clone the repository
git clone https://github.com/ygttygtt/FaceAce.git
cd FaceAce

# One-click start (Windows)
dev.bat        # Development mode (hot reload)
start.bat      # Production mode (single process)
```

### Manual Setup

**Backend:**
```bash
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
cp .env.example .env   # Edit with your LLM_API_KEY
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev    # Open http://localhost:5173
```

### First Use

1. **Configure LLM**: Settings -> LLM Configuration -> Add profile
2. **Import Documents**: Upload your interview questions file
3. **Review & Approve**: Check normalized questions, edit if needed
4. **Start Practicing**: Choose Practice or Simulation mode

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ Practice │  │Simulation│  │  Bank   │  │ Settings│       │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘       │
│       │            │            │            │             │
│       └────────────┼────────────┼────────────┘             │
│                    │            │                           │
│              ┌─────v────────────v─────┐                    │
│              │     API Client         │                    │
│              │  (REST + SSE + TTS)    │                    │
│              └───────────┬────────────┘                    │
└──────────────────────────┼──────────────────────────────────┘
                           │
                           │ HTTP
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                    Backend (FastAPI)                         │
│              ┌───────────v────────────┐                    │
│              │      API Routes        │                    │
│              │  /questions /practice   │                    │
│              │  /simulation /ingest    │                    │
│              └───────────┬────────────┘                    │
│                          │                                 │
│       ┌──────────────────┼──────────────────┐              │
│       │                  │                  │              │
│  ┌────v────┐      ┌─────v─────┐      ┌─────v─────┐        │
│  │ LLM     │      │ Ingest    │      │ Services  │        │
│  │ Adapter │      │ Pipeline  │      │ (Business)│        │
│  └────┬────┘      └─────┬─────┘      └─────┬─────┘        │
│       │                 │                  │              │
│       │           ┌─────v─────┐            │              │
│       │           │ Extractor │            │              │
│       │           │ Chunker   │            │              │
│       │           │ Normalizer│            │              │
│       │           └───────────┘            │              │
│       │                                    │              │
│  ┌────v────────────────────────────────────v────┐         │
│  │              SQLAlchemy ORM                  │         │
│  │  Questions | Practice | Simulation | Config  │         │
│  └──────────────────┬──────────────────────────┘         │
│                     │                                    │
│  ┌──────────────────v──────────────────────────┐         │
│  │              SQLite Database                 │         │
│  │           (backend/data/faceace.db)          │         │
│  └─────────────────────────────────────────────┘         │
└────────────────────────────────────────────────────────────┘
                           │
                           │ OpenAI-compatible API
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                    External LLM Services                    │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      │
│  │ DeepSeek│  │ OpenAI  │  │ Silicon │  │  Ollama │      │
│  │         │  │         │  │  Flow   │  │ (local) │      │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘      │
└────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
FaceAce/
├── backend/                      FastAPI backend
│   ├── app/
│   │   ├── main.py               Application entry point
│   │   ├── core/                 Config, logging, ID generation
│   │   ├── db/                   Database session, migrations
│   │   ├── models/               SQLAlchemy ORM models
│   │   ├── schemas/              Pydantic schemas
│   │   ├── api/routes/           REST API endpoints
│   │   ├── llm/                  LLM adapter (sole external interface)
│   │   ├── ingest/               Document processing pipeline
│   │   └── services/             Business logic
│   └── requirements.txt
├── frontend/                     React frontend
│   └── src/
│       ├── lib/                  API client, SSE, TTS
│       ├── components/           Reusable UI components
│       ├── pages/                Page components
│       ├── store/                State management
│       └── types/                TypeScript definitions
├── docs/                         Documentation
├── dev.bat                       Development startup
└── start.bat                     Production startup
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **LLM Adapter Pattern** | Single point of contact with external LLMs. All providers (DeepSeek, OpenAI, Tongyi, Ollama) that speak OpenAI protocol are handled identically. |
| **Three-tier Structured Output** | `json_schema` -> `json_object` -> regex extraction. Each tier validated with Pydantic. Graceful degradation across providers. |
| **Prompt Template System** | Built-in templates in `default_prompts.py`, user-editable in DB, frontend Settings page for modification. Uses `{{var}}` placeholders. |
| **Single-Process Deployment** | When `frontend/dist` exists, FastAPI serves the built SPA directly. No separate web server needed. |
| **UUID4 Hex IDs** | All entity IDs use `uuid.uuid4().hex` (32-char hex). No auto-increment, no collisions. |
| **Auto Migrations** | `db/migrate.py` patches missing columns on startup. No Alembic required for simple schema changes. |

---

## Environment Variables

```bash
# backend/.env
DATABASE_URL=sqlite:///./data/faceace.db
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=your_api_key_here
LLM_MODEL=deepseek-chat
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=2048
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# frontend/.env (optional)
VITE_API_BASE=           # Leave empty for same-origin
```

---

## Important Notes

- **Security**: All LLM API keys stored server-side only, masked in API responses
- **TTS**: Requires system Chinese speech engine (Windows: Huihui/Yaoyao via Settings > Speech)
- **PDF Support**: Text-based PDFs only (no OCR for scanned images)
- **Data Storage**: SQLite at `backend/data/faceace.db`, imports at `backend/data/ingest/`

---

## License

MIT License - see [LICENSE](LICENSE) for details

---

<div align="center">

**Built with FastAPI + React + LLM**

[Report Bug](https://github.com/ygttygtt/FaceAce/issues) · [Request Feature](https://github.com/ygttygtt/FaceAce/issues)

</div>
