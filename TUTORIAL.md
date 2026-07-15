# Xinghui Blog 前后端一体使用教程

这份教程从本地启动开始，说明如何配置主站、管理后台、FastAPI 服务和服务器发布链路。示例中的域名、IP、用户名都必须替换成你自己的值。

## 1. 理解三个运行进程

项目不是单一网页，而是三个互相协作的进程：

1. `apps/web`：端口 3000，对访客开放，渲染文章、相册、音乐和项目等页面。
2. `apps/admin`：端口 3001，只给站长使用，提供编辑器和设置界面。
3. `apps/admin/cms_core`：端口 58643，负责读写 Markdown、图片、配置和触发构建。

本地开发时，管理前端通过 Next.js rewrite 把 `/cms-api/*` 转发到 FastAPI。生产环境中由 Nginx 完成相同转发。

## 2. 安装并启动

```bash
npm ci --prefix apps/web
npm ci --prefix apps/admin

python -m venv .venv
source .venv/bin/activate
pip install -r apps/admin/requirements-server.txt
```

随后分别启动 FastAPI、管理前端和主站。命令见 README 的“快速开始”。如果管理端显示“后端连接异常”，先访问 `http://127.0.0.1:58643/api/status`，确认返回 `online`。

## 3. 配置站点资料

模板默认值位于两个文件：

- `apps/web/siteConfig.ts`
- `apps/admin/siteConfig.ts`

首次启动后建议直接使用管理端 `/settings` 修改资料。两个文件必须保持共享字段一致，否则管理端预览和主站会出现差异。

需要替换的内容包括：

- 标题、作者名、简介和社交链接；
- `public/avatar.svg`、`public/placeholder.svg` 和 `public/pet.svg`；
- 背景模式、弹幕、页脚和备案信息；
- 自有账号评论、图床、AI 和音乐设置。

不要把 DeepSeek Key、图床 Token、GitHub 私钥或音乐 Cookie 写入 `siteConfig.ts`。

## 4. 写文章与杂谈

内容目录：

```text
apps/web/posts/       # 正式文章
apps/web/chatters/    # 杂谈
apps/web/moments/     # 说说
```

管理端会在自己的同名目录中编辑，然后通过同步/发布流程写入主站工作区。Markdown 头部示例：

```md
---
title: My first post
date: '2026-01-01'
tags: [Next.js, Blog]
cover: /placeholder.svg
description: A short summary.
---

# Hello

Article body.
```

草稿通过 FastAPI 保存；点击发布时，前端只是把操作加入队列，真正落盘和构建由后端完成。

## 5. 配置 DeepSeek

1. 在管理端进入“AI 助手”。
2. API 地址保持 `https://api.deepseek.com`，按需填写模型名。
3. Key 使用独立的“保存密钥”按钮提交。
4. 后端把 Key 写入 `DEEPSEEK_KEY_FILE` 指向的服务器文件。

生产环境建议：

```bash
sudo install -d -m 700 -o blog -g blog /srv/xinghui-blog-admin/secrets
sudo install -m 600 -o blog -g blog /dev/null /srv/xinghui-blog-admin/secrets/deepseek-api-key
```

把 Key 写入该文件后，不要提交该文件，也不要让 Next.js 客户端读取它。

## 6. 配置自有账号评论

评论不依赖 GitHub Issue。FastAPI 使用 SQLite 保存站点账号、会话和评论；访客可以用用户名、邮箱和密码注册。密码通过 scrypt 强哈希保存，会话 Cookie 为 HttpOnly，并对写操作执行 CSRF 校验和频率限制。

生产环境至少设置：

```bash
XINGHUI_BLOG_COMMENT_DB=/var/lib/xinghui-blog-admin/comments.sqlite3
XINGHUI_BLOG_COMMENT_OAUTH_CONFIG=/var/lib/xinghui-blog-admin/comments-oauth.json
COMMENT_COOKIE_DOMAIN=example.com
COMMENT_ALLOWED_HOSTS=blog.example.com,admin.example.com
```

GitHub 是可选的推荐快捷登录方式。在 GitHub 创建 OAuth App，将回调地址设为 `https://blog.example.com/api/comments/auth/github/callback`，再到管理后台“评论系统配置”填写 Client ID、Client Secret 和博主 GitHub 用户名。Secret 只写入服务器 600 权限私有文件，不进入 `siteConfig.ts` 或 Git。

## 7. 访问量为什么不会一次刷新加两次

主页加载时会生成一个只在当前文档生命周期存在的随机 `pageViewId`。如果 React 初始化阶段重复挂载组件，两次请求携带相同 ID，服务端只增加一次；浏览器真正刷新后会生成新 ID，因此刷新仍增加一次。ID 会哈希后短期保存，不包含 IP、账号或设备标识。

## 8. 音乐链路

主站只调用自己的 `/api/music`、`/api/music/stream` 和 `/api/music/lyric`。这些 Next.js Route Handler 再代理到 FastAPI，浏览器不会直接获得后台 Cookie。

可选的 QQ 登录助手源码位于 `apps/admin/tools/qq-login-helper`。使用前把配对地址改成自己的管理域名并重新打包。登录凭据只应保存在服务器私有目录；不要上传 Cookie，也不要用该功能绕过平台授权或向第三方共享会员能力。

## 9. 从管理端直接发布

服务器发布流程是：

1. FastAPI 获取文件锁并把状态改为 `preparing`。
2. 将工作区复制到隔离构建目录。
3. 仅在依赖锁文件变化时执行 `npm ci`。
4. 执行 `next build`。
5. 在临时端口启动新版本并健康检查。
6. 原子切换 `current` 软链接并重启 systemd 服务。
7. 失败时继续使用旧版本并解除构建锁。

管理页面通过 SSE 读取构建状态；后端中间件在构建期间拒绝写操作，因此即使浏览器刷新，也不会破坏正在构建的文件。

## 10. GitHub 的正确用途

服务器本地发布不依赖 GitHub。GitHub 更适合作为模板、代码审查和私有备份：

- 公开仓库只放本模板和示例数据；
- 个性化文章、真实域名和密钥使用私有仓库或服务器快照；
- 发布前运行 `docs/SECURITY.md` 中的扫描命令。

## 11. 上线前检查

```bash
npm run build:web
npm run build:admin
python -m compileall -q apps/admin/cms_core
git grep -n -E '(sk-[A-Za-z0-9_-]{10,}|BEGIN (RSA|OPENSSH) PRIVATE KEY|Cookie:)'
```

最后确认主站能打开、管理端受到认证保护、`/cms-api/config/deepseek-key/status` 不返回 Key 本身、构建失败能回滚，然后再开放域名。
