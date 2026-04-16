/* ═══════════════════════════════════════════════════════════════
   calendar-export.js — Export ICS (iCalendar) depuis la vue Calendrier
   Dépendances : calendar.js (state, _calGetEventsForDate, _calComputeDayLayout,
                  _calFmtMinDur, date helpers, etc.)
   ═══════════════════════════════════════════════════════════════ */

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
  for (const k of Object.keys(calPositions))   _addKey(k);
  for (const k of Object.keys(calDraft))        _addKey(k);
  for (const k of Object.keys(calSplits))       _addKey(k);
  for (const k of calHidden)                    _addKey(k);
  for (const k of Object.keys(calMoved))        _addKey(k);
  for (const k of Object.keys(calParallelCol))  _addKey(k);
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
    const sunday   = _calAddDays(monday, 6);
    const fmt = d => d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
    const label    = `${fmt(monday)} – ${fmt(sunday)} ${sunday.getFullYear()}`;
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
    [0,1,2,3,4,5,6].forEach(offset => {
      const d       = _calAddDays(monday, offset);
      const dateStr = _calDateStr(d);
      const events  = _calGetEventsForDate(dateStr);
      const layouts = _calComputeDayLayout(events);
      const [dd, mm, yyyy] = dateStr.split('/');
      const base = `${yyyy}${mm}${dd}`;
      layouts.forEach(({ ev, durMin, segs, displayStart }) => {
        const keySlug  = ev.key.replace(/[^a-zA-Z0-9]/g,'x').substring(0,44);
        const _fmtDate = dt => { if (!dt) return '?'; const d2 = dt instanceof Date ? dt : new Date(dt); return fmtD(d2); };
        const baseDesc = `Projet : ${ev.projName}\nD\u00e9but t\u00e2che : ${_fmtDate(ev.taskDebut)}\nFin t\u00e2che : ${_fmtDate(ev.taskFin)}\nRessource : ${calSelectedRes}`;

        if (segs && segs.length) {
          /* Tâche découpée : un VEVENT par segment */
          const allSegs = calSplits[ev.key] || segs;
          allSegs.forEach((seg, si) => {
            const n       = `${si + 1}/${allSegs.length}`;
            const horaire = `${_calFmtMin(seg.startMin)}\u2013${_calFmtMin(seg.startMin + seg.durMin)}`;
            lines.push('BEGIN:VEVENT');
            lines.push(`UID:${keySlug}s${si}@4cad`);
            lines.push(`DTSTART:${base}T${_calFmtIso(seg.startMin)}00`);
            lines.push(`DTEND:${base}T${_calFmtIso(seg.startMin + seg.durMin)}00`);
            lines.push(`SUMMARY:${_calIcalEsc(`${ev.rawLabel} (${n})`)}`);
            lines.push(`DESCRIPTION:${_calIcalEsc(`${baseDesc}\nCharge : ${_calFmtMinDur(seg.durMin)} (${n})\nHoraire : ${horaire}`)}`);
            lines.push('END:VEVENT');
          });
        } else {
          /* Tâche normale */
          const endMin  = displayStart + durMin;
          const horaire = `${_calFmtMin(displayStart)}\u2013${_calFmtMin(endMin)}`;
          lines.push('BEGIN:VEVENT');
          lines.push(`UID:${keySlug}@4cad`);
          lines.push(`DTSTART:${base}T${_calFmtIso(displayStart)}00`);
          lines.push(`DTEND:${base}T${_calFmtIso(endMin)}00`);
          lines.push(`SUMMARY:${_calIcalEsc(ev.rawLabel)}`);
          lines.push(`DESCRIPTION:${_calIcalEsc(`${baseDesc}\nCharge : ${_calFmtMinDur(durMin)} (${_calFmt(ev.charge)} j)\nHoraire : ${horaire}`)}`);
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
