// ── Young Life Sacramento — Configuration ────────────────────────────────────
//
// GOOGLE SHEETS SYNC
// ------------------
// 1. Open your Google Sheet with school data
// 2. Click File → Share → Publish to web
// 3. Choose "Entire Document" and format "Comma-separated values (.csv)"
// 4. Click Publish and copy the URL
// 5. Paste it below (replace the empty string)
//
// Leave SHEETS_URL as an empty string "" to use the built-in data instead.

const SHEETS_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR2wPLh9SKlqSML_ktSWgssEKr7HedkOJ318Kzui0t4mkBNmDxLIkHJfYvnY4Wm_fzPLtYCTTdWfB6R/pub?gid=0&single=true&output=csv";

// ── Map defaults ──────────────────────────────────────────────────────────────
const MAP_CENTER = [38.52, -121.38];
const MAP_ZOOM   = 11;
