"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";

export type SidebarNavItem = {
  key: string;
  label: string;
  href?: string; // omit for action items that don't navigate (use onClick instead)
  onClick?: () => void;
  highlight?: boolean; // false = action item, never shown as "active" (default true)
};

// Persistent left-hand page navigation for the client/gov stacks, styled to
// match the existing FilterStat tabs (.dashboard-filter / --active).
export default function SidebarNav({ items, disabled = false }: { items: SidebarNavItem[]; disabled?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div style={{ width: 200, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="dashboard-box" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ padding: "8px 12px", fontSize: 13, fontWeight: 700, color: "#000", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Navigation
        </div>
        {items.map((item) => {
          const path = item.href ? item.href.split("?")[0] : null;
          const active = item.highlight !== false && path !== null && pathname === path;
          return (
            <button
              key={item.key}
              onClick={() => (item.onClick ? item.onClick() : router.push(item.href!))}
              disabled={disabled}
              className={`dashboard-filter${active ? " dashboard-filter--active" : ""}`}
              style={{
                textAlign: "left",
                border: active ? undefined : "1px solid transparent",
                background: active ? undefined : "transparent",
                font: "inherit",
                fontWeight: active ? 700 : 500,
                width: "100%",
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="dashboard-box" style={{ padding: 8 }}>
        <button
          onClick={() => router.push("/auth")}
          disabled={disabled}
          className="dashboard-filter"
          style={{
            textAlign: "left",
            border: "1px solid transparent",
            background: "transparent",
            font: "inherit",
            fontWeight: 500,
            width: "100%",
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          ⏻ Logout
        </button>
      </div>
    </div>
  );
}
