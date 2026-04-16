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
let _resUnitH      = false;        // false = jours, true = heures (affichage seulement)

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

/* Encode les clés DD/MM/YYYY → DD-MM-YYYY dans un ghoData pour Firebase */
function _encodeGhoForFirebase(ghoData) {
  if (!ghoData || typeof ghoData !== 'object') return ghoData;
  const out = { ...ghoData };
  if (out.projects) {
    out.projects = out.projects.map(p => ({
      ...p,
      tasks: (p.tasks || []).map(t => ({
        ...t,
        daily: t.daily ? Object.fromEntries(
          Object.entries(t.daily).map(([k, v]) => [k.replace(/\//g, '-'), v])
        ) : {}
      }))
    }));
  }
  return out;
}

/* Construit la payload GHO : { [resourceId]: ghoData } */
function _buildGhoPayload(forFirebase = false) {
  const payload = {};
  resources.forEach(r => {
    if (r.ghoData) payload[r.id] = forFirebase ? _encodeGhoForFirebase(r.ghoData) : r.ghoData;
  });
  return Object.keys(payload).length ? payload : null;
}

/* Applique une payload GHO { [resourceId]: ghoData } aux ressources en mémoire,
   en décodant DD-MM-YYYY → DD/MM/YYYY.
   Fusionne avec les données existantes pour préserver les entrées manuelles
   (charges saisies depuis le Gantt sur des tâches sans externalTaskId). */
function _mergeGhoData(payload) {
  if (!payload || typeof payload !== 'object') return;
  resources.forEach(r => {
    if (!payload[r.id]) return;
    const incoming = payload[r.id];

    /* Décodage DD-MM-YYYY → DD/MM/YYYY dans le daily de chaque tâche */
    if (incoming.projects) {
      incoming.projects = incoming.projects.map(p => ({
        ...p,
        tasks: (p.tasks || []).map(t => ({
          ...t,
          daily: t.daily ? Object.fromEntries(
            Object.entries(t.daily).map(([k, v]) => [k.includes('/') ? k : k.replace(/-/g, '/'), v])
          ) : {}
        }))
      }));
    }

    /* ── Fusion avec les données GHO existantes ─────────────────────────────
       Objectif : les projets/tâches ajoutés manuellement depuis le Gantt
       (absents de l'import) doivent être conservés après chaque import GHO.
       Stratégie :
         1. Pour les projets présents dans l'import : fusionner les tâches
            → les tâches importées prennent la priorité (ID ou nom)
            → les tâches manuelles absentes de l'import sont préservées
         2. Les projets existants absents de l'import sont conservés intacts
    ─────────────────────────────────────────────────────────────────────── */
    if (r.ghoData?.projects && incoming.projects) {
      const incomingProjNames = new Set(incoming.projects.map(p => p.name));

      /* 1. Fusionner les tâches manuelles dans les projets communs */
      incoming.projects.forEach(incomingProj => {
        const existingProj = r.ghoData.projects.find(p => p.name === incomingProj.name);
        if (!existingProj?.tasks?.length) return;
        const incomingTaskIds   = new Set((incomingProj.tasks || []).map(t => t.taskId));
        const incomingTaskNames = new Set((incomingProj.tasks || []).map(t => (t.taskName || '').toLowerCase()));
        /* Garder seulement les tâches existantes non couvertes par l'import */
        const manualTasks = existingProj.tasks.filter(t =>
          !incomingTaskIds.has(t.taskId) &&
          !incomingTaskNames.has((t.taskName || '').toLowerCase())
        );
        if (manualTasks.length) {
          incomingProj.tasks = [...(incomingProj.tasks || []), ...manualTasks];
        }
      });

      /* 2. Conserver les projets existants absents de l'import */
      const extraProjects = r.ghoData.projects.filter(p => !incomingProjNames.has(p.name));
      if (extraProjects.length) {
        incoming.projects = [...incoming.projects, ...extraProjects];
      }
    } else if (r.ghoData?.projects && !incoming.projects) {
      /* L'import n'a pas de projets (ancien format activities) : conserver les projets existants */
      incoming.projects = r.ghoData.projects;
    }

    r.ghoData = incoming;
  });
}

/* Sauvegarde la data GHO (localStorage + Firebase gantt_gho) */
function saveGhoData() {
  const payload = _buildGhoPayload();
  try { localStorage.setItem(GHO_KEY, JSON.stringify(payload)); } catch(e) {}
  _fbGhoCache = payload;
  /* Marquer le timestamp dès maintenant pour protéger contre les échos Firebase
     pendant le délai du debounce (1,5 s avant l'envoi réel) */
  _fbGhoLastSaveTs = Date.now();
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
        <button class="gho-btn-unit${_resUnitH?' active':''}" id="btnResUnit" onclick="_toggleResUnit()">${_resUnitH?'Jours':'Heures'}</button>
        <button class="gho-btn-import-list" onclick="triggerListImport()">↑ Import Ressource</button>
        <button class="gho-btn-import" onclick="triggerGHOImport()">↑ Import Charge</button>
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
    const f = normalizeStr(_resFilter);
    list = list.filter(r =>
      normalizeStr(r.fullName).includes(f) ||
      normalizeStr(r.externalId).includes(f)
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
  const mkDay = (vals, meta, asJ = false, fmt = _fmtJ, resId = '') => {
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
              ${dayMeta.map(m => mkDay(t.daily, m, true, _fmtJ, r.id)).join('')}
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

function _fmtCellVal(jours) {
  /* Affichage cellule : max 2 décimales, unité selon _resUnitH */
  if (_resUnitH) {
    const h = Math.round(jours * 8 * 100) / 100;
    const txt = h % 1 === 0 ? h.toFixed(0) : h.toFixed(2).replace(/\.?0+$/,'');
    return txt + 'h';
  }
  const v = Math.round(jours * 100) / 100;
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/,'');
}

function _fmtJ(jours) {
  /* Tâche / projet : rouge si >= 1j */
  const cls = jours >= 1 ? 'gho-cell c-over' : 'gho-cell c-ok';
  return `<span class="${cls}">${_fmtCellVal(jours)}</span>`;
}

function _fmtJRes(jours) {
  /* Total ressource : rouge si > 1j */
  const cls = jours > 1 ? 'gho-cell c-over' : 'gho-cell c-ok';
  return `<span class="${cls}">${_fmtCellVal(jours)}</span>`;
}

function _toggleResUnit() {
  _resUnitH = !_resUnitH;
  const btn = document.getElementById('btnResUnit');
  if (btn) {
    btn.textContent = _resUnitH ? 'Jours' : 'Heures';
    btn.classList.toggle('active', _resUnitH);
  }
  _refreshTbody();
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

  /* Fix sticky header overlap: align days row top to actual months row height */
  requestAnimationFrame(() => {
    const monthsRow = document.querySelector('#ghoScrollWrap .gho-thead-months');
    const daysCells = document.querySelectorAll('#ghoScrollWrap .gho-thead-days th');
    if (monthsRow && daysCells.length) {
      const h = Math.round(monthsRow.getBoundingClientRect().height);
      daysCells.forEach(th => { th.style.top = h + 'px'; });
    }
  });
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
    const payload = _buildGhoPayload(true); /* clés encodées pour Firebase */
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
   Rapprochement par externalTaskId exact (ID issu de l'import GHO unifié)
   ══════════════════════════════════════════════════════════════ */

/* Vérifie si un externalTaskId est référencé dans les données GHO */
function _isTaskSyncedWithGho(externalTaskId) {
  if (!externalTaskId) return false;
  for (const res of resources) {
    if (!res.ghoData?.projects) continue;
    for (const proj of res.ghoData.projects) {
      for (const t of (proj.tasks || [])) {
        if (t.taskId === externalTaskId) return true;
      }
    }
  }
  return false;
}

/* Bouton 🔄 Actualiser : reconstruit les assignments depuis GHO et recalcule charge.
   chargePassee / chargeRestante : calculées dynamiquement au rendu depuis daily. */
function syncGanttFromResources(silent = false) {
  if (!resources.length) {
    if (!silent) alert('Aucune ressource chargée.\nImportez d\'abord les données via l\'onglet Ressources.');
    return;
  }

  const taskRows = rows.filter(r => r._type === 'tache');
  if (!taskRows.length) {
    if (!silent) alert('Aucune tâche dans ce Gantt.');
    return;
  }

  /* ── Étape 1 : vider toutes les assignments — GHO est la source unique ── */
  taskRows.forEach(r => { r.assignments = []; });

  /* Vider aussi les éditions en attente */
  if (typeof _ganttEdits !== 'undefined') {
    Object.keys(_ganttEdits).forEach(k => delete _ganttEdits[k]);
    if (typeof _updateSaveBtn === 'function') _updateSaveBtn();
  }

  /* ── Étape 2 : repeupler depuis GHO ── */
  let syncCount  = 0;
  let matchCount = 0;

  resources.forEach(res => {
    if (!res.ghoData?.projects) return;

    res.ghoData.projects.forEach(ghoProj => {
      (ghoProj.tasks || []).forEach(t => {
        if (!t.taskId) return;

        /* Correspondance : externalTaskId exact (import GHO unifié) puis fallback nom+projet */
        let matchedRow = taskRows.find(r => r.externalTaskId === t.taskId);
        if (!matchedRow) {
          matchedRow = taskRows.find(r =>
            (r.tache || '') === (t.taskName || '') && r.projet === ghoProj.name);
        }
        if (!matchedRow) return;
        matchCount++;

        const daily = t.daily || {};
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

        /* Créer l'assignment même sans charge : la ressource est affectée à la tâche */
        const asgn = { resourceId: res.id, resourceNom: res.fullName || res.id };
        if (totalCharge > 0) {
          asgn.charge = Math.round(totalCharge * 10000) / 10000;
          asgn.daily  = { ...daily };
          if (minDate) asgn.debut = minDate;
          if (maxDate) asgn.fin   = maxDate;
        }
        matchedRow.assignments.push(asgn);
        syncCount++;
      });
    });
  });

  /* ── Étape 3 : recalculer charge (temps prévu total) pour chaque tâche ──
     chargePassee et chargeRestante sont calculées dynamiquement au rendu. */
  taskRows.forEach(r => {
    const asgns = r.assignments || [];
    if (asgns.length) {
      r.charge = Math.round(asgns.reduce((s, a) => s + (a.charge || 0), 0) * 10000) / 10000 || null;
    }
    /* Effacer les anciennes valeurs stockées — elles sont désormais calculées au rendu */
    r.chargePassee   = null;
    r.chargeRestante = null;
  });

  saveCurrentProject();
  renderAll();

  /* Mettre à jour le badge de synchro si le panneau d'édition est ouvert */
  const badge    = document.getElementById('epSyncBadge');
  const extInput = document.getElementById('epExternalId');
  if (badge && extInput && extInput.value) {
    badge.style.display = _isTaskSyncedWithGho(extInput.value) ? 'inline-flex' : 'none';
  }

  if (!silent) {
    if (matchCount === 0) {
      alert('Aucune correspondance trouvée entre les tâches du Gantt et les données GHO.');
    } else {
      alert(`Actualisation réussie :\n${syncCount} affectation(s) sur ${matchCount} tâche(s) correspondante(s).`);
    }
  }
}

/* Legacy aliases used elsewhere */
function renderResourceCalendarView() { _refreshResView(); }
/* Charge GHO (base ferme) — toujours la source de vérité dans la vue ressources */
function getChargeForResourceDay(resourceId, date) {
  const r   = resources.find(x => x.id === resourceId);
  const key = _dayKey(date);
  let total = 0;

  if (r && r.ghoData) {
    if (r.ghoData.projects) {
      r.ghoData.projects.forEach(ghoProj => {
        total += (ghoProj.tasks || []).reduce((s, t) => s + ((t.daily && t.daily[key]) || 0), 0);
      });
    } else {
      total += (r.ghoData.activities || []).reduce((s, a) => s + (a.daily[key] || 0), 0);
    }
  }

  return total;
}

/* Charge totale pour une ressource+jour avec prise en compte du mode planifié.
   Approche delta : GHO_tous + Σ(assignment - GHO_tâche) pour les projets sélectionnés usePlanned=true.
   Les tâches sans assignment gardent leur contribution GHO intacte (Q5 = a). */
function getPlannedLoadForResourceDay(rsid, dk) {
  /* dk = "DD/MM/YYYY" string */
  const r = resources.find(x => x.id === rsid);
  let total = 0;

  /* 1. Base : GHO complet pour tous les projets */
  if (r && r.ghoData) {
    if (r.ghoData.projects) {
      r.ghoData.projects.forEach(ghoProj => {
        total += (ghoProj.tasks || []).reduce((s, t) => s + ((t.daily && t.daily[dk]) || 0), 0);
      });
    } else if (r.ghoData.activities) {
      total += r.ghoData.activities.reduce((s, a) => s + ((a.daily && a.daily[dk]) || 0), 0);
    }
  }

  /* 2. Delta pour TOUS les projets du portfolio si le mode planifié global est actif */
  if (typeof usePlanned === 'undefined' || !usePlanned) return total;
  const plannedProjs = (typeof portfolio !== 'undefined') ? portfolio : [];

  if (!plannedProjs.length) return total;

  plannedProjs.forEach(proj => {
    (proj.rows || []).forEach(row => {
      if (row._type !== 'tache') return;
      const asgn = (row.assignments || []).find(a => a.resourceId === rsid);
      if (!asgn) return; /* pas d'assignment → contribution GHO inchangée */

      /* Valeur GHO de référence pour cette tâche spécifique */
      let ghoForTask = 0;
      if (r && r.ghoData && r.ghoData.projects) {
        const ghoProj = r.ghoData.projects.find(p => p.name === row.projet);
        if (ghoProj) {
          const ghoTask = (ghoProj.tasks || []).find(t =>
            (row.externalTaskId && t.taskId === row.externalTaskId) ||
            t.taskName === (row.tache || ''));
          ghoForTask = (ghoTask && ghoTask.daily && ghoTask.daily[dk]) || 0;
        }
      }

      const assignedValue = (asgn.daily && asgn.daily[dk]) || 0;
      total += assignedValue - ghoForTask; /* delta : remplace la part GHO de cette tâche */
    });
  });

  return total;
}

function getTasksForResourceDay(resourceId, dateKey) {
  /* Retourne { total, tasks:[{projet,tache,charge}] } — source GHO uniquement (base ferme) */
  const r = resources.find(x => x.id === resourceId);
  const items = [];

  if (r && r.ghoData) {
    if (r.ghoData.projects) {
      r.ghoData.projects.forEach(p => {
        (p.tasks || []).forEach(t => {
          const c = (t.daily && t.daily[dateKey]) || 0;
          if (c > 0) items.push({ projet: p.name || '—', tache: t.taskName || t.taskId || '—', charge: c });
        });
      });
    } else if (r.ghoData.activities) {
      r.ghoData.activities.forEach(a => {
        const c = a.daily[dateKey] || 0;
        if (c > 0) items.push({ projet: '—', tache: a.name || '—', charge: c });
      });
    }
  }

  const total = Math.round(items.reduce((s, x) => s + x.charge, 0) * 1000) / 1000;
  return { total, tasks: items };
}
