"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardBox from "../../../components/ui/DashboardBox";
import UploadForm from "../../../components/ui/UploadForm";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";

export default function ClientDashboardPage() {
  const router = useRouter();
  const [showUpload, setShowUpload] = useState(false);
  const [forms, setForms] = useState<any[]>([]);
  const [viewing, setViewing] = useState<any | null>(null);

  useEffect(() => {
    fetch("/api/submissions")
      .then((res) => res.json())
      .then((data) => setForms(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Failed to load submissions:", err));
  }, []);

  const handleFormSubmit = (data: any) => {
    setForms((s) => [data, ...s]);
    setShowUpload(false);
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 900, display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Button variant="secondary" onClick={() => router.push("/auth")}>
          ⏻ Logout
        </Button>
      </div>
      <DashboardBox
        topLeft={<div><strong style={{fontSize:20}}>Submitted</strong><div style={{fontSize:24, color:'#666'}}>{forms.length}</div></div>}
        topCenter={<div><strong style={{fontSize:20}}>Accepted</strong><div style={{fontSize:24, color:'#666'}}>0</div></div>}
        topRight={<div><strong style={{fontSize:20}}>Rejected</strong><div style={{fontSize:24, color:'#666'}}>0</div></div>}
      >
        <div>
          

          <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '8px 6px', position: 'sticky', top: 0, background: '#fff' }}>ID</th>
                <th style={{ padding: '8px 6px', position: 'sticky', top: 0, background: '#fff' }}>Brand</th>
                <th style={{ padding: '8px 6px', position: 'sticky', top: 0, background: '#fff' }}>Status</th>
                <th style={{ padding: '8px 6px', position: 'sticky', top: 0, background: '#fff' }}>Score</th>
                <th style={{ padding: '8px 6px', position: 'sticky', top: 0, background: '#fff' }}>Submitted Date</th>
                <th style={{ padding: '8px 6px', position: 'sticky', top: 0, background: '#fff' }}></th>
              </tr>
            </thead>
            <tbody>
              {forms.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: '#666' }}>No forms yet.</td>
                </tr>
              ) : (
                forms.map((f) => (
                  <tr key={f.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                    <td style={{ padding: '8px 6px' }}>{f.id}</td>
                    <td style={{ padding: '8px 6px' }}>{f.brand || "(no brand)"}</td>
                    <td style={{ padding: '8px 6px' }}>{f.status}</td>
                    <td style={{ padding: '8px 6px' }}>{f.assessment_score === null || f.assessment_score === undefined ? 'N/A' : `${f.assessment_score}%`}</td>
                    <td style={{ padding: '8px 6px' }}>{new Date(f.submitted_at).toLocaleString()}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <Button variant="secondary" onClick={() => setViewing(f)}>View</Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => setShowUpload(true)}>Upload Form</Button>
          </div>

          {showUpload && (
            <Modal onClose={() => setShowUpload(false)}>
              <UploadForm onSubmit={handleFormSubmit} />
            </Modal>
          )}

          {viewing && (
            <Modal onClose={() => setViewing(null)}>
              <UploadForm viewOnly initialData={viewing} />
            </Modal>
          )}
        </div>
      </DashboardBox>
    </div>
  );
}
