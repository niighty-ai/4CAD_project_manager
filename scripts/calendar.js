/* ═══════════════════════════════════════════
   calendar.js — Planificateur horaire journalier
   Les dates viennent de la BDD (non modifiables).
   L'utilisateur positionne les tâches dans la journée.
   Les positions sont sauvegardées en localStorage.
   ═══════════════════════════════════════════ */

/* ── Constantes ────────────────────────────────────────────────────────────── */
const CAL_START_MIN    = 7  * 60;   // 07:00 → 420 min
const CAL_END_MIN      = 20 * 60;   // 20:00 → 1200 min
const CAL_HOURS_PER_DAY = 7;        // 1 jour = 7 heures de travail
const CAL_PX_PER_MIN   = 1.5;       // pixels par minute
const CAL_SNAP_MIN     = 15;        // snap toutes les 15 minutes

/* ── État ──────────────────────────────────────────────────────────────────── */
let calWeekStart   = null;   // Date (lundi de la semaine affichée)
let calSelectedRes = '';     // resourceNom sélectionné
let calPositions   = {};     // { eventKey: startMinutes } — sauvegardé (localStorage)
let calDraft       = {};     // { eventKey: startMinutes } — non encore sauvegardé
let calDirty       = false;
let _calDragState  = null;   // état du drag courant

/* ── Persistance localStorage ──────────────────────────────────────────────── */
function _calStorageKey() {
  return `gantt4cad_calpos_${currentUserId || 'anon'}`;
}

function _calLoadPositions() {
  try {
    const raw = localStorage.getItem(_calStorageKey());
    calPositions = raw ? JSON.parse(raw) : {};
  } catch(e) { calPositions = {}; }
  calDraft = {};
  calDirty = false;
}

function _calPersistPositions() {
  try {
    localStorage.setItem(_calStorageKey(), JSON.stringify(calPositions));
  } catch(e) {}
}

/* ── Helpers date ──────────────────────────────────────────────────────────── */
function _calDateStr(d) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function _calAddDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function _calMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function _calWeekDays() {
  return [0,1,2,3,4].map(i => _calAddDays(calWeekStart, i));
}

