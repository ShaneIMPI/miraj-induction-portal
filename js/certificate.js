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
  // Strip whatever page we are on (induction.html, admin.html, ...) so the
  // link always points at verify.html in the same folder.
  const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, "");
  return `${base}verify.html?token=${qrToken}`;
}

/**
 * Masks an ID / passport number for display: keeps the last 4 characters.
 * e.g. "A12345678" -> "*****5678". Used on the certificate and on the
 * verification page so a verifier can cross-check the physical ID without
 * the full number being shown to anyone who scans the QR.
 */
function maskIdNumber(id) {
  const s = String(id == null ? "" : id).trim();
  if (!s) return "";
  if (s.length <= 4) return s;
  return "*".repeat(s.length - 4) + s.slice(-4);
}

/** True if the text only uses characters jsPDF's built-in font can draw. */
function isPdfSafeText(text) {
  return !/[^\u0000-\u00ff]/.test(String(text || ""));
}

// ---------- Non-Latin text (Hindi/Devanagari, Arabic, ...) inside the PDF ----------
// jsPDF's built-in font only has Latin letters, and it cannot shape Devanagari or
// Arabic even with a custom font. So:
//   * printed wording (title, statement) is always the ENGLISH text;
//   * a person's name / company typed in another script is drawn by the BROWSER
//     (which shapes it correctly) onto a canvas and placed in the PDF as an image.
const PDF_FALLBACK_TITLE = "Certificate of Safety Induction";
const PDF_FALLBACK_STATEMENT = "This certifies that the person named below has completed the Miraj Media safety induction and is authorised to proceed to site, subject to compliance with all site rules.";
let _englishCertStrings = null;
async function getEnglishCertStrings() {
  if (_englishCertStrings) return _englishCertStrings;
  try {
    const res = await fetch("lang/en.json?v=3");
    const en = await res.json();
    _englishCertStrings = { title: en.certificate.title, statement: en.certificate.statement };
  } catch (e) {
    _englishCertStrings = { title: PDF_FALLBACK_TITLE, statement: PDF_FALLBACK_STATEMENT };
  }
  return _englishCertStrings;
}
async function pdfSafeWording(titleText, statementText) {
  if (isPdfSafeText(titleText) && isPdfSafeText(statementText)) return { titleText, statementText };
  const en = await getEnglishCertStrings();
  return { titleText: en.title, statementText: en.statement };
}

/** Renders text to a PNG with the browser's own text shaping. Returns {dataUrl, wMm, hMm} sized for the given point size. */
function textToPdfImage(text, { pt = 16, bold = false, color = "#000000" } = {}) {
  const px = 64;                                   // draw big, then scale down in the PDF (crisp print)
  const fontStack = '"Noto Sans Devanagari","Noto Sans Arabic","Nirmala UI","Kohinoor Devanagari","Devanagari Sangam MN","Segoe UI",Tahoma,Arial,sans-serif';
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = `${bold ? "700 " : ""}${px}px ${fontStack}`;
  ctx.font = font;
  const rtl = /[\u0590-\u08FF]/.test(text);
  ctx.direction = rtl ? "rtl" : "ltr";
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  const h = Math.ceil(px * 1.7);
  canvas.width = w; canvas.height = h;
  const c2 = canvas.getContext("2d");
  c2.font = font; c2.direction = rtl ? "rtl" : "ltr";
  c2.fillStyle = color; c2.textBaseline = "middle"; c2.textAlign = rtl ? "right" : "left";
  c2.fillText(text, rtl ? w - 8 : 8, h / 2);
  const mmPerPx = (pt * 0.3528) / px;
  return { dataUrl: canvas.toDataURL("image/png"), wMm: w * mmPerPx, hMm: h * mmPerPx };
}

