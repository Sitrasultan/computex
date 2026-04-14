import { useState, useEffect } from "react";
import axios from "axios";
import ContainerCard from "./ContainerCard"; // Make sure you have this component

function ActiveContainers({ theme = "light" }) {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);

  const isDark = theme === "dark";

  // Fetch active hosts
  useEffect(() => {
    const fetchActiveHosts = async () => {
      try {
        const res = await axios.get("/api/active-hosts", { withCredentials: true });
        setContainers(res.data.active_hosts);
      } catch (err) {
        console.error("Error fetching active hosts:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchActiveHosts();

    // Optional: Poll every 10 seconds for updates
    const interval = setInterval(fetchActiveHosts, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={`rounded-3xl p-4 shadow-[0_18px_45px_rgba(0,0,0,0.55)] ${
        isDark
          ? "bg-slate-800/50 backdrop-blur-md border border-white/10"
          : "bg-gradient-to-br from-purple-50/80 to-indigo-50/80 backdrop-blur-md border border-purple-100/50"
      }`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2 sm:gap-0">
        <h3 className={`text-sm font-semibold ${isDark ? "text-slate-400" : "text-slate-700"}`}>
          Active Containers
        </h3>
        <div className={`text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
          Real-time telemetry
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className={`text-center py-6 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
          Loading...
        </div>
      ) : containers.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {containers.map((c) => (
            <ContainerCard key={c.id} c={c} theme={theme} />
          ))}
        </div>
      ) : (
        <div className={`text-center py-6 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
          No active containers
        </div>
      )}
    </div>
  );
}

export default ActiveContainers;
