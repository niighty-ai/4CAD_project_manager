/* ═══════════════════════════════════════════════════════════════
   resources.js — Vue Ressources : tableau GHO-style
   Ressource | Activité | J1 | J2 | ... | J365
   ═══════════════════════════════════════════════════════════════ */

/* ── État global ressources ── */
const RESOURCES_KEY = 'gantt4cad_resources';
let resources = [];

/* ── Collapse state : set of resource IDs that are expanded ── */
const _resExpanded = new Set();

/* ── Année affichée ── */
let _resYear = new Date().getFullYear();

/* ══════════════════════════════════
   CRUD ressources (inchangé)
   ══════════════════════════════════ */
function saveResources() {
  try { localStorage.setItem(RESOURCES_KEY, JSON.stringify(resources)); } catch(e) {}
  if (typeof scheduleFirebaseSaveResources === 'function') scheduleFirebaseSaveResources();
}

function loadResources() {
  try {
    const raw = localStorage.getItem(RESOURCES_KEY);
    if (raw) resources = JSON.parse(raw);
  } catch(e) { resources = []; }
}

function genResId() {
  return 'r_' + Math.random().toString(36).slice(2, 9);
}

function addResource(nom, prenom, profession) {
  if (!nom && !prenom) return false;
  resources.push({ id: genResId(), nom, prenom, profession });
  saveResources();
  return true;
}

function updateResource(id, nom, prenom, profession) {
  const r = resources.find(r => r.id === id);
  if (!r) return false;
  r.nom = nom; r.prenom = prenom; r.profession = profession;
  saveResources();
  return true;
}

function deleteResource(id) {
  resources = resources.filter(r => r.id !== id);
  saveResources();
}

function getInitials(prenom, nom) {
  const p = (prenom||'').trim()[0]||'';
  const n = (nom||'').trim()[0]||'';
  return (p + n).toUpperCase() || '?';
}

/* ══════════════════════════════════
   HELPERS JOURS
   ══════════════════════════════════ */
