# FaceAce

[中文版](README_CN.md)

A local web-based interview preparation assistant that transforms messy interview question documents into a structured question bank, supporting both flashcard-style practice with AI grading and full simulation interviews with SSE streaming and TTS.

## Features

**Document Processing**
- Supports `.md`, `.txt`, `.docx`, `.pdf` (text-based, no OCR for scanned images)
- Text extraction, heuristic question splitting, LLM normalization into structured format (`question + answer + explanation + grading points`)
- CLI and web upload interfaces

**Practice Mode**
- Flashcard-style: hide answer first, think, then reveal
- Submit your answer for AI grading (score, strengths, weaknesses, improved answer)
- Question drawing strategies: random, by tag, by difficulty, wrong question review

**Simulation Mode**
- Multi-turn streaming conversation with LLM interviewer
- Follow-up questions based on your answers
- TTS playback of interviewer messages
- Structured report generation after interview (overall score, per-question feedback, improvement suggestions)

**Configuration System**
- Multiple LLM profiles (OpenAI-compatible: DeepSeek, SiliconFlow, OpenAI, Tongyi, local Ollama, etc.)
- Editable prompt templates from frontend Settings page
- TTS preferences (browser Web Speech API)

## Tech Stack

- **Backend**: Python 3.13 + FastAPI + SQLAlchemy 2.0 + SQLite + httpx + python-docx + pdfplumber
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + zustand + TanStack Query + react-markdown
- **LLM**: Self-contained OpenAI-compatible adapter (httpx direct, no vendor SDK coupling), supports chat / streaming / structured output (three-tier fallback: `json_schema` -> `json_object` -> text extraction)
- **TTS**: Browser Web Speech API (free, cloud TTS interface reserved)

## Quick Start

### Prerequisites

- Python 3.13+
- Node.js 18+
- An OpenAI-compatible LLM API key (DeepSeek, OpenAI, etc.)

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows
# Configure default LLM (optional, can also configure in Settings page after startup)
cp .env.example .env   # Fill in LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev    # Open http://localhost:5173
```

### 3. First Use

1. Open `http://localhost:5173` -> Settings -> LLM Configuration: Add a profile (fill in base_url / api_key / model, e.g., DeepSeek `https://api.deepseek.com/v1` + `deepseek-chat`), set as default, click "Test Connection". If unsure about json_schema support, keep it disabled (auto-fallback will handle it).
2. (Optional) TTS & Preferences: Enable TTS and select Chinese voice.
3. Import Documents: Upload interview question document -> Wait for AI normalization (status changes to "Pending Review") -> Review questions -> Add to bank.
4. Practice: Select drawing mode to start; Simulation: Create new session for multi-turn conversation.

### CLI Import (Optional)

```bash
cd backend
.venv/Scripts/python.exe -m app.ingest path/to/file.docx                 # Import then review in Web
.venv/Scripts/python.exe -m app.ingest path/to/file.docx --auto-approve  # Skip review, add directly
```

### One-Click Scripts

- **Development mode** (dual-process with hot reload): Double-click `dev.bat`
- **Production mode** (single-process, backend serves frontend): Double-click `start.bat`

## Question Bank Standard Format

```jsonc
{
  "question_text": "What is a closure?",
  "question_type": "short_answer",      // single_choice|multiple_choice|short_answer|essay|coding|behavioral|case|concept
  "difficulty": "medium",               // easy|medium|hard
  "tags": ["JavaScript", "Closure"],
  "options": null,                      // For choice questions: string[]
  "standard_answer": "...",
  "answer_points": ["Point 1", "Point 2"],   // For AI grading
  "explanation": "...",
  "source": { "file": "x.docx", "page": 12, "raw_index": 3 }
}
```

The Question Bank page supports one-click JSON export of all questions.

## Project Structure

```
FaceAce/
├── backend/                 FastAPI backend
│   ├── app/
│   │   ├── main.py          Application entry point
│   │   ├── core/            Config, logging, ID generation
│   │   ├── db/              Database session, base, migrations
│   │   ├── models/          SQLAlchemy ORM models
│   │   ├── schemas/         Pydantic schemas (request/response + LLM structured output)
│   │   ├── api/routes/      REST API endpoints
│   │   ├── llm/             LLM adapter (sole external interface), service, prompts
│   │   ├── ingest/          Document processing pipeline (extract -> chunk -> normalize -> store)
│   │   └── services/        Business logic orchestration
│   └── requirements.txt
├── frontend/                React frontend
│   └── src/
│       ├── lib/             API client, SSE handler, TTS wrapper
│       ├── components/      Reusable UI components
│       ├── pages/           Page components
│       ├── store/           Zustand state management
│       └── types/           TypeScript type definitions
├── docs/                    Documentation
└── dev.bat / start.bat      One-click startup scripts
```

## Architecture Notes

- **LLM Decoupling**: `app/llm/adapter.py` is the only place that communicates with external LLM services. All providers (DeepSeek, OpenAI, Tongyi, Ollama, etc.) that speak the OpenAI `/chat/completions` protocol are handled identically.
- **Structured Output Fallback**: `LLMService.structured()` attempts `json_schema` -> `json_object` -> plain text with regex extraction, validated by Pydantic at each tier.
- **Prompt Template System**: `default_prompts.py` defines built-in templates; DB `prompt_templates` table stores user-edited versions; frontend Settings page allows editing. Templates use `{{var}}` placeholders.
- **Single-Process Deployment**: When `frontend/dist` exists, FastAPI serves the built SPA directly (SPA fallback in `main.py`).
- **ID Generation**: All entity IDs use `uuid.uuid4().hex` (32-char hex string), see `app/core/ids.py`.
- **Database Migrations**: `db/migrate.py` patches missing columns via `run_migrations(engine)` during `init_db()`, no Alembic required.

## Environment Variables

```bash
# backend/.env (copy from .env.example)
DATABASE_URL=sqlite:///./data/faceace.db
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=your_key_here
LLM_MODEL=deepseek-chat
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=2048
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# frontend/.env (optional)
VITE_API_BASE=           # Leave empty for same-origin; Vite proxy handles dev
```

## Important Notes

- All LLM API keys are stored server-side only, masked in API responses (`mask_key()`).
- TTS depends on system Chinese speech engine (Windows ships with Huihui/Yaoyao; install via System Settings > Speech if missing).
- Scanned PDFs and image-based questions are not supported (lightweight approach, no OCR/VLM).
- SQLite database is stored at `backend/data/faceace.db`, import staging at `backend/data/ingest/`.

## License

MIT
