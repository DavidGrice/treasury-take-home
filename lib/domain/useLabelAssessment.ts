"use client";
import { useEffect, useRef, useState } from "react";
import { computeFieldMatches, computeAssessmentScore, type ImageAnalysis } from "@/lib/domain/labelAnalysis";
import { useLabelAnalysisWorkers } from "@/lib/domain/useLabelAnalysisWorkers";

// fallback (main-thread) path only checks a single orientation, so cap its
// rect count to match the per-orientation cap used by the OpenCV worker
const MAX_OCR_RECTS = 4;

export type CheckStatus = Record<string, "idle" | "running" | "ok" | "fail">;
export type FieldMatches = Record<string, boolean | "no-input">;

// drives the image-quality checks (blur/flash), OCR/OpenCV analysis, and the
// resulting field-match assessment for a label submission. Shared by any
// page that needs to run this pipeline against a set of photos + form inputs.
export function useLabelAssessment({
  viewOnly,
  files,
  fieldInputs,
  fieldKeys,
  onWarning,
  onStepChange,
}: {
  viewOnly?: boolean;
  files: File[];
  fieldInputs: Record<string, string>;
  fieldKeys: string[];
  onWarning: (text: string) => void;
  onStepChange?: (step: number) => void;
}) {
  const [parsedFields, setParsedFields] = useState<any>(null);
  const [assessmentScore, setAssessmentScore] = useState<number | null>(null);
  const [fieldMatches, setFieldMatches] = useState<FieldMatches>({});
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [checkStatus, setCheckStatus] = useState<CheckStatus>({});
  const [runningChecks, setRunningChecks] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [isBlurry, setIsBlurry] = useState<boolean | null>(null);
  const [hasFlash, setHasFlash] = useState<boolean | null>(null);

  const annotRef = useRef<any>(null);
  const assessmentTokenRef = useRef(0);

  const addLog = (msg: string) => {
    console.log(`ChecklistLog: ${msg}`);
  };

  const { runImageAnalysis, runOCRFromOrientations: runOCRFromOrientationsBase } = useLabelAnalysisWorkers(addLog);

  // resets analysis results when the set of photos being checked changes
  // (new photos added/removed, so any previous checks no longer apply)
  const resetAnalysis = () => {
    setIsBlurry(null);
    setHasFlash(null);
    setCheckStatus({});
    setAnalysisComplete(false);
    setOcrConfidence(null);
  };

  useEffect(() => {
    // when all files removed, reset checklist
    // (skip in viewOnly: on mount `files` is still empty until the saved image
    // finishes loading async, which would otherwise wipe out the stored
    // isBlurry/hasFlash results set by the initialData population effect)
    if (viewOnly) return;
    if (files.length === 0) {
      setIsBlurry(null);
      setHasFlash(null);
    }
  }, [files, viewOnly]);

  // run OCR on the candidate text regions from runImageAnalysis (or the
  // main-thread fallback), parse the results, and update form state
  const runOCRFromOrientations = async (orientations: Array<{ angle: number; rects: any[]; buffer: ArrayBuffer; sourceImage?: number }>) => {
    const parsed = await runOCRFromOrientationsBase(orientations);
    setParsedFields(parsed || {});
    try { if (annotRef.current && typeof annotRef.current.clearBoxes === "function") annotRef.current.clearBoxes(); } catch (e) {}
    return parsed || {};
  };

  const runOpenCVOnBlob = async (blobLike: Blob | null) => {
    if (!blobLike) return alert("No image selected");
    setOcrLoading(true);
    let finalParsed: any = null;
    addLog("runOpenCVOnBlob: starting OpenCV worker");
    try {
      const analysis = await runImageAnalysis(blobLike);
      if (!analysis.orientations || analysis.orientations.length === 0) throw new Error("No orientations returned from worker");
      addLog(`OpenCV worker rects: ${JSON.stringify(analysis.orientations.map(o => ({ angle: o.angle, count: o.rects.length })))}`);
      try {
        finalParsed = await runOCRFromOrientations(analysis.orientations);
      } catch (e) { console.warn("OCR on rects failed", e); }
    } catch (err) {
      console.warn("Worker processing failed, falling back to main thread", err);
      // fallback: try main-thread approach but first downscale image to avoid freeze
      try {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = URL.createObjectURL(blobLike);
        });
        const MAX = 1200;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (Math.max(w, h) > MAX) {
          const scale = MAX / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);

        const { loadOpenCV } = await import("@/lib/domain/opencvLoader");
        const cv = await loadOpenCV();
        const src = cv.matFromImageData(imgData);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        const blur = new cv.Mat();
        cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
        const thresh = new cv.Mat();
        cv.adaptiveThreshold(blur, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        ctx.strokeStyle = "#0b5fff";
        ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) / 300));
        let found = 0;
        const rects: any[] = [];
        for (let i = 0; i < contours.size(); i++) {
          const cnt = contours.get(i);
          const area = cv.contourArea(cnt);
          if (area < w * h * 0.0008) { cnt.delete(); continue; }
          const rect = cv.boundingRect(cnt);
          ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
          rects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, area });
          found++;
          cnt.delete();
        }
        src.delete(); gray.delete(); blur.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
        const canvasBlob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/png"));
        // do not replace preview with annotated canvas; keep original preview image
        if (rects && rects.length > 0 && canvasBlob) {
          try {
            const rectsToOCR = [...rects].sort((a, b) => (b.area || 0) - (a.area || 0)).slice(0, MAX_OCR_RECTS);
            const buffer = await canvasBlob.arrayBuffer();
            finalParsed = await runOCRFromOrientations([{ angle: 0, rects: rectsToOCR, buffer }]);
          } catch (e) { console.warn("OCR on rects failed", e); }
        }
      } catch (err2) {
        console.error("Fallback main-thread processing failed", err2);
        alert("Image processing failed. See console for details.");
      }
    } finally {
      setOcrLoading(false);
    }

    return finalParsed;
  };

  // compute assessment by comparing user inputs (treated as regex) to parsed OCR fields
  const computeAssessment = () => {
    const token = ++assessmentTokenRef.current;
    setAssessing(true);
    // schedule heavy work off the render path to keep UI responsive
    setTimeout(() => {
      if (token !== assessmentTokenRef.current) return; // cancelled
      const rawText = (parsedFields || {}).raw || "";
      const { fm, matches, total } = computeFieldMatches(rawText, fieldInputs);

      if (token !== assessmentTokenRef.current) return;
      setAssessmentScore(computeAssessmentScore(matches, total));
      setFieldMatches(fm);
      setAssessing(false);
    }, 0);
  };

  useEffect(() => {
    // recompute whenever parsed fields or user inputs change
    // (skip in viewOnly: results are loaded from the stored assessment, not recomputed)
    if (viewOnly) return;
    computeAssessment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedFields, JSON.stringify(fieldInputs)]);

  const runAllChecks = async () => {
    if (files.length === 0) return alert("Please upload an image first");
    setRunningChecks(true);
    setAnalysisComplete(false);
    // reset statuses
    const initial: CheckStatus = { blurry: "running", flash: "running", ocr: "idle", surgeonGeneral: "idle", warningPresent: "idle", ocrConfidence: "idle" };
    fieldKeys.forEach((k) => initial[k] = "idle");
    setCheckStatus(initial);
    addLog("runAllChecks: started");
    // move to checklist view immediately so user sees running spinners
    onStepChange?.(2);

    // 1) run the consolidated image-analysis pass (blur variance, flash
    // detection, and OCR text regions all from one downscaled copy) for
    // EVERY photo in the batch, so all of them are checked for quality and
    // all of their candidate text regions feed into a single combined OCR pass
    const analyses: Array<ImageAnalysis | null> = [];
    for (let i = 0; i < files.length; i++) {
      try {
        addLog(`runAllChecks: starting image analysis (photo ${i + 1}/${files.length})`);
        analyses.push(await runImageAnalysis(files[i]));
      } catch (err) {
        addLog(`runAllChecks: image analysis failed for photo ${i + 1}: ${String(err)}`);
        console.warn("Image analysis worker failed", err);
        analyses.push(null);
      }
    }

    try {
      let blurryDetected: boolean | null = null;
      let blurryIndex = -1;
      analyses.forEach((a, i) => {
        if (a && a.blurVariance < 100 && blurryIndex === -1) { blurryDetected = true; blurryIndex = i; }
      });
      if (blurryDetected === null) blurryDetected = analyses.every((a) => a === null) ? null : false;
      addLog(`runAllChecks: blur check result=${String(blurryDetected)}`);
      setIsBlurry(blurryDetected);
      setCheckStatus((s) => ({ ...s, blurry: blurryDetected ? "fail" : "ok" }));
      if (blurryDetected) {
        onWarning(`Warning: Photo ${blurryIndex + 1} appears blurry. All images must be clear and free of blur.`);
        setRunningChecks(false);
        setAnalysisComplete(true);
        return;
      }

      let flashDetected: boolean | null = null;
      let flashIndex = -1;
      analyses.forEach((a, i) => {
        if (a && a.flash.flashDetected && flashIndex === -1) { flashDetected = true; flashIndex = i; }
      });
      if (flashDetected === null) flashDetected = analyses.every((a) => a === null) ? null : false;
      addLog(`runAllChecks: flash check result=${String(flashDetected)}`);
      setHasFlash(flashDetected);
      setCheckStatus((s) => ({ ...s, flash: flashDetected ? "fail" : "ok" }));
      if (flashDetected) {
        onWarning(`Warning: Flash or extreme highlights detected on photo ${flashIndex + 1}. All images must be free of flash.`);
        setRunningChecks(false);
        setAnalysisComplete(true);
        return;
      }
    } catch (err) {
      console.warn("Image quality check failed", err);
      setCheckStatus((s) => ({ ...s, blurry: "fail", flash: "fail" }));
      onWarning("Image quality analysis failed");
      setRunningChecks(false);
      setAnalysisComplete(true);
      return;
    }

    // 2) run OCR / parsing
    addLog("runAllChecks: starting OCR");
    setCheckStatus((s) => {
      const next: CheckStatus = { ...s, ocr: "running" };
      fieldKeys.forEach((k) => next[k] = "running");
      return next;
    });
    try {
      // combine every photo's candidate text regions into one list so a
      // single OCR pass (split across the worker pool) checks all photos at
      // once - this lets a field match text found on ANY of the photos
      const combinedOrientations = analyses.flatMap((a, i) => {
        if (!a || !a.orientations) return [];
        return a.orientations.map((o) => ({ ...o, sourceImage: i }));
      });
      // reuse the analysis passes' orientations/rects when available so OCR
      // doesn't trigger a second OpenCV worker run; otherwise fall back to
      // runOpenCVOnBlob, which re-runs analysis and has its own main-thread fallback
      const parsed = combinedOrientations.length > 0
        ? await runOCRFromOrientations(combinedOrientations)
        : await runOpenCVOnBlob(files[0]);
      addLog("runAllChecks: OCR finished");
      // parsed is set in state by the OCR helpers above
      setCheckStatus((s) => ({ ...s, ocr: "ok" }));

      // compute per-field matches directly from the freshly parsed raw OCR text
      const rawText = (parsed || {}).raw || "";
      const { fm, matches, total } = computeFieldMatches(rawText, fieldInputs, addLog);
      setFieldMatches(fm);
      setAssessmentScore(computeAssessmentScore(matches, total));

      const updates: CheckStatus = {};
      let anyFail = false;
      fieldKeys.forEach((k) => {
        const v = fm[k];
        if (v === "no-input") updates[k] = "idle";
        else if (v === true) updates[k] = "ok";
        else { updates[k] = "fail"; anyFail = true; }
      });

      // "Surgeon General" must appear exactly as written; common OCR misspellings
      // (e.g. "Surgeon Genreal") indicate the printed text itself is non-compliant
      const sgExact = /surgeon general/i.test(rawText);
      if (sgExact) updates.surgeonGeneral = "ok";
      else { updates.surgeonGeneral = "fail"; anyFail = true; }

      // "GOVERNMENT WARNING" must appear exactly as written on the label
      const gwExact = /government warning/i.test(rawText);
      if (gwExact) updates.warningPresent = "ok";
      else { updates.warningPresent = "fail"; anyFail = true; }

      // overall OCR confidence: low confidence means the parsed fields above
      // are less trustworthy and may warrant manual review even if they matched
      const conf = (parsed || {}).confidence;
      setOcrConfidence(typeof conf === "number" ? conf : null);
      if (typeof conf === "number") {
        if (conf >= 70) updates.ocrConfidence = "ok";
        else { updates.ocrConfidence = "fail"; anyFail = true; }
      } else {
        updates.ocrConfidence = "idle";
      }

      setCheckStatus((s) => ({ ...s, ...updates }));

      if (anyFail) {
        onWarning("One or more fields did not match the image. Please review the parsed results or edit the inputs.");
      }
    } catch (err) {
      console.warn("OCR check failed", err);
      setCheckStatus((s) => ({ ...s, ocr: "fail" }));
      onWarning("Text recognition failed.");
    } finally {
      setRunningChecks(false);
      setAnalysisComplete(true);
      onStepChange?.(2);
    }
  };

  return {
    parsedFields,
    assessmentScore,
    setAssessmentScore,
    fieldMatches,
    setFieldMatches,
    ocrConfidence,
    setOcrConfidence,
    checkStatus,
    setCheckStatus,
    runningChecks,
    analysisComplete,
    setAnalysisComplete,
    assessing,
    ocrLoading,
    isBlurry,
    setIsBlurry,
    hasFlash,
    setHasFlash,
    annotRef,
    resetAnalysis,
    runOpenCVOnBlob,
    runAllChecks,
  };
}
