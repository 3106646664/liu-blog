import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = (process.env.XINGHUI_BLOG_ADMIN_API_URL || "http://127.0.0.1:58643").replace(/\/$/, "");

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const upstream = await fetch(`${BACKEND_URL}/api/music/account/playlists/${encodeURIComponent(id)}/tracks`, {
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    const payload = await upstream.json();
    if (!upstream.ok) return NextResponse.json(payload, { status: upstream.status });
    const tracks = (Array.isArray(payload.data) ? payload.data : []).map((track: any) => ({
      id: track.id,
      name: track.name,
      title: track.name,
      artist: track.artist,
      author: track.artist,
      cover: track.cover,
      pic: track.cover,
      duration: track.duration,
      url: `/api/music/stream?id=${encodeURIComponent(track.id)}`,
      lrcUrl: `/api/music/lyric?id=${encodeURIComponent(track.id)}`,
      lrc: "",
    }));
    return NextResponse.json({ ...payload, data: tracks }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ success: false, data: [], detail: "歌单歌曲暂时无法读取" }, { status: 502 });
  }
}
