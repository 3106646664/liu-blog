"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { siteConfig } from "../siteConfig";

export default function Comments() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const owner = siteConfig.gitalkConfig.owner.trim();
  const repoName = siteConfig.gitalkConfig.repo.trim();
  const repo = owner && repoName ? `${owner}/${repoName}` : "";

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !repo) return;

    container.replaceChildren();
    const script = document.createElement("script");
    script.src = "https://utteranc.es/client.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.setAttribute("repo", repo);
    script.setAttribute("issue-term", "pathname");
    script.setAttribute("label", "comments");
    script.setAttribute("theme", "preferred-color-scheme");
    container.appendChild(script);

    return () => container.replaceChildren();
  }, [pathname, repo]);

  return (
    <section className="relative mt-16 w-full border-t border-white/30 pt-8">
      <div className="pointer-events-none absolute -top-8 left-1/2 h-28 w-3/4 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
      {repo ? (
        <div ref={containerRef} className="relative z-10 min-h-24" />
      ) : (
        <div className="relative z-10 rounded-2xl border border-white/30 bg-white/30 p-5 text-center text-sm text-slate-600 backdrop-blur-xl dark:bg-slate-900/30 dark:text-slate-300">
          在后台评论设置中填写 GitHub 仓库 owner 和 repo 后，评论区会自动启用。
        </div>
      )}
    </section>
  );
}

