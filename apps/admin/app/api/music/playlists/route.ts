import { NextResponse } from "next/server";

const BACKEND_URL = (process.env.XINGHUI_BLOG_ADMIN_API_URL || "http://127.0.0.1:58643").replace(/\/$/, "");

export async function GET() {
  try {
    const upstream = await fetch(`${BACKEND_URL}/api/music/account/playlists`, {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const payload = await upstream.json();
    return NextResponse.json(payload, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ success: false, logged_in: false, data: [], detail: "账号歌单暂时无法读取" }, { status: 502 });
  }
}
