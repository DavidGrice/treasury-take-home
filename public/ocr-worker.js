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
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        const canvas = new OffscreenCanvas(r.width, r.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
        const cropBlob = await canvas.convertToBlob({ type: 'image/png' });
        try {
          let text = '';
          if (tessWorker) {
            const { data } = await tessWorker.recognize(cropBlob);
            text = data?.text?.trim() || '';
          } else if (typeof Tesseract !== 'undefined' && typeof Tesseract.recognize === 'function') {
            const res = await Tesseract.recognize(cropBlob, 'eng');
            text = (res && res.data && res.data.text) ? res.data.text.trim() : '';
          } else {
            throw new Error('Tesseract not available in worker');
          }
          results.push({ rect: r, text });
          self.postMessage({ type: 'log', text: `OCR worker: rect ${i} done` });
        } catch (err) {
          self.postMessage({ type: 'log', text: `OCR worker: rect ${i} failed ${String(err)}` });
          results.push({ rect: r, text: '' });
        }
      }
      bmp.close();
      self.postMessage({ type: 'result', results });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err) });
    }
  }
};
