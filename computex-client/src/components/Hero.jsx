import { motion } from "framer-motion";

export default function Hero() {
  return (
    <div className="relative max-w-xl text-center md:text-left">
      {/* Floating decorative shapes */}
      <motion.div
        className="hero-shape bg-gradient-to-r from-[#2563EB] to-[#22C1EE] rounded-full w-44 h-44 left-[-40px] top-[-40px] hidden md:block"
        initial={{ y: -10, x: -10, opacity: 0 }}
        animate={{ y: [ -10, 8, -10 ], opacity: 0.18 }}
        transition={{ duration: 6, repeat: Infinity, repeatType: "mirror" }}
        style={{ position: "absolute", zIndex: 0 }}
      />

      <motion.h2
        initial={{ y: 18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-gray-100 leading-tight z-10"
      >
        Access a powerful computer <br />
        <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#2563EB] to-[#22C1EE]">
          from any device.
        </span>
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="mt-4 text-gray-600 dark:text-gray-300 z-10"
      >
        Run compilers, IDEs and heavy tools from your phone, tablet, or laptop —
        with low latency and secure isolation.
      </motion.p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 z-10 relative">
        <motion.div whileHover={{ y: -6 }} className="p-4 rounded-xl bg-white/80 dark:bg-gray-800/60 shadow border">
          <p className="font-semibold text-gray-700 dark:text-gray-100">Low latency</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Optimized streaming</p>
        </motion.div>

        <motion.div whileHover={{ y: -6 }} className="p-4 rounded-xl bg-white/80 dark:bg-gray-800/60 shadow border">
          <p className="font-semibold text-gray-700 dark:text-gray-100">Secure isolation</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Ephemeral sessions</p>
        </motion.div>

        <motion.div whileHover={{ y: -6 }} className="p-4 rounded-xl bg-white/80 dark:bg-gray-800/60 shadow border">
          <p className="font-semibold text-gray-700 dark:text-gray-100">Device agnostic</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Works on any browser</p>
        </motion.div>
      </div>

      {/* Host Invitation (gradient card) */}
      <motion.div
        initial={{ scale: 0.98, opacity: 0.9 }}
        animate={{ scale: [0.98, 1.02, 0.98] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="mt-8 p-4 rounded-xl text-white shadow-lg bg-gradient-to-r from-[#0ea5e9] via-[#2563EB] to-[#60a5fa] border border-white/10"
      >
        <h3 className="font-semibold">Have a powerful PC?</h3>
        <p className="text-sm opacity-90">Become a host and earn while your machine idles.</p>
        <div className="mt-3">
          <a href="/host/register" className="inline-block px-4 py-2 bg-white text-[#2563EB] rounded-md font-semibold hover:opacity-95">Register as Host</a>
        </div>
      </motion.div>
    </div>
  );
}
