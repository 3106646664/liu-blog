import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import ProjectsBoard from './ProjectsBoard';

export const metadata = {
  title: "项目矩阵 | Xinghui Blog",
  description: "开源项目与代码仓库展示",
};

export default function ProjectsPage() {
  return (
    <div className="min-h-screen relative pb-20">
      <div className="fixed inset-0 z-0 pointer-events-none bg-cover bg-center opacity-35 dark:opacity-20" style={{ backgroundImage: "url('/placeholder.svg')" }} />
      <Navbar />
      <PageTransition>
        <div className="mt-28">
          <ProjectsBoard />
        </div>
      </PageTransition>
    </div>
  );
}
