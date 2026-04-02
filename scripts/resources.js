/* ═══════════════════════════════════════════
   resources.js — Gestion des ressources
   CRUD + Calendrier mensuel
   ═══════════════════════════════════════════ */

/* ── État global ressources ── */
const RESOURCES_KEY = 'gantt4cad_resources';
let resources = [];          // [{ id, nom, prenom, profession }]
let resCalendarDate = null;  // Date de référence du calendrier (1er du mois affiché)
let resLabelW = 260;         // Largeur du panneau gauche ressources
let editingResourceId = null;

/* ── Persistance ── */
function saveResources() {
  try { localStorage.setItem(RESOURCES_KEY, JSON.stringify(resources)); } catch(e) {}
  // Firebase : on réutilise le même mécanisme si disponible
  if (typeof scheduleFirebaseSaveResources === 'function') scheduleFirebaseSaveResources();
}

function loadResources() {
  try {
    const raw = localStorage.getItem(RESOURCES_KEY);
    if (raw) resources = JSON.parse(raw);
  } catch(e) { resources = []; }
}

/* ── ID unique ── */
function genResId() {
  return 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

/* ── CRUD ressources ── */
function addResource(nom, prenom, profession) {
  nom = (nom || '').trim();
  prenom = (prenom || '').trim();
  profession = (profession || '').trim();
  if (!nom && !prenom) return false;
  resources.push({ id: genResId(), nom, prenom, profession });
  saveResources();
  return true;
}

function updateResource(id, nom, prenom, profession) {
  const r = resources.find(r => r.id === id);
  if (!r) return false;
  r.nom = (nom || '').trim();
  r.prenom = (prenom || '').trim();
  r.profession = (profession || '').trim();
  saveResources();
  return true;
}

function deleteResource(id) {
  resources = resources.filter(r => r.id !== id);
  saveResources();
  if (editingResourceId === id) cancelResourceEdit();
  renderResourcesView();
}

/* ── Calcul charges depuis le portfolio ── */
/**
 * Retourne la charge totale affectée à une ressource pour un jour donné.
 * Pour l'instant : placeholder — sera connecté à l'affectation réelle
 * quand la fonctionnalité sera ajoutée.
 * @param {string} resourceId
 * @param {Date} date
 * @returns {number} charge en jours
 */
function getChargeForResourceDay(resourceId, date) {
  const res = resources.find(r => r.id === resourceId);
  if (!res) return 0;
  return getGHOChargeForDay(res, date);
}

/* ── Rendu principal de la vue ressources ── */
function renderResourcesView() {
  const container = document.getElementById('viewRessources');
  if (!container) return;

  if (!resCalendarDate) {
    const now = new Date();
    resCalendarDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  container.innerHTML = `
    <div class="res-shell">
      <!-- Panneau gauche : liste + formulaire -->
      <div class="res-left" id="resLeft" style="width:${resLabelW}px">
        <div class="res-left-header">
          <span class="res-lh-title">👤 RESSOURCES</span>
          <button class="res-gho-import-btn" onclick="importGHO()" title="Importer charges GHO (xlsx)">📥 GHO</button>
          <button class="res-add-btn" onclick="openResourceForm()" title="Nouvelle ressource">+</button>
        </div>

        <!-- Formulaire création / édition -->
        <div class="res-form" id="resForm" style="display:none">
          <div class="res-form-title" id="resFormTitle">Nouvelle ressource</div>
          <div class="res-form-group">
            <label class="res-form-label">Nom</label>
            <input class="res-form-input" id="resInputNom" type="text" placeholder="Nom de famille">
          </div>
          <div class="res-form-group">
            <label class="res-form-label">Prénom</label>
            <input class="res-form-input" id="resInputPrenom" type="text" placeholder="Prénom">
          </div>
          <div class="res-form-group">
            <label class="res-form-label">Profession</label>
            <input class="res-form-input" id="resInputProfession" type="text" placeholder="Ex: Développeur, Chef de projet…">
          </div>
          <div class="res-form-actions">
            <button class="res-btn-cancel" onclick="cancelResourceEdit()">Annuler</button>
            <button class="res-btn-save" onclick="submitResourceForm()">✓ Enregistrer</button>
          </div>
        </div>

        <!-- Liste des ressources -->
        <div class="res-list" id="resList">
          ${renderResourceList()}
        </div>

        <div class="res-resize-handle" id="resResizeHandle"></div>
      </div>

      <!-- Panneau droit : calendrier mensuel -->
      <div class="res-right" id="resRight">
        ${renderResourceCalendar()}
      </div>
    </div>
  `;

  initResResize();
  attachResFormEnter();
}

/* ── Rendu liste des ressources ── */
/* IDs des ressources avec activités GHO dépliées */
const _ghoExpanded = new Set();

function toggleGhoExpand(resId) {
  if (_ghoExpanded.has(resId)) _ghoExpanded.delete(resId);
  else _ghoExpanded.add(resId);
  document.getElementById('resList').innerHTML = renderResourceList();
}

function renderResourceList() {
  if (!resources.length) {
    return `<div class="res-empty">
      <div class="res-empty-icon">👤</div>
      <div>Aucune ressource.<br>Cliquez sur <strong>+</strong> pour en créer une.</div>
    </div>`;
  }
  return resources.map(r => {
    const fullName = [r.prenom, r.nom].filter(Boolean).join(' ') || '—';
    const isEditing = editingResourceId === r.id;
    const acts = r.ghoData?.activities || [];
    const hasGho = acts.length > 0;
    const isExpanded = _ghoExpanded.has(r.id);
    const actsWithData = acts.filter(a => Object.values(a.daily).some(v => v > 0));
    const totalMin = actsWithData.reduce((s,a) => s + Object.values(a.daily).reduce((x,v)=>x+v,0), 0);
    const totalJ = totalMin > 0 ? (totalMin/480).toFixed(1)+'j' : '';

    let ghoHtml = '';
    if (hasGho && actsWithData.length) {
      const toggleIcon = isExpanded ? '▾' : '▸';
      ghoHtml = `
        <div class="res-gho-bar" onclick="event.stopPropagation();toggleGhoExpand('${r.id}')">
          <span class="res-gho-toggle">${toggleIcon}</span>
          <span class="res-gho-label">GHO · ${actsWithData.length} projet${actsWithData.length>1?'s':''}</span>
          ${totalJ ? `<span class="res-gho-total">${totalJ}</span>` : ''}
          ${r.ghoData.importDate ? `<span class="res-gho-date">↑ ${r.ghoData.importDate}</span>` : ''}
        </div>`;
      if (isExpanded) {
        ghoHtml += `<div class="res-gho-list">` +
          actsWithData.map(a => {
            const actMin = Object.values(a.daily).reduce((x,v)=>x+v,0);
            const actJ = (actMin/480).toFixed(1);
            return `<div class="res-gho-act">
              <span class="res-gho-act-name" title="${escH(a.name)}">${escH(a.name)}</span>
              <span class="res-gho-act-total">${actJ}j</span>
            </div>`;
          }).join('') + `</div>`;
      }
    }

    return `<div class="res-item${isEditing ? ' editing' : ''}" id="resItem_${r.id}">
      <div class="res-item-main">
        <div class="res-item-avatar">${getInitials(r.prenom, r.nom)}</div>
        <div class="res-item-info">
          <div class="res-item-name">${escH(fullName)}</div>
          ${r.profession ? `<div class="res-item-prof">${escH(r.profession)}</div>` : ''}
        </div>
        <div class="res-item-actions">
          <button class="res-action-btn" onclick="openResourceEdit('${r.id}')" title="Modifier">✎</button>
          <button class="res-action-btn danger" onclick="confirmDeleteResource('${r.id}')" title="Supprimer">🗑</button>
        </div>
      </div>
      ${ghoHtml}
    </div>`;
  }).join('');
}

function getInitials(prenom, nom) {
  const p = (prenom || '').trim()[0] || '';
  const n = (nom || '').trim()[0] || '';
  return (p + n).toUpperCase() || '?';
}

/* ── Formulaire ressource ── */
function openResourceForm() {
  editingResourceId = null;
  document.getElementById('resFormTitle').textContent = 'Nouvelle ressource';
  document.getElementById('resInputNom').value = '';
  document.getElementById('resInputPrenom').value = '';
  document.getElementById('resInputProfession').value = '';
  document.getElementById('resForm').style.display = '';
  document.getElementById('resInputPrenom').focus();
}

function openResourceEdit(id) {
  const r = resources.find(r => r.id === id);
  if (!r) return;
  editingResourceId = id;
  document.getElementById('resFormTitle').textContent = 'Modifier la ressource';
  document.getElementById('resInputNom').value = r.nom || '';
  document.getElementById('resInputPrenom').value = r.prenom || '';
  document.getElementById('resInputProfession').value = r.profession || '';
  document.getElementById('resForm').style.display = '';
  document.getElementById('resInputPrenom').focus();
  // Highlight item
  document.querySelectorAll('.res-item').forEach(el => el.classList.remove('editing'));
  const item = document.getElementById('resItem_' + id);
  if (item) item.classList.add('editing');
}

function cancelResourceEdit() {
  editingResourceId = null;
  const form = document.getElementById('resForm');
  if (form) form.style.display = 'none';
  document.querySelectorAll('.res-item').forEach(el => el.classList.remove('editing'));
}

function submitResourceForm() {
  const nom        = (document.getElementById('resInputNom')?.value || '').trim();
  const prenom     = (document.getElementById('resInputPrenom')?.value || '').trim();
  const profession = (document.getElementById('resInputProfession')?.value || '').trim();

  if (!nom && !prenom) {
    document.getElementById('resInputNom').focus();
    return;
  }

  if (editingResourceId) {
    updateResource(editingResourceId, nom, prenom, profession);
  } else {
    addResource(nom, prenom, profession);
  }

  editingResourceId = null;
  renderResourcesView();
}

function confirmDeleteResource(id) {
  const r = resources.find(r => r.id === id);
  if (!r) return;
  const fullName = [r.prenom, r.nom].filter(Boolean).join(' ') || 'cette ressource';
  if (confirm(`Supprimer "${fullName}" ?`)) {
    deleteResource(id);
  }
}

function attachResFormEnter() {
  const inputs = document.querySelectorAll('#resInputNom, #resInputPrenom, #resInputProfession');
  inputs.forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitResourceForm();
      if (e.key === 'Escape') cancelResourceEdit();
    });
  });
}

