/**
 * Runs automatically after `npm install` (package.json "postinstall").
 * Does not run builds or tests — keeps install fast.
 */
const v = process.version;
console.log("");
console.log("[kyn] ─────────────────────────────────────────────");
console.log(`[kyn] Dependencies linked (${v}).`);
console.log("[kyn] All packages are declared in package.json — no per-package installs needed.");
console.log("[kyn]");
console.log("[kyn] Next steps:");
console.log("[kyn]   1. Copy .env.example → .env and fill secrets");
console.log("[kyn]   2. npm run dev          — start the app");
console.log("[kyn]   3. npm run kyn:ready   — optional: lint + build + API smoke tests");
console.log("[kyn]");
console.log("[kyn] UNBREAKABLE_RULES.md §9 — backend-first + npm-once workflow.");
console.log("[kyn] docs/BACKEND_FIRST.md — integrations map.");
console.log("[kyn] ─────────────────────────────────────────────");
console.log("");
