/* =========================================
   UTILS.JS — Constantes, état global & utilitaires
   ========================================= */

// ── Constantes ──
const STORAGE_KEY = 'gantt4cad_portfolio';
const MAX_NIVEAUX = 5;
const PALETTE = [
  '#6c63ff','#ff6584','#43e97b','#f7971e','#38b2f8',
  '#ff9a3c','#a29bfe','#fd79a8','#00b894','#fdcb6e',
  '#e17055','#74b9ff','#55efc4','#d63031','#6ab04c',
  '#e84393','#0984e3','#b8e994','#f19066','#786fa6'
];
const MOIS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
const NAV_COLORS = ['#EC7206','#284053','#72B6EC','#43e97b','#ff6584','#a29bfe','#fdcb6e','#00b894','#e17055','#6c63ff'];

// ── État global ──
let portfolio = [];
let activeProjectId = null;
let rows = [];
let view = 'semaine';
let dayWidth = 6;
let projectColors = {};
let collapsed = {};
let editingIdx = null;
let showDates = true;
let labelW = 400;
let cpTarget = null;
let epEditingIdx = null;
let epMode = 'new';
let jpEditingIdx = null;
let navOpen = true;
let navCollapsed = {};
let dataSectionOpen = true;

// ── Firebase state ──
let _fbSaveTimer = null;
let _fbSaving = false;
let _fbInitLoaded = false;
let _lastSaveTs = 0;
let _pptxExportReady = false;

// ── Fonctions utilitaires pures ──

function parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) { const d = new Date(s); d.setHours(0,0,0,0); return d; }
  let m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  if (!isNaN(s)) { const d = new Date((+s - 25569) * 86400000); d.setHours(0,0,0,0); return d; }
  return new Date(s);
}

function fmtD(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function fmtShort(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

function toInput(d) {
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function diff(a, b) {
  return Math.round((b - a) / 86400000);
}

function escH(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function getColor(p) {
  if (!projectColors[p]) {
    const used = Object.values(projectColors);
    projectColors[p] = PALETTE.find(c => !used.includes(c)) || PALETTE[0];
  }
  return projectColors[p];
}

function lighten(hex, pct = 30) {
  let c = parseInt(hex.slice(1), 16);
  let r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
  r = Math.min(255, r + Math.round((255 - r) * pct / 100));
  g = Math.min(255, g + Math.round((255 - g) * pct / 100));
  b = Math.min(255, b + Math.round((255 - b) * pct / 100));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function navColor(idx) {
  return NAV_COLORS[idx % NAV_COLORS.length];
}

// ── Jours fériés ──

function getJoursFeries(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19*a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2*e + 2*i - h - k) % 7;
  const m = Math.floor((a + 11*h + 22*l) / 451);
  const mo = Math.floor((h + l - 7*m + 114) / 31) - 1;
  const day = ((h + l - 7*m + 114) % 31) + 1;
  const paques = new Date(year, mo, day);
  function add(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function key(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  return new Set([
    new Date(year,0,1), new Date(year,4,1), new Date(year,4,8),
    new Date(year,6,14), new Date(year,7,15), new Date(year,10,1),
    new Date(year,10,11), new Date(year,11,25),
    add(paques,1), add(paques,39), add(paques,50)
  ].map(key));
}

function isJourFerie(date) {
  const y = date.getFullYear();
  const cache = isJourFerie._c || (isJourFerie._c = {});
  if (!cache[y]) cache[y] = getJoursFeries(y);
  const key = y+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  return cache[y].has(key);
}

function collapseKey(projet, niveaux) {
  if (!niveaux || !niveaux.length) return 'P:' + projet;
  return 'G:' + projet + '|' + niveaux.join('|');
}

function isVisible(r) {
  if (r._type === 'jalon') return true;
  if (r._type === 'projet') return true;
  if (collapsed[collapseKey(r.projet, [])]) return false;
  const niv = r.niveaux || [];
  if (r._type === 'groupe') {
    for (let i = 1; i < niv.length; i++) {
      if (collapsed[collapseKey(r.projet, niv.slice(0, i))]) return false;
    }
    return true;
  }
  if (r._type === 'tache') {
    for (let i = 1; i <= niv.length; i++) {
      if (collapsed[collapseKey(r.projet, niv.slice(0, i))]) return false;
    }
    return true;
  }
  return true;
}
