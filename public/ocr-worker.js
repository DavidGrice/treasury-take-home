// OCR worker using Tesseract.js imported from local /public/libs
self.importScripts('/libs/tesseract.min.js');

let workerInstance = null;

async function ensureWorker() {
  if (workerInstance) return workerInstance;
  // If tesseract provides createWorker, prefer it but validate the returned object
  if (typeof Tesseract !== 'undefined' && typeof Tesseract.createWorker === 'function') {
    // Prefer creating a dedicated Tesseract worker if the worker script is available locally.
    // Check for a local worker script at /libs/worker.min.js before calling createWorker.
    let hasWorkerScript = false;
    try {
      const r = await fetch('/libs/worker.min.js', { method: 'HEAD' });
      hasWorkerScript = r.ok;
    } catch (e) {
      hasWorkerScript = false;
    }
    if (hasWorkerScript) {
      const opt = {
        workerPath: '/libs/worker.min.js',
        corePath: '/libs/tesseract-core.wasm.js',
        langPath: '/libs/tessdata',
        gzip: false,
      };
      try {
        const w = await Tesseract.createWorker(opt);
        if (w && typeof w.recognize === 'function') {
          await w.loadLanguage('eng');
          await w.initialize('eng');
          // each rect is OCR'd in isolation, so treat it as a single block of
          // text rather than assuming a full-page layout (the default PSM)
          const psm = (typeof Tesseract !== 'undefined' && Tesseract.PSM) ? Tesseract.PSM.SINGLE_BLOCK : '6';
          await w.setParameters({ tessedit_pageseg_mode: psm });
          workerInstance = w;
          return workerInstance;
        }
      } catch (err) {
        self.postMessage({ type: 'log', text: `createWorker failed: ${String(err)}` });
      }
    } else {
      self.postMessage({ type: 'log', text: 'Tesseract worker script not found at /libs/worker.min.js; falling back to in-worker recognition.' });
    }
  }
  return null;
}

// rotate a canvas by 0/90/180/270 degrees (clockwise) into a new canvas,
// swapping width/height for 90 and 270 so the rotated content isn't clipped
function rotateCanvas(srcCanvas, angle) {
  if (angle === 0) return srcCanvas;
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const canvas = (angle === 90 || angle === 270) ? new OffscreenCanvas(h, w) : new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  switch (angle) {
    case 90:
      ctx.translate(h, 0);
      ctx.rotate(Math.PI / 2);
      break;
    case 180:
      ctx.translate(w, h);
      ctx.rotate(Math.PI);
      break;
    case 270:
      ctx.translate(0, w);
      ctx.rotate(-Math.PI / 2);
      break;
  }
  ctx.drawImage(srcCanvas, 0, 0);
  return canvas;
}

// run OCR on a single canvas crop and return its recognized text/confidence
async function recognizeCanvas(canvas, tessWorker) {
  const cropBlob = await canvas.convertToBlob({ type: 'image/png' });
  if (tessWorker) {
    const { data } = await tessWorker.recognize(cropBlob);
    return { text: data?.text?.trim() || '', confidence: typeof data?.confidence === 'number' ? data.confidence : null };
  } else if (typeof Tesseract !== 'undefined' && typeof Tesseract.recognize === 'function') {
    const psm = Tesseract.PSM ? Tesseract.PSM.SINGLE_BLOCK : '6';
    const res = await Tesseract.recognize(cropBlob, 'eng', { tessedit_pageseg_mode: psm });
    const text = (res && res.data && res.data.text) ? res.data.text.trim() : '';
    const confidence = (res && res.data && typeof res.data.confidence === 'number') ? res.data.confidence : null;
    return { text, confidence };
  }
  throw new Error('Tesseract not available in worker');
}

self.onmessage = async (e) => {
  const { type } = e.data;
  if (type === 'ocr') {
    const { buffer, rects } = e.data;
    try {
      self.postMessage({ type: 'log', text: 'OCR worker: starting' });
      const blob = new Blob([buffer], { type: 'image/png' });
      const bmp = await createImageBitmap(blob);

      const results = [];
      const tessWorker = await ensureWorker();
      // pad each rect a bit (tight contour boxes often clip ascenders/descenders)
      // and upscale before OCR, since Tesseract accuracy drops sharply on small crops
      const PAD = 8;
      const SCALE = 2;
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        const x = Math.max(0, r.x - PAD);
        const y = Math.max(0, r.y - PAD);
        const w = Math.min(bmp.width - x, r.width + PAD * 2);
        const h = Math.min(bmp.height - y, r.height + PAD * 2);
        const scaledW = Math.round(w * SCALE);
        const scaledH = Math.round(h * SCALE);
        // tiny slivers from contour noise can't be scaled by tesseract and just
        // spam "Image too small to scale" / "Line cannot be recognized" warnings
        const MIN_DIM = 6;
        if (scaledW < MIN_DIM || scaledH < MIN_DIM) {
          results.push({ rect: r, text: '', confidence: null, rotation: 0 });
          continue;
        }
        const canvas = new OffscreenCanvas(scaledW, scaledH);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bmp, x, y, w, h, 0, 0, canvas.width, canvas.height);
        try {
          // labels aren't always printed horizontally (e.g. the "GOVERNMENT
          // WARNING" block printed sideways). Try the orientation that matches
          // the crop's aspect ratio first, then its 180deg flip, then the
          // perpendicular orientations - stopping early once a rotation
          // produces a confident, non-empty read to keep total OCR time down
          const tall = scaledH > scaledW;
          const angles = tall ? [90, 270, 0, 180] : [0, 180, 90, 270];
          let best = { text: '', confidence: null, rotation: 0 };
          for (const angle of angles) {
            try {
              const rotated = rotateCanvas(canvas, angle);
              const { text, confidence } = await recognizeCanvas(rotated, tessWorker);
              const better =
                (text.length > 0 && best.text.length === 0) ||
                (text.length > 0 && best.text.length > 0 && (confidence ?? 0) > (best.confidence ?? 0));
              if (better) best = { text, confidence, rotation: angle };
              // good enough - skip the remaining rotations for this rect
              if (text.length > 0 && (confidence ?? 0) >= 60) break;
            } catch (rotErr) {
              self.postMessage({ type: 'log', text: `OCR worker: rect ${i} rotation ${angle} failed ${String(rotErr)}` });
            }
          }
          results.push({ rect: r, text: best.text, confidence: best.confidence, rotation: best.rotation });
          self.postMessage({ type: 'log', text: `OCR worker: rect ${i} done (confidence=${best.confidence}, rotation=${best.rotation})` });
        } catch (err) {
          self.postMessage({ type: 'log', text: `OCR worker: rect ${i} failed ${String(err)}` });
          results.push({ rect: r, text: '', confidence: null, rotation: 0 });
        }
      }
      bmp.close();
      self.postMessage({ type: 'result', results });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err) });
    }
  }
};