/* ── Calendrier mensuel ── */
function renderResourceCalendar() {
  const d = resCalendarDate || new Date();
  const year  = d.getFullYear();
  const month = d.getMonth();

  const monthLabel = new Date(year, month, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  // Jours du mois
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);

  // Colonnes : une par jour
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }

  const COL_W = 34; // px par jour
  const totalW = days.length * COL_W;

  // ── Header : mois + navigation ──
  let html = `<div class="res-cal-wrap">
    <div class="res-cal-topbar">
      <button class="res-cal-nav" onclick="resCalPrev()">‹</button>
      <span class="res-cal-month">${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</span>
      <button class="res-cal-nav" onclick="resCalNext()">›</button>
      <button class="res-cal-today" onclick="resCalToday()">Aujourd'hui</button>
    </div>
    <div class="res-cal-scroll">
      <div class="res-cal-inner" style="min-width:${totalW}px">`;

  // ── Ligne d'en-tête jours ──
  html += `<div class="res-cal-header" style="width:${totalW}px">`;
  days.forEach(day => {
    const isToday    = day.getTime() === today.getTime();
    const isWE       = day.getDay() === 0 || day.getDay() === 6;
    const isFerie    = isJourFerie(day);
    const dayLabel   = day.getDate();
    const dayLetters = ['D','L','M','M','J','V','S'][day.getDay()];
    let cls = 'res-cal-day-head';
    if (isToday)         cls += ' today';
    else if (isFerie)    cls += ' ferie';
    else if (isWE)       cls += ' weekend';
    html += `<div class="${cls}" style="width:${COL_W}px">
      <span class="res-cal-dl">${dayLetters}</span>
      <span class="res-cal-dn">${dayLabel}</span>
    </div>`;
  });
  html += `</div>`; // res-cal-header

  // ── Lignes par ressource ──
  if (!resources.length) {
    html += `<div class="res-cal-empty">Aucune ressource à afficher</div>`;
  } else {
    resources.forEach(r => {
      const fullName = [r.prenom, r.nom].filter(Boolean).join(' ') || '—';
      html += `<div class="res-cal-row" style="width:${totalW}px" title="${escH(fullName)}">`;
      days.forEach(day => {
        const isToday = day.getTime() === today.getTime();
        const isWE    = day.getDay() === 0 || day.getDay() === 6;
        const isFerie = isJourFerie(day);
        const charge  = getChargeForResourceDay(r.id, day);
        let cls = 'res-cal-cell';
        if (isToday)         cls += ' today';
        else if (isFerie)    cls += ' ferie';
        else if (isWE)       cls += ' weekend';
        // charge en minutes; 480min = 8h = 1j
        const chargeH = charge / 60;
        const chargePct = Math.min(charge / 480 * 100, 100);
        const chargeHtml = charge > 0
          ? `<div class="res-cal-charge" style="height:${chargePct}%" title="${chargeH.toFixed(1)}h">${chargeH >= 0.5 ? chargeH.toFixed(1)+'h' : ''}</div>`
          : '';
        html += `<div class="${cls}" style="width:${COL_W}px">${chargeHtml}</div>`;
      });
      html += `</div>`;
      /* ── Lignes GHO activités ── */
      html += renderGHOActivitiesCalendar(r, days, COL_W);
    });
  }

  html += `</div></div></div>`; // res-cal-inner, res-cal-scroll, res-cal-wrap
  return html;
}

