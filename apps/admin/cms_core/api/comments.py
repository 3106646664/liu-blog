"""First-party accounts and comments for the public blog.

The API deliberately stores no GitHub access token. GitHub OAuth is used only
to verify an identity; comments and sessions remain under the site owner's
control.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import secrets
import sqlite3
import threading
import time
import unicodedata
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, Body, Header, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

router = APIRouter()

COOKIE_NAME = "xinghui_comment_session"
SESSION_SECONDS = 30 * 24 * 60 * 60
OAUTH_STATE_SECONDS = 10 * 60
MAX_COMMENT_LENGTH = 2000
_DB_LOCK = threading.RLock()
_RATE_LOCK = threading.Lock()
_RATE_BUCKETS: dict[str, list[float]] = {}


def _now() -> int:
    return int(time.time())


def _iso(timestamp: int | None) -> str | None:
    if timestamp is None:
        return None
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


def _db_path() -> Path:
    configured = os.environ.get("XINGHUI_BLOG_COMMENT_DB", "").strip()
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[2] / "data" / "comments.sqlite3"


def _oauth_config_path() -> Path:
    configured = os.environ.get("XINGHUI_BLOG_COMMENT_OAUTH_CONFIG", "").strip()
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[2] / "data" / "comments-oauth.json"


@contextmanager
def _db() -> Iterator[sqlite3.Connection]:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=15, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_comments_database() -> None:
    with _DB_LOCK, _db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                username_key TEXT NOT NULL UNIQUE,
                email TEXT,
                email_key TEXT UNIQUE,
                password_hash TEXT,
                github_id TEXT UNIQUE,
                github_login TEXT,
                avatar_url TEXT,
                role TEXT NOT NULL DEFAULT 'user',
                disabled INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                csrf_token TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                page_key TEXT NOT NULL,
                parent_id TEXT REFERENCES comments(id) ON DELETE SET NULL,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                deleted_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS comments_page_created
                ON comments(page_key, created_at);
            CREATE TABLE IF NOT EXISTS oauth_states (
                state_hash TEXT PRIMARY KEY,
                verifier TEXT NOT NULL,
                return_to TEXT NOT NULL,
                expires_at INTEGER NOT NULL
            );
            """
        )
        connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (_now(),))
        connection.execute("DELETE FROM oauth_states WHERE expires_at <= ?", (_now(),))


def _oauth_config() -> dict[str, Any]:
    config: dict[str, Any] = {
        "client_id": os.environ.get("COMMENT_GITHUB_CLIENT_ID", "").strip(),
        "client_secret": os.environ.get("COMMENT_GITHUB_CLIENT_SECRET", "").strip(),
        "callback_url": os.environ.get("COMMENT_GITHUB_CALLBACK_URL", "").strip(),
        "admin_github_logins": [
            item.strip().casefold()
            for item in os.environ.get("COMMENT_ADMIN_GITHUB_LOGINS", "").split(",")
            if item.strip()
        ],
    }
    path = _oauth_config_path()
    if path.is_file():
        try:
            disk = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(disk, dict):
                for key in ("client_id", "client_secret", "callback_url", "admin_github_logins"):
                    if disk.get(key):
                        config[key] = disk[key]
        except (OSError, json.JSONDecodeError):
            pass
    return config


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return (forwarded.split(",", 1)[0].strip() or request.client.host if request.client else "unknown")[:128]


def _rate_limit(request: Request, action: str, limit: int, window: int) -> None:
    key = f"{action}:{_client_ip(request)}"
    now = time.monotonic()
    with _RATE_LOCK:
        recent = [stamp for stamp in _RATE_BUCKETS.get(key, []) if now - stamp < window]
        if len(recent) >= limit:
            raise HTTPException(status_code=429, detail="操作过于频繁，请稍后再试")
        recent.append(now)
        _RATE_BUCKETS[key] = recent


def _username_key(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().casefold()


def _clean_username(value: Any) -> str:
    username = unicodedata.normalize("NFKC", str(value or "")).strip()
    if not 2 <= len(username) <= 24:
        raise HTTPException(status_code=400, detail="用户名长度需为 2–24 个字符")
    if not all(char.isalnum() or char in "_.-" for char in username):
        raise HTTPException(status_code=400, detail="用户名只能包含文字、数字、下划线、连字符或点")
    return username


def _clean_email(value: Any) -> tuple[str, str]:
    email = str(value or "").strip()
    if len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(status_code=400, detail="请输入有效的邮箱地址")
    return email, email.casefold()


def _password_hash(password: str) -> str:
    if not 8 <= len(password) <= 128:
        raise HTTPException(status_code=400, detail="密码长度需为 8–128 个字符")
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1, dklen=32)
    return "scrypt$16384$8$1$" + base64.urlsafe_b64encode(salt).decode() + "$" + base64.urlsafe_b64encode(derived).decode()


