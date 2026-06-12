"use client";
import React from "react";

type ButtonProps = {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export default function Button({ children, variant = "primary", onClick, type = "button", disabled = false, className = "", style: styleOverride }: ButtonProps) {
  const primaryStyle = {
    background: "#0b5fff",
    color: "white",
    border: "none",
  } as React.CSSProperties;

  const secondaryStyle = {
    background: "transparent",
    color: "#333",
    border: "1px solid #ddd",
  } as React.CSSProperties;

  const style: React.CSSProperties = {
    padding: "10px 18px",
    borderRadius: 6,
    cursor: disabled ? "default" : "pointer",
    fontWeight: 600,
    ...((variant === "primary") ? primaryStyle : secondaryStyle),
    ...styleOverride,
  };

  return (
    <button type={type} onClick={onClick} disabled={disabled} style={style} className={`btn ${className}`.trim()}>
      {children}
    </button>
  );
}
