import { EMPLOYEES, getEmployeeName } from "@/lib/data/employees";
import { TYPE_DESIGNATIONS } from "@/lib/constants/units";
import { SUBMISSION_STATUSES } from "@/lib/constants/statuses";

export type Granularity = "day" | "week" | "month";

export type TimeSeriesPoint = {
  period: string;
  approved: number;
  rejected: number;
  total: number;
  acceptRate: number;
};

export type ReviewerBreakdownRow = {
  id: string;
  name: string;
  approved: number;
  rejected: number;
  total: number;
  acceptRate: number | null;
};

export type TypeBreakdownRow = {
  type: string;
  approved: number;
  rejected: number;
  total: number;
  acceptRate: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// picks a sensible time-series bucket size based on how wide a span the
// decided submissions cover
export function pickGranularity(forms: any[]): Granularity {
  const dates = forms.map((f) => new Date(f.decided_at).getTime()).filter((t) => !Number.isNaN(t));
  if (dates.length === 0) return "day";
  const span = Math.max(...dates) - Math.min(...dates);
  if (span <= 30 * DAY_MS) return "day";
  if (span <= 180 * DAY_MS) return "week";
  return "month";
}

function periodKey(date: Date, granularity: Granularity): { key: string; label: string } {
  if (granularity === "day") {
    const key = date.toLocaleDateString();
    return { key, label: key };
  }
  if (granularity === "week") {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    const key = start.toLocaleDateString();
    return { key, label: `Week of ${key}` };
  }
  const label = date.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  return { key: label, label };
}

// buckets decided submissions into a chronological time series of
// approved/rejected counts and accept rate per period
export function buildTimeSeries(forms: any[], granularity: Granularity): TimeSeriesPoint[] {
  const buckets = new Map<string, { label: string; sortKey: number; approved: number; rejected: number }>();

  for (const f of forms) {
    const date = new Date(f.decided_at);
    if (Number.isNaN(date.getTime())) continue;
    const { key, label } = periodKey(date, granularity);
    if (!buckets.has(key)) {
      buckets.set(key, { label, sortKey: date.getTime(), approved: 0, rejected: 0 });
    }
    const bucket = buckets.get(key)!;
    if (f.status === SUBMISSION_STATUSES.APPROVED) bucket.approved += 1;
    else if (f.status === SUBMISSION_STATUSES.REJECTED) bucket.rejected += 1;
    bucket.sortKey = Math.min(bucket.sortKey, date.getTime());
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((b) => {
      const total = b.approved + b.rejected;
      return {
        period: b.label,
        approved: b.approved,
        rejected: b.rejected,
        total,
        acceptRate: total === 0 ? 0 : Math.round((b.approved / total) * 100),
      };
    });
}

// per-reviewer approved/rejected/total/accept-rate breakdown
export function buildReviewerBreakdown(forms: any[]): ReviewerBreakdownRow[] {
  return EMPLOYEES.map((emp) => {
    const empDecided = forms.filter((f) => f.decided_by === emp.id);
    const approved = empDecided.filter((f) => f.status === SUBMISSION_STATUSES.APPROVED).length;
    const rejected = empDecided.filter((f) => f.status === SUBMISSION_STATUSES.REJECTED).length;
    const total = empDecided.length;
    return {
      id: emp.id,
      name: getEmployeeName(emp.id),
      approved,
      rejected,
      total,
      acceptRate: total === 0 ? null : Math.round((approved / total) * 100),
    };
  });
}

// per-product-type approved/rejected/total/accept-rate breakdown
export function buildTypeBreakdown(forms: any[]): TypeBreakdownRow[] {
  return TYPE_DESIGNATIONS.map((type) => {
    const typeDecided = forms.filter((f) => f.type_designation === type);
    const approved = typeDecided.filter((f) => f.status === SUBMISSION_STATUSES.APPROVED).length;
    const rejected = typeDecided.filter((f) => f.status === SUBMISSION_STATUSES.REJECTED).length;
    const total = typeDecided.length;
    return {
      type,
      approved,
      rejected,
      total,
      acceptRate: total === 0 ? null : Math.round((approved / total) * 100),
    };
  });
}
