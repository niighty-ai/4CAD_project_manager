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

/* ── Reconstruction des projets dans le portfolio depuis les données GHO ──
   Stratégie :
   • Projet présent dans l'import ET dans le portfolio → tâches remplacées entièrement.
     Les jalons (issus de l'XML) et les métadonnées projet (couleurs, collapsed) sont conservés.
   • Projet présent dans le portfolio mais ABSENT de l'import → intouché.
   • Projet présent dans l'import mais absent du portfolio → créé.

   taskData : map 'client|projet|tKey' → {clientName, projName, niveaux, tache,
              taskId, debut, fin, chargePassee, chargeRestante}
   Retourne { projectsCreated, tasksImported }
   ─────────────────────────────────────────────────────────────────────────────── */
function _upsertPortfolioFromGHO(taskData, taskAssignmentMap = {}) {
  /* Sauvegarder l'état courant de l'affichage dans le portfolio avant toute modification */
  if (typeof _saveBackToPortfolio === 'function') _saveBackToPortfolio();

  let walletChanged   = false;
  let projectsCreated = 0;
  let tasksImported   = 0;
  let _idSeq          = 0;

  /* ── Regrouper les tâches par (clientName, projName) ── */
  const byProject = {};
  Object.values(taskData).forEach(task => {
    if (!task.projName || !task.tache) return;
    const pKey = `${task.clientName}|${task.projName}`;
    if (!byProject[pKey]) byProject[pKey] = { clientName: task.clientName, projName: task.projName, tasks: [] };
    byProject[pKey].tasks.push(task);
  });

  /* ── Traiter chaque projet présent dans l'import ── */
  Object.values(byProject).forEach(({ clientName, projName, tasks }) => {

    /* Trouver ou créer le projet */
    let proj = portfolio.find(p => p.name === projName && (p.client || '') === clientName);
    if (!proj) {
      _idSeq++;
      proj = {
        id: `p_${Date.now()}_${_idSeq}_${Math.random().toString(36).slice(2, 6)}`,
        name: projName,
        client: clientName,
        folder: '',
        rows: [],
        jalons: [],
        projectColors: {},
        collapsed: {}
      };
      portfolio.push(proj);
      projectsCreated++;
      if (clientName && !userWalletClients.has(clientName)) {
        userWalletClients.add(clientName);
        walletChanged = true;
      }
    }
    if (!proj.rows)   proj.rows   = [];
    if (!proj.jalons) proj.jalons = [];

    /* Remplacer TOUTES les tâches du projet par celles de l'import.
       Les jalons (XML) sont conservés dans proj.jalons — non touchés. */
    proj.rows = [];

    tasks.forEach(task => {
      const { niveaux, tache, taskId, tKey, debut, fin, chargePassee, chargeRestante } = task;
      if (!debut || !fin || isNaN(debut) || isNaN(fin)) return;

      /* Récupérer les assignments GHO pour cette tâche */
      const asgnKey     = `${projName}|${tKey || taskId || tache}`;
      const assignments = (taskAssignmentMap[asgnKey] || []).map(a => ({ ...a }));

      /* charge (temps prévu) = somme des charges journalières GHO par ressource */
      const totalCharge = assignments.reduce((s, a) => s + (a.charge || 0), 0);
      const charge      = totalCharge > 0 ? Math.round(totalCharge * 10000) / 10000 : null;

      /* chargeRestante = charge − chargePassee si charge GHO disponible */
      const chargeRest  = (charge != null && chargePassee != null)
        ? Math.round((charge - chargePassee) * 10000) / 10000
        : chargeRestante;  // fallback : Remaining Effort du fichier

      proj.rows.push({
        _type:          'tache',
        projet:         projName,
        niveaux,
        tache,
        debut,
        fin,
        charge,
        chargePassee,
        chargeRestante:  chargeRest,
        externalTaskId:  taskId || null,
        assignments
      });
      tasksImported++;
    });
  });

  /* ── Sauvegarder et rafraîchir ── */
  if (walletChanged && typeof saveUserWallet === 'function') saveUserWallet();
  savePortfolio();
  if (typeof renderNavList === 'function') renderNavList();

  /* Recharger la vue Gantt si un projet affiché a été modifié */
  if (selectedProjectIds.size > 0 && typeof _loadSelectedProjects === 'function') {
    _loadSelectedProjects();
    if (typeof renderAll === 'function') renderAll();
  }

  return { projectsCreated, tasksImported };
}