/* ── Navigation calendrier ── */
function resCalPrev() {
  if (!resCalendarDate) resCalendarDate = new Date();
  resCalendarDate = new Date(resCalendarDate.getFullYear(), resCalendarDate.getMonth() - 1, 1);
  _refreshCalendar();
}

function resCalNext() {
  if (!resCalendarDate) resCalendarDate = new Date();
  resCalendarDate = new Date(resCalendarDate.getFullYear(), resCalendarDate.getMonth() + 1, 1);
  _refreshCalendar();
}

function resCalToday() {
  const now = new Date();
  resCalendarDate = new Date(now.getFullYear(), now.getMonth(), 1);
  _refreshCalendar();
}

function _refreshCalendar() {
  const right = document.getElementById('resRight');
  if (right) right.innerHTML = renderResourceCalendar();
}

/* ── Resize panneau gauche ressources ── */
function initResResize() {
  const handle = document.getElementById('resResizeHandle');
  const left   = document.getElementById('resLeft');
  if (!handle || !left) return;

  let dragging = false, startX = 0, startW = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = left.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newW = Math.min(Math.max(startW + (e.clientX - startX), 180), 560);
    left.style.width = newW + 'px';
    resLabelW = newW;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

/* ── Init au chargement ── */
(function initResources() {
  loadResources();
})();


/* ═══════════════════════════════════════════════════════
   IMPORT GHO EXCEL
   Utilise SheetJS (déjà chargé dans l'appli) pour parser
   le fichier export GHO et mettre à jour les ressources.
   ═══════════════════════════════════════════════════════ */

function triggerGHOImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => parseGHOExcel(evt.target.result, file.name);
    reader.readAsArrayBuffer(file);
  };
  input.click();
}

