"use client";
import React from "react";

export default function Spinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="spinner-container">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}
