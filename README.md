# Xinghui Blog CMS

一个前后端一体的个人博客模板：访客侧使用 Next.js，管理侧使用 Next.js + FastAPI，支持文章与杂谈编辑、相册、友链、项目、说说、背景、音乐、AI 助手，以及服务器本地原子发布。

本仓库是去个性化模板，不包含真实文章、头像、域名、服务器地址、账号、Cookie 或 API Key。首次使用时请从管理后台填写自己的内容。

> 项目基于 [XinghuisamaBlogs](https://github.com/heiehiehi/XinghuisamaBlogs) 修改，遵循 CC BY-NC 4.0，仅限非商业用途。

## 目录结构

```text
liu-blog/
├─ apps/
│  ├─ web/                  # 对外主站，Next.js App Router
│  └─ admin/                # 管理前端 + FastAPI CMS 后端
│     ├─ cms_core/          # 草稿、配置、图库、发布、音乐等 API
│     ├─ ops/               # systemd、Nginx、原子发布脚本
│     └─ tools/             # 可选的 QQ 音乐登录助手源码
├─ docs/
│  ├─ ARCHITECTURE.md       # 前后端设计与数据流
│  ├─ DEPLOYMENT.md         # 本地开发和服务器部署教程
│  └─ SECURITY.md           # 密钥、隐私和公开前检查
├─ .env.example
└─ TUTORIAL.md              # 从零配置到发布的完整教程
```

## 功能概览

- 主站：首页、项目、归档、照片墙、音乐、说说、杂谈、友链、关于、文章详情。
- 管理端：草稿箱、富文本编辑器、站点设置、项目/相册/友链管理、发布队列。
- 内容存储：Markdown + TypeScript 数据文件，便于版本管理和迁移。
- 发布：服务器工作区构建、隔离端口健康检查、软链接原子切换、失败回滚。
- 构建锁：构建期间后端统一返回 `423 Locked`，前端通过 SSE 显示进度。
- AI：DeepSeek 兼容接口，Key 只存服务器私密文件，不进入 `siteConfig.ts`。
- 访问量：按页面加载统计 PV；同一页面加载的重复初始化请求会被幂等合并，真正刷新仍会 `+1`。
- 音乐：支持后台维护播放列表、歌词与受控播放代理；请遵守音乐平台服务条款。

## 快速开始

要求：Node.js 20.9+、npm 10+、Python 3.11+。

```bash
git clone https://github.com/YOUR_GITHUB_NAME/liu-blog.git
cd liu-blog

npm run setup:web
npm run setup:admin

python -m venv .venv
# Linux/macOS
source .venv/bin/activate
# Windows PowerShell
# .\.venv\Scripts\Activate.ps1
pip install -r apps/admin/requirements-server.txt
```

打开三个终端：

```bash
# 终端 1：CMS API
cd apps/admin
python -m uvicorn cms_core.main:app --host 127.0.0.1 --port 58643 --reload

# 终端 2：管理前端
npm run dev:admin

# 终端 3：主站
npm run dev:web
```

- 主站：<http://localhost:3000>
- 管理端：<http://localhost:3001>
- API 文档：<http://127.0.0.1:58643/docs>

下一步请阅读 [TUTORIAL.md](TUTORIAL.md)。架构细节见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，生产部署见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 构建检查

```bash
npm run build:web
npm run build:admin
python -m compileall -q apps/admin/cms_core
```

## 许可证与署名

本仓库保留上游项目署名，并使用 CC BY-NC 4.0。详情见 [LICENSE](LICENSE)。
