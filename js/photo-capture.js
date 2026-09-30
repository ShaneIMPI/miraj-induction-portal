/**
 * photo-capture.js — front-camera photo capture used during induction, so a
 * certificate can be checked against the person holding it, not just their
 * name and a document number.
 *
 * Usage:
 *   const cam = createPhotoCapture({ videoEl, canvasEl, onStatus });
 *   await cam.start();           // opens the front camera into videoEl
 *   const dataUrl = cam.capture();  // grabs the current frame as a compressed JPEG
 *   cam.stop();
 */
function createPhotoCapture({ videoEl, canvasEl, onStatus }) {
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
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    } catch (err) {
      console.error(err);
      onStatus && onStatus("error.cameraError");
      return false;
    }
    videoEl.srcObject = stream;
    videoEl.setAttribute("playsinline", "true");
    await videoEl.play().catch(() => {});
    running = true;
    return true;
  }

  // Square crop, capped size, moderate JPEG quality — a face photo doesn't
  // need to be large to be useful for a visual check, and this keeps every
  // certificate/database row small.
  function capture({ size = 480, quality = 0.8 } = {}) {
    if (!videoEl.videoWidth) return null;
    const side = Math.min(videoEl.videoWidth, videoEl.videoHeight);
    const sx = (videoEl.videoWidth - side) / 2;
    const sy = (videoEl.videoHeight - side) / 2;
    canvasEl.width = size; canvasEl.height = size;
    const ctx = canvasEl.getContext("2d");
    // Mirror horizontally so the preview matches what a front camera user expects (like a mirror).
    ctx.translate(size, 0); ctx.scale(-1, 1);
    ctx.drawImage(videoEl, sx, sy, side, side, 0, 0, size, size);
    return canvasEl.toDataURL("image/jpeg", quality);
  }

  window.addEventListener("pagehide", stop);
  return { start, stop, capture, isRunning: () => running };
}