def _verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        algorithm, n, r, p, salt, expected = encoded.split("$", 5)
        if algorithm != "scrypt":
            return False
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=base64.urlsafe_b64decode(salt),
            n=int(n), r=int(r), p=int(p), dklen=32,
        )
        return secrets.compare_digest(actual, base64.urlsafe_b64decode(expected))
    except (ValueError, TypeError):
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _public_user(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "username": row["username"],
        "avatarUrl": row["avatar_url"],
        "role": row["role"],
        "provider": "github" if row["github_id"] else "local",
    }


def _current_session(request: Request) -> tuple[sqlite3.Row, str] | None:
    token = request.cookies.get(COOKIE_NAME, "")
    if not token:
        return None
    with _db() as connection:
        row = connection.execute(
            """SELECT users.*, sessions.csrf_token
               FROM sessions JOIN users ON users.id = sessions.user_id
               WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.disabled = 0""",
            (_token_hash(token), _now()),
        ).fetchone()
    return (row, row["csrf_token"]) if row else None


def _require_user(request: Request, csrf: str | None = None) -> sqlite3.Row:
    session = _current_session(request)
    if not session:
        raise HTTPException(status_code=401, detail="请先登录")
    user, expected_csrf = session
    if csrf is not None and not secrets.compare_digest(csrf, expected_csrf):
        raise HTTPException(status_code=403, detail="会话校验失败，请刷新页面后重试")
    return user


def _new_session(connection: sqlite3.Connection, user_id: str) -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    now = _now()
    connection.execute(
        "INSERT INTO sessions(token_hash, user_id, csrf_token, expires_at, created_at) VALUES(?,?,?,?,?)",
        (_token_hash(token), user_id, csrf, now + SESSION_SECONDS, now),
    )
    return token, csrf


def _set_session_cookie(response: Response, token: str) -> None:
    cookie_options: dict[str, Any] = {}
    cookie_domain = os.environ.get("COMMENT_COOKIE_DOMAIN", "").strip()
    if cookie_domain:
        cookie_options["domain"] = cookie_domain
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_SECONDS,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
        **cookie_options,
    )


def _comment_payload(row: sqlite3.Row) -> dict[str, Any]:
    deleted = row["deleted_at"] is not None
    return {
        "id": row["id"],
        "pageKey": row["page_key"],
        "parentId": row["parent_id"],
        "content": "该评论已删除" if deleted else row["content"],
        "createdAt": _iso(row["created_at"]),
        "updatedAt": _iso(row["updated_at"]),
        "deleted": deleted,
        "author": {
            "id": row["user_id"],
            "username": row["username"],
            "avatarUrl": row["avatar_url"],
            "role": row["role"],
            "provider": "github" if row["github_id"] else "local",
        },
    }


@router.get("/status")
def comment_status() -> dict[str, Any]:
    config = _oauth_config()
    return {"success": True, "githubEnabled": bool(config["client_id"] and config["client_secret"])}


@router.get("/auth/me")
def auth_me(request: Request) -> dict[str, Any]:
    session = _current_session(request)
    if not session:
        return {"success": True, "user": None, "csrfToken": None}
    user, csrf = session
    return {"success": True, "user": _public_user(user), "csrfToken": csrf}


