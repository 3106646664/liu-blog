"use client";

import { useEffect, useState } from 'react';
// 🌟 引入咱们的控制中心配置
import { siteConfig } from '../siteConfig';

export default function SiteDashboard() {
  const [timeStr, setTimeStr] = useState('');
  const [uptimeStr, setUptimeStr] = useState('');
  const [visitCount, setVisitCount] = useState<number | null>(null);

  // 🌟 从配置中读取建站时间
  const START_DATE = new Date(siteConfig.buildDate || '2026-03-23T00:00:00').getTime();

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // 格式化当前时间为 HH:MM:SS
      setTimeStr(now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      // 计算运行时间
      const diff = now.getTime() - START_DATE;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      setUptimeStr(`${days}天 ${hours}小时`);
    };

    updateTime(); // 初始执行一次
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [START_DATE]);

  useEffect(() => {
    const controller = new AbortController();

    const pageViewWindow = window as typeof window & { __xinghuiBlogPageViewId?: string };
    if (!pageViewWindow.__xinghuiBlogPageViewId) {
      pageViewWindow.__xinghuiBlogPageViewId = typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    }

    const registerVisit = async () => {
      try {
        const response = await fetch('/api/visits', {
          method: 'POST',
          headers: { 'X-XINGHUI-Page-View-Id': pageViewWindow.__xinghuiBlogPageViewId },
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Visit API returned ${response.status}`);
        const data = await response.json();
        const total = Number(data?.total);
        if (Number.isSafeInteger(total) && total >= 0) setVisitCount(total);
      } catch (error) {
        if (!controller.signal.aborted) console.error('访问量读取失败：', error);
      }
    };

    registerVisit();
    return () => controller.abort();
  }, []);

  return (
    // 横向铺满 12 列的长条矩阵
    <div className="md:col-span-12 rounded-3xl bg-white/40 dark:bg-slate-800/50 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl overflow-hidden flex flex-col md:flex-row items-stretch transition-colors duration-700 h-auto md:h-20 group">

      {/* 左侧：翻页时钟特效 (使用等宽字体) */}
      <div className="bg-slate-900 dark:bg-black text-white px-8 py-4 md:py-0 flex items-center justify-center font-mono text-2xl md:text-3xl font-black tracking-widest shadow-inner relative overflow-hidden group-hover:text-indigo-400 transition-colors">
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none"></div>
        {timeStr || '00:00:00'}
        {/* 模拟翻页中间的分割线 */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-black/50"></div>
      </div>

      {/* 中间与右侧：状态信息 */}
      <div className="flex-1 px-6 py-4 md:py-0 flex flex-wrap items-center justify-between gap-4 text-xs md:text-sm font-bold text-slate-600 dark:text-slate-300">

        {/* 运行时间 */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          <span>系统已稳定运行：<span className="text-indigo-600 dark:text-indigo-400 font-black">{uptimeStr}</span></span>
        </div>

        {/* 30 分钟访客会话统计 */}
        <div className="flex items-center gap-2" title="同一浏览器 30 分钟内重复访问只统计一次">
          <span className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-50"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500"></span>
          </span>
          <span>
            网站访问量：
            <span className="text-violet-600 dark:text-violet-400 font-black tabular-nums">
              {visitCount === null ? '统计中…' : `${visitCount.toLocaleString('zh-CN')} 次`}
            </span>
          </span>
        </div>

        {/* 技术栈徽章 (🌟 动态映射 siteConfig 里的数组) */}
        <div className="flex gap-2">
          {siteConfig.footerBadges?.map((badge, index) => (
            <span
              key={index}
              className="px-2 py-1 bg-white/50 dark:bg-slate-700/50 rounded-md shadow-sm flex items-center gap-1 border border-white/40 dark:border-slate-600"
            >
              <svg className={`w-3.5 h-3.5 ${badge.color}`} fill="currentColor" viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: badge.svg }} />
              {badge.name}
            </span>
          ))}
        </div>

        {/* 备案信息 (🌟 从 siteConfig 读取链接和名称) */}
        {siteConfig.icpConfig && (
          <a
            href={siteConfig.icpConfig.link}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-indigo-500 transition-colors border-b border-dashed border-slate-400 dark:border-slate-500 pb-0.5"
          >
            {siteConfig.icpConfig.name}
          </a>
        )}

      </div>
    </div>
  );
}
