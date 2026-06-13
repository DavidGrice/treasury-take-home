"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardBox from "../../../components/ui/DashboardBox";
import SectionTitle from "../../../components/ui/SectionTitle";
import Button from "../../../components/ui/Button";
import Spinner from "../../../components/ui/Spinner";
import Modal from "../../../components/ui/Modal";
import BatchCorrectionForm from "../../../components/ui/BatchCorrectionForm";
import MessageBox from "../../../components/ui/MessageBox";
import { useLabelAnalysisWorkers } from "@/lib/domain/useLabelAnalysisWorkers";
import {
  computeFieldMatches,
  computeAssessmentScore,
  buildFieldMatchInputs,
  BLUR_VARIANCE_THRESHOLD,
  GOVERNMENT_WARNING_RE,
  SURGEON_GENERAL_RE,
} from "@/lib/domain/labelAnalysis";
import { BATCH_STATUSES, STALE_CLAIM_MS, SUBMISSION_STATUSES } from "@/lib/constants/statuses";

const PASSING_SCORE = 70;

function BatchReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batch_id") || "";

  const [rows, setRows] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [processStats, setProcessStats] = useState<{ submitted: number; needsReview: number; failed: number } | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<any | null>(null);

  const { runImageAnalysis, runOCRFromOrientations } = useLabelAnalysisWorkers();

  // warn the user if they try to close/refresh the tab mid-processing -
  // claimed rows would be stuck until STALE_CLAIM_MS elapses for reclaim
  useEffect(() => {
    if (!processing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [processing]);

  const loadRows = async () => {
    if (!batchId) return;
    const res = await fetch(`/api/submissions/batch?batch_id=${encodeURIComponent(batchId)}`);
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
  };

  const loadBatches = async () => {
    if (batchId) return;
    const res = await fetch(`/api/submissions/batch`);
    const data = await res.json();
    setBatches(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    (batchId ? loadRows() : loadBatches()).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  // a row claimed for processing whose claim is older than STALE_CLAIM_MS is
  // treated as abandoned (e.g. the tab crashed mid-OCR) and is retried
  const isStaleClaim = (r: any) =>
    r.status === BATCH_STATUSES.PROCESSING &&
    (!r.batch_claimed_at || Date.now() - new Date(r.batch_claimed_at).getTime() > STALE_CLAIM_MS);

  const counts = {
    queued: rows.filter((r) => r.status === BATCH_STATUSES.QUEUED).length,
    processing: rows.filter((r) => r.status === BATCH_STATUSES.PROCESSING).length,
    ready: rows.filter((r) => r.status === BATCH_STATUSES.READY).length,
    needsReview: rows.filter((r) => r.status === BATCH_STATUSES.NEEDS_REVIEW).length,
    submitted: rows.filter((r) => r.status === SUBMISSION_STATUSES.SUBMITTED).length,
  };

  const retryableCount = rows.filter((r) => r.status === BATCH_STATUSES.QUEUED || isStaleClaim(r)).length;

  // processes one queued row: claims it, runs OCR/CV analysis, then either
  // auto-submits it to the gov queue (score >= PASSING_SCORE, not blurry/flash)
  // or flags it "Batch Needs Review". Returns null if another tab claimed it
  // first (not counted in this tab's stats).
  const processRow = async (row: any): Promise<"submitted" | "needsReview" | null> => {
    const claimRes = await fetch(`/api/submissions/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: BATCH_STATUSES.PROCESSING }),
    });
    if (claimRes.status === 409) return null; // claimed by another tab

    const imageUrl = row.image_url;
    const blob = await fetch(imageUrl).then((r) => r.blob());

    const analysis = await runImageAnalysis(blob);
    const parsed = await runOCRFromOrientations(analysis.orientations);
    const rawText = parsed.raw || "";

    const inputs = buildFieldMatchInputs(row);
    const { fm, matches, total } = computeFieldMatches(rawText, inputs);
    const score = computeAssessmentScore(matches, total);

    const blurry = analysis.blurVariance < BLUR_VARIANCE_THRESHOLD;
    const flash = analysis.flash.flashDetected;
    const warningPresent = GOVERNMENT_WARNING_RE.test(rawText);
    const surgeonGeneral = SURGEON_GENERAL_RE.test(rawText);
    const ocrConfidence = typeof parsed.confidence === "number" ? parsed.confidence : null;

    const passed = score !== null && score >= PASSING_SCORE && !blurry && !flash;
    const finalStatus = passed ? SUBMISSION_STATUSES.SUBMITTED : BATCH_STATUSES.NEEDS_REVIEW;

    await fetch(`/api/submissions/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: finalStatus,
        assessment: {
          score, blurry, flash, ocrConfidence, warningPresent, surgeonGeneral,
          fieldMatches: fm, ocrRaw: rawText,
        },
      }),
    });

    return passed ? "submitted" : "needsReview";
  };

  const startProcessing = async () => {
    const queued = rows.filter((r) => r.status === BATCH_STATUSES.QUEUED || isStaleClaim(r));
    if (queued.length === 0) return;
    setProcessing(true);
    setError(null);
    setProgress({ done: 0, total: queued.length });
    setProcessStats({ submitted: 0, needsReview: 0, failed: 0 });
    setShowProcessModal(true);

    for (let i = 0; i < queued.length; i++) {
      try {
        const outcome = await processRow(queued[i]);
        if (outcome) {
          setProcessStats((prev) => (prev ? { ...prev, [outcome]: prev[outcome] + 1 } : prev));
        }
      } catch (err) {
        console.error(`Failed to process row ${queued[i].id}:`, err);
        setProcessStats((prev) => (prev ? { ...prev, failed: prev.failed + 1 } : prev));
        setError(`Failed to process one or more rows. See console for details.`);
      }
      setProgress({ done: i + 1, total: queued.length });
    }

    await loadRows();
    setProcessing(false);
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 1200, display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Button variant="secondary" onClick={() => router.push("/client/dashboard")}>
          ← Back to Dashboard
        </Button>
      </div>
      <DashboardBox>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <SectionTitle>Batch Review</SectionTitle>

          {!batchId ? (
            loading ? (
              <Spinner label="Loading batches..." />
            ) : batches.length === 0 ? (
              <p className="text-sm" style={{ textAlign: "center", color: "#555" }}>
                No batches found. Use &quot;Bulk Upload&quot; to create one.
              </p>
            ) : (
              <div style={{ maxHeight: 320, overflowY: "auto", marginTop: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                      <th style={{ padding: "8px 6px" }}>Batch ID</th>
                      <th style={{ padding: "8px 6px" }}>Started</th>
                      <th style={{ padding: "8px 6px" }}>Rows</th>
                      <th style={{ padding: "8px 6px" }}>Pending</th>
                      <th style={{ padding: "8px 6px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr key={b.batch_id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                        <td style={{ padding: "8px 6px", fontFamily: "monospace", fontSize: 12 }}>{b.batch_id}</td>
                        <td style={{ padding: "8px 6px" }}>{new Date(b.started_at).toLocaleString()}</td>
                        <td style={{ padding: "8px 6px" }}>{b.total}</td>
                        <td style={{ padding: "8px 6px" }}>{b.pending}</td>
                        <td style={{ padding: "8px 6px" }}>
                          <Button variant="secondary" onClick={() => router.push(`/client/batch-review?batch_id=${encodeURIComponent(b.batch_id)}`)}>
                            Open
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : loading ? (
            <Spinner label="Loading batch..." />
          ) : (
            <>
              <p className="text-sm" style={{ textAlign: "center", color: "#555" }}>
                Batch <code>{batchId}</code> — {rows.length} row(s)
              </p>

              <div style={{ display: "flex", justifyContent: "center", gap: 16, margin: "16px 0", flexWrap: "wrap" }}>
                <span>Queued: {counts.queued}</span>
                <span>Processing: {counts.processing}</span>
                <span>Ready: {counts.ready}</span>
                <span>Needs Review: {counts.needsReview}</span>
                <span>Submitted: {counts.submitted}</span>
              </div>

              {error && (
                <MessageBox variant="error" style={{ marginTop: 16, color: "#991b1b" }}>
                  {error}
                </MessageBox>
              )}

              <div style={{ maxHeight: 320, overflowY: "auto", marginTop: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                      <th className="static-th" style={{ padding: "8px 6px", position: "sticky", top: 0 }}>ID</th>
                      <th className="static-th" style={{ padding: "8px 6px", position: "sticky", top: 0 }}>Brand</th>
                      <th className="static-th" style={{ padding: "8px 6px", position: "sticky", top: 0 }}>Status</th>
                      <th className="static-th" style={{ padding: "8px 6px", position: "sticky", top: 0 }}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const needsReview = r.status === BATCH_STATUSES.NEEDS_REVIEW;
                      return (
                        <tr
                          key={r.id}
                          style={{ borderBottom: "1px solid #f2f2f2", cursor: needsReview ? "pointer" : "default" }}
                          onClick={() => needsReview && setReviewing(r)}
                        >
                          <td style={{ padding: "8px 6px", fontFamily: "monospace", fontSize: 12 }}>{r.id}</td>
                          <td style={{ padding: "8px 6px" }}>{r.brand || "(no brand)"}</td>
                          <td style={{ padding: "8px 6px" }}>
                            {r.status}
                            {needsReview && <span style={{ marginLeft: 6, fontSize: 12, color: "#2563eb" }}>(click to correct)</span>}
                          </td>
                          <td style={{ padding: "8px 6px" }}>{r.assessment_score ?? "N/A"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 16 }}>
                <Button onClick={startProcessing} disabled={processing || retryableCount === 0}>
                  {processing ? "Processing..." : `Start Processing (${retryableCount})`}
                </Button>
              </div>
            </>
          )}
        </div>
      </DashboardBox>

      {reviewing && (
        <Modal onClose={() => setReviewing(null)}>
          <BatchCorrectionForm
            row={reviewing}
            onDone={() => {
              setReviewing(null);
              loadRows();
            }}
          />
        </Modal>
      )}

      {showProcessModal && (
        <Modal
          className="modal-content--narrow"
          onClose={() => {
            if (processing) return;
            setShowProcessModal(false);
          }}
        >
          {processing ? (
            <div className="spinner-container">
              <div className="spinner" />
              <div>
                Processing...
                {progress && progress.total > 0 && ` ${progress.done} of ${progress.total}`}
              </div>
              {progress && progress.total > 0 && (
                <div style={{ width: "100%", maxWidth: 240, height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      background: "#0b5fff",
                      width: `${Math.round((progress.done / progress.total) * 100)}%`,
                      transition: "width 150ms ease",
                    }}
                  />
                </div>
              )}
              {processStats && (
                <div style={{ fontSize: 13, color: "#555", textAlign: "center" }}>
                  Submitted: {processStats.submitted} &nbsp;·&nbsp; Needs review: {processStats.needsReview}
                  {processStats.failed > 0 && <> &nbsp;·&nbsp; Failed: {processStats.failed}</>}
                </div>
              )}
              <div style={{ fontSize: 13, fontWeight: 600, color: "#991b1b", textAlign: "center", marginTop: 4 }}>
                Please do not close this window or browser.
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "8px 4px" }}>
              <SectionTitle>Processing Complete</SectionTitle>
              <p>
                {processStats?.submitted ?? 0} application(s) submitted,{" "}
                {processStats?.needsReview ?? 0} need review
                {processStats && processStats.failed > 0 && <>, {processStats.failed} failed</>}.
              </p>
              <div style={{ marginTop: 16 }}>
                <Button onClick={() => setShowProcessModal(false)}>Close</Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

export default function BatchReviewPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}><Spinner label="Loading..." /></div>}>
      <BatchReviewContent />
    </Suspense>
  );
}
