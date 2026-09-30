/**
 * qr-scan.js — shared camera / photo QR reading used by both the public
 * verify page and the marshal scan screen. Only ever hands back the raw
 * decoded text; it never navigates anywhere on its own, so a malicious QR
 * code can't be used to redirect the page.
 *
 * Usage:
 *   const scanner = createQrScanner({
 *     videoEl, canvasEl,
 *     onResult: (text) => { ... },
 *     onStatus: (key) => { ... }   // i18n key: 'verify.scanning' etc, or null to clear
 *   });
 *   scanner.start(); scanner.stop(); scanner.scanPhotoFile(file);
 */
function createQrScanner({ videoEl, canvasEl, onResult, onStatus }) {
  let stream = null;
  let running = false;

  function stop() {
    running = false;
    if (stream) { stream.getTracks().forEach(tr => tr.stop()); stream = null; }
    videoEl.srcObject = null;
  }

  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onStatus && onStatus("error.cameraUnsupported");
      return false;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    } catch (err) {
      console.error(err);
      onStatus && onStatus("error.cameraError");
      return false;
    }
    const ctx = canvasEl.getContext("2d", { willReadFrequently: true });
    videoEl.srcObject = stream;
    videoEl.setAttribute("playsinline", "true");
    await videoEl.play().catch(() => {});
    onStatus && onStatus("verify.scanning");
    running = true;

    const tick = () => {
      if (!running) return;
      if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
        const scale = Math.min(1, 640 / videoEl.videoWidth);
        canvasEl.width = Math.round(videoEl.videoWidth * scale);
        canvasEl.height = Math.round(videoEl.videoHeight * scale);
        ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
        const img = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (code && code.data) {
          stop();
          onResult(code.data);
          return;
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  }

  function scanPhotoFile(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ctx = canvasEl.getContext("2d", { willReadFrequently: true });
      const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
      canvasEl.width = Math.round(img.naturalWidth * scale);
      canvasEl.height = Math.round(img.naturalHeight * scale);
      ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);
      URL.revokeObjectURL(url);
      const data = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      const code = jsQR(data.data, data.width, data.height, { inversionAttempts: "attemptBoth" });
      if (code && code.data) onResult(code.data);
      else onStatus && onStatus("error.noQrInPhoto");
    };
    img.onerror = () => { URL.revokeObjectURL(url); onStatus && onStatus("error.noQrInPhoto"); };
    img.src = url;
  }

  window.addEventListener("pagehide", stop);
  return { start, stop, scanPhotoFile, isRunning: () => running };
}
