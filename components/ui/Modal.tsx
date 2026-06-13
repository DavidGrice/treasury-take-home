"use client";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";

type Props = {
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
};

export default function Modal({ children, onClose, className }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay">
      <div className={`modal-content ${className || ""}`.trim()}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
