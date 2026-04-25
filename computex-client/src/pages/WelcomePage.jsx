import Hero from "../components/Hero";
import AuthPanel from "../components/AuthPanel";
import ThemeToggle from "../components/ThemeToggle";
import BrandLogo from "../components/BrandLogo";

export default function WelcomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition">
      {/* Header */}
      <header className="w-full flex justify-between items-center p-4">
        <BrandLogo size={42} textClassName="text-2xl" />
        <ThemeToggle />
      </header>

      {/* Main Content */}
      <main className="flex flex-col md:flex-row items-center justify-center flex-1 gap-10 px-6 py-10">
        <Hero />
        <AuthPanel />
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
        © {new Date().getFullYear()} ComputeX — Remote Desktop Computing
      </footer>
    </div>
  );
}
