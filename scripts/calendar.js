/* ═══════════════════════════════════════════
   calendar.js — Planificateur horaire journalier
   • Les dates sont pilotées par la BDD (non modifiables ici)
   • L'utilisateur positionne les tâches dans la journée (heure de début)
   • Les positions sont sauvegardées dans Firebase ET localStorage
   • Détection des charges modifiées depuis la dernière sauvegarde
   • L'export ICS ne couvre que les semaines planifiées (au moins 1 événement positionné)
   ═══════════════════════════════════════════ */

/* ── Constantes ────────────────────────────────────────────────────────────── */
const CAL_START_MIN         = 7  * 60;  // 07:00 — début de la grille
const CAL_END_MIN           = 20 * 60;  // 20:00 — fin de la grille
const CAL_DEFAULT_START_MIN = 8  * 60;  // 08:00 — position par défaut des tâches
const CAL_DEFAULT_END_MIN   = 17 * 60;  // 17:00 — fin plage par défaut (indicatif)
const CAL_HOURS_PER_DAY     = 7;        // 1 jour de charge = 7 h de travail
const CAL_PX_PER_MIN        = 1.5;      // pixels par minute
const CAL_SNAP_MIN          = 15;       // snap à 15 min

/* ── État ──────────────────────────────────────────────────────────────────── */
let calWeekStart   = null;
let calSelectedRes = '';
let calPositions   = {};   // { eventKey: startMinutes }  — source de vérité (Firebase + localStorage)
let calChecksums   = {};   // { eventKey: charge }        — snapshot des charges à la dernière sauvegarde
let calDraft       = {};   // { eventKey: startMinutes }  — modifications non encore sauvegardées
let calSplits      = {};   // { eventKey: [{startMin, durMin}] } — segments d'une tâche découpée
let calHidden      = new Set(); // eventKeys retirés du calendrier (sans supprimer de la BDD)
let _calSplitsBackup  = {};
let _calHiddenBackup  = new Set();
let calDirty       = false;
let _calDragState  = null;
let _calClickSetup = false;

/* ── Clé localStorage ──────────────────────────────────────────────────────── */
function _calStorageKey() {
  return `gantt4cad_calpos_${currentUserId || 'anon'}`;
}

/* ── Persistance localStorage ──────────────────────────────────────────────── */
function _calWriteLocalStorage() {
  try {
    localStorage.setItem(_calStorageKey(), JSON.stringify({
      positions: calPositions,
      checksums: calChecksums,
      splits:    calSplits,
      hidden:    [...calHidden]
    }));
  } catch(e) {}
}

function _calReadLocalStorage() {
  try {
    const raw = localStorage.getItem(_calStorageKey());
    if (raw) {
      const d = JSON.parse(raw);
      calPositions = d.positions || {};
      calChecksums = d.checksums || {};
      calSplits    = d.splits    || {};
      calHidden    = new Set(d.hidden || []);
    } else {
      calPositions = {};
      calChecksums = {};
      calSplits    = {};
      calHidden    = new Set();
    }
  } catch(e) {
    calPositions = {};
    calChecksums = {};
    calSplits    = {};
    calHidden    = new Set();
  }
  calDraft          = {};
  calDirty          = false;
  _calSplitsBackup  = JSON.parse(JSON.stringify(calSplits));
  _calHiddenBackup  = new Set(calHidden);
}

/* ── Sauvegarde vers Firebase ──────────────────────────────────────────────── */
function _calSaveToFirebase() {
  if (typeof window._fbSetCalPositions !== 'function' || !currentUserId) return;
  window._fbSetCalPositions(currentUserId, {
    positions: calPositions,
    checksums: calChecksums,
    splits:    calSplits,
    hidden:    [...calHidden],
    savedAt:   new Date().toISOString()
  });
}

/* ── Chargement depuis Firebase (async, s'exécute après le rendu localStorage) */
function _calLoadFromFirebase() {
  if (typeof window._fbGetCalPositions !== 'function' || !currentUserId) return;
  window._fbGetCalPositions(currentUserId, (data) => {
    if (data && typeof data.positions === 'object') {
      calPositions      = data.positions || {};
      calChecksums      = data.checksums || {};
      calSplits         = data.splits    || {};
      calHidden         = new Set(data.hidden || []);
      calDraft          = {};
      calDirty          = false;
      _calSplitsBackup  = JSON.parse(JSON.stringify(calSplits));
      _calHiddenBackup  = new Set(calHidden);
      /* Synchroniser localStorage avec Firebase */
      _calWriteLocalStorage();
    }
    /* Vérifier les incohérences de charges */
    _calToggleWarning(_calCheckSync());
    _calRender();
  });
}

