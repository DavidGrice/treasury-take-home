"use client";
import React from "react";

// read-only "label + value" row used throughout the review modals
// (.field-row / .field-label / .field-input are defined in globals.css)
export default function FieldRow({
  label,
  value,
  background = "#f9f9f9",
  monospace,
  labelExtra,
}: {
  label: string;
  value?: React.ReactNode;
  background?: string;
  monospace?: boolean;
  labelExtra?: React.ReactNode;
}) {
  return (
    <div className="field-row">
      <label className="field-label" style={labelExtra ? { display: "flex", alignItems: "center", gap: 6 } : undefined}>
        {labelExtra}
        {label}
      </label>
      <div className="field-input" style={{ background, ...(monospace ? { fontFamily: "monospace" } : {}) }}>
        {value || "—"}
      </div>
    </div>
  );
}
