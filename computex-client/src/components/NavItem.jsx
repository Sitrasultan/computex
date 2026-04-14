import React from "react";

export default function NavItem({ icon, label, active }) {
  return (
    <div
      className={`flex items-center space-x-3 p-2 rounded-md cursor-pointer hover:bg-gray-700 ${
        active ? "bg-gray-700" : ""
      }`}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}
