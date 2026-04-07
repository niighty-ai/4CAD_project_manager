/* ═══════════════════════════════════════════════════════════════
   resources.js — Vue Ressources : tableau GHO-style
   Ressource | Activité | J1 | J2 | ... | J365
   ═══════════════════════════════════════════════════════════════ */

/* ── État global ressources ── */
const RESOURCES_KEY = 'gantt4cad_resources';
const GHO_KEY       = 'gantt4cad_gho';
let resources = [];

/* ── Firebase ressources (métadonnées) ── */
let _fbResSaveTimer   = null;
let _fbResSaving      = false;
let _fbResInitLoaded  = false;
let _fbResLastSaveTs  = 0;

/* ── Firebase GHO (charges / projets / tâches) ── */
let _fbGhoSaveTimer   = null;
let _fbGhoSaving      = false;
let _fbGhoInitLoaded  = false;
let _fbGhoLastSaveTs  = 0;
let _fbGhoCache       = null; // cache en mémoire pour résoudre les races conditions

/* ── Collapse state : set of resource IDs that are expanded ── */
const _resExpanded = new Set();
/* ── Collapse state projets : set de "resId::projName" ── */
const _projExpanded = new Set();
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
  scheduleFirebaseSaveResources(); // envoie uniquement les métadonnées (sans ghoData)
}

/* Construit la payload GHO : { [resourceId]: ghoData } */
function _buildGhoPayload() {
  const payload = {};
  resources.forEach(r => { if (r.ghoData) payload[r.id] = r.ghoData; });
  return Object.keys(payload).length ? payload : null;
}

/* Applique une payload GHO { [resourceId]: ghoData } aux ressources en mémoire */
function _mergeGhoData(payload) {
  if (!payload || typeof payload !== 'object') return;
  resources.forEach(r => {
    if (payload[r.id]) r.ghoData = payload[r.id];
  });
}

/* Sauvegarde la data GHO (localStorage + Firebase gantt_gho) */
function saveGhoData() {
  const payload = _buildGhoPayload();
  try { localStorage.setItem(GHO_KEY, JSON.stringify(payload)); } catch(e) {}
  _fbGhoCache = payload;
  scheduleFirebaseSaveGho();
}

function loadResources() {
  try {
    const raw = localStorage.getItem(RESOURCES_KEY);
    if (raw) resources = _migrateResources(JSON.parse(raw));
  } catch(e) { resources = []; }
}

function genResId() {
  return 'r_' + Math.random().toString(36).slice(2, 9);
}


function getInitials(fullName) {
  return (fullName || '').trim().split(/\s+/)
    .filter(w => /^[a-zA-ZÀ-ÿ]/i.test(w))
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('') || '?';
}

