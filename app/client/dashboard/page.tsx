"use client";

import React, { useState } from "react";
import DashboardBox from "../../../components/ui/DashboardBox";
import UploadForm from "../../../components/ui/UploadForm";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";

export default function ClientDashboardPage() {
  const [showUpload, setShowUpload] = useState(false);
  const [forms, setForms] = useState<any[]>([]);

  const handleFormSubmit = (data: any) => {
    const entry = {
      id: forms.length + 1,
      brand: data.brand || "(no brand)",
      status: "Submitted",
      submittedAt: new Date().toLocaleString(),
      raw: data,
    };
    setForms((s) => [entry, ...s]);
    setShowUpload(false);
  };

  return (
    <div style={{ padding: 24, display: "flex", justifyContent: "center" }}>
      <DashboardBox
        topLeft={<div><strong>Submitted</strong><div style={{fontSize:12, color:'#666'}}>0</div></div>}
        topCenter={<div><strong>Accepted</strong><div style={{fontSize:12, color:'#666'}}>0</div></div>}
        topRight={<div><strong>Rejected</strong><div style={{fontSize:12, color:'#666'}}>0</div></div>}
      >
        <div>
          

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '8px 6px' }}>ID</th>
                <th style={{ padding: '8px 6px' }}>Brand</th>
                <th style={{ padding: '8px 6px' }}>Status</th>
                <th style={{ padding: '8px 6px' }}>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {forms.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 12, color: '#666' }}>No forms yet.</td>
                </tr>
              ) : (
                forms.map((f) => (
                  <tr key={f.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                    <td style={{ padding: '8px 6px' }}>{f.id}</td>
                    <td style={{ padding: '8px 6px' }}>{f.brand}</td>
                    <td style={{ padding: '8px 6px' }}>{f.status}</td>
                    <td style={{ padding: '8px 6px' }}>{f.submittedAt}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => setShowUpload(true)}>Upload Form</Button>
          </div>

          {showUpload && (
            <Modal onClose={() => setShowUpload(false)}>
              <UploadForm onSubmit={handleFormSubmit} />
            </Modal>
          )}
        </div>
      </DashboardBox>
    </div>
  );
}
