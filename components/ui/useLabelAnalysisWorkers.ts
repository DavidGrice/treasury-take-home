"use client";
import { useEffect, useRef } from "react";
import { parseFromRects, type ImageAnalysis, type ParsedFields } from "./labelAnalysis";

// owns the persistent OpenCV/OCR Web Workers used by the label-analysis
// pipeline: created lazily on first use and reused for every subsequent
// analysis/OCR call so the WASM runtimes are only initialized once per page.
export function useLabelAnalysisWorkers(onLog?: (msg: string) => void) {
  const opencvWorkerRef = useRef<Worker | null>(null);
  // a small pool of OCR workers lets per-rect OCR and the whole-image
  // sparse/auto passes run in parallel instead of one after another
  const ocrWorkerPoolRef = useRef<Worker[]>([]);
  const reqIdRef = useRef(0);

  useEffect(() => {
    return () => {
      opencvWorkerRef.current?.terminate();
      ocrWorkerPoolRef.current.forEach((w) => w.terminate());
    };
  }, []);

  const addLog = (msg: string) => onLog?.(msg);

  // single OpenCV worker call: downscales the image once and returns blur
  // variance, flash detection, and candidate text regions (+ the downscaled
  // image buffer for OCR) all together, instead of three separate worker
  // round-trips that each re-initialize the OpenCV WASM runtime
  const runImageAnalysis = async (blobLike: Blob): Promise<ImageAnalysis> => {
    if (!opencvWorkerRef.current) opencvWorkerRef.current = new Worker('/opencv-worker.js');
    const worker = opencvWorkerRef.current;
    const bmp = await createImageBitmap(blobLike);
    const reqId = ++reqIdRef.current;
    return await new Promise<ImageAnalysis>((res, rej) => {
      const t = setTimeout(() => rej(new Error('Worker timeout')), 30000);
      worker.onmessage = (ev) => {
        const data = ev.data;
        if (data.reqId !== reqId) return; // stale response from a prior (timed-out) call
        if (data.type === 'log') { addLog(data.text); return; }
        clearTimeout(t);
        if (data.type === 'result') res({ blurVariance: data.blurVariance, flash: data.flash, orientations: data.orientations });
        else if (data.type === 'error') rej(new Error(data.message || 'worker error'));
      };
      worker.postMessage({ type: 'analyze', bitmap: bmp, reqId }, [bmp]);
    });
  };

  // run a single OCR worker call against one of the (up to 2) pooled workers
  const runOCROnPooledWorker = (worker: Worker, items: any[], transfer: ArrayBuffer[], wholePasses: string[]): Promise<any[]> => {
    const reqId = ++reqIdRef.current;
    return new Promise<any[]>((res, rej) => {
      const t = setTimeout(() => rej(new Error('ocr worker timeout')), 270000);
      worker.onmessage = (ev: MessageEvent) => {
        if (ev.data.reqId !== reqId) return; // stale response from a prior (timed-out) call
        if (ev.data.type === 'log') addLog(ev.data.text);
        else if (ev.data.type === 'result') { clearTimeout(t); res(ev.data.results); }
        else if (ev.data.type === 'error') { clearTimeout(t); rej(new Error(ev.data.message)); }
      };
      worker.postMessage({ type: 'ocr', items, reqId, wholePasses }, transfer);
    });
  };

  const runOCROnRects = async (items: Array<{ rotation: number; buffer: ArrayBuffer; rects: any[]; sourceImage?: number }>) => {
    if (!items || items.length === 0) return;
    try {
      addLog('Starting OCR workers');
      const pool = ocrWorkerPoolRef.current;
      if (pool.length === 0) {
        pool.push(new Worker('/ocr-worker.js'), new Worker('/ocr-worker.js'));
      }
      const [workerA, workerB] = pool;

      // split each item's rects roughly in half across the two workers, and
      // give each worker a clone of the image buffer (transferable buffers
      // can only be handed to one recipient) plus a different whole-image
      // pass (sparse vs auto) so both run in parallel instead of in sequence
      const itemsA = items.map((it) => ({ ...it, rects: it.rects.slice(0, Math.ceil(it.rects.length / 2)) }));
      const itemsB = items.map((it) => ({ ...it, buffer: it.buffer.slice(0), rects: it.rects.slice(Math.ceil(it.rects.length / 2)) }));

      const [resA, resB] = await Promise.all([
        runOCROnPooledWorker(workerA, itemsA, itemsA.map((it) => it.buffer), ['sparse']),
        runOCROnPooledWorker(workerB, itemsB, itemsB.map((it) => it.buffer), ['auto']),
      ]);

      addLog('OCR workers finished');
      return [...(resA || []), ...(resB || [])];
    } catch (err) {
      addLog(`OCR worker failed: ${String(err)}`);
      console.warn('Tesseract import or OCR failed', err);
      alert('Text extraction failed. See console for details.');
    }
  };

  // run OCR on the candidate text regions from runImageAnalysis (or a
  // main-thread fallback), and parse the results into label fields
  const runOCRFromOrientations = async (
    orientations: Array<{ angle: number; rects: any[]; buffer: ArrayBuffer; sourceImage?: number }>
  ): Promise<ParsedFields> => {
    const items = orientations
      .filter(o => o.rects && o.rects.length > 0)
      .map(o => ({ rotation: o.angle, buffer: o.buffer, rects: o.rects, sourceImage: o.sourceImage }));
    if (items.length === 0) return {};
    addLog(`runOpenCVOnBlob: sending rects from ${new Set(items.map(it => it.sourceImage)).size} photo(s) to OCR worker`);
    const ocrResults = await runOCROnRects(items);
    (ocrResults || []).forEach((r: any, i: number) => {
      const snippet = (r.text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      const label = r.whole ? `whole-image (${r.wholePass})` : `rect ${i}`;
      const photoLabel = typeof r.sourceImage === 'number' ? `photo ${r.sourceImage + 1} ` : '';
      addLog(`OCR ${photoLabel}${label}: rect=${JSON.stringify(r.rect)} rotation=${r.rotation} confidence=${r.confidence ?? 'n/a'} text="${snippet}"`);
    });
    const parsed = parseFromRects(ocrResults || []);
    return parsed || {};
  };

  return {
    opencvWorkerRef,
    ocrWorkerPoolRef,
    reqIdRef,
    runImageAnalysis,
    runOCROnRects,
    runOCRFromOrientations,
  };
}
