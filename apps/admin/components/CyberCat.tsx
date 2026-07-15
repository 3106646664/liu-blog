"use client";

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const IDLE_LINES = [
  '今日计划排好了吗？效率可不是靠临时起意。',
  '偶尔停下来看看风景，也不算浪费时间。',
  '有问题就问，我会给你一个干脆的答案。',
  '页面巡查完毕，一切正常。',
  '别发呆啦，还有很多有趣的事值得去做。',
];

export default function CyberCat() {
  const [isPetted, setIsPetted] = useState(false);
  const [speech, setSpeech] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const petTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speak = (text: string, duration = 6000) => {
    setSpeech(text);
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    speechTimeoutRef.current = setTimeout(() => setSpeech(null), duration);
  };

  const requestReply = async (message: string) => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'AI 助手暂时无法响应');
    return data.reply as string;
  };

  const handleInteract = () => {
    if (isPetted || isThinking) return;
    setIsPetted(true);
    speak('嗯？突然这么热情……这次就不计较了。', 2400);
    if (petTimeoutRef.current) clearTimeout(petTimeoutRef.current);
    petTimeoutRef.current = setTimeout(() => setIsPetted(false), 2200);
  };

  const handleTea = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (isThinking) return;
    setShowInput(false);
    setIsThinking(true);
    speak('茶我收下了。稍等，我想想该怎么回礼。', 10000);
    try {
      const reply = await requestReply('访客刚刚递给你一杯热茶，请用符合你性格的一句话回应。');
      speak(reply, 8000);
    } catch (error) {
      speak(error instanceof Error ? error.message : '通信暂时中断，请稍后再试。', 5000);
    } finally {
      setIsThinking(false);
    }
  };

  const handleChatSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const userMessage = inputValue.trim();
    if (!userMessage || isThinking) return;
    setInputValue('');
    setShowInput(false);
    setIsThinking(true);
    speak('稍等，我正在整理思路。', 10000);
    try {
      const reply = await requestReply(userMessage);
      speak(reply, 9000);
    } catch (error) {
      speak(error instanceof Error ? error.message : '通信暂时中断，请稍后再试。', 5000);
    } finally {
      setIsThinking(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (!speech && !showInput && !isThinking && Math.random() > 0.8) {
        speak(IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)], 4500);
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [speech, showInput, isThinking]);

  useEffect(() => () => {
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    if (petTimeoutRef.current) clearTimeout(petTimeoutRef.current);
  }, []);

  return (
    <motion.div
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.1}
      whileDrag={{ scale: 1.08, cursor: 'grabbing' }}
      className="fixed bottom-20 right-20 z-[9999] flex flex-col items-center group cursor-grab active:cursor-grabbing"
    >
      <div className="relative w-full flex justify-center mb-6">
        <AnimatePresence>
          {speech && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className="absolute bottom-0 bg-white/95 dark:bg-slate-800/95 text-slate-700 dark:text-gray-200 px-4 py-3 rounded-2xl shadow-xl border border-violet-100 dark:border-violet-900/50 text-sm max-w-[260px] break-words text-center leading-relaxed backdrop-blur-md"
              style={{ pointerEvents: 'none', transformOrigin: 'bottom center' }}
            >
              {speech}
              <div className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-white dark:bg-slate-800 border-b border-r border-violet-100 dark:border-violet-900/50 rotate-45" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative">
        <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-20">
          <button
            onClick={(event) => {
              event.stopPropagation();
              setShowInput((current) => !current);
            }}
            className="bg-white/90 dark:bg-slate-700/90 p-2.5 rounded-full shadow-md hover:scale-110 active:scale-95 transition-transform border border-violet-100 dark:border-slate-600 text-violet-500 hover:text-violet-600 flex items-center justify-center backdrop-blur-sm"
            title="和小晴聊天"
            aria-label="和小晴聊天"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223zM8.25 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM10.875 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zm4.875-1.125a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z" clipRule="evenodd" />
            </svg>
          </button>

          <button
            onClick={handleTea}
            disabled={isThinking}
            className={`bg-white/90 dark:bg-slate-700/90 p-2.5 rounded-full shadow-md hover:scale-110 active:scale-95 transition-transform border border-violet-100 dark:border-slate-600 flex items-center justify-center backdrop-blur-sm ${isThinking ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="递一杯茶"
            aria-label="递一杯茶"
          >
            <span className="text-xl leading-none">🍵</span>
          </button>
        </div>

        <button
          type="button"
          className="w-[120px] h-[120px] relative cursor-pointer bg-transparent border-0 p-0"
          onClick={handleInteract}
          aria-label="与像素助手小晴互动"
        >
          <style>{`
            .assistant-sprite {
              width: 100%;
              height: 100%;
              background-image: url('/pet.svg');
              background-size: 300% 300%;
              background-repeat: no-repeat;
              image-rendering: pixelated;
            }
            .assistant-idle { animation: assistant-frames 1.4s infinite; background-position-y: 0%; }
            .assistant-happy { animation: assistant-frames 0.9s infinite; background-position-y: 50%; }
            .assistant-thinking { animation: assistant-frames 1.1s infinite; background-position-y: 100%; }
            @keyframes assistant-frames {
              0%, 33.32% { background-position-x: 0%; }
              33.33%, 66.65% { background-position-x: 50%; }
              66.66%, 100% { background-position-x: 100%; }
            }
          `}</style>
          <span className={`block assistant-sprite drop-shadow-2xl ${isPetted ? 'assistant-happy' : isThinking ? 'assistant-thinking' : 'assistant-idle'}`} />
        </button>
      </div>

      <AnimatePresence>
        {showInput && (
          <motion.form
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            onSubmit={handleChatSubmit}
            className="absolute -bottom-14 bg-white dark:bg-slate-800 p-1.5 rounded-full shadow-lg flex items-center border border-violet-100 dark:border-slate-700 w-60 z-20"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="和小晴说点什么……"
              maxLength={2000}
              className="bg-transparent border-none outline-none text-sm px-3 py-1 w-full dark:text-white placeholder-gray-400"
              disabled={isThinking}
              autoFocus
            />
            <button
              type="submit"
              disabled={isThinking || !inputValue.trim()}
              className={`rounded-full p-1.5 ml-1 flex items-center justify-center transition-colors ${isThinking || !inputValue.trim() ? 'bg-gray-300 text-gray-500' : 'bg-violet-500 hover:bg-violet-600 text-white'}`}
              aria-label="发送"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
              </svg>
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
