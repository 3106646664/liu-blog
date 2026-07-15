"use client";

import CommentSystem from "./CommentSystem";

export default function MomentComments({ id }: { id: string }) {
  return <CommentSystem pageKey={id.slice(0, 256)} compact />;
}

