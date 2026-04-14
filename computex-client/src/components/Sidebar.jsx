import React from "react";
import NavItem from "./NavItem";
import { FaHome, FaUserCircle, FaFileAlt, FaChartBar, FaCogs } from "react-icons/fa";

export default function Sidebar({ toggleTheme }) {
  return (
    <aside className="w-56 bg-[#1f2937] dark:bg-gray-900 text-white flex flex-col p-6 space-y-6">
      <div className="flex items-center space-x-3 mb-8">
        <div className="w-10 h-10 rounded-lg bg-[#2563EB] flex items-center justify-center font-bold">
          CX
        </div>
        <span className="font-semibold text-lg">ComputeX</span>
      </div>
      <nav className="flex-1 space-y-3">
        <NavItem icon={<FaHome />} label="Dashboard" active />
        <NavItem icon={<FaUserCircle />} label="Profile" />
        <NavItem icon={<FaFileAlt />} label="Files" />
        <NavItem icon={<FaChartBar />} label="Usage Data" />
        <NavItem icon={<FaCogs />} label="Settings" />
      </nav>
      <button
        onClick={toggleTheme}
        className="mt-auto px-4 py-2 bg-[#2563EB] rounded-md font-semibold"
      >
        Toggle Theme
      </button>
    </aside>
  );
}
