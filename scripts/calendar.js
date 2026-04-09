/* ═══════════════════════════════════════════
   calendar.js — Vue Calendrier hebdomadaire
   ═══════════════════════════════════════════ */

/* ── État ──────────────────────────────────────────────────────────────────── */
let calWeekStart   = null;  // Date (lundi de la semaine affichée)
let calSelectedRes = '';    // resourceNom sélectionné
let calOverrides   = {};    // { eventKey: newDateStr } — déplacements non sauvegardés
let calDirty       = false; // modifications en attente
let calDragSrc     = null;  // { key, fromDate } pendant le glisser-déposer

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

/* ── Point d'entrée (appelé par le router) ─────────────────────────────────── */
function renderCalendarView() {
  if (!calWeekStart) calWeekStart = _calMonday(new Date());
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
  _calRender();
}

/* ── Navigation semaine ────────────────────────────────────────────────────── */
function calPrevWeek() { calWeekStart = _calAddDays(calWeekStart, -7); _calRender(); }
function calNextWeek() { calWeekStart = _calAddDays(calWeekStart,  7); _calRender(); }
function calGoToday()  { calWeekStart = _calMonday(new Date()); _calRender(); }

/* ── Rendu ─────────────────────────────────────────────────────────────────── */
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
function _calEventKey(projId, rowIdx, resKey, origDate) {
  return `${projId}|${rowIdx}|${resKey}|${origDate}`;
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
        const resKey = asgn.resourceId || asgn.resourceNom;
        for (const [origDate, charge] of Object.entries(asgn.daily || {})) {
          if (!charge) continue;
          const key           = _calEventKey(proj.id, rowIdx, resKey, origDate);
          const effectiveDate = calOverrides[key] || origDate;
          if (effectiveDate !== dateStr) continue;
          const projName = row.projet || proj.name || '';
          const taskName = row.tache  || '';
          events.push({
            key,
            label:    `${escH(projName)} – ${escH(taskName)}`,
            rawLabel: `${projName} - ${taskName}`,
            charge,
            color:    projectColors[projName] || projectColors[proj.name] || '#3b82f6',
            projId:   proj.id,
            rowIdx,
            resKey
          });
        }
      }
    });
  }
  return events;
}

/* ── Formatage d'une charge ────────────────────────────────────────────────── */
function _calFmt(n) {
  if (Number.isInteger(n)) return String(n);
  const s = Number(n).toFixed(2);
  return s.replace(/\.?0+$/, '');
}

/* ── Rendu de la grille 5 colonnes ─────────────────────────────────────────── */
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

  const todayStr = _calDateStr(new Date());
  const days     = _calWeekDays();

  grid.innerHTML = days.map((d, i) => {
    const dateStr  = _calDateStr(d);
    const isToday  = dateStr === todayStr;
    const events   = _calGetEventsForDate(dateStr);
    const total    = events.reduce((s, e) => s + e.charge, 0);
    const dayShort = d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });

    const evHTML = events.map(ev => `
      <div class="cal-event" draggable="true"
           style="--ev-color:${ev.color};"
           ondragstart="calDragStart(event,'${ev.key.replace(/'/g,"\\'")}','${dateStr}')"
           ondragend="calDragEnd(event)">
        <div class="cal-event-inner">
          <span class="cal-event-label">${ev.label}</span>
          <span class="cal-event-charge">${_calFmt(ev.charge)}&thinsp;j</span>
        </div>
      </div>`).join('');

    return `
      <div class="cal-day-col${isToday ? ' cal-today' : ''}">
        <div class="cal-day-header">
          <span class="cal-day-name">${_CAL_DAYS[i]}</span>
          <span class="cal-day-date">${dayShort}</span>
          ${total > 0 ? `<span class="cal-day-total">${_calFmt(total)}&thinsp;j</span>` : ''}
        </div>
        <div class="cal-day-body"
             ondragover="calDragOver(event)"
             ondragleave="calDragLeave(event)"
             ondrop="calDrop(event,'${dateStr}')">
          ${evHTML || '<div class="cal-day-placeholder"></div>'}
        </div>
      </div>`;
  }).join('');
}

