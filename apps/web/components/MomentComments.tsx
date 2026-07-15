"use client";

import { useEffect, useRef } from "react";
import { siteConfig } from "../siteConfig";

interface MomentCommentsProps {
  id: string;
}

export default function MomentComments({ id }: MomentCommentsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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
    script.setAttribute("issue-term", `moment-${id}`);
    script.setAttribute("label", "moments");
    script.setAttribute("theme", "preferred-color-scheme");
    container.appendChild(script);

    return () => container.replaceChildren();
  }, [id, repo]);

  if (!repo) return null;
  return <div ref={containerRef} className="min-h-20 w-full" />;
}

