@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo   FaceAce Dev Mode - Hot Reload
echo ============================================

REM ---- 1) Python environment ----
if not exist "backend\.venv\Scripts\python.exe" (
  echo [INIT] Creating Python virtual environment...
  where py >nul 2>&1 && ( py -3.13 -m venv "backend\.venv" ) || ( python -m venv "backend\.venv" )
  "backend\.venv\Scripts\python.exe" -m pip install -r "backend\requirements.txt"
)
if not exist "frontend\node_modules" (
  echo [INIT] Installing frontend dependencies...
  pushd "frontend" & call npm install & popd
)

start "FaceAce API" cmd /k "cd /d %~dp0\backend & .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
start "FaceAce Web"  cmd /k "cd /d %~dp0\frontend & npm run dev"

timeout /t 4 >nul
start "" http://localhost:5173
echo Started: Backend :8000  Frontend :5173 (close both windows to stop)
