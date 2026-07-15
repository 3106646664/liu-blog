"use client";
import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import { siteConfig } from '../siteConfig';

const pageWallpaperPaths: string[] = [
  '/about',
  '/chatter',
  '/friends',
  '/moments',
  '/music',
  '/photowall',
  '/projects',
  '/timeline'
];

export default function BackgroundSlider() {
  const [index, setIndex] = useState(0);
  const pathname = usePathname();
  const images = siteConfig.bgImages;
  const scrollImages = siteConfig.scrollBackgroundImages ?? [];
  const isContinuous = siteConfig.backgroundMode === 'continuous' && scrollImages.length > 0;
  const scrollDuration = Math.max(10, Number(siteConfig.scrollBackgroundDuration) || 45);
  const hasPageWallpaper = pageWallpaperPaths.includes(pathname);

  useEffect(() => {
    if (isContinuous || images.length <= 1) return;

    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 10000); // 10秒切换一次

    return () => clearInterval(timer);
  }, [images.length, isContinuous]);

  if (hasPageWallpaper) {
    return null;
  }

  if (isContinuous) {
    const trackStyle = {
      '--background-scroll-duration': `${scrollDuration}s`,
    } as CSSProperties;

    return (
      <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="continuous-background-track" style={trackStyle}>
          {[0, 1].map((groupIndex) => (
            <div className="continuous-background-group" key={groupIndex}>
              {scrollImages.map((img, imageIndex) => (
                <div className="continuous-background-panel" key={`${groupIndex}-${img}-${imageIndex}`}>
                  <img
                    src={img}
                    alt=""
                    draggable={false}
                    className="h-full w-full select-none object-cover object-center"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        <style jsx>{`
          .continuous-background-track {
            display: flex;
            height: 100%;
            width: max-content;
            contain: layout paint style;
            transform-origin: left center;
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
            will-change: transform;
            animation: continuous-background-scroll var(--background-scroll-duration) linear infinite;
          }

          .continuous-background-group {
            display: flex;
            flex: none;
            height: 100%;
          }

          .continuous-background-panel {
            flex: none;
            height: 100%;
            width: max(100vw, calc(100vh * 1.7768331562));
            overflow: hidden;
            transform: translateZ(0);
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
          }

          .continuous-background-panel :global(img) {
            display: block;
            transform: translateZ(0);
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
          }

          @keyframes continuous-background-scroll {
            from {
              transform: translate3d(0, 0, 0);
            }
            to {
              transform: translate3d(-50%, 0, 0);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .continuous-background-track {
              animation-play-state: paused;
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      {images.map((img, i) => (
        <div
          key={img}
          className="absolute inset-0 transition-opacity duration-[2000ms] ease-in-out transform-gpu"
          style={{
            backgroundImage: `url(${img})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            // 当前显示的图片 opacity 为 1，其他的为 0
            opacity: i === index ? 1 : 0,
            // 解决层级重叠导致的渲染压力
            visibility: Math.abs(i - index) <= 1 || (i === images.length - 1 && index === 0) ? 'visible' : 'hidden'
          }}
        />
      ))}
    </div>
  );
}
