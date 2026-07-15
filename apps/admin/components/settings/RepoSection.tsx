"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ExternalLink, HardDrive, Loader2, Server } from "lucide-react";
import { useToast } from "../ToastProvider";

type DeployStatus = {
  state: string;
  message: string;
  progress: number;
  busy: boolean;
  release?: string;
};

export default function RepoSection() {
  const { showToast } = useToast();
  const [blogPath, setBlogPath] = useState("");
  const [status, setStatus] = useState<DeployStatus>({
    state: "idle",
    message: "正在读取服务器状态",
    progress: 0,
    busy: false,
  });
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/cms-api/deploy/config", { cache: "no-store" }).then((res) => res.json()),
      fetch("/cms-api/deploy/status", { cache: "no-store" }).then((res) => res.json()),
    ])
      .then(([config, deployStatus]) => {
        setBlogPath(config.blogPath || "");
        setStatus(deployStatus);
      })
      .catch(() => showToast("无法读取服务器部署配置", "error"));

    const events = new EventSource("/cms-api/deploy/events");
    events.addEventListener("deploy", (event) => {
      try {
        setStatus(JSON.parse((event as MessageEvent).data));
      } catch {
        // Ignore partial events and keep the last valid server state.
      }
    });
    return () => events.close();
  }, [showToast]);

  const checkWorkspace = async () => {
    setChecking(true);
    try {
      const response = await fetch("/cms-api/sync/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogPath }),
      });
      const result = await response.json();
      showToast(result.message, result.success ? "success" : "error");
    } catch {
      showToast("服务器工作区检查失败", "error");
    } finally {
      setChecking(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="relative z-10 rounded-[40px] border border-white/50 bg-white/40 p-8 shadow-2xl backdrop-blur-2xl dark:border-slate-800/50 dark:bg-slate-900/40"
    >
      <div className="mb-8 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-black text-slate-800 dark:text-white">
          <Server className="text-indigo-500" /> 服务器本地发布
        </h2>
        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${status.busy ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`}>
          {status.busy ? "构建锁定中" : "可以操作"}
        </span>
      </div>

      <div className="space-y-5">
        <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5 dark:border-slate-700/50 dark:bg-slate-800/30">
          <p className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase text-slate-500">
            <HardDrive size={14} /> 服务器工作区
          </p>
          <code className="break-all text-xs text-slate-700 dark:text-slate-200">{blogPath || "尚未配置"}</code>
        </div>

        <div className="rounded-3xl border border-indigo-500/15 bg-indigo-500/5 p-5">
          <div className="flex items-start gap-3">
            {status.busy ? (
              <Loader2 className="mt-0.5 animate-spin text-indigo-500" />
            ) : (
              <CheckCircle2 className="mt-0.5 text-emerald-500" />
            )}
            <div>
              <p className="font-black text-slate-800 dark:text-white">{status.state}</p>
              <p className="mt-1 text-sm text-slate-500">{status.message}</p>
              {status.release && <p className="mt-2 text-[11px] text-slate-400">当前版本：{status.release}</p>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={checkWorkspace}
            disabled={checking || status.busy}
            className="rounded-2xl bg-indigo-500 px-5 py-3 text-xs font-black text-white shadow-lg shadow-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checking ? "检查中..." : "检查服务器工作区"}
          </button>
          <button
            onClick={() => window.open("https://example.com", "_blank", "noopener,noreferrer")}
            className="flex items-center gap-2 rounded-2xl bg-slate-100 px-5 py-3 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <ExternalLink size={14} /> 查看主站
          </button>
        </div>

        <p className="text-xs leading-6 text-slate-400">
          后台已绕开 GitHub。每次发布都会在服务器本地保存一个版本快照，构建成功后原子切换主站；构建失败时继续保留上一个可用版本。
        </p>
      </div>
    </motion.section>
  );
}
