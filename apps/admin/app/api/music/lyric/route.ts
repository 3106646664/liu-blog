import { NextRequest } from 'next/server'

const BACKEND_URL = (process.env.XINGHUI_BLOG_ADMIN_API_URL || 'http://127.0.0.1:58643').replace(/\/$/, '')

export async function GET(request: NextRequest) {
  const trackId = request.nextUrl.searchParams.get('id')?.trim() || ''
  if (!/^[A-Za-z0-9]+$/.test(trackId)) return new Response('Invalid track id', { status: 400 })
  try {
    const upstream = await fetch(`${BACKEND_URL}/api/music/lyric/${encodeURIComponent(trackId)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
    return new Response(await upstream.text(), { status: upstream.status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } })
  } catch { return new Response('[00:00.00] 暂无歌词', { status: 502 }) }
}
