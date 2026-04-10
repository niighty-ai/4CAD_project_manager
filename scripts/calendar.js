/* ═══════════════════════════════════════════
   calendar.js — Planificateur horaire journalier
   • Les dates sont pilotées par la BDD (non modifiables ici)
   • L'utilisateur positionne les tâches dans la journée (heure de début)
   • Les positions sont sauvegardées dans Firebase ET localStorage
   • Détection des charges modifiées depuis la dernière sauvegarde
   • L'export ICS couvre les semaines avec au moins 1 tâche modifiée (position, split, masquée)
   ═══════════════════════════════════════════ */

/* ── Constantes ────────────────────────────────────────────────────────────── */
const CAL_START_MIN         = 7  * 60;  // 07:00 — début de la grille
const CAL_END_MIN           = 20 * 60;  // 20:00 — fin de la grille
const CAL_DEFAULT_START_MIN = 8  * 60;  // 08:00 — position par défaut des tâches
const CAL_DEFAULT_END_MIN   = 17 * 60;  // 17:00 — fin plage par défaut (indicatif)
const CAL_HOURS_PER_DAY     = 8;        // 1 jour de charge = 8 h de travail
const CAL_PX_PER_MIN        = 1.5;      // pixels par minute
const CAL_SNAP_MIN          = 15;       // snap à 15 min

/* ── État ──────────────────────────────────────────────────────────────────── */
let calWeekStart   = null;
let calSelectedRes = '';
let calPositions   = {};   // { eventKey: startMinutes }  — source de vérité (Firebase + localStorage)
let calChecksums   = {};   // { eventKey: charge }        — snapshot des charges à la dernière sauvegarde
let calDraft       = {};   // { eventKey: startMinutes }  — modifications non encore sauvegardées
let calSplits      = {};   // { eventKey: [{startMin, durMin, dateStr?}] } — segments d'une tâche découpée
let calHidden      = new Set(); // eventKeys retirés du calendrier (sans supprimer de la BDD)
let calMoved       = {};   // { origKey: newDateStr } — tâches/segments déplacés sur un autre jour de la semaine
let _calSplitsBackup  = {};
let _calHiddenBackup  = new Set();
let _calMovedBackup   = {};
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
      hidden:    [...calHidden],
      moved:     calMoved
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
      calMoved     = d.moved     || {};
    } else {
      calPositions = {};
      calChecksums = {};
      calSplits    = {};
      calHidden    = new Set();
      calMoved     = {};
    }
  } catch(e) {
    calPositions = {};
    calChecksums = {};
    calSplits    = {};
    calHidden    = new Set();
    calMoved     = {};
  }
  calDraft          = {};
  calDirty          = false;
  _calSplitsBackup  = JSON.parse(JSON.stringify(calSplits));
  _calHiddenBackup  = new Set(calHidden);
  _calMovedBackup   = {...calMoved};
}

