// Web Worker to run OpenCV.js off the main thread
self.importScripts('https://docs.opencv.org/4.x/opencv.js');

let cvReady = false;
if (typeof Module === 'object') {
  Module.onRuntimeInitialized = () => { cvReady = true; };
} else {
  // fallback
  self.cv = self.cv || {};
  if (self.cv && self.cv['onRuntimeInitialized']) self.cv['onRuntimeInitialized'] = () => { cvReady = true; };
}

self.onmessage = async (e) => {
  const { type } = e.data;
  if (type === 'process') {
    const { bitmap } = e.data;
    try {
      if (!cvReady) {
        await new Promise((res) => {
          const wait = () => { if (cvReady) res(); else setTimeout(wait, 50); };
          wait();
        });
      }

      const width = bitmap.width;
      const height = bitmap.height;
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const imgData = ctx.getImageData(0, 0, width, height);

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
      ctx.lineWidth = Math.max(2, Math.round(Math.min(width, height) / 300));
      let found = 0;
      const rects = [];
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

      const blob = await canvas.convertToBlob({ type: 'image/png' });
      // send back blob, count and rectangles
      self.postMessage({ type: 'result', found, rects, blob });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err) });
    }
  }
};