@router.post("/auth/register")
def auth_register(request: Request, response: Response, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    _rate_limit(request, "register", 5, 60 * 60)
    username = _clean_username(payload.get("username"))
    email, email_key = _clean_email(payload.get("email"))
    password_hash = _password_hash(str(payload.get("password") or ""))
    now = _now()
    user_id = uuid.uuid4().hex
    try:
        with _DB_LOCK, _db() as connection:
            connection.execute(
                """INSERT INTO users(id, username, username_key, email, email_key, password_hash, created_at, updated_at)
                   VALUES(?,?,?,?,?,?,?,?)""",
                (user_id, username, _username_key(username), email, email_key, password_hash, now, now),
            )
            token, csrf = _new_session(connection, user_id)
            user = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    except sqlite3.IntegrityError as error:
        message = "该用户名已被使用" if "username" in str(error).lower() else "该邮箱已注册"
        raise HTTPException(status_code=409, detail=message) from error
    _set_session_cookie(response, token)
    return {"success": True, "user": _public_user(user), "csrfToken": csrf}


@router.post("/auth/login")
def auth_login(request: Request, response: Response, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    _rate_limit(request, "login", 10, 15 * 60)
    account = str(payload.get("account") or "").strip().casefold()
    password = str(payload.get("password") or "")
    with _DB_LOCK, _db() as connection:
        user = connection.execute(
            "SELECT * FROM users WHERE (username_key = ? OR email_key = ?) AND disabled = 0",
            (account, account),
        ).fetchone()
        if not user or not _verify_password(password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="账号或密码错误")
        token, csrf = _new_session(connection, user["id"])
    _set_session_cookie(response, token)
    return {"success": True, "user": _public_user(user), "csrfToken": csrf}


@router.post("/auth/logout")
def auth_logout(request: Request, response: Response, x_csrf_token: str = Header(default="")) -> dict[str, Any]:
    _require_user(request, x_csrf_token)
    token = request.cookies.get(COOKIE_NAME, "")
    with _DB_LOCK, _db() as connection:
        connection.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))
    response.delete_cookie(
        COOKIE_NAME,
        path="/",
        secure=True,
        samesite="lax",
        domain=os.environ.get("COMMENT_COOKIE_DOMAIN", "").strip() or None,
    )
    return {"success": True}


def _safe_return_to(request: Request) -> str:
    candidate = request.query_params.get("returnTo", "/")
    origin = request.headers.get("x-forwarded-public-origin", "").rstrip("/")
    if not origin:
        origin = "http://localhost:3000"
    parsed_origin = urlparse(origin)
    allowed_hosts = {
        host.strip().casefold()
        for host in os.environ.get(
            "COMMENT_ALLOWED_HOSTS",
            "blog.example.com,admin.example.com,localhost,127.0.0.1",
        ).split(",")
        if host.strip()
    }
    if parsed_origin.hostname not in allowed_hosts:
        origin = "http://localhost:3000"
    if not candidate.startswith("/") or candidate.startswith("//"):
        candidate = "/"
    return origin + candidate


@router.get("/auth/github/start")
def github_start(request: Request) -> RedirectResponse:
    _rate_limit(request, "github", 20, 15 * 60)
    config = _oauth_config()
    if not config["client_id"] or not config["client_secret"]:
        raise HTTPException(status_code=503, detail="GitHub 登录尚未配置")
    callback_url = str(config.get("callback_url") or "https://blog.example.com/api/comments/auth/github/callback")
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    with _DB_LOCK, _db() as connection:
        connection.execute(
            "INSERT INTO oauth_states(state_hash, verifier, return_to, expires_at) VALUES(?,?,?,?)",
            (_token_hash(state), verifier, _safe_return_to(request), _now() + OAUTH_STATE_SECONDS),
        )
    query = urlencode({
        "client_id": config["client_id"],
        "redirect_uri": callback_url,
        "scope": "read:user",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    })
    return RedirectResponse(f"https://github.com/login/oauth/authorize?{query}", status_code=302)


@router.get("/auth/github/callback")
async def github_callback(request: Request) -> RedirectResponse:
    code = request.query_params.get("code", "")
    state = request.query_params.get("state", "")
    if not code or not state:
        return RedirectResponse("/?commentAuth=github_error", status_code=302)
    with _DB_LOCK, _db() as connection:
        oauth_state = connection.execute(
            "SELECT * FROM oauth_states WHERE state_hash = ? AND expires_at > ?",
            (_token_hash(state), _now()),
        ).fetchone()
        connection.execute("DELETE FROM oauth_states WHERE state_hash = ?", (_token_hash(state),))
    if not oauth_state:
        return RedirectResponse("/?commentAuth=state_expired", status_code=302)

    config = _oauth_config()
    callback_url = str(config.get("callback_url") or "https://blog.example.com/api/comments/auth/github/callback")
    async with httpx.AsyncClient(timeout=15) as client:
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": config["client_id"],
                "client_secret": config["client_secret"],
                "code": code,
                "redirect_uri": callback_url,
                "code_verifier": oauth_state["verifier"],
            },
        )
        token_data = token_response.json()
        access_token = token_data.get("access_token")
        if not access_token:
            return RedirectResponse("/?commentAuth=github_error", status_code=302)
        profile_response = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        profile_response.raise_for_status()
        profile = profile_response.json()

    github_id = str(profile["id"])
    github_login = str(profile["login"])
    avatar_url = str(profile.get("avatar_url") or "")
    now = _now()
    with _DB_LOCK, _db() as connection:
        user = connection.execute("SELECT * FROM users WHERE github_id = ?", (github_id,)).fetchone()
        if not user:
            username = _clean_username(github_login)
            base = username
            suffix = 1
            while connection.execute("SELECT 1 FROM users WHERE username_key = ?", (_username_key(username),)).fetchone():
                suffix += 1
                username = f"{base[:20]}-{suffix}"
            admin_logins = {str(item).casefold() for item in config.get("admin_github_logins", [])}
            user_id = uuid.uuid4().hex
            connection.execute(
                """INSERT INTO users(id, username, username_key, github_id, github_login, avatar_url, role, created_at, updated_at)
                   VALUES(?,?,?,?,?,?,?,?,?)""",
                (user_id, username, _username_key(username), github_id, github_login, avatar_url,
                 "admin" if github_login.casefold() in admin_logins else "user", now, now),
            )
            user = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        else:
            connection.execute(
                "UPDATE users SET github_login = ?, avatar_url = ?, updated_at = ? WHERE id = ?",
                (github_login, avatar_url, now, user["id"]),
            )
        token, _csrf = _new_session(connection, user["id"])
    response = RedirectResponse(oauth_state["return_to"], status_code=302)
    _set_session_cookie(response, token)
    return response


