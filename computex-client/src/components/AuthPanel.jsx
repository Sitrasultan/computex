import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import LoginForm from "./LoginForm";
import SignupForm from "./SignupForm";

export default function AuthPanel() {
  const [tab, setTab] = useState("login");

  return (
    <div className="auth-card w-full max-w-md relative overflow-hidden">
      {/* top tech header */}
      <div className="absolute top-0 left-0 w-full h-12 bg-gradient-to-r from-white/30 to-transparent blur-sm pointer-events-none"></div>

      <div className="flex w-full mb-4">
        <button onClick={() => setTab("login")}
          className={`tab-btn ${tab === "login" ? "tab-active" : ""}`}>Login</button>
        <button onClick={() => setTab("signup")}
          className={`tab-btn ${tab === "signup" ? "tab-active" : ""}`}>Sign Up</button>
      </div>

      <div className="mt-2">
        <AnimatePresence exitBeforeEnter>
          {tab === "login" ? (
            <motion.div key="login" initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }} transition={{ duration: 0.35 }}>
              <LoginForm />
            </motion.div>
          ) : (
            <motion.div key="signup" initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }} transition={{ duration: 0.35 }}>
              <SignupForm />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 text-xs text-gray-600 dark:text-gray-400">
        By creating an account you agree to our <a href="/terms" className="text-blue-600 dark:text-blue-300">Terms</a>.
      </div>
    </div>
  );
}

