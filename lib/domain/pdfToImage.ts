"use client";

// converts PDF label files into PNG images on the client so the rest of the
// upload/analysis pipeline (previews, blur/flash checks, OCR) - which all
// operate on raster images - can treat PDFs exactly like photos.
const PDF_RENDER_SCALE = 2;

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

// renders the first page of a PDF to a PNG File with the same base name
// (e.g. "label.pdf" -> "label.png")
export async function convertPdfFileToImage(file: File): Promise<File> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context for PDF rendering");

  await page.render({ canvas, canvasContext: ctx, viewport }).promise;

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to convert PDF page to image"))), "image/png");
  });

  const newName = file.name.replace(/\.pdf$/i, ".png");
  return new File([blob], newName, { type: "image/png" });
}

// converts any PDFs in the list to PNG images (first page only), leaving
// other files untouched
export async function convertPdfFiles(files: File[]): Promise<File[]> {
  return Promise.all(files.map((f) => (isPdfFile(f) ? convertPdfFileToImage(f) : f)));
}
