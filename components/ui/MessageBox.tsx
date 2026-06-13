"use client";
import React from "react";

const VARIANT_STYLES: Record<"error" | "success", React.CSSProperties> = {
  error: { background: "#fff5f5", border: "1px solid #fecaca" },
  success: { background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534" },
};

// small colored callout box used for inline errors, success messages, and
// flagged-issue summaries across the upload/review flows
export default function MessageBox({
  variant,
  style,
  children,
}: {
  variant: "error" | "success";
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div style={{ padding: 12, borderRadius: 6, ...VARIANT_STYLES[variant], ...style }}>
      {children}
    </div>
  );
}
