/* ═══════════════════════════════════════════════════════════════
   resources.js — Vue Ressources : tableau GHO-style
   Ressource | Activité | J1 | J2 | ... | J365
   ═══════════════════════════════════════════════════════════════ */

/* ── État global ressources ── */
const RESOURCES_KEY = 'gantt4cad_resources';
let resources = [];

/* ── Firebase ressources ── */
let _fbResSaveTimer   = null;
let _fbResSaving      = false;
let _fbResInitLoaded  = false;
let _fbResLastSaveTs  = 0;

/* ── Collapse state : set of resource IDs that are expanded ── */
const _resExpanded = new Set();
let _resFilter     = '';           // filtre texte recherche
let _resTypeFilter = 'Employee';   // filtre type de ressource (défaut : Employee)

/* ── Année affichée ── */
let _resYear = new Date().getFullYear();

/* ── Caches mémoire ── */
const _daysCache  = {}; // year → Date[]
const _ferieCache = {}; // year → Set<timestamp>

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


function getInitials(prenom, nom) {
  const p = (prenom||'').trim()[0]||'';
  const n = (nom||'').trim()[0]||'';
  return (p + n).toUpperCase() || '?';
}

/* ══════════════════════════════════
   HELPERS JOURS
   ══════════════════════════════════ */
function _getDaysOfYear(year) {
  if (_daysCache[year]) return _daysCache[year];
  const days = [];
  const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return (_daysCache[year] = days);
}

