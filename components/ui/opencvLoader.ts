export async function loadOpenCV(): Promise<any> {
  // If cv already present, return it
  const win: any = typeof window !== 'undefined' ? window : {};
  if (win.cv) return win.cv;

  // Create script tag to load OpenCV.js from CDN
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.x/opencv.js';
    script.async = true;
    script.onload = () => {
      // Wait for the runtime to initialize
      if (win.cv && typeof win.cv['onRuntimeInitialized'] === 'function') {
        win.cv['onRuntimeInitialized'] = () => resolve();
      } else if (win.cv && win.cv.ready) {
        resolve();
      } else {
        // Fallback short delay
        setTimeout(() => resolve(), 500);
      }
    };
    script.onerror = (e) => reject(e);
    document.body.appendChild(script);
  });

  return (window as any).cv;
}
