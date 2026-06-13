"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import DashboardBox from "../../../components/ui/DashboardBox";
import UploadForm from "../../../components/ui/UploadForm";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import RejectionReviewModal from "../../../components/ui/RejectionReviewModal";
import AcceptedReviewModal from "../../../components/ui/AcceptedReviewModal";
import FilterStat from "../../../components/ui/FilterStat";
import Spinner from "../../../components/ui/Spinner";
import SortableTh from "../../../components/ui/SortableTh";
import { sortSubmissions, useSortableTable } from "@/lib/domain/sortSubmissions";
import { deriveFilterOptions, scoreLabel } from "@/lib/domain/submissionFields";
import { useSubmissions } from "@/lib/hooks/useSubmissions";
import { SUBMISSION_STATUSES, type SubmissionStatus } from "@/lib/constants/statuses";

type StatusFilter = "All" | SubmissionStatus;

export default function ClientDashboardPage() {
  const router = useRouter();
  const [showUpload, setShowUpload] = useState(false);
  const { forms, setForms, loading } = useSubmissions();
  const [viewing, setViewing] = useState<any | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [idFilter, setIdFilter] = useState("All");
  const [brandFilter, setBrandFilter] = useState("All");
  const [scoreFilter, setScoreFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("All");
  const { sortKey, sortDir, handleSort } = useSortableTable("submitted_at", "desc");

  const totalCount = forms.length;
  const submittedCount = forms.filter((f) => f.status === SUBMISSION_STATUSES.SUBMITTED).length;
  const acceptedCount = forms.filter((f) => f.status === SUBMISSION_STATUSES.APPROVED).length;
  const rejectedCount = forms.filter((f) => f.status === SUBMISSION_STATUSES.REJECTED).length;

  // forms are already ordered newest-first by ALL_SUBMISSIONS_QUERY
  const statusFilteredForms = filter === "All" ? forms : forms.filter((f) => f.status === filter);

  const visibleForms = statusFilteredForms
    .filter((f) => idFilter === "All" || String(f.id) === idFilter)
    .filter((f) => brandFilter === "All" || (f.brand || "(no brand)") === brandFilter)
    .filter((f) => scoreFilter === "All" || scoreLabel(f) === scoreFilter)
    .filter((f) => dateFilter === "All" || new Date(f.submitted_at).toLocaleDateString() === dateFilter);

  const { idOptions, brandOptions, scoreOptions, dateOptions: submittedDates } = deriveFilterOptions(statusFilteredForms);

  const sortedForms = sortSubmissions(visibleForms, sortKey, sortDir);

  const handleFormSubmit = (data: any) => {
    setForms((s) => [data, ...s]);
    setShowUpload(false);
  };

  // switching the status tab can invalidate the currently selected column
  // filters (e.g. an ID that only exists under "Accepted"), so reset them
  const handleStatusFilter = (next: StatusFilter) => {
    setFilter(next);
    setIdFilter("All");
    setBrandFilter("All");
    setScoreFilter("All");
    setDateFilter("All");
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 1200, display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Button variant="secondary" onClick={() => router.push("/auth")}>
          ⏻ Logout
        </Button>
      </div>
      <DashboardBox
        topItems={[
          <FilterStat key="all" label="Total" count={totalCount} active={filter === "All"} onSelect={() => handleStatusFilter("All")} />,
          <FilterStat key="submitted" label="Submitted" count={submittedCount} active={filter === SUBMISSION_STATUSES.SUBMITTED} onSelect={() => handleStatusFilter(SUBMISSION_STATUSES.SUBMITTED)} />,
          <FilterStat key="accepted" label="Accepted" count={acceptedCount} active={filter === SUBMISSION_STATUSES.APPROVED} onSelect={() => handleStatusFilter(SUBMISSION_STATUSES.APPROVED)} />,
          <FilterStat key="rejected" label="Rejected" count={rejectedCount} active={filter === SUBMISSION_STATUSES.REJECTED} onSelect={() => handleStatusFilter(SUBMISSION_STATUSES.REJECTED)} />,
        ]}
      >
        <div>


          {loading ? (
            <Spinner label="Loading submissions..." />
          ) : (
          <div style={{ maxHeight: 600, overflowY: 'auto', marginTop: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                <SortableTh label="ID" sortKey="id" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} width={90} />
                <SortableTh label="Brand" sortKey="brand" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortableTh label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortableTh label="Score" sortKey="assessment_score" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortableTh label="Submitted Date" sortKey="submitted_at" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                <th className="static-th" style={{ padding: '8px 6px', position: 'sticky', top: 0, cursor: 'default' }}></th>
              </tr>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}>
                  <select
                    className="input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={idFilter}
                    onChange={(e) => setIdFilter(e.target.value)}
                  >
                    <option value="All">All</option>
                    {idOptions.map((id) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                  </select>
                </th>
                <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}>
                  <select
                    className="input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={brandFilter}
                    onChange={(e) => setBrandFilter(e.target.value)}
                  >
                    <option value="All">All</option>
                    {brandOptions.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </th>
                <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}></th>
                <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}>
                  <select
                    className="input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={scoreFilter}
                    onChange={(e) => setScoreFilter(e.target.value)}
                  >
                    <option value="All">All</option>
                    {scoreOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </th>
                <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}>
                  <select
                    className="input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                  >
                    <option value="All">All</option>
                    {submittedDates.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </th>
                <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}></th>
              </tr>
            </thead>
            <tbody>
              {sortedForms.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: '#666' }}>No forms yet.</td>
                </tr>
              ) : (
                sortedForms.map((f) => (
                  <tr key={f.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                    <td style={{ padding: '8px 6px', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.id}>{f.id}</td>
                    <td style={{ padding: '8px 6px' }}>{f.brand || "(no brand)"}</td>
                    <td style={{ padding: '8px 6px' }}>{f.status}</td>
                    <td style={{ padding: '8px 6px' }}>{scoreLabel(f)}</td>
                    <td style={{ padding: '8px 6px' }}>{new Date(f.submitted_at).toLocaleString()}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <Button
                        variant="secondary"
                        onClick={() => setViewing(f)}
                        style={
                          f.status === SUBMISSION_STATUSES.REJECTED
                            ? { background: '#ef4444', color: 'white', border: 'none' }
                            : f.status === SUBMISSION_STATUSES.APPROVED
                            ? { background: '#16a34a', color: 'white', border: 'none' }
                            : undefined
                        }
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 12 }}>
            <Button onClick={() => setShowUpload(true)} disabled={loading}>New Form</Button>
            <Button variant="secondary" onClick={() => router.push("/client/bulk-upload")} disabled={loading}>Bulk Upload</Button>
            <Button variant="secondary" onClick={() => router.push("/client/batch-review")} disabled={loading}>Batch Review</Button>
          </div>

          {showUpload && (
            <Modal onClose={() => setShowUpload(false)}>
              <UploadForm onSubmit={handleFormSubmit} />
            </Modal>
          )}

          {viewing && (
            <Modal onClose={() => setViewing(null)}>
              {viewing.status === SUBMISSION_STATUSES.REJECTED ? (
                <RejectionReviewModal submission={viewing} />
              ) : viewing.status === SUBMISSION_STATUSES.APPROVED ? (
                <AcceptedReviewModal submission={viewing} />
              ) : (
                <UploadForm viewOnly initialData={viewing} />
              )}
            </Modal>
          )}
        </div>
      </DashboardBox>
    </div>
  );
}