/* ── Helpers date ──────────────────────────────────────────────────────────── */
function _calDateStr(d) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function _calAddDays(d, n) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function _calMonday(date)  {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - ((d.getDay()+6)%7));
  return d;
}
function _calWeekDays()   { return [0,1,2,3,4].map(i => _calAddDays(calWeekStart, i)); }
function _calFmtMin(min)  {
  return `${String(Math.floor(min/60)).padStart(2,'0')}h${String(min%60).padStart(2,'0')}`;
}
function _calFmt(n) {
  return Number.isInteger(n) ? String(n) : Number(n).toFixed(2).replace(/\.?0+$/,'');
}

/* ── Point d'entrée (appelé par le router) ─────────────────────────────────── */
function renderCalendarView() {
  if (!calWeekStart) calWeekStart = _calMonday(new Date());
  /* 1. Rendu immédiat depuis localStorage */
  _calReadLocalStorage();
  _calPopulateResources();
  _calToggleWarning(_calCheckSync());
  _calRender();
  /* 2. Mise à jour asynchrone depuis Firebase */
  _calLoadFromFirebase();
  /* 3. Délégation de clic (une seule fois) */
  if (!_calClickSetup) {
    _calClickSetup = true;
    const grid = document.getElementById('calWeekGrid');
    if (grid) {
      grid.addEventListener('click', _calHandleGridClick);
    }
    document.addEventListener('click', function(e) {
      if (!e.target.closest('#calWeekGrid') && !e.target.closest('.cal-action-panel')) {
        _calDismissActions();
      }
    });
  }
}

/* ── Dropdown ressources ───────────────────────────────────────────────────── */
function _calPopulateResources() {
  const sel = document.getElementById('calResourceSelect');
  if (!sel) return;
  const prev  = calSelectedRes || sel.value;
  const names = new Set();
  for (const proj of portfolio) {
    for (const row of (proj.rows||[])) {
      for (const asgn of (row.assignments||[])) {
        if (asgn.resourceNom) names.add(asgn.resourceNom);
      }
    }
  }
  sel.innerHTML = '<option value="">— Sélectionner une ressource —</option>';
  [...names].sort().forEach(n => {
    const o = document.createElement('option');
    o.value = o.textContent = n;
    if (n === prev) o.selected = true;
    sel.appendChild(o);
  });

  if (names.has(prev)) {
    /* Conserver la sélection courante */
    calSelectedRes = prev;
  } else {
    /* Première ouverture ou ressource introuvable : déduire depuis l'email connecté */
    const guessed  = _calGuessResourceFromEmail(names);
    calSelectedRes = guessed || '';
  }
  sel.value = calSelectedRes;
}

/* ── Déduction de la ressource à partir de l'email connecté ─────────────────
   Format attendu : initiale_prénom + nom_complet @4cad.fr
   Exemple : ghomere@4cad.fr  →  initial=g, nom=homere  →  Gaël HOMERE        */
/* ── Déduction de la ressource à partir de l'email connecté ─────────────────
   Format : initiales_prénom (1–4 chars) + nom_complet (potentiellement partiel)
   Gère :
     prénoms composés    jpdupont   → Jean-Pierre DUPONT
     noms avec particule jdebois    → Jean DE BOIS   (ou jbois)
     noms composés       jmartin    → Jean MARTIN-DUPONT (si pas de Jean MARTIN)
     noms multimots      pvanderberg / pberg → Pierre VAN DER BERG

   Algorithme :
     Pour chaque découpage possible du nom de ressource (N mots → N-1 splits),
     on génère les initiales du prénom et plusieurs variantes du nom de famille
     (version plate, suffixes, version sans particules, tokens significatifs).
     On essaie d'abord les correspondances exactes, puis partielles.          */
