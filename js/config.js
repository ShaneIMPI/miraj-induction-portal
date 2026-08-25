// ============================================================
// CONFIG — edit these before deploying
// ============================================================

// --- Supabase ---
// Get these from Supabase Dashboard > Project Settings > API
const SUPABASE_URL = "https://jhmxbkdkcuwcjwiomcug.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpobXhia2RrY3V3Y2p3aW9tY3VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MDUwMjMsImV4cCI6MjEwMzE4MTAyM30.S0oZyF0QnFbCEG0i-yAj3lYej9NG1kO7OQqrP_UAbsc";

// --- Branding (pulled from the real logo + mirajmedia.com) ---
const BRAND = {
  name: "Miraj Media",
  logoPath: "assets/logo-miraj.png",
  // Landing page hero background photo. File doesn't exist yet — that's fine,
  // the hero gracefully falls back to a brand-coloured gradient until you
  // drop a real image at this path (see assets/hero-image-prompt.md for a
  // ready-to-use Windows Designer prompt sized correctly for this).
  heroImage: "assets/hero-bg.jpg",
  primaryColor: "#1A347E",   // navy from the logo's bird/swoosh icon
  accentColor: "#F15E2C",    // orange from the "miraj" wordmark
  darkColor: "#1A1A1A",
  supportEmail: "info@mirajmedia.com",
  website: "www.mirajmedia.com",
  offices: [
    { label: "Dubai, UAE (HQ)", tel: "+971 4242 4069" },
    { label: "Al Khobar, Saudi Arabia", tel: "+966 13 887 2603" },
    { label: "Manama, Bahrain", tel: "+973 1771 4722" }
  ]
};

// --- Languages available in the language switcher ---
const SUPPORTED_LANGUAGES = ["en", "ar", "fr", "sw"];
const DEFAULT_LANGUAGE = "en";

// --- Certificate number prefix ---
const CERT_PREFIX = "MM"; // Miraj Media — certificate numbers are now per-event: MM-{EVENT_CODE}-0001
