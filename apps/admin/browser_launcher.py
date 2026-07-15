import atexit
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_PORT = 3001
BACKEND_PORT = 58643
FRONTEND_URL = f"http://127.0.0.1:{FRONTEND_PORT}"
BACKEND_STATUS_URL = f"http://127.0.0.1:{BACKEND_PORT}/api/status"

processes: list[subprocess.Popen[bytes]] = []
log_files = []


def port_is_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def url_is_ready(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=1) as response:
            return 200 <= response.status < 500
    except Exception:
        return False


def wait_until_ready(url: str, timeout: int = 60) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if url_is_ready(url):
            return True
        time.sleep(0.5)
    return False


def open_frontend_in_browser() -> None:
    if os.environ.get("XINGHUI_BLOG_NO_BROWSER") != "1":
        webbrowser.open(FRONTEND_URL, new=2)


def write_backend_config() -> None:
    payload = {"api_port": BACKEND_PORT}
    targets = [
        os.path.join(BASE_DIR, "public", "backend_config.json"),
        os.path.join(BASE_DIR, ".next", "standalone", "public", "backend_config.json"),
    ]
    for target in targets:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8") as config_file:
            json.dump(payload, config_file)


def ensure_runtime_assets() -> None:
    source_assets = os.path.join(BASE_DIR, "public", "blog-images")
    runtime_assets = os.path.join(
        BASE_DIR, ".next", "standalone", "public", "blog-images"
    )
    if os.path.exists(runtime_assets):
        return
    if not os.path.isdir(source_assets):
        raise RuntimeError("未找到统一图片库。")

    os.makedirs(os.path.dirname(runtime_assets), exist_ok=True)
    if os.name == "nt":
        subprocess.run(
            ["cmd", "/c", "mklink", "/J", runtime_assets, source_assets],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        os.symlink(source_assets, runtime_assets, target_is_directory=True)


def ensure_runtime_static() -> None:
    source_static = os.path.join(BASE_DIR, ".next", "static")
    runtime_static = os.path.join(
        BASE_DIR, ".next", "standalone", ".next", "static"
    )
    if os.path.exists(runtime_static):
        return
    if not os.path.isdir(source_static):
        raise RuntimeError("未找到 Next.js 静态资源，请先运行 npm run build。")

    os.makedirs(os.path.dirname(runtime_static), exist_ok=True)
    if os.name == "nt":
        subprocess.run(
            ["cmd", "/c", "mklink", "/J", runtime_static, source_static],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        os.symlink(source_static, runtime_static, target_is_directory=True)


def stop_processes() -> None:
    for process in reversed(processes):
        if process.poll() is None:
            process.terminate()
    for process in reversed(processes):
        if process.poll() is None:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
    for log_file in log_files:
        log_file.close()


def main() -> int:
    if url_is_ready(FRONTEND_URL) and url_is_ready(BACKEND_STATUS_URL):
        open_frontend_in_browser()
        return 0

    occupied = [port for port in (FRONTEND_PORT, BACKEND_PORT) if port_is_open(port)]
    if occupied:
        print(f"端口 {', '.join(str(port) for port in occupied)} 已被其他程序占用。")
        return 1

    server_js = os.path.join(BASE_DIR, ".next", "standalone", "server.js")
    if not os.path.exists(server_js):
        print("未找到后台生产文件，请先运行 npm run build。")
        return 1

    write_backend_config()
    ensure_runtime_assets()
    ensure_runtime_static()

    logs_dir = os.path.join(BASE_DIR, "runtime-logs")
    os.makedirs(logs_dir, exist_ok=True)
    frontend_log = open(os.path.join(logs_dir, "frontend.log"), "ab", buffering=0)
    backend_log = open(os.path.join(logs_dir, "backend.log"), "ab", buffering=0)
    log_files.extend([frontend_log, backend_log])

    frontend_env = os.environ.copy()
    frontend_env.update(
        {
            "NODE_ENV": "production",
            "HOSTNAME": "127.0.0.1",
            "PORT": str(FRONTEND_PORT),
            "NEXT_TELEMETRY_DISABLED": "1",
        }
    )

    backend_env = os.environ.copy()
    backend_env.update(
        {
            "PYTHONUTF8": "1",
            "PYTHONIOENCODING": "utf-8",
        }
    )

    frontend = subprocess.Popen(
        ["node", "server.js"],
        cwd=os.path.join(BASE_DIR, ".next", "standalone"),
        env=frontend_env,
        stdout=frontend_log,
        stderr=subprocess.STDOUT,
    )
    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "cms_core.main:app", "--host", "127.0.0.1", "--port", str(BACKEND_PORT)],
        cwd=BASE_DIR,
        env=backend_env,
        stdout=backend_log,
        stderr=subprocess.STDOUT,
    )
    processes.extend([frontend, backend])

    if not wait_until_ready(BACKEND_STATUS_URL) or not wait_until_ready(FRONTEND_URL):
        print("后台启动失败，请检查 runtime-logs 文件夹中的日志。")
        return 1

    open_frontend_in_browser()
    print("Xinghui Blog 管理后台正在运行：http://127.0.0.1:3001")
    print("关闭此窗口即可停止管理后台。")

    while all(process.poll() is None for process in processes):
        time.sleep(1)

    print("管理后台进程已退出，请检查 runtime-logs 文件夹中的日志。")
    return 1


if __name__ == "__main__":
    atexit.register(stop_processes)
    raise SystemExit(main())
