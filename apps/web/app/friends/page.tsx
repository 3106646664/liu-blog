import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import FriendsBoard from './FriendsBoard';
import {siteConfig} from "@/siteConfig";

export const metadata = {
  title: "友链 | " + siteConfig.title,
  description: "赛博空间里的有趣灵魂",
};

export default function FriendsPage() {
  return (
    <div className="min-h-screen relative pb-20">
      <div className="fixed inset-0 z-0 pointer-events-none bg-cover bg-center opacity-35 dark:opacity-20" style={{ backgroundImage: "url('/placeholder.svg')" }} />
      <Navbar />
      <PageTransition>
        <div className="mt-28">
          <FriendsBoard />
        </div>
      </PageTransition>
    </div>
  );
}
