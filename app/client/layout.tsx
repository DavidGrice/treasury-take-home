"use client";

import React from "react";
import SidebarNav, { type SidebarNavItem } from "@/components/ui/SidebarNav";
import { NavLoadingProvider, useNavLoadingState } from "@/lib/context/NavLoadingContext";

const NAV_ITEMS: SidebarNavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/client/dashboard" },
  { key: "new-form", label: "New Form", href: "/client/dashboard?new=1", highlight: false },
  { key: "bulk-upload", label: "Bulk Upload", href: "/client/bulk-upload" },
  { key: "batch-review", label: "Batch Review", href: "/client/batch-review" },
];

function ClientLayoutContent({ children }: { children: React.ReactNode }) {
  const navLoading = useNavLoadingState();
  return (
    <div style={{ display: "flex", gap: 12, padding: 24, alignItems: "flex-start", maxWidth: 1412, margin: "0 auto" }}>
      <SidebarNav items={NAV_ITEMS} disabled={navLoading} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <NavLoadingProvider>
      <ClientLayoutContent>{children}</ClientLayoutContent>
    </NavLoadingProvider>
  );
}
