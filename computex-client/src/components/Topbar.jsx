import React from "react";
import { FaBell, FaUserCircle } from "react-icons/fa";

export default function Topbar() {
  return (
    <div className="flex justify-between items-center mb-8">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="flex items-center space-x-4">
        <div className="relative">
          <FaBell className="text-2xl" />
          <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full" />
        </div>
        <FaUserCircle className="text-3xl" />
      </div>
    </div>
  );
}