/* ── Glisser-déposer ───────────────────────────────────────────────────────── */
function calDragStart(e, key, fromDate) {
  calDragSrc = { key, fromDate };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', key);
  setTimeout(() => e.target.classList.add('cal-dragging'), 0);
}

function calDragEnd(e) {
  e.target.classList.remove('cal-dragging');
  document.querySelectorAll('.cal-day-body.cal-drag-over')
          .forEach(el => el.classList.remove('cal-drag-over'));
}

function calDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('cal-drag-over');
}

function calDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('cal-drag-over');
  }
}

function calDrop(e, targetDate) {
  e.preventDefault();
  e.currentTarget.classList.remove('cal-drag-over');
  if (!calDragSrc) return;
  const { key, fromDate } = calDragSrc;
  calDragSrc = null;
  /* La date courante effective = override existant ou date d'origine */
  const currentDate = calOverrides[key] || fromDate;
  if (currentDate === targetDate) return;
  calOverrides[key] = targetDate;
  calDirty = true;
  const actions = document.getElementById('calDirtyActions');
  if (actions) actions.style.display = '';
  _calRender();
}

/* ── Sauvegarde ────────────────────────────────────────────────────────────── */
function saveCalendar() {
  if (!calDirty) return;
  for (const [key, newDate] of Object.entries(calOverrides)) {
    const parts    = key.split('|');
    const projId   = parts[0];
    const rowIdx   = parseInt(parts[1], 10);
    const resKey   = parts[2];
    const origDate = parts[3];
    const proj = portfolio.find(p => p.id === projId);
    if (!proj) continue;
    const row  = (proj.rows || [])[rowIdx];
    if (!row || !Array.isArray(row.assignments)) continue;
    const asgn = row.assignments.find(a => (a.resourceId || a.resourceNom) === resKey);
    if (!asgn || !asgn.daily) continue;
    const charge = asgn.daily[origDate];
    if (charge === undefined) continue;
    delete asgn.daily[origDate];
    asgn.daily[newDate] = (asgn.daily[newDate] || 0) + charge;
  }
  calOverrides = {};
  calDirty     = false;
  const actions = document.getElementById('calDirtyActions');
  if (actions) actions.style.display = 'none';
  if (typeof savePortfolio === 'function') savePortfolio();
  _calRender();
}

/* ── Annulation ────────────────────────────────────────────────────────────── */
function cancelCalendar() {
  calOverrides = {};
  calDirty     = false;
  const actions = document.getElementById('calDirtyActions');
  if (actions) actions.style.display = 'none';
  _calRender();
}

/* ── Export ICS ────────────────────────────────────────────────────────────── */
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
    `X-WR-CALNAME:${calSelectedRes} \u2014 4CAD`,
    'X-WR-TIMEZONE:Europe/Paris'
  ];

  for (const proj of portfolio) {
    (proj.rows || []).forEach(row => {
      if (row._type !== 'tache') return;
      const projName = row.projet || proj.name || '';
      const taskName = row.tache  || '';
      for (const asgn of (row.assignments || [])) {
        if (asgn.resourceNom !== calSelectedRes) continue;
        for (const [dateKey, charge] of Object.entries(asgn.daily || {})) {
          if (!charge) continue;
          const [d, m, y] = dateKey.split('/');
          const dtStart = `${y}${m}${d}`;
          const next    = new Date(+y, +m - 1, +d + 1);
          const dtEnd   = `${next.getFullYear()}${String(next.getMonth()+1).padStart(2,'0')}${String(next.getDate()).padStart(2,'0')}`;
          const uid     = `${proj.id}-${dateKey.replace(/\//g,'')}-${encodeURIComponent(taskName).substring(0,20)}@4cad`;
          const summary = _calIcalEsc(`${projName} - ${taskName} (${_calFmt(charge)}j)`);
          const desc    = _calIcalEsc(`Ressource : ${calSelectedRes}\\nProjet : ${projName}\\nTâche : ${taskName}\\nCharge : ${_calFmt(charge)} jour(s)`);
          lines.push('BEGIN:VEVENT');
          lines.push(`UID:${uid}`);
          lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
          lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
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
