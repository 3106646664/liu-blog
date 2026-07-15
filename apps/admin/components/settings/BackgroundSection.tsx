import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useToast } from '../ToastProvider';

type BackgroundMode = 'slideshow' | 'continuous';

export default function BackgroundSection({ formData, handleUpdate, pushToQueue }: any) {
  const { showToast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<BackgroundMode>('slideshow');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mode: BackgroundMode = formData.backgroundMode === 'continuous' ? 'continuous' : 'slideshow';
  const slideshowImages: string[] = formData.bgImages ?? [];
  const continuousImages: string[] = formData.scrollBackgroundImages ?? [];
  const activeImages = mode === 'continuous' ? continuousImages : slideshowImages;
  const activeListKey = mode === 'continuous' ? 'scrollBackgroundImages' : 'bgImages';
  const urlField = mode === 'continuous' ? 'newScrollBgUrl' : 'newBgUrl';

  const setMode = (nextMode: BackgroundMode) => {
    handleUpdate('backgroundMode', nextMode);
  };

  const removeImage = (index: number) => {
    handleUpdate(activeListKey, activeImages.filter((_, imageIndex) => imageIndex !== index));
    showToast('已移除一张背景图', 'success');
  };

  const addImageUrl = () => {
    const url = String(formData[urlField] || '').trim();
    if (!url) {
      showToast('URL 不能为空', 'warning');
      return;
    }
    if (activeImages.includes(url)) {
      showToast('这张图已经在当前背景列表中', 'warning');
      return;
    }

    handleUpdate(activeListKey, [...activeImages, url]);
    handleUpdate(urlField, '');
    showToast('背景图已添加', 'success');
  };

  const handleFileUpload = async (file: File) => {
    const picUrl = formData.picBedUrl || 'https://pic.dusays.com';
    const picToken = formData.picBedToken;

    if (!picToken) {
      showToast('请先在【图库配置管理】中填写图床 Token', 'error');
      return;
    }
    if (!file.type.startsWith('image/')) {
      showToast('只能上传图片文件', 'warning');
      return;
    }

    setIsUploading(true);
    setPendingTarget(mode);
    showToast('正在上传图片...', 'info');

    try {
      const uploadData = new FormData();
      uploadData.append('file', file);
      uploadData.append('url', picUrl);
      uploadData.append('token', picToken);

      const res = await fetch('/cms-api/picbed/upload', {
        method: 'POST',
        body: uploadData,
      });
      const data = await res.json();

      if (data.success && data.url) {
        setPendingImageUrl(data.url);
        showToast('图片上传成功，请确认加入哪个背景列表', 'success');
      } else {
        showToast(`上传失败：${data.message}`, 'error');
      }
    } catch {
      showToast('无法连接到图片上传服务', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const confirmAddPendingImage = () => {
    if (!pendingImageUrl) return;

    const key = pendingTarget === 'continuous' ? 'scrollBackgroundImages' : 'bgImages';
    const list: string[] = pendingTarget === 'continuous'
      ? (formData.scrollBackgroundImages ?? [])
      : (formData.bgImages ?? []);
    handleUpdate(key, [...list, pendingImageUrl]);
    setPendingImageUrl(null);
    showToast('图片已加入背景列表', 'success');
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  const duration = Math.max(10, Number(formData.scrollBackgroundDuration) || 45);

  return (
    <motion.section
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="relative flex flex-col gap-8 overflow-hidden rounded-[40px] border border-white/50 bg-white/40 p-8 shadow-2xl backdrop-blur-2xl dark:border-slate-800/50 dark:bg-slate-900/40"
    >
      <header className="relative z-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white">🌌 主页背景配置</h2>
          <p className="mt-2 text-[10px] font-bold uppercase text-slate-400">
            支持淡入淡出轮播与固定容器连续滚动
          </p>
        </div>
        <button
          onClick={() => pushToQueue('主页背景设置', 'backgroundMode', formData.backgroundMode)}
          className="rounded-xl bg-indigo-500 px-6 py-2 text-xs font-black text-white shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
        >
          暂存背景修改
        </button>
      </header>

      <div className="relative z-10 grid grid-cols-1 gap-3 md:grid-cols-2">
        <button
          onClick={() => setMode('slideshow')}
          className={`rounded-2xl border p-5 text-left transition-all ${mode === 'slideshow' ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/20' : 'border-white/40 bg-white/40 dark:border-slate-700 dark:bg-slate-800/40'}`}
        >
          <span className="block text-sm font-black text-slate-800 dark:text-white">淡入淡出轮播</span>
          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">沿用原来的全屏背景切换方式</span>
        </button>
        <button
          onClick={() => setMode('continuous')}
          className={`rounded-2xl border p-5 text-left transition-all ${mode === 'continuous' ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/20' : 'border-white/40 bg-white/40 dark:border-slate-700 dark:bg-slate-800/40'}`}
        >
          <span className="block text-sm font-black text-slate-800 dark:text-white">连续向左滚动</span>
          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">复制整组固定比例容器，无缝首尾接续</span>
        </button>
      </div>

      {mode === 'continuous' && (
        <div className="relative z-10 rounded-3xl border border-indigo-200/70 bg-indigo-50/70 p-5 dark:border-indigo-500/20 dark:bg-indigo-500/10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black text-slate-800 dark:text-white">滚动一圈时长</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">数值越大，移动越慢；建议 35–70 秒</p>
            </div>
            <label className="flex items-center gap-2 rounded-xl bg-white/80 px-4 py-2 dark:bg-slate-900/60">
              <input
                type="number"
                min={10}
                max={300}
                value={duration}
                onChange={(event) => handleUpdate('scrollBackgroundDuration', Math.min(300, Math.max(10, Number(event.target.value) || 10)))}
                className="w-16 bg-transparent text-right text-sm font-black outline-none"
              />
              <span className="text-xs font-bold text-slate-500">秒</span>
            </label>
          </div>
          <p className="mt-4 text-xs leading-5 text-indigo-700 dark:text-indigo-200">
            每张图都放进与当前拼接图同为 1672:941 的固定容器；轨道由两组完全相同的容器组成，第一组离场时第二组会同步接上。
          </p>
        </div>
      )}

      <div className="relative z-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="max-h-[480px] overflow-y-auto rounded-3xl bg-slate-100/50 p-6 custom-scrollbar dark:bg-slate-800/50">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-black text-slate-600 dark:text-slate-300">
              {mode === 'continuous' ? '滚动容器列表' : '轮播图片列表'}
            </p>
            <span className="text-[10px] font-bold text-slate-400">{activeImages.length} 张</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AnimatePresence>
              {activeImages.map((url, index) => (
                <motion.div
                  key={`${url}-${index}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="group relative aspect-video overflow-hidden rounded-2xl border border-white/20 bg-white shadow-md dark:bg-slate-900"
                >
                  <img src={url} alt={`背景 ${index + 1}`} className="h-full w-full object-contain" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                    <button onClick={() => removeImage(index)} className="h-10 w-10 scale-0 rounded-full bg-red-500 font-bold text-white shadow-xl transition-transform group-hover:scale-100">✕</button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {activeImages.length === 0 && (
            <div className="flex h-32 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 text-xs font-bold text-slate-400 dark:border-slate-600">
              当前模式还没有背景图
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-3xl border border-white/40 bg-white/50 p-5 shadow-sm dark:border-slate-700/50 dark:bg-slate-800/50">
            <p className="mb-3 text-[10px] font-black uppercase text-slate-400">🔗 粘贴网络图片 URL</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="https://..."
                value={formData[urlField] || ''}
                onChange={(event) => handleUpdate(urlField, event.target.value)}
                className="min-w-0 flex-1 rounded-xl border-none bg-white px-4 py-2 text-xs shadow-inner outline-none dark:bg-slate-900"
              />
              <button onClick={addImageUrl} className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-white shadow-lg shadow-emerald-500/20 active:scale-95">添加</button>
            </div>
          </div>

          <div
            onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={(event) => { event.preventDefault(); setIsDragging(false); }}
            onDrop={onDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`relative flex min-h-[200px] flex-1 cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl border-2 border-dashed transition-all ${isDragging ? 'scale-[1.02] border-indigo-500 bg-indigo-500/10' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-100/50 dark:border-slate-600 dark:hover:bg-slate-800/50'}`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(event) => event.target.files?.[0] && handleFileUpload(event.target.files[0])}
              className="hidden"
              accept="image/*"
            />
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-2xl text-slate-500 shadow-xl dark:bg-slate-800">
              {isUploading ? '⏳' : '☁️'}
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{isUploading ? '正在上传...' : '点击或拖拽图片到这里'}</p>
              <p className="mt-1 text-[10px] font-bold text-slate-400">将加入当前选中的背景模式</p>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {pendingImageUrl && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="absolute inset-0 z-50 flex items-center justify-center rounded-[40px] bg-slate-900/40 p-6 backdrop-blur-md"
          >
            <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-white p-6 shadow-2xl dark:bg-slate-800">
              <h3 className="mb-2 text-center text-lg font-black text-slate-800 dark:text-white">图片上传成功</h3>
              <p className="mb-4 text-center text-xs text-slate-500 dark:text-slate-400">
                加入{pendingTarget === 'continuous' ? '连续滚动' : '淡入淡出轮播'}列表？
              </p>
              <div className="mb-6 aspect-video w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <img src={pendingImageUrl} alt="上传预览" className="h-full w-full object-contain" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPendingImageUrl(null)} className="flex-1 rounded-xl bg-slate-100 py-3 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">仅上传</button>
                <button onClick={confirmAddPendingImage} className="flex-1 rounded-xl bg-pink-500 py-3 text-xs font-black text-white shadow-lg shadow-pink-500/30">加入列表</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
