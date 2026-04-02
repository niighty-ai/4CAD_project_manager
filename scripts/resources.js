/* ═══════════════════════════════════════════════════════════════
   resources.js — Vue Ressources : tableau GHO-style
   Ressource | Activité | J1 | J2 | ... | J365
   ═══════════════════════════════════════════════════════════════ */

/* ── État global ressources ── */
const RESOURCES_KEY = 'gantt4cad_resources';
let resources = [];

/* ── Collapse state : set of resource IDs that are expanded ── */
const _resExpanded = new Set();
let _resFilter = '';     // filtre texte recherche

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
function _isFerie(date) {
  /* Jours fériés français fixes */
  const m = date.getMonth()+1, d = date.getDate();
  if (m===1  && d===1)  return true; // Jour de l'An
  if (m===5  && d===1)  return true; // Fête du Travail
  if (m===5  && d===8)  return true; // Victoire 1945
  if (m===7  && d===14) return true; // Fête Nationale
  if (m===8  && d===15) return true; // Assomption
  if (m===11 && d===1)  return true; // Toussaint
  if (m===11 && d===11) return true; // Armistice
  if (m===12 && d===25) return true; // Noël
  /* Pâques (algo Meeus/Jones/Butcher) */
  const y = date.getFullYear();
  const a=y%19,b=Math.floor(y/100),c=y%100,d2=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d2-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7;
  const mm=Math.floor((a+11*h+22*l)/451);
  const mo=Math.floor((h+l-7*mm+114)/31);
  const dd=(h+l-7*mm+114)%31+1;
  const easter = new Date(y,mo-1,dd);
  const lundiPaques = new Date(easter); lundiPaques.setDate(easter.getDate()+1);
  const ascension  = new Date(easter); ascension.setDate(easter.getDate()+39);
  const pentecote  = new Date(easter); pentecote.setDate(easter.getDate()+49);
  const lundiPent  = new Date(easter); lundiPent.setDate(easter.getDate()+50);
  const t = date.getTime();
  return t===lundiPaques.getTime() || t===ascension.getTime() ||
         t===pentecote.getTime()   || t===lundiPent.getTime();
}
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
  const _lastImport = resources.reduce((best,r) => r.ghoData?.importDate && r.ghoData.importDate>best ? r.ghoData.importDate : best, '');
  let html = `<div class="gho-wrap">
    <div class="gho-toolbar">
      <span class="gho-title">👤 Ressources</span>
      <div class="gho-toolbar-actions">
        <button class="gho-btn-year" onclick="_resYear--;_refreshResView()">‹ ${_resYear-1}</button>
        <span class="gho-year-label">${_resYear}</span>
        <button class="gho-btn-year" onclick="_resYear++;_refreshResView()">${_resYear+1} ›</button>
        ${_lastImport ? `<span class="gho-last-import">↑ GHO : ${_lastImport}</span>` : ''}
        <button class="gho-btn-import" onclick="triggerGHOImport()" title="Importer charges GHO (xlsx)">↑ Import GHO</button>
        <button class="gho-btn-add" onclick="openResDialog()" title="Nouvelle ressource">+ Ressource</button>
      </div>
    </div>`;

  /* ── Layout: left header + right header (fixed) + shared vertical scroll body ── */
  const RES_W = 200, ACT_W = 240;
  const leftHeadH = 48; // px — single header row height

  html += `<div class="gho-panels" id="ghoPanels">

    <!-- Fixed header row (outside scroll) -->
    <div class="gho-headers-row">
      <!-- Left headers -->
      <div class="gho-left-head" style="width:${RES_W+ACT_W}px">
        <table class="gho-left-table" style="table-layout:fixed;width:${RES_W+ACT_W}px">
          <colgroup>
            <col style="width:${RES_W}px">
            <col style="width:${ACT_W}px">
          </colgroup>
          <tbody>
            <tr>
              <th class="gho-th-res">
                RESSOURCE
                <input class="gho-search" placeholder="🔍 Rechercher…" value="${_resFilter}"
                  oninput="_resFilter=this.value;_refreshTbody()" autocomplete="off"
                  onclick="event.stopPropagation()">
              </th>
              <th class="gho-th-act">ACTIVITÉ / PROJET</th>
            </tr>
          </tbody>
        </table>
      </div>
      <!-- Right headers (scrollable horizontally) -->
      <div class="gho-right-head-wrap" id="ghoRightHead">
        <table class="gho-right-table" style="table-layout:fixed;width:${days.length*COL_W}px">
          <colgroup>${days.map(()=>`<col style="width:${COL_W}px">`).join('')}</colgroup>
          <tbody>
            <tr class="gho-thead-months">${_buildMonthHeaders(days, COL_W)}</tr>
            <tr class="gho-thead-days">
              ${days.map(d => {
                const isTd = _isToday(d);
                const lbl = ['D','L','M','M','J','V','S'][d.getDay()];
                let cls = 'gho-th-day';
                if (isTd) cls += ' today';
                else if (_isFerie(d)) cls += ' ferie';
                else if (_isWE(d)) cls += ' weekend';
                return `<th class="${cls}" title="${_dayKey(d)}">${d.getDate()}<br><span class="gho-dl">${lbl}</span></th>`;
              }).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Shared vertical scroll area -->
    <div class="gho-body-scroll" id="ghoBodyScroll">
      <!-- Left body (fixed width, no horizontal scroll) -->
      <div class="gho-left-body" style="width:${RES_W+ACT_W}px">
        <table class="gho-left-table" style="table-layout:fixed;width:${RES_W+ACT_W}px">
          <colgroup>
            <col style="width:${RES_W}px">
            <col style="width:${ACT_W}px">
          </colgroup>
          <tbody id="ghoLeftBody">${_buildLeftRows()}</tbody>
        </table>
      </div>
      <!-- Right body (scrollable horizontally, synced with header) -->
      <div class="gho-right-body-wrap" id="ghoRightBody">
        <table class="gho-right-table" style="table-layout:fixed;width:${days.length*COL_W}px">
          <colgroup>${days.map(()=>`<col style="width:${COL_W}px">`).join('')}</colgroup>
          <tbody id="ghoRightBodyTbody">${_buildRightRows(days)}</tbody>
        </table>
      </div>
    </div>

  </div>`;


  /* ── Dialog création/édition ressource (hidden) ── */
  html += _buildResDialog();

  html += `</div>`; // gho-wrap
  return html;
}

