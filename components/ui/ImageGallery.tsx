"use client";
import React, { useState } from "react";
import SecondaryButton from "./SecondaryButton";

// grid of submitted label photos, shared by the review modals. When
// `enlargeable` is set, clicking a photo (or its button) opens it in a
// fullscreen lightbox.
export default function ImageGallery({
  imageUrls,
  altPrefix = "Submitted label",
  enlargeable = false,
  gap = 8,
  emptyText = "No image uploaded.",
}: {
  imageUrls: string[];
  altPrefix?: string;
  enlargeable?: boolean;
  gap?: number;
  emptyText?: string;
}) {
  const [expandedSrc, setExpandedSrc] = useState<string | null>(null);

  if (imageUrls.length === 0) {
    return <div style={{ color: "#666" }}>{emptyText}</div>;
  }

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap, justifyContent: "center" }}>
        {imageUrls.map((url, i) => (
          <div
            key={url + i}
            style={enlargeable ? { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 } : undefined}
          >
            <img
              src={url}
              alt={`${altPrefix} ${i + 1}`}
              onClick={enlargeable ? () => setExpandedSrc(url) : undefined}
              style={{
                maxWidth: imageUrls.length > 1 ? 260 : "100%",
                maxHeight: 420,
                objectFit: "contain",
                borderRadius: 8,
                border: "1px solid #eee",
                ...(enlargeable ? { cursor: "zoom-in" } : {}),
              }}
            />
            {enlargeable && (
              <SecondaryButton onClick={() => setExpandedSrc(url)}>
                Enlarge{imageUrls.length > 1 ? ` Photo ${i + 1}` : " Image"}
              </SecondaryButton>
            )}
          </div>
        ))}
      </div>

      {expandedSrc && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}
          onClick={() => setExpandedSrc(null)}
        >
          <img src={expandedSrc} alt={`${altPrefix} (expanded)`} style={{ maxWidth: "95vw", maxHeight: "95vh", objectFit: "contain", borderRadius: 8 }} />
        </div>
      )}
    </>
  );
}
