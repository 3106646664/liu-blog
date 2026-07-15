"use client";

import { useEffect, useState } from "react";
import { Loader2, LockKeyhole, CheckCircle2, CircleAlert } from "lucide-react";

type DeployState = {
  state: string;
  message: string;
  progress: number;
  busy: boolean;
  startedAt?: string;
  finishedAt?: string;
  release?: string;
};

const initialState: DeployState = {
  state: "idle",
  message: "主站当前可以发布",
  progress: 0,
  busy: false,
};

export default function DeployStatusOverlay() {
  const [status, setStatus] = useState<DeployState>(initialState);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    let previousState = "idle";

    const applyStatus = (next: DeployState) => {
      setStatus(next);
      if (
        previousState !== next.state &&
        (next.state === "success" || next.state === "failed")
      ) {
        setShowResult(true);
        window.setTimeout(() => setShowResult(false), 8000);
      }
      previousState = next.state;
    };

    fetch("/cms-api/deploy/status", { cache: "no-store" })
      .then((response) => response.json())
      .then(applyStatus)
      .catch(() => undefined);

    const events = new EventSource("/cms-api/deploy/events");
    events.addEventListener("deploy", (event) => {
      try {
        applyStatus(JSON.parse((event as MessageEvent).data));
      } catch {
        // Keep the last valid state if a partial event is received.
      }
    });

    return () => events.close();
  }, []);

  if (!status.busy && !showResult) return null;

  if (!status.busy) {
    const failed = status.state === "failed";
    return (
      <div className="fixed bottom-6 right-6 z-[400] w-[min(92vw,380px)] rounded-2xl border border-white/20 bg-slate-950/95 p-5 text-white shadow-2xl backdrop-blur-xl">
        <div className="flex items-start gap-3">
          {failed ? (
            <CircleAlert className="mt-0.5 text-red-400" />
          ) : (
            <CheckCircle2 className="mt-0.5 text-emerald-400" />
          )}
          <div>
            <p className="font-black">{failed ? "主站发布失败" : "主站发布完成"}</p>
            <p className="mt-1 text-sm text-slate-300">{status.message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-md">
      <div className="w-full max-w-md rounded-[32px] border border-white/15 bg-slate-950/95 p-8 text-white shadow-2xl">
        <div className="mb-5 flex items-center gap-4">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15">
            <LockKeyhole className="text-indigo-300" />
            <Loader2 className="absolute h-14 w-14 animate-spin text-indigo-500/40" />
          </div>
          <div>
            <p className="text-lg font-black">服务器正在构建</p>
            <p className="text-xs text-slate-400">构建完成前，后台修改已全局锁定</p>
          </div>
        </div>
        <p className="min-h-10 text-sm leading-6 text-slate-200">{status.message}</p>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-500"
            style={{ width: `${Math.max(4, Math.min(status.progress || 0, 100))}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <span>{status.state}</span>
          <span>{status.progress || 0}%</span>
        </div>
      </div>
    </div>
  );
}
