"use client";
import React from "react";

type FilterStatProps = {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
};

export default function FilterStat({ label, count, active, onSelect }: FilterStatProps) {
  return (
    <div
      className={`dashboard-filter${active ? " dashboard-filter--active" : ""}`}
      onClick={onSelect}
    >
      <strong style={{ fontSize: 20 }}>{label}</strong>
      <div style={{ fontSize: 24, color: "#666" }}>{count}</div>
    </div>
  );
}
