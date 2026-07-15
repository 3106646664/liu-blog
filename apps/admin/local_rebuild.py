"""Rebuild and restart the local production preview after a CMS push."""

import os
import subprocess
import sys
import time
from datetime import datetime


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(BASE_DIR, "runtime-logs")
LOG_FILE = os.path.join(LOG_DIR, "local-rebuild.log")
LOCK_FILE = os.path.join(LOG_DIR, "local-rebuild.lock")


def stop_local_services(log_file) -> None:
    command = """
$pids = @(foreach ($port in 3001,58643) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess
}) | Select-Object -Unique
foreach ($processId in $pids) {
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}
"""
    subprocess.run(
        ["powershell.exe", "-NoProfile", "-Command", command],
        cwd=BASE_DIR,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        check=True,
        timeout=30,
    )


def wait_for_ports_to_close(timeout: int = 20) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        result = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-Command",
                "[bool](Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | "
                "Where-Object LocalPort -in 3001,58643)",
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.stdout.strip().lower() == "false":
            return
        time.sleep(0.5)
    raise TimeoutError("Local preview ports did not close in time.")


def start_local_services(log_file) -> None:
    environment = os.environ.copy()
    environment["XINGHUI_BLOG_NO_BROWSER"] = "1"
    environment["PYTHONUTF8"] = "1"
    environment["PYTHONIOENCODING"] = "utf-8"
    creation_flags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
    subprocess.Popen(
        [sys.executable, os.path.join(BASE_DIR, "browser_launcher.py")],
        cwd=BASE_DIR,
        env=environment,
        creationflags=creation_flags,
        close_fds=True,
    )


def main() -> int:
    os.makedirs(LOG_DIR, exist_ok=True)
    with open(LOG_FILE, "a", encoding="utf-8", buffering=1) as log_file:
        print(f"\n[{datetime.now().isoformat(timespec='seconds')}] Local rebuild started.", file=log_file)
        try:
            # Give the API response time to reach the browser before stopping it.
            time.sleep(2)
            stop_local_services(log_file)
            wait_for_ports_to_close()

            result = subprocess.run(
                ["npm.cmd", "run", "build"],
                cwd=BASE_DIR,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                timeout=300,
            )
            if result.returncode != 0:
                raise RuntimeError(f"npm run build exited with {result.returncode}")

            print("Local rebuild completed; restarting production services.", file=log_file)
            start_local_services(log_file)
            return 0
        except Exception as error:
            print(f"Local rebuild failed: {error}", file=log_file)
            return 1
        finally:
            try:
                os.remove(LOCK_FILE)
            except FileNotFoundError:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
