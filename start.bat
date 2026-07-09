@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo   FaceAce 面试助手  -  一键启动
echo ============================================

REM ---- 1) Python 环境 ----
if not exist "backend\.venv\Scripts\python.exe" (
  echo [初始化] 创建 Python 虚拟环境...
  where py >nul 2>&1 && ( py -3.13 -m venv "backend\.venv" ) || ( python -m venv "backend\.venv" )
  "backend\.venv\Scripts\python.exe" -m pip install -r "backend\requirements.txt"
)

REM ---- 2) 前端构建（仅首次或 dist 缺失时）----
if not exist "frontend\dist\index.html" (
  echo [初始化] 构建前端...
  pushd "frontend"
  if not exist node_modules ( call npm install )
  call npm run build
  popd
)

REM ---- 3) 端口 8000 占用则尝试释放 ----
netstat -ano | findstr ":8000" | findstr LISTENING >nul
if not errorlevel 1 (
  echo [提示] 端口 8000 被占用，尝试释放...
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
  )
  timeout /t 1 >nul
)

REM ---- 4) 启动（单进程：后端托管前端）----
echo.
echo 启动中... 浏览器将自动打开 http://localhost:8000
echo 关闭本窗口即停止服务。
echo.
start "" cmd /c "timeout /t 3 >nul & start "" http://localhost:8000"
cd "backend"
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
