import { useState } from "react";

export type SortKey = "id" | "brand" | "status" | "assessment_score" | "submitted_at" | "assigned_to";
export type SortDir = "asc" | "desc";

// shared sort-column-header state: clicking the active column flips its
// direction, clicking a new column switches to it ascending
export function useSortableTable(initialKey: SortKey, initialDir: SortDir = "asc") {
  const [sortKey, setSortKey] = useState<SortKey>(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return { sortKey, sortDir, handleSort };
}

export function sortSubmissions(forms: any[], key: SortKey, dir: SortDir) {
  const sign = dir === "asc" ? 1 : -1;

  return [...forms].sort((a, b) => {
    if (key === "submitted_at") {
      return (new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()) * sign;
    }
    if (key === "assessment_score") {
      const av = a.assessment_score === null || a.assessment_score === undefined ? -Infinity : Number(a.assessment_score);
      const bv = b.assessment_score === null || b.assessment_score === undefined ? -Infinity : Number(b.assessment_score);
      return (av - bv) * sign;
    }
    const av = (a[key] ?? "").toString().toLowerCase();
    const bv = (b[key] ?? "").toString().toLowerCase();
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return 0;
  });
}
