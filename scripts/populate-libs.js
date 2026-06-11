const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const publicLibs = path.join(root, 'public', 'libs');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function tryCopy(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${src} -> ${dest}`);
    return true;
  }
  return false;
}

ensureDir(publicLibs);

console.log('Populating public/libs from node_modules (best-effort)');

// Tesseract bundles (try common paths)
const tessCandidates = [
  path.join(root, 'node_modules', 'tesseract.js', 'dist', 'tesseract.min.js'),
  path.join(root, 'node_modules', 'tesseract.js', 'dist', 'tesseract.dev.js'),
];
let foundTess = false;
for (const c of tessCandidates) {
  if (tryCopy(c, path.join(publicLibs, path.basename(c)))) foundTess = true;
}
if (!foundTess) console.warn('tesseract.min.js not found in node_modules. Please run `npm install` or place a build at public/libs/tesseract.min.js');

// tesseract core/worker/wasm
const tessCoreCandidates = [
  path.join(root, 'node_modules', 'tesseract.js-core', 'dist', 'tesseract-core.wasm.js'),
  path.join(root, 'node_modules', 'tesseract.js-core', 'dist', 'worker.min.js'),
  path.join(root, 'node_modules', 'tesseract.js-core', 'dist', 'tesseract-core-asm.wasm.js'),
  // fallback to package root files
  path.join(root, 'node_modules', 'tesseract.js-core', 'tesseract-core.wasm.js'),
  path.join(root, 'node_modules', 'tesseract.js-core', 'tesseract-core.js'),
  path.join(root, 'node_modules', 'tesseract.js-core', 'tesseract-core-simd.wasm.js'),
  path.join(root, 'node_modules', 'tesseract.js-core', 'tesseract-core-simd.js'),
];
let foundCore = false;
for (const c of tessCoreCandidates) {
  if (tryCopy(c, path.join(publicLibs, path.basename(c)))) foundCore = true;
}
if (!foundCore) console.warn('tesseract core files not found in node_modules. You may need to download or build them and place under public/libs/');

// Copy tessdata (eng)
const tessdataSrc = path.join(root, 'node_modules', 'tesseract.js-core', 'dist', 'tessdata');
const tessdataDest = path.join(publicLibs, 'tessdata');
if (fs.existsSync(tessdataSrc)) {
  ensureDir(tessdataDest);
  const files = fs.readdirSync(tessdataSrc);
  for (const f of files) {
    tryCopy(path.join(tessdataSrc, f), path.join(tessdataDest, f));
  }
  console.log('Copied tessdata from node_modules');
} else {
  console.warn('tessdata not found in node_modules. Place eng.traineddata under public/libs/tessdata/eng.traineddata');
}

// OpenCV candidates
const opencvCandidates = [
  path.join(root, 'node_modules', 'opencv.js', 'opencv.js'),
  path.join(root, 'node_modules', 'opencv.js', 'dist', 'opencv.js'),
  path.join(root, 'node_modules', 'opencv-build', 'opencv.js'),
  path.join(root, 'node_modules', '@opencvjs', 'opencv', 'dist', 'opencv.js'),
];
let foundOpenCV = false;
for (const c of opencvCandidates) {
  if (tryCopy(c, path.join(publicLibs, path.basename(c)))) foundOpenCV = true;
}
if (!foundOpenCV) {
  console.warn('OpenCV bundle not found in node_modules. You must place a browser build of OpenCV (opencv.js) into public/libs/opencv.js');
}

console.log('Done. Review warnings above and verify files exist under public/libs/');