function _dayKey(date) {
  // Format "DD/MM/YYYY" — matches GHO import keys
  const dd = String(date.getDate()).padStart(2,'0');
  const mm = String(date.getMonth()+1).padStart(2,'0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function _isWE(date) { return date.getDay()===0 || date.getDay()===6; }

/* Construit (et mémoïse) le Set des timestamps fériés pour une année */
function _getFeriesOfYear(year) {
  if (_ferieCache[year]) return _ferieCache[year];
  const s = new Set();
  const add = (m, d) => s.add(new Date(year, m-1, d).getTime());
  /* Fixes */
  add(1,1); add(5,1); add(5,8); add(7,14); add(8,15); add(11,1); add(11,11); add(12,25);
  /* Pâques (algo Meeus/Jones/Butcher) */
  const a=year%19,b=Math.floor(year/100),c=year%100,d2=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d2-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7;
  const mm=Math.floor((a+11*h+22*l)/451);
  const mo=Math.floor((h+l-7*mm+114)/31);
  const dd=(h+l-7*mm+114)%31+1;
  const easter = new Date(year,mo-1,dd);
  [1,39,49,50].forEach(offset => {
    const d = new Date(easter); d.setDate(easter.getDate()+offset);
    s.add(d.getTime());
  });
  return (_ferieCache[year] = s);
}

function _isFerie(date) {
  return _getFeriesOfYear(date.getFullYear()).has(date.getTime());
}
function _isToday(date) {
  const t = new Date(); t.setHours(0,0,0,0);
  return date.getTime() === t.getTime();
}

/* ══════════════════════════════════
   RENDU PRINCIPAL
   ══════════════════════════════════ */
function renderResourcesView() { _refreshResView(); }

function _refreshResView() {
  const container = document.getElementById('viewRessources');
  if (!container) return;
  container.innerHTML = _buildResViewHTML();
  _attachResEvents();
}

function _buildResViewHTML() {
  const days = _getDaysOfYear(_resYear);
  const COL_W = 34;
  const RES_W = 200, ACT_W = 240;

  const _lastImport = resources.reduce((best,r) =>
    r.ghoData?.importDate && r.ghoData.importDate > best ? r.ghoData.importDate : best, '');

  let html = `<div class="gho-wrap">
    <div class="gho-toolbar">
      <span class="gho-title">👤 Ressources</span>
      <div class="gho-toolbar-actions">
        <button class="gho-btn-year" onclick="_resYear--;_refreshResView()">‹ ${_resYear-1}</button>
        <span class="gho-year-label">${_resYear}</span>
        <button class="gho-btn-year" onclick="_resYear++;_refreshResView()">${_resYear+1} ›</button>
        ${_lastImport ? `<span class="gho-last-import">↑ GHO : ${_lastImport}</span>` : ''}
        <button class="gho-btn-import-list" onclick="triggerListImport()">↑ Import Liste</button>
        <button class="gho-btn-import" onclick="triggerGHOImport()">↑ Import GHO</button>
      </div>
    </div>
    <div class="gho-scroll-wrap" id="ghoScrollWrap">
      <table class="gho-table" style="width:${RES_W+ACT_W+days.length*COL_W}px">
        <colgroup>
          <col style="width:${RES_W}px">
          <col style="width:${ACT_W}px">
          ${days.map(()=>`<col style="width:${COL_W}px">`).join('')}
        </colgroup>
        <thead>
          <tr class="gho-thead-months">
            <th class="gho-th-res gho-sticky-res" rowspan="2">
              RESSOURCE
              <div class="gho-search-row">
                <input class="gho-search" placeholder="🔍 Rechercher…" value="${_resFilter}"
                  oninput="_resFilter=this.value;_refreshTbody()" autocomplete="off"
                  onclick="event.stopPropagation()">
                <select class="gho-type-filter" onclick="event.stopPropagation()"
                  onchange="_resTypeFilter=this.value;_refreshTbody()">
                  <option value="">Tous</option>
                  ${_resTypes().map(t =>
                    `<option value="${escH(t)}"${t===_resTypeFilter?' selected':''}>${escH(t)}</option>`
                  ).join('')}
                  ${!_resTypes().includes(_resTypeFilter) && _resTypeFilter
                    ? `<option value="${escH(_resTypeFilter)}" selected>${escH(_resTypeFilter)}</option>`
                    : ''}
                </select>
              </div>
            </th>
            <th class="gho-th-act gho-sticky-act" rowspan="2">ACTIVITÉ / PROJET</th>
            ${_buildMonthHeaders(days, COL_W)}
          </tr>
          <tr class="gho-thead-days">
            ${days.map(d => {
              const lbl = ['D','L','M','M','J','V','S'][d.getDay()];
              let cls = 'gho-th-day';
              if (_isToday(d))   cls += ' today';
              else if (_isFerie(d)) cls += ' ferie';
              else if (_isWE(d)) cls += ' weekend';
              return `<th class="${cls}" title="${_dayKey(d)}">${d.getDate()}<br><span class="gho-dl">${lbl}</span></th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody id="ghoTbody">${_buildRows(days)}</tbody>
      </table>
    </div>`;

  html += _buildResDialog();
  html += '</div>';
  return html;
}


/* ── Filtered resource list ── */
function _filteredResources() {
  let list = resources;
  /* Filtre par type */
  if (_resTypeFilter) {
    list = list.filter(r => (r.resourceType || '').toLowerCase() === _resTypeFilter.toLowerCase());
  }
  /* Filtre texte (nom, prénom, ID) */
  if (_resFilter) {
    const f = _resFilter.toLowerCase();
    list = list.filter(r =>
      [r.prenom, r.nom].join(' ').toLowerCase().includes(f) ||
      (r.externalId || '').toLowerCase().includes(f)
    );
  }
  return list;
}

/* ── Liste triée des types uniques dans resources[] ── */
function _resTypes() {
  return [...new Set(resources.map(r => r.resourceType || '').filter(Boolean))].sort();
}

/* ── Single table rows: res col + act col + all day cols ── */
function _buildRows(days) {
  const fr = _filteredResources();
  if (!fr.length) {
    return `<tr><td colspan="${days.length+2}" class="gho-empty">${
      resources.length ? 'Aucune ressource trouvée.' : 'Aucune ressource — cliquez "+ Ressource".'
    }</td></tr>`;
  }

  /* Pré-calcul des métadonnées par jour (1×365 au lieu de N×365) */
  const todayT = (() => { const t = new Date(); t.setHours(0,0,0,0); return t.getTime(); })();
  const feries = _getFeriesOfYear(_resYear);
  const dayMeta = days.map(d => {
    const t = d.getTime();
    const key = _dayKey(d);
    const day = d.getDay();
    let dc = '';
    if (t === todayT) dc = ' today';
    else if (feries.has(t)) dc = ' ferie';
    else if (day === 0 || day === 6) dc = ' we';
    return { key, dc };
  });

  const mkDay = (vals, meta) => {
    const jours = (vals[meta.key]||0) / 480;
    return `<td class="gho-td-day${meta.dc}">${jours>0 ? _fmtJ(jours) : ''}</td>`;
  };

  return fr.map(r => {
    const fullName = [r.prenom, r.nom].filter(Boolean).join(' ') || '—';
    const acts = (r.ghoData?.activities || []).filter(a => Object.values(a.daily).some(v=>v>0));
    const isExp = _resExpanded.has(r.id);
    const dayTotals = {};
    acts.forEach(a => Object.entries(a.daily).forEach(([k,v]) => {
      dayTotals[k] = (dayTotals[k]||0) + v;
    }));
    /* Resource summary row */
    let rows = `<tr class="gho-row-res" data-rid="${r.id}">
      <td class="gho-td-res gho-sticky-res" onclick="openResInfo('${r.id}')" title="Voir les infos">
        <div class="gho-td-res-inner">
          <span class="gho-avatar">${getInitials(r.prenom, r.nom)}</span>
          <span class="gho-res-name">${escH(fullName)}</span>
        </div>
      </td>
      <td class="gho-td-act gho-td-act-total gho-sticky-act">
        <div class="gho-td-act-inner" onclick="_toggleRes('${r.id}')">
          <span class="gho-toggle">${acts.length?(isExp?'▾':'▸'):'·'}</span>
          ${acts.length
            ? `<span class="gho-act-count">${acts.length}&nbsp;projet${acts.length>1?'s':''}</span>`
            : '<span class="gho-no-data">—</span>'}
        </div>
      </td>
      ${dayMeta.map(m => mkDay(dayTotals, m)).join('')}
    </tr>`;
    /* Activity rows */
    if (isExp) acts.forEach(a => {
      rows += `<tr class="gho-row-act" data-rid="${r.id}">
        <td class="gho-td-res gho-td-res-empty gho-sticky-res"></td>
        <td class="gho-td-act gho-sticky-act">
          <div class="gho-td-act-name" title="${escH(a.name)}">${escH(a.name)}</div>
        </td>
        ${dayMeta.map(m => mkDay(a.daily, m)).join('')}
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

/* Partial refresh: only rebuild tbody (preserves scroll + focus) */
function _refreshTbody() {
  const tbody = document.getElementById('ghoTbody');
  if (!tbody) { _refreshResView(); return; }
  const days = _getDaysOfYear(_resYear);
  tbody.innerHTML = _buildRows(days);
}


function _scrollToToday() {
  setTimeout(() => {
    const wrap = document.getElementById('ghoScrollWrap');
    const th = document.querySelector('#ghoScrollWrap th.gho-th-day.today');
    if (wrap && th) {
      const wRect = wrap.getBoundingClientRect();
      const tRect = th.getBoundingClientRect();
      const offset = tRect.left - wRect.left + wrap.scrollLeft - wrap.clientWidth / 2 + tRect.width / 2;
      wrap.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
    }
  }, 100);
}

/* ══════════════════════════════════
   POPUP INFO RESSOURCE (lecture seule)
   ══════════════════════════════════ */
function _buildResDialog() {
  /* Remplacé par un popup lecture seule — les ressources sont gérées par import uniquement */
  return `<div class="gho-dialog-backdrop" id="resInfoBackdrop" style="display:none" onclick="closeResInfo()">
    <div class="gho-dialog" onclick="event.stopPropagation()">
      <div class="gho-dialog-title" id="resInfoTitle">Ressource</div>
      <div class="gho-dialog-body">
        <div id="resInfoIdRow" style="display:none">
          <label class="gho-dlg-label">ID</label>
          <input class="gho-dlg-input gho-dlg-input-id" id="resInfoId" readonly tabindex="-1">
        </div>
        <label class="gho-dlg-label">Prénom</label>
        <input class="gho-dlg-input gho-dlg-input-id" id="resInfoPrenom" readonly tabindex="-1">
        <label class="gho-dlg-label">Nom</label>
        <input class="gho-dlg-input gho-dlg-input-id" id="resInfoNom" readonly tabindex="-1">
        <label class="gho-dlg-label">Profession / Rôle</label>
        <input class="gho-dlg-input gho-dlg-input-id" id="resInfoProf" readonly tabindex="-1">
        <label class="gho-dlg-label">Type de ressource</label>
        <input class="gho-dlg-input gho-dlg-input-id" id="resInfoType" readonly tabindex="-1">
      </div>
      <div class="gho-dialog-footer">
        <button class="gho-dlg-save" onclick="closeResInfo()">Fermer</button>
      </div>
    </div>
  </div>`;
}

function openResInfo(id) {
  const backdrop = document.getElementById('resInfoBackdrop');
  if (!backdrop) return;
  const r = resources.find(x => x.id === id);
  if (!r) return;
  document.getElementById('resInfoTitle').textContent =
    [r.prenom, r.nom].filter(Boolean).join(' ') || '—';
  document.getElementById('resInfoPrenom').value = r.prenom       || '—';
  document.getElementById('resInfoNom').value    = r.nom          || '—';
  document.getElementById('resInfoProf').value   = r.profession   || '—';
  document.getElementById('resInfoType').value   = r.resourceType || '—';
  const idRow = document.getElementById('resInfoIdRow');
  if (r.externalId) {
    document.getElementById('resInfoId').value = r.externalId;
    idRow.style.display = '';
  } else {
    idRow.style.display = 'none';
  }
  backdrop.style.display = 'flex';
}

function closeResInfo() {
  const b = document.getElementById('resInfoBackdrop');
  if (b) b.style.display = 'none';
}

function _attachResEvents() {
  /* Fermer le popup info avec Escape */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeResInfo();
  }, { once: true });

  /* Drag-scroll on the single table wrapper */
  const wrap = document.getElementById('ghoScrollWrap');
  if (wrap) {
    let isDragging = false, startX = 0, startY = 0, startSL = 0, startST = 0;
    wrap.addEventListener('mousedown', e => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      isDragging = true;
      startX = e.pageX; startY = e.pageY;
      startSL = wrap.scrollLeft; startST = wrap.scrollTop;
      wrap.style.cursor = 'grabbing';
      e.preventDefault();
    });
    document.addEventListener('mouseup', () => {
      isDragging = false;
      if (wrap) wrap.style.cursor = '';
    });
    document.addEventListener('mousemove', e => {
      if (!isDragging) return;
      wrap.scrollLeft = startSL - (e.pageX - startX);
      wrap.scrollTop  = startST - (e.pageY - startY);
    });
  }

  /* Scroll to today on load */
  _scrollToToday();
}