/* ── Filtered resource list ── */
function _filteredResources() {
  if (!_resFilter) return resources;
  const f = _resFilter.toLowerCase();
  return resources.filter(r => [r.prenom, r.nom].join(' ').toLowerCase().includes(f));
}

/* ── Left panel rows (Ressource + Activité/Projet cols) ── */
function _buildLeftRows() {
  const fr = _filteredResources();
  if (!fr.length) {
    return `<tr><td colspan="2" class="gho-empty">${
      resources.length ? 'Aucune ressource trouvée.' : 'Aucune ressource.'
    }</td></tr>`;
  }
  return fr.map(r => {
    const fullName = [r.prenom, r.nom].filter(Boolean).join(' ') || '—';
    const acts = (r.ghoData?.activities || []).filter(a => Object.values(a.daily).some(v=>v>0));
    const isExp = _resExpanded.has(r.id);
    let rows = `<tr class="gho-row-res" data-rid="${r.id}">
      <td class="gho-td-res">
        <div class="gho-td-res-inner">
          <span class="gho-avatar">${getInitials(r.prenom, r.nom)}</span>
          <span class="gho-res-name">${escH(fullName)}</span>
          <span class="gho-res-actions">
            <button class="gho-btn-edit" onclick="openResDialog('${r.id}')" title="Modifier">✎</button>
            <button class="gho-btn-del" onclick="confirmDeleteResource('${r.id}')" title="Supprimer">🗑</button>
          </span>
        </div>
      </td>
      <td class="gho-td-act gho-td-act-total" onclick="_toggleRes('${r.id}')">
        <span class="gho-toggle">${acts.length ? (isExp?'▾':'▸') : '·'}</span>
        ${acts.length
          ? `<span class="gho-act-count">${acts.length}&nbsp;projet${acts.length>1?'s':''}</span>`
          : '<span class="gho-no-data">—</span>'}
      </td>
    </tr>`;
    if (isExp) acts.forEach(a => {
      rows += `<tr class="gho-row-act" data-rid="${r.id}">
        <td class="gho-td-res gho-td-res-empty"></td>
        <td class="gho-td-act gho-td-act-name" title="${escH(a.name)}">${escH(a.name)}</td>
      </tr>`;
    });
    return rows;
  }).join('');
}

