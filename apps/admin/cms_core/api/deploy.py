import asyncio
import getpass
import json
import os
import platform
import re
import subprocess
import sys
import time

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse


router = APIRouter()

CURRENT_API_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_API_DIR, "..", ".."))
CONFIG_FILE = os.path.join(PROJECT_ROOT, "data", "deploy_config.json")
LOCAL_REBUILD_SCRIPT = os.path.join(PROJECT_ROOT, "local_rebuild.py")
LOCAL_REBUILD_LOCK = os.path.join(PROJECT_ROOT, "runtime-logs", "local-rebuild.lock")
DEPLOY_STATE_FILE = os.environ.get(
    "XINGHUI_BLOG_DEPLOY_STATE",
    os.path.join(PROJECT_ROOT, "runtime-logs", "deploy-state.json"),
)
SERVER_PUBLISH_SERVICE = os.environ.get(
    "XINGHUI_BLOG_PUBLISH_SERVICE", "xinghui-blog-publish.service"
)
BUSY_DEPLOY_STATES = {
    "queued",
    "preparing",
    "snapshotting",
    "installing",
    "building",
    "checking",
    "switching",
}

DEFAULT_CONFIG = {
    "blogPath": "",
    "sourceRepoUrl": "",
    "sourceBranch": "main",
    "serverHost": "",
    "serverUser": "root",
    "serverKeyPath": "",
    "serverUpdateService": "xinghui-blog-update.service",
}


def load_deploy_config():
    config = DEFAULT_CONFIG.copy()
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r", encoding="utf-8") as config_file:
            saved = json.load(config_file)
        config.update(saved)
    return config


def load_deploy_state():
    default_state = {
        "state": "idle",
        "message": "主站当前可以发布",
        "progress": 0,
        "busy": False,
    }
    try:
        with open(DEPLOY_STATE_FILE, "r", encoding="utf-8") as state_file:
            state = json.load(state_file)
        state["busy"] = state.get("state") in BUSY_DEPLOY_STATES
        if (
            state["busy"]
            and os.name != "nt"
            and time.time() - os.path.getmtime(DEPLOY_STATE_FILE) > 30
        ):
            service_state = "unknown"
            try:
                service = subprocess.run(
                    [
                        "/usr/bin/systemctl",
                        "show",
                        SERVER_PUBLISH_SERVICE,
                        "--property=ActiveState",
                        "--value",
                    ],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    timeout=3,
                )
                if service.returncode == 0:
                    service_state = service.stdout.strip()
            except (subprocess.TimeoutExpired, OSError):
                pass

            # A Type=oneshot build remains "activating" for the entire build.
            # Only terminal systemd states prove that a stale busy lock is orphaned.
            if service_state in {"inactive", "failed"}:
                return save_deploy_state(
                    "failed",
                    "上一次构建已意外中断，工作区锁已自动解除。",
                    0,
                    startedAt=state.get("startedAt"),
                    finishedAt=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                )
        return {**default_state, **state}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return default_state


def is_deploy_busy():
    return load_deploy_state().get("state") in BUSY_DEPLOY_STATES


def save_deploy_state(state, message, progress=0, **extra):
    os.makedirs(os.path.dirname(DEPLOY_STATE_FILE), exist_ok=True)
    payload = {
        "state": state,
        "message": message,
        "progress": progress,
        "busy": state in BUSY_DEPLOY_STATES,
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        **extra,
    }
    temporary = f"{DEPLOY_STATE_FILE}.tmp"
    with open(temporary, "w", encoding="utf-8") as state_file:
        json.dump(payload, state_file, ensure_ascii=False, indent=2)
    os.replace(temporary, DEPLOY_STATE_FILE)
    return payload


def source_private_key_path():
    return os.path.join(
        os.path.expanduser("~/.ssh"), "id_ed25519_liu_blog_cms"
    )


