/**
 * init.js
 * Application bootstrap — runs after all modules are loaded.
 *
 * Responsibilities:
 *   1. Patch renderAll to auto-save current project on every render
 *   2. Start with empty portfolio (Firebase will provide data)
 */

// ── Patch renderAll → auto-save ───────────────────────────────────────────────
// This must run after both ui.js (renderAll) and portfolio.js (saveCurrentProject).

const _renderAllBase = renderAll;
renderAll = function () {
  _renderAllBase();
  saveCurrentProject();
};

// ── Bootstrap ────────────────────────────────────────────────────────────────

portfolio = [];
renderNavList();

// Firebase will call switchToProject() once data is loaded (see firebase.js).