/* ── Right panel rows (day cols only) ── */
function _buildRightRows(days) {
  const fr = _filteredResources();
  if (!fr.length) return `<tr><td colspan="${days.length}" class="gho-empty"></td></tr>`;
  return fr.map(r => {
    const acts = (r.ghoData?.activities || []).filter(a => Object.values(a.daily).some(v=>v>0));
    const isExp = _resExpanded.has(r.id);
    const dayTotals = {};
    acts.forEach(a => Object.entries(a.daily).forEach(([k,v]) => {
      dayTotals[k] = (dayTotals[k]||0) + v;
    }));
    const mkDay = (vals, d) => {
      const jours = (vals[_dayKey(d)] || 0) / 480;
      const dc = _isToday(d)?' today':(_isFerie(d)?' ferie':(_isWE(d)?' we':''));
      return `<td class="gho-td-day${dc}">${jours > 0 ? _fmtJ(jours) : ''}</td>`;
    };
    let rows = `<tr class="gho-row-res" data-rid="${r.id}">
      ${days.map(d => mkDay(dayTotals, d)).join('')}
    </tr>`;
    if (isExp) acts.forEach(a => {
      rows += `<tr class="gho-row-act" data-rid="${r.id}">
        ${days.map(d => mkDay(a.daily, d)).join('')}
      </tr>`;
    });
    return rows;
  }).join('');
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
  _refreshTbody(); // partial refresh — no scroll reset
}

/* Partial refresh: rebuild both panel tbodies (preserves scroll + focus) */
function _refreshTbody() {
  const leftBody  = document.getElementById('ghoLeftBody');
  const rightBody = document.getElementById('ghoRightBodyTbody');
  if (!leftBody || !rightBody) { _refreshResView(); return; }
  const days = _getDaysOfYear(_resYear);
  leftBody.innerHTML  = _buildLeftRows();
  rightBody.innerHTML = _buildRightRows(days);
}

function _syncRowHeights() {
  /* Match row heights between left and right panels */
  const leftRows  = document.querySelectorAll('#ghoLeft  tbody tr, #ghoLeft  thead tr');
  const rightRows = document.querySelectorAll('#ghoRight tbody tr, #ghoRight thead tr');
  /* Reset heights first */
  leftRows.forEach(r  => r.style.height = '');
  rightRows.forEach(r => r.style.height = '');
  /* Apply max height to paired rows */
  const len = Math.min(leftRows.length, rightRows.length);
  for (let i = 0; i < len; i++) {
    const h = Math.max(leftRows[i].getBoundingClientRect().height,
                       rightRows[i].getBoundingClientRect().height);
    leftRows[i].style.height  = h + 'px';
    rightRows[i].style.height = h + 'px';
  }
}

function _scrollToToday() {
  setTimeout(() => {
    const rightBody = document.getElementById('ghoRightBody');
    const th = document.querySelector('#ghoRightHead th.gho-th-day.today');
    if (rightBody && th) {
      const rRect = rightBody.getBoundingClientRect();
      const tRect = th.getBoundingClientRect();
      const offset = tRect.left - rRect.left + rightBody.scrollLeft - rightBody.clientWidth / 2 + tRect.width / 2;
      rightBody.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
    }
  }, 100);
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

  /* Sync horizontal scroll between right header and right body */
  const rightHead = document.getElementById('ghoRightHead');
  const rightBody = document.getElementById('ghoRightBody');
  if (rightHead && rightBody) {
    rightBody.addEventListener('scroll', () => {
      rightHead.scrollLeft = rightBody.scrollLeft;
    });
  }

  /* Drag-scroll on right body (horizontal) */
  if (rightBody) {
    let isDragging = false, startX = 0, startScrollLeft = 0;
    rightBody.addEventListener('mousedown', e => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      isDragging = true;
      startX = e.pageX - rightBody.offsetLeft;
      startScrollLeft = rightBody.scrollLeft;
      rightBody.style.cursor = 'grabbing';
      e.preventDefault();
    });
    document.addEventListener('mouseup', () => {
      isDragging = false;
      if (rightBody) rightBody.style.cursor = '';
    });
    document.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const x = e.pageX - rightBody.offsetLeft;
      rightBody.scrollLeft = startScrollLeft - (x - startX);
    });
  }

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
