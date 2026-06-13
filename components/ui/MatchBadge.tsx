"use client";
import React from "react";

// per-field match badge - 'no-input' fields (nothing to compare yet) show nothing
export default function MatchBadge({ status }: { status: boolean | "no-input" | undefined }) {
  if (status === undefined || status === "no-input") return null;
  return (
    <span style={{ flexShrink: 0, fontSize: 12, whiteSpace: "nowrap", color: status ? "#166534" : "#991b1b" }}>
      {status ? "✓ matched" : "✗ not found"}
    </span>
  );
}
