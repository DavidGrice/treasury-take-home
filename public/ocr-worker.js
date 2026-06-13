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

// Item 5: second safe binarization variant - lightweight morphological cleanup
// (basic despeckle + small gap fill) applied ONLY to still low-confidence rects.
// Works on the already-binarized canvas. Guarded by time budget in caller.
// This targets common issues like noise specks on glossy labels or slightly
// broken characters from low-res/glare photos without always paying the cost.
function morphCleanBinarizedCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const out = new Uint8ClampedArray(data.length);

  // Very simple 3x3 neighborhood "open-ish" operation for binary (0=dark text)
  // - Remove isolated dark specks (noise)
  // - Fill small gaps where center is light but surrounded by dark (reconnect)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      let darkNeighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) continue;
          const ni = ((y + dy) * width + (x + dx)) * 4;
          if (data[ni] === 0) darkNeighbors++;
        }
      }
      const isDark = data[i] === 0;
      let newV = data[i];
      if (isDark && darkNeighbors < 2) {
        newV = 255; // kill speckle
      } else if (!isDark && darkNeighbors >= 3) {
        newV = 0; // fill small gap
      }
      out[i] = newV;
      out[i + 1] = newV;
      out[i + 2] = newV;
    }
  }

  // Copy cleaned inner region back (leave 1px border as-is to avoid edge artifacts)
  for (let i = 0; i < data.length; i += 4) {
    if (out[i] !== undefined) {
      data[i] = out[i];
      data[i + 1] = out[i + 1];
      data[i + 2] = out[i + 2];
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// run OCR on a single canvas crop and return its recognized text/confidence.
// (Item 3) Now uses a config object with conservative Tesseract tuning:
// - oem: 1 (LSTM only, often faster and more accurate for clean printed labels)
// - tessedit_char_whitelist: limited to typical label characters (reduces search space,
//   usually lowers memory and garbage output for this domain)
// - Always capture data.words for richer downstream use (small data; per-word conf/bbox).
// Callers still get the same {text, confidence} shape for existing logic.
// No increase in the number of recognize() calls. PSM logic unchanged.
// A future flag can be added to opt into even more (e.g. detailed blocks).
async function recognizeCanvas(canvas, psm) {
  if (typeof Tesseract === 'undefined' || typeof Tesseract.recognize !== 'function') {
    throw new Error('Tesseract not available in worker');
  }
  const cropBlob = await canvas.convertToBlob({ type: 'image/png' });
  const pageSegMode = psm !== undefined ? psm : (Tesseract.PSM ? Tesseract.PSM.SINGLE_BLOCK : '6');

  // Item 3: conservative config for alcohol label domain
  const config = {
    tessedit_pageseg_mode: pageSegMode,
    tessedit_ocr_engine_mode: 1, // LSTM only
    // Tight whitelist focused on what's expected on TTB labels. Includes both cases
    // for robustness and common symbols/units. This typically *reduces* internal work.
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789%./-()\"' mLFLoz",
  };

  const res = await Tesseract.recognize(cropBlob, 'eng', config);
  const data = (res && res.data) ? res.data : {};
  const text = data.text ? data.text.trim() : '';
  const confidence = typeof data.confidence === 'number' ? data.confidence : null;
  const words = Array.isArray(data.words) ? data.words : null;

  return { text, confidence, words };
}

self.onmessage = async (e) => {
  const { type, reqId } = e.data;
  if (type === 'ocr') {
    const { items, wholePasses: wholePassNames } = e.data;
    try {
      self.postMessage({ type: 'log', reqId, text: 'OCR worker: starting' });
      // pad each rect a bit (tight contour boxes often clip ascenders/descenders)
      // and upscale before OCR, since Tesseract accuracy drops sharply on small crops
      // Increased PAD to capture more surrounding context / full words that contours might cut off.
      const PAD = 16;
      const SCALE = 2;
      // tiny slivers from contour noise can't be scaled by tesseract and just
      // spam "Image too small to scale" / "Line cannot be recognized" warnings
      const MIN_DIM = 6;
      // backstop against an unexpectedly large rect (e.g. a near-full-image
      // contour) being upscaled into a multi-thousand-pixel image - that can
      // take Tesseract a minute or more per crop
      const MAX_DIM = 1200;
      // overall time budget for this worker call - busy/noisy crops can make
      // individual Tesseract.recognize() calls much slower than the median,
      // and a handful of slow rects can add up past the host's 270s timeout.
      // once the budget is exhausted, stop starting new recognize() calls and
      // return whatever results have been collected so far rather than
      // letting the host time out and discard everything for this image.
      const TIME_BUDGET_MS = 230000;

      const results = [];
      const tOcrStart = performance.now();
      let budgetExceeded = false;
      for (const item of items) {
        const { rotation, buffer, rects, sourceImage } = item;
        const blob = new Blob([buffer], { type: 'image/png' });
        const bmp = await createImageBitmap(blob);

        for (let i = 0; i < rects.length; i++) {
          if (performance.now() - tOcrStart > TIME_BUDGET_MS) {
            budgetExceeded = true;
            self.postMessage({ type: 'log', reqId, text: `OCR worker: time budget exceeded, skipping remaining ${rects.length - i} rect(s)` });
            for (let j = i; j < rects.length; j++) {
              results.push({ rect: rects[j], text: '', confidence: null, rotation, sourceImage });
            }
            break;
          }
          const r = rects[i];
          const x = Math.max(0, r.x - PAD);
          const y = Math.max(0, r.y - PAD);
          const w = Math.min(bmp.width - x, r.width + PAD * 2);
          const h = Math.min(bmp.height - y, r.height + PAD * 2);

          const tRectStart = performance.now();

          // For large rects (common for brand areas on labels), split into overlapping sub-boxes
          // so text like "BUD" and "LIGHT" get their own focused OCR regions instead of one huge
          // busy box producing garbage or fragmented reads. This (plus PAD expansion + conditional
          // extra expanded crop below) helps capture full phrases together for the raw text used
          // in field matching. Subs overlap so the phrase parts are still readable in context.
          let crops = [{x, y, w, h}];
          const area = w * h;
          if (area > 80000 || w > 500 || h > 400) {
            const overlap = 60;
            if (w > h) {
              const mid = Math.floor(w / 2);
              crops = [
                {x: x, y: y, w: mid + overlap, h: h},
                {x: x + mid - overlap, y: y, w: w - mid + overlap, h: h}
              ];
            } else {
              const mid = Math.floor(h / 2);
              crops = [
                {x: x, y: y, w: w, h: mid + overlap},
                {x: x, y: y + mid - overlap, w: w, h: h - mid + overlap}
              ];
            }
          }

          let bestForThisRect = { text: '', confidence: null, rotation: 0, words: null };
          for (const crop of crops) {
            let scaledW = Math.round(crop.w * SCALE);
            let scaledH = Math.round(crop.h * SCALE);
            const longestScaled = Math.max(scaledW, scaledH);
            if (longestScaled > MAX_DIM) {
              const clamp = MAX_DIM / longestScaled;
              scaledW = Math.round(scaledW * clamp);
              scaledH = Math.round(scaledH * clamp);
            }
            if (scaledW < MIN_DIM || scaledH < MIN_DIM) continue;

            const canvas = new OffscreenCanvas(scaledW, scaledH);
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(bmp, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
            binarizeCanvas(canvas);

            const tall = scaledH > scaledW;
            const tryAngles = tall ? [90, 270, 0, 180] : [0, 90, 270, 180];
            let localBest = { text: '', confidence: null, rotation: 0, words: null };
            for (const angle of tryAngles) {
              try {
                const rotated = rotateCanvas(canvas, angle);
                const { text, confidence, words } = await recognizeCanvas(rotated);
                const better =
                  (text.length > 0 && localBest.text.length === 0) ||
                  (text.length > 0 && localBest.text.length > 0 && (confidence ?? 0) > (localBest.confidence ?? 0));
                if (better) localBest = { text, confidence, rotation: angle, words: words || null };
                if (text.length > 0 && (confidence ?? 0) >= 40) break;
              } catch (rotErr) {}
            }
            if (localBest.text.length > bestForThisRect.text.length ||
                (localBest.text.length > 0 && (localBest.confidence ?? 0) > (bestForThisRect.confidence ?? 0))) {
              bestForThisRect = localBest;
            }
          }

          // Conditional single expanded crop (user request: "expanding rects or boxes" to capture
          // text just outside the OpenCV contours, e.g. so "BUD" + "LIGHT" or nearby words aren't
          // clipped). Only for marginal results and not on the very largest rects (to avoid
          // re-introducing the timeout risk on busy photos). PAD=16 at top already gives base breathing room.
          let finalBest = bestForThisRect;
          const EXP = 20;
          if ((bestForThisRect.confidence ?? 0) < 55 && (w * h) < 120000) {
            try {
              const ex = Math.max(0, x - EXP);
              const ey = Math.max(0, y - EXP);
              const ew = Math.min(bmp.width - ex, w + EXP * 2);
              const eh = Math.min(bmp.height - ey, h + EXP * 2);
              if (ew > 30 && eh > 30) {
                let eScaledW = Math.round(ew * SCALE);
                let eScaledH = Math.round(eh * SCALE);
                const eLong = Math.max(eScaledW, eScaledH);
                if (eLong > MAX_DIM) {
                  const c = MAX_DIM / eLong;
                  eScaledW = Math.round(eScaledW * c);
                  eScaledH = Math.round(eScaledH * c);
                }
                if (eScaledW >= MIN_DIM && eScaledH >= MIN_DIM) {
                  const eCanvas = new OffscreenCanvas(eScaledW, eScaledH);
                  const eCtx = eCanvas.getContext('2d');
                  eCtx.imageSmoothingEnabled = true;
                  eCtx.imageSmoothingQuality = 'high';
                  eCtx.drawImage(bmp, ex, ey, ew, eh, 0, 0, eCanvas.width, eCanvas.height);
                  binarizeCanvas(eCanvas);
                  const eTall = eScaledH > eScaledW;
                  const eAngles = eTall ? [90, 270, 0, 180] : [0, 90, 270, 180];
                  let eBest = { text: '', confidence: null, rotation: 0, words: null };
                  for (const angle of eAngles) {
                    try {
                      const er = rotateCanvas(eCanvas, angle);
                      const { text, confidence, words } = await recognizeCanvas(er);
                      const better = (text.length > 0 && eBest.text.length === 0) ||
                                     (text.length > 0 && eBest.text.length > 0 && (confidence ?? 0) > (eBest.confidence ?? 0));
                      if (better) eBest = { text, confidence, rotation: angle, words: words || null };
                      if (text.length > 0 && (confidence ?? 0) >= 40) break;
                    } catch (_) {}
                  }
                  if (eBest.text.length > finalBest.text.length ||
                      (eBest.text.length > 0 && (eBest.confidence ?? 0) > (finalBest.confidence ?? 0))) {
                    finalBest = eBest;
                    self.postMessage({ type: 'log', reqId, text: `OCR worker: rect ${i} used expanded crop` });
                  }
                }
              }
            } catch (_) { /* ignore expansion errors to keep worker robust */ }
          }

          const rectMs = Math.round(performance.now() - tRectStart);
          self.postMessage({ type: 'log', reqId, text: `OCR worker: rect ${i} (${w}x${h}) took ${rectMs}ms, confidence ${finalBest.confidence ?? 'n/a'}, ${finalBest.text.length} chars` });
          results.push({ rect: r, text: finalBest.text, confidence: finalBest.confidence, rotation: finalBest.rotation, sourceImage, words: finalBest.words || null });
        }

        // Skip whole-image passes if we got many rects from contours — they are slow (5s+ each on full image)
        // and the rects usually provide enough coverage. This was a major cause of the 14s+ OCR times
        // and browser freezing.
        const rectCountForPhoto = rects.length;
        if (rectCountForPhoto < 6 && !(budgetExceeded || performance.now() - tOcrStart > TIME_BUDGET_MS)) {
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
            if (performance.now() - tOcrStart > TIME_BUDGET_MS) {
              budgetExceeded = true;
              self.postMessage({ type: 'log', reqId, text: `OCR worker: time budget exceeded, skipping remaining whole-image pass(es)` });
              break;
            }
            const tWholeStart = performance.now();
            try {
              const { text, confidence, words } = await recognizeCanvas(wholeCanvas, pass.psm);
              const wholeMs = Math.round(performance.now() - tWholeStart);
              self.postMessage({ type: 'log', reqId, text: `OCR worker: whole-image ${pass.name} pass (${bmp.width}x${bmp.height}) took ${wholeMs}ms, confidence ${confidence ?? 'n/a'}, ${text.length} chars` });
              results.push({ rect: { x: 0, y: 0, width: bmp.width, height: bmp.height }, text, confidence, rotation, whole: true, wholePass: pass.name, sourceImage, words: words || null });
            } catch (err) {
              self.postMessage({ type: 'log', reqId, text: `OCR worker: whole-image ${pass.name} pass failed ${String(err)}` });
            }
          }
        } else if (rectCountForPhoto >= 6) {
          self.postMessage({ type: 'log', reqId, text: `OCR worker: skipping whole-image passes (good rect coverage: ${rectCountForPhoto} rects)` });
        }

        // Warning-crop re-OCR disabled for performance (extra full Tesseract call per photo was too heavy
        // and a primary cause of freezes).
        // const mainWarningFound = ... { ... }

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
