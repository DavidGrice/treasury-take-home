"use client";

import React from "react";
import SidebarNav, { type SidebarNavItem } from "@/components/ui/SidebarNav";

const NAV_ITEMS: SidebarNavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/client/dashboard" },
  { key: "new-form", label: "New Form", href: "/client/dashboard?new=1", highlight: false },
  { key: "bulk-upload", label: "Bulk Upload", href: "/client/bulk-upload" },
  { key: "batch-review", label: "Batch Review", href: "/client/batch-review" },
];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 24, padding: 24, alignItems: "flex-start" }}>
      <SidebarNav items={NAV_ITEMS} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
