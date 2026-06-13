"use client";
import { useEffect, useState } from "react";

// fetches all submissions visible to the current user (client dashboard and
// gov queue both show the same combined submitted/approved/rejected list)
export function useSubmissions() {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadForms = () => {
    fetch("/api/submissions/all")
      .then((res) => res.json())
      .then((data) => setForms(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Failed to load submissions:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadForms();
  }, []);

  return { forms, setForms, loading, loadForms };
}
