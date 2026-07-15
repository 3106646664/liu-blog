"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useToast } from "../ToastProvider";

type MusicKind = "track" | "playlist";
type SearchTab = MusicKind | "account";

type MusicItem = {
  kind?: MusicKind;
  id: string;
  name: string;
  artist?: string;
  creator?: string;
  cover?: string;
  duration?: number;
  track_count?: number;
};

type LoginStatus = {
  logged_in: boolean;
  playback_ready: boolean;
  nickname?: string;
  avatar?: string;
  uin?: string;
};

type PairSession = {
  pair_id: string;
  token: string;
  endpoint: string;
  status: "waiting" | "completed" | "expired" | "cancelled";
  expires_at: number;
  message?: string;
};

const itemKey = (item: MusicItem) => `${item.kind}:${item.id}`;

function formatDuration(seconds = 0) {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.max(0, seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

async function readJson(response: Response) {
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload.detail || payload.message || "请求失败");
  }
  return payload;
}

export default function MusicSection() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<SearchTab>("track");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MusicItem[]>([]);
  const [accountPlaylists, setAccountPlaylists] = useState<MusicItem[]>([]);
  const [library, setLibrary] = useState<MusicItem[]>([]);
  const [login, setLogin] = useState<LoginStatus>({ logged_in: false, playback_ready: false });
  const [pair, setPair] = useState<PairSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState("");

  const loadLibrary = useCallback(async () => {
    const payload = await readJson(await fetch("/cms-api/music/library", { cache: "no-store" }));
    setLibrary(payload.items || []);
  }, []);

  const loadAccountPlaylists = useCallback(async () => {
    const payload = await readJson(await fetch("/cms-api/music/account/playlists", { cache: "no-store" }));
    setAccountPlaylists((payload.data || []).map((item: MusicItem) => ({ ...item, kind: "playlist" })));
  }, []);

  const loadLogin = useCallback(async () => {
    const payload = await readJson(await fetch("/cms-api/music/login/status", { cache: "no-store" }));
    setLogin(payload);
    if (payload.logged_in) await loadAccountPlaylists();
    return payload as LoginStatus;
  }, [loadAccountPlaylists]);

  useEffect(() => {
    Promise.all([loadLibrary(), loadLogin()]).catch((error) => {
      showToast(`读取 QQ 音乐配置失败：${String(error)}`, "error");
    });
  }, [loadLibrary, loadLogin, showToast]);

  useEffect(() => {
    if (!pair || pair.status !== "waiting") return;
    const timer = window.setInterval(async () => {
      try {
        const payload = await readJson(await fetch(
          `/cms-api/music/login/pair/${encodeURIComponent(pair.pair_id)}`,
          { cache: "no-store" },
        ));
        setPair((current) => current ? { ...current, status: payload.status, message: payload.message } : current);
        if (payload.status === "completed") {
          window.clearInterval(timer);
          const account = await loadLogin();
          showToast(
            account.playback_ready ? "QQ 音乐登录成功，会员播放权限已就绪" : "会话已同步，但播放票据校验异常",
            account.playback_ready ? "success" : "warning",
          );
        } else if (payload.status === "expired" || payload.status === "cancelled") {
          window.clearInterval(timer);
          showToast(payload.message || "配对未完成，请重新生成配对码", "error");
        }
      } catch (error) {
        window.clearInterval(timer);
        showToast(`读取配对状态失败：${String(error)}`, "error");
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [pair, loadLogin, showToast]);

  const startLogin = async () => {
    setLoading(true);
    try {
      const payload = await readJson(await fetch("/cms-api/music/login/pair/start", { method: "POST" }));
      setPair(payload as PairSession);
    } catch (error) {
      showToast(`生成配对码失败：${String(error)}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const copyPairToken = async () => {
    if (!pair?.token) return;
    await navigator.clipboard.writeText(pair.token);
    showToast("配对码已复制，请粘贴到 Windows 登录助手", "success");
  };

  const logout = async () => {
    await readJson(await fetch("/cms-api/music/logout", { method: "POST" }));
    setLogin({ logged_in: false, playback_ready: false });
    setAccountPlaylists([]);
    setPair(null);
    showToast("QQ 音乐账号已退出", "success");
  };

  const search = async () => {
    const keyword = query.trim();
    if (!keyword || tab === "account") {
      showToast("请输入歌名、歌手或歌单名称", "warning");
      return;
    }
    setLoading(true);
    setResults([]);
    try {
      const payload = await readJson(await fetch(
        `/cms-api/music/search?query=${encodeURIComponent(keyword)}&kind=${tab}&limit=12`,
        { cache: "no-store" },
      ));
      setResults((payload.data || []).map((item: MusicItem) => ({ ...item, kind: tab })));
      if (!payload.data?.length) showToast("没有搜索到匹配内容", "info");
    } catch (error) {
      showToast(`搜索失败：${String(error)}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const addItem = async (item: MusicItem) => {
    const kind = item.kind || (tab === "track" ? "track" : "playlist");
    const key = `${kind}:${item.id}`;
    setSavingKey(key);
    try {
      const payload = await readJson(await fetch("/cms-api/music/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...item, kind }),
      }));
      setLibrary(payload.items || []);
      showToast(payload.message || "已加入主站播放列表", "success");
    } catch (error) {
      showToast(`添加失败：${String(error)}`, "error");
    } finally {
      setSavingKey("");
    }
  };

  const removeItem = async (item: MusicItem) => {
    const key = itemKey(item);
    setSavingKey(key);
    try {
      const payload = await readJson(await fetch(
        `/cms-api/music/library/${item.kind}/${encodeURIComponent(item.id)}`,
        { method: "DELETE" },
      ));
      setLibrary(payload.items || []);
      showToast("已从主站播放列表移除", "success");
    } catch (error) {
      showToast(`移除失败：${String(error)}`, "error");
    } finally {
      setSavingKey("");
    }
  };

  const moveItem = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= library.length) return;
    const next = [...library];
    [next[index], next[target]] = [next[target], next[index]];
    setLibrary(next);
    try {
      await readJson(await fetch("/cms-api/music/library/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: next.map(itemKey) }),
      }));
    } catch (error) {
      await loadLibrary();
      showToast(`排序失败：${String(error)}`, "error");
    }
  };

  const visibleResults = tab === "account" ? accountPlaylists : results;
  const isAdded = (item: MusicItem) => library.some((current) => current.kind === item.kind && current.id === item.id);

  return (
    <motion.section initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-white/50 dark:border-slate-800/50 rounded-[40px] p-6 md:p-8 shadow-2xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-black text-slate-800 dark:text-white">🎵 QQ 音乐管理</h2>
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 text-[10px] font-black">搜索与账号仅后台可见</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-6">主站只读取最终播放列表并提供歌词、暂停和上下曲，不公开搜索入口或账号凭据。</p>
        </div>
        {login.logged_in ? (
          <div className="flex items-center gap-3 rounded-2xl bg-white/55 dark:bg-slate-800/60 px-4 py-3">
            {login.avatar && <img src={login.avatar} alt="QQ avatar" className="w-9 h-9 rounded-full" />}
            <div>
              <p className="text-xs font-black text-slate-800 dark:text-white">{login.nickname}</p>
              <p className={`text-[10px] ${login.playback_ready ? "text-emerald-500" : "text-amber-500"}`}>{login.playback_ready ? "会员播放权限已就绪" : "仅账号状态，需要重新配对播放权限"}</p>
            </div>
            <button onClick={startLogin} disabled={loading} className="text-[10px] font-bold text-indigo-500 px-2 py-1">重新配对</button>
            <button onClick={logout} className="text-[10px] font-bold text-red-500 px-2 py-1">退出</button>
          </div>
        ) : (
          <button onClick={startLogin} disabled={loading} className="px-4 py-2.5 bg-indigo-500 text-white rounded-xl text-xs font-black disabled:opacity-50">{loading ? "正在生成…" : "使用 Windows 助手登录"}</button>
        )}
      </div>

      {pair && pair.status !== "completed" && (
        <div className="mb-7 rounded-3xl border border-indigo-500/20 bg-indigo-500/5 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-800 dark:text-white">在 Windows 登录助手中完成 QQ 官方登录</p>
              <p className="text-xs text-slate-500 mt-2">下载并打开助手，复制下方一次性配对码。配对码 10 分钟内有效且只能使用一次。</p>
            </div>
            <a href="/downloads/LIU-Blog-QQ-Login-Helper.exe" className="px-4 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-black">下载登录助手</a>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input readOnly value={pair.token} className="min-w-0 flex-1 rounded-2xl bg-white dark:bg-slate-900 px-4 py-3 font-mono text-xs outline-none" />
            <button onClick={copyPairToken} className="px-5 py-3 rounded-2xl bg-indigo-500 text-white text-xs font-black">复制配对码</button>
          </div>
          <p className={`text-xs ${pair.status === "waiting" ? "text-indigo-500" : "text-red-500"}`}>{pair.status === "waiting" ? "等待登录助手连接…" : pair.message || "配对码已失效，请重新生成"}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="space-y-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">主站播放内容（我喜欢 + {library.length} 项自定义）</p>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center">♥</div>
            <div><p className="text-sm font-black text-slate-800 dark:text-white">QQ 音乐 · 我喜欢</p><p className="text-[10px] text-emerald-500 mt-1">默认歌单，登录后自动同步</p></div>
          </div>
          <div className="max-h-[520px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
            {library.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-400">当前没有额外内容，可从右侧添加单曲或歌单。</div>}
            {library.map((item, index) => (
              <div key={itemKey(item)} className="flex items-center gap-3 p-3 bg-white/45 dark:bg-slate-800/45 rounded-2xl border border-white/30 dark:border-slate-700/40">
                {item.cover ? <img src={item.cover} alt="cover" className="w-12 h-12 rounded-xl object-cover" /> : <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center">♫</div>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-indigo-500/10 text-indigo-500">{item.kind === "playlist" ? "歌单" : "单曲"}</span><p className="text-sm font-bold text-slate-800 dark:text-white truncate">{item.name}</p></div>
                  <p className="text-[10px] text-slate-500 mt-1 truncate">{item.kind === "playlist" ? `${item.creator || "QQ 音乐"} · ${item.track_count || 0} 首` : `${item.artist || "未知歌手"} · ${formatDuration(item.duration)}`}</p>
                </div>
                <div className="flex gap-1"><button onClick={() => moveItem(index, -1)} disabled={index === 0} className="w-7 h-7 rounded-lg bg-slate-500/10 disabled:opacity-20">↑</button><button onClick={() => moveItem(index, 1)} disabled={index === library.length - 1} className="w-7 h-7 rounded-lg bg-slate-500/10 disabled:opacity-20">↓</button><button onClick={() => removeItem(item)} disabled={savingKey === itemKey(item)} className="w-7 h-7 rounded-lg bg-red-500/10 text-red-500">×</button></div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-100/55 dark:bg-slate-800/55 rounded-3xl p-5 md:p-6 space-y-5">
          <div className="grid grid-cols-3 gap-2 p-1 bg-white/60 dark:bg-slate-900/50 rounded-2xl">
            {([["track", "搜索单曲"], ["playlist", "搜索歌单"], ["account", "我的歌单"]] as [SearchTab, string][]).map(([value, label]) => <button key={value} onClick={() => { setTab(value); setResults([]); }} className={`py-2.5 rounded-xl text-xs font-black ${tab === value ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" : "text-slate-500"}`}>{label}</button>)}
          </div>
          {tab !== "account" ? <div className="flex gap-2"><input type="search" placeholder={tab === "track" ? "输入歌名或歌手" : "输入歌单名称"} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") search(); }} className="min-w-0 flex-1 bg-white dark:bg-slate-900 rounded-2xl px-4 py-3 text-sm outline-none" /><button onClick={search} disabled={loading} className="px-5 py-3 bg-indigo-500 text-white rounded-2xl text-xs font-black disabled:opacity-50">{loading ? "搜索中…" : "搜索"}</button></div> : <p className="text-xs text-slate-500">{login.logged_in ? "这里显示登录账号创建和收藏的歌单。" : "请先使用 Windows 登录助手登录 QQ 音乐。"}</p>}
          <div className="max-h-[430px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
            {!loading && visibleResults.length === 0 && <div className="py-14 text-center text-xs text-slate-400">{tab === "account" && !login.logged_in ? "登录后显示账号歌单" : "结果会显示在这里"}</div>}
            {visibleResults.map((item) => {
              const normalized = { ...item, kind: item.kind || (tab === "track" ? "track" as const : "playlist" as const) };
              const added = isAdded(normalized);
              const key = itemKey(normalized);
              return <div key={key} className="flex items-center gap-3 p-3 bg-white/70 dark:bg-slate-900/65 rounded-2xl">{item.cover ? <img src={item.cover} alt="cover" className="w-11 h-11 rounded-xl object-cover" /> : <div className="w-11 h-11 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center">♫</div>}<div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-800 dark:text-white truncate">{item.name}</p><p className="text-[10px] text-slate-500 mt-1 truncate">{normalized.kind === "track" ? `${item.artist || "未知歌手"} · ${formatDuration(item.duration)}` : `${item.creator || "QQ 音乐"} · ${item.track_count || 0} 首`}</p></div><button onClick={() => addItem(normalized)} disabled={added || savingKey === key || item.id === "profile:favorites"} className={`px-3 py-2 rounded-xl text-[10px] font-black ${added || item.id === "profile:favorites" ? "bg-emerald-500/10 text-emerald-500" : "bg-indigo-500 text-white"} disabled:opacity-60`}>{item.id === "profile:favorites" ? "默认启用" : added ? "已添加" : savingKey === key ? "添加中…" : "添加"}</button></div>;
            })}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
