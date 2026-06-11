Offline libs directory for OpenCV and Tesseract

Place the following files under `public/libs/` so the app and workers can run offline:

- `opencv.js` — a browser build of OpenCV (EMSCRIPTEN build). Place the `.wasm` file alongside it if required by your build (e.g. `opencv_js.wasm` or similar).
- `tesseract.min.js` — Tesseract.js browser bundle (dist/tesseract.min.js from the `tesseract.js` package).
- `tesseract-core.wasm.js` (or `tesseract-core-asm.wasm.js`) and worker files used by Tesseract.js.
- `tessdata/eng.traineddata` — trained data for English (and other languages you need) under `public/libs/tessdata/`.

Quick steps:

1. Install dependencies (if not already):

```bash
npm install
```

2. Run the helper script to copy common files from `node_modules` into `public/libs` (best-effort):

```bash
node scripts/populate-libs.js
```

3. If files are missing after the script runs, manually download the required bundles:

- OpenCV: download the `opencv.js` browser build from https://docs.opencv.org/ and place it at `public/libs/opencv.js` (and its `.wasm` if provided).
- Tesseract: copy `node_modules/tesseract.js/dist/tesseract.min.js` to `public/libs/tesseract.min.js`, copy core/worker files from `tesseract.js-core` into `public/libs/`, and copy `eng.traineddata` into `public/libs/tessdata/`.

4. Restart the dev server and verify the network tab no longer requests CDN URLs.
