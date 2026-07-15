import 'katex/dist/katex.min.css';
import 'lenis/dist/lenis.css';
import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import BackgroundEffects from "../components/BackgroundEffects";
import { MusicProvider } from "../components/MusicProvider";
import FloatingPlayer from "../components/FloatingPlayer";
import { siteConfig } from "../siteConfig";
import ClickEffect from "../components/ClickEffect";
import BackgroundSlider from "../components/BackgroundSlider";
import GlobalToolbox from "../components/GlobalToolbox";
import SplashScreen from "../components/SplashScreen";
import CyberCat from '../components/CyberCat';
import DanmakuBackground from '../components/DanmakuBackground';

import MobileBackButton from '../components/MobileBackButton';
import SmoothScroll from '../components/SmoothScroll';

export const metadata: Metadata = {
  title: siteConfig.title,
  description: siteConfig.bio,
  icons: {
    icon: siteConfig.faviconUrl,
    apple: siteConfig.faviconUrl,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <style
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              #app-mount-root { opacity: 0; visibility: hidden; pointer-events: none; }
              html.splash-seen #app-mount-root { opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; }
            `
          }}
        />
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (sessionStorage.getItem('hasSeenSplash') === 'true') {
                  document.documentElement.classList.add('splash-seen');
                }
              } catch (e) {}
            `
          }}
        />
      </head>

      <body className="w-screen overflow-x-hidden min-h-full flex flex-col relative transition-colors duration-1000 bg-slate-50 dark:bg-slate-950 font-serif">
        <SmoothScroll />
        <ThemeProvider>

          <SplashScreen />

          <MusicProvider>
            <div id="app-mount-root" className="relative isolate flex-1 flex flex-col transition-opacity duration-1000">
              <div
                className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
                style={{
                  contain: 'layout paint style',
                  transform: 'translateZ(0)',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden'
                }}
              >
                {!siteConfig.useGradient && <BackgroundSlider />}
                <div className="absolute inset-0 z-[1] bg-transparent dark:bg-slate-900/55 transition-colors duration-1000"></div>

                {siteConfig.useGradient && (
                  <div
                    className="absolute inset-0 z-[2] opacity-60 dark:opacity-20 mix-blend-color transition-opacity duration-1000 transform-gpu"
                    style={{
                      background: `linear-gradient(-45deg, ${siteConfig.themeColors.join(', ')})`,
                      backgroundSize: '400% 400%',
                      animation: 'gradientMove 15s ease infinite' // 🌟 全端保留渐变流动
                    }}
                  ></div>
                )}

                {siteConfig.useGradient && (
                  <>
                    <div className="absolute top-[-10%] left-[-10%] z-[3] w-[40%] h-[40%] bg-white/40 dark:bg-indigo-900/20 blur-[100px] rounded-full md:mix-blend-overlay"></div>
                    <div className="absolute bottom-[-10%] right-[-10%] z-[3] w-[40%] h-[40%] bg-indigo-400/30 dark:bg-purple-900/30 blur-[100px] rounded-full md:mix-blend-overlay"></div>
                  </>
                )}

                {/* 隐藏手机端高负载粒子特效 */}
                <div className="hidden md:block absolute inset-0 w-full h-full">
                  <BackgroundEffects />
                </div>
              </div>

              {/* 隐藏手机端弹幕 */}
              <div className="hidden md:block">
                <DanmakuBackground />
              </div>

              <div className="relative z-10 flex-1 flex flex-col">
                {children}
              </div>

              <div className="hidden md:block">
                <FloatingPlayer />
              </div>

              <div className="hidden md:block">
                <GlobalToolbox />
              </div>

              <div className="md:hidden block">
                <MobileBackButton />
              </div>

              {/* 隐藏手机端点击粒子 */}
              <div className="hidden md:block">
                <ClickEffect />
              </div>
            </div>

            <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `
              @keyframes gradientMove { 
                0% { background-position: 0% 50%; } 
                50% { background-position: 100% 50%; } 
                100% { background-position: 0% 50%; } 
              }
            `}} />
          </MusicProvider>

          <div className="hidden md:block">
            <CyberCat />
          </div>

        </ThemeProvider>
      </body>
    </html>
  );
}