/* ══════════════════════════════════
   IMPORT GHO EXCEL (SheetJS)
   ══════════════════════════════════ */
/* ══════════════════════════════════
   IMPORT LISTE RESSOURCES (Excel 3 colonnes : ID / Name / Profession)
   ══════════════════════════════════ */
function triggerListImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => parseListExcel(evt.target.result);
    reader.readAsArrayBuffer(file);
  };
  input.click();
}

function _parseNameParts(fullName) {
  /* Détecte NOM (mots entièrement en majuscules) et prénom (reste) */
  const parts = fullName.trim().split(/\s+/);
  const nomParts    = parts.filter(p => p.length > 1 && p === p.toUpperCase() && !/\d/.test(p));
  const prenomParts = parts.filter(p => !nomParts.includes(p));
  return {
    nom:    nomParts.join(' ')    || parts[parts.length - 1] || fullName,
    prenom: prenomParts.join(' '),
  };
}

/* Normalise une chaîne lue depuis Excel :
   - apostrophes typographiques (' ') → apostrophe standard (')
   - guillemets typographiques (" ") → guillemets droits (")
   - espaces insécables et espaces spéciaux → espace normal
   - NFC pour les caractères accentués composés */
function _normalizeExcelStr(val) {
  if (val == null) return '';
  return String(val)
    .normalize('NFC')
    .replace(/[\u2018\u2019\u201A\u201B\u02BC\uFF07]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u00A0\u202F\u2009\u2007\u2008\u200B]/g, ' ')
    .trim();
}

