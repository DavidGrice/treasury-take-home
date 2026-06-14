"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import DashboardBox from "../../../components/ui/DashboardBox";
import UploadForm from "@/components/clientStack/home/UploadForm";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import RejectionReviewModal from "../../../components/ui/RejectionReviewModal";
import AcceptedReviewModal from "../../../components/ui/AcceptedReviewModal";
import SubmissionViewQueue from "../../../components/ui/SubmissionViewQueue";
import FilterStat from "../../../components/ui/FilterStat";
import Spinner from "../../../components/ui/Spinner";
import SortableTh from "../../../components/ui/SortableTh";
import SearchableSelect from "../../../components/ui/SearchableSelect";
import { sortSubmissions, useSortableTable } from "@/lib/domain/sortSubmissions";
import { deriveFilterOptions, scoreLabel } from "@/lib/domain/submissionFields";
import { useSubmissions } from "@/lib/hooks/useSubmissions";
import { useSetNavLoading } from "@/lib/context/NavLoadingContext";
import { useNewFormModal } from "@/lib/context/NewFormModalContext";
import { SUBMISSION_STATUSES, reviewButtonStyle, type SubmissionStatus } from "@/lib/constants/statuses";

type StatusFilter = "All" | SubmissionStatus;

function ClientDashboardContent() {
  const { forms, setForms, loading } = useSubmissions();
  useSetNavLoading(loading);
  const [viewing, setViewing] = useState<any | null>(null);
  const [viewAllQueue, setViewAllQueue] = useState<{ submissions: any[]; startIndex: number } | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [idFilter, setIdFilter] = useState("All");
  const [brandFilter, setBrandFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [scoreFilter, setScoreFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("All");
  const { sortKey, sortDir, handleSort } = useSortableTable("submitted_at", "desc");

  // "New Form" opens a layout-level modal (works from any /client/* page);
  // when a submission completes while this page is mounted, splice it into
  // the table without refetching
  const { lastSubmitted } = useNewFormModal();
  const lastSeenRef = useRef(lastSubmitted);
  useEffect(() => {
    if (lastSubmitted && lastSubmitted !== lastSeenRef.current) {
      lastSeenRef.current = lastSubmitted;
      setForms((s) => [lastSubmitted.data, ...s]);
    }
  }, [lastSubmitted, setForms]);

  const totalCount = forms.length;
  const submittedCount = forms.filter((f) => f.status === SUBMISSION_STATUSES.SUBMITTED).length;
  const acceptedCount = forms.filter((f) => f.status === SUBMISSION_STATUSES.APPROVED).length;
  const rejectedCount = forms.filter((f) => f.status === SUBMISSION_STATUSES.REJECTED).length;

  // forms are already ordered newest-first by ALL_SUBMISSIONS_QUERY
  const statusFilteredForms = filter === "All" ? forms : forms.filter((f) => f.status === filter);

  // each column filter's predicate, keyed so we can exclude a column's own
  // filter when computing that column's available options below
  const columnMatchers: Record<string, (f: any) => boolean> = {
    id: (f) => idFilter === "All" || String(f.id) === idFilter,
    brand: (f) => brandFilter === "All" || (f.brand || "(no brand)") === brandFilter,
    status: (f) => statusFilter === "All" || f.status === statusFilter,
    score: (f) => scoreFilter === "All" || scoreLabel(f) === scoreFilter,
    date: (f) => dateFilter === "All" || new Date(f.submitted_at).toLocaleDateString() === dateFilter,
  };
  const columnKeys = Object.keys(columnMatchers);

  const visibleForms = statusFilteredForms.filter((f) => columnKeys.every((k) => columnMatchers[k](f)));

  // a column's dropdown should only offer values that actually occur given
  // the *other* active filters, so it stays in sync with what's on screen
  const optionsBasis = (exclude: string) =>
    statusFilteredForms.filter((f) => columnKeys.every((k) => k === exclude || columnMatchers[k](f)));

  const { idOptions } = deriveFilterOptions(optionsBasis("id"));
  const { brandOptions } = deriveFilterOptions(optionsBasis("brand"));
  const { scoreOptions } = deriveFilterOptions(optionsBasis("score"));
  const { dateOptions: submittedDates } = deriveFilterOptions(optionsBasis("date"));
  const statusOptions = Array.from(new Set(optionsBasis("status").map((f) => f.status))).sort();

  const sortedForms = sortSubmissions(visibleForms, sortKey, sortDir);

  // switching the status tab can invalidate the currently selected column
  // filters (e.g. an ID that only exists under "Accepted"), so reset them
  const handleStatusFilter = (next: StatusFilter) => {
    setFilter(next);
    setIdFilter("All");
    setBrandFilter("All");
    setStatusFilter("All");
    setScoreFilter("All");
    setDateFilter("All");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
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
                  <SearchableSelect
                    className="input"
                    options={["All", ...idOptions]}
                    value={idFilter}
                    onChange={setIdFilter}
                  />
                </th>
                <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}>
                  <SearchableSelect
                    className="input"
                    options={["All", ...brandOptions]}
                    value={brandFilter}
                    onChange={setBrandFilter}
                  />
                </th>
                <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}>
                  {filter === "All" && (
                    <SearchableSelect
                      className="input"
                      options={["All", ...statusOptions]}
                      value={statusFilter}
                      onChange={setStatusFilter}
                    />
                  )}
                </th>
                <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}>
                  <SearchableSelect
                    className="input"
                    options={["All", ...scoreOptions]}
                    value={scoreFilter}
                    onChange={setScoreFilter}
                  />
                </th>
                <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}>
                  <SearchableSelect
                    className="input"
                    options={["All", ...submittedDates]}
                    value={dateFilter}
                    onChange={setDateFilter}
                  />
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
                    <td style={{ padding: '8px 6px', fontFamily: 'monospace', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.id}>{f.id}</td>
                    <td style={{ padding: '8px 6px' }}>{f.brand || "(no brand)"}</td>
                    <td style={{ padding: '8px 6px' }}>{f.status}</td>
                    <td style={{ padding: '8px 6px' }}>{scoreLabel(f)}</td>
                    <td style={{ padding: '8px 6px' }}>{new Date(f.submitted_at).toLocaleString()}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <Button
                        variant="secondary"
                        onClick={() => setViewing(f)}
                        style={reviewButtonStyle(f.status)}
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
            <Button variant="secondary" onClick={() => setViewAllQueue({ submissions: sortedForms, startIndex: 0 })} disabled={loading || sortedForms.length === 0}>
              View All ({sortedForms.length})
            </Button>
          </div>

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

          {viewAllQueue && (
            <Modal className="modal-content--wide" onClose={() => setViewAllQueue(null)}>
              <SubmissionViewQueue
                submissions={viewAllQueue.submissions}
                startIndex={viewAllQueue.startIndex}
                onClose={() => setViewAllQueue(null)}
                renderItem={(f) =>
                  f.status === SUBMISSION_STATUSES.REJECTED ? (
                    <RejectionReviewModal submission={f} />
                  ) : f.status === SUBMISSION_STATUSES.APPROVED ? (
                    <AcceptedReviewModal submission={f} />
                  ) : (
                    <UploadForm viewOnly initialData={f} />
                  )
                }
              />
            </Modal>
          )}
        </div>
      </DashboardBox>
    </div>
  );
}

export default function ClientDashboardPage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", justifyContent: "center" }}><Spinner label="Loading..." /></div>}>
      <ClientDashboardContent />
    </Suspense>
  );
}
