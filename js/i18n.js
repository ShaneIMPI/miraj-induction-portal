// Simple i18n loader — fetches lang/<code>.json and applies to elements
// tagged with data-i18n="path.to.key" (and data-i18n-placeholder for inputs)

let currentLang = null;
let currentStrings = null;

async function loadLanguage(langCode) {
  const res = await fetch(`lang/${langCode}.json?v=2`);
  if (!res.ok) throw new Error(`Could not load language file for ${langCode}`);
  const strings = await res.json();
  currentLang = langCode;
  currentStrings = strings;
  localStorage.setItem("mm_lang", langCode);

  document.documentElement.lang = langCode;
  document.documentElement.dir = strings.dir || "ltr";
  document.body.classList.toggle("rtl", strings.dir === "rtl");

  applyStrings();
  return strings;
}

function t(path) {
  if (!currentStrings) return path;
  const parts = path.split(".");
  let node = currentStrings;
  for (const p of parts) {
    if (node && Object.prototype.hasOwnProperty.call(node, p)) {
      node = node[p];
    } else {
      return path; // fallback: show the key so missing translations are obvious during QA
    }
  }
  return node;
}

function applyStrings() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.setAttribute("placeholder", t(key));
  });
}

function getSavedOrDefaultLanguage() {
  const saved = localStorage.getItem("mm_lang");
  if (saved && SUPPORTED_LANGUAGES.includes(saved)) return saved;
  return DEFAULT_LANGUAGE;
}

// ---------- Sticky header shadow on scroll ----------
// Runs on every page (this file loads everywhere). Adds a subtle shadow
// once the page scrolls past the top, so the header reads as layered
// above the content rather than flush against it.
(function initStickyHeaderShadow() {
  const header = document.querySelector(".app-header");
  if (!header) return;
  const applyState = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 4);
  };
  applyState();
  window.addEventListener("scroll", applyState, { passive: true });
})();
