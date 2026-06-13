// core submission statuses
export const SUBMISSION_STATUSES = {
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
} as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[keyof typeof SUBMISSION_STATUSES];

// background/text color for the "View" button on the dashboard and gov queue
// tables, highlighting rejected (red) and approved (green) submissions
export function reviewButtonStyle(status: string): { background: string; color: string; border: string } | undefined {
  if (status === SUBMISSION_STATUSES.REJECTED) return { background: "#ef4444", color: "white", border: "none" };
  if (status === SUBMISSION_STATUSES.APPROVED) return { background: "#16a34a", color: "white", border: "none" };
  return undefined;
}

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
