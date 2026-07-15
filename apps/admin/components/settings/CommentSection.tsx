import { motion } from "framer-motion";
import { GitBranch, Save, User } from "lucide-react";

interface CommentSectionProps {
  formData: any;
  handleUpdate: (field: string, value: any) => void;
  pushToQueue: (label: string, key?: string, value?: any) => void;
}

export default function CommentSection({ formData, handleUpdate, pushToQueue }: CommentSectionProps) {
  // The legacy key name is retained so existing siteConfig files remain compatible.
  const config = formData.gitalkConfig || {
    clientID: "",
    clientSecret: "",
    repo: "",
    owner: "",
    admin: [],
  };

  const update = (key: "repo" | "owner", value: string) => {
    handleUpdate("gitalkConfig", {
      ...config,
      clientID: "",
      clientSecret: "",
      admin: [],
      [key]: value,
    });
  };

  const saveToQueue = () => {
    pushToQueue("GitHub Issues 评论系统", "gitalkConfig", {
      clientID: "",
      clientSecret: "",
      repo: config.repo || "",
      owner: config.owner || "",
      admin: [],
    });
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col gap-6"
    >
      <div className="rounded-[40px] border border-white/50 bg-white/40 p-8 shadow-xl backdrop-blur-xl dark:border-slate-800/50 dark:bg-slate-900/40">
        <div className="mb-8 flex items-center justify-between border-b border-white/30 pb-6 dark:border-slate-700/50">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-black text-slate-800 dark:text-white">
              <span>💬</span> 评论系统配置
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              使用 Utterances 将评论保存为 GitHub Issues，无需 OAuth Client Secret。
            </p>
          </div>
          <button
            type="button"
            onClick={saveToQueue}
            className="flex items-center gap-2 rounded-2xl bg-indigo-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-indigo-500/30 transition-colors hover:bg-indigo-600"
          >
            <Save size={16} /> 保存修改
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
              <GitBranch size={14} className="text-slate-600 dark:text-slate-300" />
              GitHub 仓库名
            </label>
            <input
              type="text"
              value={config.repo || ""}
              onChange={(event) => update("repo", event.target.value)}
              className="w-full rounded-xl bg-white/50 px-4 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800/50 dark:text-slate-200"
              placeholder="例如: blog-comments"
            />
          </div>
          <div>
            <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
              <User size={14} className="text-blue-400" />
              仓库拥有者
            </label>
            <input
              type="text"
              value={config.owner || ""}
              onChange={(event) => update("owner", event.target.value)}
              className="w-full rounded-xl bg-white/50 px-4 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800/50 dark:text-slate-200"
              placeholder="你的 GitHub 用户名"
            />
          </div>
        </div>

        <p className="mt-5 text-xs leading-6 text-slate-500 dark:text-slate-400">
          仓库必须公开，并安装 Utterances GitHub App。评论脚本只接收 owner/repo，不会读取或保存 GitHub 密钥。
        </p>
      </div>
    </motion.section>
  );
}