function parseGHOExcel(buffer, fileName) {
  try {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS non disponible — vérifiez le chargement de la librairie.');
      return;
    }
    const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // Row 11 (index 11) = dates in col 4+ (0-indexed)
    // Row 12 (index 12) = headers
    // Row 13+ (index 13+) = data
    const DATE_ROW = 11;
    const DATA_START = 13;
    const COL_RES  = 1; // col B
    const COL_ACT  = 2; // col C
    const COL_FIRST_DAY = 4; // col E

    const dateRow = raw[DATE_ROW] || [];
    const dates = [];
    for (let c = COL_FIRST_DAY; c < dateRow.length; c++) {
      const v = dateRow[c];
      if (v != null) dates.push({ col: c, label: String(v).trim() });
    }

    if (!dates.length) {
      alert('Format GHO non reconnu — aucune date trouvée à la ligne 12.');
      return;
    }

    // Parse rows → { resourceName: { activityName: { dateLabel: minutes } } }
    const parsed = {}; // { resName → { actName → { dateLabel → minutes } } }
    let currentRes = null;

    for (let ri = DATA_START; ri < raw.length; ri++) {
      const row = raw[ri];
      if (!row) continue;
      const resCell = row[COL_RES];
      const actCell = row[COL_ACT];
      if (resCell != null && String(resCell).trim()) {
        currentRes = String(resCell).trim();
      }
      if (!currentRes || actCell == null || !String(actCell).trim()) continue;
      const actName = String(actCell).trim();

      if (!parsed[currentRes]) parsed[currentRes] = {};
      if (!parsed[currentRes][actName]) parsed[currentRes][actName] = {};

      dates.forEach(({ col, label }) => {
        const v = row[col];
        const mins = (v != null && !isNaN(parseFloat(v))) ? parseFloat(v) : 0;
        if (mins > 0) {
          parsed[currentRes][actName][label] =
            Math.round((parsed[currentRes][actName][label] || 0) + mins * 100) / 100;
        }
      });
    }

    // Today's date label for import stamp
    const now = new Date();
    const importDate = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;

    let created = 0, updated = 0;

    Object.entries(parsed).forEach(([resName, actMap]) => {
      // Only import resources with at least some non-zero data
      const hasData = Object.values(actMap).some(daily =>
        Object.values(daily).some(v => v > 0)
      );
      if (!hasData) return;

      // Match resource by full name (Prénom NOM or NOM Prénom)
      let res = _findResourceByName(resName);

      if (!res) {
        // Create new resource
        const parts = resName.split(' ');
        // Convention: UPPERCASE = nom, TitleCase = prénom
        const nomParts = parts.filter(p => p === p.toUpperCase() && p.length > 1);
        const prenomParts = parts.filter(p => !nomParts.includes(p));
        const nom = nomParts.join(' ') || parts[parts.length - 1];
        const prenom = prenomParts.join(' ') || '';
        const id = genResId();
        res = { id, nom, prenom, profession: '' };
        resources.push(res);
        created++;
      } else {
        updated++;
      }

      // Build activities array (only those with non-zero days)
      const activities = Object.entries(actMap)
        .map(([name, daily]) => ({ name, daily }))
        .filter(a => Object.values(a.daily).some(v => v > 0));

      res.ghoData = { importDate, activities };
    });

    saveResources();
    document.getElementById('resList').innerHTML = renderResourceList();
    renderResourceCalendarView();
    alert(`Import GHO terminé :\n• ${created} ressource(s) créée(s)\n• ${updated} ressource(s) mise(s) à jour`);

  } catch(err) {
    console.error('GHO import error:', err);
    alert('Erreur lors de l\'import GHO : ' + err.message);
  }
}

