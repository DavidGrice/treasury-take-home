"use client";
import React from "react";

// group of checkboxes used to pick rejection reasons from a list of fields
export default function ChecklistGroup({
  title,
  items,
  selected,
  onToggle,
}: {
  title?: string;
  items: Array<{ key: string; label: string }>;
  selected: Record<string, boolean>;
  onToggle: (key: string, checked: boolean) => void;
}) {
  return (
    <>
      {title && <p style={{ color: "#666", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {items.map((f) => (
          <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={!!selected[f.key]}
              onChange={(e) => onToggle(f.key, e.target.checked)}
            />
            {f.label}
          </label>
        ))}
      </div>
    </>
  );
}
