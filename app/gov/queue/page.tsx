"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardBox from "../../../components/ui/DashboardBox";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import GovReviewModal from "../../../components/ui/GovReviewModal";
import RejectionReviewModal from "../../../components/ui/RejectionReviewModal";
import AcceptedReviewModal from "../../../components/ui/AcceptedReviewModal";
import FilterStat from "../../../components/ui/FilterStat";
import Spinner from "../../../components/ui/Spinner";
import SortableTh from "../../../components/ui/SortableTh";
import { sortSubmissions, SortDir, SortKey } from "../../../components/ui/sortSubmissions";
import { EMPLOYEES, getEmployeeName } from "../../../components/ui/employees";

type StatusFilter = "Submitted" | "Approved" | "Rejected";

export default function GovQueuePage() {
  const router = useRouter();
  const [forms, setForms] = useState<any[]>([]);
  const [viewing, setViewing] = useState<any | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("Submitted");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("All");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("submitted_at");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const loadForms = () => {
    fetch("/api/submissions/all")
      .then((res) => res.json())
      .then((data) => setForms(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Failed to load submissions:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadForms();
  }, []);

  // approved/rejected submissions move into their own history tables, so once
  // decided we just need to update this row's status in place
  const handleUpdated = (updated: any) => {
    setForms((s) => s.map((f) => (f.id === updated.id ? updated : f)));
  };

  const queueCount = forms.filter((f) => f.status === "Submitted").length;
  const approvedCount = forms.filter((f) => f.status === "Approved").length;
  const rejectedCount = forms.filter((f) => f.status === "Rejected").length;

  const visibleForms = forms
    .filter((f) => f.status === filter)
    .filter((f) => assigneeFilter === "All" || f.assigned_to === assigneeFilter);

  // gov queue defaults to oldest-first by submitted date, but any column
  // can be sorted via the table headers
  const sortedForms = sortSubmissions(visibleForms, sortKey, sortDir);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 1200, display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Button variant="secondary" onClick={() => router.push("/auth")}>
          ⏻ Logout
        </Button>
      </div>
      <DashboardBox
        topItems={[
          <FilterStat key="queue" label="In Queue" count={queueCount} active={filter === "Submitted"} onSelect={() => setFilter("Submitted")} />,
          <FilterStat key="accepted" label="Accepted" count={approvedCount} active={filter === "Approved"} onSelect={() => setFilter("Approved")} />,
          <FilterStat key="rejected" label="Rejected" count={rejectedCount} active={filter === "Rejected"} onSelect={() => setFilter("Rejected")} />,
        ]}
      >
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <label htmlFor="assignee-filter" style={{ fontSize: 13, color: '#666' }}>Assigned to</label>
            <select
              id="assignee-filter"
              className="input"
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
            >
              <option value="All">All</option>
              {EMPLOYEES.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
          {loading ? (
            <Spinner label="Loading queue..." />
          ) : (
          <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                  <SortableTh label="ID" sortKey="id" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} width={90} />
                  <SortableTh label="Brand" sortKey="brand" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Score" sortKey="assessment_score" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Submitted Date" sortKey="submitted_at" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortableTh label="Assigned To" sortKey="assigned_to" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <th className="sortable-th" style={{ padding: '8px 6px', position: 'sticky', top: 0, cursor: 'default' }}></th>
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
                      <td style={{ padding: '8px 6px', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.id}>{f.id}</td>
                      <td style={{ padding: '8px 6px' }}>{f.brand || "(no brand)"}</td>
                      <td style={{ padding: '8px 6px' }}>{f.status}</td>
                      <td style={{ padding: '8px 6px' }}>{f.assessment_score === null || f.assessment_score === undefined ? 'N/A' : `${f.assessment_score}%`}</td>
                      <td style={{ padding: '8px 6px' }}>{new Date(f.submitted_at).toLocaleString()}</td>
                      <td style={{ padding: '8px 6px' }}>{getEmployeeName(f.assigned_to)}</td>
                      <td style={{ padding: '8px 6px' }}>
                        <Button
                          variant="secondary"
                          onClick={() => setViewing(f)}
                          style={
                            f.status === 'Rejected'
                              ? { background: '#ef4444', color: 'white', border: 'none' }
                              : f.status === 'Approved'
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

          {viewing && (
            <Modal onClose={() => setViewing(null)} className={viewing.status === "Submitted" ? "modal-content--wide" : undefined}>
              {viewing.status === "Submitted" ? (
                <GovReviewModal submission={viewing} onClose={() => setViewing(null)} onUpdated={handleUpdated} />
              ) : viewing.status === "Rejected" ? (
                <RejectionReviewModal submission={viewing} />
              ) : (
                <AcceptedReviewModal submission={viewing} />
              )}
            </Modal>
          )}
        </div>
      </DashboardBox>
    </div>
  );
}
