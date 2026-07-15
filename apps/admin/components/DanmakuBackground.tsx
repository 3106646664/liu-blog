"use client";

import { useEffect, useState } from 'react';
import { siteConfig } from '../siteConfig';

interface DanmakuItem {
  id: number;
  text: string;
  top: number;
  duration: number;
  delay: number;
}

export default function DanmakuBackground() {
  const [danmakus, setDanmakus] = useState<DanmakuItem[]>([]);

  useEffect(() => {
    const list = siteConfig.danmakuList || [];
    if (list.length === 0) return;

    const generatedDanmakus: DanmakuItem[] = [];
    const count = 15;

    for (let i = 0; i < count; i++) {
      generatedDanmakus.push({
        id: i,
        text: list[Math.floor(Math.random() * list.length)],
        // 现在容器本身只有 30vh 高，这里的 0-100% 就是在这个 30vh 内部随机
        // 我们留一点边距 10-90，防止字被切掉一半
        top: Math.random() * 80 + 10,
        duration: Math.random() * 20 + 25,
        delay: Math.random() * 20,
      });
    }
    setDanmakus(generatedDanmakus);
  }, []);

  return (
    // 🌟 终极限制：去掉了 bottom-0，换成了 h-[30vh] 强制锁死容器高度！
    // 并且加上 z-0 确保它在卡片矩阵的后面
    <div className="fixed top-28 h-[30vh] left-0 right-0 overflow-hidden pointer-events-none z-0">
      {danmakus.map((item) => (
        <div
          key={item.id}
          className="danmaku-readable-text absolute whitespace-nowrap font-bold text-lg tracking-wider select-none"
          style={{
            top: `${item.top}%`,
            right: '-100%',
            animation: `float-left ${item.duration}s linear ${item.delay}s infinite`,
          }}
        >
          {item.text}
        </div>
      ))}

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes float-left {
          0% {
            right: -100%;
            transform: translateX(100%);
          }
          100% {
            right: 100%;
            transform: translateX(-100%);
          }
        }

        .danmaku-readable-text {
          color: rgb(15 23 42 / 0.52);
          -webkit-text-stroke: 0.3px rgb(255 255 255 / 0.85);
          text-shadow:
            0 1px 2px rgb(255 255 255 / 0.95),
            0 0 6px rgb(255 255 255 / 0.7);
        }

        .dark .danmaku-readable-text {
          color: rgb(255 255 255 / 0.42);
          -webkit-text-stroke: 0.3px rgb(2 6 23 / 0.72);
          text-shadow:
            0 1px 3px rgb(2 6 23 / 0.95),
            0 0 7px rgb(2 6 23 / 0.75);
        }
      `}} />
    </div>
  );
}
