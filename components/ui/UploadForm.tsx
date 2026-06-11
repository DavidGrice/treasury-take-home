"use client";
import React, { useState, useRef } from "react";
import Button from "./Button";
import ImageAnnotator from "./ImageAnnotator";

export default function UploadForm({ onSubmit }: { onSubmit?: (data: any) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [brand, setBrand] = useState("");
  const [typeDesignation, setTypeDesignation] = useState("");
  const [alcoholContent, setAlcoholContent] = useState("");
  const [netContents, setNetContents] = useState("");
  const [producer, setProducer] = useState("");
  const [country, setCountry] = useState("");
  const [warning, setWarning] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const annotRef = useRef<any>(null);

  const handleFile = (f: File | null) => {
    setFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview(url);
      // auto-run detection immediately after selecting/uploading
      runOpenCVOnBlob(f).catch((e) => console.warn('Auto-detect failed', e));
    }
    else setPreview(null);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files ? e.target.files[0] : null;
    handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const clear = () => {
    setFile(null);
    setPreview(null);
    setBrand("");
    setTypeDesignation("");
    setAlcoholContent("");
    setNetContents("");
    setProducer("");
    setCountry("");
    setWarning("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { brand, typeDesignation, alcoholContent, netContents, producer, country, warning, fileName: file?.name };
    console.log("Submitting form:", payload);
    onSubmit?.(payload);
    clear();
  };

  const [ocrLoading, setOcrLoading] = useState(false);
  const parseOCRText = (text: string) => {
    // keep parser in case we add OCR later; for now return empty structured fields
    return {
      brand: '',
      typeDesignation: '',
      alcoholContent: '',
      netContents: '',
      producer: '',
      country: '',
      warning: '',
    };
  };

  const runOpenCVOnBlob = async (blobLike: Blob | null) => {
    if (!blobLike) return alert('No image selected');
    setOcrLoading(true);
    let worker: Worker | null = null;
    try {
      // try worker first (served from /public/opencv-worker.js)
      worker = new Worker('/opencv-worker.js');
      const bmp = await createImageBitmap(blobLike);

      const result = await new Promise<{ found?: number; blob?: Blob; rects?: any[] }>((res, rej) => {
        const t = setTimeout(() => rej(new Error('Worker timeout')), 15000);
        worker!.onmessage = (ev) => {
          clearTimeout(t);
          const data = ev.data;
          if (data.type === 'result') res({ found: data.found, blob: data.blob, rects: data.rects });
          else if (data.type === 'error') rej(new Error(data.message || 'worker error'));
        };
        worker!.postMessage({ type: 'process', bitmap: bmp }, [bmp]);
      });

      if (result.blob) {
        // keep original preview (do not replace with annotated image)
        console.log('OpenCV worker rects:', result.rects || []);
        // run OCR on each rect, parse and log structured fields
        if (result.rects && result.rects.length > 0) {
          try {
            const ocrResults = await runOCROnRects(blobLike, result.rects);
            const parsed = parseFromRects(ocrResults || []);
            console.log('Parsed fields:', parsed);
            if (parsed.brand) setBrand(parsed.brand);
            if (parsed.typeDesignation) setTypeDesignation(parsed.typeDesignation);
            if (parsed.alcohol) setAlcoholContent(parsed.alcohol);
            if (parsed.net) setNetContents(parsed.net);
            if (parsed.producer) setProducer(parsed.producer);
            if (parsed.country) setCountry(parsed.country);
            if (parsed.warning) setWarning(parsed.warning);
            try { if (annotRef.current && typeof annotRef.current.clearBoxes === 'function') annotRef.current.clearBoxes(); } catch (e) {}
          } catch (e) { console.warn('OCR on rects failed', e); }
        }
      } else {
        throw new Error('No blob returned from worker');
      }
    } catch (err) {
      console.warn('Worker processing failed, falling back to main thread', err);
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
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);

        const { loadOpenCV } = await import('./opencvLoader');
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
        ctx.strokeStyle = '#0b5fff';
        ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) / 300));
        let found = 0;
        const rects: any[] = [];
        for (let i = 0; i < contours.size(); i++) {
          const cnt = contours.get(i);
          const area = cv.contourArea(cnt);
          if (area < 500) { cnt.delete(); continue; }
          const rect = cv.boundingRect(cnt);
          ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
          rects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, area });
          found++;
          cnt.delete();
        }
        src.delete(); gray.delete(); blur.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
        const canvasBlob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
        // do not replace preview with annotated canvas; keep original preview image
        console.log('OpenCV fallback rects:', rects);
        if (rects && rects.length > 0) {
          try {
            const ocrResults = await runOCROnRects(canvasBlob, rects);
            const parsed = parseFromRects(ocrResults || []);
            console.log('Parsed fields (fallback):', parsed);
            if (parsed.brand) setBrand(parsed.brand);
            if (parsed.typeDesignation) setTypeDesignation(parsed.typeDesignation);
            if (parsed.alcohol) setAlcoholContent(parsed.alcohol);
            if (parsed.net) setNetContents(parsed.net);
            if (parsed.producer) setProducer(parsed.producer);
            if (parsed.country) setCountry(parsed.country);
            if (parsed.warning) setWarning(parsed.warning);
            try { if (annotRef.current && typeof annotRef.current.clearBoxes === 'function') annotRef.current.clearBoxes(); } catch (e) {}
          } catch (e) { console.warn('OCR on rects failed', e); }
        }
      } catch (err2) {
        console.error('Fallback main-thread processing failed', err2);
        alert('Image processing failed. See console for details.');
      }
    } finally {
      if (worker) worker.terminate();
      setOcrLoading(false);
    }
  };

  const runOpenCVOnFile = async () => {
    if (!file) return alert('Please choose an image first');
    await runOpenCVOnBlob(file);
  };

  const runOCROnRects = async (blobLike: Blob | null, rects: any[]) => {
    if (!blobLike) return;
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker({ logger: (m: any) => console.log('tess:', m) });
      if (typeof worker.load === 'function') await worker.load();
      if (typeof worker.loadLanguage === 'function') await worker.loadLanguage('eng');
      if (typeof worker.initialize === 'function') await worker.initialize('eng');

      // create an ImageBitmap for cropping
      const bmp = await createImageBitmap(blobLike);
      // temporary canvas to crop
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // filter rects: remove tiny or invalid boxes and clamp to bitmap bounds
      const filtered = (rects || []).map((r: any) => ({
        x: Math.max(0, Math.round(r.x || 0)),
        y: Math.max(0, Math.round(r.y || 0)),
        width: Math.max(0, Math.round(r.width || 0)),
        height: Math.max(0, Math.round(r.height || 0)),
        area: r.area || ((r.width || 0) * (r.height || 0)),
      })).filter((r: any) => r.width > 2 && r.height > 2 && r.area > 200)
        .map((r: any) => {
          // clamp to bmp bounds
          const x = Math.min(r.x, bmp.width - 1);
          const y = Math.min(r.y, bmp.height - 1);
          const w = Math.min(r.width, bmp.width - x);
          const h = Math.min(r.height, bmp.height - y);
          return { x, y, width: w, height: h, area: w * h };
        });

      const ocrResults: Array<{ rect: any; text: string }> = [];
      for (let i = 0; i < filtered.length; i++) {
        const r = filtered[i];
        const w = Math.max(1, r.width);
        const h = Math.max(1, r.height);
        canvas.width = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        try {
          ctx.drawImage(bmp, r.x, r.y, r.width, r.height, 0, 0, w, h);
        } catch (err) {
          console.warn('drawImage failed for rect', r, err);
          continue;
        }
        const cropBlob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'));
        if (!cropBlob) { console.warn('Empty crop blob for rect', r); continue; }
        try {
          const { data } = await worker.recognize(cropBlob as any);
          const text = data?.text?.trim() || '';
          console.log(`OCR rect ${i}:`, { rect: r, text });
          ocrResults.push({ rect: r, text });
        } catch (err) {
          console.warn('OCR failed for rect', i, err);
        }
      }
      try { if (worker && typeof worker.terminate === 'function') await worker.terminate(); } catch (e) {}
      return ocrResults;
    } catch (err) {
      console.warn('Tesseract import or OCR failed', err);
      alert('Text extraction failed. See console for details.');
    }
  };

  const parseFromRects = (ocrResults: Array<{ rect: any; text: string }>) => {
    if (!ocrResults || ocrResults.length === 0) return {};

    // sort top->bottom, left->right
    const sorted = [...ocrResults].sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x));
    const joined = sorted.map(r => r.text.replace(/[\u2018\u2019\u201C\u201D]/g, '"')).join('\n').replace(/\s+\n/g,'\n');

    // keep raw for debugging
    const raw = joined;

    // split into lines and normalize characters likely from OCR noise
    const lines = joined.split(/\r?\n/).map(l => l.replace(/["“”‘’\|\\/\_\*\u201A\u201E]/g, ' ').replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);

    // detect potential warning start (may be split across lines)
    let warningIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const li = lines[i];
      if (/government/i.test(li) || /warning/i.test(li) || /surgeon general/i.test(li)) { warningIdx = i; break; }
    }
    const warningLines = warningIdx !== -1 ? lines.slice(warningIdx) : [];
    const nonWarningLines = warningIdx !== -1 ? lines.slice(0, warningIdx) : lines.slice();

    // normalize warning text if present
    let warning = '';
    if (warningLines.length > 0) {
      let wtxt = warningLines.join(' ');
      // normalize 'GOVERNMENT WARNING'
      wtxt = wtxt.replace(/government\s*warning/i, 'GOVERNMENT WARNING');
      // normalize common OCR misspellings of 'Surgeon General'
      wtxt = wtxt.replace(/surgeon\s*(?:genr?al|genreal|gereral|generel|genera[lI]|genefal|genaral)/gi, 'Surgeon General');
      // ensure 'Surgeon General' capitalization
      wtxt = wtxt.replace(/surgeon general/gi, 'Surgeon General');
      warning = wtxt.trim();
    }

    // alcohol: look for 'contains less than X%' first, then typical percent patterns; normalize to 'X% Alc./Vol.'
    let alcohol = '';
    const m1 = joined.match(/contains\s+less\s+than\s*(\d{1,3}(?:\.\d+)?)\s*%/i);
    if (m1) alcohol = `Less than ${m1[1]}% Alc./Vol.`;
    else {
      const m2 = joined.match(/(\d{1,3}(?:\.\d+)?)\s*%\s*(?:abv|alc|alc\.|alc\/vol|alcohol)?/i);
      if (m2) alcohol = `${m2[1]}% Alc./Vol.`;
    }

    // net contents: look for pints first, then mL/L/oz
    let net = '';
    const netMatch = joined.match(/(\d+(?:\.\d+)?)\s*(pint|pints)\b/i) || joined.match(/(\d+(?:\.\d+)?)\s*(mL|ml|l|L|litre|oz|fl oz)\b/i);
    if (netMatch) net = `${netMatch[1]} ${netMatch[2]}`;

    // producer: common keywords
    let producer = '';
    const prodMatch = joined.match(/(?:brewed and bottled by|brewed and bottled|bottled by|brewed by|brewing co\.?|brewery|brewer)[^\n\.]*/i);
    if (prodMatch) producer = prodMatch[0].replace(/^[:\-\s]+/, '').trim();

    // country (simple)
    const country = (joined.match(/\bmade in\b\s*([A-Za-z ]+)/i) || [null])[0] || '';

    // brand: prefer first non-warning short line that isn't producer/alcohol/net
    let brand = '';
    for (const l of nonWarningLines) {
      if (/government warning|surgeon general|drink responsibly|contains less than|%|ml|pint|bottled by|brewed by|brewery|brew/gi.test(l)) continue;
      if (l.length > 2 && l.length < 40) { brand = l.replace(/[^A-Za-z0-9 &\-\.]/g, '').trim(); break; }
    }
    if (!brand && nonWarningLines[0]) brand = nonWarningLines[0].replace(/[^A-Za-z0-9 &\-\.]/g, '').trim();

    // if we didn't create a formatted warning but 'government' and 'warning' are present anywhere, set canonical warning
    const hasGov = /government\s*warning/i.test(joined) || (/government/i.test(joined) && /warning/i.test(joined));
    if (!warning && hasGov) warning = 'GOVERNMENT WARNING';

    return { brand, alcohol, net, producer, country, warning, raw };
  };

  return (
    <form onSubmit={handleSubmit} className="form-split">
      <div className="upload-area" style={{ position: 'relative' }} onDrop={onDrop} onDragOver={onDragOver}>
        {preview ? (
          <ImageAnnotator ref={annotRef} src={preview} onRecognize={(blob) => runOpenCVOnBlob(blob)} />
        ) : (
          <div style={{ textAlign: "center" }}>
            <div className="upload-drop">Drop an image here or</div>
            <div style={{ marginTop: 8 }}>
              <input ref={inputRef} type="file" accept="image/*" onChange={onFileChange} />
            </div>
          </div>
        )}
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <Button type="button" variant="secondary" onClick={() => { if (inputRef.current) inputRef.current.click(); }}>Upload file</Button>
          <Button type="button" variant="secondary" onClick={() => handleFile(null)}>Remove</Button>
        </div>
        {ocrLoading && (
          <div style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.6)', zIndex: 50 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <svg width="40" height="40" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="35" stroke="#e6e6e6" strokeWidth="10" fill="none" />
                <path d="M50 15 a35 35 0 0 1 0 70" stroke="#0b5fff" strokeWidth="10" strokeLinecap="round" fill="none">
                  <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="1s" repeatCount="indefinite" />
                </path>
              </svg>
              <div style={{ fontSize: 14, color: '#111' }}>Processing image…</div>
            </div>
          </div>
        )}
      </div>

      <div className="fields-area">
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        </div>

        <div className="field-row">
          <label className="field-label">Brand name</label>
          <input className="field-input" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>

        <div className="field-row">
          <label className="field-label">Class / Type designation</label>
          <input className="field-input" value={typeDesignation} onChange={(e) => setTypeDesignation(e.target.value)} />
        </div>

        <div className="field-row">
          <label className="field-label">Alcohol content</label>
          <input className="field-input" value={alcoholContent} onChange={(e) => setAlcoholContent(e.target.value)} placeholder="e.g. 45% Alc./Vol." />
        </div>

        <div className="field-row">
          <label className="field-label">Net contents</label>
          <input className="field-input" value={netContents} onChange={(e) => setNetContents(e.target.value)} placeholder="e.g. 750 mL" />
        </div>

        <div className="field-row">
          <label className="field-label">Name and address of bottler/producer</label>
          <input className="field-input" value={producer} onChange={(e) => setProducer(e.target.value)} />
        </div>

        <div className="field-row">
          <label className="field-label">Country of origin (imports)</label>
          <input className="field-input" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>

        <div className="field-row">
          <label className="field-label">Government Health Warning Statement</label>
          <textarea className="field-input" style={{ minHeight: 80 }} value={warning} onChange={(e) => setWarning(e.target.value)} />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <Button type="submit">Save / Submit</Button>
          <Button type="button" variant="secondary" onClick={clear}>Clear</Button>
        </div>
      </div>
    </form>
  );
}
