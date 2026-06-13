// core submission statuses
export const SUBMISSION_STATUSES = {
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
} as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[keyof typeof SUBMISSION_STATUSES];

// status values used by the bulk-upload / Batch Review pipeline, in addition
// to the SUBMISSION_STATUSES above
export const BATCH_STATUSES = {
  QUEUED: "Batch Queued",
  PROCESSING: "Batch Processing",
  READY: "Batch Ready",
  NEEDS_REVIEW: "Batch Needs Review",
} as const;

// a row claimed for processing (status = PROCESSING) longer ago than this is
// considered abandoned (e.g. the tab was closed) and may be reclaimed
export const STALE_CLAIM_MS = 2 * 60 * 1000;
