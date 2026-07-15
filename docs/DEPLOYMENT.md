# Linux 生产部署教程

以下示例面向 Ubuntu/Debian，使用 Nginx、systemd、Node.js 20+ 和 Python 3.11+。请把 `example.com`、`admin.example.com` 和路径替换为自己的值。

## 1. 创建运行用户和目录

```bash
sudo useradd --system --create-home --shell /bin/bash blog
sudo install -d -o blog -g blog /srv/xinghui-blog/{workspace,build,releases,data}
sudo install -d -o blog -g blog /srv/xinghui-blog-admin/{source,secrets}
sudo install -d -o blog -g blog /var/lib/xinghui-blog-admin
```

把 `apps/web` 同步到 `/srv/xinghui-blog/workspace`，把 `apps/admin` 同步到 `/srv/xinghui-blog-admin/source`。

## 2. 安装依赖

```bash
sudo -u blog bash -lc 'cd /srv/xinghui-blog/workspace && npm ci'
sudo -u blog bash -lc 'cd /srv/xinghui-blog-admin/source && npm ci'

sudo -u blog python3 -m venv /srv/xinghui-blog-admin/venv
sudo -u blog /srv/xinghui-blog-admin/venv/bin/pip install \
  -r /srv/xinghui-blog-admin/source/requirements-server.txt
```

## 3. 配置私密环境

```bash
sudo install -m 600 -o blog -g blog /dev/null \
  /srv/xinghui-blog-admin/secrets/deepseek-api-key
sudoedit /etc/xinghui-blog.env
```

`/etc/xinghui-blog.env` 示例：

```dotenv
DEEPSEEK_KEY_FILE=/srv/xinghui-blog-admin/secrets/deepseek-api-key
XINGHUI_BLOG_ADMIN_API_URL=http://127.0.0.1:58643
XINGHUI_BLOG_ALLOWED_ORIGINS=https://admin.example.com
XINGHUI_BLOG_DEPLOY_STATE=/var/lib/xinghui-blog-admin/deploy-state.json
XINGHUI_BLOG_PUBLISH_SERVICE=xinghui-blog-publish.service
XINGHUI_BLOG_MUSIC_PAIR_ENDPOINT=https://admin.example.com/music-pair/complete
```

环境文件权限建议为 `root:root 600`。

## 4. 安装运维脚本

`apps/admin/ops` 提供参考模板。安装前先全文替换域名和路径，再执行：

```bash
sudo install -m 755 apps/admin/ops/liu-blog-state /usr/local/libexec/xinghui-blog-state
sudo install -m 755 apps/admin/ops/liu-blog-build-local /usr/local/libexec/xinghui-blog-build-local
sudo install -m 755 apps/admin/ops/liu-blog-publish /usr/local/sbin/xinghui-blog-publish

sudo install -m 644 apps/admin/ops/liu-blog-admin-api.service /etc/systemd/system/xinghui-blog-admin-api.service
sudo install -m 644 apps/admin/ops/liu-blog-admin-web.service /etc/systemd/system/xinghui-blog-admin-web.service
sudo install -m 644 apps/admin/ops/liu-blog-publish.service /etc/systemd/system/xinghui-blog-publish.service
```

检查每个 service 的 `WorkingDirectory`、`ExecStart` 和 `EnvironmentFile` 与实际目录一致，然后：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now xinghui-blog-admin-api.service
sudo systemctl enable --now xinghui-blog-admin-web.service
sudo systemctl start xinghui-blog-publish.service
```

主站 service 需要从 `/srv/xinghui-blog/current/runtime/server.js` 启动；第一次发布成功后再启用。

## 5. 配置 Nginx 和 HTTPS

1. 主域名代理到 `127.0.0.1:3000`。
2. 管理子域名代理到 `127.0.0.1:3001`。
3. 管理域名的 `/cms-api/` 代理到 `127.0.0.1:58643/api/`。
4. 管理域名启用 Basic Auth 或更强的身份代理。
5. 只给一次性音乐配对完成端点配置必要的公开 location。

参考文件：

- `apps/admin/ops/liu-blog-admin-http.nginx.conf`
- `apps/admin/ops/liu-blog-admin.nginx.conf`

使用 Certbot 申请证书后执行 `sudo nginx -t && sudo systemctl reload nginx`。

## 6. 验证

```bash
curl -f http://127.0.0.1:58643/api/status
curl -f http://127.0.0.1:3001/settings
curl -f http://127.0.0.1:3000/
systemctl is-active xinghui-blog-admin-api.service
systemctl is-active xinghui-blog-admin-web.service
```

再从管理端修改一项非敏感设置并发布，确认构建锁、SSE 进度、健康检查和原子切换全部正常。

## 7. 回滚

发布脚本会保留 release 目录。紧急情况下，将 `/srv/xinghui-blog/current` 重新指向上一个健康 release，再重启主站服务。不要直接删除当前 release；先用 `readlink -f` 核对目标目录。
