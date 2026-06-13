"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";

export type SidebarNavItem = {
  key: string;
  label: string;
  href: string;
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
        {items.map((item) => {
          const path = item.href.split("?")[0];
          const active = item.highlight !== false && pathname === path;
          return (
            <button
              key={item.key}
              onClick={() => router.push(item.href)}
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