/* ── Sauvegarde vers Firebase ──────────────────────────────────────────────── */
function _calSaveToFirebase() {
  if (typeof window._fbSetCalPositions !== 'function' || !currentUserId) return;
  window._fbSetCalPositions(currentUserId, {
    positions: calPositions,
    checksums: calChecksums,
    splits:    calSplits,
    hidden:    [...calHidden],
    moved:     calMoved,
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
      calMoved          = data.moved     || {};
      calDraft          = {};
      calDirty          = false;
      _calSplitsBackup  = JSON.parse(JSON.stringify(calSplits));
      _calHiddenBackup  = new Set(calHidden);
      _calMovedBackup   = {...calMoved};
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

  /* Helper : construit l'objet événement de base */
  const _mkEv = (proj, row, charge, key) => {
    const clientName  = proj.client || '';
    const projName    = row.projet || proj.name || '';
    const taskName    = row.tache  || '';
    const displayName = clientName || projName;
    return {
      key, charge,
      label:    `${escH(displayName)} – ${escH(taskName)}`,
      rawLabel: `${displayName} - ${taskName}`,
      projName, taskDebut: row.debut, taskFin: row.fin,
      color: projectColors[projName] || projectColors[proj.name] || '#3b82f6'
    };
  };

  /* 1. Événements avec charge sur cette date (non déplacés) */
  for (const proj of portfolio) {
    (proj.rows||[]).forEach((row, rowIdx) => {
      if (row._type !== 'tache') return;
      for (const asgn of (row.assignments||[])) {
        if (asgn.resourceNom !== calSelectedRes) continue;
        const charge = (asgn.daily||{})[dateStr];
        if (!charge) continue;
        const resKey = asgn.resourceId || asgn.resourceNom;
        const key    = _calEventKey(proj.id, rowIdx, resKey, dateStr);
        if (calHidden.has(key)) continue;
        if (calMoved[key] !== undefined) continue;  // Déplacé sur un autre jour
        const ev = _mkEv(proj, row, charge, key);
        /* Segments : ne montrer que ceux qui appartiennent à ce jour */
        if (calSplits[key] && calSplits[key].length) {
          const localSegs = calSplits[key]
            .map((s, si) => ({...s, _si: si}))
            .filter(s => !s.dateStr || s.dateStr === dateStr);
          if (localSegs.length) ev._displaySegs = localSegs;
          else return;  // Tous les segments ont migré vers d'autres jours
        }
        events.push(ev);
      }
    });
  }

  /* 2. Événements entiers déplacés VERS cette date */
  for (const [origKey, targetDate] of Object.entries(calMoved)) {
    if (targetDate !== dateStr) continue;
    const [projId, rowIdxStr, resKey, origDateStr] = origKey.split('|');
    const proj = portfolio.find(p => p.id === projId);
    if (!proj) continue;
    const row  = (proj.rows||[])[parseInt(rowIdxStr, 10)];
    if (!row) continue;
    const asgn = row.assignments?.find(a => (a.resourceId||a.resourceNom) === resKey);
    if (!asgn || asgn.resourceNom !== calSelectedRes) continue;
    const charge = (asgn.daily||{})[origDateStr];
    if (!charge) continue;
    events.push(_mkEv(proj, row, charge, origKey));
  }

  /* 3. Segments isolés déplacés VERS cette date (tâche partiellement déplacée) */
  for (const [key, segs] of Object.entries(calSplits)) {
    if (calMoved[key] !== undefined) continue;  // Tâche entière déplacée, déjà gérée
    const [projId, rowIdxStr, resKey, origDateStr] = key.split('|');
    if (origDateStr === dateStr) continue;  // Segments du jour courant, déjà gérés en step 1
    const crossSegs = segs.map((s, si) => ({...s, _si: si})).filter(s => s.dateStr === dateStr);
    if (!crossSegs.length) continue;
    const proj = portfolio.find(p => p.id === projId);
    if (!proj) continue;
    const row  = (proj.rows||[])[parseInt(rowIdxStr, 10)];
    if (!row) continue;
    const asgn = row.assignments?.find(a => (a.resourceId||a.resourceNom) === resKey);
    if (!asgn || asgn.resourceNom !== calSelectedRes) continue;
    const charge = (asgn.daily||{})[origDateStr];
    if (!charge) continue;
    const ev = _mkEv(proj, row, charge, key);
    ev._displaySegs = crossSegs;
    events.push(ev);
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
      const _displaySegs = ev._displaySegs;
      const _allSegs     = calSplits[ev.key];
      if (_displaySegs || (_allSegs && _allSegs.length)) {
        const segsToShow = _displaySegs || _allSegs.map((s, si) => ({...s, _si: si}));
        const nb         = _allSegs ? _allSegs.length : segsToShow.length;
        return segsToShow.map(seg => {
          const si       = seg._si !== undefined ? seg._si : segsToShow.indexOf(seg);
          const topPx    = (seg.startMin - CAL_START_MIN) * CAL_PX_PER_MIN;
          const heightPx = Math.max(26, seg.durMin * CAL_PX_PER_MIN);
          return `
            <div class="cal-event cal-event-segment"
                 style="top:${topPx}px;height:${heightPx}px;--ev-color:${ev.color};"
                 data-key="${ev.key}" data-seg="${si}"
                 onmousedown="_calDragStart(event,'${ek}',${si})">
              <div class="cal-event-time">${_calFmtMin(seg.startMin)} – ${_calFmtMin(seg.startMin+seg.durMin)}</div>
              <div class="cal-event-label">${ev.label}</div>
              <span class="cal-event-charge">${si+1}/${nb} &middot; ${_calFmtMinDur(seg.durMin)}</span>
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
          <span class="cal-event-charge">${_calFmtMinDur(totalDurMin)}</span>
        </div>`];
    }).join('');

    return `
      <div class="cal-day-col${isToday?' cal-today':''}" data-date="${dateStr}">
        <div class="cal-day-header">
          <span class="cal-day-name">${_CAL_DAYS[i]}</span>
          <span class="cal-day-date">${dayShort}</span>
          ${total>0?`<span class="cal-day-total">${_calFmtMinDur(Math.round(total*CAL_HOURS_PER_DAY*60))}</span>`:''}
        </div>
        <div class="cal-day-scroll">
          <div class="cal-day-body" style="height:${totalPx}px;">
            ${hourHTML}${nowHTML}${evHTML}
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ── Drag (vertical + changement de jour) ──────────────────────────────────── */
function _calDragStart(e, key, segIdx = -1) {
  e.preventDefault();
  const evEl    = e.currentTarget;
  const parts   = key.split('|');
  /* currentDateStr = jour où l'événement est actuellement affiché (peut différer si déjà déplacé) */
  const currentDateStr = (segIdx >= 0 && calSplits[key]?.[segIdx]?.dateStr)
    ? calSplits[key][segIdx].dateStr
    : (calMoved[key] || parts[3] || '');
  _calDragState = {
    key, segIdx, evEl,
    startMouseY: e.clientY, startMouseX: e.clientX,
    startTop:    parseFloat(evEl.style.top) || 0,
    origDateStr: currentDateStr,
    crossDay:    false,
    moved:       false
  };
  document.addEventListener('mousemove', _calDragMove);
  document.addEventListener('mouseup',   _calDragEnd);
}

function _calDragMove(e) {
  if (!_calDragState) return;
  const { evEl, startMouseY, startMouseX, startTop } = _calDragState;
  const deltaY = e.clientY - startMouseY;
  const deltaX = e.clientX - startMouseX;

  if (!_calDragState.moved && (Math.abs(deltaY) > 5 || Math.abs(deltaX) > 5)) {
    _calDragState.moved = true;
    evEl.classList.add('cal-dragging');
    _calDismissActions();
  }
  if (!_calDragState.moved) return;

  if (!_calDragState.crossDay && Math.abs(deltaX) > 24) {
    /* Passage en mode cross-day : ancrer l'élément en position fixe */
    _calDragState.crossDay = true;
    const rect = evEl.getBoundingClientRect();
    _calDragState._fixedTop  = rect.top;
    _calDragState._fixedLeft = rect.left;
    Object.assign(evEl.style, {
      position:      'fixed',
      width:         rect.width  + 'px',
      height:        rect.height + 'px',
      zIndex:        '9998',
      pointerEvents: 'none',
      margin:        '0'
    });
    document.body.appendChild(evEl);
  }

  if (_calDragState.crossDay) {
    evEl.style.top  = (_calDragState._fixedTop  + deltaY) + 'px';
    evEl.style.left = (_calDragState._fixedLeft + deltaX) + 'px';
    _calHighlightDropTarget(_calFindColumnAtX(e.clientX));
  } else {
    const maxTop = (CAL_END_MIN - CAL_START_MIN) * CAL_PX_PER_MIN - 26;
    evEl.style.top = `${Math.max(0, Math.min(maxTop, startTop + deltaY))}px`;
  }
}

function _calDragEnd(e) {
  if (!_calDragState) return;
  const { key, segIdx, evEl, moved, crossDay, origDateStr } = _calDragState;
  _calDragState = null;
  document.removeEventListener('mousemove', _calDragMove);
  document.removeEventListener('mouseup',   _calDragEnd);

  /* Nettoyer l'élément flottant cross-day */
  if (crossDay) {
    _calHighlightDropTarget(null);
    if (evEl.parentNode === document.body) document.body.removeChild(evEl);
  } else {
    evEl.classList.remove('cal-dragging');
  }

  if (!moved) {
    /* Clic simple → afficher/masquer les boutons d'action */
    _calToggleActive(evEl);
    return;
  }

  if (crossDay) {
    /* ── Déplacement inter-colonne ── */
    const targetCol = _calFindColumnAtX(e.clientX);
    if (!targetCol) { _calRender(); return; }

    const newDateStr = targetCol.dataset.date;
    if (!newDateStr) { _calRender(); return; }

    /* Vérifier que c'est la même semaine */
    const [od, om, oy] = origDateStr.split('/');
    const [nd, nm, ny] = newDateStr.split('/');
    const origMonday = _calMonday(new Date(+oy, +om-1, +od)).getTime();
    const newMonday  = _calMonday(new Date(+ny, +nm-1, +nd)).getTime();
    if (origMonday !== newMonday) { _calRender(); return; }

    /* Calculer startMin dans la colonne cible via position Y du drop */
    const bodyEl    = targetCol.querySelector('.cal-day-body');
    const scrollEl  = targetCol.querySelector('.cal-day-scroll');
    const bodyRect  = bodyEl ? bodyEl.getBoundingClientRect() : { top: 0 };
    const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
    const relY      = e.clientY - bodyRect.top + scrollTop;
    const rawMin    = CAL_START_MIN + relY / CAL_PX_PER_MIN;
    const snapped   = Math.round(rawMin / CAL_SNAP_MIN) * CAL_SNAP_MIN;
    const clamped   = Math.max(CAL_START_MIN, Math.min(CAL_END_MIN - CAL_SNAP_MIN, snapped));

    if (segIdx >= 0 && calSplits[key] && calSplits[key][segIdx]) {
      /* Segment individuel cross-day */
      if (newDateStr === origDateStr) {
        delete calSplits[key][segIdx].dateStr;
      } else {
        calSplits[key][segIdx].dateStr = newDateStr;
      }
      calSplits[key][segIdx].startMin = clamped;
    } else {
      /* Événement entier cross-day */
      if (newDateStr === origDateStr) {
        delete calMoved[key];
      } else {
        calMoved[key] = newDateStr;
      }
      calDraft[key] = clamped;
    }
  } else {
    /* ── Déplacement vertical dans le même jour ── */
    const topPx   = parseFloat(evEl.style.top) || 0;
    const rawMin  = CAL_START_MIN + topPx / CAL_PX_PER_MIN;
    const snapped = Math.round(rawMin / CAL_SNAP_MIN) * CAL_SNAP_MIN;
    const clamped = Math.max(CAL_START_MIN, Math.min(CAL_END_MIN - CAL_SNAP_MIN, snapped));

    if (segIdx >= 0 && calSplits[key] && calSplits[key][segIdx]) {
      calSplits[key][segIdx].startMin = clamped;
    } else {
      calDraft[key] = clamped;
    }
  }

  calDirty = true;
  const actions = document.getElementById('calDirtyActions');
  if (actions) actions.style.display = '';
  _calRender();
}

/* ── Helpers cross-day drag ───────────────────────────────────────────────── */
function _calFindColumnAtX(x) {
  for (const col of document.querySelectorAll('.cal-day-col[data-date]')) {
    const r = col.getBoundingClientRect();
    if (x >= r.left && x <= r.right) return col;
  }
  return null;
}

function _calHighlightDropTarget(col) {
  document.querySelectorAll('.cal-day-col--drop-target')
    .forEach(el => el.classList.remove('cal-day-col--drop-target'));
  if (col) col.classList.add('cal-day-col--drop-target');
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
  _calMovedBackup   = {...calMoved};
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
  calMoved    = {..._calMovedBackup};
  const actions = document.getElementById('calDirtyActions');
  if (actions) actions.style.display = 'none';
  _calRender();
}

/* ── Semaines modifiées (position, draft, split, ou tâche masquée) ─────────── */
function _calGetWorkedWeekMondays() {
  const mondayTimes = new Set();
  const _addKey = key => {
    const parts = key.split('|');
    if (parts.length < 4) return;
    const [projId, rowIdxStr, resKey, dateStr] = parts;
    const proj = portfolio.find(p => p.id === projId);
    if (!proj) return;
    const row  = (proj.rows||[])[parseInt(rowIdxStr, 10)];
    if (!row) return;
    const asgn = row.assignments?.find(a => (a.resourceId||a.resourceNom) === resKey);
    if (!asgn || asgn.resourceNom !== calSelectedRes) return;
    const [d, m, y] = dateStr.split('/');
    mondayTimes.add(_calMonday(new Date(+y, +m-1, +d)).getTime());
  };
  for (const k of Object.keys(calPositions)) _addKey(k);
  for (const k of Object.keys(calDraft))     _addKey(k);
  for (const k of Object.keys(calSplits))    _addKey(k);
  for (const k of calHidden)                 _addKey(k);
  for (const k of Object.keys(calMoved))     _addKey(k);
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
  const todayMonday    = _calMonday(new Date()).getTime();

  /* Construire la liste : semaines modifiées + semaine affichée, à partir de cette semaine seulement */
  const allTimes = new Set([...workedTimes, currentTime]);
  const allMondays = [...allTimes]
    .filter(t => t >= todayMonday)
    .sort()
    .map(t => new Date(t));

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
  const workedTimes  = new Set(_calGetWorkedWeekMondays().map(m => m.getTime()));
  const todayMonday  = _calMonday(new Date()).getTime();
  const selected     = [...document.querySelectorAll('.cal-export-cb:checked')]
    .map(cb => parseInt(cb.value))
    .filter(t => workedTimes.has(t) && t >= todayMonday);

  if (selected.length === 0) {
    alert("Aucune semaine modifiée parmi la sélection.\nPositionnez, découpez ou masquez au moins une tâche dans ces semaines d'abord.");
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
        const [dd, mm, yyyy] = dateStr.split('/');
        const base        = `${yyyy}${mm}${dd}`;
        const keySlug     = ev.key.replace(/[^a-zA-Z0-9]/g,'x').substring(0,44);
        const totalDurMin = Math.round(ev.charge * CAL_HOURS_PER_DAY * 60);
        const _fmtDate    = dt => { if (!dt) return '?'; const d2 = dt instanceof Date ? dt : new Date(dt); return fmtD(d2); };
        const debutStr    = _fmtDate(ev.taskDebut);
        const finStr      = _fmtDate(ev.taskFin);
        const baseDesc    = `Projet : ${ev.projName}\nD\u00e9but t\u00e2che : ${debutStr}\nFin t\u00e2che : ${finStr}\nRessource : ${calSelectedRes}`;

        const segs = calSplits[ev.key];
        if (segs && segs.length) {
          /* Tâche découpée : un VEVENT par segment avec suffixe (n/total) */
          segs.forEach((seg, si) => {
            const n       = `${si + 1}/${segs.length}`;
            const summary = _calIcalEsc(`${ev.rawLabel} (${n})`);
            const horaire = `${_calFmtMin(seg.startMin)}\u2013${_calFmtMin(seg.startMin + seg.durMin)}`;
            const desc    = _calIcalEsc(`${baseDesc}\nCharge : ${_calFmtMinDur(seg.durMin)} (${n})\nHoraire : ${horaire}`);
            lines.push('BEGIN:VEVENT');
            lines.push(`UID:${keySlug}s${si}@4cad`);
            lines.push(`DTSTART:${base}T${_calFmtIso(seg.startMin)}00`);
            lines.push(`DTEND:${base}T${_calFmtIso(seg.startMin + seg.durMin)}00`);
            lines.push(`SUMMARY:${summary}`);
            lines.push(`DESCRIPTION:${desc}`);
            lines.push('END:VEVENT');
          });
        } else {
          /* Tâche normale : un seul VEVENT */
          const startMin = _calGetStartMin(ev.key, idx, events);
          const endMin   = startMin + totalDurMin;
          const horaire  = `${_calFmtMin(startMin)}\u2013${_calFmtMin(endMin)}`;
          const summary  = _calIcalEsc(ev.rawLabel);
          const desc     = _calIcalEsc(`${baseDesc}\nCharge : ${_calFmtMinDur(totalDurMin)} (${_calFmt(ev.charge)} j)\nHoraire : ${horaire}`);
          lines.push('BEGIN:VEVENT');
          lines.push(`UID:${keySlug}@4cad`);
          lines.push(`DTSTART:${base}T${_calFmtIso(startMin)}00`);
          lines.push(`DTEND:${base}T${_calFmtIso(endMin)}00`);
          lines.push(`SUMMARY:${summary}`);
          lines.push(`DESCRIPTION:${desc}`);
          lines.push('END:VEVENT');
        }
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

/* ── Rechargement depuis la BDD (réinitialise semaine courante / ressource) ── */
function calReload() {
  if (!calSelectedRes || !calWeekStart) return;
  const btn = document.getElementById('calReloadBtn');
  if (btn) { btn.disabled = true; btn.classList.add('cal-reloading'); }

  /* Collecter toutes les clés de la semaine courante pour la ressource */
  const keysToReset = new Set();
  _calWeekDays().forEach(d => {
    const dateStr = _calDateStr(d);
    for (const proj of portfolio) {
      (proj.rows||[]).forEach((row, rowIdx) => {
        if (row._type !== 'tache') return;
        for (const asgn of (row.assignments||[])) {
          if (asgn.resourceNom !== calSelectedRes) continue;
          if (!(asgn.daily||{})[dateStr]) continue;
          keysToReset.add(_calEventKey(proj.id, rowIdx, asgn.resourceId||asgn.resourceNom, dateStr));
        }
      });
    }
  });

  /* Supprimer toutes les personnalisations (positions, splits, masquage, déplacement) */
  keysToReset.forEach(k => {
    delete calPositions[k];
    delete calChecksums[k];
    delete calSplits[k];
    delete calDraft[k];
    calHidden.delete(k);
    delete calMoved[k];
  });
  /* Supprimer aussi les déplacements dont la cible est dans la semaine courante */
  const weekDateStrs = new Set(_calWeekDays().map(_calDateStr));
  for (const [origKey, targetDate] of Object.entries(calMoved)) {
    if (weekDateStrs.has(targetDate)) delete calMoved[origKey];
  }

  /* Mettre à jour les backups et sauvegarder immédiatement */
  _calSplitsBackup = JSON.parse(JSON.stringify(calSplits));
  _calHiddenBackup = new Set(calHidden);
  _calMovedBackup  = {...calMoved};
  calDirty = false;
  const dirtyEl = document.getElementById('calDirtyActions');
  if (dirtyEl) dirtyEl.style.display = 'none';
  _calWriteLocalStorage();
  _calSaveToFirebase();
  _calRender();

  setTimeout(() => {
    if (btn) { btn.disabled = false; btn.classList.remove('cal-reloading'); }
  }, 800);
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

/* ── Modal découpage : état en attente ──────────────────────────────────────── */
let _calPendingSplit = null; // { key, segIdx, totalDurMin, startMin }

/* ── Découper une tâche — ouvre le modal de choix de durée ─────────────────── */
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

  let totalDurMin, startMin;
  if (segIdx < 0 || !calSplits[key]) {
    totalDurMin = Math.round(charge * CAL_HOURS_PER_DAY * 60);
    const events = _calGetEventsForDate(dateStr);
    const idx    = events.findIndex(ev => ev.key === key);
    startMin     = _calGetStartMin(key, Math.max(0, idx), events);
  } else {
    const seg = calSplits[key]?.[segIdx];
    if (!seg || seg.durMin < 30) return;
    totalDurMin = seg.durMin;
    startMin    = seg.startMin;
  }

  _calPendingSplit = { key, segIdx, totalDurMin, startMin };
  _calOpenSplitModal(totalDurMin);
}

function _calFmtMinDur(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2,'0')}`;
}

function _calOpenSplitModal(totalDurMin) {
  const defaultFirst = Math.round(totalDurMin / 2 / 15) * 15 || 15;
  const slider = document.getElementById('calSplitSlider');
  const input  = document.getElementById('calSplitInput');
  document.getElementById('calSplitTotalDur').textContent = _calFmtMinDur(totalDurMin);
  slider.min = input.min = 15;
  slider.max = input.max = totalDurMin - 15;
  slider.step = input.step = 15;
  slider.value = input.value = defaultFirst;
  _calUpdateSplitPreview(defaultFirst, totalDurMin);
  document.getElementById('calSplitModal').style.display = 'flex';
}

function _calUpdateSplitPreview(first, total) {
  const second = total - first;
  document.getElementById('calSplitBlock2Dur').textContent = _calFmtMinDur(second);
  const pct1 = Math.round(first  / total * 100);
  const pct2 = 100 - pct1;
  document.getElementById('calSplitPreview').innerHTML = `
    <div class="cal-split-bar">
      <div class="cal-split-bar-1" style="flex:${pct1}">${_calFmtMinDur(first)}</div>
      <div class="cal-split-bar-gap"></div>
      <div class="cal-split-bar-2" style="flex:${pct2}">${_calFmtMinDur(second)}</div>
    </div>`;
}

function _calSyncSplitSlider() {
  /* Slider → met à jour le number et le preview */
  const slider = document.getElementById('calSplitSlider');
  const input  = document.getElementById('calSplitInput');
  input.value = slider.value;
  _calUpdateSplitPreview(parseInt(slider.value), _calPendingSplit?.totalDurMin || 60);
}

function _calSyncSplitInput() {
  /* Number input → met à jour le slider et le preview (pas de snap forcé ici) */
  const slider = document.getElementById('calSplitSlider');
  const input  = document.getElementById('calSplitInput');
  const total  = _calPendingSplit?.totalDurMin || 60;
  const v = Math.max(15, Math.min(total - 15, parseInt(input.value) || 15));
  slider.value = v;
  _calUpdateSplitPreview(v, total);
}

function _calCloseSplitModal() {
  document.getElementById('calSplitModal').style.display = 'none';
  _calPendingSplit = null;
}

function _calApplySplit() {
  if (!_calPendingSplit) return;
  const { key, segIdx, totalDurMin, startMin } = _calPendingSplit;
  const input      = document.getElementById('calSplitInput');
  let firstDur     = Math.round((parseInt(input.value) || 15) / 15) * 15;
  firstDur         = Math.max(15, Math.min(totalDurMin - 15, firstDur));
  const secondDur  = totalDurMin - firstDur;
  const gap        = 60; // 1h de pause par défaut entre les blocs

  if (segIdx < 0 || !calSplits[key]) {
    calSplits[key] = [
      { startMin, durMin: firstDur },
      { startMin: Math.min(startMin + firstDur + gap, CAL_END_MIN - 30), durMin: secondDur }
    ];
    delete calDraft[key];
    delete calPositions[key];
  } else {
    const seg      = calSplits[key][segIdx];
    const newSeg1  = { startMin: seg.startMin, durMin: firstDur };
    const newSeg2  = { startMin: Math.min(seg.startMin + firstDur + gap, CAL_END_MIN - 30), durMin: secondDur };
    calSplits[key].splice(segIdx, 1, newSeg1, newSeg2);
  }

  calDirty = true;
  const actions = document.getElementById('calDirtyActions');
  if (actions) actions.style.display = '';
  _calCloseSplitModal();
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
