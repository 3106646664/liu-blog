from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from cms_core.api import music


admin_router = APIRouter()
public_router = APIRouter()

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PAIR_STATE_PATH = Path(
    os.environ.get(
        "XINGHUI_BLOG_MUSIC_PAIR_STATE",
        PROJECT_ROOT / "data" / "music-pair-sessions.json",
    )
)
PAIR_TTL_SECONDS = 10 * 60
PAIR_RETENTION_SECONDS = 24 * 60 * 60
PAIR_ENDPOINT = os.environ.get(
    "XINGHUI_BLOG_MUSIC_PAIR_ENDPOINT",
    "https://admin.example.com/music-pair/complete",
)

_attempts_by_ip: dict[str, list[float]] = {}


class PairCompleteInput(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    cookie: str = Field(min_length=10, max_length=32768)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.strip().encode("utf-8")).hexdigest()


def _load_pairs() -> dict[str, dict[str, Any]]:
    try:
        payload = json.loads(PAIR_STATE_PATH.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def _save_pairs(pairs: dict[str, dict[str, Any]]) -> None:
    PAIR_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = PAIR_STATE_PATH.with_suffix(PAIR_STATE_PATH.suffix + ".tmp")
    temporary.write_text(json.dumps(pairs, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.chmod(temporary, 0o600)
    except OSError:
        pass
    temporary.replace(PAIR_STATE_PATH)


def _expire_pairs(pairs: dict[str, dict[str, Any]], now: int) -> bool:
    changed = False
    for pair_id, pair in list(pairs.items()):
        expires_at = int(pair.get("expires_at") or 0)
        if pair.get("status") == "waiting" and expires_at <= now:
            pair["status"] = "expired"
            pair["message"] = "配对码已过期，请在后台重新生成"
            changed = True
        if expires_at and expires_at + PAIR_RETENTION_SECONDS <= now:
            del pairs[pair_id]
            changed = True
    return changed


def _public_pair(pair: dict[str, Any]) -> dict[str, Any]:
    return {
        "success": True,
        "pair_id": pair.get("pair_id", ""),
        "status": pair.get("status", "waiting"),
        "created_at": pair.get("created_at", 0),
        "expires_at": pair.get("expires_at", 0),
        "completed_at": pair.get("completed_at", 0),
        "message": pair.get("message", ""),
        "account": pair.get("account"),
    }


def _rate_limit(ip: str) -> None:
    now = time.monotonic()
    recent = [stamp for stamp in _attempts_by_ip.get(ip, []) if now - stamp < 60]
    if len(recent) >= 12:
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试")
    recent.append(now)
    _attempts_by_ip[ip] = recent


def _normalize_cookie(cookie: str) -> tuple[str, dict[str, str]]:
    values: dict[str, str] = {}
    ordered_names: list[str] = []
    for raw_part in cookie.replace("\r", "").replace("\n", "").split(";"):
        part = raw_part.strip()
        if not part or "=" not in part:
            continue
        name, value = part.split("=", 1)
        name = name.strip()
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", name):
            continue
        if len(value) > 4096:
            continue
        if name not in values:
            ordered_names.append(name)
        values[name] = value
        if len(ordered_names) >= 128:
            break
    normalized = "; ".join(f"{name}={values[name]}" for name in ordered_names if values[name])
    return normalized, values


@admin_router.post("/start")
async def start_pairing():
    now = int(time.time())
    token = secrets.token_urlsafe(24)
    pair_id = secrets.token_urlsafe(9)
    pairs = _load_pairs()
    _expire_pairs(pairs, now)
    pair = {
        "pair_id": pair_id,
        "token_hash": _token_hash(token),
        "status": "waiting",
        "created_at": now,
        "expires_at": now + PAIR_TTL_SECONDS,
        "completed_at": 0,
        "message": "等待 Windows 登录助手提交 QQ 音乐会话",
    }
    pairs[pair_id] = pair
    _save_pairs(pairs)
    return {
        **_public_pair(pair),
        "token": token,
        "endpoint": PAIR_ENDPOINT,
        "expires_in": PAIR_TTL_SECONDS,
    }


@admin_router.get("/{pair_id}")
async def pairing_status(pair_id: str):
    pairs = _load_pairs()
    changed = _expire_pairs(pairs, int(time.time()))
    pair = pairs.get(pair_id)
    if changed:
        _save_pairs(pairs)
    if not pair:
        raise HTTPException(status_code=404, detail="配对会话不存在或已清理")
    return _public_pair(pair)


@admin_router.delete("/{pair_id}")
async def cancel_pairing(pair_id: str):
    pairs = _load_pairs()
    pair = pairs.get(pair_id)
    if not pair:
        return {"success": True, "status": "cancelled"}
    if pair.get("status") == "waiting":
        pair["status"] = "cancelled"
        pair["message"] = "配对已取消"
        _save_pairs(pairs)
    return _public_pair(pair)


@public_router.post("/complete")
async def complete_pairing(body: PairCompleteInput, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    _rate_limit(client_ip)

    now = int(time.time())
    pairs = _load_pairs()
    changed = _expire_pairs(pairs, now)
    submitted_hash = _token_hash(body.token)
    pair = next(
        (candidate for candidate in pairs.values() if secrets.compare_digest(str(candidate.get("token_hash") or ""), submitted_hash)),
        None,
    )
    if changed:
        _save_pairs(pairs)
    if not pair:
        raise HTTPException(status_code=404, detail="配对码无效，请在后台重新生成")
    if pair.get("status") == "expired":
        raise HTTPException(status_code=410, detail="配对码已过期，请在后台重新生成")
    if pair.get("status") == "completed":
        raise HTTPException(status_code=409, detail="该配对码已经使用")
    if pair.get("status") != "waiting":
        raise HTTPException(status_code=409, detail="该配对会话已不可用")

    normalized, cookies = _normalize_cookie(body.cookie)
    uin = music._qq_uin(cookies)
    if not uin or not music._playback_key(cookies):
        raise HTTPException(
            status_code=400,
            detail="QQ 音乐播放票据尚未就绪，请保持登录窗口打开后重试",
        )

    await music._engine_json("POST", "/api/v1/system/cookies", body={"qq": normalized})
    music._invalidate_cache()
    account = {
        "uin": uin,
        "nickname": music._decode_cookie_value(
            cookies.get(f"ptnick_{uin}")
            or cookies.get(f"ptnick_0{uin}")
            or cookies.get("ptnick")
            or ""
        ) or f"QQ {uin}",
        "playback_ready": True,
    }
    pair["status"] = "completed"
    pair["completed_at"] = now
    pair["message"] = "QQ 音乐会员播放会话已安全同步"
    pair["account"] = account
    _save_pairs(pairs)
    return {"success": True, "status": "completed", "account": account}
