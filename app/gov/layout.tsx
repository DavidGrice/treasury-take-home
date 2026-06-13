"use client";

import React from "react";
import SidebarNav, { type SidebarNavItem } from "@/components/ui/SidebarNav";
import { NavLoadingProvider, useNavLoadingState } from "@/lib/context/NavLoadingContext";

const NAV_ITEMS: SidebarNavItem[] = [
  { key: "queue", label: "My Queue", href: "/gov/queue" },
  { key: "stats", label: "Reviewer Stats", href: "/gov/stats" },
];

function GovLayoutContent({ children }: { children: React.ReactNode }) {
  const navLoading = useNavLoadingState();
  return (
    <div style={{ display: "flex", gap: 12, padding: 24, alignItems: "flex-start", maxWidth: 1412, margin: "0 auto" }}>
      <SidebarNav items={NAV_ITEMS} disabled={navLoading} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

export default function GovLayout({ children }: { children: React.ReactNode }) {
  return (
    <NavLoadingProvider>
      <GovLayoutContent>{children}</GovLayoutContent>
    </NavLoadingProvider>
  );
}
