"use client";
import React from "react";

type DashboardBoxProps = {
  topLeft?: React.ReactNode;
  topCenter?: React.ReactNode;
  topRight?: React.ReactNode;
  children?: React.ReactNode; // bottom area
};

export default function DashboardBox({ topLeft, topCenter, topRight, children }: DashboardBoxProps) {
  return (
    <div className="dashboard-box">
      <div className="dashboard-top">
        <div className="dashboard-top-item">{topLeft}</div>
        <div className="dashboard-top-item">{topCenter}</div>
        <div className="dashboard-top-item">{topRight}</div>
      </div>

      <div className="dashboard-bottom">{children}</div>
    </div>
  );
}
