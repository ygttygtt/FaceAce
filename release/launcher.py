"""FaceAce portable Windows launcher.

Starts the API and the built React site on localhost, opens the default browser,
and exposes Open/Exit actions through a system tray icon.
"""
from __future__ import annotations

import ctypes
import logging
import mimetypes
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


APP_NAME = "FaceAce"
API_HOST = "127.0.0.1"
API_PORT = 8000
WEB_HOST = "127.0.0.1"
WEB_PORT = 5173
WEB_URL = f"http://{WEB_HOST}:{WEB_PORT}"
HEALTH_URL = f"http://{API_HOST}:{API_PORT}/api/health"
ERROR_ALREADY_EXISTS = 183


def frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def runtime_root() -> Path:
    return Path(sys.executable).resolve().parent if frozen() else Path(__file__).resolve().parents[1]


def resource_root() -> Path:
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))


def web_root() -> Path:
    return resource_root() / "web" if frozen() else runtime_root() / "frontend" / "dist"


ROOT = runtime_root()
DATA_DIR = ROOT / "data"
LOG_DIR = ROOT / "logs"
LOG_FILE = LOG_DIR / "faceace.log"

if not frozen():
    backend_path = str(ROOT / "backend")
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)


def configure_environment() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    os.environ["FACEACE_DATA_DIR"] = str(DATA_DIR)
    os.environ["FACEACE_LOG_FILE"] = str(LOG_FILE)
    os.environ["CORS_ORIGINS"] = f"{WEB_URL},http://localhost:{WEB_PORT}"


def configure_launcher_logging() -> None:
    logging.basicConfig(
        filename=LOG_FILE,
        encoding="utf-8",
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-7s | %(message)s",
        force=True,
    )


def message_box(message: str, title: str = APP_NAME, error: bool = False) -> None:
    flags = 0x10 if error else 0x40
    ctypes.windll.user32.MessageBoxW(None, message, title, flags)


def acquire_single_instance():
    handle = ctypes.windll.kernel32.CreateMutexW(None, False, "Local\\FaceAcePortableLauncher")
    if ctypes.windll.kernel32.GetLastError() == ERROR_ALREADY_EXISTS:
        webbrowser.open(WEB_URL)
        return None
    return handle


def port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((host, port))
            return True
        except OSError:
            return False


class SPARequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(web_root()), **kwargs)

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        logging.debug("web | " + format, *args)

    def do_GET(self) -> None:  # noqa: N802
        request_path = self.path.split("?", 1)[0].split("#", 1)[0]
        local_path = web_root() / request_path.lstrip("/")
        if request_path != "/" and not local_path.exists() and "." not in Path(request_path).name:
            self.path = "/index.html"
        super().do_GET()


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


class Runtime:
    def __init__(self) -> None:
        self.web_server: ReusableThreadingHTTPServer | None = None
        self.api_server = None
        self.web_thread: threading.Thread | None = None
        self.api_thread: threading.Thread | None = None

    def start(self) -> None:
        if not web_root().joinpath("index.html").exists():
            raise RuntimeError(f"未找到前端资源：{web_root()}")
        if not port_available(API_HOST, API_PORT) or not port_available(WEB_HOST, WEB_PORT):
            raise RuntimeError("端口 8000 或 5173 已被占用，请关闭旧版 FaceAce 或其他占用程序后重试。")

        mimetypes.add_type("application/javascript", ".js")
        mimetypes.add_type("text/css", ".css")

        self.web_server = ReusableThreadingHTTPServer((WEB_HOST, WEB_PORT), SPARequestHandler)
        self.web_thread = threading.Thread(target=self.web_server.serve_forever, name="faceace-web", daemon=True)
        self.web_thread.start()

        import uvicorn

        config = uvicorn.Config(
            "app.main:app",
            host=API_HOST,
            port=API_PORT,
            log_config=None,
            access_log=False,
        )
        self.api_server = uvicorn.Server(config)
        self.api_thread = threading.Thread(target=self.api_server.run, name="faceace-api", daemon=True)
        self.api_thread.start()
        self.wait_until_ready()

    def wait_until_ready(self, timeout: float = 30.0) -> None:
        deadline = time.monotonic() + timeout
        last_error: Exception | None = None
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(HEALTH_URL, timeout=1.0) as response:
                    if response.status == 200:
                        with urllib.request.urlopen(WEB_URL, timeout=1.0) as page:
                            if page.status == 200:
                                return
            except Exception as exc:  # noqa: BLE001
                last_error = exc
            time.sleep(0.25)
        raise RuntimeError(f"FaceAce 启动超时：{last_error or '服务未就绪'}")

    def stop(self) -> None:
        if self.api_server is not None:
            self.api_server.should_exit = True
        if self.web_server is not None:
            self.web_server.shutdown()
            self.web_server.server_close()
        if self.api_thread and self.api_thread.is_alive():
            self.api_thread.join(timeout=5)
        if self.web_thread and self.web_thread.is_alive():
            self.web_thread.join(timeout=5)


