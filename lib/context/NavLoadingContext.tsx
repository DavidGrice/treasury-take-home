"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";

const NavLoadingContext = createContext<{
  loading: boolean;
  setLoading: (id: string, loading: boolean) => void;
} | null>(null);

// Wraps a layout's content area so pages can report a busy/loading state up
// to the persistent SidebarNav, which disables itself while any page is busy.
export function NavLoadingProvider({ children }: { children: React.ReactNode }) {
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const setLoading = useCallback((id: string, loading: boolean) => {
    setLoadingIds((prev) => {
      if (loading === prev.has(id)) return prev;
      const next = new Set(prev);
      if (loading) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ loading: loadingIds.size > 0, setLoading }), [loadingIds, setLoading]);

  return <NavLoadingContext.Provider value={value}>{children}</NavLoadingContext.Provider>;
}

// Layout-side hook: returns whether any page has reported a busy state.
export function useNavLoadingState(): boolean {
  const ctx = useContext(NavLoadingContext);
  return ctx?.loading ?? false;
}

// Page-side hook: reports this page's busy state to the layout's SidebarNav.
export function useSetNavLoading(loading: boolean) {
  const ctx = useContext(NavLoadingContext);
  const idRef = useRef(Math.random().toString(36));

  useEffect(() => {
    if (!ctx) return;
    ctx.setLoading(idRef.current, loading);
  }, [ctx, loading]);

  useEffect(() => {
    return () => ctx?.setLoading(idRef.current, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
