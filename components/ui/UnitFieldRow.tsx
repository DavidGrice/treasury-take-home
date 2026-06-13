"use client";
import React from "react";
import MatchBadge from "./MatchBadge";

// shared layout for "value + unit dropdown" rows (alcohol content, net
// contents) - mirrors UploadForm's single-row pattern: one label, then one
// inline row of controls (value, optional "%", unit dropdown, optional
// secondary field), with a trailing match badge
export default function UnitFieldRow({
  label, value, onChange, unitValue, unitOptions, onUnitChange, matchStatus, percent, extra,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  unitValue: string;
  unitOptions: string[];
  onUnitChange: (value: string) => void;
  matchStatus: boolean | "no-input" | undefined;
  percent?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="form-row">
      <label className="text-sm">{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <input className="input" style={{ width: 90 }} value={value} onChange={(e) => onChange(e.target.value)} />
        {percent && <span>%</span>}
        <select className="input" value={unitValue} onChange={(e) => onUnitChange(e.target.value)}>
          {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        {extra}
        <MatchBadge status={matchStatus} />
      </div>
    </div>
  );
}
