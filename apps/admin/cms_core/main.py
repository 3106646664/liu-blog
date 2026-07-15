import os

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# 引入所有 API 路由
from cms_core.api import music, music_pair, config, picbed, drafts, moments, comments
from cms_core.api import gallery, friends, projects
from cms_core.api import sync, deploy

app = FastAPI(title="Xinghui Blog CMS Backend", version="1.0.0")


@app.middleware("http")
async def block_writes_while_publishing(request, call_next):
    """Enforce the server-wide publish lock independently of browser state."""
    status_paths = {"/api/deploy/status", "/api/deploy/events"}
    if (
        request.method in {"POST", "PUT", "PATCH", "DELETE"}
        and request.url.path not in status_paths
        and not request.url.path.startswith("/api/comments")
        and deploy.is_deploy_busy()
    ):
        state = deploy.load_deploy_state()
        return JSONResponse(
            status_code=423,
            content={
                "success": False,
                "message": state.get("message", "服务器正在构建，暂时不能修改。"),
                "state": state,
            },
        )
    return await call_next(request)

# 🌟 核心修复：添加跨域中间件，彻底解决 Failed to fetch 报错
allowed_origins = [
    origin.strip()
    for origin in os.environ.get(
        "XINGHUI_BLOG_ALLOWED_ORIGINS",
        "http://127.0.0.1:3001,http://localhost:3001",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/status")
def get_status():
    return {"status": "online", "message": "中枢神经已连接"}

# 注册所有路由
app.include_router(music.router, prefix="/api/music", tags=["Music"])
app.include_router(music_pair.admin_router, prefix="/api/music/login/pair", tags=["Music Pairing"])
app.include_router(music_pair.public_router, prefix="/api/music-pair", tags=["Music Pairing Helper"])
app.include_router(config.router, prefix="/api/config", tags=["Config"])
app.include_router(picbed.router, prefix="/api/picbed", tags=["PicBed"])
app.include_router(drafts.router, prefix="/api/drafts", tags=["Drafts"])
app.include_router(gallery.router, prefix="/api/gallery", tags=["Gallery"])
app.include_router(friends.router, prefix="/api/friends", tags=["Friends"])
app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])
app.include_router(moments.router, prefix="/api/moments", tags=["Moments"])
app.include_router(sync.router, prefix="/api/sync", tags=["Sync"])
app.include_router(deploy.router, prefix="/api/deploy", tags=["Deploy"])
app.include_router(comments.router, prefix="/api/comments", tags=["Comments"])
