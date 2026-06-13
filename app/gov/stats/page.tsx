"use client";

import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import DashboardBox from "../../../components/ui/DashboardBox";
import SectionTitle from "../../../components/ui/SectionTitle";
import Spinner from "../../../components/ui/Spinner";
import { useSubmissions } from "@/lib/hooks/useSubmissions";
import { useSetNavLoading } from "@/lib/context/NavLoadingContext";
import { EMPLOYEES } from "@/lib/data/employees";
import { SUBMISSION_STATUSES } from "@/lib/constants/statuses";
import { TYPE_DESIGNATIONS } from "@/lib/constants/units";
import { pickGranularity, buildTimeSeries, buildReviewerBreakdown, buildTypeBreakdown } from "@/lib/domain/reviewerStats";
import {
  buildRejectionReasonBreakdown,
  buildAssessmentChecklistStats,
  buildFieldMatchRates,
  buildRejectionCommentThemes,
  buildRejectionCommentKeywords,
  isRejected,
} from "@/lib/domain/auditStats";

const APPROVED_COLOR = "#16a34a";
const REJECTED_COLOR = "#ef4444";
const BRAND_COLOR = "#0b5fff";

const DATE_RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 140, textAlign: "center", padding: "8px 12px", border: "1px solid #eee", borderRadius: 8 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: BRAND_COLOR }}>{value}</div>
      <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>{label}</div>
    </div>
  );
}

const rateLabel = (rate: number | null) => (rate === null ? "N/A" : `${rate}%`);

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#333", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 13 }}>
      {label}
    </div>
  );
}

