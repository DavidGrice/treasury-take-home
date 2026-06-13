"use client";
import React from "react";
import MatchBadge from "./MatchBadge";

// shared "label + editable control + match badge" row used by the batch
// correction form
export default function EditableFieldRow({
  label,
  matchStatus,
  children,
}: {
  label: string;
  matchStatus?: boolean | "no-input";
  children: React.ReactNode;
}) {
  return (
    <div className="form-row">
      <label className="text-sm">{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {children}
        <MatchBadge status={matchStatus} />
      </div>
    </div>
  );
}