function _findResourceByName(fullName) {
  const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const target = normalize(fullName);
  return resources.find(r => {
    const full1 = normalize([r.prenom, r.nom].filter(Boolean).join(' '));
    const full2 = normalize([r.nom, r.prenom].filter(Boolean).join(' '));
    return full1 === target || full2 === target;
  }) || null;
}

/* ═══════════════════════════════════════════════════════════════
   GHO IMPORT — Import des charges journalières depuis export GHO
   ═══════════════════════════════════════════════════════════════ */

/* État collapse des activités GHO par ressource */
let ghoCollapsed = {};  // {resourceId: true/false}

/* ── Lecture du fichier GHO Excel ── */
function importGHO() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => _parseGHOWorkbook(ev.target.result);
    reader.readAsArrayBuffer(file);
  };
  input.click();
}

function _parseGHOWorkbook(buffer) {
  /* Parse XLSX sans librairie externe : on lit le ZIP et extrait sharedStrings + sheet */
  /* Utilise SheetJS si disponible, sinon message d'erreur */
  if (typeof XLSX === 'undefined') {
    /* Charger SheetJS dynamiquement */
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => _parseGHOWorkbook(buffer);
    s.onerror = () => alert('Impossible de charger le parser Excel. Vérifiez votre connexion.');
    document.head.appendChild(s);
    return;
  }

  try {
    const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];

    /* ── Lire les dates depuis la ligne 12 (cols E à fin) ── */
    const range = XLSX.utils.decode_range(ws['!ref']);
    const dateRow = 11; // 0-indexed = row 12
    const dateMap = {}; // colIndex → 'DD/MM/YYYY'
    for (let c = 4; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({r: dateRow, c})];
      if (cell && cell.v) dateMap[c] = String(cell.v).trim();
    }

    /* ── Parser les données depuis ligne 14 (0-indexed=13) ── */
    let currentRes = null;
    const parsed = {}; // {resourceName: [{activityName, dailyEfforts, totalMin}]}

    for (let r = 13; r <= range.e.r; r++) {
      const resCell = ws[XLSX.utils.encode_cell({r, c: 1})];
      const actCell = ws[XLSX.utils.encode_cell({r, c: 2})];

      if (resCell && resCell.v) currentRes = String(resCell.v).trim();
      if (!currentRes || !actCell || !actCell.v) continue;

      const actName = String(actCell.v).trim();
      const daily = {};
      let totalMin = 0;

      for (const [colStr, dateStr] of Object.entries(dateMap)) {
        const col = parseInt(colStr);
        const cell = ws[XLSX.utils.encode_cell({r, c: col})];
        const v = cell ? (parseFloat(cell.v) || 0) : 0;
        if (v > 0) { daily[dateStr] = Math.round(v * 100) / 100; totalMin += v; }
      }

      if (!parsed[currentRes]) parsed[currentRes] = [];
      parsed[currentRes].push({
        activityName: actName,
        dailyEfforts: daily,
        totalMinutes: Math.round(totalMin * 100) / 100,
        totalJours: Math.round(totalMin / 480 * 100) / 100
      });
    }

    _applyGHOData(parsed);

  } catch(err) {
    console.error('GHO parse error:', err);
    alert('Erreur lors de la lecture du fichier GHO : ' + err.message);
  }
}