function _calGuessResourceFromEmail(names) {
  const email = (document.getElementById('connectedUser')?.textContent || '').trim();
  if (!email.includes('@')) return '';
  const local = _calNorm(email.split('@')[0]);
  if (local.length < 2) return '';

  /* Initiales d'une chaîne prénom (tirets et espaces) */
  const getInit = s =>
    s.split(/[\s\-]+/).filter(Boolean).map(p => _calNorm(p)[0] || '').join('');

  /* Particules courantes à ignorer pour la variante "sans particule" */
  const PARTICLES = new Set(['de','du','des','le','la','les','d','van','von','der',
                              'del','di','da','au','aux','l','el']);

  /* Variantes d'un nom de famille : flat, suffixes, tokens significatifs, sans particules */
  function lastVariants(lastStr) {
    const tokens = _calNorm(lastStr).split(/[\s\-]+/).filter(Boolean);
    const v = new Set();
    v.add(tokens.join(''));                          // ex: delatour, martindupont
    for (let i = 1; i < tokens.length; i++)
      v.add(tokens.slice(i).join(''));               // ex: latour, tour, dupont
    tokens.forEach(t => { if (t.length > 2 && !PARTICLES.has(t)) v.add(t); }); // ex: tour, martin
    const sig = tokens.filter(t => !PARTICLES.has(t));
    if (sig.length && sig.length < tokens.length)
      v.add(sig.join(''));                           // ex: latour (sans "de")
    return v;
  }

  /* Pour un nom complet, générer tous les couples (initiales_prénom, variantes_nom)
     en testant chaque point de découpage prénom | nom de famille               */
  function candidates(fullName) {
    const tokens = fullName.trim().split(/\s+/).filter(Boolean);
    const out = [];
    for (let s = 1; s < tokens.length; s++) {
      out.push({
        init: getInit(tokens.slice(0, s).join(' ')),
        vars: lastVariants(tokens.slice(s).join(' '))
      });
    }
    return out;
  }

  /* Tentative de correspondance : exactInitials=true pour la passe 1 */
  function tryMatch(exactInitials) {
    for (let i = 1; i <= Math.min(4, local.length - 1); i++) {
      const ei = local.slice(0, i);   // initiales email
      const el = local.slice(i);      // nom email
      for (const name of names) {
        for (const { init, vars } of candidates(name)) {
          const initOk = exactInitials ? init === ei : init.startsWith(ei);
          if (!initOk) continue;
          if (vars.has(el)) return name;                          // exact
          if (el.length >= 3) for (const v of vars)
            if (v.startsWith(el)) return name;                   // email tronqué
        }
      }
    }
    return '';
  }

  return tryMatch(true) || tryMatch(false);
}

/* Normalisation : minuscules + suppression des accents */
function _calNorm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}


function onCalResourceChange() {
  calSelectedRes = document.getElementById('calResourceSelect').value;
  _calToggleWarning(_calCheckSync());
  _calRender();
}

/* ── Navigation semaine ────────────────────────────────────────────────────── */
function calPrevWeek() { calWeekStart = _calAddDays(calWeekStart,-7); _calRender(); }
function calNextWeek() { calWeekStart = _calAddDays(calWeekStart, 7); _calRender(); }
function calGoToday()  { calWeekStart = _calMonday(new Date());       _calRender(); }

/* ── Rendu ─────────────────────────────────────────────────────────────────── */
function _calRender() {
  _calUpdateLabel();
  _calRenderGrid();
}

function _calUpdateLabel() {
  const days = _calWeekDays();
  const d0=days[0], d4=days[4];
  const fmt = d => d.toLocaleDateString('fr-FR',{day:'2-digit',month:'long'});
  const el  = document.getElementById('calWeekLabel');
  if (el) el.textContent = `Semaine du ${fmt(d0)} au ${fmt(d4)} ${d4.getFullYear()}`;
  const todayMon = _calMonday(new Date());
  document.getElementById('calTodayBtn')
    ?.classList.toggle('cal-today-active', calWeekStart.getTime()===todayMon.getTime());
}

/* ── Clé d'événement ─────────────────────────────────────────────────────────*/
function _calEventKey(projId, rowIdx, resKey, date) {
  return `${projId}|${rowIdx}|${resKey}|${date}`;
}

/* ── Extraction des événements pour une date ───────────────────────────────── */
function _calGetEventsForDate(dateStr) {
  if (!calSelectedRes) return [];
  const events = [];
  for (const proj of portfolio) {
    (proj.rows||[]).forEach((row,rowIdx) => {
      if (row._type !== 'tache') return;
      for (const asgn of (row.assignments||[])) {
        if (asgn.resourceNom !== calSelectedRes) continue;
        const charge = (asgn.daily||{})[dateStr];
        if (!charge) continue;
        const resKey   = asgn.resourceId || asgn.resourceNom;
        const key      = _calEventKey(proj.id, rowIdx, resKey, dateStr);
        if (calHidden.has(key)) continue;  // Retirée du calendrier
        const projName = row.projet || proj.name || '';
        const taskName = row.tache  || '';
        events.push({
          key, charge,
          label:    `${escH(projName)} – ${escH(taskName)}`,
          rawLabel: `${projName} - ${taskName}`,
          color: projectColors[projName] || projectColors[proj.name] || '#3b82f6'
        });
      }
    });
  }
  return events;
}

