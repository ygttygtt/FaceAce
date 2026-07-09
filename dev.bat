@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo   FaceAce 开发模式（双进程热重载）
echo ============================================

REM ---- 1) Python 环境 ----
if not exist "backend\.venv\Scripts\python.exe" (
  echo [初始化] 创建 Python 虚拟环境...
  where py >nul 2>&1 && ( py -3.13 -m venv "backend\.venv" ) || ( python -m venv "backend\.venv" )
  "backend\.venv\Scripts\python.exe" -m pip install -r "backend\requirements.txt"
)
if not exist "frontend\node_modules" (
  echo [初始化] 安装前端依赖...
  pushd "frontend" & call npm install & popd
)

start "FaceAce API" cmd /k "cd /d %~dp0\backend & .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
start "FaceAce Web"  cmd /k "cd /d %~dp0\frontend & npm run dev"

timeout /t 4 >nul
start "" http://localhost:5173
echo 已启动：后端 :8000  前端 :5173（关闭两个子窗口即停止）