/* ── Appliquer les données GHO aux ressources ── */
function _applyGHOData(parsed) {
  let created = 0, updated = 0;

  for (const [resName, activities] of Object.entries(parsed)) {
    /* Chercher la ressource existante (matching sur nom complet) */
    const nameLower = resName.toLowerCase();
    let res = resources.find(r => {
      const full = [r.prenom, r.nom].filter(Boolean).join(' ').toLowerCase();
      const fullRev = [r.nom, r.prenom].filter(Boolean).join(' ').toLowerCase();
      return full === nameLower || fullRev === nameLower;
    });

    if (!res) {
      /* Créer la ressource sans profession */
      const parts = resName.split(' ');
      /* Heuristique : MAJUSCULE = nom de famille */
      const nomParts = parts.filter(p => p === p.toUpperCase() && p.length > 1);
      const prenomParts = parts.filter(p => !nomParts.includes(p));
      const newRes = {
        id: genResId(),
        nom: nomParts.join(' ') || parts[0],
        prenom: prenomParts.join(' ') || '',
        profession: '',
        ghoActivities: activities
      };
      resources.push(newRes);
      created++;
    } else {
      res.ghoActivities = activities;
      updated++;
    }
  }

  saveResources();
  _refreshCalendar();
  renderResourceList && renderResourceList();

  const msg = `✓ Import GHO terminé\n${updated} ressource(s) mise(s) à jour\n${created} ressource(s) créée(s)`;
  /* Toast non-bloquant */
  _showGHOToast(msg);
}

