// Public template defaults. Replace these values in the admin settings page.
export const siteConfig = {
  title: "Xinghui Blog",
  faviconUrl: "/avatar.svg",
  authorName: "Your Name",
  bio: "A personal space for notes, projects, photos and ideas.",

  navTitle: "YOUR NAME",
  navSuffix: "の",
  navAfter: "BLOG",

  avatarUrl: "/avatar.svg",

  useGradient: true,
  themeColors: ["#eef2ff", "#f5f3ff", "#fdf2f8", "#ecfeff"],
  bgImages: ["/placeholder.svg"],
  backgroundMode: "slideshow",
  scrollBackgroundImages: ["/placeholder.svg"],
  scrollBackgroundDuration: 45,

  defaultPostCover: "/placeholder.svg",
  photoWallImage: "/placeholder.svg",

  cloudMusicIds: [],
  social: {
    github: "",
    gitee: "",
    google: "",
    website: "",
    bilibili: "",
    email: "",
    qq: "",
    wechat: "",
  },

  counts: {
    photos: 0,
  },

  chatterTitle: "Chatter",
  chatterDescription: "Short notes, daily fragments and ideas.",

  picBedName: "Image host",
  picBedUrl: "",
  picBedToken: "",

  danmakuList: [
    "Welcome to Xinghui Blog",
    "Write something worth remembering",
    "Build in public, keep secrets private",
  ],

  gitalkConfig: {
    clientID: "",
    clientSecret: "",
    repo: "",
    owner: "",
    admin: [""],
  },

  buildDate: "2026-01-01T00:00:00",

  footerBadges: [
    {
      name: "Next.js",
      color: "text-slate-700 dark:text-slate-200",
      svg: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z"/>',
    },
    {
      name: "React",
      color: "text-cyan-500",
      svg: '<path d="M12 10.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"/>',
    },
    {
      name: "Tailwind CSS",
      color: "text-teal-500",
      svg: '<path d="M12 6c-3 0-4.9 1.5-5.6 4.5 1.1-1.5 2.4-2 3.9-1.7 2 .5 2.8 2.7 5.3 2.7 3 0 4.9-1.5 5.6-4.5-1.1 1.5-2.4 2-3.9 1.7C15.3 8.2 14.5 6 12 6Z"/>',
    },
  ],

  icpConfig: {
    name: "",
    link: "",
  },

  geminiConfig: {
    apiBaseUrl: "https://api.deepseek.com",
    modelId: "deepseek-v4-flash",
    systemPrompt: "You are the concise and friendly assistant for this blog. Answer in the visitor's language, do not invent site data, and never reveal secrets.",
    maxOutputTokens: 150,
    temperature: 0.75,
  },

  friendLinkApplyFormat:
    "Name: Example Blog\nDescription: A personal blog\nURL: https://example.com\nAvatar: https://example.com/avatar.svg",
};

