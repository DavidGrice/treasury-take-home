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
        const canvas = new OffscreenCanvas(Math.round(w * SCALE), Math.round(h * SCALE));
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bmp, x, y, w, h, 0, 0, canvas.width, canvas.height);
        const cropBlob = await canvas.convertToBlob({ type: 'image/png' });
        try {
          let text = '';
          let confidence = null;
          if (tessWorker) {
            const { data } = await tessWorker.recognize(cropBlob);
            text = data?.text?.trim() || '';
            confidence = typeof data?.confidence === 'number' ? data.confidence : null;
          } else if (typeof Tesseract !== 'undefined' && typeof Tesseract.recognize === 'function') {
            const psm = Tesseract.PSM ? Tesseract.PSM.SINGLE_BLOCK : '6';
            const res = await Tesseract.recognize(cropBlob, 'eng', { tessedit_pageseg_mode: psm });
            text = (res && res.data && res.data.text) ? res.data.text.trim() : '';
            confidence = (res && res.data && typeof res.data.confidence === 'number') ? res.data.confidence : null;
          } else {
            throw new Error('Tesseract not available in worker');
          }
          results.push({ rect: r, text, confidence });
          self.postMessage({ type: 'log', text: `OCR worker: rect ${i} done (confidence=${confidence})` });
        } catch (err) {
          self.postMessage({ type: 'log', text: `OCR worker: rect ${i} failed ${String(err)}` });
          results.push({ rect: r, text: '', confidence: null });
        }
      }
      bmp.close();
      self.postMessage({ type: 'result', results });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err) });
    }
  }
};
