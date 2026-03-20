/**
 * state.js
 * All mutable global state shared between modules.
 * Kept minimal — only variables that truly need to be global.
 * Load after config.js.
 */

// ── Portfolio ────────────────────────────────────────────────────────────────
let portfolio      = [];
let activeProjectId = null;

// ── Active project data ──────────────────────────────────────────────────────
let rows          = [];   // tâches + groupes synthétiques + jalons (sorted)
let projectColors = {};   // { projectName: '#hex' }
let collapsed     = {};   // { collapseKey: true }

// ── View ─────────────────────────────────────────────────────────────────────
let view      = 'semaine'; // 'jour' | 'semaine' | 'mois'
let dayWidth  = 6;          // px per day (zoom)
let showDates = true;
let labelW    = 400;        // px — resizable left panel width

// ── UI ───────────────────────────────────────────────────────────────────────
let editingIdx   = null;
let navOpen      = true;
let navCollapsed = {};
let cpTarget     = null;    // color picker target project
let dataSectionOpen = true;

// ── Firebase ─────────────────────────────────────────────────────────────────
let _fbSaveTimer  = null;
let _fbSaving     = false;
let _fbInitLoaded = false;
let _lastSaveTs   = 0;

// ── Edit panel ───────────────────────────────────────────────────────────────
let epEditingIdx = null;
let epMode       = 'new'; // 'new' | 'edit'

// ── Jalon panel ──────────────────────────────────────────────────────────────
let jpEditingIdx = null;

// ── PPTX ─────────────────────────────────────────────────────────────────────
let _pptxExportReady = false;
