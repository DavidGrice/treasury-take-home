"use client";
import React from "react";
import SectionTitle from "./SectionTitle";

// shared two-column layout for the read-only submission review modals
// (rejected/approved): scrollable body with a fields column, an image
// column, and optional banner/footer content above and below them
export default function SubmissionReviewLayout({
  title,
  banner,
  fields,
  images,
  footer,
}: {
  title: string;
  banner?: React.ReactNode;
  fields: React.ReactNode;
  images: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", height: "75vh" }}>
      <SectionTitle>{title}</SectionTitle>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {banner}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px" }}>
            <div className="fields-area">{fields}</div>
          </div>
          <div style={{ flex: "1 1 280px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {images}
          </div>
        </div>
        {footer}
      </div>
    </div>
  );
}