/* ── Position de départ (draft > sauvegardé > empilage par défaut 8h) ──────── */
function _calGetStartMin(key, idx, events) {
  if (calDraft[key]     !== undefined) return calDraft[key];
  if (calPositions[key] !== undefined) return calPositions[key];
  /* Empiler les événements sans position depuis CAL_DEFAULT_START_MIN (8h) */
  let cursor = CAL_DEFAULT_START_MIN;
  for (let i=0; i<idx; i++) {
    const p = events[i];
    if (calDraft[p.key]===undefined && calPositions[p.key]===undefined && !calSplits[p.key]) {
      cursor += Math.round(p.charge * CAL_HOURS_PER_DAY * 60);
    }
  }
  return Math.min(cursor, CAL_END_MIN - 30);
}

/* ── Rendu de la grille ────────────────────────────────────────────────────── */
const _CAL_DAYS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];

function _calRenderGrid() {
  const grid = document.getElementById('calWeekGrid');
  if (!grid) return;

  if (!calSelectedRes) {
    grid.innerHTML = `
      <div class="cal-empty-state">
        <div class="cal-empty-icon">📅</div>
        <div class="cal-empty-text">Sélectionnez une ressource pour afficher son calendrier</div>
      </div>`;
    return;
  }

  const totalPx  = (CAL_END_MIN - CAL_START_MIN) * CAL_PX_PER_MIN;
  const todayStr = _calDateStr(new Date());
  const nowMin   = new Date().getHours()*60 + new Date().getMinutes();
  const days     = _calWeekDays();

  /* Lignes horaires (partagées entre colonnes) */
  const hourLines = [];
  for (let h=Math.floor(CAL_START_MIN/60); h<=Math.floor(CAL_END_MIN/60); h++) {
    const top = (h*60 - CAL_START_MIN) * CAL_PX_PER_MIN;
    hourLines.push(
      `<div class="cal-hour-line" style="top:${top}px">` +
      `<span class="cal-hour-label">${String(h).padStart(2,'0')}:00</span></div>`
    );
  }
  const hourHTML = hourLines.join('');

  grid.innerHTML = days.map((d, i) => {
    const dateStr  = _calDateStr(d);
    const isToday  = dateStr === todayStr;
    const events   = _calGetEventsForDate(dateStr);
    const dayShort = d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});
    const total    = events.reduce((s,e)=>s+e.charge, 0);

    const nowHTML = (isToday && nowMin>=CAL_START_MIN && nowMin<=CAL_END_MIN)
      ? `<div class="cal-now-line" style="top:${(nowMin-CAL_START_MIN)*CAL_PX_PER_MIN}px"></div>`
      : '';

    const evHTML = events.flatMap((ev, idx) => {
      const totalDurMin = Math.round(ev.charge * CAL_HOURS_PER_DAY * 60);
      const ek = ev.key.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

      /* ── Tâche découpée en segments ── */
      if (calSplits[ev.key] && calSplits[ev.key].length) {
        return calSplits[ev.key].map((seg, si) => {
          const topPx    = (seg.startMin - CAL_START_MIN) * CAL_PX_PER_MIN;
          const heightPx = Math.max(26, seg.durMin * CAL_PX_PER_MIN);
          const nb = calSplits[ev.key].length;
          const canSplit = seg.durMin >= 30;
          return `
            <div class="cal-event cal-event-segment"
                 style="top:${topPx}px;height:${heightPx}px;--ev-color:${ev.color};"
                 data-key="${ev.key}" data-seg="${si}"
                 onmousedown="_calDragStart(event,'${ek}',${si})">
              <div class="cal-event-time">${_calFmtMin(seg.startMin)} – ${_calFmtMin(seg.startMin+seg.durMin)}</div>
              <div class="cal-event-label">${ev.label}</div>
              <span class="cal-event-charge">${si+1}/${nb} &middot; ${_calFmt(ev.charge)}&thinsp;j</span>
                </div>`;
        });
      }

      /* ── Tâche normale (non découpée) ── */
      const startMin = _calGetStartMin(ev.key, idx, events);
      const topPx    = (startMin - CAL_START_MIN) * CAL_PX_PER_MIN;
      const heightPx = Math.max(26, totalDurMin * CAL_PX_PER_MIN);
      const isDraft  = calDraft[ev.key] !== undefined;
      return [`
        <div class="cal-event${isDraft?' cal-event-draft':''}"
             style="top:${topPx}px;height:${heightPx}px;--ev-color:${ev.color};"
             data-key="${ev.key}" data-seg="-1"
             onmousedown="_calDragStart(event,'${ek}',-1)">
          <div class="cal-event-time">${_calFmtMin(startMin)} – ${_calFmtMin(startMin+totalDurMin)}</div>
          <div class="cal-event-label">${ev.label}</div>
          <span class="cal-event-charge">${_calFmt(ev.charge)}&thinsp;j</span>
        </div>`];
    }).join('');

    return `
      <div class="cal-day-col${isToday?' cal-today':''}">
        <div class="cal-day-header">
          <span class="cal-day-name">${_CAL_DAYS[i]}</span>
          <span class="cal-day-date">${dayShort}</span>
          ${total>0?`<span class="cal-day-total">${_calFmt(total)}&thinsp;j</span>`:''}
        </div>
        <div class="cal-day-scroll">
          <div class="cal-day-body" style="height:${totalPx}px;">
            ${hourHTML}${nowHTML}${evHTML}
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ── Drag vertical ─────────────────────────────────────────────────────────── */
function _calDragStart(e, key, segIdx = -1) {
  e.preventDefault();
  const evEl    = e.currentTarget;
  _calDragState = { key, segIdx, evEl, startMouseY: e.clientY, startTop: parseFloat(evEl.style.top)||0, moved: false };
  document.addEventListener('mousemove', _calDragMove);
  document.addEventListener('mouseup',   _calDragEnd);
}

function _calDragMove(e) {
  if (!_calDragState) return;
  const { evEl, startMouseY, startTop } = _calDragState;
  const delta = e.clientY - startMouseY;
  if (!_calDragState.moved && Math.abs(delta) > 5) {
    _calDragState.moved = true;
    evEl.classList.add('cal-dragging');
    _calDismissActions();
  }
  if (_calDragState.moved) {
    const maxTop = (CAL_END_MIN - CAL_START_MIN) * CAL_PX_PER_MIN - 26;
    evEl.style.top = `${Math.max(0, Math.min(maxTop, startTop + delta))}px`;
  }
}

function _calDragEnd(e) {
  if (!_calDragState) return;
  const { key, segIdx, evEl, moved } = _calDragState;
  _calDragState = null;
  document.removeEventListener('mousemove', _calDragMove);
  document.removeEventListener('mouseup',   _calDragEnd);
  evEl.classList.remove('cal-dragging');

  if (!moved) {
    /* Clic simple → afficher/masquer les boutons d'action */
    _calToggleActive(evEl);
    return;
  }

  const topPx   = parseFloat(evEl.style.top) || 0;
  const rawMin  = CAL_START_MIN + topPx / CAL_PX_PER_MIN;
  const snapped = Math.round(rawMin / CAL_SNAP_MIN) * CAL_SNAP_MIN;
  const clamped = Math.max(CAL_START_MIN, Math.min(CAL_END_MIN - CAL_SNAP_MIN, snapped));

  if (segIdx >= 0 && calSplits[key] && calSplits[key][segIdx]) {
    /* Segment déplacé */
    calSplits[key][segIdx].startMin = clamped;
  } else {
    /* Événement normal déplacé */
    calDraft[key] = clamped;
  }
  calDirty = true;
  const actions = document.getElementById('calDirtyActions');
  if (actions) actions.style.display = '';
  _calRender();
}

/* ── Checksums : snapshot des charges actuelles pour tous les événements positionnés */
function _calComputeChecksums() {
  const cs = {};
  for (const key of Object.keys(calPositions)) {
    const [projId, rowIdxStr, resKey, dateStr] = key.split('|');
    const rowIdx = parseInt(rowIdxStr, 10);
    const proj   = portfolio.find(p => p.id === projId);
    if (!proj) continue;
    const row    = (proj.rows||[])[rowIdx];
    if (!row) continue;
    const asgn   = row.assignments?.find(a => (a.resourceId||a.resourceNom) === resKey);
    if (!asgn) continue;
    const charge = (asgn.daily||{})[dateStr];
    if (charge !== undefined) cs[key] = charge;
  }
  return cs;
}

/* ── Détection des incohérences de charges ──────────────────────────────────── */
function _calCheckSync() {
  if (Object.keys(calPositions).length === 0) return false;
  for (const key of Object.keys(calPositions)) {
    const savedCharge = calChecksums[key];
    if (savedCharge === undefined) continue; // pas de checksum, pas de vérification
    const [projId, rowIdxStr, resKey, dateStr] = key.split('|');
    const rowIdx = parseInt(rowIdxStr, 10);
    const proj   = portfolio.find(p => p.id === projId);
    if (!proj) return true;
    const row    = (proj.rows||[])[rowIdx];
    if (!row) return true;
    const asgn   = row.assignments?.find(a => (a.resourceId||a.resourceNom) === resKey);
    if (!asgn) return true;
    const current = (asgn.daily||{})[dateStr];
    if (current === undefined || current !== savedCharge) return true;
  }
  return false;
}

/* ── Affichage / masquage de la bannière d'avertissement ────────────────────── */
function _calToggleWarning(show) {
  const el = document.getElementById('calSyncWarning');
  if (el) el.style.display = show ? '' : 'none';
}

/* ── Resynchronisation : supprime les positions dont la charge a changé ──────── */
function calResync() {
  const toRemove = [];
  for (const key of Object.keys(calPositions)) {
    const [projId, rowIdxStr, resKey, dateStr] = key.split('|');
    const rowIdx = parseInt(rowIdxStr, 10);
    const proj   = portfolio.find(p => p.id === projId);
    if (!proj) { toRemove.push(key); continue; }
    const row    = (proj.rows||[])[rowIdx];
    if (!row)  { toRemove.push(key); continue; }
    const asgn   = row.assignments?.find(a => (a.resourceId||a.resourceNom) === resKey);
    if (!asgn) { toRemove.push(key); continue; }
    const savedCharge   = calChecksums[key];
    const currentCharge = (asgn.daily||{})[dateStr];
    if (savedCharge !== undefined && (currentCharge === undefined || currentCharge !== savedCharge)) {
      toRemove.push(key);
    }
  }
  toRemove.forEach(k => { delete calPositions[k]; delete calChecksums[k]; });
  _calToggleWarning(false);
  _calWriteLocalStorage();
  _calSaveToFirebase();
  _calRender();
}

function calDismissWarning() {
  _calToggleWarning(false);
}

/* ── Sauvegarde ────────────────────────────────────────────────────────────── */
function saveCalendar() {
  Object.assign(calPositions, calDraft);
  calDraft          = {};
  calDirty          = false;
  calChecksums      = _calComputeChecksums();
  _calSplitsBackup  = JSON.parse(JSON.stringify(calSplits));
  _calHiddenBackup  = new Set(calHidden);
  const actions     = document.getElementById('calDirtyActions');
  if (actions) actions.style.display = 'none';
  _calWriteLocalStorage();
  _calSaveToFirebase();
  _calToggleWarning(false);
  _calRender();
}

/* ── Annulation ────────────────────────────────────────────────────────────── */
function cancelCalendar() {
  calDraft    = {};
  calDirty    = false;
  calSplits   = JSON.parse(JSON.stringify(_calSplitsBackup));
  calHidden   = new Set(_calHiddenBackup);
  const actions = document.getElementById('calDirtyActions');
  if (actions) actions.style.display = 'none';
  _calRender();
}

/* ── Semaines planifiées (au moins 1 événement positionné par l'utilisateur) ── */
function _calGetWorkedWeekMondays() {
  const mondayTimes = new Set();
  for (const key of Object.keys(calPositions)) {
    const parts = key.split('|');
    if (parts.length < 4) continue;
    const [projId, rowIdxStr, resKey, dateStr] = parts;
    const rowIdx = parseInt(rowIdxStr, 10);
    const proj   = portfolio.find(p => p.id === projId);
    if (!proj) continue;
    const row    = (proj.rows||[])[rowIdx];
    if (!row) continue;
    const asgn   = row.assignments?.find(a => (a.resourceId||a.resourceNom) === resKey);
    if (!asgn || asgn.resourceNom !== calSelectedRes) continue;
    const [d, m, y] = dateStr.split('/');
    mondayTimes.add(_calMonday(new Date(+y, +m-1, +d)).getTime());
  }
  return [...mondayTimes].sort().map(t => new Date(t));
}

/* ── Modal de sélection des semaines avant export ──────────────────────────── */
function exportIcal() {
  if (!calSelectedRes) {
    alert("Veuillez sélectionner une ressource avant d'exporter.");
    return;
  }
  const workedMondays  = _calGetWorkedWeekMondays();
  const workedTimes    = new Set(workedMondays.map(m => m.getTime()));
  const currentTime    = calWeekStart.getTime();

  /* Construire la liste unifiée : semaines planifiées + semaine courante */
  const allTimes = new Set([...workedTimes, currentTime]);
  const allMondays = [...allTimes].sort().map(t => new Date(t));

  const list = document.getElementById('calExportWeekList');
  if (!list) return;

  list.innerHTML = allMondays.map(monday => {
    const t        = monday.getTime();
    const isWorked = workedTimes.has(t);
    const friday   = _calAddDays(monday, 4);
    const fmt = d => d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
    const label    = `${fmt(monday)} – ${fmt(friday)} ${friday.getFullYear()}`;
    return `
      <label class="cal-export-week-item${isWorked ? '' : ' cal-export-week-unplanned'}">
        <input type="checkbox" class="cal-export-cb" value="${t}"${t === currentTime ? ' checked' : ''}>
        <span class="cal-export-week-label">${label}</span>
        ${isWorked ? '' : '<span class="cal-export-week-note">non planifiée</span>'}
      </label>`;
  }).join('');

  document.getElementById('calExportModal').style.display = 'flex';
}

function closeIcalExportModal() {
  const el = document.getElementById('calExportModal');
  if (el) el.style.display = 'none';
}

function calExportToggleAll() {
  const cbs  = document.querySelectorAll('.cal-export-cb');
  const allChecked = [...cbs].every(cb => cb.checked);
  cbs.forEach(cb => { cb.checked = !allChecked; });
  const btn = document.getElementById('calExportToggleAllBtn');
  if (btn) btn.textContent = allChecked ? 'Tout sélectionner' : 'Tout désélectionner';
}

function calDoExport() {
  const workedTimes = new Set(_calGetWorkedWeekMondays().map(m => m.getTime()));
  const selected    = [...document.querySelectorAll('.cal-export-cb:checked')]
    .map(cb => parseInt(cb.value))
    .filter(t => workedTimes.has(t));

  if (selected.length === 0) {
    alert("Aucune semaine planifiée parmi la sélection.\nPositionnez et sauvegardez des tâches dans ces semaines d'abord.");
    return;
  }
  closeIcalExportModal();
  _calBuildAndDownloadIcs(selected.map(t => new Date(t)));
}

/* ── Génération et téléchargement du fichier ICS ───────────────────────────── */
function _calBuildAndDownloadIcs(mondays) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//4CAD Group//Project Manager//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calSelectedRes} \u2014 4CAD`
  ];

  for (const monday of mondays) {
    [0,1,2,3,4].forEach(offset => {
      const d       = _calAddDays(monday, offset);
      const dateStr = _calDateStr(d);
      const events  = _calGetEventsForDate(dateStr);
      events.forEach((ev, idx) => {
        const startMin = _calGetStartMin(ev.key, idx, events);
        const durMin   = Math.round(ev.charge * CAL_HOURS_PER_DAY * 60);
        const endMin   = startMin + durMin;
        const [dd, mm, yyyy] = dateStr.split('/');
        const base    = `${yyyy}${mm}${dd}`;
        const uid     = `${ev.key.replace(/[^a-zA-Z0-9]/g,'x').substring(0,48)}@4cad`;
        const summary = _calIcalEsc(ev.rawLabel);
        const desc    = _calIcalEsc(`Ressource : ${calSelectedRes}\nCharge : ${_calFmt(ev.charge)} jour(s)\nHoraire : ${_calFmtMin(startMin)} \u2013 ${_calFmtMin(endMin)}`);
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${uid}`);
        lines.push(`DTSTART:${base}T${_calFmtIso(startMin)}00`);
        lines.push(`DTEND:${base}T${_calFmtIso(endMin)}00`);
        lines.push(`SUMMARY:${summary}`);
        lines.push(`DESCRIPTION:${desc}`);
        lines.push('END:VEVENT');
      });
    });
  }
  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type:'text/calendar;charset=utf-8' });
  const a    = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(blob),
    download: `calendrier-${calSelectedRes.replace(/\s+/g,'-')}.ics`
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function _calFmtIso(min) {
  return `${String(Math.floor(min/60)).padStart(2,'0')}${String(min%60).padStart(2,'0')}`;
}

function _calIcalEsc(s) {
  return String(s)
    .replace(/\\/g,'\\\\').replace(/;/g,'\\;')
    .replace(/,/g,'\\,').replace(/\n/g,'\\n');
}

/* ── Modal info synchronisation ────────────────────────────────────────────── */
function openIcalInfo()  {
  const el = document.getElementById('calIcalInfoModal');
  if (el) el.style.display = 'flex';
}
function closeIcalInfo() {
  const el = document.getElementById('calIcalInfoModal');
  if (el) el.style.display = 'none';
}

/* ── Rechargement depuis la BDD ────────────────────────────────────────────── */
function calReload() {
  const btn = document.getElementById('calReloadBtn');
  if (btn) { btn.disabled = true; btn.classList.add('cal-reloading'); }
  _calLoadFromFirebase();
  setTimeout(() => {
    if (btn) { btn.disabled = false; btn.classList.remove('cal-reloading'); }
  }, 2500);
}

/* ── Retirer une tâche du calendrier (sans supprimer de la BDD) ─────────────── */
function calDeleteEvent(key) {
  calHidden.add(key);
  delete calSplits[key];
  delete calDraft[key];
  calDirty = true;
  const actions = document.getElementById('calDirtyActions');
  if (actions) actions.style.display = '';
  _calRender();
}

/* ── Découper une tâche en deux segments ────────────────────────────────────── */
function calSplitEvent(key, segIdx) {
  const [projId, rowIdxStr, resKey, dateStr] = key.split('|');
  const rowIdx = parseInt(rowIdxStr, 10);
  const proj   = portfolio.find(p => p.id === projId);
  if (!proj) return;
  const row    = (proj.rows||[])[rowIdx];
  if (!row) return;
  const asgn   = row.assignments?.find(a => (a.resourceId||a.resourceNom) === resKey);
  if (!asgn) return;
  const charge  = (asgn.daily||{})[dateStr];
  if (!charge) return;

  if (segIdx < 0 || !calSplits[key]) {
    /* Découper l'événement entier en deux */
    const events   = _calGetEventsForDate(dateStr);
    const idx      = events.findIndex(ev => ev.key === key);
    const startMin = _calGetStartMin(key, Math.max(0, idx), events);
    const totalDur = Math.round(charge * CAL_HOURS_PER_DAY * 60);
    const half     = Math.round(totalDur / 2);
    const gap      = 60; // 1h de pause par défaut
    calSplits[key] = [
      { startMin, durMin: half },
      { startMin: Math.min(startMin + half + gap, CAL_END_MIN - 30), durMin: totalDur - half }
    ];
    delete calDraft[key];
    delete calPositions[key];
  } else {
    /* Découper un segment existant */
    const segs = calSplits[key];
    const seg  = segs[segIdx];
    if (!seg || seg.durMin < 30) return;
    const half    = Math.round(seg.durMin / 2);
    const gap     = 30;
    const newSeg1 = { startMin: seg.startMin, durMin: half };
    const newSeg2 = { startMin: Math.min(seg.startMin + half + gap, CAL_END_MIN - 30), durMin: seg.durMin - half };
    segs.splice(segIdx, 1, newSeg1, newSeg2);
  }

  calDirty = true;
  const actions = document.getElementById('calDirtyActions');
  if (actions) actions.style.display = '';
  _calRender();
}

/* ── Panel d'action flottant (position:fixed — échappe aux overflow:hidden) ── */
let _calActionPanel = null;

function _calToggleActive(evEl) {
  const key  = evEl.dataset.key;
  const seg  = parseInt(evEl.dataset.seg ?? '-1');
  const wasKey = _calActionPanel?.dataset.forKey;
  _calDismissActions();
  if (wasKey === key + '|' + seg) return; // toggle off si même événement

  const rect  = evEl.getBoundingClientRect();
  const segObj = seg >= 0 ? calSplits[key]?.[seg] : null;
  const canSplit = seg < 0
    ? true
    : segObj && segObj.durMin >= 30;

  const panel = document.createElement('div');
  panel.className = 'cal-action-panel';
  panel.dataset.forKey = key + '|' + seg;

  if (canSplit) {
    const btnSplit = document.createElement('button');
    btnSplit.className = 'cal-event-action-btn cal-action-split';
    btnSplit.textContent = '✂ Couper en deux';
    btnSplit.addEventListener('click', () => { _calDismissActions(); calSplitEvent(key, seg); });
    panel.appendChild(btnSplit);
  }

  const btnDel = document.createElement('button');
  btnDel.className = 'cal-event-action-btn cal-action-delete';
  btnDel.textContent = '✕ Retirer';
  btnDel.addEventListener('click', () => { _calDismissActions(); calDeleteEvent(key); });
  panel.appendChild(btnDel);

  /* Positionnement fixe juste sous l'événement */
  const panelW = Math.max(rect.width, canSplit ? 220 : 110);
  let left     = rect.left;
  if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8;
  Object.assign(panel.style, {
    top:      (rect.bottom + 4) + 'px',
    left:     left + 'px',
    minWidth: panelW + 'px'
  });

  evEl.classList.add('cal-event-active');
  document.body.appendChild(panel);
  _calActionPanel = panel;
}

function _calDismissActions() {
  document.querySelectorAll('.cal-event-active')
    .forEach(el => el.classList.remove('cal-event-active'));
  if (_calActionPanel) { _calActionPanel.remove(); _calActionPanel = null; }
}

function _calHandleGridClick(e) {
  if (!e.target.closest('.cal-event')) _calDismissActions();
}