function parseGHOExcel(buffer) {
  /* Format attendu (vertical) :
     [Société] | Activity Name | [Full Name] | ID Task | Task Name |
     [Start Date] | [End Date] | [Expended Effort] | [Remaining Effort] |
     Resource User | Date | Charge (J)
     Une ligne par jour/tâche/ressource. La charge est en jours (virgule décimale fr).
     Les colonnes entre crochets sont optionnelles. Si "Start Date" et "End Date" sont
     présentes, le portfolio (clients / projets / tâches) est créé ou mis à jour
     automatiquement. L'import XML reste complémentaire pour les jalons et le détail
     par ressource non couvert ici. */
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

    /* ── Helpers de détection ── */
    const _findCol = (patterns, label) => {
      const idx = header.findIndex(h => patterns.some(p => p.test(h)));
      if (idx < 0) { alert(`Colonne "${label}" introuvable dans le fichier.`); }
      return idx;
    };
    const _findColOpt = patterns => header.findIndex(h => patterns.some(p => p.test(h)));

    /* ── Colonnes optionnelles (portfolio) détectées en premier pour éviter
       les faux positifs sur les colonnes requises "Date" et "Charge" ── */
    const colClient    = _findColOpt([/soci[eé]t[eé]|company|organisation|\bclient\b/]);
    const colFullName  = _findColOpt([/full[\s_]+name|chemin|full[\s_]+path/]);
    const colStartDate = _findColOpt([/start[\s_]+date|d[eé]but[\s_]+t[aâ]che|date[\s_]+d[eé]but/]);
    const colEndDate   = _findColOpt([/end[\s_]+date|fin[\s_]+t[aâ]che|date[\s_]+fin/]);
    const colExpended  = _findColOpt([/expended[\s_]+effort|temps[\s_]+pass[eé]|charge[\s_]+pass[eé]/]);
    const colRemaining = _findColOpt([/remaining[\s_]+effort|temps[\s_]+restant|charge[\s_]+restante/]);

    /* ── Colonnes requises ── */
    const colRes      = _findCol([/ressource|resource[\s_-]?user|\buser\b|\bnom\b/],         'Resource / Ressource');
    const colProj     = _findCol([/activit[yé][\s_-]?name|scoped[\s_:]?with|activit[éye]|projet|project/], 'Activity Name / Projet');
    const colTaskId   = _findCol([/\bid[\s_-]?task\b|\btask[\s_-]?id\b/],                    'ID Task');
    const colTaskName = _findCol([/task[\s_:]+name|nom[\s_-]?t[aâ]che/],                      'Task Name');

    /* "Date" (charge ressource) : exclure les indices déjà pris par Start/End Date */
    const _skipDateIdx = new Set([colStartDate, colEndDate].filter(i => i >= 0));
    const colDate = (() => {
      const idx = header.findIndex((h, i) => !_skipDateIdx.has(i) && /\bdate\b/.test(h));
      if (idx < 0) alert('Colonne "Date" introuvable dans le fichier.');
      return idx;
    })();

    /* "Charge (J)" : on n'utilise PAS "effort" comme pattern (trop ambigu avec
       Expended/Remaining Effort). Le mécanisme _skipChargeIdx reste en sécurité. */
    const _skipChargeIdx = new Set([colExpended, colRemaining].filter(i => i >= 0));
    const colCharge = (() => {
      const idx = header.findIndex((h, i) => !_skipChargeIdx.has(i) && /\bcharge\b|^jours?\b|^load\b/.test(h));
      if (idx < 0) alert('Colonne "Charge (J)" introuvable dans le fichier.');
      return idx;
    })();

    if ([colRes, colProj, colDate, colCharge].some(c => c < 0)) return;

    /* L'import portfolio est activé si les colonnes de dates de tâche sont présentes */
    const doPortfolioImport = colStartDate >= 0 && colEndDate >= 0;

    /* ── Lecture des lignes ── */
    /* parsed  : { resName → { projName → { tKey → { taskId, taskName, daily } } } } */
    /* taskData: { 'client|proj|tKey' → task-level info } (si doPortfolioImport) */
    const parsed   = {};
    const taskData = {};
    /* seenRes : toutes les ressources rencontrées dans le fichier, même si Charge (J) = 0.
       Sert à vider les anciennes données GHO pour ces ressources même quand elles
       n'ont aucune charge réelle dans l'import courant. */
    const seenRes = new Set();

    for (let ri = headerRowIdx + 1; ri < raw.length; ri++) {
      const row = raw[ri];
      if (!row) continue;
      const projName = _normalizeExcelStr(row[colProj]);
      if (!projName) continue;

      const taskId   = colTaskId   >= 0 ? _normalizeExcelStr(row[colTaskId])   : '';
      const taskName = colTaskName >= 0 ? _normalizeExcelStr(row[colTaskName]) : '';
      const tKey     = taskId || taskName || '__default__';

      /* ── Collecte données portfolio (indépendante de la charge ressource) ──
         Exécutée pour toutes les lignes ayant un projet, même si Charge (J) est vide. */
      if (doPortfolioImport) {
        const clientName  = colClient   >= 0 ? (_normalizeExcelStr(row[colClient])   || '') : '';
        const fullNameRaw = colFullName >= 0 ? (_normalizeExcelStr(row[colFullName]) || '') : '';

        /* Déduire niveaux + nom de tâche depuis Full Name (séparateur ">") */
        const parts   = fullNameRaw ? fullNameRaw.split(/>/).map(s => s.trim()).filter(Boolean) : [];
        const niveaux = parts.length > 1 ? parts.slice(0, -1) : [];
        const tache   = parts.length > 0 ? parts[parts.length - 1] : (taskName || taskId);

        const dataKey = `${clientName}|${projName}|${tKey}`;
        if (!taskData[dataKey]) {
          /* Dates de la tâche (globales — pas celles de la ligne ressource) */
          const startStr  = _parseDateValue(row[colStartDate]);
          const endStr    = _parseDateValue(row[colEndDate]);
          const debutTask = startStr ? parseDate(startStr) : null;
          const finTask   = endStr   ? parseDate(endStr)   : null;

          const rawExp = colExpended  >= 0 ? row[colExpended]  : null;
          const rawRem = colRemaining >= 0 ? row[colRemaining] : null;
          const cpVal  = rawExp != null ? parseFloat(String(rawExp).replace(',', '.'))  : null;
          const crVal  = rawRem != null ? parseFloat(String(rawRem).replace(',', '.')) : null;

          taskData[dataKey] = {
            clientName, projName, niveaux, tache, taskId, tKey,
            debut:          debutTask,
            fin:            finTask,
            chargePassee:   (cpVal != null && !isNaN(cpVal)  && cpVal  >= 0) ? cpVal  : null,
            chargeRestante: (crVal != null && !isNaN(crVal) && crVal >= 0) ? crVal : null
          };
        }
      }

      /* ── Collecte données charge ressource ──
         La relation ressource↔tâche est enregistrée AVANT le test de date et AVANT le test de charge,
         pour que les ressources affectées sans charge journalière restent visibles même si
         aucune date n'est renseignée pour cette ligne dans le fichier GHO. */
      const resName = _normalizeExcelStr(row[colRes]);
      if (!resName) continue;

      /* Enregistrer la ressource comme "vue dans ce fichier" même si charge = 0 */
      seenRes.add(resName);

      /* Créer l'entrée parsed ressource↔tâche même sans date et même si charge = 0 :
         la relation d'affectation est enregistrée dès qu'une ligne existe pour cette ressource,
         quelle que soit la présence d'une date ou d'une charge journalière. */
      if (!parsed[resName])             parsed[resName]           = {};
      if (!parsed[resName][projName])   parsed[resName][projName] = {};
      if (!parsed[resName][projName][tKey]) {
        parsed[resName][projName][tKey] = { taskId, taskName: taskName || taskId, daily: {} };
      }

      const dateKey = _parseDateValue(row[colDate]);
      if (!dateKey) continue;

      const chargeRaw = row[colCharge];
      const jours = parseFloat(String(chargeRaw ?? '').replace(',', '.'));
      if (!jours || jours <= 0) continue; /* Charge nulle/vide → pas d'entrée daily */

      const daily = parsed[resName][projName][tKey].daily;
      daily[dateKey] = Math.round(((daily[dateKey] || 0) + jours) * 10000) / 10000;
    }

    /* ── Construire la map ressource↔tâche pour peupler les assignments du portfolio ──
       Clé : 'projName|tKey' → [{ resourceId, resourceNom, charge?, daily?, debut?, fin? }]
       Construit à partir de parsed (déjà complet) et de resources[]. */
    const taskAssignmentMap = {};
    Object.entries(parsed).forEach(([resName, projMap]) => {
      const res = _findResourceByName(resName);
      if (!res) return;
      Object.entries(projMap).forEach(([pName, taskMap]) => {
        Object.entries(taskMap).forEach(([tKey, taskInfo]) => {
          const key = `${pName}|${tKey}`;
          if (!taskAssignmentMap[key]) taskAssignmentMap[key] = [];
          const daily = taskInfo.daily || {};
          let totalCharge = 0, minDate = null, maxDate = null;
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
          const asgn = { resourceId: res.id, resourceNom: res.fullName || res.id };
          if (totalCharge > 0) {
            asgn.charge = Math.round(totalCharge * 10000) / 10000;
            asgn.daily  = { ...daily };
            if (minDate) asgn.debut = minDate;
            if (maxDate) asgn.fin   = maxDate;
          }
          taskAssignmentMap[key].push(asgn);
        });
      });
    });

    /* ── Mise à jour du portfolio si colonnes portfolio présentes ── */
    let portfolioStats = null;
    if (doPortfolioImport && Object.keys(taskData).length > 0) {
      portfolioStats = _upsertPortfolioFromGHO(taskData, taskAssignmentMap);
    }

    /* ── Mise à jour ghoData des ressources ── */
    const now        = new Date();
    const importDate = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
    const missing    = [];
    let   updated    = 0;

    /* 1. Ressources avec des charges effectives → mettre à jour */
    Object.entries(parsed).forEach(([resName, projMap]) => {
      const res = _findResourceByName(resName);
      if (!res) { missing.push(resName); return; }

      const projects = Object.entries(projMap)
        .map(([projName, taskMap]) => ({
          name : projName,
          tasks: Object.values(taskMap)  // inclut les tâches sans charge (daily:{}) pour conserver les assignations
        }))
        .filter(p => p.tasks.length > 0);

      /* Toujours écrire ghoData, même si projects est vide, pour écraser les anciennes données */
      res.ghoData = { importDate, projects };
      updated++;
    });

    /* 2. Ressources vues dans le fichier mais sans aucune charge réelle (Charge J = 0 partout)
          → vider explicitement leurs anciennes données GHO pour éviter les résidus */
    seenRes.forEach(resName => {
      if (parsed[resName]) return; /* Déjà traitée ci-dessus */
      const res = _findResourceByName(resName);
      if (!res) return; /* Introuvable — déjà dans missing si nécessaire */
      res.ghoData = { importDate, projects: [] }; /* Vide → plus de charges affichées */
    });

    saveResources(); // métadonnées → gantt_resources
    saveGhoData();   // charges/projets/tâches → gantt_gho
    _setSyncBtnState('stale');
    _refreshResView();

    if (missing.length > 0) {
      _showMissingResPopup(missing, updated);
    } else {
      const pMsg = portfolioStats
        ? `\n• ${portfolioStats.projectsCreated} projet(s) créé(s), ${portfolioStats.tasksImported} tâche(s) importées`
        : '';
      alert(`Import GHO ✓\n• ${updated} ressource(s) mise(s) à jour${pMsg}`);
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

/* État visuel du bouton Sync charges : 'stale' = rouge (données GHO plus récentes), 'fresh' = vert (synchro OK) */
function _setSyncBtnState(state) {
  const btn = document.getElementById('btnSyncCharges');
  if (!btn) return;
  btn.classList.remove('btn-sync-stale', 'btn-sync-fresh');
  if (state === 'stale') btn.classList.add('btn-sync-stale');
  else if (state === 'fresh') btn.classList.add('btn-sync-fresh');
}

/* Bouton ⟳ Sync charges : reconstruit les assignments et les charges depuis GHO.
   charge (temps prévu)   = somme des charges journalières GHO par ressource
   chargePassee           = conservée telle quelle (issue de l'import XML)
   chargeRestante         = charge − chargePassee                             */
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

  /* ── Étape 3 : calculer charge et chargeRestante pour chaque tâche ──
     charge       = somme des charges journalières de toutes les ressources
     chargeRestante = charge − chargePassee (temps prévu − temps passé)    */
  taskRows.forEach(r => {
    const asgns = r.assignments || [];
    if (asgns.length) {
      r.charge = Math.round(asgns.reduce((s, a) => s + (a.charge || 0), 0) * 10000) / 10000 || null;
    }
    if (r.charge != null) {
      r.chargeRestante = (r.chargePassee != null)
        ? Math.round((r.charge - r.chargePassee) * 10000) / 10000
        : r.charge;
    }
  });

  saveCurrentProject();
  renderAll();

  /* Mettre à jour le badge de synchro si le panneau d'édition est ouvert */
  const badge    = document.getElementById('epSyncBadge');
  const extInput = document.getElementById('epExternalId');
  if (badge && extInput && extInput.value) {
    badge.style.display = _isTaskSyncedWithGho(extInput.value) ? 'inline-flex' : 'none';
  }

  _setSyncBtnState('fresh');

  if (!silent) {
    if (matchCount === 0) {
      alert('Aucune correspondance trouvée entre les tâches du Gantt et les données GHO.');
    } else {
      alert(`Synchronisation réussie :\n${syncCount} affectation(s) sur ${matchCount} tâche(s) correspondante(s).`);
    }
  }
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
