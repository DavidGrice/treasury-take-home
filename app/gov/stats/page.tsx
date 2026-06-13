"use client";

import React, { useState } from "react";
import DashboardBox from "../../../components/ui/DashboardBox";
import FilterStat from "../../../components/ui/FilterStat";
import Spinner from "../../../components/ui/Spinner";
import { useSubmissions } from "@/lib/hooks/useSubmissions";
import { EMPLOYEES, getEmployeeName } from "@/lib/data/employees";
import { SUBMISSION_STATUSES } from "@/lib/constants/statuses";

type ReviewerFilter = "All" | string;

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 140, textAlign: "center", padding: "8px 12px", border: "1px solid #eee", borderRadius: 8 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#0b5fff" }}>{value}</div>
      <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>{label}</div>
    </div>
  );
}

const rateLabel = (rate: number | null) => (rate === null ? "N/A" : `${rate}%`);

export default function GovStatsPage() {
  const { forms, loading } = useSubmissions();
  const [reviewerFilter, setReviewerFilter] = useState<ReviewerFilter>("All");

  const decided = forms.filter(
    (f) => f.status === SUBMISSION_STATUSES.APPROVED || f.status === SUBMISSION_STATUSES.REJECTED
  );

  const filteredDecided = reviewerFilter === "All" ? decided : decided.filter((f) => f.decided_by === reviewerFilter);

  const approvedCount = filteredDecided.filter((f) => f.status === SUBMISSION_STATUSES.APPROVED).length;
  const rejectedCount = filteredDecided.filter((f) => f.status === SUBMISSION_STATUSES.REJECTED).length;
  const totalDecided = filteredDecided.length;
  const acceptRate = totalDecided === 0 ? null : Math.round((approvedCount / totalDecided) * 100);

  const reviewerRows = EMPLOYEES.map((emp) => {
    const empDecided = decided.filter((f) => f.decided_by === emp.id);
    const approved = empDecided.filter((f) => f.status === SUBMISSION_STATUSES.APPROVED).length;
    const rejected = empDecided.filter((f) => f.status === SUBMISSION_STATUSES.REJECTED).length;
    const total = empDecided.length;
    const rate = total === 0 ? null : Math.round((approved / total) * 100);
    return { ...emp, approved, rejected, total, rate };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <DashboardBox
        topItems={[
          <FilterStat
            key="all"
            label="All Reviewers"
            count={decided.length}
            active={reviewerFilter === "All"}
            onSelect={() => setReviewerFilter("All")}
          />,
          ...EMPLOYEES.map((emp) => (
            <FilterStat
              key={emp.id}
              label={emp.name}
              count={decided.filter((f) => f.decided_by === emp.id).length}
              active={reviewerFilter === emp.id}
              onSelect={() => setReviewerFilter(emp.id)}
            />
          )),
        ]}
      >
        <div>
          {loading ? (
            <Spinner label="Loading stats..." />
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "center", gap: 16, margin: "4px 0 24px", flexWrap: "wrap" }}>
                <StatCard label="Total Decided" value={String(totalDecided)} />
                <StatCard label="Approved" value={String(approvedCount)} />
                <StatCard label="Rejected" value={String(rejectedCount)} />
                <StatCard label="Accept Rate" value={rateLabel(acceptRate)} />
              </div>

              {reviewerFilter === "All" && (
                <div style={{ maxHeight: 400, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                        <th className="static-th" style={{ padding: "8px 6px", position: "sticky", top: 0 }}>Reviewer</th>
                        <th className="static-th" style={{ padding: "8px 6px", position: "sticky", top: 0 }}>Approved</th>
                        <th className="static-th" style={{ padding: "8px 6px", position: "sticky", top: 0 }}>Rejected</th>
                        <th className="static-th" style={{ padding: "8px 6px", position: "sticky", top: 0 }}>Total Decided</th>
                        <th className="static-th" style={{ padding: "8px 6px", position: "sticky", top: 0 }}>Accept Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewerRows.map((r) => (
                        <tr key={r.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                          <td style={{ padding: "8px 6px" }}>{getEmployeeName(r.id)}</td>
                          <td style={{ padding: "8px 6px" }}>{r.approved}</td>
                          <td style={{ padding: "8px 6px" }}>{r.rejected}</td>
                          <td style={{ padding: "8px 6px" }}>{r.total}</td>
                          <td style={{ padding: "8px 6px" }}>{rateLabel(r.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </DashboardBox>
    </div>
  );
}
