// ============================================================
// Certificate generation
// Designed to fix the reliability issue from the IMPI portal:
// the PDF/QR generation used to fire before the QR image and
// fonts were fully ready, especially on slower mobile
// connections. Here we:
//   1. Render the QR code to a canvas and WAIT for it to finish
//      (qrcode.js's callback / a polling check) before touching jsPDF.
//   2. Wrap the whole thing in try/catch with a visible retry button
//      instead of failing silently.
//   3. Convert the canvas to a dataURL only once fully drawn.
// ============================================================

function buildVerifyUrl(qrToken) {
  const base = window.location.origin + window.location.pathname.replace(/induction\.html.*$/, "");
  return `${base}verify.html?token=${qrToken}`;
}

/**
 * Converts a "#RRGGBB" string to a [r,g,b] array for jsPDF's
 * setDrawColor/setTextColor. Falls back to Miraj navy if missing/invalid.
 */
function hexToRgb(hex) {
  const fallback = [15, 76, 129];
  if (!hex) return fallback;
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!match) return fallback;
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

/**
 * Fetches a (possibly cross-origin) image URL and resolves it as a
 * base64 data URL plus its natural pixel dimensions, so it can be
 * embedded in the PDF via jsPDF's addImage. Never throws — resolves
 * null on any failure so a missing/broken event logo never blocks
 * certificate generation.
 */
function loadImageAsDataUrl(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    fetch(url)
      .then(res => { if (!res.ok) throw new Error("logo fetch failed"); return res.blob(); })
      .then(blob => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          const img = new Image();
          img.onload = () => resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => resolve(null);
          img.src = dataUrl;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      })
      .catch(() => resolve(null));
  });
}

/**
 * Renders a QR code into the given container element and resolves
 * with the canvas element once drawing is confirmed complete.
 */
function renderQrCode(containerEl, text) {
  return new Promise((resolve, reject) => {
    try {
      containerEl.innerHTML = "";
      // qrcodejs (davidshimjs) draws synchronously into a canvas/table,
      // but we still defer to the next frame to guarantee the canvas
      // has pixels before we read it back out.
      /* eslint-disable no-new */
      new QRCode(containerEl, {
        text: text,
        width: 160,
        height: 160,
        correctLevel: QRCode.CorrectLevel.M
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const canvas = containerEl.querySelector("canvas");
          if (canvas && canvas.width > 0) {
            resolve(canvas);
          } else {
            reject(new Error("QR canvas did not render"));
          }
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Builds the certificate PDF (A5 landscape) and triggers a download.
 * Returns a Promise so callers can await + retry on failure.
 */
async function generateCertificatePdf({ fullName, certNumber, issuedDateStr, qrCanvas, statementText, titleText, brandName, eventColor, eventAccentColor, eventLogo }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const [r, g, b] = hexToRgb(eventColor);

  // Border
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(1.2);
  doc.rect(6, 6, pageWidth - 12, pageHeight - 12);

  // Event logo (top-left, inside the border) — sized to fit a max
  // 16mm-tall box while keeping its original aspect ratio.
  if (eventLogo && eventLogo.dataUrl) {
    const maxH = 16;
    const maxW = 30;
    let logoW = maxW;
    let logoH = (eventLogo.height / eventLogo.width) * logoW;
    if (logoH > maxH) {
      logoH = maxH;
      logoW = (eventLogo.width / eventLogo.height) * logoH;
    }
    try {
      doc.addImage(eventLogo.dataUrl, 12, 10, logoW, logoH);
    } catch (e) {
      // Unsupported format or corrupt image — skip silently, never block the certificate.
      console.warn("Could not embed event logo on certificate:", e);
    }
  }

  // Title
  doc.setFontSize(18);
  doc.setTextColor(r, g, b);
  doc.text(titleText, pageWidth / 2, 20, { align: "center" });

  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text(brandName, pageWidth / 2, 27, { align: "center" });

  // Statement
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  const statementLines = doc.splitTextToSize(statementText, pageWidth - 30);
  doc.text(statementLines, pageWidth / 2, 38, { align: "center" });

  // Name
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text(fullName, pageWidth / 2, 55, { align: "center" });

  // Meta
  doc.setFontSize(9);
  const [ar, ag, ab] = hexToRgb(eventAccentColor || eventColor);
  const labelText = "Certificate No: ";
  doc.setFont(undefined, "normal");
  const labelWidth = doc.getTextWidth(labelText);
  const numberWidth = doc.getTextWidth(certNumber);
  const totalWidth = labelWidth + numberWidth;
  const startX = pageWidth / 2 - totalWidth / 2;
  doc.setTextColor(90, 90, 90);
  doc.text(labelText, startX, 63, { align: "left" });
  doc.setTextColor(ar, ag, ab);
  doc.text(certNumber, startX + labelWidth, 63, { align: "left" });
  doc.setTextColor(90, 90, 90);
  doc.text(`Issued: ${issuedDateStr}`, pageWidth / 2, 68, { align: "center" });

  // QR code image
  if (qrCanvas) {
    const qrDataUrl = qrCanvas.toDataURL("image/png");
    const qrSize = 22;
    doc.addImage(qrDataUrl, "PNG", pageWidth - qrSize - 10, pageHeight - qrSize - 8, qrSize, qrSize);
  }

  doc.save(`${certNumber}.pdf`);
}

/**
 * Full pipeline: render QR -> load event logo -> wait -> build PDF -> save.
 * Throws on failure so the caller can show a retry UI.
 */
async function generateAndDownloadCertificate({ containerEl, verifyUrl, fullName, certNumber, issuedDateStr, statementText, titleText, brandName, eventColor, eventAccentColor, eventLogoUrl }) {
  const qrCanvas = await renderQrCode(containerEl, verifyUrl);
  const eventLogo = await loadImageAsDataUrl(eventLogoUrl);
  await generateCertificatePdf({
    fullName, certNumber, issuedDateStr, qrCanvas, statementText, titleText, brandName, eventColor, eventAccentColor, eventLogo
  });
  return qrCanvas;
}
