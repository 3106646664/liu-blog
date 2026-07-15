# 安全与去个性化检查

## 永远不要提交

- DeepSeek、图床或其他 API Key；
- QQ 音乐 Cookie、账号票据或缓存；
- SSH 私钥、服务器密码和 Basic Auth 密码文件；
- 真实服务器 IP、管理域名和本机绝对路径；
- 私人文章、照片、联系方式和备案号；
- `.next`、日志、运行状态和构建产物。

## 推荐存储方式

| 数据 | 存放位置 | 权限 |
| --- | --- | --- |
| DeepSeek Key | `/srv/xinghui-blog-admin/secrets/deepseek-api-key` | 600 |
| 音乐 Cookie | 独立服务器私密文件 | 600 |
| SSH 私钥 | 管理员主机或 Secret Manager | 600 |
| 部署状态 | `/var/lib/xinghui-blog-admin/` | 仅服务用户可写 |
| 公开站点设置 | `siteConfig.ts` | 可以提交，但不得含密钥 |

## 推送前扫描

```bash
git grep -n -E 'sk-[A-Za-z0-9_-]{10,}'
git grep -n -E 'BEGIN (RSA|OPENSSH|EC) PRIVATE KEY'
git grep -n -E '(Cookie:|qm_keyst=|qqmusic_key=|p_skey=)'
git grep -n -E '([0-9]{1,3}\.){3}[0-9]{1,3}'
git grep -n -E 'C:\\Users\\|/Users/[^/]+/'
```

IP 扫描会命中 RFC 5737 示例地址 `203.0.113.10`，这是文档占位符。除此之外的结果都应逐项检查。

## 已内置的保护

- DeepSeek Key 使用独立 API 写入服务器文件。
- Key 状态接口只返回 `configured: true/false`。
- 后端阻止把当前 DeepSeek Key 写入图床 Token 或 Gitalk Secret。
- 管理端密钥输入框关闭交叉自动填充。
- 构建期间后端拒绝写请求。
- 访问量 page-view ID 是随机值并在服务端哈希，不记录 IP 或账号。

如果某个 Key 曾进入 Git 历史或前端构建，即使后来删除，也应立即到供应商控制台轮换该 Key。
