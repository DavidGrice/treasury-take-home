"use client";
import React from "react";
import type { SortDir, SortKey } from "@/lib/domain/sortSubmissions";

type Props = {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  width?: number | string;
};

export default function SortableTh({ label, sortKey, currentKey, currentDir, onSort, width }: Props) {
  const active = currentKey === sortKey;
  return (
    <th
      className={`sortable-th${active ? " sortable-th--active" : ""}`}
      style={{ padding: '8px 6px', position: 'sticky', top: 0, cursor: 'pointer', userSelect: 'none', width, whiteSpace: 'nowrap' }}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <span style={{ display: 'inline-block', width: 14, color: '#0b5fff', fontWeight: 700 }}>
        {active ? (currentDir === 'asc' ? '▲' : '▼') : ''}
      </span>
    </th>
  );
}
