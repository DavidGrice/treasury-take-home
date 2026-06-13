// status values used by the bulk-upload / Batch Review pipeline, in addition
// to the existing "Submitted" | "Approved" | "Rejected" statuses
export const BATCH_STATUSES = {
  QUEUED: "Batch Queued",
  PROCESSING: "Batch Processing",
  READY: "Batch Ready",
  NEEDS_REVIEW: "Batch Needs Review",
} as const;

// a row claimed for processing (status = PROCESSING) longer ago than this is
// considered abandoned (e.g. the tab was closed) and may be reclaimed
export const STALE_CLAIM_MS = 2 * 60 * 1000;