@router.get("/thread")
def list_comments(page: str) -> dict[str, Any]:
    page_key = page.strip()[:256]
    if not page_key:
        raise HTTPException(status_code=400, detail="缺少页面标识")
    with _db() as connection:
        rows = connection.execute(
            """SELECT comments.*, users.username, users.avatar_url, users.role, users.github_id
               FROM comments JOIN users ON users.id = comments.user_id
               WHERE comments.page_key = ? ORDER BY comments.created_at ASC LIMIT 300""",
            (page_key,),
        ).fetchall()
    return {"success": True, "comments": [_comment_payload(row) for row in rows]}


@router.post("/thread")
def create_comment(
    request: Request,
    payload: dict[str, Any] = Body(...),
    x_csrf_token: str = Header(default=""),
) -> dict[str, Any]:
    user = _require_user(request, x_csrf_token)
    _rate_limit(request, "comment", 8, 60)
    page_key = str(payload.get("pageKey") or "").strip()[:256]
    content = str(payload.get("content") or "").strip()
    parent_id = str(payload.get("parentId") or "").strip() or None
    if not page_key:
        raise HTTPException(status_code=400, detail="缺少页面标识")
    if not content or len(content) > MAX_COMMENT_LENGTH:
        raise HTTPException(status_code=400, detail=f"评论长度需为 1–{MAX_COMMENT_LENGTH} 个字符")
    now = _now()
    comment_id = uuid.uuid4().hex
    with _DB_LOCK, _db() as connection:
        if parent_id:
            parent = connection.execute(
                "SELECT 1 FROM comments WHERE id = ? AND page_key = ?", (parent_id, page_key)
            ).fetchone()
            if not parent:
                raise HTTPException(status_code=400, detail="回复的评论不存在")
        recent = connection.execute(
            "SELECT created_at FROM comments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", (user["id"],)
        ).fetchone()
        if recent and now - recent["created_at"] < 3:
            raise HTTPException(status_code=429, detail="评论发送太快，请稍后再试")
        connection.execute(
            "INSERT INTO comments(id, page_key, parent_id, user_id, content, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
            (comment_id, page_key, parent_id, user["id"], content, now, now),
        )
        row = connection.execute(
            """SELECT comments.*, users.username, users.avatar_url, users.role, users.github_id
               FROM comments JOIN users ON users.id = comments.user_id WHERE comments.id = ?""",
            (comment_id,),
        ).fetchone()
    return {"success": True, "comment": _comment_payload(row)}


@router.delete("/{comment_id}")
def delete_comment(
    comment_id: str,
    request: Request,
    x_csrf_token: str = Header(default=""),
) -> dict[str, Any]:
    user = _require_user(request, x_csrf_token)
    with _DB_LOCK, _db() as connection:
        comment = connection.execute("SELECT * FROM comments WHERE id = ?", (comment_id,)).fetchone()
        if not comment:
            raise HTTPException(status_code=404, detail="评论不存在")
        if comment["user_id"] != user["id"] and user["role"] != "admin":
            raise HTTPException(status_code=403, detail="无权删除该评论")
        connection.execute("UPDATE comments SET deleted_at = ?, updated_at = ? WHERE id = ?", (_now(), _now(), comment_id))
    return {"success": True}


init_comments_database()