/** Pre-renders the fields that can't be drawn with jsPDF's font. Returns {nameImg, companyImg, idImg} (null where plain text works). */
function prepareTextImages({ fullName, company, idMasked }) {
  return {
    nameImg: isPdfSafeText(fullName) ? null : textToPdfImage(fullName, { pt: 16, bold: true, color: "#000000" }),
    companyImg: (company && !isPdfSafeText(company)) ? textToPdfImage(company, { pt: 10, color: "#3C3C3C" }) : null,
    idImg: (idMasked && !isPdfSafeText(idMasked)) ? textToPdfImage(idMasked, { pt: 10, color: "#3C3C3C" }) : null
  };
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
 * Draws ONE certificate onto the current page of a jsPDF document.
 */
function drawCertificatePage(doc, { fullName, certNumber, issuedDateStr, qrCanvas, statementText, titleText, brandName, eventColor, eventAccentColor, eventLogo, company, idOrPassport, verifyUrl, nameImg, companyImg, idImg, photoDataUrl }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const [r, g, b] = hexToRgb(eventColor);

  // Border
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(1.2);
  doc.rect(6, 6, pageWidth - 12, pageHeight - 12);

  // Event logo (top-left, inside the border) — max 16mm tall, aspect kept.
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
      console.warn("Could not embed event logo on certificate:", e);
    }
  }

  // Photo (visual ID check) — square, top-right of the certificate body.
  if (photoDataUrl) {
    const photoSize = 24;
    const px = pageWidth - photoSize - 10;
    const py = 10;
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(0.6);
    try {
      doc.addImage(photoDataUrl, "JPEG", px, py, photoSize, photoSize);
      doc.rect(px, py, photoSize, photoSize);
    } catch (e) {
      console.warn("Could not embed photo on certificate:", e);
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
  if (nameImg) {
    const maxW = pageWidth - 40;
    const k = nameImg.wMm > maxW ? maxW / nameImg.wMm : 1;
    doc.addImage(nameImg.dataUrl, "PNG", pageWidth / 2 - (nameImg.wMm * k) / 2, 54 - (nameImg.hMm * k) * 0.62, nameImg.wMm * k, nameImg.hMm * k);
  } else {
    doc.text(fullName, pageWidth / 2, 54, { align: "center" });
  }

  // Company + masked ID: a second and third detail that has to match the
  // person's physical ID, so a name swapped in a PDF editor doesn't pass.
  let y = 60;
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  if (company && companyImg) {
    const maxW = pageWidth - 40;
    const k = companyImg.wMm > maxW ? maxW / companyImg.wMm : 1;
    doc.addImage(companyImg.dataUrl, "PNG", pageWidth / 2 - (companyImg.wMm * k) / 2, y - (companyImg.hMm * k) * 0.62, companyImg.wMm * k, companyImg.hMm * k);
    y += 5;
  } else if (company && isPdfSafeText(company)) {
    doc.text(company, pageWidth / 2, y, { align: "center" });
    y += 5;
  }
  const idMasked = maskIdNumber(idOrPassport);
  if (idMasked && isPdfSafeText(idMasked)) {
    doc.text(`ID / Passport: ${idMasked}`, pageWidth / 2, y, { align: "center" });
    y += 5;
  } else if (idMasked && idImg) {
    doc.text("ID / Passport:", pageWidth / 2 - 14, y, { align: "center" });
    doc.addImage(idImg.dataUrl, "PNG", pageWidth / 2 - 2, y - idImg.hMm * 0.62, idImg.wMm, idImg.hMm);
    y += 5;
  }
  y += 3;

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
  doc.text(labelText, startX, y, { align: "left" });
  doc.setTextColor(ar, ag, ab);
  doc.text(certNumber, startX + labelWidth, y, { align: "left" });
  doc.setTextColor(90, 90, 90);
  doc.text(`Issued: ${issuedDateStr}`, pageWidth / 2, y + 5, { align: "center" });

  // QR code image
  if (qrCanvas) {
    const qrDataUrl = qrCanvas.toDataURL("image/png");
    const qrSize = 22;
    doc.addImage(qrDataUrl, "PNG", pageWidth - qrSize - 10, pageHeight - qrSize - 8, qrSize, qrSize);
  }

  // Footer note: authenticity is decided by the online record, not the paper.
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text("Authenticity is confirmed only by scanning the QR code or checking the certificate number on the Miraj verification page.", 12, pageHeight - 10, { align: "left", maxWidth: pageWidth - 60 });
}

/**
 * Builds a single-certificate PDF (A5 landscape) and triggers a download.
 */
async function generateCertificatePdf(params) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
  const wording = await pdfSafeWording(params.titleText, params.statementText);
  const images = prepareTextImages({ fullName: params.fullName, company: params.company, idMasked: maskIdNumber(params.idOrPassport) });
  drawCertificatePage(doc, { ...params, ...wording, ...images });
  doc.save(`${params.certNumber}.pdf`);
}

/**
 * Full pipeline: render QR -> load event logo -> wait -> build PDF -> save.
 * Throws on failure so the caller can show a retry UI.
 */
async function generateAndDownloadCertificate({ containerEl, verifyUrl, fullName, certNumber, issuedDateStr, statementText, titleText, brandName, eventColor, eventAccentColor, eventLogoUrl, company, idOrPassport, photoDataUrl }) {
  const qrCanvas = await renderQrCode(containerEl, verifyUrl);
  const eventLogo = await loadImageAsDataUrl(eventLogoUrl);
  await generateCertificatePdf({
    fullName, certNumber, issuedDateStr, qrCanvas, statementText, titleText, brandName, eventColor, eventAccentColor, eventLogo, company, idOrPassport, verifyUrl, photoDataUrl
  });
  return qrCanvas;
}

/**
 * Group pipeline: ONE PDF containing a separate certificate page for every
 * member (each with its own QR/token/number). items = [{ fullName, certNumber,
 * issuedDateStr, verifyUrl, company, idOrPassport }].
 */
async function generateGroupCertificatesPdf({ items, containerEl, statementText, titleText, brandName, eventColor, eventAccentColor, eventLogoUrl, filename }) {
  const { jsPDF } = window.jspdf;
  const eventLogo = await loadImageAsDataUrl(eventLogoUrl);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
  const wording = await pdfSafeWording(titleText, statementText);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const qrCanvas = await renderQrCode(containerEl, it.verifyUrl);
    if (i > 0) doc.addPage("a5", "landscape");
    const images = prepareTextImages({ fullName: it.fullName, company: it.company, idMasked: maskIdNumber(it.idOrPassport) });
    drawCertificatePage(doc, {
      fullName: it.fullName, certNumber: it.certNumber, issuedDateStr: it.issuedDateStr, qrCanvas,
      statementText: wording.statementText, titleText: wording.titleText, brandName, eventColor, eventAccentColor, eventLogo,
      company: it.company, idOrPassport: it.idOrPassport, verifyUrl: it.verifyUrl, photoDataUrl: it.photoDataUrl, ...images
    });
  }
  doc.save(filename || "group-certificates.pdf");
}
