import { NextRequest } from 'next/server'

const BACKEND_URL = (process.env.XINGHUI_BLOG_ADMIN_API_URL || 'http://127.0.0.1:58643').replace(/\/$/, '')

export async function GET(request: NextRequest) {
  const trackId = request.nextUrl.searchParams.get('id')?.trim() || ''
  if (!/^[A-Za-z0-9]+$/.test(trackId)) return new Response('Invalid track id', { status: 400 })
  try {
    const range = request.headers.get('range')
    const upstream = await fetch(`${BACKEND_URL}/api/music/stream/${encodeURIComponent(trackId)}`, {
      cache: 'no-store', headers: range ? { Range: range } : undefined, signal: AbortSignal.timeout(30000),
    })
    if (!upstream.ok || !upstream.body) return new Response(await upstream.text(), { status: upstream.status || 502 })
    const headers = new Headers()
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(name); if (value) headers.set(name, value)
    }
    headers.set('Cache-Control', 'private, no-store')
    return new Response(upstream.body, { status: upstream.status, headers })
  } catch (error) {
    console.error(`[api/music/stream] ${trackId} 串流失败:`, error)
    return new Response('Audio stream unavailable', { status: 502 })
  }
}