function _calFmtMin(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2,'0')}h${String(m).padStart(2,'0')}`;
}

function _calFmt(n) {
  if (Number.isInteger(n)) return String(n);
  return Number(n).toFixed(2).replace(/\.?0+$/, '');
}

/* ── Point d'entrée (appelé par le router) ─────────────────────────────────── */
function renderCalendarView() {
  if (!calWeekStart) calWeekStart = _calMonday(new Date());
  _calLoadPositions();
  _calPopulateResources();
  _calRender();
}

/* ── Dropdown ressources ───────────────────────────────────────────────────── */
function _calPopulateResources() {
  const sel = document.getElementById('calResourceSelect');
  if (!sel) return;
  const prev  = calSelectedRes || sel.value;
  const names = new Set();
  for (const proj of portfolio) {
    for (const row of (proj.rows || [])) {
      for (const asgn of (row.assignments || [])) {
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
  _calLoadPositions();
  _calRender();
}

/* ── Navigation semaine ────────────────────────────────────────────────────── */
function calPrevWeek() { calWeekStart = _calAddDays(calWeekStart, -7); _calRender(); }
function calNextWeek() { calWeekStart = _calAddDays(calWeekStart,  7); _calRender(); }
function calGoToday()  { calWeekStart = _calMonday(new Date());        _calRender(); }

/* ── Rendu principal ───────────────────────────────────────────────────────── */
function _calRender() {
  _calUpdateLabel();
  _calRenderGrid();
}

function _calUpdateLabel() {
  const days = _calWeekDays();
  const d0 = days[0], d4 = days[4];
  const fmt = d => d.toLocaleDateString('fr-FR', { day:'2-digit', month:'long' });
  const el  = document.getElementById('calWeekLabel');
  if (el) el.textContent = `Semaine du ${fmt(d0)} au ${fmt(d4)} ${d4.getFullYear()}`;
  const todayMon = _calMonday(new Date());
  document.getElementById('calTodayBtn')
    ?.classList.toggle('cal-today-active', calWeekStart.getTime() === todayMon.getTime());
}

/* ── Clé unique d'un événement ─────────────────────────────────────────────── */
function _calEventKey(projId, rowIdx, resKey, date) {
  return `${projId}|${rowIdx}|${resKey}|${date}`;
}

/* ── Extraction des événements pour une date ───────────────────────────────── */
function _calGetEventsForDate(dateStr) {
  if (!calSelectedRes) return [];
  const events = [];
  for (const proj of portfolio) {
    (proj.rows || []).forEach((row, rowIdx) => {
      if (row._type !== 'tache') return;
      for (const asgn of (row.assignments || [])) {
        if (asgn.resourceNom !== calSelectedRes) continue;
        const charge = (asgn.daily || {})[dateStr];
        if (!charge) continue;
        const resKey   = asgn.resourceId || asgn.resourceNom;
        const key      = _calEventKey(proj.id, rowIdx, resKey, dateStr);
        const projName = row.projet || proj.name || '';
        const taskName = row.tache  || '';
        events.push({
          key,
          label:    `${escH(projName)} – ${escH(taskName)}`,
          rawLabel: `${projName} - ${taskName}`,
          charge,
          color: projectColors[projName] || projectColors[proj.name] || '#3b82f6'
        });
      }
    });
  }
  return events;
}

/* ── Position de départ (draft > sauvegardé > empilage par défaut) ─────────── */
function _calGetStartMin(key, idx, events) {
  if (calDraft[key]    !== undefined) return calDraft[key];
  if (calPositions[key] !== undefined) return calPositions[key];
  /* Défaut : empiler les événements sans position depuis CAL_START_MIN */
  let cursor = CAL_START_MIN;
  for (let i = 0; i < idx; i++) {
    const p = events[i];
    if (calDraft[p.key] === undefined && calPositions[p.key] === undefined) {
      cursor += Math.round(p.charge * CAL_HOURS_PER_DAY * 60);
    }
  }
  return Math.min(cursor, CAL_END_MIN - 30);
}

/* ── Rendu de la grille ────────────────────────────────────────────────────── */
const _CAL_DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

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
  const now      = new Date();
  const nowMin   = now.getHours() * 60 + now.getMinutes();
  const days     = _calWeekDays();

  /* Lignes horaires (générées une fois) */
  const hourLines = [];
  for (let h = Math.floor(CAL_START_MIN/60); h <= Math.floor(CAL_END_MIN/60); h++) {
    const top = (h * 60 - CAL_START_MIN) * CAL_PX_PER_MIN;
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
    const dayShort = d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
    const total    = events.reduce((s, e) => s + e.charge, 0);

    /* Indicateur "heure courante" sur le jour d'aujourd'hui */
    const nowLineHTML = (isToday && nowMin >= CAL_START_MIN && nowMin <= CAL_END_MIN)
      ? `<div class="cal-now-line" style="top:${(nowMin - CAL_START_MIN) * CAL_PX_PER_MIN}px"></div>`
      : '';

    const evHTML = events.map((ev, idx) => {
      const startMin = _calGetStartMin(ev.key, idx, events);
      const durMin   = Math.round(ev.charge * CAL_HOURS_PER_DAY * 60);
      const heightPx = Math.max(26, durMin * CAL_PX_PER_MIN);
      const topPx    = (startMin - CAL_START_MIN) * CAL_PX_PER_MIN;
      const endMin   = startMin + durMin;
      const isDraft  = calDraft[ev.key] !== undefined;

      return `
        <div class="cal-event${isDraft ? ' cal-event-draft' : ''}"
             style="top:${topPx}px; height:${heightPx}px; --ev-color:${ev.color};"
             data-key="${ev.key}"
             onmousedown="_calDragStart(event,'${ev.key.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">
          <div class="cal-event-time">${_calFmtMin(startMin)} – ${_calFmtMin(endMin)}</div>
          <div class="cal-event-label">${ev.label}</div>
          <span class="cal-event-charge">${_calFmt(ev.charge)}&thinsp;j</span>
        </div>`;
    }).join('');

    return `
      <div class="cal-day-col${isToday ? ' cal-today' : ''}">
        <div class="cal-day-header">
          <span class="cal-day-name">${_CAL_DAYS[i]}</span>
          <span class="cal-day-date">${dayShort}</span>
          ${total > 0 ? `<span class="cal-day-total">${_calFmt(total)}&thinsp;j</span>` : ''}
        </div>
        <div class="cal-day-scroll">
          <div class="cal-day-body" style="height:${totalPx}px;">
            ${hourHTML}
            ${nowLineHTML}
            ${evHTML || ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ── Drag vertical (mousedown / mousemove / mouseup) ───────────────────────── */
function _calDragStart(e, key) {
  e.preventDefault();
  const evEl    = e.currentTarget;
  const startTop = parseFloat(evEl.style.top) || 0;
  _calDragState  = { key, evEl, startMouseY: e.clientY, startTop };
  evEl.classList.add('cal-dragging');
  document.addEventListener('mousemove', _calDragMove);
  document.addEventListener('mouseup',   _calDragEnd);
}

function _calDragMove(e) {
  if (!_calDragState) return;
  const { evEl, startMouseY, startTop } = _calDragState;
  const dy     = e.clientY - startMouseY;
  const totalPx = (CAL_END_MIN - CAL_START_MIN) * CAL_PX_PER_MIN;
  const newTop  = Math.max(0, Math.min(totalPx - 26, startTop + dy));
  evEl.style.top = `${newTop}px`;
}

function _calDragEnd(e) {
  if (!_calDragState) return;
  const { key, evEl } = _calDragState;
  _calDragState = null;
  document.removeEventListener('mousemove', _calDragMove);
  document.removeEventListener('mouseup',   _calDragEnd);
  evEl.classList.remove('cal-dragging');

  /* Convertir position → minutes avec snap */
  const topPx    = parseFloat(evEl.style.top) || 0;
  const rawMin   = CAL_START_MIN + topPx / CAL_PX_PER_MIN;
  const snapped  = Math.round(rawMin / CAL_SNAP_MIN) * CAL_SNAP_MIN;
  const maxStart = CAL_END_MIN - CAL_SNAP_MIN;
  const startMin = Math.max(CAL_START_MIN, Math.min(maxStart, snapped));

  calDraft[key] = startMin;
  calDirty      = true;
  const actions = document.getElementById('calDirtyActions');
  if (actions) actions.style.display = '';
  _calRender();
}

/* ── Sauvegarde ────────────────────────────────────────────────────────────── */
function saveCalendar() {
  Object.assign(calPositions, calDraft);
  calDraft  = {};
  calDirty  = false;
  _calPersistPositions();
  const actions = document.getElementById('calDirtyActions');
  if (actions) actions.style.display = 'none';
  _calRender();
}

/* ── Annulation ────────────────────────────────────────────────────────────── */
function cancelCalendar() {
  calDraft  = {};
  calDirty  = false;
  const actions = document.getElementById('calDirtyActions');
  if (actions) actions.style.display = 'none';
  _calRender();
}

/* ── Export ICS avec horaires réels ────────────────────────────────────────── */
function exportIcal() {
  if (!calSelectedRes) {
    alert("Veuillez sélectionner une ressource avant d'exporter.");
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

  /* Collecter tous les événements avec position horaire */
  for (const proj of portfolio) {
    (proj.rows || []).forEach((row, rowIdx) => {
      if (row._type !== 'tache') return;
      const projName = row.projet || proj.name || '';
      const taskName = row.tache  || '';
      for (const asgn of (row.assignments || [])) {
        if (asgn.resourceNom !== calSelectedRes) continue;
        const resKey = asgn.resourceId || asgn.resourceNom;
        for (const [dateKey, charge] of Object.entries(asgn.daily || {})) {
          if (!charge) continue;
          const key      = _calEventKey(proj.id, rowIdx, resKey, dateKey);
          const startMin = calPositions[key] !== undefined ? calPositions[key] : CAL_START_MIN;
          const durMin   = Math.round(charge * CAL_HOURS_PER_DAY * 60);
          const endMin   = startMin + durMin;
          const [d, m, y] = dateKey.split('/');
          const base     = `${y}${m}${d}`;
          const uid      = `${proj.id}-${base}-${encodeURIComponent(taskName).substring(0,20)}@4cad`;
          const summary  = _calIcalEsc(`${projName} - ${taskName}`);
          const desc     = _calIcalEsc(`Ressource : ${calSelectedRes}\\nCharge : ${_calFmt(charge)} jour(s)\\n${_calFmtMin(startMin)} - ${_calFmtMin(endMin)}`);
          lines.push('BEGIN:VEVENT');
          lines.push(`UID:${uid}`);
          lines.push(`DTSTART:${base}T${_calFmtIso(startMin)}00`);
          lines.push(`DTEND:${base}T${_calFmtIso(endMin)}00`);
          lines.push(`SUMMARY:${summary}`);
          lines.push(`DESCRIPTION:${desc}`);
          lines.push('END:VEVENT');
        }
      }
    });
  }
  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a    = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(blob),
    download: `calendrier-${calSelectedRes.replace(/\s+/g, '-')}.ics`
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
    .replace(/\\/g, '\\\\')
    .replace(/;/g,  '\\;')
    .replace(/,/g,  '\\,')
    .replace(/\n/g, '\\n');
}

/* ── Modal info synchronisation ────────────────────────────────────────────── */
function openIcalInfo() {
  const el = document.getElementById('calIcalInfoModal');
  if (el) el.style.display = 'flex';
}

function closeIcalInfo() {
  const el = document.getElementById('calIcalInfoModal');
  if (el) el.style.display = 'none';
}