def schedule_local_rebuild():
    """Start a detached local rebuild, rejecting duplicate requests."""
    os.makedirs(os.path.dirname(LOCAL_REBUILD_LOCK), exist_ok=True)
    if os.path.exists(LOCAL_REBUILD_LOCK):
        if time.time() - os.path.getmtime(LOCAL_REBUILD_LOCK) < 600:
            return False
        os.remove(LOCAL_REBUILD_LOCK)

    try:
        lock_fd = os.open(
            LOCAL_REBUILD_LOCK,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY,
        )
        with os.fdopen(lock_fd, "w", encoding="utf-8") as lock_file:
            lock_file.write(str(os.getpid()))

        creation_flags = 0
        if os.name == "nt":
            creation_flags = (
                getattr(subprocess, "DETACHED_PROCESS", 0)
                | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            )
        subprocess.Popen(
            [sys.executable, LOCAL_REBUILD_SCRIPT],
            cwd=PROJECT_ROOT,
            creationflags=creation_flags,
            close_fds=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except Exception:
        try:
            os.remove(LOCAL_REBUILD_LOCK)
        except FileNotFoundError:
            pass
        raise


@router.get("/config")
async def get_deploy_config():
    try:
        return load_deploy_config()
    except Exception:
        return DEFAULT_CONFIG.copy()


@router.post("/config")
async def save_deploy_config(request: Request):
    try:
        incoming = await request.json()
        config = load_deploy_config()
        config.update(incoming)
        os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
        with open(CONFIG_FILE, "w", encoding="utf-8") as config_file:
            json.dump(config, config_file, ensure_ascii=False, indent=2)
        return {"success": True, "message": "部署配置已保存。"}
    except Exception as error:
        return {"success": False, "message": f"保存失败：{error}"}


@router.get("/ssh/key")
async def get_github_write_key(type: str = "source"):
    """Return the dedicated CMS GitHub write key, creating it when absent."""
    try:
        ssh_dir = os.path.expanduser("~/.ssh")
        os.makedirs(ssh_dir, exist_ok=True)
        private_key = source_private_key_path()
        public_key = f"{private_key}.pub"

        if not os.path.exists(public_key):
            subprocess.run(
                [
                    "ssh-keygen",
                    "-t",
                    "ed25519",
                    "-C",
                    f"{getpass.getuser()}@{platform.node()}-LIU-Blog-CMS",
                    "-N",
                    "",
                    "-f",
                    private_key,
                ],
                check=True,
            )

        with open(public_key, "r", encoding="utf-8") as key_file:
            return {"success": True, "key": key_file.read().strip()}
    except Exception as error:
        return {"success": False, "message": f"获取 SSH 密钥失败：{error}"}


@router.post("/check")
async def check_git_env(request: Request):
    try:
        payload = await request.json()
        blog_path = payload.get("blogPath", "").strip()
        if not blog_path or not os.path.isdir(blog_path):
            return {"success": False, "message": "本地前台路径不存在。"}
        if not os.path.isdir(os.path.join(blog_path, ".git")):
            return {"success": False, "message": "本地前台不是 Git 仓库。"}

        result = subprocess.run(
            ["git", "status", "--short"],
            cwd=blog_path,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        if result.returncode != 0:
            return {"success": False, "message": "Git 环境检查失败。"}
        return {"success": True, "message": "本地 Git 环境正常。"}
    except Exception as error:
        return {"success": False, "message": f"Git 检查失败：{error}"}


@router.post("/server-sync")
async def sync_server_from_github():
    """Start the existing Aliyun pull/deploy service over SSH."""
    try:
        config = load_deploy_config()
        host = config.get("serverHost", "").strip()
        user = config.get("serverUser", "").strip()
        key_path = os.path.expandvars(config.get("serverKeyPath", ""))
        service = config.get("serverUpdateService", "").strip()

        if not re.fullmatch(r"[A-Za-z0-9.-]+", host):
            return {"success": False, "message": "服务器地址不合法。"}
        if not re.fullmatch(r"[A-Za-z0-9._-]+", user):
            return {"success": False, "message": "服务器用户名不合法。"}
        if not re.fullmatch(r"[A-Za-z0-9@_.-]+\.service", service):
            return {"success": False, "message": "服务器更新服务名称不合法。"}
        if not os.path.isfile(key_path):
            return {"success": False, "message": f"服务器连接密钥不存在：{key_path}"}

        process = subprocess.run(
            [
                "ssh",
                "-i",
                key_path,
                "-o",
                "BatchMode=yes",
                "-o",
                "ConnectTimeout=10",
                "-o",
                "StrictHostKeyChecking=accept-new",
                f"{user}@{host}",
                f"systemctl start --no-block {service}",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=20,
        )
        if process.returncode != 0:
            details = (process.stderr or process.stdout).strip()
            return {"success": False, "message": f"主站同步启动失败：{details}"}
        return {
            "success": True,
            "message": "已通知主站从 GitHub 拉取并部署最新版本。",
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "message": "连接主站超时，请检查服务器网络。"}
    except Exception as error:
        return {"success": False, "message": f"主站同步异常：{error}"}


@router.get("/status")
async def get_server_publish_status():
    """Return the persisted server-local publish state."""
    return load_deploy_state()


@router.get("/events")
async def stream_server_publish_status(request: Request):
    """Stream publish state so every admin client sees the same global lock."""

    async def event_stream():
        previous = None
        while not await request.is_disconnected():
            state = load_deploy_state()
            serialized = json.dumps(state, ensure_ascii=False)
            if serialized != previous:
                yield f"event: deploy\ndata: {serialized}\n\n"
                previous = serialized
            else:
                yield ": keep-alive\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/publish-local")
async def publish_from_server_workspace():
    """Start an atomic publish from the server workspace without GitHub."""
    if os.name == "nt":
        return {
            "success": False,
            "message": "服务器本地发布只能在 admin.example.com 中执行。",
        }

    state = load_deploy_state()
    if state.get("state") in BUSY_DEPLOY_STATES:
        raise HTTPException(
            status_code=423,
            detail={
                "message": state.get("message", "服务器正在构建，暂时不能重复发布。"),
                "state": state,
            },
        )

    try:
        started_at = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        save_deploy_state(
            "queued",
            "发布任务已进入队列，正在获取服务器构建锁。",
            2,
            startedAt=started_at,
        )
        process = subprocess.run(
            [
                "sudo",
                "-n",
                "/usr/bin/systemctl",
                "start",
                "--no-block",
                SERVER_PUBLISH_SERVICE,
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=10,
        )
        if process.returncode != 0:
            details = (process.stderr or process.stdout).strip()
            save_deploy_state(
                "failed",
                f"启动服务器构建失败：{details}",
                0,
                startedAt=started_at,
                finishedAt=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            )
            return {"success": False, "message": f"启动服务器构建失败：{details}"}
        return {
            "success": True,
            "message": "服务器已锁定工作区并开始构建主站。",
            "state": load_deploy_state(),
        }
    except subprocess.TimeoutExpired:
        save_deploy_state("failed", "启动服务器构建超时。", 0)
        return {"success": False, "message": "启动服务器构建超时。"}
    except Exception as error:
        save_deploy_state("failed", f"服务器本地发布异常：{error}", 0)
        return {"success": False, "message": f"服务器本地发布异常：{error}"}


@router.post("/source")
async def push_source_to_github(request: Request):
    """Commit the local frontend workspace and push it to GitHub."""
    try:
        payload = await request.json()
        config = load_deploy_config()
        blog_path = payload.get("blogPath", config.get("blogPath", "")).strip()
        source_repo = config.get("sourceRepoUrl", "").strip()
        source_branch = config.get("sourceBranch", "main").strip() or "main"

        if not blog_path or not os.path.isdir(os.path.join(blog_path, ".git")):
            return {"success": False, "message": "本地前台不是有效的 Git 仓库。"}
        if not source_repo:
            return {"success": False, "message": "GitHub 仓库地址为空。"}
        if not re.fullmatch(r"[A-Za-z0-9._/-]+", source_branch):
            return {"success": False, "message": "Git 分支名称不合法。"}

        private_key = source_private_key_path().replace("\\", "/")
        if not os.path.exists(private_key):
            return {"success": False, "message": "未找到后台专用 GitHub 写入密钥。"}

        custom_env = os.environ.copy()
        custom_env["GIT_SSH_COMMAND"] = (
            f'ssh -i "{private_key}" -o IdentitiesOnly=yes '
            "-o StrictHostKeyChecking=accept-new"
        )

        subprocess.run(
            ["git", "config", "user.name", "Xinghui Blog CMS"],
            cwd=blog_path,
            check=True,
        )
        subprocess.run(
            ["git", "config", "user.email", "cms@example.com"],
            cwd=blog_path,
            check=True,
        )
        subprocess.run(["git", "add", "-A"], cwd=blog_path, check=True)

        staged = subprocess.run(
            ["git", "diff", "--cached", "--quiet"], cwd=blog_path
        )
        if staged.returncode not in (0, 1):
            return {"success": False, "message": "无法检查待推送的 Git 变更。"}

        committed = staged.returncode == 1
        if committed:
            subprocess.run(
                ["git", "commit", "-m", "Publish blog updates from CMS"],
                cwd=blog_path,
                check=True,
                env=custom_env,
            )

        push = subprocess.run(
            ["git", "push", source_repo, f"HEAD:{source_branch}"],
            cwd=blog_path,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=custom_env,
        )
        if push.returncode != 0:
            details = (push.stderr or push.stdout).strip()
            return {"success": False, "message": f"推送 GitHub 失败：{details}"}

        action = "已提交并推送到 GitHub" if committed else "GitHub 已是最新版本"
        rebuild_scheduled = False
        if payload.get("rebuildLocal"):
            rebuild_scheduled = schedule_local_rebuild()
        return {
            "success": True,
            "message": action,
            "localRebuildScheduled": rebuild_scheduled,
        }
    except subprocess.CalledProcessError as error:
        return {"success": False, "message": f"Git 命令执行失败：{error}"}
    except Exception as error:
        return {"success": False, "message": f"GitHub 推送异常：{error}"}