def tray_image():
    from PIL import Image

    logo = (
        resource_root() / "brand" / "faceace-logo.png"
        if frozen()
        else runtime_root() / "release" / "assets" / "faceace-logo.png"
    )
    return Image.open(logo).convert("RGBA").resize((64, 64), Image.Resampling.LANCZOS)


def run_tray(runtime: Runtime) -> None:
    import pystray

    def open_app(_icon=None, _item=None):
        webbrowser.open(WEB_URL)

    def exit_app(icon, _item=None):
        logging.info("Exiting FaceAce")
        runtime.stop()
        icon.stop()

    menu = pystray.Menu(
        pystray.MenuItem("打开 FaceAce", open_app, default=True),
        pystray.MenuItem("退出 FaceAce", exit_app),
    )
    icon = pystray.Icon(APP_NAME, tray_image(), "FaceAce 面试助手", menu)
    webbrowser.open(WEB_URL)
    icon.run()


def smoke_test(runtime: Runtime) -> int:
    try:
        import pystray  # noqa: F401 - verify the packaged tray backend imports

        tray_ok = tray_image().size == (64, 64)
        runtime.start()
        with urllib.request.urlopen(HEALTH_URL, timeout=3) as response:
            health_ok = response.status == 200
        with urllib.request.urlopen(WEB_URL, timeout=3) as response:
            web_ok = response.status == 200 and b"root" in response.read()
        with urllib.request.urlopen(f"{WEB_URL}/settings", timeout=3) as response:
            spa_ok = response.status == 200 and b"root" in response.read()
        result = f"health={health_ok}, web={web_ok}, spa={spa_ok}, tray={tray_ok}\n"
        (LOG_DIR / "smoke-test.log").write_text(result, encoding="utf-8")
        return 0 if health_ok and web_ok and spa_ok and tray_ok else 1
    except Exception as exc:  # noqa: BLE001
        (LOG_DIR / "smoke-test.log").write_text(f"error={exc}\n", encoding="utf-8")
        return 1
    finally:
        runtime.stop()


def main() -> int:
    configure_environment()
    configure_launcher_logging()
    mutex = acquire_single_instance()
    if mutex is None:
        return 0

    runtime = Runtime()
    if "--smoke-test" in sys.argv:
        return smoke_test(runtime)

    try:
        runtime.start()
        logging.info("FaceAce ready at %s", WEB_URL)
        run_tray(runtime)
        return 0
    except Exception as exc:  # noqa: BLE001
        logging.exception("FaceAce failed to start")
        runtime.stop()
        message_box(f"FaceAce 启动失败：\n\n{exc}\n\n日志：{LOG_FILE}", error=True)
        return 1
    finally:
        if mutex:
            ctypes.windll.kernel32.CloseHandle(mutex)


if __name__ == "__main__":
    raise SystemExit(main())
