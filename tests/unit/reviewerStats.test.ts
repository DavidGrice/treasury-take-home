import { describe, it, expect } from "vitest";
import { pickGranularity, buildTimeSeries, buildReviewerBreakdown, buildTypeBreakdown } from "@/lib/domain/reviewerStats";
import { EMPLOYEES } from "@/lib/data/employees";
import { SUBMISSION_STATUSES } from "@/lib/constants/statuses";

const day = (offsetDays: number) => new Date(Date.UTC(2026, 0, 1 + offsetDays)).toISOString();

describe("pickGranularity", () => {
  it("defaults to 'day' when there are no decided forms", () => {
    expect(pickGranularity([])).toBe("day");
  });

  it("picks 'day' for spans up to 30 days", () => {
    const forms = [{ decided_at: day(0) }, { decided_at: day(10) }];
    expect(pickGranularity(forms)).toBe("day");
  });

  it("picks 'week' for spans up to 180 days", () => {
    const forms = [{ decided_at: day(0) }, { decided_at: day(60) }];
    expect(pickGranularity(forms)).toBe("week");
  });

  it("picks 'month' for spans beyond 180 days", () => {
    const forms = [{ decided_at: day(0) }, { decided_at: day(200) }];
    expect(pickGranularity(forms)).toBe("month");
  });
});

describe("buildTimeSeries", () => {
  it("buckets approved/rejected counts per day and computes accept rate", () => {
    const forms = [
      { decided_at: day(0), status: SUBMISSION_STATUSES.APPROVED },
      { decided_at: day(0), status: SUBMISSION_STATUSES.APPROVED },
      { decided_at: day(0), status: SUBMISSION_STATUSES.REJECTED },
      { decided_at: day(1), status: SUBMISSION_STATUSES.REJECTED },
    ];
    const series = buildTimeSeries(forms, "day");
    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({ approved: 2, rejected: 1, total: 3, acceptRate: 67 });
    expect(series[1]).toMatchObject({ approved: 0, rejected: 1, total: 1, acceptRate: 0 });
    // chronological order
    expect(new Date(series[0].period).getTime()).toBeLessThan(new Date(series[1].period).getTime());
  });

  it("ignores entries with an invalid decided_at", () => {
    const forms = [{ decided_at: "not-a-date", status: SUBMISSION_STATUSES.APPROVED }];
    expect(buildTimeSeries(forms, "day")).toEqual([]);
  });
});

describe("buildReviewerBreakdown", () => {
  it("returns one row per employee with counts and accept rate", () => {
    const [first, ...rest] = EMPLOYEES;
    const forms = [
      { decided_by: first.id, status: SUBMISSION_STATUSES.APPROVED },
      { decided_by: first.id, status: SUBMISSION_STATUSES.REJECTED },
    ];
    const rows = buildReviewerBreakdown(forms);
    expect(rows).toHaveLength(EMPLOYEES.length);

    const row = rows.find((r) => r.id === first.id)!;
    expect(row).toMatchObject({ approved: 1, rejected: 1, total: 2, acceptRate: 50 });

    for (const other of rest) {
      const r = rows.find((x) => x.id === other.id)!;
      expect(r).toMatchObject({ total: 0, acceptRate: null });
    }
  });
});

describe("buildTypeBreakdown", () => {
  it("returns one row per product type with counts and accept rate", () => {
    const forms = [
      { type_designation: "Wine", status: SUBMISSION_STATUSES.APPROVED },
      { type_designation: "Wine", status: SUBMISSION_STATUSES.APPROVED },
      { type_designation: "Wine", status: SUBMISSION_STATUSES.REJECTED },
    ];
    const rows = buildTypeBreakdown(forms);
    const wine = rows.find((r) => r.type === "Wine")!;
    expect(wine).toMatchObject({ approved: 2, rejected: 1, total: 3, acceptRate: 67 });

    const malt = rows.find((r) => r.type === "Malt Beverage")!;
    expect(malt).toMatchObject({ total: 0, acceptRate: null });
  });
});
