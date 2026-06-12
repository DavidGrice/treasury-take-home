"use client";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import Button from "./Button";

const CONSENT_SECONDS = 2;

export default function ConsentBanner({ onAccept }: { onAccept: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(CONSENT_SECONDS);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  if (!mounted) return null;

  const canAccept = secondsLeft <= 0;

  return ReactDOM.createPortal(
    <div className="consent-overlay">
      <div className="consent-box">
        <h3>System Usage Notice</h3>
        <div className="consent-body">
          <p>
            This system is provided for authorized use only. By accessing or using this system,
            you acknowledge and agree to the following:
          </p>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            <li>All activity on this system may be monitored, recorded, and audited.</li>
            <li>Unauthorized access, use, or modification of this system or its data is prohibited and may result in civil or criminal penalties.</li>
            <li>Information submitted through this system may be collected, stored, and reviewed for compliance and quality-assurance purposes.</li>
            <li>There is no expectation of privacy in any data entered into or transmitted through this system.</li>
            <li>Continued use of this system constitutes consent to these terms.</li>
          </ul>
        </div>
        <div className="consent-footer">
          {!canAccept && (
            <>
              <div className="consent-clock">
                <div className="consent-clock-ring" />
                <div className="consent-clock-number">{secondsLeft}</div>
              </div>
              <span style={{ fontSize: 12, color: "#64748b" }}>
                Please review the notice above before continuing
              </span>
            </>
          )}
          <Button onClick={onAccept} disabled={!canAccept} style={{ width: "100%" }}>
            {canAccept ? "Accept" : `Accept (${secondsLeft})`}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
