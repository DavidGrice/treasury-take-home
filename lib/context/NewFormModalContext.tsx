"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

export type SubmittedForm = { data: any; at: number };

type NewFormModalContextValue = {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
  handleSubmit: (data: any) => void;
  lastSubmitted: SubmittedForm | null;
};

const NewFormModalContext = createContext<NewFormModalContextValue | null>(null);

// Hosts the "New Form" upload modal at the client layout level so it can be
// opened as an overlay from any /client/* page, without navigating away.
export function NewFormModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [lastSubmitted, setLastSubmitted] = useState<SubmittedForm | null>(null);

  const openModal = useCallback(() => setOpen(true), []);
  const closeModal = useCallback(() => setOpen(false), []);
  const handleSubmit = useCallback((data: any) => {
    setOpen(false);
    setLastSubmitted({ data, at: Date.now() });
  }, []);

  const value = useMemo(
    () => ({ open, openModal, closeModal, handleSubmit, lastSubmitted }),
    [open, lastSubmitted, openModal, closeModal, handleSubmit]
  );

  return <NewFormModalContext.Provider value={value}>{children}</NewFormModalContext.Provider>;
}

export function useNewFormModal(): NewFormModalContextValue {
  const ctx = useContext(NewFormModalContext);
  if (!ctx) throw new Error("useNewFormModal must be used within a NewFormModalProvider");
  return ctx;
}
