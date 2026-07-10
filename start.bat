@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo   FaceAce Production - One-Click Start
echo ============================================

REM ---- 1) Python environment ----
if not exist "backend\.venv\Scripts\python.exe" (
  echo [INIT] Creating Python virtual environment...
  where py >nul 2>&1 && ( py -3.13 -m venv "backend\.venv" ) || ( python -m venv "backend\.venv" )
  "backend\.venv\Scripts\python.exe" -m pip install -r "backend\requirements.txt"
)

REM ---- 2) Build frontend (only if dist missing) ----
if not exist "frontend\dist\index.html" (
  echo [INIT] Building frontend...
  pushd "frontend"
  if not exist node_modules ( call npm install )
  call npm run build
  popd
)

REM ---- 3) Free port 8000 if occupied ----
netstat -ano | findstr ":8000" | findstr LISTENING >nul
if not errorlevel 1 (
  echo [INFO] Port 8000 occupied, attempting to free...
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
  )
  timeout /t 1 >nul
)

REM ---- 4) Start (single process: backend serves frontend) ----
echo.
echo Starting... Browser will open http://localhost:8000
echo Press Ctrl+C or close this window to stop.
echo.
start "" cmd /c "timeout /t 3 >nul & start "" http://localhost:8000"
cd "backend"
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
