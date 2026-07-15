import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import ChatterBoard from './ChatterBoard';

interface ChatterRecord {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  mood?: string;
  cover?: string;
  content: string;
}

export const metadata = {
  title: "杂谈 | Xinghui Blog",
  description: "日常碎片与灵感记录",
};

export default function ChatterPage() {
  const chattersDirectory = path.join(process.cwd(), 'chatters');
  let chatters: ChatterRecord[] = [];

  try {
    if (!fs.existsSync(chattersDirectory)) {
      fs.mkdirSync(chattersDirectory);
    }

    const fileNames = fs.readdirSync(chattersDirectory).filter(fileName => fileName.endsWith('.md'));

    chatters = fileNames.map(fileName => {
      const slug = fileName.replace(/\.md$/, '');
      const fileContents = fs.readFileSync(path.join(chattersDirectory, fileName), 'utf8');
      const { data, content } = matter(fileContents);

      return {
        slug,
        title: data.title || '',
        date: data.date || '1970-01-01', // 👇 核心修复：加上日期兜底防崩溃
        tags: data.tags || [],
        mood: data.mood || '',
        cover: data.cover || '',
        content: content.replace(/^#+ .*\n/m, '')
      };
    }).sort((a, b) => (new Date(b.date).getTime() - new Date(a.date).getTime()));
  } catch (e) {
    console.error("读取杂谈文件失败:", e);
  }

  return (
    <div className="min-h-screen relative pb-10">
      <div className="fixed inset-0 z-0 pointer-events-none bg-cover bg-center opacity-35 dark:opacity-20" style={{ backgroundImage: "url('/placeholder.svg')" }} />
      <Navbar />
      <PageTransition>
        <ChatterBoard chatters={chatters} />
      </PageTransition>
    </div>
  );
}
