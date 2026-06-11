"use client";
import React from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 20 }}>
      <div style={{ width: 420, boxShadow: "0 2px 18px rgba(0,0,0,0.06)", padding: 24, borderRadius: 8 }}>
        {children}
      </div>
    </div>
  );
}
