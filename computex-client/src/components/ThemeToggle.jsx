import useTheme from "../hooks/useTheme";
import { motion } from "framer-motion";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <motion.button
      onClick={toggleTheme}
      initial={{ rotate: 0 }}
      animate={{ rotate: theme === "light" ? 0 : 360 }}
      transition={{ duration: 0.6 }}
      className="p-2 rounded-full bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 shadow-sm"
      title="Toggle theme"
    >
      {theme === "light" ? "🌙" : "☀️"}
    </motion.button>
  );
}