function parseListExcel(buffer) {
  try {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS non disponible — vérifiez le chargement de la librairie.');
      return;
    }
    const wb  = XLSX.read(buffer, { type: 'array', cellDates: false });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    if (raw.length < 2) { alert('Fichier vide ou format invalide.'); return; }

    /* ── Détection flexible des colonnes ──
       Stratégie :
         1. Cherche la première colonne dont l'en-tête contient le mot-clé
         2. Si non trouvée, fallback sur la position (0=ID, 1=Nom, 2=Rôle)
       → l'import ne se bloque jamais sur un nom de colonne inattendu        */
    const header = (raw[0] || []).map(h => String(h ?? '').trim().toLowerCase());

    const _findCol = (patterns, fallback) => {
      const idx = header.findIndex(h => patterns.some(p => p.test(h)));
      return idx >= 0 ? idx : fallback;
    };

    const colId   = _findCol([/\bid\b/, /resource[\s_-]?id/, /id[\s_-]?resource/], 0);
    const colName = _findCol([/\bname\b/, /\bnom\b/, /resource[\s_-]?name/],       1);
    const colProf = _findCol([/\brole\b/, /\bprof/, /\bfonction/, /\bposte\b/,
                              /\btitre\b/, /\btitle\b/, /\bjob\b/],                2);
    const colType = _findCol([/\btype\b/],                                        -1); // pas de fallback positionnel

    /* ── Clé de correspondance : externalId + fullName normalisé ── */
    const _matchKey = (externalId, fullName) =>
      (String(externalId).trim() + '|' + String(fullName).trim()).toLowerCase();

    /* ── 1. Construire la liste des ressources du fichier ── */
    const importedKeys = new Set();
    const importRows   = [];

    for (let ri = 1; ri < raw.length; ri++) {
      const row = raw[ri];
      if (!row) continue;
      const externalId   = _normalizeExcelStr(row[colId]);
      const fullName     = _normalizeExcelStr(row[colName]);
      const profession   = _normalizeExcelStr(colProf >= 0 ? row[colProf] : null);
      const resourceType = _normalizeExcelStr(colType >= 0 ? row[colType] : null);
      if (!externalId && !fullName) continue;
      const key = _matchKey(externalId, fullName);
      importedKeys.add(key);
      importRows.push({ externalId, fullName, profession, resourceType, key });
    }

    if (!importRows.length) { alert('Aucune ligne valide trouvée dans le fichier.'); return; }

    /* ── 2. Upsert : mise à jour ou création ── */
    let created = 0, updated = 0, deleted = 0;

    for (const { externalId, fullName, profession, resourceType, key } of importRows) {
      const { nom, prenom } = _parseNameParts(fullName);
      /* Correspondance par couple ID + Nom (normalisé) */
      const existing = resources.find(r =>
        _matchKey(r.externalId || '', [r.prenom, r.nom].filter(Boolean).join(' ')) === key
      );
      if (existing) {
        existing.nom          = nom;
        existing.prenom       = prenom;
        existing.profession   = profession;
        existing.externalId   = externalId;
        existing.resourceType = resourceType || existing.resourceType || '';
        updated++;
      } else {
        resources.push({ id: genResId(), externalId, nom, prenom, profession, resourceType: resourceType || '' });
        created++;
      }
    }

    /* ── 3. Suppression des ressources absentes du fichier
            (uniquement celles qui avaient un externalId — les ressources
             créées manuellement sans externalId sont préservées) ── */
    const before = resources.length;
    resources = resources.filter(r => {
      if (!r.externalId) return true; // ressource manuelle → conserver
      const key = _matchKey(r.externalId, [r.prenom, r.nom].filter(Boolean).join(' '));
      return importedKeys.has(key);
    });
    deleted = before - resources.length;

    saveResources();
    _refreshResView();
    alert(`Import Liste ✓\n• ${created} créée(s)\n• ${updated} mise(s) à jour\n• ${deleted} supprimée(s)`);
  } catch (err) {
    console.error('List import error:', err);
    alert('Erreur import Liste : ' + err.message);
  }
}

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
      let res = _findResourceByName(resName);
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

