/* ═══════════════════════════════════════════
   calendar.js — Planificateur horaire journalier
   • Les dates sont pilotées par la BDD (non modifiables ici)
   • L'utilisateur positionne les tâches dans la journée (heure de début)
   • Les positions sont sauvegardées dans Firebase ET localStorage
   • Détection des charges modifiées depuis la dernière sauvegarde
   • L'export ICS ne couvre que les semaines planifiées (au moins 1 événement positionné)
   ═══════════════════════════════════════════ */

/* ── Constantes ────────────────────────────────────────────────────────────── */
const CAL_START_MIN     = 7  * 60;  // 07:00
const CAL_END_MIN       = 20 * 60;  // 20:00
const CAL_HOURS_PER_DAY = 7;        // 1 jour de charge = 7 h de travail
const CAL_PX_PER_MIN    = 1.5;      // pixels par minute
const CAL_SNAP_MIN      = 15;       // snap à 15 min

/* ── État ──────────────────────────────────────────────────────────────────── */
let calWeekStart   = null;
let calSelectedRes = '';
let calPositions   = {};   // { eventKey: startMinutes }  — source de vérité (Firebase + localStorage)
let calChecksums   = {};   // { eventKey: charge }        — snapshot des charges à la dernière sauvegarde
let calDraft       = {};   // { eventKey: startMinutes }  — modifications non encore sauvegardées
let calDirty       = false;
let _calDragState  = null;

/* ── Clé localStorage ──────────────────────────────────────────────────────── */
function _calStorageKey() {
  return `gantt4cad_calpos_${currentUserId || 'anon'}`;
}

/* ── Persistance localStorage ──────────────────────────────────────────────── */
function _calWriteLocalStorage() {
  try {
    localStorage.setItem(_calStorageKey(), JSON.stringify({
      positions: calPositions,
      checksums: calChecksums
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
    } else {
      calPositions = {};
      calChecksums = {};
    }
  } catch(e) {
    calPositions = {};
    calChecksums = {};
  }
  calDraft = {};
  calDirty = false;
}

/* ── Sauvegarde vers Firebase ──────────────────────────────────────────────── */
function _calSaveToFirebase() {
  if (typeof window._fbSetCalPositions !== 'function' || !currentUserId) return;
  window._fbSetCalPositions(currentUserId, {
    positions: calPositions,
    checksums: calChecksums,
    savedAt:   new Date().toISOString()
  });
}

/* ── Chargement depuis Firebase (async, s'exécute après le rendu localStorage) */
function _calLoadFromFirebase() {
  if (typeof window._fbGetCalPositions !== 'function' || !currentUserId) return;
  window._fbGetCalPositions(currentUserId, (data) => {
    if (data && typeof data.positions === 'object') {
      calPositions = data.positions || {};
      calChecksums = data.checksums || {};
      calDraft     = {};
      calDirty     = false;
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
  calSelectedRes = names.has(prev) ? prev : sel.value;
  sel.value = calSelectedRes;
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

/* ── Position de départ (draft > sauvegardé > empilage par défaut) ─────────── */
function _calGetStartMin(key, idx, events) {
  if (calDraft[key]     !== undefined) return calDraft[key];
  if (calPositions[key] !== undefined) return calPositions[key];
  /* Empiler les événements sans position depuis CAL_START_MIN */
  let cursor = CAL_START_MIN;
  for (let i=0; i<idx; i++) {
    const p = events[i];
    if (calDraft[p.key]===undefined && calPositions[p.key]===undefined) {
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

    const evHTML = events.map((ev, idx) => {
      const startMin = _calGetStartMin(ev.key, idx, events);
      const durMin   = Math.round(ev.charge * CAL_HOURS_PER_DAY * 60);
      const topPx    = (startMin - CAL_START_MIN) * CAL_PX_PER_MIN;
      const heightPx = Math.max(26, durMin * CAL_PX_PER_MIN);
      const isDraft  = calDraft[ev.key] !== undefined;

      return `
        <div class="cal-event${isDraft?' cal-event-draft':''}"
             style="top:${topPx}px;height:${heightPx}px;--ev-color:${ev.color};"
             data-key="${ev.key}"
             onmousedown="_calDragStart(event,'${ev.key.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">
          <div class="cal-event-time">${_calFmtMin(startMin)} – ${_calFmtMin(startMin+durMin)}</div>
          <div class="cal-event-label">${ev.label}</div>
          <span class="cal-event-charge">${_calFmt(ev.charge)}&thinsp;j</span>
        </div>`;
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
function _calDragStart(e, key) {
  e.preventDefault();
  const evEl    = e.currentTarget;
  _calDragState = { key, evEl, startMouseY: e.clientY, startTop: parseFloat(evEl.style.top)||0 };
  evEl.classList.add('cal-dragging');
  document.addEventListener('mousemove', _calDragMove);
  document.addEventListener('mouseup',   _calDragEnd);
}

function _calDragMove(e) {
  if (!_calDragState) return;
  const { evEl, startMouseY, startTop } = _calDragState;
  const maxTop = (CAL_END_MIN - CAL_START_MIN) * CAL_PX_PER_MIN - 26;
  evEl.style.top = `${Math.max(0, Math.min(maxTop, startTop + e.clientY - startMouseY))}px`;
}

function _calDragEnd(e) {
  if (!_calDragState) return;
  const { key, evEl } = _calDragState;
  _calDragState = null;
  document.removeEventListener('mousemove', _calDragMove);
  document.removeEventListener('mouseup',   _calDragEnd);
  evEl.classList.remove('cal-dragging');

  const topPx    = parseFloat(evEl.style.top) || 0;
  const rawMin   = CAL_START_MIN + topPx / CAL_PX_PER_MIN;
  const snapped  = Math.round(rawMin / CAL_SNAP_MIN) * CAL_SNAP_MIN;
  calDraft[key]  = Math.max(CAL_START_MIN, Math.min(CAL_END_MIN - CAL_SNAP_MIN, snapped));
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
  calDraft       = {};
  calDirty       = false;
  calChecksums   = _calComputeChecksums();
  const actions  = document.getElementById('calDirtyActions');
  if (actions) actions.style.display = 'none';
  _calWriteLocalStorage();
  _calSaveToFirebase();
  _calToggleWarning(false);
  _calRender();
}

/* ── Annulation ────────────────────────────────────────────────────────────── */
function cancelCalendar() {
  calDraft = {};
  calDirty = false;
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

/* ── Export ICS — uniquement les semaines planifiées ───────────────────────── */
function exportIcal() {
  if (!calSelectedRes) {
    alert("Veuillez sélectionner une ressource avant d'exporter.");
    return;
  }
  const workedMondays = _calGetWorkedWeekMondays();
  if (workedMondays.length === 0) {
    alert(`Aucune semaine planifiée pour "${calSelectedRes}".\nPositionnez d'abord des tâches dans le calendrier, puis sauvegardez.`);
    return;
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//4CAD Group//Project Manager//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calSelectedRes} \u2014 4CAD`
  ];

  for (const monday of workedMondays) {
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
        const desc    = _calIcalEsc(`Ressource : ${calSelectedRes}\nCharge : ${_calFmt(ev.charge)} jour(s)\nHoraire : ${_calFmtMin(startMin)} – ${_calFmtMin(endMin)}`);
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

  const blob = new Blob([lines.join('\r\n')], {type:'text/calendar;charset=utf-8'});
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
