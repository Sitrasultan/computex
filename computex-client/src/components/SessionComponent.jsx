import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export default function SessionComponent() {
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      <motion.button
        onClick={() => navigate("/sessions/new")}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        className="w-full rounded-2xl bg-gradient-to-r from-sky-500 to-purple-600 px-6 py-4 text-left text-white shadow-lg"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-sm font-semibold">
            GO
          </div>
          <div>
            <div className="text-sm font-semibold">Start Session</div>
          </div>
        </div>
      </motion.button>
    </div>
  );
}

