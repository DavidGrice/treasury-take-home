"use client";
import React, { useEffect, useRef, useState } from "react";

type SearchableSelectProps = {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export default function SearchableSelect({ options, value, onChange, placeholder, required, disabled, className, style }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div ref={containerRef} style={{ position: "relative", ...style }}>
      <input
        className={className}
        style={{ width: "100%", boxSizing: "border-box" }}
        value={open ? query : value}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { if (!disabled) { setQuery(""); setOpen(true); } }}
      />
      {open && !disabled && (
        <div
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
            background: "#fff", border: "1px solid #ddd", borderRadius: 6,
            maxHeight: 200, overflowY: "auto", marginTop: 4,
            boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: 8, color: "#999" }}>No matches</div>
          ) : filtered.map((opt) => (
            <div
              key={opt}
              onMouseDown={(e) => { e.preventDefault(); onChange(opt); setQuery(""); setOpen(false); }}
              style={{
                padding: "6px 8px", cursor: "pointer",
                background: opt === value ? "#f0f5ff" : "transparent",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
              onMouseLeave={(e) => (e.currentTarget.style.background = opt === value ? "#f0f5ff" : "transparent")}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
