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

// fraction of dark pixels in a thin border strip around the image - used to
// detect whether the photo has a dark background/ruler frame around the
// label (as opposed to the label filling the whole frame). A fraction (not a
// mean) is used because large bright ruler numbers near the edge can drag the
// mean up even when most of the border is black.
function borderDarkFraction(mat, margin, darkThresh) {
  const w = mat.cols, h = mat.rows;
  const strips = [
    new cv.Rect(0, 0, w, margin),
    new cv.Rect(0, h - margin, w, margin),
    new cv.Rect(0, 0, margin, h),
    new cv.Rect(w - margin, 0, margin, h),
  ];
  let dark = 0, total = 0;
  for (const r of strips) {
    const roi = mat.roi(r);
    const mask = new cv.Mat();
    cv.threshold(roi, mask, darkThresh, 255, cv.THRESH_BINARY_INV);
    dark += cv.countNonZero(mask);
    total += roi.rows * roi.cols;
    mask.delete();
    roi.delete();
  }
  return total > 0 ? dark / total : 0;
}

// find the bounding box of the label itself when it's photographed against a
// contrasting background (e.g. a ruler on a black backdrop). Returns null if
// no such background is detected - e.g. the label already fills the frame -
// so the caller can fall back to using the full image unchanged.
function findLabelCrop(gray, width, height) {
  const imgArea = width * height;
  const margin = Math.max(2, Math.round(Math.min(width, height) * 0.03));
  // require most of the border to be dark - a few bright ruler digits near
  // the edge shouldn't disqualify an otherwise dark background
  if (borderDarkFraction(gray, margin, 60) < 0.4) return null;

  const otsu = new cv.Mat();
  cv.threshold(gray, otsu, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  const inv = new cv.Mat();
  cv.bitwise_not(otsu, inv);

  let best = null;
  for (const mask of [otsu, inv]) {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      const rect = cv.boundingRect(cnt);
      const rectArea = rect.width * rect.height;
      const ratio = rectArea / imgArea;
      // candidate label region: large but not the whole frame, and roughly
      // rectangular (its contour fills most of its own bounding box)
      const fill = rectArea > 0 ? area / rectArea : 0;
      if (ratio > 0.15 && ratio < 0.92 && fill > 0.5) {
        if (!best || rectArea > best.rectArea) {
          best = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, rectArea };
        }
      }
      cnt.delete();
    }
    contours.delete(); hierarchy.delete();
  }
  otsu.delete(); inv.delete();
  return best;
}

// rotate a canvas by `angleDeg` (clockwise) into a new canvas of the same
// size - corners may clip slightly, which is fine for the small skew-only
// angles this is used for. Used instead of cv.warpAffine, which this
// OpenCV.js build doesn't include.
function rotateCanvasInPlace(srcCanvas, angleDeg) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.translate(w / 2, h / 2);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.drawImage(srcCanvas, -w / 2, -h / 2);
  return canvas;
}

// estimate the small rotation (in degrees) needed to level a tilted photo
// using the classic projection-profile method: for a range of candidate
// angles, rotate a small downscaled copy and score how "peaky" its
// horizontal row-sum profile is - when text lines/edges are aligned with
// the x-axis, rows alternate sharply between mostly-text and mostly-
// background, giving a high-variance profile; a tilted image blurs that
// distinction across rows. This needs only Canvas 2D rotation and a pixel
// loop, avoiding cv.minAreaRect/cv.warpAffine which this build lacks.
function estimateSkewAngle(canvas, width, height) {
  const SMALL_DIM = 300;
  const scale = SMALL_DIM / Math.max(width, height);
  const sw = Math.max(1, Math.round(width * scale));
  const sh = Math.max(1, Math.round(height * scale));

  const small = new OffscreenCanvas(sw, sh);
  small.getContext('2d').drawImage(canvas, 0, 0, sw, sh);

  let best = { angle: 0, score: -1 };
  for (let angle = -10; angle <= 10; angle += 0.5) {
    const rotated = angle === 0 ? small : rotateCanvasInPlace(small, angle);
    const data = rotated.getContext('2d').getImageData(0, 0, sw, sh).data;
    const rowSums = new Float64Array(sh);
    for (let y = 0; y < sh; y++) {
      let sum = 0;
      for (let x = 0; x < sw; x++) {
        const o = (y * sw + x) * 4;
        const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
        if (lum < 128) sum++;
      }
      rowSums[y] = sum;
    }
    let mean = 0;
    for (let y = 0; y < sh; y++) mean += rowSums[y];
    mean /= sh;
    let variance = 0;
    for (let y = 0; y < sh; y++) variance += (rowSums[y] - mean) * (rowSums[y] - mean);
    variance /= sh;
    if (variance > best.score) best = { angle, score: variance };
  }
  return best.angle;
}