export default function GovStatsPage() {
  const { forms, loading } = useSubmissions();
  useSetNavLoading(loading);

  const [reviewerFilter, setReviewerFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [dateRange, setDateRange] = useState("all");

  const decided = forms.filter(
    (f) => f.status === SUBMISSION_STATUSES.APPROVED || f.status === SUBMISSION_STATUSES.REJECTED
  );

  const filtered = useMemo(() => {
    const now = Date.now();
    const rangeDays = dateRange === "all" ? null : Number(dateRange);
    return decided
      .filter((f) => reviewerFilter === "All" || f.decided_by === reviewerFilter)
      .filter((f) => typeFilter === "All" || f.type_designation === typeFilter)
      .filter((f) => {
        if (rangeDays === null) return true;
        const decidedAt = new Date(f.decided_at).getTime();
        if (Number.isNaN(decidedAt)) return false;
        return now - decidedAt <= rangeDays * 24 * 60 * 60 * 1000;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decided, reviewerFilter, typeFilter, dateRange]);

  const approvedCount = filtered.filter((f) => f.status === SUBMISSION_STATUSES.APPROVED).length;
  const rejectedCount = filtered.filter((f) => f.status === SUBMISSION_STATUSES.REJECTED).length;
  const totalDecided = filtered.length;
  const acceptRate = totalDecided === 0 ? null : Math.round((approvedCount / totalDecided) * 100);

  const timeSeries = useMemo(() => buildTimeSeries(filtered, pickGranularity(filtered)), [filtered]);
  const reviewerBreakdown = useMemo(() => buildReviewerBreakdown(filtered), [filtered]);
  const typeBreakdown = useMemo(() => buildTypeBreakdown(filtered), [filtered]);

  const rejectedForms = useMemo(() => filtered.filter(isRejected), [filtered]);
  const rejectionReasons = useMemo(() => buildRejectionReasonBreakdown(rejectedForms), [rejectedForms]);
  const checklistStats = useMemo(() => buildAssessmentChecklistStats(filtered), [filtered]);
  const fieldMatchRates = useMemo(() => buildFieldMatchRates(filtered), [filtered]);
  const commentThemes = useMemo(() => buildRejectionCommentThemes(rejectedForms), [rejectedForms]);
  const commentKeywords = useMemo(() => buildRejectionCommentKeywords(rejectedForms), [rejectedForms]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <DashboardBox>
        <div>
          <SectionTitle>Reviewer Stats</SectionTitle>

          <div style={{ display: "flex", justifyContent: "center", gap: 16, margin: "12px 0 20px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#555" }}>
              Reviewer
              <select className="input" value={reviewerFilter} onChange={(e) => setReviewerFilter(e.target.value)}>
                <option value="All">All Reviewers</option>
                {EMPLOYEES.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#555" }}>
              Product Type
              <select className="input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="All">All Types</option>
                {TYPE_DESIGNATIONS.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#555" }}>
              Date Range
              <select className="input" value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                {DATE_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
          </div>

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

              <ChartCard title="Decisions Over Time">
                {timeSeries.length === 0 ? (
                  <EmptyState label="No decided submissions in this range." />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="approved" name="Approved" stackId="decisions" fill={APPROVED_COLOR} />
                      <Bar dataKey="rejected" name="Rejected" stackId="decisions" fill={REJECTED_COLOR} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Accept Rate Over Time">
                {timeSeries.length === 0 ? (
                  <EmptyState label="No decided submissions in this range." />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value) => `${value}%`} />
                      <Line type="monotone" dataKey="acceptRate" name="Accept Rate" stroke={BRAND_COLOR} strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Reviewer Breakdown">
                {totalDecided === 0 ? (
                  <EmptyState label="No decided submissions in this range." />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={reviewerBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="approved" name="Approved" fill={APPROVED_COLOR} />
                      <Bar dataKey="rejected" name="Rejected" fill={REJECTED_COLOR} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Product Type Breakdown">
                {totalDecided === 0 ? (
                  <EmptyState label="No decided submissions in this range." />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={typeBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="type" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="approved" name="Approved" fill={APPROVED_COLOR} />
                      <Bar dataKey="rejected" name="Rejected" fill={REJECTED_COLOR} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <SectionTitle>Audit: Rejection & Assessment Data</SectionTitle>

              <ChartCard title="Rejection Reasons (checklist items)">
                {rejectionReasons.length === 0 ? (
                  <EmptyState label="No rejections with recorded reasons in this range." />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(180, rejectionReasons.length * 36)}>
                    <BarChart data={rejectionReasons} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="reason" width={220} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Times cited" fill={REJECTED_COLOR} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Automated Pre-Assessment Checklist">
                {checklistStats.sampleSize === 0 ? (
                  <EmptyState label="No automated assessment data in this range." />
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
                      Based on {checklistStats.sampleSize} submission(s) with assessment data
                    </div>
                    <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
                      <StatCard label="Avg. Assessment Score" value={rateLabel(checklistStats.avgScore)} />
                      <StatCard label="Avg. OCR Confidence" value={rateLabel(checklistStats.avgOcrConfidence)} />
                      <StatCard label="Blurry Images" value={rateLabel(checklistStats.blurryRate)} />
                      <StatCard label="Flash Detected" value={rateLabel(checklistStats.flashRate)} />
                      <StatCard label="Missing Gov't Warning" value={rateLabel(checklistStats.missingWarningRate)} />
                      <StatCard label="Missing Surgeon General" value={rateLabel(checklistStats.missingSurgeonGeneralRate)} />
                    </div>
                  </>
                )}
              </ChartCard>

              <ChartCard title="Label Field Match Rates (OCR vs. submitted data)">
                {fieldMatchRates.length === 0 ? (
                  <EmptyState label="No automated assessment data in this range." />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(180, fieldMatchRates.length * 36)}>
                    <BarChart data={fieldMatchRates} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="field" width={150} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="matched" name="Matched" stackId="match" fill={APPROVED_COLOR} />
                      <Bar dataKey="notMatched" name="Not Matched" stackId="match" fill={REJECTED_COLOR} />
                      <Bar dataKey="noInput" name="No Input" stackId="match" fill="#cbd5e1" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Rejection Comment Themes (regex-matched)">
                {commentThemes.totalWithComment === 0 ? (
                  <EmptyState label="No rejection comments in this range." />
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
                      Based on {commentThemes.totalWithComment} rejection comment(s) — a comment may match more than one theme
                      {commentThemes.other > 0 && `; ${commentThemes.other} matched none of the themes below`}
                    </div>
                    {commentThemes.themes.length === 0 ? (
                      <EmptyState label="No recognized themes in this range's rejection comments." />
                    ) : (
                      <ResponsiveContainer width="100%" height={Math.max(180, commentThemes.themes.length * 36)}>
                        <BarChart data={commentThemes.themes} layout="vertical" margin={{ left: 24 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                          <YAxis type="category" dataKey="label" width={240} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="count" name="Mentions" fill={BRAND_COLOR} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </>
                )}
              </ChartCard>

              <ChartCard title="Top Keywords in Rejection Comments">
                {commentKeywords.length === 0 ? (
                  <EmptyState label="No rejection comments in this range." />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(180, commentKeywords.length * 32)}>
                    <BarChart data={commentKeywords} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="word" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Occurrences" fill={BRAND_COLOR} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </>
          )}
        </div>
      </DashboardBox>
    </div>
  );
}
