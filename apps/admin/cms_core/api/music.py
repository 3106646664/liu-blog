from __future__ import annotations

import asyncio
import html
import json
import os
import random
import re
import time
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter()

PROJECT_ROOT = Path(__file__).resolve().parents[2]
LIBRARY_PATH = Path(os.environ.get("XINGHUI_BLOG_MUSIC_LIBRARY", PROJECT_ROOT / "data" / "music-library.json"))
CACHE_PATH = Path(os.environ.get("XINGHUI_BLOG_MUSIC_CACHE", PROJECT_ROOT / "data" / "music-playlist-cache.json"))
DEFAULT_COOKIE_PATH = Path("/srv/xinghui-blog-music/cookies.json")
COOKIE_PATH = Path(
    os.environ.get(
        "QQ_MUSIC_COOKIE_FILE",
        DEFAULT_COOKIE_PATH if DEFAULT_COOKIE_PATH.exists() else PROJECT_ROOT / "data" / "qq-music-cookies.json",
    )
)
MUSIC_ENGINE_URL = os.environ.get("QQ_MUSIC_ENGINE_URL", "http://127.0.0.1:8081").rstrip("/")
QQ_MUSICU_URL = "https://u.y.qq.com/cgi-bin/musicu.fcg"
QQ_SMARTBOX_URL = "https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg"
QQ_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
QQ_HEADERS = {"User-Agent": QQ_USER_AGENT, "Referer": "https://y.qq.com/"}
MAX_PUBLIC_TRACKS = 500

_playlist_lock = asyncio.Lock()
_playlist_cache: list[dict[str, Any]] = []


class LibraryItemInput(BaseModel):
    kind: Literal["track", "playlist"]
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(default="", max_length=200)
    artist: str = Field(default="", max_length=200)
    creator: str = Field(default="", max_length=200)
    cover: str = Field(default="", max_length=1000)
    duration: int = Field(default=0, ge=0)
    track_count: int = Field(default=0, ge=0)


class LibraryOrderInput(BaseModel):
    keys: list[str] = Field(max_length=100)