function _getDaysOfYear(year) {
  const days = [];
  const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function _dayKey(date) {
  // Format "DD/MM/YYYY" — matches GHO import keys
  const dd = String(date.getDate()).padStart(2,'0');
  const mm = String(date.getMonth()+1).padStart(2,'0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function _isWE(date) { return date.getDay()===0 || date.getDay()===6; }
function _isToday(date) {
  const t = new Date(); t.setHours(0,0,0,0);
  return date.getTime() === t.getTime();
}

/* ══════════════════════════════════
   RENDU PRINCIPAL
   ══════════════════════════════════ */
function renderResourcesView() {
  const container = document.getElementById('viewRessources');
  if (!container) return;
  container.innerHTML = _buildResViewHTML();
  _attachResEvents();
}

function _refreshResView() {
  const container = document.getElementById('viewRessources');
  if (!container) return;
  container.innerHTML = _buildResViewHTML();
  _attachResEvents();
}

function _buildResViewHTML() {
  const days = _getDaysOfYear(_resYear);
  const today = new Date(); today.setHours(0,0,0,0);
  const COL_W = 34; // px per day column

  /* ── Header toolbar ── */
  let html = `<div class="gho-wrap">
    <div class="gho-toolbar">
      <span class="gho-title">👤 Ressources</span>
      <div class="gho-toolbar-actions">
        <button class="gho-btn-year" onclick="_resYear--;_refreshResView()">‹ ${_resYear-1}</button>
        <span class="gho-year-label">${_resYear}</span>
        <button class="gho-btn-year" onclick="_resYear++;_refreshResView()">${_resYear+1} ›</button>
        <button class="gho-btn-import" onclick="triggerGHOImport()" title="Importer charges GHO (xlsx)">↑ Import GHO</button>
        <button class="gho-btn-add" onclick="openResDialog()" title="Nouvelle ressource">+ Ressource</button>
      </div>
    </div>`;

  /* ── Table ── */
  html += `<div class="gho-table-wrap">
    <table class="gho-table" style="--col-w:${COL_W}px">
      <thead>
        <tr class="gho-thead-months">
          <th class="gho-th-res" rowspan="2">Ressource</th>
          <th class="gho-th-act" rowspan="2">Activité / Projet</th>
          ${_buildMonthHeaders(days, COL_W)}
        </tr>
        <tr class="gho-thead-days">
          ${days.map(d => {
            const isWE = _isWE(d);
            const isTd = _isToday(d);
            const lbl = ['D','L','M','M','J','V','S'][d.getDay()];
            let cls = 'gho-th-day';
            if (isTd) cls += ' today';
            else if (isWE) cls += ' weekend';
            return `<th class="${cls}" style="min-width:${COL_W}px;width:${COL_W}px" title="${_dayKey(d)}">${d.getDate()}<br><span class="gho-dl">${lbl}</span></th>`;
          }).join('')}
        </tr>
      </thead>
      <tbody>`;

  /* ── Rows per resource ── */
  if (!resources.length) {
    html += `<tr><td colspan="${days.length+2}" class="gho-empty">Aucune ressource — cliquez "+ Ressource" pour commencer.</td></tr>`;
  } else {
    resources.forEach(r => {
      const fullName = [r.prenom, r.nom].filter(Boolean).join(' ') || '—';
      const acts = (r.ghoData?.activities || []).filter(a => Object.values(a.daily).some(v=>v>0));
      const isExp = _resExpanded.has(r.id);

      /* Build daily totals across all activities */
      const dayTotals = {};
      acts.forEach(a => {
        Object.entries(a.daily).forEach(([k,v]) => {
          dayTotals[k] = (dayTotals[k]||0) + v;
        });
      });

      /* ── Resource summary row ── */
      html += `<tr class="gho-row-res" onclick="_toggleRes('${r.id}')">
        <td class="gho-td-res">
          <span class="gho-toggle">${acts.length ? (isExp?'▾':'▸') : '·'}</span>
          <span class="gho-avatar">${getInitials(r.prenom, r.nom)}</span>
          <span class="gho-res-name">${escH(fullName)}</span>
          <span class="gho-res-actions" onclick="event.stopPropagation()">
            <button class="gho-btn-edit" onclick="openResDialog('${r.id}')" title="Modifier">✎</button>
            <button class="gho-btn-del" onclick="confirmDeleteResource('${r.id}')" title="Supprimer">🗑</button>
          </span>
        </td>
        <td class="gho-td-act gho-td-act-total">
          ${r.ghoData?.importDate ? `<span class="gho-import-date">↑ ${r.ghoData.importDate}</span>` : ''}
          ${acts.length ? `<span class="gho-act-count">${acts.length} projet${acts.length>1?'s':''}</span>` : '<span class="gho-no-data">Aucune donnée GHO</span>'}
        </td>
        ${days.map(d => {
          const v = dayTotals[_dayKey(d)] || 0;
          const jours = v / 480;
          return `<td class="gho-td-day${_isWE(d)?' we':''}${_isToday(d)?' today':''}">${jours > 0 ? _fmtJ(jours) : ''}</td>`;
        }).join('')}
      </tr>`;

      /* ── Activity rows (visible when expanded) ── */
      if (isExp && acts.length) {
        acts.forEach(a => {
          html += `<tr class="gho-row-act">
            <td class="gho-td-res gho-td-res-empty"></td>
            <td class="gho-td-act" title="${escH(a.name)}">${escH(a.name)}</td>
            ${days.map(d => {
              const v = a.daily[_dayKey(d)] || 0;
              const jours = v / 480;
              return `<td class="gho-td-day${_isWE(d)?' we':''}${_isToday(d)?' today':''}">${jours > 0 ? _fmtJ(jours) : ''}</td>`;
            }).join('')}
          </tr>`;
        });
      }
    });
  }

  html += `</tbody></table></div>`;

  /* ── Dialog création/édition ressource (hidden) ── */
  html += _buildResDialog();

  html += `</div>`; // gho-wrap
  return html;
}

function _buildMonthHeaders(days, colW) {
  /* Group days by month, output one <th> per month spanning N days */
  const months = [];
  days.forEach(d => {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    if (!months.length || months[months.length-1].key !== key) {
      months.push({ key, label, count: 1 });
    } else {
      months[months.length-1].count++;
    }
  });
  return months.map(m =>
    `<th class="gho-th-month" colspan="${m.count}" style="min-width:${m.count*colW}px">${m.label}</th>`
  ).join('');
}

function _fmtJ(jours) {
  /* Format charge in jours, with color class */
  const v = Math.round(jours * 100) / 100;
  const txt = v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/,'');
  let cls = 'gho-cell';
  if (jours >= 1) cls += ' c-over';
  else if (jours >= 0.5) cls += ' c-high';
  else cls += ' c-low';
  return `<span class="${cls}">${txt}</span>`;
}

function _toggleRes(id) {
  if (_resExpanded.has(id)) _resExpanded.delete(id);
  else _resExpanded.add(id);
  _refreshResView();
  /* Scroll to keep today visible */
  _scrollToToday();
}

function _scrollToToday() {
  setTimeout(() => {
    const td = document.querySelector('.gho-td-day.today');
    if (td) td.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, 50);
}

/* ══════════════════════════════════
   DIALOG RESSOURCE (création/édition)
   ══════════════════════════════════ */
let _editingResId = null;

function _buildResDialog() {
  return `<div class="gho-dialog-backdrop" id="resDialogBackdrop" style="display:none" onclick="closeResDialog()">
    <div class="gho-dialog" onclick="event.stopPropagation()">
      <div class="gho-dialog-title" id="resDialogTitle">Nouvelle ressource</div>
      <div class="gho-dialog-body">
        <label class="gho-dlg-label">Nom</label>
        <input class="gho-dlg-input" id="resDlgNom" placeholder="Nom de famille">
        <label class="gho-dlg-label">Prénom</label>
        <input class="gho-dlg-input" id="resDlgPrenom" placeholder="Prénom">
        <label class="gho-dlg-label">Profession</label>
        <input class="gho-dlg-input" id="resDlgProf" placeholder="Ex: Développeur, Chef de projet…">
      </div>
      <div class="gho-dialog-footer">
        <button class="gho-dlg-cancel" onclick="closeResDialog()">Annuler</button>
        <button class="gho-dlg-save" onclick="saveResDialog()">✓ Enregistrer</button>
      </div>
    </div>
  </div>`;
}

function openResDialog(id) {
  _editingResId = id || null;
  const backdrop = document.getElementById('resDialogBackdrop');
  if (!backdrop) return;
  const r = id ? resources.find(x => x.id === id) : null;
  document.getElementById('resDialogTitle').textContent = r ? '✎ Modifier la ressource' : 'Nouvelle ressource';
  document.getElementById('resDlgNom').value = r?.nom || '';
  document.getElementById('resDlgPrenom').value = r?.prenom || '';
  document.getElementById('resDlgProf').value = r?.profession || '';
  backdrop.style.display = 'flex';
  setTimeout(() => document.getElementById('resDlgNom').focus(), 50);
}

function closeResDialog() {
  const b = document.getElementById('resDialogBackdrop');
  if (b) b.style.display = 'none';
  _editingResId = null;
}

function saveResDialog() {
  const nom    = document.getElementById('resDlgNom').value.trim();
  const prenom = document.getElementById('resDlgPrenom').value.trim();
  const prof   = document.getElementById('resDlgProf').value.trim();
  if (!nom && !prenom) { document.getElementById('resDlgNom').focus(); return; }
  if (_editingResId) {
    updateResource(_editingResId, nom, prenom, prof);
  } else {
    addResource(nom, prenom, prof);
  }
  closeResDialog();
  _refreshResView();
}

function confirmDeleteResource(id) {
  const r = resources.find(x => x.id === id);
  const name = r ? [r.prenom, r.nom].filter(Boolean).join(' ') : id;
  if (!confirm(`Supprimer la ressource "${name}" ?`)) return;
  deleteResource(id);
  _resExpanded.delete(id);
  _refreshResView();
}

function _attachResEvents() {
  /* Keyboard on dialog */
  document.querySelectorAll('.gho-dlg-input').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveResDialog();
      if (e.key === 'Escape') closeResDialog();
    });
  });
  /* Scroll to today on load */
  _scrollToToday();
}

