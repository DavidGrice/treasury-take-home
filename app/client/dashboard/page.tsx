"use client";

import React, { useEffect, useState } from "react";
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
import { sortSubmissions, SortDir, SortKey } from "../../../components/ui/sortSubmissions";

type StatusFilter = "All" | "Submitted" | "Approved" | "Rejected";

export default function ClientDashboardPage() {
  const router = useRouter();
  const [showUpload, setShowUpload] = useState(false);
  const [forms, setForms] = useState<any[]>([]);
  const [viewing, setViewing] = useState<any | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("submitted_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  useEffect(() => {
    fetch("/api/submissions/all")
      .then((res) => res.json())
      .then((data) => setForms(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Failed to load submissions:", err))
      .finally(() => setLoading(false));
  }, []);

  const totalCount = forms.length;
  const submittedCount = forms.filter((f) => f.status === "Submitted").length;
  const acceptedCount = forms.filter((f) => f.status === "Approved").length;
  const rejectedCount = forms.filter((f) => f.status === "Rejected").length;

  // forms are already ordered newest-first by ALL_SUBMISSIONS_QUERY
  const visibleForms = filter === "All" ? forms : forms.filter((f) => f.status === filter);
  const sortedForms = sortSubmissions(visibleForms, sortKey, sortDir);

  const handleFormSubmit = (data: any) => {
    setForms((s) => [data, ...s]);
    setShowUpload(false);
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
          <FilterStat key="all" label="Total" count={totalCount} active={filter === "All"} onSelect={() => setFilter("All")} />,
          <FilterStat key="submitted" label="Submitted" count={submittedCount} active={filter === "Submitted"} onSelect={() => setFilter("Submitted")} />,
          <FilterStat key="accepted" label="Accepted" count={acceptedCount} active={filter === "Approved"} onSelect={() => setFilter("Approved")} />,
          <FilterStat key="rejected" label="Rejected" count={rejectedCount} active={filter === "Rejected"} onSelect={() => setFilter("Rejected")} />,
        ]}
      >
        <div>


          {loading ? (
            <Spinner label="Loading submissions..." />
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
                <th className="sortable-th" style={{ padding: '8px 6px', position: 'sticky', top: 0, cursor: 'default' }}></th>
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
                    <td style={{ padding: '8px 6px' }}>{f.assessment_score === null || f.assessment_score === undefined ? 'N/A' : `${f.assessment_score}%`}</td>
                    <td style={{ padding: '8px 6px' }}>{new Date(f.submitted_at).toLocaleString()}</td>
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

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
            <Button onClick={() => setShowUpload(true)}>New Form</Button>
          </div>

          {showUpload && (
            <Modal onClose={() => setShowUpload(false)}>
              <UploadForm onSubmit={handleFormSubmit} />
            </Modal>
          )}

          {viewing && (
            <Modal onClose={() => setViewing(null)}>
              {viewing.status === 'Rejected' ? (
                <RejectionReviewModal submission={viewing} />
              ) : viewing.status === 'Approved' ? (
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
