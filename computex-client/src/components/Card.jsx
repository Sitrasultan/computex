import React from "react";

const colorClasses = {
  blue: "bg-[#2563EB] text-white",
  green: "bg-[#10B981] text-white",
  orange: "bg-[#F59E0B] text-white",
  red: "bg-[#EF4444] text-white",
};

export default function Card({ title, value, color, children }) {
  return (
    <div
      className={`p-6 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 ${
        color ? colorClasses[color] : "bg-white dark:bg-gray-800"
      }`}
    >
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      {value && <p className="text-2xl font-bold">{value}</p>}
      {children}
    </div>
  );
}
