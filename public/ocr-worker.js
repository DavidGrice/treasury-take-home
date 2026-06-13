// OCR worker using Tesseract.js imported from local /public/libs
self.importScripts('/libs/tesseract.min.js');

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

// convert a canvas to high-contrast black/white in place using Otsu's
// method - raw photos have uneven lighting/noise that Tesseract struggles
// with, but a clean binary image is close to its ideal input
function binarizeCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const numPixels = width * height;

  const gray = new Uint8ClampedArray(numPixels);
  const hist = new Array(256).fill(0);
  for (let i = 0; i < numPixels; i++) {
    const o = i * 4;
    const g = Math.round(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]);
    gray[i] = g;
    hist[g]++;
  }

  // Otsu's method: find the threshold that maximizes between-class variance
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, maxVar = -1, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = numPixels - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }

  // Tesseract expects dark text on a light background. Otsu alone doesn't
  // know which side of the threshold is "text" vs "background" - count
  // which side covers more pixels and treat the majority as background. If
  // the majority would come out dark (e.g. light text on a dark can/label),
  // flip the polarity so the binarized output still has a light background.
  let above = 0;
  for (let i = 0; i < numPixels; i++) if (gray[i] > threshold) above++;
  const majorityIsAbove = above >= numPixels - above;
  const lightValue = majorityIsAbove ? 255 : 0;
  const darkValue = majorityIsAbove ? 0 : 255;

  for (let i = 0; i < numPixels; i++) {
    const o = i * 4;
    const v = gray[i] > threshold ? lightValue : darkValue;
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = v;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// flip a binarized (pure black/white) canvas's polarity in place. Used as a
// fallback when the auto-detected polarity in binarizeCanvas guesses wrong -
// a single global majority-pixel heuristic isn't reliable on busy/reflective
// crops (e.g. text printed on a curved, glare-prone can), so a low-confidence
// result gets a second try with the opposite polarity.
function invertBinarizedCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = 255 - data[i];
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// run OCR on a single canvas crop and return its recognized text/confidence.
// defaults to SINGLE_BLOCK (each rect is OCR'd in isolation, so treat it as
// a single block of text rather than assuming a full-page layout), but
// callers OCRing a whole label can pass a different PSM (e.g. SPARSE_TEXT).
async function recognizeCanvas(canvas, psm) {
  if (typeof Tesseract === 'undefined' || typeof Tesseract.recognize !== 'function') {
    throw new Error('Tesseract not available in worker');
  }
  const cropBlob = await canvas.convertToBlob({ type: 'image/png' });
  const pageSegMode = psm !== undefined ? psm : (Tesseract.PSM ? Tesseract.PSM.SINGLE_BLOCK : '6');
  const res = await Tesseract.recognize(cropBlob, 'eng', { tessedit_pageseg_mode: pageSegMode });
  const text = (res && res.data && res.data.text) ? res.data.text.trim() : '';
  const confidence = (res && res.data && typeof res.data.confidence === 'number') ? res.data.confidence : null;
  return { text, confidence };
}

self.onmessage = async (e) => {
  const { type, reqId } = e.data;
  if (type === 'ocr') {
    const { items, wholePasses: wholePassNames } = e.data;
    try {
      self.postMessage({ type: 'log', reqId, text: 'OCR worker: starting' });
      // pad each rect a bit (tight contour boxes often clip ascenders/descenders)
      // and upscale before OCR, since Tesseract accuracy drops sharply on small crops
      const PAD = 8;
      const SCALE = 2;
      // tiny slivers from contour noise can't be scaled by tesseract and just
      // spam "Image too small to scale" / "Line cannot be recognized" warnings
      const MIN_DIM = 6;
      // backstop against an unexpectedly large rect (e.g. a near-full-image
      // contour) being upscaled into a multi-thousand-pixel image - that can
      // take Tesseract a minute or more per crop
      const MAX_DIM = 1200;

      const results = [];
      const tOcrStart = performance.now();
      for (const item of items) {
        const { rotation, buffer, rects, sourceImage } = item;
        const blob = new Blob([buffer], { type: 'image/png' });
        const bmp = await createImageBitmap(blob);

        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          const x = Math.max(0, r.x - PAD);
          const y = Math.max(0, r.y - PAD);
          const w = Math.min(bmp.width - x, r.width + PAD * 2);
          const h = Math.min(bmp.height - y, r.height + PAD * 2);
          let scaledW = Math.round(w * SCALE);
          let scaledH = Math.round(h * SCALE);
          const longestScaled = Math.max(scaledW, scaledH);
          if (longestScaled > MAX_DIM) {
            const clamp = MAX_DIM / longestScaled;
            scaledW = Math.round(scaledW * clamp);
            scaledH = Math.round(scaledH * clamp);
          }
          if (scaledW < MIN_DIM || scaledH < MIN_DIM) {
            results.push({ rect: r, text: '', confidence: null, rotation, sourceImage });
            continue;
          }
          const canvas = new OffscreenCanvas(scaledW, scaledH);
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(bmp, x, y, w, h, 0, 0, canvas.width, canvas.height);
          binarizeCanvas(canvas);
          const tRectStart = performance.now();
          try {
            // labels aren't always printed horizontally (e.g. the
            // "GOVERNMENT WARNING" block printed sideways, in either
            // direction). Try the orientations that match the crop's aspect
            // ratio first (90/270 for a tall crop, 0 for a wide one), then
            // fall back to the remaining angles - stopping early once a
            // rotation produces a confident non-empty read to keep total OCR
            // time down (early exit usually limits this to 1-2 attempts)
            const tall = scaledH > scaledW;
            const tryAngles = tall ? [90, 270, 0, 180] : [0, 90, 270, 180];
            let best = { text: '', confidence: null, rotation: 0 };
            for (const angle of tryAngles) {
              try {
                const rotated = rotateCanvas(canvas, angle);
                const { text, confidence } = await recognizeCanvas(rotated);
                const better =
                  (text.length > 0 && best.text.length === 0) ||
                  (text.length > 0 && best.text.length > 0 && (confidence ?? 0) > (best.confidence ?? 0));
                if (better) best = { text, confidence, rotation: angle };
                if (text.length > 0 && (confidence ?? 0) >= 40) break;
              } catch (rotErr) {
                self.postMessage({ type: 'log', reqId, text: `OCR worker: rect ${i} rotation ${angle} failed ${String(rotErr)}` });
              }
            }
            // the auto-detected polarity in binarizeCanvas can guess wrong on
            // busy/reflective crops - if nothing confident came out, retry the
            // best-known orientation with the opposite polarity and keep
            // whichever scored higher
            if ((best.confidence ?? 0) < 40) {
              try {
                const inverted = rotateCanvas(canvas, best.rotation);
                invertBinarizedCanvas(inverted);
                const { text, confidence } = await recognizeCanvas(inverted);
                const better =
                  (text.length > 0 && best.text.length === 0) ||
                  (text.length > 0 && best.text.length > 0 && (confidence ?? 0) > (best.confidence ?? 0));
                if (better) best = { text, confidence, rotation: best.rotation };
              } catch (invErr) {
                self.postMessage({ type: 'log', reqId, text: `OCR worker: rect ${i} inverted-polarity retry failed ${String(invErr)}` });
              }
            }
            const rectMs = Math.round(performance.now() - tRectStart);
            self.postMessage({ type: 'log', reqId, text: `OCR worker: rect ${i} (${scaledW}x${scaledH}) took ${rectMs}ms, confidence ${best.confidence ?? 'n/a'}, ${best.text.length} chars` });
            results.push({ rect: r, text: best.text, confidence: best.confidence, rotation: best.rotation, sourceImage });
          } catch (err) {
            self.postMessage({ type: 'log', reqId, text: `OCR worker: rotation ${rotation} rect ${i} failed ${String(err)}` });
            results.push({ rect: r, text: '', confidence: null, rotation, sourceImage });
          }
        }

        // also OCR the whole (post-crop) image in one or two extra passes
        // using full-page layout analysis. Contour rects can fragment
        // small/cleanly-laid-out labels into tiny per-letter/per-word
        // slivers that read as garbage on their own, but Tesseract's own
        // layout analysis over the full label often reads the same text
        // correctly in one shot. Try both SPARSE_TEXT (treats the image as
        // scattered text with no particular order - good for labels with
        // text in several disconnected blocks) and AUTO (full page
        // segmentation - better when the busy background/graphics confuse
        // sparse-text mode) and keep whichever scores higher.
        const wholeCanvas = new OffscreenCanvas(bmp.width, bmp.height);
        wholeCanvas.getContext('2d').drawImage(bmp, 0, 0);
        binarizeCanvas(wholeCanvas);
        const allWholePasses = [
          { name: 'sparse', psm: Tesseract.PSM ? Tesseract.PSM.SPARSE_TEXT : '11' },
          { name: 'auto', psm: Tesseract.PSM ? Tesseract.PSM.AUTO : '3' },
        ];
        // allow the caller to assign only a subset of whole-image passes to
        // this worker (e.g. when splitting work across a pool of workers);
        // default to running all passes if no filter was provided
        const wholePasses = Array.isArray(wholePassNames)
          ? allWholePasses.filter((p) => wholePassNames.includes(p.name))
          : allWholePasses;
        for (const pass of wholePasses) {
          const tWholeStart = performance.now();
          try {
            const { text, confidence } = await recognizeCanvas(wholeCanvas, pass.psm);
            const wholeMs = Math.round(performance.now() - tWholeStart);
            self.postMessage({ type: 'log', reqId, text: `OCR worker: whole-image ${pass.name} pass (${bmp.width}x${bmp.height}) took ${wholeMs}ms, confidence ${confidence ?? 'n/a'}, ${text.length} chars` });
            results.push({ rect: { x: 0, y: 0, width: bmp.width, height: bmp.height }, text, confidence, rotation, whole: true, wholePass: pass.name, sourceImage });
          } catch (err) {
            self.postMessage({ type: 'log', reqId, text: `OCR worker: whole-image ${pass.name} pass failed ${String(err)}` });
          }
        }

        bmp.close();
      }

      const totalMs = Math.round(performance.now() - tOcrStart);
      const confs = results.map(r => r.confidence).filter(c => typeof c === 'number').sort((a, b) => a - b);
      const medianConf = confs.length > 0 ? confs[Math.floor(confs.length / 2)] : null;
      self.postMessage({ type: 'log', reqId, text: `OCR worker: total ${totalMs}ms for ${results.length} rects, median confidence ${medianConf ?? 'n/a'}` });
      self.postMessage({ type: 'result', reqId, results });
    } catch (err) {
      self.postMessage({ type: 'error', reqId, message: String(err) });
    }
  }
};