self.onmessage = async (e) => {
  const { type, reqId } = e.data;
  if (type === 'analyze') {
    const { bitmap } = e.data;
    try {
      if (!cvReady) {
        self.postMessage({ type: 'log', reqId, text: 'opencv-worker: waiting for OpenCV WASM init' });
        await new Promise((res) => {
          const wait = () => { if (cvReady) res(); else setTimeout(wait, 50); };
          wait();
        });
        self.postMessage({ type: 'log', reqId, text: 'opencv-worker: OpenCV WASM ready' });
      }

      // do everything (blur check, flash check, text-region detection, and
      // the image handed to the OCR worker) off a single downscaled copy -
      // draw straight from the bitmap into the target-sized canvas so a
      // full-resolution intermediate (e.g. 4000x3000 = ~48MB) is never
      // allocated, which matters on memory-constrained devices
      const MAX_DIM = 1600;
      const longest = Math.max(bitmap.width, bitmap.height);
      let width = bitmap.width;
      let height = bitmap.height;
      if (longest > MAX_DIM) {
        const scale = MAX_DIM / longest;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const tDownscaleStart = performance.now();
      let canvas = new OffscreenCanvas(width, height);
      const dctx = canvas.getContext('2d');
      dctx.imageSmoothingEnabled = true;
      dctx.imageSmoothingQuality = 'high';
      dctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      let imgArea = width * height;

      let imgData = canvas.getContext('2d').getImageData(0, 0, width, height);
      let src = cv.matFromImageData(imgData);
      let gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // CLAHE disabled for performance (was contributing to freezes).
      // Re-enable if contrast on real labels is poor.
      // const clahe = cv.createCLAHE(2.0, new cv.Size(8, 8));
      // clahe.apply(gray, gray);
      // clahe.delete();

      const downscaleMs = Math.round(performance.now() - tDownscaleStart);

      // many phone photos of labels are tilted a few degrees, not just
      // rotated 90/180/270. A tilted text block fragments into more, smaller
      // contours and reads worse in both the per-rect and whole-image OCR
      // passes, so level the photo before any detection happens.
      const tDeskewStart = performance.now();
      const skewAngle = estimateSkewAngle(canvas, width, height);
      let deskewApplied = false;
      // small angles (<1deg) are usually just noise in the projection-profile
      // estimate rather than a real camera tilt - this is especially true for
      // curved/reflective objects (cans, bottles) that don't have one
      // well-defined skew angle. Rotating still requires resampling the image,
      // which can blur already-marginal text, so only correct angles large
      // enough to be a real tilt.
      if (Math.abs(skewAngle) > 1.0) {
        canvas = rotateCanvasInPlace(canvas, skewAngle);
        src.delete(); gray.delete();
        imgData = canvas.getContext('2d').getImageData(0, 0, width, height);
        src = cv.matFromImageData(imgData);
        gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        deskewApplied = true;
      }
      const deskewMs = Math.round(performance.now() - tDeskewStart);

      // some photos place the label on a contrasting (often dark/ruler)
      // background; others are just the label filling the frame. When a
      // background is detected, crop down to the label region so background
      // text (ruler numbers, etc.) doesn't compete with real label text for
      // OCR rect slots, and so blur/flash/text detection all run on the
      // label itself rather than the whole photo.
      const tCropStart = performance.now();
      let cropApplied = false;
      const labelCrop = findLabelCrop(gray, width, height);
      if (labelCrop) {
        const pad = Math.round(Math.min(labelCrop.width, labelCrop.height) * 0.02);
        const cx = Math.max(0, labelCrop.x - pad);
        const cy = Math.max(0, labelCrop.y - pad);
        const cw = Math.min(width - cx, labelCrop.width + pad * 2);
        const ch = Math.min(height - cy, labelCrop.height + pad * 2);

        const croppedCanvas = new OffscreenCanvas(cw, ch);
        croppedCanvas.getContext('2d').drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);

        src.delete(); gray.delete();
        canvas = croppedCanvas;
        width = cw; height = ch; imgArea = width * height;
        imgData = canvas.getContext('2d').getImageData(0, 0, width, height);
        src = cv.matFromImageData(imgData);
        gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cropApplied = true;
      }
      const cropMs = Math.round(performance.now() - tCropStart);

      const tDetectStart = performance.now();
      // --- blur check: variance of the Laplacian ---
      const lap = new cv.Mat();
      cv.Laplacian(gray, lap, cv.CV_64F);
      const lapMean = new cv.Mat();
      const lapStddev = new cv.Mat();
      cv.meanStdDev(lap, lapMean, lapStddev);
      const blurVariance = Math.pow(lapStddev.doubleAt(0, 0), 2);
      lap.delete(); lapMean.delete(); lapStddev.delete();

      // --- flash check: compact, roughly circular saturated hotspot away
      // from the image edges (large/even bright regions are ignored) ---
      const flashThresh = new cv.Mat();
      cv.threshold(gray, flashThresh, 250, 255, cv.THRESH_BINARY);
      const flashContours = new cv.MatVector();
      const flashHierarchy = new cv.Mat();
      cv.findContours(flashThresh, flashContours, flashHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      const margin = Math.round(Math.min(width, height) * 0.02);
      let bestCircularity = 0;
      let bestAreaRatio = 0;
      for (let i = 0; i < flashContours.size(); i++) {
        const cnt = flashContours.get(i);
        const area = cv.contourArea(cnt);
        if (area < imgArea * 0.0005 || area > imgArea * 0.25) { cnt.delete(); continue; }
        const rect = cv.boundingRect(cnt);
        const touchesBorder = rect.x <= margin || rect.y <= margin
          || (rect.x + rect.width) >= (width - margin)
          || (rect.y + rect.height) >= (height - margin);
        if (touchesBorder) { cnt.delete(); continue; }

        // Reject elongated bright regions (thin horizontal/vertical white lines common in
        // label design software, clean screenshots, or graphic elements). These are not
        // real specular "flash" highlights on a physical can photo.
        const w = rect.width;
        const h = rect.height;
        const aspect = Math.max(w, h) / Math.min(w, h);
        if (aspect > 4.0) { cnt.delete(); continue; }

        const perimeter = cv.arcLength(cnt, true);
        const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
        if (circularity > bestCircularity) {
          bestCircularity = circularity;
          bestAreaRatio = area / imgArea;
        }
        cnt.delete();
      }
      const flashDetected = bestCircularity > 0.55 && bestAreaRatio > 0.0008;
      flashThresh.delete(); flashContours.delete(); flashHierarchy.delete();

      // --- text region detection ---
      const blurred = new cv.Mat();
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      const thresh = new cv.Mat();
      cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

      // Dilate to connect broken or fragmented text characters (common on labels with graphics, shadows, or low contrast).
      // This helps contours capture fuller words/lines instead of splitting into tiny rects.
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      cv.dilate(thresh, thresh, kernel, new cv.Point(-1, -1), 1);
      kernel.delete();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      // RETR_LIST (not RETR_EXTERNAL) so text blocks sitting inside the can's
      // outer silhouette are found as their own contours instead of being
      // swallowed into one sprawling outer contour
      cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      const rects = [];
      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        const rect = cv.boundingRect(cnt);
        const rectArea = rect.width * rect.height;
        // small noise contours from label texture/grain bloat the OCR rect
        // count and contribute mostly garbage text, so require a minimum
        // area relative to the (downscaled) image size. Raised slightly for perf.
        if (rectArea < imgArea * 0.0015) { cnt.delete(); continue; }
        // a bounding box covering most of the image is usually the can/label
        // outline (or a large background region), not a focused block of
        // text - OCRing it is both slow and produces mostly noise. But on
        // labels that fill the whole frame, the main brand text can itself
        // legitimately span a large fraction of the image, so don't reject
        // on bounding-rect size alone: a real text block has a reasonably
        // high fill ratio (contour area / bounding-rect area), while a
        // sprawling outline/background contour is sparse (low fill ratio).
        const fill = rectArea > 0 ? area / rectArea : 0;
        if (rectArea > imgArea * 0.2 && fill < 0.2) { cnt.delete(); continue; }
        if (rectArea > imgArea * 0.5) { cnt.delete(); continue; }
        rects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, area });
        cnt.delete();
      }
      blurred.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
      rects.sort((a, b) => b.area - a.area);

      // RETR_LIST returns nested/duplicate contours for the same region
      // (e.g. the inner and outer edge of the same block of text), which
      // would otherwise burn most of the OCR rect budget re-reading the same
      // text. Walk largest-first and drop any candidate that's mostly
      // contained within a rect we've already accepted.
      const dedupedRects = [];
      for (const r of rects) {
        const overlapsAccepted = dedupedRects.some((acc) => {
          const ix = Math.max(0, Math.min(r.x + r.width, acc.x + acc.width) - Math.max(r.x, acc.x));
          const iy = Math.max(0, Math.min(r.y + r.height, acc.y + acc.height) - Math.max(r.y, acc.y));
          const intersection = ix * iy;
          const rArea = r.width * r.height;
          return rArea > 0 && intersection / rArea > 0.6;
        });
        if (!overlapsAccepted) dedupedRects.push(r);
      }

      // each rect now costs at most ~10s of OCR time (MAX_DIM clamp in
      // ocr-worker.js), and rects are split across a 2-worker OCR pool, so we
      // can afford to look at more candidate regions
      const MAX_RECTS = 8;  // lowered from 12 to reduce OCR load and freeze risk (12 rects + 2 wholes was taking 14s+)
      let topRects = dedupedRects.slice(0, MAX_RECTS);

      // Multi-scale secondary pass completely disabled for now (was a major source of CPU load
      // and contributed to freezes even with low thresholds).

      const detectMs = Math.round(performance.now() - tDetectStart);

      src.delete(); gray.delete();

      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const buffer = await blob.arrayBuffer();

      self.postMessage({
        type: 'log',
        reqId,
        text: `opencv-worker: downscale ${downscaleMs}ms, deskew ${deskewMs}ms (${deskewApplied ? `applied, ${skewAngle.toFixed(2)}deg` : 'not applied'}), crop ${cropMs}ms (${cropApplied ? `applied, now ${width}x${height}` : 'not applied'}), detection ${detectMs}ms, blurVariance=${blurVariance.toFixed(0)}, ${rects.length} rects found, ${dedupedRects.length} after dedup (${topRects.length} kept)`,
      });

      self.postMessage({
        type: 'result',
        reqId,
        blurVariance,
        flash: { circularity: bestCircularity, areaRatio: bestAreaRatio, flashDetected },
        orientations: [{ angle: 0, rects: topRects, buffer }],
      }, [buffer]);
    } catch (err) {
      self.postMessage({ type: 'error', reqId, message: String(err) });
    }
  }
};
