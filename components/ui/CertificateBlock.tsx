"use client";
import React from "react";
import FieldRow from "./FieldRow";
import { getEmployeeName } from "@/lib/data/employees";

// "Certificate of Authenticity" block shown on Approved and Rejected review
// modals, identifying the TTB reviewer who decided the submission
export default function CertificateBlock({ submission, style }: { submission: any; style?: React.CSSProperties }) {
  return (
    <div style={{ marginTop: 16, padding: 16, border: "1px solid #d1d5db", borderRadius: 6, background: "#f9fafb", ...style }}>
      <p style={{ margin: "0 0 10px", fontWeight: 700, color: "#374151", textTransform: "uppercase", fontSize: 12, letterSpacing: "0.05em" }}>
        Certificate of Authenticity
      </p>
      <div className="fields-area">
        <FieldRow label="Certified By" value={getEmployeeName(submission.decided_by)} background="#fff" />
        <FieldRow label="Employee ID" value={submission.decided_by} background="#fff" />
        <FieldRow label="Certificate No." value={submission.certificate_number} background="#fff" monospace />
      </div>
    </div>
  );
}
