// Web Worker to run OpenCV.js off the main thread
// Load local OpenCV build from /public/libs
self.importScripts('/libs/opencv.js');

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
  else if (type === 'blurcheck') {
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
      const lap = new cv.Mat();
      cv.Laplacian(gray, lap, cv.CV_64F);
      const mean = new cv.Mat();
      const stddev = new cv.Mat();
      cv.meanStdDev(lap, mean, stddev);
      const variance = Math.pow(stddev.doubleAt(0, 0), 2);
      src.delete(); gray.delete(); lap.delete(); mean.delete(); stddev.delete();
      self.postMessage({ type: 'blurResult', variance });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err) });
    }
  }
  else if (type === 'flashcheck') {
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

      // A camera flash produces a compact, roughly circular "hotspot" of
      // saturated pixels with a radial falloff, usually away from the image
      // edges. A bright (but evenly lit / large) background - common in
      // high-quality scans or app-generated label images - shows up as a
      // large region that touches the image borders and isn't circular, so
      // we look for round, edge-free bright blobs rather than raw brightness.
      const src = cv.matFromImageData(imgData);
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // Threshold to keep only extremely bright pixels
      const thresh = new cv.Mat();
      const threshVal = 250; // very bright
      cv.threshold(gray, thresh, threshVal, 255, cv.THRESH_BINARY);

      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      const imgArea = width * height;
      const margin = Math.round(Math.min(width, height) * 0.02);
      let bestCircularity = 0;
      let bestAreaRatio = 0;

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        // ignore tiny specks and blobs covering most of the frame (background)
        if (area < imgArea * 0.0005 || area > imgArea * 0.25) { cnt.delete(); continue; }

        const rect = cv.boundingRect(cnt);
        const touchesBorder = rect.x <= margin || rect.y <= margin
          || (rect.x + rect.width) >= (width - margin)
          || (rect.y + rect.height) >= (height - margin);
        if (touchesBorder) { cnt.delete(); continue; }

        const perimeter = cv.arcLength(cnt, true);
        const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
        if (circularity > bestCircularity) {
          bestCircularity = circularity;
          bestAreaRatio = area / imgArea;
        }
        cnt.delete();
      }

      // a near-circular saturated hotspot away from the edges is the
      // signature of a flash reflection / radial glare
      const flashDetected = bestCircularity > 0.55 && bestAreaRatio > 0.0008;

      src.delete(); gray.delete(); thresh.delete(); contours.delete(); hierarchy.delete();

      self.postMessage({ type: 'flashResult', circularity: bestCircularity, areaRatio: bestAreaRatio, flashDetected });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err) });
    }
  }
};
