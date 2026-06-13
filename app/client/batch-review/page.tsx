"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardBox from "../../../components/ui/DashboardBox";
import SectionTitle from "../../../components/ui/SectionTitle";
import Button from "../../../components/ui/Button";
import Spinner from "../../../components/ui/Spinner";
import { useLabelAnalysisWorkers } from "../../../components/ui/useLabelAnalysisWorkers";
import {
  computeFieldMatches,
  computeAssessmentScore,
  buildFieldMatchInputs,
  BLUR_VARIANCE_THRESHOLD,
  GOVERNMENT_WARNING_RE,
  SURGEON_GENERAL_RE,
} from "../../../components/ui/labelAnalysis";
import { BATCH_STATUSES } from "../../../components/ui/batchStatus";

const PASSING_SCORE = 80;

function BatchReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batch_id") || "";

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { runImageAnalysis, runOCRFromOrientations } = useLabelAnalysisWorkers();

  const loadRows = async () => {
    if (!batchId) return;
    const res = await fetch(`/api/submissions/batch?batch_id=${encodeURIComponent(batchId)}`);
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    loadRows().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const counts = {
    queued: rows.filter((r) => r.status === BATCH_STATUSES.QUEUED).length,
    processing: rows.filter((r) => r.status === BATCH_STATUSES.PROCESSING).length,
    ready: rows.filter((r) => r.status === BATCH_STATUSES.READY).length,
    needsReview: rows.filter((r) => r.status === BATCH_STATUSES.NEEDS_REVIEW).length,
    submitted: rows.filter((r) => r.status === "Submitted").length,
  };

  const processRow = async (row: any) => {
    const claimRes = await fetch(`/api/submissions/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: BATCH_STATUSES.PROCESSING }),
    });
    if (claimRes.status === 409) return; // claimed by another tab

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

    const finalStatus = score !== null && score >= PASSING_SCORE && !blurry && !flash
      ? BATCH_STATUSES.READY
      : BATCH_STATUSES.NEEDS_REVIEW;

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
  };

  const startProcessing = async () => {
    const queued = rows.filter((r) => r.status === BATCH_STATUSES.QUEUED);
    if (queued.length === 0) return;
    setProcessing(true);
    setError(null);
    setProgress({ done: 0, total: queued.length });

    for (let i = 0; i < queued.length; i++) {
      try {
        await processRow(queued[i]);
      } catch (err) {
        console.error(`Failed to process row ${queued[i].id}:`, err);
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
            <p className="text-sm" style={{ textAlign: "center", color: "#991b1b" }}>
              Missing batch_id.
            </p>
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

              <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
                <Button onClick={startProcessing} disabled={processing || counts.queued === 0}>
                  {processing
                    ? `Processing ${progress?.done ?? 0} of ${progress?.total ?? 0}...`
                    : `Start Processing (${counts.queued})`}
                </Button>
              </div>

              {error && (
                <div style={{ marginTop: 16, padding: 12, background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 6, color: "#991b1b" }}>
                  {error}
                </div>
              )}

              <div style={{ maxHeight: 320, overflowY: "auto", marginTop: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                      <th style={{ padding: "8px 6px" }}>ID</th>
                      <th style={{ padding: "8px 6px" }}>Brand</th>
                      <th style={{ padding: "8px 6px" }}>Status</th>
                      <th style={{ padding: "8px 6px" }}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                        <td style={{ padding: "8px 6px", fontFamily: "monospace", fontSize: 12 }}>{r.id}</td>
                        <td style={{ padding: "8px 6px" }}>{r.brand || "(no brand)"}</td>
                        <td style={{ padding: "8px 6px" }}>{r.status}</td>
                        <td style={{ padding: "8px 6px" }}>{r.assessment_score ?? "N/A"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </DashboardBox>
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