function _findResourceByName(fullName) {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const t = norm(fullName);
  return resources.find(r => {
    const a = norm([r.prenom, r.nom].filter(Boolean).join(' '));
    const b = norm([r.nom, r.prenom].filter(Boolean).join(' '));
    return a===t || b===t;
  }) || null;
}

/* ══════════════════════════════════
   FIREBASE RESSOURCES — save / load
   ══════════════════════════════════ */
function scheduleFirebaseSaveResources() {
  if (typeof window._fbSetResources !== 'function') return;
  clearTimeout(_fbResSaveTimer);
  _fbResSaveTimer = setTimeout(_doFirebaseSaveResources, 1500);
}

async function _doFirebaseSaveResources() {
  if (_fbResSaving) return;
  if (typeof window._fbSetResources !== 'function') return;
  _fbResSaving = true;
  try {
    _fbResLastSaveTs = Date.now();
    await window._fbSetResources(resources);
  } catch(e) {
    console.error('Firebase resources save error:', e);
  } finally {
    _fbResSaving = false;
  }
}

/* ══════════════════════════════════
   INIT
   ══════════════════════════════════ */
function initResources() {
  loadResources(); // localStorage en premier (immédiat)

  /* Attendre que le SDK Firebase soit prêt puis charger les ressources */
  let _attempts = 0;
  const _iv = setInterval(() => {
    _attempts++;
    if (typeof window._fbOnValueResources === 'function') {
      clearInterval(_iv);
      window._fbOnValueResources(val => {
        /* Ignorer les mises à jour en temps réel si on vient juste de sauvegarder */
        if (_fbResInitLoaded && (Date.now() - _fbResLastSaveTs) < 4000) return;
        if (val && Array.isArray(val) && val.length) {
          resources = val;
          try { localStorage.setItem(RESOURCES_KEY, JSON.stringify(resources)); } catch(e) {}
          /* Rafraîchir la vue si elle est active */
          if (document.getElementById('viewRessources')?.style.display !== 'none') {
            _refreshResView();
          }
        }
        _fbResInitLoaded = true;
      });
    } else if (_attempts > 60) {
      clearInterval(_iv); // Firebase indisponible, localStorage suffit
    }
  }, 100);
}

/* Legacy aliases used elsewhere */
function renderResourceCalendarView() { _refreshResView(); }
function getChargeForResourceDay(resourceId, date) {
  const r = resources.find(x => x.id === resourceId);
  if (!r || !r.ghoData) return 0;
  const key = _dayKey(date);
  return (r.ghoData.activities||[]).reduce((s,a) => s+(a.daily[key]||0), 0);
}