function _showGHOToast(msg) {
  let toast = document.getElementById('ghoToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ghoToast';
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:12px 18px;border-radius:8px;font-size:12px;z-index:9999;white-space:pre-line;box-shadow:0 4px 16px #0004';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
}

/* ── Charge GHO pour une ressource un jour donné (en jours) ── */
function getGHOChargeForDay(res, date) {
  if (!res.ghoActivities) return 0;
  const dateStr = date.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'});
  let total = 0;
  for (const act of res.ghoActivities) {
    total += act.dailyEfforts[dateStr] || 0;
  }
  return total / 480; // convertit minutes → jours
}

/* ── Rendu des activités GHO dans le calendrier ── */
function renderGHOActivitiesCalendar(res, days, COL_W) {
  if (!res.ghoActivities || !res.ghoActivities.length) return '';

  const isCollapsed = ghoCollapsed[res.id] !== false; // réduit par défaut
  const activitiesWithEffort = res.ghoActivities.filter(a => a.totalMinutes > 0);
  if (!activitiesWithEffort.length) return '';

  /* Palette de couleurs pour les activités */
  const palette = ['#4e9af1','#f1884e','#4ef19a','#f14e7a','#c04ef1','#f1c94e','#4ed4f1','#f16b4e'];

  let html = `<div class="gho-acts-wrap">`;

  /* Ligne résumé (toujours visible) : bouton toggle */
  const totalJ = activitiesWithEffort.reduce((s,a)=>s+a.totalJours,0).toFixed(1);
  html += `<div class="gho-summary-row" style="width:${days.length*COL_W}px">
    <button class="gho-toggle" onclick="ghoToggle('${res.id}')">${isCollapsed?'▸':'▾'}</button>
    <span class="gho-summary-label">${activitiesWithEffort.length} projet(s) · ${totalJ}j</span>
  </div>`;

  if (!isCollapsed) {
    /* Une ligne par activité */
    activitiesWithEffort.forEach((act, ai) => {
      const color = palette[ai % palette.length];
      html += `<div class="gho-act-row" style="width:${days.length*COL_W}px">`;
      days.forEach(day => {
        const dateStr = day.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'});
        const min = act.dailyEfforts[dateStr] || 0;
        const j = min / 480;
        const isWE = day.getDay()===0 || day.getDay()===6;
        const isFerie = isJourFerie(day);
        const bg = (isWE||isFerie) ? 'var(--surface2)' : 'transparent';
        let cellHtml = '';
        if (j > 0) {
          const h = Math.min(Math.round(j * 100), 100);
          const label = j >= 0.1 ? (j >= 1 ? j.toFixed(0) : j.toFixed(1)) + 'j' : '';
          cellHtml = `<div class="gho-bar" style="height:${h}%;background:${color}88;border-top:2px solid ${color}" title="${act.activityName}: ${j.toFixed(2)}j">${label}</div>`;
        }
        html += `<div class="gho-act-cell" style="width:${COL_W}px;background:${bg}">${cellHtml}</div>`;
      });
      html += `</div>`;
      /* Label activité en superposition à gauche */
      html += `<div class="gho-act-label" title="${escH(act.activityName)}">
        <span style="color:${color};margin-right:4px">●</span>${escH(act.activityName)}
      </div>`;
    });
  }

  html += `</div>`;
  return html;
}

function ghoToggle(resId) {
  ghoCollapsed[resId] = (ghoCollapsed[resId] === false) ? true : false;
  _refreshCalendar();
}
