import { NextResponse } from 'next/server'

const BACKEND_URL = (process.env.XINGHUI_BLOG_ADMIN_API_URL || 'http://127.0.0.1:58643').replace(/\/$/, '')

type QQTrack = { id: string; name?: string; artist?: string; cover?: string; duration?: number }
let successfulCache: Record<string, unknown>[] | null = null

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/music/playlist`, { cache: 'no-store', signal: AbortSignal.timeout(25000) })
    if (!response.ok) throw new Error(`music_backend_http_${response.status}`)
    const payload = await response.json()
    const tracks: QQTrack[] = Array.isArray(payload.data) ? payload.data : []
    const results = tracks.filter((track) => track?.id).map((track) => ({
      id: track.id,
      name: track.name || '未知曲目',
      artist: track.artist || '未知歌手',
      author: track.artist || '未知歌手',
      cover: track.cover || '',
      pic: track.cover || '',
      duration: Number(track.duration) || 0,
      url: `/api/music/stream?id=${encodeURIComponent(track.id)}`,
      lrcUrl: `/api/music/lyric?id=${encodeURIComponent(track.id)}`,
      lrc: '',
    }))
    if (results.length > 0) successfulCache = results
    return NextResponse.json(results, { headers: { 'X-Music-Cache': 'MISS', 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[api/music] QQ 音乐播放列表获取失败:', error)
    return NextResponse.json(successfulCache || [], {
      headers: { 'X-Music-Cache': successfulCache ? 'STALE' : 'ERROR', 'Cache-Control': 'no-store' },
    })
  }
}
