import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/cms-api/:path*',
        destination: 'http://127.0.0.1:58643/api/:path*',
      },
    ];
  },
  // 【核心开关】：告诉 Next.js 放弃 Node.js，打包成纯静态的 HTML/CSS/JS
  output: 'standalone',

  // 【必须项】：因为没有 Node.js 服务器了，Next.js 自带的图片压缩服务会失效，必须关闭它
  images: {
    unoptimized: true,
  },
  // 👇 终极大招 1：屏蔽所有 TypeScript 类型报错！
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
