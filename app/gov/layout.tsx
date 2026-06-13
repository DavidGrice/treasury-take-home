"use client";

import React from "react";
import SidebarNav, { type SidebarNavItem } from "@/components/ui/SidebarNav";

const NAV_ITEMS: SidebarNavItem[] = [
  { key: "queue", label: "My Queue", href: "/gov/queue" },
  { key: "stats", label: "Reviewer Stats", href: "/gov/stats" },
];

export default function GovLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 24, padding: 24, alignItems: "flex-start" }}>
      <SidebarNav items={NAV_ITEMS} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
