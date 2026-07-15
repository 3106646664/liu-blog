"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Database, GitBranch, Save, ShieldCheck, UserRoundPlus } from "lucide-react";

export default function CommentSection(_props: Record<string, unknown>) {
  const [githubEnabled, setGithubEnabled] = useState<boolean | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("https://blog.example.com/api/comments/auth/github/callback");
  const [adminLogins, setAdminLogins] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/comments/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setGithubEnabled(Boolean(data.githubEnabled)))
      .catch(() => setGithubEnabled(false));
    fetch("/cms-api/config/comment-oauth", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!data.success) return;
        setClientId(data.clientId || "");
        setCallbackUrl(data.callbackUrl || "https://blog.example.com/api/comments/auth/github/callback");
        setAdminLogins((data.adminGithubLogins || []).join(", "));
        setGithubEnabled(Boolean(data.configured));
      })
      .catch(() => undefined);
  }, []);

  async function saveGithubOAuth() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/cms-api/config/comment-oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret, callbackUrl, adminGithubLogins: adminLogins }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "保存失败");
      setGithubEnabled(true);
      setClientSecret("");
      setMessage(data.message);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const cards = [
    { icon: UserRoundPlus, title: "站点账号", text: "访客可使用用户名、邮箱和密码直接注册，无需拥有第三方账号。" },
    { icon: GitBranch, title: "GitHub 快捷登录", text: githubEnabled ? "已配置并作为推荐登录方式显示。" : "尚未配置，站点账号注册和评论不受影响。" },
    { icon: Database, title: "评论数据", text: "账号、会话与评论集中保存在服务器 SQLite 数据库，不再依赖 GitHub Issue。" },
    { icon: ShieldCheck, title: "安全策略", text: "密码使用 scrypt 强哈希；会话使用 HttpOnly Cookie、CSRF 校验与频率限制。" },
  ];

  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
      <div className="rounded-[40px] border border-white/50 bg-white/40 p-8 shadow-xl backdrop-blur-xl dark:border-slate-800/50 dark:bg-slate-900/40">
        <div className="mb-8 border-b border-white/30 pb-6 dark:border-slate-700/50">
          <h2 className="flex items-center gap-2 text-2xl font-black text-slate-800 dark:text-white"><span>💬</span> 自有账号与评论系统</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">GitHub 是推荐快捷登录方式，但没有 GitHub 的访客也能注册和评论。</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {cards.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-3xl border border-white/50 bg-white/45 p-5 dark:border-slate-700/50 dark:bg-slate-800/40">
              <div className="mb-3 flex items-center gap-3"><span className="rounded-xl bg-indigo-500/10 p-2 text-indigo-500"><Icon size={20} /></span><h3 className="font-black text-slate-700 dark:text-slate-200">{title}</h3>{title === "GitHub 快捷登录" && githubEnabled && <CheckCircle2 size={16} className="text-emerald-500" />}</div>
              <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-2xl bg-indigo-500/10 px-5 py-4 text-sm leading-6 text-indigo-700 dark:text-indigo-300">
          GitHub OAuth 密钥仅保存在服务器私有配置中，不再写入站点源码或浏览器端配置。回调地址为 <code className="break-all font-mono">{callbackUrl}</code>。
        </div>
        <div className="mt-6 rounded-3xl border border-white/50 bg-white/45 p-5 dark:border-slate-700/50 dark:bg-slate-800/40">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-black text-slate-700 dark:text-slate-200">GitHub OAuth 配置</h3><p className="mt-1 text-xs text-slate-400">在 GitHub OAuth App 中使用上面的回调地址；Secret 已保存过时可留空。</p></div><button type="button" onClick={saveGithubOAuth} disabled={saving} className="flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50"><Save size={15} />{saving ? "保存中…" : "安全保存"}</button></div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="GitHub Client ID" autoComplete="off" className="rounded-xl border border-white/60 bg-white/60 px-4 py-3 text-sm font-mono outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white" />
            <input value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={githubEnabled ? "Client Secret（留空保持不变）" : "GitHub Client Secret"} type="password" autoComplete="new-password" className="rounded-xl border border-white/60 bg-white/60 px-4 py-3 text-sm font-mono outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white" />
          </div>
          <input value={callbackUrl} onChange={(event) => setCallbackUrl(event.target.value)} placeholder="https://blog.example.com/api/comments/auth/github/callback" className="mt-4 w-full rounded-xl border border-white/60 bg-white/60 px-4 py-3 text-sm font-mono outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white" />
          <input value={adminLogins} onChange={(event) => setAdminLogins(event.target.value)} placeholder="博主 GitHub 用户名，多个用英文逗号分隔" className="mt-4 w-full rounded-xl border border-white/60 bg-white/60 px-4 py-3 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white" />
          {message && <p className={`mt-3 text-sm font-bold ${githubEnabled ? "text-emerald-500" : "text-rose-500"}`}>{message}</p>}
        </div>
      </div>
    </motion.section>
  );
}