def _write_json_atomic(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def _load_library_payload() -> dict[str, Any]:
    try:
        payload = json.loads(LIBRARY_PATH.read_text(encoding="utf-8"))
        if not isinstance(payload, dict) or payload.get("source") != "qq":
            raise ValueError("legacy music source")
        items = payload.get("items", [])
        payload["items"] = [
            item for item in items
            if isinstance(item, dict) and item.get("kind") in {"track", "playlist"} and item.get("id")
        ]
        payload["include_favorites"] = payload.get("include_favorites", True) is not False
        return payload
    except (FileNotFoundError, json.JSONDecodeError, OSError, ValueError):
        return {"source": "qq", "include_favorites": True, "items": []}


def _save_library(items: list[dict[str, Any]], include_favorites: bool = True) -> None:
    _write_json_atomic(
        LIBRARY_PATH,
        {
            "source": "qq",
            "include_favorites": include_favorites,
            "updated_at": int(time.time()),
            "items": items,
        },
    )


def _load_cookie() -> str:
    try:
        raw = COOKIE_PATH.read_text(encoding="utf-8").strip()
        if not raw:
            return ""
        if raw.startswith("{"):
            payload = json.loads(raw)
            return str(payload.get("qq") or "") if isinstance(payload, dict) else ""
        return raw
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return ""


def _cookie_object(cookie: str | None = None) -> dict[str, str]:
    result: dict[str, str] = {}
    for part in (cookie if cookie is not None else _load_cookie()).split(";"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        if key.strip():
            result[key.strip()] = value.strip()
    return result


def _qq_uin(cookies: dict[str, str]) -> str:
    raw = cookies.get("wxuin") if cookies.get("login_type") == "2" else ""
    raw = raw or cookies.get("uin") or cookies.get("qqmusic_uin") or cookies.get("wxuin") or cookies.get("p_uin") or ""
    digits = re.sub(r"\D", "", raw)
    return digits.lstrip("0") or digits


def _music_key(cookies: dict[str, str]) -> str:
    return (
        cookies.get("qm_keyst") or cookies.get("qqmusic_key") or cookies.get("music_key")
        or cookies.get("p_skey") or cookies.get("skey") or cookies.get("wxskey") or ""
    )


def _playback_key(cookies: dict[str, str]) -> str:
    return cookies.get("qm_keyst") or cookies.get("qqmusic_key") or cookies.get("music_key") or cookies.get("wxskey") or ""


def _decode_cookie_value(value: str) -> str:
    raw = value.strip()
    if re.fullmatch(r"(?:[0-9a-fA-F]{2})+", raw):
        try:
            return bytes.fromhex(raw).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            pass
    try:
        from urllib.parse import unquote
        return unquote(raw)
    except ValueError:
        return raw


def _login_status() -> dict[str, Any]:
    cookies = _cookie_object()
    uin = _qq_uin(cookies)
    nickname = ""
    for key in (f"ptnick_{uin}", f"ptnick_0{uin}", "ptnick", "nick", "nickname"):
        if cookies.get(key):
            nickname = _decode_cookie_value(cookies[key])
            break
    return {
        "success": True,
        "source": "qq",
        "logged_in": bool(uin and _music_key(cookies)),
        "playback_ready": bool(uin and _playback_key(cookies)),
        "uin": uin,
        "nickname": nickname or (f"QQ {uin}" if uin else ""),
        "avatar": f"https://q1.qlogo.cn/g?b=qq&nk={quote(uin)}&s=100" if uin else "",
    }


async def _engine_json(method: str, path: str, *, params: dict[str, Any] | None = None, body: Any = None) -> Any:
    try:
        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
            response = await client.request(method, f"{MUSIC_ENGINE_URL}{path}", params=params, json=body)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=502, detail=f"QQ 音乐内部服务暂时不可用：{error}") from error
    if not isinstance(payload, dict) or (
        int(payload.get("code", 0)) != 200 and payload.get("status") != "ok"
    ):
        raise HTTPException(status_code=502, detail=str(payload.get("msg") or "QQ 音乐返回异常"))
    return payload.get("data")


async def _qq_musicu(payload: dict[str, Any], *, cookie: bool = False) -> dict[str, Any]:
    headers = {**QQ_HEADERS, "Content-Type": "application/json;charset=UTF-8"}
    if cookie and _load_cookie():
        headers["Cookie"] = _load_cookie()
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            response = await client.post(QQ_MUSICU_URL, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=502, detail=f"QQ 音乐请求失败：{error}") from error
    return data if isinstance(data, dict) else {}


def _qq_cover(album_mid: str) -> str:
    return f"https://y.qq.com/music/photo_new/T002R300x300M000{album_mid}.jpg?max_age=2592000" if album_mid else ""


def _normalize_track(track: dict[str, Any], fallback: dict[str, Any] | None = None) -> dict[str, Any]:
    fallback = fallback or {}
    album = track.get("album") or {}
    singers = track.get("singer") or track.get("singers") or []
    artists = " / ".join(str(item.get("name") or item.get("title") or "") for item in singers if isinstance(item, dict)).strip(" / ")
    mid = str(track.get("mid") or track.get("songmid") or fallback.get("mid") or fallback.get("id") or "")
    album_mid = str(album.get("mid") or album.get("pmid") or track.get("albummid") or "")
    file_info = track.get("file") or {}
    return {
        "id": mid,
        "name": html.unescape(str(track.get("name") or track.get("title") or fallback.get("name") or "未知曲目")),
        "artist": html.unescape(artists or str(fallback.get("artist") or fallback.get("singer") or "未知歌手")),
        "album": html.unescape(str(album.get("name") or album.get("title") or track.get("albumname") or "")),
        "cover": _qq_cover(album_mid) or str(fallback.get("cover") or ""),
        "duration": int(track.get("interval") or fallback.get("duration") or 0),
        "media_mid": str(file_info.get("media_mid") or track.get("media_mid") or fallback.get("media_mid") or ""),
        "qq_id": str(track.get("id") or track.get("songid") or fallback.get("qq_id") or ""),
        "source": "qq",
    }


async def _song_detail(mid: str, fallback: dict[str, Any] | None = None) -> dict[str, Any]:
    data = await _qq_musicu({
        "comm": {"ct": 24, "cv": 0},
        "songinfo": {
            "module": "music.pf_song_detail_svr",
            "method": "get_song_detail_yqq",
            "param": {"song_mid": mid},
        },
    })
    block = data.get("songinfo") or {}
    track = (block.get("data") or {}).get("track_info") or {}
    normalized = _normalize_track(track, fallback)
    if not normalized["id"]:
        raise HTTPException(status_code=404, detail="没有找到这首 QQ 音乐")
    return normalized


async def _search_tracks(query: str, limit: int) -> list[dict[str, Any]]:
    params = {
        "format": "json", "key": query, "g_tk": "5381", "loginUin": "0", "hostUin": "0",
        "inCharset": "utf8", "outCharset": "utf-8", "notice": "0", "platform": "yqq.json", "needNewCode": "0",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            response = await client.get(QQ_SMARTBOX_URL, params=params, headers=QQ_HEADERS)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=502, detail=f"QQ 音乐搜索失败：{error}") from error
    raw = (((payload.get("data") or {}).get("song") or {}).get("itemlist") or [])[:limit]
    base = [
        {
            "id": str(item.get("mid") or item.get("id") or ""),
            "mid": str(item.get("mid") or ""),
            "name": html.unescape(str(item.get("name") or "")),
            "artist": html.unescape(str(item.get("singer") or "")),
            "qq_id": str(item.get("id") or item.get("docid") or ""),
            "source": "qq",
        }
        for item in raw if isinstance(item, dict) and item.get("mid")
    ]
    detailed = await asyncio.gather(*[_song_detail(item["id"], item) for item in base], return_exceptions=True)
    return [item if isinstance(item, dict) else base[index] for index, item in enumerate(detailed)]


def _normalize_playlist(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(item.get("id") or ""),
        "name": html.unescape(str(item.get("name") or "未命名歌单")),
        "creator": html.unescape(str(item.get("creator") or "QQ 音乐")),
        "cover": str(item.get("cover") or ""),
        "track_count": int(item.get("track_count") or 0),
        "source": "qq",
    }


async def _search_playlists(query: str, limit: int) -> list[dict[str, Any]]:
    data = await _engine_json(
        "GET", "/api/v1/music/search",
        params={"q": query, "type": "playlist", "sources": "qq"},
    )
    playlists = data.get("playlists") if isinstance(data, dict) else []
    return [_normalize_playlist(item) for item in (playlists or [])[:limit] if isinstance(item, dict)]


async def _playlist_tracks(playlist_id: str) -> list[dict[str, Any]]:
    data = await _engine_json(
        "GET", "/api/v1/playlist/detail", params={"source": "qq", "id": playlist_id},
    )
    if not isinstance(data, list):
        return []
    return [
        {
            "id": str(item.get("id") or ""),
            "name": html.unescape(str(item.get("name") or "未知曲目")),
            "artist": html.unescape(str(item.get("artist") or "未知歌手")),
            "album": html.unescape(str(item.get("album") or "")),
            "cover": str(item.get("cover") or ""),
            "duration": int(item.get("duration") or 0),
            "media_mid": str((item.get("extra") or {}).get("media_mid") or ""),
            "qq_id": str((item.get("extra") or {}).get("song_id") or ""),
            "source": "qq",
        }
        for item in data if isinstance(item, dict) and item.get("id")
    ]


def _invalidate_cache() -> None:
    _playlist_cache.clear()


def _load_stale_playlist() -> list[dict[str, Any]]:
    try:
        payload = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        if not isinstance(payload, dict) or payload.get("source") != "qq":
            return []
        tracks = payload.get("tracks", [])
        return tracks if isinstance(tracks, list) else []
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []


async def _song_url(mid: str) -> str:
    song = await _song_detail(mid)
    cookies = _cookie_object()
    uin = _qq_uin(cookies) or "0"
    music_key = _music_key(cookies)
    playback_key = _playback_key(cookies)
    media_id = song.get("media_mid") or mid
    candidates = [
        ("F000", ".flac"), ("M800", ".mp3"), ("M500", ".mp3"), ("C400", ".m4a"),
    ]
    filenames = [f"{prefix}{media_id}{extension}" for prefix, extension in candidates]
    comm: dict[str, Any] = {"uin": uin, "format": "json", "ct": 19 if music_key else 24, "cv": 0}
    if music_key:
        comm["authst"] = music_key
    data = await _qq_musicu({
        "comm": comm,
        "req_0": {
            "module": "vkey.GetVkeyServer",
            "method": "CgiGetVkey",
            "param": {
                "guid": str(random.randint(10_000_000, 99_999_999)),
                "songmid": [mid] * len(filenames),
                "songtype": [0] * len(filenames),
                "uin": uin,
                "loginflag": 1,
                "platform": "20",
                "filename": filenames,
            },
        },
    }, cookie=True)
    block = ((data.get("req_0") or {}).get("data") or {})
    info = next((item for item in (block.get("midurlinfo") or []) if item.get("purl")), None)
    if not info:
        status = 401 if not playback_key else 403
        message = "QQ 音乐登录尚未取得播放授权，请在后台重新扫码" if not playback_key else "当前账号无权播放此曲目或版权受限"
        raise HTTPException(status_code=status, detail=message)
    sip = (block.get("sip") or ["https://ws.stream.qqmusic.qq.com/"])[0]
    return f"{sip}{info['purl']}"


@router.get("/login/status")
async def music_login_status():
    return _login_status()


@router.post("/login/start")
async def start_music_login(method: Literal["qq", "qq_wx"] = "qq"):
    data = await _engine_json("POST", f"/api/v1/system/qr_login/{method}")
    return {"success": True, "method": method, "data": data}


@router.get("/login/check")
async def check_music_login(key: str = Query(min_length=1), method: Literal["qq", "qq_wx"] = "qq"):
    data = await _engine_json("GET", f"/api/v1/system/qr_login/{method}", params={"key": key})
    result = {"success": True, "method": method, "data": data, "account": _login_status()}
    if isinstance(data, dict) and data.get("status") == "success":
        _invalidate_cache()
    return result


@router.post("/logout")
async def logout_music():
    await _engine_json("POST", "/api/v1/system/cookies", body={"qq": ""})
    _invalidate_cache()
    return {"success": True, "message": "QQ 音乐账号已退出"}


@router.get("/account/playlists")
async def account_playlists():
    status = _login_status()
    if not status["logged_in"]:
        return {"success": True, "logged_in": False, "data": []}
    data = await _engine_json("GET", "/api/v1/playlist/user", params={"source": "qq", "page": 1, "limit": 100})
    playlists = data.get("playlists") if isinstance(data, dict) else []
    return {
        "success": True,
        "logged_in": True,
        "data": [_normalize_playlist(item) for item in (playlists or []) if isinstance(item, dict)],
    }


@router.get("/search")
async def search_music(
    query: str = Query(min_length=1, max_length=100),
    kind: Literal["track", "playlist"] = "track",
    limit: int = Query(default=12, ge=1, le=25),
):
    data = await (_search_tracks(query, limit) if kind == "track" else _search_playlists(query, limit))
    return {"success": True, "source": "qq", "kind": kind, "data": data}


@router.get("/library")
async def get_music_library():
    payload = _load_library_payload()
    return {
        "success": True,
        "source": "qq",
        "include_favorites": payload["include_favorites"],
        "items": payload["items"],
    }


@router.post("/library")
async def add_music_library_item(body: LibraryItemInput):
    item_id = body.id.strip()
    payload = _load_library_payload()
    items = payload["items"]
    key = f"{body.kind}:{item_id}"
    if any(f"{item['kind']}:{item['id']}" == key for item in items):
        return {"success": True, "message": "该内容已在播放列表中", "items": items}
    if body.kind == "track":
        details = await _song_detail(item_id, body.model_dump())
    else:
        if item_id == "profile:favorites":
            return {"success": True, "message": "“我喜欢”已作为默认歌单启用", "items": items}
        tracks = await _playlist_tracks(item_id)
        if not tracks:
            raise HTTPException(status_code=404, detail="该 QQ 歌单为空或暂时无法读取")
        details = {
            "id": item_id,
            "name": body.name or f"QQ 歌单 {item_id}",
            "creator": body.creator or "QQ 音乐",
            "cover": body.cover,
            "track_count": body.track_count or len(tracks),
            "source": "qq",
        }
    items.append({"kind": body.kind, **details})
    _save_library(items, payload["include_favorites"])
    _invalidate_cache()
    return {"success": True, "message": "已加入主站播放列表", "items": items}


@router.delete("/library/{kind}/{item_id}")
async def remove_music_library_item(kind: Literal["track", "playlist"], item_id: str):
    payload = _load_library_payload()
    updated = [item for item in payload["items"] if not (item.get("kind") == kind and item.get("id") == item_id)]
    _save_library(updated, payload["include_favorites"])
    _invalidate_cache()
    return {"success": True, "message": "已从主站播放列表移除", "items": updated}


@router.put("/library/order")
async def reorder_music_library(body: LibraryOrderInput):
    payload = _load_library_payload()
    item_map = {f"{item['kind']}:{item['id']}": item for item in payload["items"]}
    ordered = [item_map[key] for key in body.keys if key in item_map]
    ordered_keys = set(body.keys)
    ordered.extend(item for key, item in item_map.items() if key not in ordered_keys)
    _save_library(ordered, payload["include_favorites"])
    _invalidate_cache()
    return {"success": True, "message": "播放顺序已更新", "items": ordered}


@router.get("/playlist")
async def get_public_playlist():
    async with _playlist_lock:
        payload = _load_library_payload()
        account = _login_status()
        batches: list[list[dict[str, Any]]] = []
        errors: list[str] = []
        if payload["include_favorites"] and account["playback_ready"]:
            try:
                batches.append(await _playlist_tracks("profile:favorites"))
            except HTTPException as error:
                errors.append(str(error.detail))
        for item in payload["items"]:
            try:
                batches.append([await _song_detail(str(item["id"]))] if item["kind"] == "track" else await _playlist_tracks(str(item["id"])))
            except HTTPException as error:
                errors.append(str(error.detail))
        deduplicated: list[dict[str, Any]] = []
        seen: set[str] = set()
        for track in (track for batch in batches for track in batch):
            track_id = str(track.get("id") or "")
            if track_id and track_id not in seen:
                seen.add(track_id)
                deduplicated.append(track)
            if len(deduplicated) >= MAX_PUBLIC_TRACKS:
                break
        if deduplicated:
            _playlist_cache[:] = deduplicated
            _write_json_atomic(CACHE_PATH, {"source": "qq", "cached_at": int(time.time()), "tracks": deduplicated})
            return {"success": True, "source": "qq", "data": deduplicated, "warning_count": len(errors)}
        stale = _playlist_cache or _load_stale_playlist()
        if stale and (account["playback_ready"] or bool(payload["items"])):
            return {"success": True, "source": "qq", "stale": True, "data": stale, "warning_count": len(errors)}
        return {"success": True, "source": "qq", "login_required": not account["playback_ready"], "data": [], "warning_count": len(errors)}


@router.get("/stream/{track_id}")
async def stream_music(track_id: str, request: Request):
    if not re.fullmatch(r"[A-Za-z0-9]+", track_id):
        raise HTTPException(status_code=400, detail="无效的 QQ 音乐 ID")
    audio_url = await _song_url(track_id)
    headers = {**QQ_HEADERS}
    if _load_cookie():
        headers["Cookie"] = _load_cookie()
    if request.headers.get("range"):
        headers["Range"] = request.headers["range"]
    client = httpx.AsyncClient(timeout=None, follow_redirects=True)
    upstream = await client.send(client.build_request("GET", audio_url, headers=headers), stream=True)
    if upstream.status_code >= 400:
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(status_code=502, detail="QQ 音乐音频流暂时不可用")

    async def body_iterator():
        try:
            async for chunk in upstream.aiter_raw():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    response_headers = {
        name: value for name in ("content-type", "content-length", "content-range", "accept-ranges")
        if (value := upstream.headers.get(name))
    }
    response_headers["Cache-Control"] = "private, no-store"
    return StreamingResponse(body_iterator(), status_code=upstream.status_code, headers=response_headers)


@router.get("/lyric/{track_id}")
async def music_lyric(track_id: str):
    if not re.fullmatch(r"[A-Za-z0-9]+", track_id):
        raise HTTPException(status_code=400, detail="无效的 QQ 音乐 ID")
    data = await _engine_json("GET", "/api/v1/music/lyric", params={"id": track_id, "source": "qq"})
    lyric = str(data.get("lyric") or "") if isinstance(data, dict) else ""
    return PlainTextResponse(lyric or "[00:00.00] 暂无歌词", media_type="text/plain; charset=utf-8")


@router.get("/query/{track_id}")
async def query_qq_track(track_id: str):
    return {"success": True, "source": "qq", "data": await _song_detail(track_id)}
