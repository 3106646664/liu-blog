"use client";

import { useEffect, useRef, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipBack, SkipForward, Repeat, Shuffle, RefreshCcw, ListMusic, Mic2, Disc3, Volume2, VolumeX, MessageSquare } from 'lucide-react';
import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import { useMusic } from '../../components/MusicProvider';
import Comments from '../../components/Comments';

export default function MusicPage() {
  const {
    playlist, currentSong, isPlaying, progress, currentTime, duration, currentLyric, lyrics,
    isLoading, togglePlay, nextSong, prevSong, handleSeek,
    playSong, replaceQueue,
    playMode, togglePlayMode,
    volume, setVolume, isMuted, toggleMute
  } = useMusic();

  const lyricContainerRef = useRef<HTMLDivElement>(null);
  const activeLyricRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'lyrics' | 'queue' | 'playlists'>('lyrics');
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const parsedLyrics = lyrics;
  const [accountPlaylists, setAccountPlaylists] = useState<any[]>([]);
  const [accountLoggedIn, setAccountLoggedIn] = useState<boolean | null>(null);
  const [playlistsLoaded, setPlaylistsLoaded] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<any | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<any[]>([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState('');

  useEffect(() => {
    if (activeTab !== 'playlists' || playlistsLoaded) return;
    let cancelled = false;
    setPlaylistLoading(true);
    setPlaylistError('');
    fetch('/api/music/playlists', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.detail || '账号歌单读取失败');
        if (!cancelled) {
          setAccountLoggedIn(Boolean(payload.logged_in));
          setAccountPlaylists(Array.isArray(payload.data) ? payload.data : []);
          setPlaylistsLoaded(true);
        }
      })
      .catch((reason) => { if (!cancelled) setPlaylistError(reason instanceof Error ? reason.message : '账号歌单读取失败'); })
      .finally(() => { if (!cancelled) setPlaylistLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, playlistsLoaded]);

  const openAccountPlaylist = async (item: any) => {
    setSelectedPlaylist(item);
    setPlaylistTracks([]);
    setPlaylistLoading(true);
    setPlaylistError('');
    try {
      const response = await fetch(`/api/music/playlists/${encodeURIComponent(item.id)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.detail || '歌单歌曲读取失败');
      setPlaylistTracks(Array.isArray(payload.data) ? payload.data : []);
    } catch (reason) {
      setPlaylistError(reason instanceof Error ? reason.message : '歌单歌曲读取失败');
    } finally {
      setPlaylistLoading(false);
    }
  };

  const playAccountPlaylist = (startIndex = 0) => {
    if (!playlistTracks.length) return;
    replaceQueue(playlistTracks, startIndex);
    setActiveTab('queue');
  };

  const activeLyricIndex = useMemo(() => {
    if (!parsedLyrics.length) return -1;
    let idx = parsedLyrics.findIndex((l: any) => l.time > currentTime) - 1;
    if (idx === -2) idx = parsedLyrics.length - 1;
    return Math.max(0, idx);
  }, [currentTime, parsedLyrics]);

  // 🌟 保持修复：精准容器滚动逻辑，不影响全局滚动条
  useEffect(() => {
    if (activeLyricRef.current && lyricContainerRef.current && activeTab === 'lyrics') {
      const container = lyricContainerRef.current;
      const activeItem = activeLyricRef.current;
      const scrollTarget = activeItem.offsetTop - container.offsetHeight / 2 + activeItem.offsetHeight / 2;
      container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    }
  }, [activeLyricIndex, activeTab]);

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getPlayModeIcon = () => {
    switch (playMode) {
      case 'loop': return <Repeat size={20} className="text-slate-500 hover:text-indigo-500" />;
      case 'single': return <RefreshCcw size={20} className="text-indigo-500" />;
      case 'random': return <Shuffle size={20} className="text-slate-500 hover:text-indigo-500" />;
      default: return <Repeat size={20} className="text-slate-500" />;
    }
  };

  const handlePlaySong = (index: number) => {
    playSong(index);
  };

  if (isLoading || !currentSong) {
    return (
      <div className="min-h-screen relative pb-32 flex flex-col">
        <div className="fixed inset-0 z-0 pointer-events-none bg-cover bg-center opacity-40 dark:opacity-25" style={{ backgroundImage: "url('/placeholder.svg')" }} />
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center animate-pulse gap-4">
          <Disc3 size={48} className="text-indigo-500 animate-spin" />
          <span className="font-black text-slate-500 tracking-widest text-sm">唤醒音频引擎中...</span>
        </div>
      </div>
    );
  }

  const songCover = currentSong.cover || currentSong.pic || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000&auto=format&fit=crop";

  return (
    <div className="min-h-screen relative pb-10 flex flex-col">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-[-10%] bg-cover bg-center transition-all duration-1000 blur-[20px] opacity-55 dark:opacity-35 saturate-125" style={{ backgroundImage: "url('/placeholder.svg')" }} />
        <div className="absolute inset-0 bg-white/40 dark:bg-black/40 backdrop-blur-sm" />
      </div>

      <Navbar />

      <PageTransition>
        <div className="w-full max-w-7xl mx-auto mt-28 px-4 sm:px-10 relative z-10">
          <div className="animate-fade-in-up mb-10">
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-widest mb-2 transition-colors duration-700">云端乐律</h1>
            <p className="text-slate-600 dark:text-slate-400 font-medium tracking-wider transition-colors duration-700">在代码的缝隙中寻找灵魂的共鸣</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 w-full items-stretch h-[calc(100vh-320px)] min-h-[600px] max-h-[720px]">

            {/* 左侧：控制台 (保留之前调好的光晕和唱片效果) */}
            <div className="md:col-span-5 h-full flex flex-col bg-white/40 dark:bg-slate-800/50 backdrop-blur-md border border-white/40 dark:border-white/10 rounded-[32px] shadow-2xl p-10 relative overflow-hidden transition-all duration-500">
              <div className="flex-1 flex flex-col items-center justify-center relative z-10 w-full overflow-hidden">
                <div className="relative w-48 h-48 lg:w-64 lg:h-64 flex-shrink-0 aspect-square mb-10 flex items-center justify-center">
                   <div className={`absolute inset-0 m-auto w-[85%] h-[85%] bg-indigo-500/25 blur-[35px] rounded-full transition-all duration-1000 z-0 ${isPlaying ? 'opacity-90 scale-105' : 'opacity-20 scale-100'}`}></div>
                   <div className="absolute inset-0 m-auto w-[90%] h-[90%] rounded-full shadow-[0_0_40px_-5px_rgba(99,102,241,0.4)] z-0"></div>
                   <motion.div className={`absolute inset-0 w-full h-full rounded-full border-[6px] border-white/80 dark:border-slate-600/80 shadow-2xl overflow-hidden transition-transform duration-700 z-10 rotating-disc ${isPlaying ? 'scale-100' : 'scale-95'}`}
                     style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}>
                     <img src={songCover} alt="cover" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                     <div className="absolute inset-0 m-auto w-12 h-12 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-full z-30 shadow-inner border border-slate-300 dark:border-slate-700"></div>
                     <div className="absolute inset-0 z-20 rounded-full pointer-events-none opacity-20" style={{ background: 'conic-gradient(from 0deg, transparent, rgba(255,255,255,0.4), transparent, rgba(255,255,255,0.4), transparent)' }}></div>
                   </motion.div>
                </div>
                <div className="w-full text-center px-4 mb-6">
                  <h1 className="text-xl lg:text-2xl font-black text-slate-900 dark:text-white truncate drop-shadow-sm tracking-tight">{currentSong.title || currentSong.name}</h1>
                  <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400 truncate mt-2 tracking-widest">{currentSong.artist || currentSong.author}</h2>
                </div>
              </div>

              <div className="w-full mt-auto relative z-20">
                <div className="w-full flex flex-col gap-1.5 mb-8 px-3">
                  <input type="range" min="0" max="100" value={progress || 0} onChange={handleSeek} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #4f46e5 ${progress}%, rgba(0, 0, 0, 0.15) 0)` }} />
                  <div className="flex justify-between text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
                </div>
                <div className="w-full flex items-center justify-between px-2 lg:px-4">
                  <button onClick={togglePlayMode} className="p-2 transition-transform hover:scale-110">{getPlayModeIcon()}</button>
                  <div className="flex items-center gap-4 lg:gap-6">
                    <button onClick={prevSong} className="p-2 text-slate-700 dark:text-slate-300 hover:text-indigo-500 transition-transform hover:scale-110"><SkipBack size={28} fill="currentColor" /></button>
                    <button onClick={togglePlay} className="w-16 h-16 lg:w-20 lg:h-20 flex items-center justify-center bg-indigo-500 text-white rounded-full hover:scale-105 shadow-xl shadow-indigo-500/40">{isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}</button>
                    <button onClick={nextSong} className="p-2 text-slate-700 dark:text-slate-300 hover:text-indigo-500 transition-transform hover:scale-110"><SkipForward size={28} fill="currentColor" /></button>
                  </div>
                  <div className="flex items-center" onMouseLeave={() => setShowVolumeSlider(false)}>
                    <AnimatePresence>
                      {showVolumeSlider && (
                        <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 100, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="overflow-hidden flex items-center mr-2 bg-white/30 dark:bg-black/20 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/20">
                          <input type="range" min="0" max="1" step="0.01" value={isMuted ? 0 : (volume || 0)} onChange={(e) => setVolume && setVolume(Number(e.target.value))} className="w-20 h-1 appearance-none rounded-full cursor-pointer" style={{ background: `linear-gradient(to right, #4f46e5 ${(volume || 0) * 100}%, rgba(0, 0, 0, 0.15) 0)` }} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <button onClick={() => setShowVolumeSlider(!showVolumeSlider)} onDoubleClick={toggleMute} className={`p-2 rounded-full transition-all ${showVolumeSlider ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-500 hover:text-indigo-500'}`}>{isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
                  </div>
                </div>
              </div>
            </div>

            {/* 右侧：面板 (保留之前的遮罩和滚动修复) */}
            <div className="md:col-span-7 h-full flex flex-col bg-white/40 dark:bg-slate-800/50 backdrop-blur-md border border-white/40 dark:border-white/10 rounded-[32px] shadow-2xl relative transition-colors duration-700 overflow-hidden">
              <div className="flex items-center justify-center gap-1 p-1 mt-6 mx-auto bg-white/50 dark:bg-slate-900/50 rounded-full shadow-inner border border-white/40 w-96 z-20 shrink-0">
                <button onClick={() => setActiveTab('lyrics')} className={`flex-1 py-2 rounded-full font-black text-[13px] transition-all ${activeTab === 'lyrics' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-500'}`}>歌词</button>
                <button onClick={() => setActiveTab('queue')} className={`flex-1 py-2 rounded-full font-black text-[13px] transition-all ${activeTab === 'queue' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-500'}`}>当前播放队列</button>
                <button onClick={() => setActiveTab('playlists')} className={`flex-1 py-2 rounded-full font-black text-[13px] transition-all ${activeTab === 'playlists' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-500'}`}>歌单</button>
              </div>

              <div className="flex-1 relative mt-2 flex flex-col overflow-hidden">
                {activeTab === 'lyrics' && (
                  <div className="absolute inset-0 flex flex-col h-full animate-in fade-in duration-300">
                    <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-white/40 dark:from-slate-800/60 to-transparent z-10 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white/40 dark:from-slate-800/60 to-transparent z-10 pointer-events-none" />
                    <div ref={lyricContainerRef} className="h-full overflow-y-auto no-scrollbar scroll-smooth relative px-6 lyric-mask-container">
                        <div className="py-28 flex flex-col gap-4 text-center lg:px-10">
                            {parsedLyrics.length > 0 ? (
                              parsedLyrics.map((line: any, index: number) => {
                                const isActive = index === activeLyricIndex;
                                return (
                                  <div key={index} ref={isActive ? activeLyricRef : null}
                                    className={`transition-all duration-500 cursor-pointer px-4 rounded-2xl ${isActive ? 'opacity-100 scale-[1.03] py-3 bg-white/20 shadow-sm' : 'opacity-65 hover:opacity-100'}`}
                                    onClick={() => duration > 0 && line.time >= 0 && handleSeek({ target: { value: String((line.time / duration) * 100) } } as any)}
                                  >
                                    <p className={`font-black tracking-tight leading-relaxed transition-all duration-700 ${isActive ? 'text-xl md:text-2xl text-indigo-600 dark:text-indigo-400' : 'text-base md:text-lg text-slate-700 dark:text-slate-300'}`} style={isActive ? { textShadow: '0 0 20px rgba(99,102,241,0.15)' } : {}}>{line.text}</p>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="h-full flex items-center justify-center">
                                 <div className="flex flex-col items-center gap-4">
                                    <Disc3 className="animate-spin text-indigo-500/40" size={40} />
                                    <p className="text-xl font-black text-indigo-500 animate-pulse">{currentLyric || "正在捕获灵魂旋律..."}</p>
                                 </div>
                              </div>
                            )}
                        </div>
                    </div>
                  </div>
                )}
                {activeTab === 'queue' && (
                  <div className="absolute inset-0 px-8 pb-8 pt-4 animate-in fade-in duration-300 flex flex-col">
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col gap-2.5">
                      <AnimatePresence mode='popLayout'>
                        {playlist.map((song: any) => {
                          const originalIndex = playlist.findIndex((s: any) => s.id === song.id);
                          const isPlayingThis = (song.id === currentSong.id);
                          return (
                            <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} key={song.id} onClick={() => handlePlaySong(originalIndex)} className={`group flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all border ${isPlayingThis ? 'bg-white/60 dark:bg-slate-700/80 shadow-md border-indigo-500/30' : 'border-transparent hover:bg-white/30 dark:hover:bg-slate-700/40'}`}>
                              <div className="flex items-center gap-4 w-[85%]">
                                <div className="relative w-12 h-12 shrink-0 rounded-xl overflow-hidden shadow-sm">
                                  <img src={song.cover || song.pic} alt="cover" className="w-full h-full object-cover" />
                                  {isPlayingThis && isPlaying && <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px]"><div className="flex gap-[3px] items-end h-3"><span className="w-0.5 bg-white rounded-full animate-[bounce_1s_infinite_0ms]" /><span className="w-0.5 bg-white rounded-full animate-[bounce_1s_infinite_200ms]" /><span className="w-0.5 bg-white rounded-full animate-[bounce_1s_infinite_400ms]" /></div></div>}
                                </div>
                                <div className="flex flex-col truncate"><span className={`text-[15px] font-black truncate ${isPlayingThis ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>{song.title || song.name}</span><span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">{song.artist || song.author}</span></div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                )}
                {activeTab === 'playlists' && (
                  <div className="absolute inset-0 px-8 pb-5 pt-3 animate-in fade-in duration-300 flex flex-col overflow-hidden">
                    {selectedPlaylist ? (
                      <>
                        <div className="mb-3 flex items-center justify-between gap-3 shrink-0">
                          <button onClick={() => { setSelectedPlaylist(null); setPlaylistTracks([]); setPlaylistError(''); }} className="text-xs font-black text-indigo-500 hover:text-indigo-600">← 返回歌单</button>
                          <div className="min-w-0 flex-1 text-center"><h3 className="truncate text-sm font-black text-slate-800 dark:text-white">{selectedPlaylist.name}</h3><p className="text-[10px] text-slate-400">{playlistTracks.length || selectedPlaylist.track_count || 0} 首歌曲</p></div>
                          <button onClick={() => playAccountPlaylist(0)} disabled={!playlistTracks.length} className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-black text-white disabled:opacity-40">播放全部</button>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                          {playlistLoading && <div className="flex h-full items-center justify-center gap-2 text-sm font-bold text-slate-400"><RefreshCcw size={16} className="animate-spin" />正在读取歌单…</div>}
                          {!playlistLoading && playlistError && <div className="rounded-2xl bg-rose-500/10 p-4 text-center text-sm text-rose-500">{playlistError}</div>}
                          {!playlistLoading && !playlistError && playlistTracks.length === 0 && <div className="py-12 text-center text-sm text-slate-400">这个歌单暂时没有可播放歌曲</div>}
                          {!playlistLoading && playlistTracks.map((song: any, index: number) => (
                            <button key={`${song.id}-${index}`} onClick={() => playAccountPlaylist(index)} className="flex w-full items-center gap-3 rounded-2xl border border-transparent p-3 text-left transition hover:border-indigo-500/20 hover:bg-white/40 dark:hover:bg-slate-700/40">
                              <span className="w-6 shrink-0 text-center text-xs font-bold text-slate-400">{index + 1}</span>
                              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-indigo-500/10">{song.cover ? <img src={song.cover} alt="" className="h-full w-full object-cover" /> : <Disc3 className="m-2.5 text-indigo-400" size={20} />}</div>
                              <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800 dark:text-slate-200">{song.title || song.name}</p><p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{song.artist || song.author}</p></div>
                              <Play size={15} className="shrink-0 text-indigo-500" />
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                        {playlistLoading && <div className="flex h-full items-center justify-center gap-2 text-sm font-bold text-slate-400"><RefreshCcw size={16} className="animate-spin" />正在读取账号歌单…</div>}
                        {!playlistLoading && playlistError && <div className="rounded-2xl bg-rose-500/10 p-4 text-center text-sm text-rose-500">{playlistError}</div>}
                        {!playlistLoading && accountLoggedIn === false && <div className="py-12 text-center"><Disc3 className="mx-auto mb-3 text-slate-300" size={38} /><p className="text-sm font-black text-slate-500">QQ 音乐账号尚未登录</p><p className="mt-1 text-xs text-slate-400">请先在管理后台完成 QQ 音乐登录</p></div>}
                        {!playlistLoading && accountLoggedIn && accountPlaylists.length === 0 && <div className="py-12 text-center text-sm text-slate-400">账号下暂时没有歌单</div>}
                        {!playlistLoading && accountLoggedIn && accountPlaylists.length > 0 && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{accountPlaylists.map((item: any) => (
                          <button key={item.id} onClick={() => openAccountPlaylist(item)} className="flex items-center gap-3 rounded-2xl border border-white/40 bg-white/30 p-3 text-left transition hover:-translate-y-0.5 hover:border-indigo-500/30 hover:bg-white/55 dark:border-slate-700/40 dark:bg-slate-900/20 dark:hover:bg-slate-700/50">
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-indigo-500/10">{item.cover && /^https?:/.test(item.cover) ? <img src={item.cover} alt="" className="h-full w-full object-cover" /> : <ListMusic className="m-3 text-indigo-400" size={24} />}</div>
                            <div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800 dark:text-slate-200">{item.name}</p><p className="truncate text-[10px] text-slate-400">{item.track_count || 0} 首 · {item.creator || 'QQ 音乐'}</p></div>
                          </button>
                        ))}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 留言板 */}
          <div className="mt-12 mb-20 bg-white/60 dark:bg-slate-800/50 backdrop-blur-xl rounded-[40px] shadow-2xl border border-white/40 dark:border-white/10 overflow-hidden transition-colors duration-700 relative">
             <div className="px-8 md:px-16 py-12 relative">
                <div className="flex items-center gap-3 mb-8 border-b border-slate-300/50 dark:border-slate-700 pb-6">
                   <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center"><MessageSquare className="text-indigo-500" size={24} /></div>
                   <div><h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">乐迷留言板</h3><p className="text-sm text-slate-500 dark:text-slate-400 font-medium">听着这首歌，你想到了什么？</p></div>
                </div>
                <div className="relative"><Comments /></div>
             </div>
          </div>
        </div>
      </PageTransition>

      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .rotating-disc { animation: spin 20s linear infinite; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .lyric-mask-container {
          -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 4%, black 96%, transparent 100%);
          mask-image: linear-gradient(to bottom, transparent 0%, black 4%, black 96%, transparent 100%);
        }
      `}</style>
    </div>
  );
}
