"use client";

import React from "react";
import SidebarNav, { type SidebarNavItem } from "@/components/ui/SidebarNav";
import Modal from "@/components/ui/Modal";
import UploadForm from "@/components/clientStack/home/UploadForm";
import { NavLoadingProvider, useNavLoadingState } from "@/lib/context/NavLoadingContext";
import { NewFormModalProvider, useNewFormModal } from "@/lib/context/NewFormModalContext";

function ClientLayoutContent({ children }: { children: React.ReactNode }) {
  const navLoading = useNavLoadingState();
  const { open, openModal, closeModal, handleSubmit } = useNewFormModal();

  const navItems: SidebarNavItem[] = [
    { key: "dashboard", label: "Dashboard", href: "/client/dashboard" },
    { key: "new-form", label: "New Form", onClick: openModal, highlight: false },
    { key: "bulk-upload", label: "Bulk Upload", href: "/client/bulk-upload" },
    { key: "batch-review", label: "Batch Review", href: "/client/batch-review" },
  ];

  return (
    <div style={{ display: "flex", gap: 12, padding: 24, alignItems: "flex-start", maxWidth: 1412, margin: "0 auto" }}>
      <SidebarNav items={navItems} disabled={navLoading} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {open && (
        <Modal onClose={closeModal}>
          <UploadForm onSubmit={handleSubmit} />
        </Modal>
      )}
    </div>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <NavLoadingProvider>
      <NewFormModalProvider>
        <ClientLayoutContent>{children}</ClientLayoutContent>
      </NewFormModalProvider>
    </NavLoadingProvider>
  );
}
