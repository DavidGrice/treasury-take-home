"use client";
import React from "react";

export default function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 700, color: "#000", textAlign: "center" }}>
      {children}
    </h3>
  );
}
