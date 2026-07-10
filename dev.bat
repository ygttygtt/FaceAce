@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo   FaceAce - Dev Mode (Hot Reload)
echo ============================================

REM ---- 0) Kill stale processes on dev ports ----
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr LISTENING 2^>nul') do (
  echo [CLEAN] Killing PID %%a on port 8000...
  taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr LISTENING 2^>nul') do (
  echo [CLEAN] Killing PID %%a on port 5173...
  taskkill /F /PID %%a >nul 2>&1
)

REM ---- 1) Python venv ----
if not exist "backend\.venv\Scripts\python.exe" (
  echo [INIT] Creating Python virtual environment...
  where py >nul 2>&1 && ( py -3.13 -m venv "backend\.venv" ) || ( python -m venv "backend\.venv" )
  "backend\.venv\Scripts\python.exe" -m pip install -r "backend\requirements.txt"
)
if not exist "frontend\node_modules" (
  echo [INIT] Installing frontend dependencies...
  pushd "frontend" & call npm install & popd
)

REM ---- 2) Start backend (API only, port 8000) ----
start "FaceAce API" cmd /k "cd /d %~dp0\backend & title FaceAce API :8000 & .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"

REM ---- 3) Start frontend (Vite dev, port 5173) ----
start "FaceAce Web" cmd /k "cd /d %~dp0\frontend & title FaceAce Web :5173 & npm run dev"

REM ---- 4) Open browser ----
timeout /t 4 >nul
start "" http://localhost:5173

echo.
echo Backend  API    http://localhost:8000/docs
echo Frontend App    http://localhost:5173
echo Close both windows to stop.
echo ============================================
