"use client";

import { usePathname } from "next/navigation";
import CommentSystem from "./CommentSystem";

export default function Comments() {
  const pathname = usePathname();
  return <CommentSystem pageKey={(pathname.replace(/\/$/, "") || "/").slice(0, 256)} />;
}

