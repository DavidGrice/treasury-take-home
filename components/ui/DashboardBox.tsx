"use client";
import React from "react";

type DashboardBoxProps = {
  topItems?: React.ReactNode[];
  children?: React.ReactNode; // bottom area
};

export default function DashboardBox({ topItems = [], children }: DashboardBoxProps) {
  return (
    <div className="dashboard-box">
      <div className="dashboard-top" style={{ gridTemplateColumns: `repeat(${topItems.length}, 1fr)` }}>
        {topItems.map((item, i) => (
          <div className="dashboard-top-item" key={i}>{item}</div>
        ))}
      </div>

      <div className="dashboard-bottom">{children}</div>
    </div>
  );
}