/* ══════════════════════════════════
   IMPORT GHO EXCEL (SheetJS)
   ══════════════════════════════════ */
function triggerGHOImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => parseGHOExcel(evt.target.result);
    reader.readAsArrayBuffer(file);
  };
  input.click();
}

function parseGHOExcel(buffer) {
  try {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS non disponible — vérifiez le chargement de la librairie.');
      return;
    }
    const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    /* Row 12 (index 11) = dates, col E+ (index 4+) */
    const DATE_ROW = 11;
    const DATA_START = 13;
    const COL_RES = 1, COL_ACT = 2, COL_FIRST = 4;

    const dateRow = raw[DATE_ROW] || [];
    const dates = [];
    for (let c = COL_FIRST; c < dateRow.length; c++) {
      const v = dateRow[c];
      if (v != null) dates.push({ col: c, label: String(v).trim() });
    }
    if (!dates.length) { alert('Format GHO non reconnu — ligne 12 vide.'); return; }

    /* Parse data rows */
    const parsed = {}; // { resName → { actName → { dateLabel → minutes } } }
    let curRes = null;
    for (let ri = DATA_START; ri < raw.length; ri++) {
      const row = raw[ri];
      if (!row) continue;
      const resCell = row[COL_RES];
      const actCell = row[COL_ACT];
      if (resCell != null && String(resCell).trim()) curRes = String(resCell).trim();
      if (!curRes || actCell == null || !String(actCell).trim()) continue;
      const actName = String(actCell).trim();
      if (!parsed[curRes]) parsed[curRes] = {};
      if (!parsed[curRes][actName]) parsed[curRes][actName] = {};
      dates.forEach(({ col, label }) => {
        const v = row[col];
        const mins = (v != null && !isNaN(parseFloat(v))) ? parseFloat(v) : 0;
        if (mins > 0) {
          parsed[curRes][actName][label] = Math.round(((parsed[curRes][actName][label]||0) + mins) * 100) / 100;
        }
      });
    }

    const now = new Date();
    const importDate = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
    let created = 0, updated = 0;

    Object.entries(parsed).forEach(([resName, actMap]) => {
      const hasData = Object.values(actMap).some(d => Object.values(d).some(v=>v>0));
      if (!hasData) return;
      let res = _findResouceByName(resName);
      if (!res) {
        /* Créer la ressource : détecter NOM (majuscules) et prénom */
        const parts = resName.split(' ');
        const nomParts   = parts.filter(p => p.length>1 && p === p.toUpperCase() && !/\d/.test(p));
        const prenomParts = parts.filter(p => !nomParts.includes(p));
        res = { id: genResId(), nom: nomParts.join(' ')||parts[parts.length-1], prenom: prenomParts.join(' '), profession: '' };
        resources.push(res);
        created++;
      } else { updated++; }

      const activities = Object.entries(actMap)
        .map(([name, daily]) => ({ name, daily }))
        .filter(a => Object.values(a.daily).some(v=>v>0));
      res.ghoData = { importDate, activities };
    });

    saveResources();
    _refreshResView();
    alert(`Import GHO ✓\n• ${created} ressource(s) créée(s)\n• ${updated} mise(s) à jour`);
  } catch(err) {
    console.error('GHO import error:', err);
    alert('Erreur import GHO : ' + err.message);
  }
}

function _findResouceByName(fullName) {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const t = norm(fullName);
  return resources.find(r => {
    const a = norm([r.prenom, r.nom].filter(Boolean).join(' '));
    const b = norm([r.nom, r.prenom].filter(Boolean).join(' '));
    return a===t || b===t;
  }) || null;
}

/* ══════════════════════════════════
   INIT
   ══════════════════════════════════ */
function initResources() {
  loadResources();
}

/* Legacy aliases used elsewhere */
function renderResourceCalendarView() { _refreshResView(); }
function openResourceForm() { openResDialog(); }
function openResourceEdit(id) { openResDialog(id); }
function getChargeForResourceDay(resourceId, date) {
  const r = resources.find(x => x.id === resourceId);
  if (!r || !r.ghoData) return 0;
  const key = _dayKey(date);
  return (r.ghoData.activities||[]).reduce((s,a) => s+(a.daily[key]||0), 0);
}
