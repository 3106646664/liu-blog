"use client";

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Save, Bot, Sparkles, Sliders, MessageSquareText, Cpu, Globe2, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';

export default function AICatSection({ formData, handleUpdate, pushToQueue }: any) {
  // 防止 undefined
  const config = formData.geminiConfig || {
    apiBaseUrl: 'https://api.deepseek.com',
    modelId: 'deepseek-v4-flash',
    systemPrompt: '',
    maxOutputTokens: 150,
    temperature: 0.75
  };

  // 🌟 核心防崩魔法：将系统提示词的状态独立出来
  const [localPrompt, setLocalPrompt] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyMessage, setKeyMessage] = useState('');

  // 初始化时，如果后端传来的是安全转义的 \n，我们把它还原成真实的换行，让文本框正常显示
  useEffect(() => {
    if (config.systemPrompt) {
      setLocalPrompt(config.systemPrompt.replace(/\\n/g, '\n'));
    }
  }, []); // 仅挂载时同步一次，防止死循环

  useEffect(() => {
    const loadKeyStatus = async () => {
      try {
        const response = await fetch('/cms-api/config/deepseek-key/status', { cache: 'no-store' });
        const data = await response.json();
        if (response.ok && data.success) setKeyConfigured(Boolean(data.configured));
      } catch {
        setKeyMessage('暂时无法读取密钥状态');
      }
    };
    loadKeyStatus();
  }, []);

  const updateConfig = (key: string, value: any) => {
    handleUpdate('geminiConfig', { ...config, [key]: value });
  };

  // 🌟 拦截文本框输入
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const realText = e.target.value;
    setLocalPrompt(realText); // 文本框里保持真实的物理换行，方便你阅读和编辑

    // ⚠️ 传给父组件和队列时，强行把物理换行替换为单行字面量 "\\n"
    // 这样 Python 写文件时就是安全的： systemPrompt: "第一行\n第二行" (不会断裂)
    const safeTextForBackend = realText.replace(/\n/g, '\\n');
    updateConfig('systemPrompt', safeTextForBackend);
  };

  const saveApiKey = async () => {
    const value = apiKey.trim();
    if (value.length < 10 || /\s/.test(value)) {
      setKeyMessage('请填写完整且不含空格的 API Key');
      return;
    }

    setKeyBusy(true);
    setKeyMessage('');
    try {
      const response = await fetch('/cms-api/config/deepseek-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: value }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || '保存失败');
      setApiKey('');
      setKeyConfigured(true);
      setKeyMessage('Key 已安全保存，并已对主站与后台即时生效');
    } catch (error) {
      setKeyMessage(error instanceof Error ? error.message : '保存失败，请稍后重试');
    } finally {
      setKeyBusy(false);
    }
  };

  const clearApiKey = async () => {
    if (!window.confirm('确定清除已保存的 DeepSeek API Key 吗？清除后 AI 对话会立即停止。')) return;
    setKeyBusy(true);
    setKeyMessage('');
    try {
      const response = await fetch('/cms-api/config/deepseek-key', { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || '清除失败');
      setApiKey('');
      setKeyConfigured(false);
      setKeyMessage('已清除 API Key');
    } catch (error) {
      setKeyMessage(error instanceof Error ? error.message : '清除失败，请稍后重试');
    } finally {
      setKeyBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, type: 'spring', stiffness: 100 }}
      className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/50 dark:border-slate-800/50 rounded-[40px] p-8 shadow-xl"
    >
      <div className="flex justify-between items-center mb-8 pb-6 border-b border-white/40 dark:border-slate-700/50">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3 tracking-tight">
            <Bot className="text-violet-500" size={28} /> AI 小晴助手配置
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-2 flex items-center gap-1.5">
            <Sparkles size={14} className="text-violet-400" /> DeepSeek 接口、模型与角色性格统一管理
          </p>
        </div>
        <button
          onClick={() => pushToQueue('AI 小晴助手配置')}
          className="px-6 py-3 bg-violet-500 hover:bg-violet-600 text-white font-black rounded-2xl shadow-lg shadow-violet-500/30 transition-all flex items-center gap-2 text-sm"
        >
          <Save size={16} /> 暂存至队列
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Server-only API Key */}
        <div className="rounded-3xl border border-violet-200/70 dark:border-violet-900/60 bg-violet-50/50 dark:bg-violet-950/20 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <label htmlFor="deepseek-api-key" className="flex items-center gap-2 text-sm font-black text-slate-700 dark:text-slate-200">
              <KeyRound size={17} className="text-violet-500" /> DeepSeek API Key
            </label>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${keyConfigured ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
              <ShieldCheck size={14} /> {keyConfigured ? '已安全配置' : '尚未配置'}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="deepseek-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="new-password"
              spellCheck={false}
              placeholder={keyConfigured ? '输入新 Key 可覆盖当前密钥' : '粘贴 DeepSeek API Key'}
              className="min-w-0 flex-1 bg-white/80 dark:bg-slate-950/70 border border-violet-200 dark:border-violet-900/70 rounded-2xl py-3.5 px-5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50 font-mono text-sm"
            />
            <button
              type="button"
              onClick={saveApiKey}
              disabled={keyBusy || !apiKey.trim()}
              className="px-5 py-3 rounded-2xl bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm transition-colors"
            >
              {keyBusy ? '处理中…' : keyConfigured ? '更新密钥' : '保存密钥'}
            </button>
            {keyConfigured && (
              <button
                type="button"
                onClick={clearApiKey}
                disabled={keyBusy}
                className="px-4 py-3 rounded-2xl border border-rose-200 dark:border-rose-900/60 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50 font-black text-sm transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={15} /> 清除
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 flex items-start gap-1.5">
            <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-500" /> 密钥仅写入服务器私密文件，不进入配置队列、前端代码、构建产物或 GitHub；保存后无需重新构建。
          </p>
          {keyMessage && <p className="text-xs font-bold text-violet-600 dark:text-violet-300 mt-2">{keyMessage}</p>}
        </div>

        {/* API Base URL */}
        <div className="group">
          <label className="flex items-center gap-2 text-sm font-black text-slate-700 dark:text-slate-300 mb-3">
            <Globe2 size={16} className="text-slate-400 group-focus-within:text-violet-500 transition-colors" /> API 站点地址 (Base URL)
          </label>
          <input
            type="url"
            value={config.apiBaseUrl || 'https://api.deepseek.com'}
            onChange={(e) => updateConfig('apiBaseUrl', e.target.value)}
            className="w-full bg-white/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl py-3.5 px-5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50 font-medium"
            placeholder="https://api.deepseek.com"
          />
          <p className="text-[11px] text-slate-400 mt-2 ml-1">填写 OpenAI 兼容接口的基础地址，不要追加 /chat/completions。</p>
        </div>

        {/* 模型 ID */}
        <div className="group">
          <label className="flex items-center gap-2 text-sm font-black text-slate-700 dark:text-slate-300 mb-3">
            <Cpu size={16} className="text-slate-400 group-focus-within:text-violet-500 transition-colors" /> 模型核心引擎 (Model ID)
          </label>
          <input
            type="text"
            value={config.modelId}
            onChange={(e) => updateConfig('modelId', e.target.value)}
            className="w-full bg-white/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl py-3.5 px-5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50 font-medium"
            placeholder="deepseek-v4-flash"
          />
          <p className="text-[11px] text-slate-400 mt-2 ml-1">右下角短对话默认使用 deepseek-v4-flash 的非思考模式。</p>
        </div>

        {/* System Prompt */}
        <div className="group">
          <label className="flex items-center gap-2 text-sm font-black text-slate-700 dark:text-slate-300 mb-3">
            <MessageSquareText size={16} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" /> 灵魂 Prompt (性格设定)
          </label>
          <textarea
            value={localPrompt} // 🌟 绑定本地的安全显示状态
            onChange={handlePromptChange} // 🌟 使用我们写的拦截函数
            className="w-full bg-white/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl py-4 px-5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50 min-h-[200px] resize-y font-medium text-sm leading-relaxed custom-scrollbar"
            placeholder="输入 AI 的性格、行为模式和约束..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Max Tokens */}
          <div className="group">
            <div className="flex justify-between items-center mb-3">
              <label className="flex items-center gap-2 text-sm font-black text-slate-700 dark:text-slate-300">
                <Sliders size={16} className="text-slate-400" /> 最大回复字数 (Tokens)
              </label>
              <span className="text-xs font-black text-violet-500 bg-violet-500/10 px-2 py-1 rounded-md">{config.maxOutputTokens}</span>
            </div>
            <input
              type="range"
              min="50"
              max="1000"
              step="10"
              value={config.maxOutputTokens}
              onChange={(e) => updateConfig('maxOutputTokens', Number(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-violet-500"
            />
          </div>

          {/* Temperature */}
          <div className="group">
            <div className="flex justify-between items-center mb-3">
              <label className="flex items-center gap-2 text-sm font-black text-slate-700 dark:text-slate-300">
                <Sparkles size={16} className="text-slate-400" /> 模型发散度 (Temperature)
              </label>
              <span className="text-xs font-black text-violet-500 bg-violet-500/10 px-2 py-1 rounded-md">{config.temperature}</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={config.temperature}
              onChange={(e) => updateConfig('temperature', Number(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-violet-500"
            />
            <p className="text-[11px] text-slate-400 mt-2">数值越大，回答越灵活；数值越小，回答越稳定严谨。</p>
          </div>
        </div>

      </div>
    </motion.div>
  );
}