/* Migration données anciennes : {nom, prenom} → {fullName} */
function _migrateResources(list) {
  return (list || []).map(r => {
    if (!r.fullName && (r.nom !== undefined || r.prenom !== undefined)) {
      r = { ...r, fullName: [r.prenom, r.nom].filter(Boolean).join(' ') };
    }
    return r;
  });
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
  const RES_W = 200, ACT_W = 200, TASK_W = 240;

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
      <table class="gho-table" style="width:${RES_W+ACT_W+TASK_W+days.length*COL_W}px">
        <colgroup>
          <col style="width:${RES_W}px">
          <col style="width:${ACT_W}px">
          <col style="width:${TASK_W}px">
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
            <th class="gho-th-act gho-sticky-act" rowspan="2">PROJET</th>
            <th class="gho-th-task gho-sticky-task" rowspan="2">TÂCHE</th>
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
  /* Filtre texte (nom complet, ID) */
  if (_resFilter) {
    const f = _resFilter.toLowerCase();
    list = list.filter(r =>
      (r.fullName || '').toLowerCase().includes(f) ||
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
    let emptyMsg;
    if (!resources.length) {
      emptyMsg = 'Aucune ressource — importez un fichier Excel via "↑ Import Liste".';
    } else if (_resTypeFilter && !resources.some(r => (r.resourceType||'').toLowerCase() === _resTypeFilter.toLowerCase())) {
      emptyMsg = `Aucune ressource de type &laquo;&nbsp;${escH(_resTypeFilter)}&nbsp;&raquo; — la colonne "Resource Type" n'a peut-être pas été détectée. Sélectionnez "Tous" pour voir toutes les ressources.`;
    } else {
      emptyMsg = 'Aucune ressource trouvée.';
    }
    return `<tr><td colspan="${days.length+3}" class="gho-empty">${emptyMsg}</td></tr>`;
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

  /* asJ=true : valeur déjà en jours (nouveau format projects)
     asJ=false : valeur en minutes → /480 (ancien format activities) */
  const mkDay = (vals, meta, asJ = false, fmt = _fmtJ) => {
    const raw = vals[meta.key] || 0;
    const jours = asJ ? raw : raw / 480;
    return `<td class="gho-td-day${meta.dc}">${jours > 0 ? fmt(jours) : ''}</td>`;
  };

  return fr.map(r => {
    const fullName = r.fullName || '—';
    const isExp    = _resExpanded.has(r.id);

    /* ── Calcul des totaux journaliers + nombre de projets (compatible ancien format) ── */
    const dayTotals = {};
    let   projCount = 0;

    if (r.ghoData?.projects) {
      /* Nouveau format : Ressource → Projets → Tâches */
      const projs = r.ghoData.projects.filter(p => p.tasks?.length > 0);
      projCount = projs.length;
      projs.forEach(p => p.tasks.forEach(t =>
        Object.entries(t.daily || {}).forEach(([k,v]) => { dayTotals[k] = (dayTotals[k]||0) + v; })
      ));
    } else if (r.ghoData?.activities) {
      /* Ancien format : Ressource → Activités */
      const acts = r.ghoData.activities.filter(a => Object.values(a.daily).some(v=>v>0));
      projCount = acts.length;
      acts.forEach(a => Object.entries(a.daily).forEach(([k,v]) => {
        dayTotals[k] = (dayTotals[k]||0) + v;
      }));
    }

    /* ── Ligne ressource ── */
    let rows = `<tr class="gho-row-res" data-rid="${r.id}">
      <td class="gho-td-res gho-sticky-res" onclick="openResInfo('${r.id}')" title="Voir les infos">
        <div class="gho-td-res-inner">
          <span class="gho-avatar">${getInitials(r.fullName)}</span>
          <span class="gho-res-name">${escH(fullName)}</span>
        </div>
      </td>
      <td class="gho-td-act gho-td-act-total gho-sticky-act">
        <div class="gho-td-act-inner" onclick="_toggleRes('${r.id}')">
          <span class="gho-toggle">${projCount?(isExp?'▾':'▸'):'·'}</span>
          ${projCount
            ? `<span class="gho-act-count">${projCount}&nbsp;projet${projCount>1?'s':''}</span>`
            : '<span class="gho-no-data">—</span>'}
        </div>
      </td>
      <td class="gho-td-task gho-sticky-task gho-td-empty"></td>
      ${r.ghoData?.projects
          ? dayMeta.map(m => mkDay(dayTotals, m, true, _fmtJRes)).join('')
          : dayMeta.map(m => mkDay(dayTotals, m)).join('')}
    </tr>`;

    if (isExp) {
      if (r.ghoData?.projects) {
        /* ── Nouveau format : lignes projet puis tâches (valeurs en jours) ── */
        r.ghoData.projects.filter(p => p.tasks?.length > 0).forEach(p => {
          const projKey   = `${r.id}::${p.name}`;
          const isProjExp = _projExpanded.has(projKey);
          const projTotals = {};
          p.tasks.forEach(t => Object.entries(t.daily||{}).forEach(([k,v]) => {
            projTotals[k] = (projTotals[k]||0) + v;
          }));

          /* Ligne projet */
          rows += `<tr class="gho-row-proj" data-rid="${r.id}">
            <td class="gho-td-res gho-td-res-empty gho-sticky-res"></td>
            <td class="gho-td-act gho-sticky-act">
              <div class="gho-td-proj-inner" data-rid="${escH(r.id)}" data-proj="${escH(p.name)}" onclick="_toggleProj(this.dataset.rid, this.dataset.proj)">
                <span class="gho-toggle">${isProjExp?'▾':'▸'}</span>
                <span class="gho-proj-name" title="${escH(p.name)}">${escH(p.name)}</span>
                <span class="gho-task-count">${p.tasks.length}&nbsp;tâche${p.tasks.length>1?'s':''}</span>
              </div>
            </td>
            <td class="gho-td-task gho-sticky-task gho-td-empty"></td>
            ${dayMeta.map(m => mkDay(projTotals, m, true)).join('')}
          </tr>`;

          /* Lignes tâche (si projet déployé) */
          if (isProjExp) p.tasks.forEach(t => {
            const label = t.taskName || t.taskId || '—';
            rows += `<tr class="gho-row-task" data-rid="${r.id}">
              <td class="gho-td-res gho-td-res-empty gho-sticky-res"></td>
              <td class="gho-td-act gho-td-empty gho-sticky-act"></td>
              <td class="gho-td-task gho-sticky-task">
                <div class="gho-td-task-inner">
                  ${t.taskId ? `<span class="gho-task-id">#${escH(t.taskId)}</span>` : ''}
                  <span class="gho-task-name" title="${escH(label)}">${escH(label)}</span>
                </div>
              </td>
              ${dayMeta.map(m => mkDay(t.daily, m, true)).join('')}
            </tr>`;
          });
        });
      } else if (r.ghoData?.activities) {
        /* ── Ancien format : lignes activité (valeurs en minutes) ── */
        r.ghoData.activities.filter(a => Object.values(a.daily).some(v=>v>0)).forEach(a => {
          rows += `<tr class="gho-row-act" data-rid="${r.id}">
            <td class="gho-td-res gho-td-res-empty gho-sticky-res"></td>
            <td class="gho-td-act gho-sticky-act">
              <div class="gho-td-act-name" title="${escH(a.name)}">${escH(a.name)}</div>
            </td>
            <td class="gho-td-task gho-sticky-task gho-td-empty"></td>
            ${dayMeta.map(m => mkDay(a.daily, m)).join('')}
          </tr>`;
        });
      }
    }

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
  /* Format charge in jours: red if >= 1, white otherwise */
  const v = Math.round(jours * 100) / 100;
  const txt = v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/,'');
  const cls = jours >= 1 ? 'gho-cell c-over' : 'gho-cell c-ok';
  return `<span class="${cls}">${txt}</span>`;
}

function _fmtJRes(jours) {
  /* Format charge for resource total row: red if > 1 (overloaded), white otherwise */
  const v = Math.round(jours * 100) / 100;
  const txt = v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/,'');
  const cls = jours > 1 ? 'gho-cell c-over' : 'gho-cell c-ok';
  return `<span class="${cls}">${txt}</span>`;
}

function _toggleRes(id) {
  if (_resExpanded.has(id)) _resExpanded.delete(id);
  else _resExpanded.add(id);
  _refreshTbody();
}

function _toggleProj(resId, projName) {
  const key = `${resId}::${projName}`;
  if (_projExpanded.has(key)) _projExpanded.delete(key);
  else _projExpanded.add(key);
  _refreshTbody();
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
        <label class="gho-dlg-label">Nom complet</label>
        <input class="gho-dlg-input gho-dlg-input-id" id="resInfoFullName" readonly tabindex="-1">
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
  const name = r.fullName || '—';
  document.getElementById('resInfoTitle').textContent = name;
  document.getElementById('resInfoFullName').value    = name;
  document.getElementById('resInfoProf').value        = r.profession   || '—';
  document.getElementById('resInfoType').value        = r.resourceType || '—';
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
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
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
    /* Normaliser les en-têtes (espaces insécables, apostrophes typographiques, etc.) */
    const header = (raw[0] || []).map(h => _normalizeExcelStr(h).toLowerCase());

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
      /* Correspondance par couple ID + Nom (normalisé) */
      const existing = resources.find(r =>
        _matchKey(r.externalId || '', r.fullName || '') === key
      );
      if (existing) {
        existing.fullName     = fullName;
        existing.profession   = profession;
        existing.externalId   = externalId;
        existing.resourceType = resourceType || existing.resourceType || '';
        updated++;
      } else {
        resources.push({ id: genResId(), externalId, fullName, profession, resourceType: resourceType || '' });
        created++;
      }
    }

    /* ── 3. Suppression des ressources absentes du fichier
            (uniquement celles qui avaient un externalId — les ressources
             créées manuellement sans externalId sont préservées) ── */
    const before = resources.length;
    resources = resources.filter(r => {
      if (!r.externalId) return true; // ressource manuelle → conserver
      const key = _matchKey(r.externalId, r.fullName || '');
      return importedKeys.has(key);
    });
    deleted = before - resources.length;

    /* ── 4. Auto-reset du filtre type si aucune ressource ne correspond ── */
    const typesFound = [...new Set(resources.map(r => r.resourceType || '').filter(Boolean))].sort();
    if (_resTypeFilter && !resources.some(r =>
      (r.resourceType || '').toLowerCase() === _resTypeFilter.toLowerCase()
    )) {
      _resTypeFilter = typesFound.length ? typesFound[0] : '';
    }

    saveResources();
    _refreshResView();
    const typesSummary = typesFound.length
      ? `\n• Types détectés : ${typesFound.join(', ')}`
      : '\n• ⚠ Colonne "Resource Type" non détectée (filtre réinitialisé à "Tous")';
    alert(`Import Liste ✓\n• ${created} créée(s)\n• ${updated} mise(s) à jour\n• ${deleted} supprimée(s)${typesSummary}`);
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

/* ── Convertit une valeur de cellule en clé "DD/MM/YYYY", ou null ── */
function _parseDateValue(rawVal) {
  if (rawVal == null) return null;

  /* 1. Numéro de série Excel (plage large pour couvrir 1950-2200) */
  if (typeof rawVal === 'number' && rawVal > 1 && rawVal < 120000) {
    const d = new Date(Date.UTC(1900, 0, 1) + (rawVal - 2) * 86400000);
    if (!isNaN(d.getTime())) {
      return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
    }
  }

  /* 2. Objet Date JS */
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    return `${String(rawVal.getDate()).padStart(2,'0')}/${String(rawVal.getMonth()+1).padStart(2,'0')}/${rawVal.getFullYear()}`;
  }

  const s = _normalizeExcelStr(rawVal);
  if (!s) return null;

  /* Supprimer la partie heure si présente ("01/03/2026 00:00" ou "01/03/2026T00:00:00") */
  const datePart = s.replace(/[\sT]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, '').trim();

  /* 3. DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (avec ou sans padding) */
  let m = datePart.match(/^(\d{1,2})[\/\-\.\s](\d{1,2})[\/\-\.\s](\d{2,4})$/);
  if (m) {
    const d = parseInt(m[1]), mo = parseInt(m[2]);
    const yyyy = m[3].length === 2 ? '20' + m[3] : m[3];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12)
      return `${String(d).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${yyyy}`;
  }

  /* 4. YYYY-MM-DD ou YYYY/MM/DD */
  m = datePart.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (m) {
    const d = parseInt(m[3]), mo = parseInt(m[2]);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12)
      return `${String(d).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${m[1]}`;
  }

  /* 5. Fallback Date.parse — réinterprète DD/MM → ISO avant de parser */
  const iso = s.replace(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/, '$3-$2-$1');
  const ts  = Date.parse(iso);
  if (!isNaN(ts)) {
    const d = new Date(ts);
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
  }

  return null;
}
/* Alias pour la détection en en-tête (même logique) */
const _parseDateHeader = _parseDateValue;

function _showMissingResPopup(missingNames, updatedCount) {
  const existing = document.getElementById('ghoMissingBackdrop');
  if (existing) existing.remove();

  const listHtml = missingNames.map(n => `<li class="gho-missing-item">${escH(n)}</li>`).join('');
  const el = document.createElement('div');
  el.id = 'ghoMissingBackdrop';
  el.className = 'gho-dialog-backdrop';
  el.style.display = 'flex';
  el.innerHTML = `
    <div class="gho-dialog gho-dialog-wide" onclick="event.stopPropagation()">
      <div class="gho-dialog-title">⚠ Ressources introuvables</div>
      <div class="gho-dialog-body">
        ${updatedCount > 0 ? `<p class="gho-missing-ok">✓ ${updatedCount} ressource(s) mise(s) à jour avec succès.</p>` : ''}
        <p class="gho-missing-warn">Les ressources suivantes sont absentes de la liste et n'ont <strong>pas</strong> été importées :</p>
        <ul class="gho-missing-list">${listHtml}</ul>
        <p class="gho-missing-hint">Importez d'abord ces ressources via <strong>↑ Import Liste</strong>, puis relancez l'import GHO.</p>
      </div>
      <div class="gho-dialog-footer">
        <button class="gho-dlg-save" onclick="document.getElementById('ghoMissingBackdrop').remove()">Fermer</button>
      </div>
    </div>`;
  el.onclick = () => el.remove();
  document.body.appendChild(el);
}

function parseGHOExcel(buffer) {
  /* Format attendu (vertical) :
     Resource User | Activity Name | ID Task | Task Name | Date | Charge (J)
     Une ligne par jour/tâche. La charge est en jours (virgule décimale fr). */
  try {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS non disponible — vérifiez le chargement de la librairie.');
      return;
    }
    const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    if (raw.length < 2) { alert('Fichier vide ou format invalide.'); return; }

    /* ── Trouver la première ligne non-vide = en-têtes ── */
    let headerRowIdx = 0;
    while (headerRowIdx < raw.length && !(raw[headerRowIdx] || []).some(v => v != null)) headerRowIdx++;
    const header = (raw[headerRowIdx] || []).map(h => _normalizeExcelStr(h).toLowerCase());

    /* ── Détection flexible des colonnes ── */
    const _findCol = (patterns, label) => {
      const idx = header.findIndex(h => patterns.some(p => p.test(h)));
      if (idx < 0) { alert(`Colonne "${label}" introuvable dans le fichier.`); }
      return idx;
    };

    const colRes      = _findCol([/ressource|resource[\s_-]?user|\buser\b|\bnom\b/],         'Resource / Ressource');
    const colProj     = _findCol([/activit[yé][\s_-]?name|scoped[\s_:]?with|activit[éye]|projet|project/], 'Activity Name / Projet');
    const colTaskId   = _findCol([/\bid[\s_-]?task\b|\btask[\s_-]?id\b/],                    'ID Task');
    const colTaskName = _findCol([/task[\s_:]+name|nom[\s_-]?t[aâ]che/],                      'Task Name');
    const colDate     = _findCol([/\bdate\b/],                                                'Date');
    const colCharge   = _findCol([/charge|effort|load|jours?\b/],                             'Charge (J)');

    if ([colRes, colProj, colDate, colCharge].some(c => c < 0)) return;

    /* ── Lecture des lignes (format vertical : 1 ligne = 1 jour pour 1 tâche) ── */
    /* parsed : { resName → { projName → { taskKey → { taskId, taskName, daily: {dateKey: jours} } } } } */
    const parsed = {};
    for (let ri = headerRowIdx + 1; ri < raw.length; ri++) {
      const row = raw[ri];
      if (!row) continue;
      const resName  = _normalizeExcelStr(row[colRes]);
      const projName = _normalizeExcelStr(row[colProj]);
      if (!resName || !projName) continue;

      /* Date de la ligne */
      const dateKey = _parseDateValue(row[colDate]);
      if (!dateKey) continue;

      /* Charge en jours — séparateur décimal fr (virgule) ou en (point) */
      const chargeRaw = row[colCharge];
      const jours = parseFloat(String(chargeRaw ?? '').replace(',', '.'));
      if (!jours || jours <= 0) continue;

      const taskId   = colTaskId   >= 0 ? _normalizeExcelStr(row[colTaskId])   : '';
      const taskName = colTaskName >= 0 ? _normalizeExcelStr(row[colTaskName]) : '';
      const tKey     = taskId || taskName || '__default__';

      if (!parsed[resName])                       parsed[resName]              = {};
      if (!parsed[resName][projName])             parsed[resName][projName]    = {};
      if (!parsed[resName][projName][tKey])       parsed[resName][projName][tKey] = { taskId, taskName: taskName || taskId, daily: {} };

      const daily = parsed[resName][projName][tKey].daily;
      daily[dateKey] = Math.round(((daily[dateKey] || 0) + jours) * 1000) / 1000;
    }

    /* ── Correspondance ressources : jamais de création ── */
    const now        = new Date();
    const importDate = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
    const missing    = [];
    let   updated    = 0;

    Object.entries(parsed).forEach(([resName, projMap]) => {
      const res = _findResourceByName(resName);
      if (!res) { missing.push(resName); return; }

      const projects = Object.entries(projMap)
        .map(([projName, taskMap]) => ({
          name : projName,
          tasks: Object.values(taskMap).filter(t => Object.values(t.daily).some(v => v > 0))
        }))
        .filter(p => p.tasks.length > 0);

      if (projects.length) {
        res.ghoData = { importDate, projects };
        updated++;
      }
    });

    saveResources(); // métadonnées → gantt_resources
    saveGhoData();   // charges/projets/tâches → gantt_gho
    _refreshResView();

    if (missing.length > 0) {
      _showMissingResPopup(missing, updated);
    } else {
      alert(`Import GHO ✓\n• ${updated} ressource(s) mise(s) à jour`);
    }
  } catch(err) {
    console.error('GHO import error:', err);
    alert('Erreur import GHO : ' + err.message);
  }
}

function _findResourceByName(fullName) {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
  const t = norm(fullName);
  return resources.find(r => norm(r.fullName || '') === t) || null;
}

/* ══════════════════════════════════
   FIREBASE RESSOURCES — save / load
   ══════════════════════════════════ */
function scheduleFirebaseSaveResources() {
  /* Ne pas vérifier _fbSetResources ici : on attendra qu'il soit dispo dans _doFirebaseSaveResources */
  clearTimeout(_fbResSaveTimer);
  _fbResSaveTimer = setTimeout(_doFirebaseSaveResources, 1500);
}

async function _doFirebaseSaveResources() {
  if (_fbResSaving) return;
  /* Attendre que le SDK Firebase soit prêt (jusqu'à 15 s) */
  let waited = 0;
  while (typeof window._fbSetResources !== 'function' && waited < 15000) {
    await new Promise(r => setTimeout(r, 300));
    waited += 300;
  }
  if (typeof window._fbSetResources !== 'function') {
    console.warn('[Resources] Firebase indisponible après 15 s — sauvegarde annulée');
    return;
  }
  _fbResSaving = true;
  if (typeof setFbStatus === 'function') setFbStatus('⏳ Sync ressources...', '#f7971e');
  try {
    _fbResLastSaveTs = Date.now();
    /* Envoyer uniquement les métadonnées — ghoData est dans gantt_gho (nœud séparé) */
    // eslint-disable-next-line no-unused-vars
    const metadata = resources.map(({ ghoData, ...rest }) => rest);
    await window._fbSetResources(metadata);
    const now = new Date();
    const hms = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    if (typeof setFbStatus === 'function') setFbStatus('☁ ' + hms, '#2e7d32');
  } catch(e) {
    console.error('Firebase resources save error:', e);
    if (typeof setFbStatus === 'function') setFbStatus('⚠ Erreur Firebase', '#e17055');
  } finally {
    _fbResSaving = false;
  }
}

/* ══════════════════════════════════
   FIREBASE GHO — save / load
   ══════════════════════════════════ */
function scheduleFirebaseSaveGho() {
  clearTimeout(_fbGhoSaveTimer);
  _fbGhoSaveTimer = setTimeout(_doFirebaseSaveGho, 1500);
}

async function _doFirebaseSaveGho() {
  if (_fbGhoSaving) return;
  let waited = 0;
  while (typeof window._fbSetGho !== 'function' && waited < 15000) {
    await new Promise(r => setTimeout(r, 300));
    waited += 300;
  }
  if (typeof window._fbSetGho !== 'function') {
    console.warn('[GHO] Firebase indisponible après 15 s — sauvegarde annulée');
    return;
  }
  _fbGhoSaving = true;
  if (typeof setFbStatus === 'function') setFbStatus('⏳ Sync GHO...', '#f7971e');
  try {
    _fbGhoLastSaveTs = Date.now();
    const payload = _buildGhoPayload();
    await window._fbSetGho(payload);
    const now = new Date();
    const hms = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    if (typeof setFbStatus === 'function') setFbStatus('☁ ' + hms, '#2e7d32');
  } catch(e) {
    console.error('Firebase GHO save error:', e);
    if (typeof setFbStatus === 'function') setFbStatus('⚠ Erreur Firebase GHO', '#e17055');
  } finally {
    _fbGhoSaving = false;
  }
}

function _initFirebaseGho() {
  let _attempts = 0;
  const _iv = setInterval(() => {
    _attempts++;
    if (typeof window._fbOnValueGho === 'function') {
      clearInterval(_iv);
      window._fbOnValueGho(val => {
        /* Ignorer les mises à jour juste après notre propre sauvegarde */
        if (_fbGhoInitLoaded && (Date.now() - _fbGhoLastSaveTs) < 4000) return;

        if (!_fbGhoInitLoaded) {
          _fbGhoInitLoaded = true;
          if (val) {
            /* Firebase a des données GHO → autoritaire */
            _fbGhoCache = val;
            _mergeGhoData(val);
            try { localStorage.setItem(GHO_KEY, JSON.stringify(val)); } catch(e) {}
          } else {
            /* Firebase vide → pousser les données locales si on en a */
            const local = _buildGhoPayload();
            if (local) scheduleFirebaseSaveGho();
          }
          if (document.getElementById('viewRessources')?.style.display !== 'none') {
            _refreshResView();
          }
          return;
        }

        /* Mise à jour temps réel depuis un autre client */
        if (val) {
          _fbGhoCache = val;
          _mergeGhoData(val);
          try { localStorage.setItem(GHO_KEY, JSON.stringify(val)); } catch(e) {}
          if (document.getElementById('viewRessources')?.style.display !== 'none') {
            _refreshResView();
          }
        }
      });
    } else if (_attempts > 60) {
      clearInterval(_iv);
    }
  }, 100);
}

/* ══════════════════════════════════
   INIT
   ══════════════════════════════════ */
function initResources() {
  loadResources(); // localStorage en premier (immédiat)

  /* Charger la data GHO depuis localStorage (disponible hors-ligne) */
  try {
    const rawGho = localStorage.getItem(GHO_KEY);
    if (rawGho) {
      const gho = JSON.parse(rawGho);
      _fbGhoCache = gho;
      _mergeGhoData(gho);
    }
  } catch(e) {}

  /* Attendre que le SDK Firebase soit prêt puis synchroniser les ressources */
  let _attempts = 0;
  const _iv = setInterval(() => {
    _attempts++;
    if (typeof window._fbOnValueResources === 'function') {
      clearInterval(_iv);
      window._fbOnValueResources(val => {
        /* Ignorer les mises à jour juste après notre propre sauvegarde */
        if (_fbResInitLoaded && (Date.now() - _fbResLastSaveTs) < 4000) return;

        /* Firebase Realtime DB convertit les arrays en objets {0:{…},1:{…}} —
           on normalise en array dans tous les cas */
        let fbResources = [];
        if (val) {
          const raw = Array.isArray(val) ? val : Object.values(val);
          fbResources = _migrateResources(raw.filter(Boolean));
        }

        if (!_fbResInitLoaded) {
          /* Première connexion : décider quelle source est autoritaire */
          _fbResInitLoaded = true;
          if (fbResources.length > 0 && fbResources.length >= resources.length) {
            /* Firebase a autant ou plus de données → utiliser Firebase */
            resources = fbResources;
            /* Ré-appliquer le cache GHO : les métadonnées Firebase n'ont pas ghoData */
            if (_fbGhoCache) _mergeGhoData(_fbGhoCache);
            try { localStorage.setItem(RESOURCES_KEY, JSON.stringify(resources)); } catch(e) {}
            if (document.getElementById('viewRessources')?.style.display !== 'none') {
              _refreshResView();
            }
          } else if (resources.length > 0) {
            /* localStorage a plus de données → pousser vers Firebase */
            console.log(`[Resources] localStorage (${resources.length}) > Firebase (${fbResources.length}) — push vers Firebase`);
            scheduleFirebaseSaveResources();
          }
          return;
        }

        /* Mises à jour temps réel d'un autre client */
        if (fbResources.length) {
          resources = fbResources;
          if (_fbGhoCache) _mergeGhoData(_fbGhoCache);
          try { localStorage.setItem(RESOURCES_KEY, JSON.stringify(resources)); } catch(e) {}
          if (document.getElementById('viewRessources')?.style.display !== 'none') {
            _refreshResView();
          }
        }
      });
    } else if (_attempts > 60) {
      clearInterval(_iv); // Firebase indisponible, localStorage suffit
    }
  }, 100);

  /* Synchroniser la data GHO depuis Firebase (nœud séparé) */
  _initFirebaseGho();
}

/* ══════════════════════════════════════════════════════════════
   SYNCHRONISATION GANTT ↔ RESSOURCES
   Rapprochement par externalTaskId ↔ taskId (préfixe ou slice -3)
   ══════════════════════════════════════════════════════════════ */

/* Compare deux Task IDs :
   - Correspondance exacte
   - Ou l'un est un préfixe de l'autre (le taskId ressource est souvent la version
     tronquée du externalTaskId XML, ex: "aAHW50000000t6A" ↔ "aAHW50000000t6AOAQ")
   - Fallback : ignorer les 3 derniers chars des deux */
function _matchTaskId(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  /* Préfixe : le plus court doit être au début du plus long */
  const shorter = a.length <= b.length ? a : b;
  const longer  = a.length <= b.length ? b : a;
  if (longer.startsWith(shorter)) return true;
  /* Fallback : slice(0,-3) sur les deux */
  if (a.length > 3 && b.length > 3 && a.slice(0, -3) === b.slice(0, -3)) return true;
  return false;
}

/* Vérifie si un externalTaskId est référencé dans les données GHO */
function _isTaskSyncedWithGho(externalTaskId) {
  if (!externalTaskId) return false;
  for (const res of resources) {
    if (!res.ghoData?.projects) continue;
    for (const proj of res.ghoData.projects) {
      for (const t of (proj.tasks || [])) {
        if (_matchTaskId(externalTaskId, t.taskId)) return true;
      }
    }
  }
  return false;
}

/* Bouton ⟳ Sync charges : rapproche toutes les tâches Gantt avec les données GHO */
function syncGanttFromResources() {
  if (!resources.length) {
    alert('Aucune ressource chargée.\nImportez d\'abord les données via l\'onglet Ressources.');
    return;
  }

  const taskRows = rows.filter(r => r._type === 'tache' && r.externalTaskId);
  if (!taskRows.length) {
    alert('Aucune tâche avec un Task ID dans ce Gantt.\nImportez un fichier XML MS Project pour associer les IDs.');
    return;
  }

  let syncCount = 0;
  let matchCount = 0;

  resources.forEach(res => {
    if (!res.ghoData?.projects) return;

    res.ghoData.projects.forEach(proj => {
      (proj.tasks || []).forEach(t => {
        if (!t.taskId) return;

        /* Trouver la tâche Gantt correspondante */
        const matchedRow = taskRows.find(r => _matchTaskId(r.externalTaskId, t.taskId));
        if (!matchedRow) return;
        matchCount++;

        const daily = t.daily || {};

        /* Calculer la charge totale et la plage de dates depuis le daily */
        let totalCharge = 0;
        let minDate = null;
        let maxDate = null;

        Object.entries(daily).forEach(([k, v]) => {
          if (v <= 0) return;
          totalCharge += v;
          const parts = k.split('/');
          if (parts.length === 3) {
            const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            if (!minDate || d < minDate) minDate = new Date(d);
            if (!maxDate || d > maxDate) maxDate = new Date(d);
          }
        });

        if (totalCharge <= 0) return;

        /* Trouver ou créer l'affectation pour cette ressource sur cette tâche */
        if (!matchedRow.assignments) matchedRow.assignments = [];
        let asgn = matchedRow.assignments.find(a => a.resourceId === res.id);
        if (!asgn) {
          asgn = { resourceId: res.id, resourceNom: res.fullName || res.id };
          matchedRow.assignments.push(asgn);
        }

        asgn.charge     = Math.round(totalCharge * 100) / 100;
        asgn.daily      = { ...daily };
        if (minDate) asgn.debut = minDate;
        if (maxDate) asgn.fin   = maxDate;

        syncCount++;
      });
    });
  });

  if (matchCount === 0) {
    alert('Aucune correspondance trouvée entre les Task IDs du Gantt et les données ressources.\nVérifiez que les IDs correspondent (champ ExtendedAttribute du XML).');
    return;
  }

  saveCurrentProject();
  renderAll();

  /* Mettre à jour le badge de synchro si le panneau d'édition est ouvert */
  const badge = document.getElementById('epSyncBadge');
  const extInput = document.getElementById('epExternalId');
  if (badge && extInput && extInput.value) {
    const synced = _isTaskSyncedWithGho(extInput.value);
    badge.style.display = synced ? 'inline-flex' : 'none';
  }

  alert(`Synchronisation réussie :\n${syncCount} affectation(s) mise(s) à jour sur ${matchCount} correspondance(s) trouvée(s).`);
}

/* Legacy aliases used elsewhere */
function renderResourceCalendarView() { _refreshResView(); }
function getChargeForResourceDay(resourceId, date) {
  const r = resources.find(x => x.id === resourceId);
  if (!r || !r.ghoData) return 0;
  const key = _dayKey(date);
  /* Nouveau format : Projets → Tâches */
  if (r.ghoData.projects) {
    return r.ghoData.projects.reduce((s, p) =>
      s + (p.tasks || []).reduce((ts, t) => ts + (t.daily[key] || 0), 0), 0);
  }
  /* Ancien format : Activités */
  return (r.ghoData.activities || []).reduce((s, a) => s + (a.daily[key] || 0), 0);
}

function getTasksForResourceDay(resourceId, dateKey) {
  /* Retourne { total, tasks:[{projet,tache,charge}] } pour une ressource à une date (clé DD/MM/YYYY) */
  const r = resources.find(x => x.id === resourceId);
  if (!r || !r.ghoData) return { total: 0, tasks: [] };
  const items = [];
  if (r.ghoData.projects) {
    r.ghoData.projects.forEach(p => {
      (p.tasks || []).forEach(t => {
        const c = t.daily[dateKey] || 0;
        if (c > 0) items.push({ projet: p.name || '—', tache: t.taskName || t.taskId || '—', charge: c });
      });
    });
  } else if (r.ghoData.activities) {
    r.ghoData.activities.forEach(a => {
      const c = a.daily[dateKey] || 0;
      if (c > 0) items.push({ projet: '—', tache: a.name || '—', charge: c });
    });
  }
  const total = Math.round(items.reduce((s, x) => s + x.charge, 0) * 1000) / 1000;
  return { total, tasks: items };
}
