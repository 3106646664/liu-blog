"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type CommentUser = {
  id: string;
  username: string;
  avatarUrl: string | null;
  role: "user" | "admin";
  provider: "local" | "github";
};

type CommentItem = {
  id: string;
  parentId: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  author: CommentUser;
};

type ApiError = { detail?: string; message?: string };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init });
  const data = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) throw new Error(data.detail || data.message || "请求失败，请稍后重试");
  return data;
}

function Avatar({ user, small = false }: { user: CommentUser; small?: boolean }) {
  const size = small ? "h-7 w-7 text-xs" : "h-10 w-10 text-sm";
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt="" className={`${size} shrink-0 rounded-full object-cover ring-2 ring-white/40 dark:ring-slate-700/60`} />;
  }
  const hue = Array.from(user.username).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  return (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full font-black text-white`} style={{ background: `hsl(${hue} 62% 52%)` }}>
      {user.username.slice(0, 1).toUpperCase()}
    </span>
  );
}
export default function CommentSystem({ pageKey, compact = false }: { pageKey: string; compact?: boolean }) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [user, setUser] = useState<CommentUser | null>(null);
  const [csrf, setCsrf] = useState("");
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [account, setAccount] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [thread, me, status] = await Promise.all([
        requestJson<{ comments: CommentItem[] }>(`/api/comments/thread?page=${encodeURIComponent(pageKey)}`),
        requestJson<{ user: CommentUser | null; csrfToken: string | null }>("/api/comments/auth/me"),
        requestJson<{ githubEnabled: boolean }>("/api/comments/status"),
      ]);
      setComments(thread.comments);
      setUser(me.user);
      setCsrf(me.csrfToken || "");
      setGithubEnabled(status.githubEnabled);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "评论加载失败");
    } finally {
      setLoading(false);
    }
  }, [pageKey]);

  useEffect(() => void load(), [load]);

  const parentNames = useMemo(() => new Map(comments.map((item) => [item.id, item.author.username])), [comments]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const body = authMode === "login" ? { account, password } : { username, email, password };
      const result = await requestJson<{ user: CommentUser; csrfToken: string }>(`/api/comments/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setUser(result.user);
      setCsrf(result.csrfToken);
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败");
    } finally {
      setSending(false);
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    setError("");
    try {
      const result = await requestJson<{ comment: CommentItem }>("/api/comments/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ pageKey, content, parentId: replyTo?.id || null }),
      });
      setComments((current) => [...current, result.comment]);
      setContent("");
      setReplyTo(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "评论发布失败");
    } finally {
      setSending(false);
    }
  }

  async function logout() {
    setSending(true);
    try {
      await requestJson("/api/comments/auth/logout", { method: "POST", headers: { "X-CSRF-Token": csrf } });
      setUser(null);
      setCsrf("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "退出失败");
    } finally {
      setSending(false);
    }
  }

  async function removeComment(id: string) {
    if (!window.confirm("确定删除这条评论吗？")) return;
    try {
      await requestJson(`/api/comments/${id}`, { method: "DELETE", headers: { "X-CSRF-Token": csrf } });
      setComments((current) => current.map((item) => item.id === id ? { ...item, deleted: true, content: "该评论已删除" } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败");
    }
  }

  const githubLogin = () => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/api/comments/auth/github/start?returnTo=${encodeURIComponent(returnTo)}`);
  };

  return (
    <section className={`relative z-10 w-full ${compact ? "mt-2" : "mt-16 border-t border-white/30 pt-8 dark:border-slate-700/50"}`}>
      {!compact && <div className="pointer-events-none absolute -top-8 left-1/2 h-24 w-3/4 -translate-x-1/2 rounded-full bg-indigo-500/15 blur-3xl" />}
      <div className={`relative rounded-3xl border border-white/40 bg-white/20 shadow-xl backdrop-blur-xl dark:border-slate-700/50 dark:bg-slate-900/30 ${compact ? "p-3" : "p-5 md:p-7"}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className={`${compact ? "text-sm" : "text-xl"} font-black text-slate-800 dark:text-white`}>评论</h3>
            {!compact && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">站点账号与 GitHub 账号都可以参与讨论</p>}
          </div>
          <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-300">{comments.filter((item) => !item.deleted).length} 条</span>
        </div>

        {error && <div className="mb-4 rounded-xl border border-rose-300/50 bg-rose-50/70 px-4 py-2 text-sm text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

        {!user ? (
          <div className="mb-5 rounded-2xl border border-white/50 bg-white/35 p-4 dark:border-slate-700/50 dark:bg-slate-900/35">
            {githubEnabled && (
              <button type="button" onClick={githubLogin} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900">
                <span aria-hidden>◆</span> 使用 GitHub 登录 <span className="rounded bg-indigo-500 px-1.5 py-0.5 text-[10px] text-white">推荐</span>
              </button>
            )}
            <div className="mb-3 flex items-center gap-3 text-[11px] text-slate-400"><span className="h-px flex-1 bg-slate-300/60 dark:bg-slate-700" />没有 GitHub 账号？使用站点账号<span className="h-px flex-1 bg-slate-300/60 dark:bg-slate-700" /></div>
            <div className="mb-3 flex rounded-xl bg-slate-200/50 p-1 dark:bg-slate-800/70">
              {(["login", "register"] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => { setAuthMode(mode); setError(""); }} className={`flex-1 rounded-lg py-2 text-xs font-black transition ${authMode === mode ? "bg-white text-indigo-600 shadow dark:bg-slate-700 dark:text-indigo-300" : "text-slate-500"}`}>
                  {mode === "login" ? "登录" : "注册"}
                </button>
              ))}
            </div>
            <form onSubmit={submitAuth} className="grid gap-3">
              {authMode === "register" && (
                <>
                  <input value={username} onChange={(event) => setUsername(event.target.value)} required minLength={2} maxLength={24} autoComplete="username" placeholder="用户名（支持中文）" className="rounded-xl border border-white/60 bg-white/60 px-4 py-3 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800/70 dark:text-white" />
                  <input value={email} onChange={(event) => setEmail(event.target.value)} required type="email" autoComplete="email" placeholder="邮箱" className="rounded-xl border border-white/60 bg-white/60 px-4 py-3 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800/70 dark:text-white" />
                </>
              )}
              {authMode === "login" && <input value={account} onChange={(event) => setAccount(event.target.value)} required autoComplete="username" placeholder="用户名或邮箱" className="rounded-xl border border-white/60 bg-white/60 px-4 py-3 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800/70 dark:text-white" />}
              <input value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={128} type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} placeholder="密码（至少 8 位）" className="rounded-xl border border-white/60 bg-white/60 px-4 py-3 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800/70 dark:text-white" />
              <button disabled={sending} className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-black text-white transition hover:bg-indigo-600 disabled:opacity-50">{sending ? "处理中…" : authMode === "login" ? "登录并评论" : "创建账号"}</button>
            </form>
          </div>
        ) : (
          <form onSubmit={submitComment} className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Avatar user={user} small /><span className="text-sm font-bold text-slate-700 dark:text-slate-200">{user.username}</span>{user.provider === "github" && <span className="text-[10px] font-bold text-slate-400">GitHub</span>}</div>
              <button type="button" onClick={logout} disabled={sending} className="text-xs font-bold text-slate-400 hover:text-rose-500">退出</button>
            </div>
            {replyTo && <div className="mb-2 flex items-center justify-between rounded-lg bg-indigo-500/10 px-3 py-2 text-xs text-indigo-600 dark:text-indigo-300"><span>回复 @{replyTo.author.username}</span><button type="button" onClick={() => setReplyTo(null)}>取消</button></div>}
            <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} required rows={compact ? 2 : 4} placeholder="友善交流，分享你的想法…" className="w-full resize-y rounded-2xl border border-white/60 bg-white/50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white" />
            <div className="mt-2 flex items-center justify-between"><span className="text-[11px] text-slate-400">{content.length}/2000</span><button disabled={sending || !content.trim()} className="rounded-xl bg-indigo-500 px-5 py-2 text-sm font-black text-white shadow-lg shadow-indigo-500/20 transition hover:-translate-y-0.5 hover:bg-indigo-600 disabled:translate-y-0 disabled:opacity-50">{sending ? "发布中…" : "发布评论"}</button></div>
          </form>
        )}

        <div className="space-y-3">
          {loading ? <p className="py-6 text-center text-sm text-slate-400">正在加载评论…</p> : comments.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">还没有评论，来留下第一条吧。</p> : comments.map((item) => {
            const canDelete = user && (user.id === item.author.id || user.role === "admin");
            return (
              <article key={item.id} className={`rounded-2xl border border-white/40 bg-white/25 ${compact ? "p-3" : "p-4"} dark:border-slate-700/40 dark:bg-slate-900/25 ${item.parentId ? "ml-5 md:ml-10" : ""}`}>
                <div className="flex gap-3">
                  <Avatar user={item.author} small={compact} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black text-slate-700 dark:text-slate-200">{item.author.username}</span>{item.author.role === "admin" && <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-300">博主</span>}{item.author.provider === "github" && <span className="text-[10px] font-bold text-slate-400">GitHub</span>}<time className="text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString("zh-CN")}</time></div>
                    {item.parentId && <p className="mt-1 text-[11px] text-indigo-500">回复 @{parentNames.get(item.parentId) || "用户"}</p>}
                    <p className={`mt-1 whitespace-pre-wrap break-words ${compact ? "text-xs" : "text-sm"} leading-6 ${item.deleted ? "italic text-slate-400" : "text-slate-600 dark:text-slate-300"}`}>{item.content}</p>
                    {!item.deleted && user && <div className="mt-2 flex gap-3"><button type="button" onClick={() => { setReplyTo(item); setContent(""); }} className="text-[11px] font-bold text-indigo-500 hover:text-indigo-600">回复</button>{canDelete && <button type="button" onClick={() => removeComment(item.id)} className="text-[11px] font-bold text-slate-400 hover:text-rose-500">删除</button>}</div>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
