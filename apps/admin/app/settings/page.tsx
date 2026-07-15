"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOperations } from '../../context/OperationContext';
import { siteConfig } from '../../siteConfig';
import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import { ToastProvider, useToast } from '../../components/ToastProvider';

import ProfileSection from '../../components/settings/ProfileSection';
import BackgroundSection from '../../components/settings/BackgroundSection';
import MusicSection from '../../components/settings/MusicSection';
import GallerySection from '../../components/settings/GallerySection';
import RepoSection from '../../components/settings/RepoSection';
import DisplaySection from '../../components/settings/DisplaySection';
import CommentSection from '../../components/settings/CommentSection';
import DanmakuSection from '../../components/settings/DanmakuSection';
import FooterSection from '../../components/settings/FooterSection';
// 👇 🌟 引入刚写的 AI 配置组件
import AICatSection from '../../components/settings/AICatSection';

function SettingsContent() {
  const { operations, addOperation } = useOperations();
  const [activeTab, setActiveTab] = useState('profile');
  const { showToast } = useToast();

  const [formData, setFormData] = useState<any>({
    authorName: siteConfig.authorName || "",
    bio: siteConfig.bio || "",
    avatarUrl: siteConfig.avatarUrl || "",
    social: siteConfig.social || {},
    cloudMusicIds: [...(siteConfig.cloudMusicIds || [])],
    bgImages: [...(siteConfig.bgImages || [])],
    backgroundMode: siteConfig.backgroundMode || 'slideshow',
    scrollBackgroundImages: [...(siteConfig.scrollBackgroundImages || [])],
    scrollBackgroundDuration: siteConfig.scrollBackgroundDuration || 45,
    gitalkConfig: siteConfig.gitalkConfig || {
      clientID: '',
      clientSecret: '',
      repo: '',
      owner: '',
      admin: []
    },
    danmakuList: [...(siteConfig.danmakuList || [])],
    buildDate: siteConfig.buildDate || "2026-03-23T00:00:00",
    icpConfig: siteConfig.icpConfig || { name: "", link: "" },
    footerBadges: [...(siteConfig.footerBadges || [])],
    // 👇 🌟 初始化小猫 AI 配置数据
    geminiConfig: siteConfig.geminiConfig || {
      apiBaseUrl: 'https://api.deepseek.com',
      modelId: 'deepseek-v4-flash',
      systemPrompt: '',
      maxOutputTokens: 150,
      temperature: 0.75
    }
  });

  useEffect(() => {
    const fetchRealConfig = async () => {
      try {
        const configRes = await fetch(`/backend_config.json?t=${Date.now()}`);
        const configData = await configRes.json();

        const res = await fetch(`/cms-api/config/get`, { cache: 'no-store' });
        const data = await res.json();

        if (data.success && data.data) {
          console.log("✅ 成功从后端拉取到真实配置:", data.data);
          setFormData((prev: any) => ({
            ...prev,
            ...data.data,
            social: { ...(prev.social || {}), ...(data.data.social || {}) },
            gitalkConfig: { ...(prev.gitalkConfig || {}), ...(data.data.gitalkConfig || {}) },
            danmakuList: data.data.danmakuList ? [...data.data.danmakuList] : prev.danmakuList,
            buildDate: data.data.buildDate || prev.buildDate,
            icpConfig: data.data.icpConfig || prev.icpConfig,
            footerBadges: data.data.footerBadges ? [...data.data.footerBadges] : prev.footerBadges,
            // 👇 🌟 合并后端发来的小猫配置
            geminiConfig: { ...(prev.geminiConfig || {}), ...(data.data.geminiConfig || {}) }
          }));
        } else {
          console.error("❌ 后端返回失败:", data.message);
          showToast("读取后端配置失败，当前显示为本地静态数据", "warning");
        }
      } catch (error) {
        console.error("❌ 请求后端配置通道断开:", error);
        showToast("无法连接到 Python 后端服务", "error");
      }
    };

    fetchRealConfig();
  }, []);

  const handleUpdate = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const pushToQueue = (label: string, key?: string, value?: any) => {
    addOperation({
      id: Date.now().toString(),
      type: 'CONFIG',
      label: `配置暂存：${label}`,
      description: `修改了系统的 ${label}，等待写入本地前台并推送到 GitHub`,
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
      payload: formData,
      key: key,
      value: value
    });
    showToast(`🎉 【${label}】已加入右上角操作队列！`, "success");
  };

  // 👇 🌟 在菜单里增加 AI 猫咪入口
  const menuItems = [
    { id: 'profile', name: '个人名片设置', icon: '👤' },
    { id: 'display', name: '视窗画面设置', icon: '🪟' },
    { id: 'background', name: '视觉背景配置', icon: '🌌' },
    { id: 'music', name: '音乐播放设置', icon: '🎵' },
    { id: 'gallery', name: '图库配置管理', icon: '🖼️' },
    { id: 'footer', name: '首页底部设置', icon: '🧩' },
    { id: 'danmaku', name: '全站弹幕设置', icon: '⚡' },
    { id: 'comment', name: '评论系统配置', icon: '💬' },
    { id: 'aicat', name: 'AI 小晴助手', icon: '💜' },
    { id: 'repo', name: '项目仓库设置', icon: '🚀' },
  ];

  return (
    <div className="min-h-screen relative pb-10">
      <Navbar />

      <PageTransition>
        <main className="w-[95%] max-w-7xl mx-auto mt-24 flex flex-col md:flex-row gap-8 items-start relative z-10">

          <div className="w-full md:w-72 shrink-0 flex flex-col gap-4">
            <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/50 dark:border-slate-800/50 rounded-3xl p-4 shadow-xl">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-4 ml-2 tracking-widest">系统管理维度</p>
              <nav className="flex flex-col gap-2">
                {menuItems.map((item) => (
                  <button key={item.id} onClick={() => setActiveTab(item.id)} className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 font-bold text-sm ${activeTab === item.id ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 translate-x-1' : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50'}`}>
                    <span>{item.icon}</span>{item.name}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          <div className="flex-1 w-full">
            <AnimatePresence mode="wait">
              {activeTab === 'profile' && <ProfileSection key="profile" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'display' && <DisplaySection key="display" />}
              {activeTab === 'background' && <BackgroundSection key="background" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'music' && <MusicSection key="music" />}
              {activeTab === 'gallery' && <GallerySection key="gallery" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'footer' && <FooterSection key="footer" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'danmaku' && <DanmakuSection key="danmaku" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {activeTab === 'comment' && <CommentSection key="comment" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}
              {/* 👇 🌟 挂载 AI 猫咪面板 */}
              {activeTab === 'aicat' && <AICatSection key="aicat" formData={formData} handleUpdate={handleUpdate} pushToQueue={pushToQueue} />}

              {activeTab === 'repo' && <RepoSection key="repo" />}
            </AnimatePresence>
          </div>

        </main>
      </PageTransition>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ToastProvider>
      <SettingsContent />
    </ToastProvider>
  );
}
