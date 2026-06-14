"use client";

import React, { useState } from "react";
import DashboardBox from "../../../components/ui/DashboardBox";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import GovReviewQueue from "@/components/govStack/queue/GovReviewQueue";
import SubmissionViewQueue from "../../../components/ui/SubmissionViewQueue";
import RejectionReviewModal from "../../../components/ui/RejectionReviewModal";
import AcceptedReviewModal from "../../../components/ui/AcceptedReviewModal";
import FilterStat from "../../../components/ui/FilterStat";
import Spinner from "../../../components/ui/Spinner";
import SortableTh from "../../../components/ui/SortableTh";
import SearchableSelect from "../../../components/ui/SearchableSelect";
import { sortSubmissions, useSortableTable } from "@/lib/domain/sortSubmissions";
import { deriveFilterOptions, scoreLabel } from "@/lib/domain/submissionFields";
import { getEmployeeName } from "@/lib/data/employees";
import { useSubmissions } from "@/lib/hooks/useSubmissions";
import { useSetNavLoading } from "@/lib/context/NavLoadingContext";
import { SUBMISSION_STATUSES, reviewButtonStyle, type SubmissionStatus } from "@/lib/constants/statuses";

type StatusFilter = SubmissionStatus | "All";

export default function GovQueuePage() {
  const { forms, setForms, loading } = useSubmissions();
  useSetNavLoading(loading);
  const [viewing, setViewing] = useState<any | null>(null);
  const [reviewQueue, setReviewQueue] = useState<{ submissions: any[]; startIndex: number } | null>(null);
  const [viewAllQueue, setViewAllQueue] = useState<{ submissions: any[]; startIndex: number } | null>(null);
  const [filter, setFilter] = useState<StatusFilter>(SUBMISSION_STATUSES.SUBMITTED);
  const [assigneeFilter, setAssigneeFilter] = useState<string>("All");
  const [idFilter, setIdFilter] = useState("All");
  const [brandFilter, setBrandFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [scoreFilter, setScoreFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("All");
  // gov queue defaults to oldest-first by submitted date, but any column
  // can be sorted via the table headers
  const { sortKey, sortDir, handleSort } = useSortableTable("submitted_at", "asc");

  // approved/rejected submissions move into their own history tables, so once
  // decided we just need to update this row's status in place
  const handleUpdated = (updated: any) => {
    setForms((s) => s.map((f) => (f.id === updated.id ? updated : f)));
  };

  const totalCount = forms.length;
  const queueCount = forms.filter((f) => f.status === SUBMISSION_STATUSES.SUBMITTED).length;
  const approvedCount = forms.filter((f) => f.status === SUBMISSION_STATUSES.APPROVED).length;
  const rejectedCount = forms.filter((f) => f.status === SUBMISSION_STATUSES.REJECTED).length;

  const statusFilteredForms = filter === "All" ? forms : forms.filter((f) => f.status === filter);

  // each column filter's predicate, keyed so we can exclude a column's own
  // filter when computing that column's available options below
  const columnMatchers: Record<string, (f: any) => boolean> = {
    id: (f) => idFilter === "All" || String(f.id) === idFilter,
    brand: (f) => brandFilter === "All" || (f.brand || "(no brand)") === brandFilter,
    status: (f) => statusFilter === "All" || f.status === statusFilter,
    score: (f) => scoreFilter === "All" || scoreLabel(f) === scoreFilter,
    date: (f) => dateFilter === "All" || new Date(f.submitted_at).toLocaleDateString() === dateFilter,
    assignee: (f) => assigneeFilter === "All" || getEmployeeName(f.assigned_to) === assigneeFilter,
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
  const assigneeOptions = Array.from(new Set(optionsBasis("assignee").map((f) => getEmployeeName(f.assigned_to)))).sort();

  const sortedForms = sortSubmissions(visibleForms, sortKey, sortDir);

  // the "In Queue" submissions, in the same order as the table - used to
  // drive the "Continue Queue" review flow regardless of which status tab is
  // currently selected
  const queueForms = sortSubmissions(forms.filter((f) => f.status === SUBMISSION_STATUSES.SUBMITTED), sortKey, sortDir);

  // switching the status tab can invalidate the currently selected column
  // filters (e.g. an ID that only exists under "Accepted"), so reset them
  const handleStatusFilter = (next: StatusFilter) => {
    setFilter(next);
    setAssigneeFilter("All");
    setIdFilter("All");
    setBrandFilter("All");
    setStatusFilter("All");
    setScoreFilter("All");
    setDateFilter("All");
  };

  // the ID filter narrows to a single (unique) row, so any other column
  // filter is reset back to "All" - otherwise the table can end up showing
  // zero rows because the selected ID doesn't match a leftover filter
  const handleIdFilter = (value: string) => {
    setIdFilter(value);
    if (value !== "All") {
      setAssigneeFilter("All");
      setBrandFilter("All");
      setStatusFilter("All");
      setScoreFilter("All");
      setDateFilter("All");
    }
  };

  // conversely, picking any other column filter clears the ID filter, since
  // a specific ID is unlikely to also match the newly chosen filter
  const handleColumnFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setIdFilter("All");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <DashboardBox
        topItems={[
          <FilterStat key="total" label="Total" count={totalCount} active={filter === "All"} onSelect={() => handleStatusFilter("All")} />,
          <FilterStat key="queue" label="In Queue" count={queueCount} active={filter === SUBMISSION_STATUSES.SUBMITTED} onSelect={() => handleStatusFilter(SUBMISSION_STATUSES.SUBMITTED)} />,
          <FilterStat key="accepted" label="Accepted" count={approvedCount} active={filter === SUBMISSION_STATUSES.APPROVED} onSelect={() => handleStatusFilter(SUBMISSION_STATUSES.APPROVED)} />,
          <FilterStat key="rejected" label="Rejected" count={rejectedCount} active={filter === SUBMISSION_STATUSES.REJECTED} onSelect={() => handleStatusFilter(SUBMISSION_STATUSES.REJECTED)} />,
        ]}
      >
        <div>
          {loading ? (
            <Spinner label="Loading queue..." />
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
                  <SortableTh label="Assigned To" sortKey="assigned_to" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <th className="static-th" style={{ padding: '8px 6px', position: 'sticky', top: 0, cursor: 'default' }}></th>
                </tr>
                <tr style={{ borderBottom: '1px solid #eee' }}>
                  <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}>
                    <SearchableSelect
                      className="input"
                      options={["All", ...idOptions]}
                      value={idFilter}
                      onChange={handleIdFilter}
                    />
                  </th>
                  <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}>
                    <SearchableSelect
                      className="input"
                      options={["All", ...brandOptions]}
                      value={brandFilter}
                      onChange={handleColumnFilter(setBrandFilter)}
                    />
                  </th>
                  <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}>
                    {filter === "All" && (
                      <SearchableSelect
                        className="input"
                        options={["All", ...statusOptions]}
                        value={statusFilter}
                        onChange={handleColumnFilter(setStatusFilter)}
                      />
                    )}
                  </th>
                  <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}>
                    <SearchableSelect
                      className="input"
                      options={["All", ...scoreOptions]}
                      value={scoreFilter}
                      onChange={handleColumnFilter(setScoreFilter)}
                    />
                  </th>
                  <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}>
                    <SearchableSelect
                      className="input"
                      options={["All", ...submittedDates]}
                      value={dateFilter}
                      onChange={handleColumnFilter(setDateFilter)}
                    />
                  </th>
                  <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}>
                    <SearchableSelect
                      className="input"
                      options={["All", ...assigneeOptions]}
                      value={assigneeFilter}
                      onChange={handleColumnFilter(setAssigneeFilter)}
                    />
                  </th>
                  <th className="filter-th" style={{ padding: '4px 6px', position: 'sticky', top: 28 }}></th>
                </tr>
              </thead>
              <tbody>
                {sortedForms.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 12, color: '#666' }}>No forms yet.</td>
                  </tr>
                ) : (
                  sortedForms.map((f) => (
                    <tr key={f.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                      <td style={{ padding: '8px 6px', fontFamily: 'monospace', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.id}>{f.id}</td>
                      <td style={{ padding: '8px 6px' }}>{f.brand || "(no brand)"}</td>
                      <td style={{ padding: '8px 6px' }}>{f.status}</td>
                      <td style={{ padding: '8px 6px' }}>{scoreLabel(f)}</td>
                      <td style={{ padding: '8px 6px' }}>{new Date(f.submitted_at).toLocaleString()}</td>
                      <td style={{ padding: '8px 6px' }}>{getEmployeeName(f.assigned_to)}</td>
                      <td style={{ padding: '8px 6px' }}>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            if (f.status === SUBMISSION_STATUSES.SUBMITTED) {
                              setReviewQueue({ submissions: queueForms, startIndex: queueForms.findIndex((x) => x.id === f.id) });
                            } else {
                              setViewing(f);
                            }
                          }}
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

          {!loading && filter === SUBMISSION_STATUSES.SUBMITTED && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
              <Button onClick={() => setReviewQueue({ submissions: queueForms, startIndex: 0 })} disabled={queueForms.length === 0}>
                Continue Queue ({queueForms.length})
              </Button>
            </div>
          )}

          {!loading && filter !== SUBMISSION_STATUSES.SUBMITTED && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
              <Button onClick={() => setViewAllQueue({ submissions: sortedForms, startIndex: 0 })} disabled={sortedForms.length === 0}>
                View All ({sortedForms.length})
              </Button>
            </div>
          )}

          {viewing && (
            <Modal onClose={() => setViewing(null)}>
              {viewing.status === SUBMISSION_STATUSES.REJECTED ? (
                <RejectionReviewModal submission={viewing} />
              ) : (
                <AcceptedReviewModal submission={viewing} />
              )}
            </Modal>
          )}

          {reviewQueue && (
            <Modal
              className="modal-content--wide"
              onClose={() => setReviewQueue(null)}
            >
              <GovReviewQueue
                submissions={reviewQueue.submissions}
                startIndex={reviewQueue.startIndex}
                onClose={() => setReviewQueue(null)}
                onUpdated={handleUpdated}
              />
            </Modal>
          )}

          {viewAllQueue && (
            <Modal
              className="modal-content--wide"
              onClose={() => setViewAllQueue(null)}
            >
              <SubmissionViewQueue
                submissions={viewAllQueue.submissions}
                startIndex={viewAllQueue.startIndex}
                onClose={() => setViewAllQueue(null)}
                renderItem={(f) =>
                  f.status === SUBMISSION_STATUSES.REJECTED ? (
                    <RejectionReviewModal submission={f} />
                  ) : (
                    <AcceptedReviewModal submission={f} />
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
