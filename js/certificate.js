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
async function generateCertificatePdf({ fullName, certNumber, issuedDateStr, qrCanvas, statementText, titleText, brandName }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Border
  doc.setDrawColor(15, 76, 129);
  doc.setLineWidth(1.2);
  doc.rect(6, 6, pageWidth - 12, pageHeight - 12);

  // Title
  doc.setFontSize(18);
  doc.setTextColor(15, 76, 129);
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
  doc.setTextColor(90, 90, 90);
  doc.text(`Certificate No: ${certNumber}`, pageWidth / 2, 63, { align: "center" });
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
 * Full pipeline: render QR -> wait -> build PDF -> save.
 * Throws on failure so the caller can show a retry UI.
 */
async function generateAndDownloadCertificate({ containerEl, verifyUrl, fullName, certNumber, issuedDateStr, statementText, titleText, brandName }) {
  const qrCanvas = await renderQrCode(containerEl, verifyUrl);
  await generateCertificatePdf({
    fullName, certNumber, issuedDateStr, qrCanvas, statementText, titleText, brandName
  });
  return qrCanvas;
}
