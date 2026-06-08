/* ═══════════════════════════════════════════
   suivi.js — Suivi COPROJ : état, Firebase sync, CRUD
   Firebase path : suivi_data/{userId}
   ═══════════════════════════════════════════ */

/* ── État global ── */
let _suiviState    = { projects: [], activeId: null };
let _suiviLoaded   = false;
let _suiviSaveTimer = null;
let _suiviSaveTs   = 0;
let _suiviOpenEditor = null;

/* ── Constantes ── */
const _SUIVI_COLORS  = ['#EC7206','#72B6EC','#3fb950','#bc8cff','#F29318','#f85149','#56d364','#ffa657'];
const _SUIVI_STATUTS = ['todo','wip','done'];
const _SUIVI_STATUT_LABELS = { todo:'À faire', wip:'En cours', done:'Terminé' };
const _SUIVI_STATUT_COL    = { todo:'727F8E', wip:'F29318', done:'3fb950' };
const _SUIVI_TYPES  = ['action','comment','info','alert'];
const _SUIVI_TYPE_LABELS   = { action:'Action', comment:'Commentaire', info:'Info', alert:'Alerte' };
const _SUIVI_TYPE_COL_PPTX = { action:'EC7206', comment:'bc8cff', info:'72B6EC', alert:'f85149' };

/* ── Helpers ── */
function _suiviUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}
function _suiviEsc(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _suiviGetActive() {
  return _suiviState.projects.find(p => p.id === _suiviState.activeId) || null;
}
function _suiviFmtDate(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function _suiviIsOverdue(iso) {
  if (!iso) return false;
  return new Date(iso) < new Date(new Date().toDateString());
}
function _suiviFmtIntvDateShort(iso) {
  if (!iso) return '-';
  const d = new Date(iso + 'T12:00:00');
  const j = ['Dim.','Lun.','Mar.','Mer.','Jeu.','Ven.','Sam.'][d.getDay()];
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${j} ${dd}/${mm}`;
}
function _suiviFmtIntvDate(iso) {
  if (!iso) return '';
  const JOURS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const d = new Date(iso + 'T12:00:00');
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${JOURS[d.getDay()]} ${dd}/${mm}/${d.getFullYear()}`;
}
function _suiviFmtCell(cell) {
  if (!cell || !cell.duration) return '';
  let s = cell.duration;
  const needPeriod = cell.duration === '0,25J' || cell.duration === '0,5J';
  if (needPeriod && cell.period) s += ' ' + cell.period;
  if (cell.note) s += ' ' + cell.note;
  return s;
}

/* ── Migration ── */
function _suiviMigrateIntvDate(d) {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (/^\d{1,2}\/\d{1,2}$/.test(d)) {
    const [dd,mm] = d.split('/');
    return `2026-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d)) {
    const [dd,mm,yyyy] = d.split('/');
    return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
  }
  return d;
}
function _suiviMigrateProject(p) {
  if (p?.interventions?.rows)
    p.interventions.rows.forEach(r => { r.date = _suiviMigrateIntvDate(r.date||''); });
  return p;
}
function _suiviMigrateState(s) {
  if (s?.projects) s.projects.forEach(_suiviMigrateProject);
  return s;
}

/* ── Persistance locale ── */
function _suiviWriteLS() {
  if (!currentUserId) return;
  try { localStorage.setItem('suivi_' + currentUserId, JSON.stringify(_suiviState)); } catch(e) {}
}
function _suiviReadLS() {
  if (!currentUserId) return;
  try {
    const raw = localStorage.getItem('suivi_' + currentUserId);
    if (raw) { _suiviState = JSON.parse(raw); _suiviMigrateState(_suiviState); }
  } catch(e) {}
}

/* ── Sauvegarde Firebase (debouncée 500 ms) ── */
function _suiviSave() {
  _suiviWriteLS();
  _suiviSaveTs = Date.now();
  clearTimeout(_suiviSaveTimer);
  _suiviSaveTimer = setTimeout(() => {
    if (!currentUserId || typeof window._fbSetSuiviData !== 'function') return;
    _suiviSaveTs = Date.now();
    window._fbSetSuiviData(currentUserId, _suiviState)
      .catch(e => console.warn('[suivi] save error', e));
  }, 500);
}

/* ── Chargement initial (appelé depuis app.js) ── */
function _startSuiviLoad(userId) {
  _suiviReadLS();
  if (typeof window._fbOnSuiviData === 'function') {
    window._fbOnSuiviData(userId, val => {
      if ((Date.now() - _suiviSaveTs) < 3000) return;
      if (val) {
        _suiviState = val;
        _suiviMigrateState(_suiviState);
        _suiviState.projects = _suiviState.projects || [];
        _suiviWriteLS();
      }
      _suiviLoaded = true;
      if (currentView === 'suivi') _suiviRender();
    });
  } else {
    _suiviLoaded = true;
  }
}

/* ── CRUD Projets ── */
function _suiviNewProject() {
  const color = _SUIVI_COLORS[_suiviState.projects.length % _SUIVI_COLORS.length];
  const p = {
    id: _suiviUid(), client: 'Nouveau client', color,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    actions: [
      { id: _suiviUid(), type:'action',  action:'', responsable:'4CAD',   echeance:'', statut:'todo' },
      { id: _suiviUid(), type:'comment', action:'', responsable:'client', echeance:'', statut:'todo' }
    ],
    interventions: { intervenants:['Consultant 1'], rows:[] }
  };
  _suiviState.projects.push(p);
  _suiviState.activeId = p.id;
  _suiviSave();
  _suiviRender();
  setTimeout(() => {
    const i = document.getElementById('suiviTitleInput');
    if (i) { i.focus(); i.select(); }
  }, 60);
}

function _suiviDeleteProject(id) {
  if (!confirm('Supprimer ce client ?')) return;
  _suiviState.projects = _suiviState.projects.filter(p => p.id !== id);
  if (_suiviState.activeId === id)
    _suiviState.activeId = _suiviState.projects[0]?.id || null;
  _suiviSave();
  _suiviRender();
}

function _suiviSetActive(id) {
  _suiviState.activeId = id;
  _suiviRender();
}

function _suiviUpdateProjectName(name) {
  const p = _suiviGetActive(); if (!p) return;
  p.client = name; p.updatedAt = new Date().toISOString();
  _suiviSave();
  _suiviRenderSidebar();
  _suiviRenderActionsTbody();
}

/* ── CRUD Actions ── */
function _suiviAddAction() {
  const p = _suiviGetActive(); if (!p) return;
  p.actions.push({ id:_suiviUid(), type:'action', action:'', responsable:'4CAD', echeance:'', statut:'todo' });
  _suiviSave();
  _suiviRenderActionsTbody();
  setTimeout(() => {
    const rows = document.querySelectorAll('.suivi-action-input');
    if (rows.length) rows[rows.length-1].focus();
  }, 50);
}

function _suiviRemoveAction(id) {
  const p = _suiviGetActive(); if (!p) return;
  p.actions = p.actions.filter(a => a.id !== id);
  _suiviSave();
  _suiviRenderActionsTbody();
}

function _suiviUpdateAction(id, field, value) {
  const p = _suiviGetActive(); if (!p) return;
  const a = p.actions.find(a => a.id === id);
  if (a) { a[field] = value; p.updatedAt = new Date().toISOString(); _suiviSave(); }
  if (field === 'echeance') _suiviRenderActionsTbody();
}

function _suiviToggleResp(id) {
  const p = _suiviGetActive(); if (!p) return;
  const a = p.actions.find(a => a.id === id); if (!a) return;
  a.responsable = a.responsable === '4CAD' ? 'client' : '4CAD';
  p.updatedAt = new Date().toISOString();
  _suiviSave();
  _suiviRenderActionsTbody();
}

function _suiviCycleStatut(id) {
  const p = _suiviGetActive(); if (!p) return;
  const a = p.actions.find(a => a.id === id); if (!a) return;
  const idx = _SUIVI_STATUTS.indexOf(a.statut);
  a.statut = _SUIVI_STATUTS[(idx+1) % _SUIVI_STATUTS.length];
  p.updatedAt = new Date().toISOString();
  _suiviSave();
  _suiviRenderActionsTbody();
}

function _suiviCycleType(id) {
  const p = _suiviGetActive(); if (!p) return;
  const a = p.actions.find(a => a.id === id); if (!a) return;
  const idx = _SUIVI_TYPES.indexOf(a.type||'action');
  a.type = _SUIVI_TYPES[(idx+1) % _SUIVI_TYPES.length];
  p.updatedAt = new Date().toISOString();
  _suiviSave();
  _suiviRenderActionsTbody();
}

/* ── Import / Export JSON ── */
function _suiviExportAllJSON() {
  const blob = new Blob([JSON.stringify(_suiviState, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `suivi_coproj_all_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  _suiviToast('Export JSON complet ✓');
}

function _suiviExportProjectJSON() {
  const p = _suiviGetActive(); if (!p) return;
  const blob = new Blob([JSON.stringify(p, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `suivi_${p.client.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  _suiviToast(`Export JSON : ${p.client} ✓`);
}

function _suiviImportJSON(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.projects) {
        if (confirm('Remplacer toutes les données ?\nOK = Remplacer  |  Annuler = Fusionner')) {
          _suiviMigrateState(data);
          _suiviState = data;
        } else {
          data.projects.forEach(p => {
            const idx = _suiviState.projects.findIndex(x => x.id === p.id);
            _suiviMigrateProject(p);
            if (idx >= 0) _suiviState.projects[idx] = p;
            else _suiviState.projects.push(p);
          });
          if (data.activeId) _suiviState.activeId = data.activeId;
        }
      } else if (data.id && data.actions) {
        _suiviMigrateProject(data);
        const idx = _suiviState.projects.findIndex(x => x.id === data.id);
        if (idx >= 0) _suiviState.projects[idx] = data;
        else _suiviState.projects.push(data);
        _suiviState.activeId = data.id;
      } else { throw new Error('Format invalide'); }
      _suiviSave();
      _suiviRender();
      _suiviToast('Import réussi ✓');
    } catch(e) { _suiviToast('Erreur de format JSON', 'error'); }
  };
  reader.readAsText(file);
  input.value = '';
}

/* ── Export PPTX ── */
async function _suiviExportPPTX() {
  const p = _suiviGetActive();
  if (!p) return _suiviToast('Aucun projet sélectionné', 'error');

  if (typeof PptxGenJS === 'undefined') {
    _suiviToast('Bibliothèque PPTX non chargée', 'error');
    return;
  }

  const btn = document.getElementById('suiviBtnExportPptx');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Génération…'; }

  try {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';

    const NAVY  = '284053';
    const ORANGE = 'EC7206';
    const GRAY  = '727F8E';
    const WHITE = 'FFFFFF';
    const LBLUE = '72B6EC';
    const FONT  = 'Arial';

    function addBadge(slide) {
      slide.addText('4CAD', {
        x:12.0, y:0.1, w:1.2, h:0.35,
        fontSize:11, bold:true, color:WHITE, fontFace:FONT,
        align:'center', valign:'middle',
        fill:{ color:ORANGE }, shape:'rect'
      });
    }
    function addFooter(slide, dateStr) {
      slide.addText('4CAD  |  FOR YOUR INDUSTRY', {
        x:0.3, y:7.1, w:5, h:0.28, fontSize:8, color:ORANGE, fontFace:FONT, bold:true, valign:'middle'
      });
      slide.addText(dateStr, {
        x:10.5, y:7.1, w:2.5, h:0.28, fontSize:8, color:GRAY, fontFace:FONT, align:'right', valign:'middle'
      });
    }
    function addOrangeBar(slide, y, h) {
      slide.addText('', { x:0.3, y, w:0.05, h, fill:{ color:ORANGE } });
    }

    const today = new Date().toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric'});

    /* Slide 1 : Titre */
    const s1 = pptx.addSlide();
    s1.background = { color: NAVY };
    addBadge(s1);
    addOrangeBar(s1, 3.8, 2.0);
    s1.addText('COPROJ', { x:0.5, y:1.0, w:12, h:1.6, fontSize:64, bold:true, color:WHITE, fontFace:FONT });
    s1.addText('Suivi hebdomadaire des actions', { x:0.5, y:2.6, w:10, h:0.55, fontSize:18, color:GRAY, fontFace:FONT });
    s1.addText(p.client, { x:0.55, y:3.85, w:9, h:0.8, fontSize:28, bold:true, color:ORANGE, fontFace:FONT });
    s1.addText(today,    { x:0.55, y:4.7,  w:8, h:0.45, fontSize:13, color:GRAY, fontFace:FONT });
    s1.addText('4CAD, FOR YOUR INDUSTRY', { x:0.55, y:6.6, w:8, h:0.35, fontSize:9, bold:true, color:ORANGE, fontFace:FONT, charSpacing:2 });

    /* Slide 2 : Actions */
    const s2 = pptx.addSlide();
    s2.background = { color: NAVY };
    addBadge(s2);
    addOrangeBar(s2, 0.25, 0.5);
    s2.addText('Actions & Livrables', { x:0.5, y:0.2, w:11.5, h:0.6, fontSize:22, bold:true, color:WHITE, fontFace:FONT });
    s2.addText(p.client, { x:0.5, y:0.75, w:11.5, h:0.3, fontSize:12, color:ORANGE, fontFace:FONT, bold:true });

    const HDR_FILL = { color:'1e2f3f' };
    const ROW_FILL = { color:NAVY };
    const hdr = [
      { text:'Type',             options:{ bold:true, color:WHITE, fill:HDR_FILL, fontSize:11, fontFace:FONT, align:'center', valign:'middle' } },
      { text:'Action / Contenu', options:{ bold:true, color:WHITE, fill:HDR_FILL, fontSize:11, fontFace:FONT, align:'left',   valign:'middle' } },
      { text:'Responsable',      options:{ bold:true, color:WHITE, fill:HDR_FILL, fontSize:11, fontFace:FONT, align:'center', valign:'middle' } },
      { text:'Echeance',         options:{ bold:true, color:WHITE, fill:HDR_FILL, fontSize:11, fontFace:FONT, align:'center', valign:'middle' } },
      { text:'Statut',           options:{ bold:true, color:WHITE, fill:HDR_FILL, fontSize:11, fontFace:FONT, align:'center', valign:'middle' } }
    ];

    const dataRows = p.actions.map(a => {
      const type      = a.type || 'action';
      const isAction  = type === 'action';
      const typeLabel = _SUIVI_TYPE_LABELS[type] || type;
      const typeColor = _SUIVI_TYPE_COL_PPTX[type] || GRAY;
      const respLabel = a.responsable === '4CAD' ? '4CAD' : (p.client || 'Client');
      const respColor = a.responsable === '4CAD' ? ORANGE : LBLUE;
      const statLabel = isAction ? (_SUIVI_STATUT_LABELS[a.statut] || a.statut) : '-';
      const statColor = isAction ? (_SUIVI_STATUT_COL[a.statut] || GRAY) : GRAY;
      const dateStr   = isAction ? (_suiviFmtDate(a.echeance) || '-') : '-';
      const dateColor = (isAction && a.statut !== 'done' && _suiviIsOverdue(a.echeance)) ? 'f85149' : GRAY;
      const respStr   = isAction ? respLabel : '-';
      return [
        { text:typeLabel,        options:{ color:typeColor, fontSize:11, fontFace:FONT, align:'center', valign:'middle', fill:ROW_FILL, bold:true } },
        { text:a.action || '-',  options:{ color:WHITE,     fontSize:11, fontFace:FONT, align:'left',   valign:'middle', fill:ROW_FILL } },
        { text:respStr,          options:{ color:isAction?respColor:GRAY, fontSize:11, fontFace:FONT, align:'center', valign:'middle', fill:ROW_FILL, bold:isAction } },
        { text:dateStr,          options:{ color:dateColor, fontSize:11, fontFace:FONT, align:'center', valign:'middle', fill:ROW_FILL } },
        { text:statLabel,        options:{ color:statColor, fontSize:11, fontFace:FONT, align:'center', valign:'middle', fill:ROW_FILL, bold:isAction } }
      ];
    });

    if (dataRows.length) {
      s2.addTable([hdr, ...dataRows], {
        x:0.3, y:1.1, w:12.7,
        colW:[1.7, 5.2, 2.1, 1.8, 1.9],
        rowH:0.42,
        border:{ type:'solid', color:'3d5972', pt:0.5 }
      });
    }
    addFooter(s2, today);

    /* Slide 3 : Interventions */
    if (p.interventions && p.interventions.rows.length > 0) {
      const intv = p.interventions;
      const s3 = pptx.addSlide();
      s3.background = { color: NAVY };
      addBadge(s3);
      addOrangeBar(s3, 0.25, 0.5);
      s3.addText('Planning des interventions', { x:0.5, y:0.2, w:11.5, h:0.6, fontSize:22, bold:true, color:WHITE, fontFace:FONT });
      s3.addText(p.client, { x:0.5, y:0.75, w:11.5, h:0.3, fontSize:12, color:ORANGE, fontFace:FONT, bold:true });

      const nInt = intv.intervenants.length;
      const totalW = 12.7;
      const dateW  = 1.6;
      const intW   = (totalW - dateW) / Math.max(nInt, 1);

      const intvHdr = [
        { text:'Date', options:{ bold:true, color:WHITE, fill:{color:'1e2f3f'}, fontSize:11, fontFace:FONT, align:'center', valign:'middle' } },
        ...intv.intervenants.map(n => ({ text:n, options:{ bold:true, color:WHITE, fill:{color:'1e2f3f'}, fontSize:11, fontFace:FONT, align:'center', valign:'middle' } }))
      ];
      const intvRows = [...intv.rows].sort((a,b) => (a.date||'') < (b.date||'') ? -1 : 1).map(row => [
        { text: _suiviFmtIntvDateShort(row.date), options:{ color:WHITE, fontSize:11, fontFace:FONT, align:'center', valign:'middle', fill:{color:NAVY}, bold:true } },
        ...intv.intervenants.map(name => {
          const cell  = row.cells[name] || null;
          const text  = cell ? _suiviFmtCell(cell) : '';
          const color = (cell && !cell.valide) ? ORANGE : (cell ? WHITE : '3d5972');
          return { text: text || '-', options:{ color, fontSize:11, fontFace:FONT, align:'center', valign:'middle', fill:{color:NAVY}, italic: !!(cell && !cell.valide) } };
        })
      ]);

      s3.addTable([intvHdr, ...intvRows], {
        x:0.3, y:1.1, w:totalW,
        colW:[dateW, ...intv.intervenants.map(() => intW)],
        rowH:0.32,
        border:{ type:'solid', color:'3d5972', pt:0.5 }
      });
      addFooter(s3, today);
    }

    await pptx.writeFile({ fileName: `COPROJ_${p.client.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.pptx` });
    _suiviToast('PPTX généré ✓');
  } catch(err) {
    console.error('[suivi] PPTX error:', err);
    _suiviToast('Erreur PPTX : ' + (err.message || err), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📊 PPTX'; }
  }
}

/* ── Toast ── */
function _suiviToast(msg, type = 'success') {
  const t = document.getElementById('suivi-toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `show ${type}`;
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.className = ''; }, 2800);
}

/* ── Interventions CRUD ── */
function _suiviGetIntv() { return _suiviGetActive()?.interventions || null; }

function _suiviAddIntvRow() {
  const p = _suiviGetActive(); if (!p) return;
  if (!p.interventions) p.interventions = { intervenants:['Intervenant 1'], rows:[] };
  p.interventions.rows.push({ id:_suiviUid(), date:'', cells:{} });
  _suiviSave();
  _suiviRenderIntvTable();
}

function _suiviRemoveIntvRow(id) {
  const p = _suiviGetActive(); if (!p || !p.interventions) return;
  p.interventions.rows = p.interventions.rows.filter(r => r.id !== id);
  _suiviSave();
  _suiviRenderIntvTable();
}

function _suiviUpdateIntvDate(id, val) {
  const p = _suiviGetActive(); if (!p || !p.interventions) return;
  const r = p.interventions.rows.find(r => r.id === id);
  if (r) {
    r.date = val;
    p.interventions.rows = [...p.interventions.rows].sort((a,b) => (a.date||'') < (b.date||'') ? -1 : 1);
    _suiviSave();
    _suiviRenderIntvTbody();
  }
}

function _suiviAddIntervenant() {
  const p = _suiviGetActive(); if (!p) return;
  if (!p.interventions) p.interventions = { intervenants:[], rows:[] };
  p.interventions.intervenants.push('Intervenant');
  _suiviSave();
  _suiviRenderIntvTable();
  setTimeout(() => {
    const ins = document.querySelectorAll('.suivi-th-input');
    if (ins.length) { ins[ins.length-1].focus(); ins[ins.length-1].select(); }
  }, 50);
}

function _suiviRemoveIntervenant(idx) {
  const p = _suiviGetActive(); if (!p || !p.interventions) return;
  const name = p.interventions.intervenants[idx];
  p.interventions.intervenants.splice(idx, 1);
  p.interventions.rows.forEach(r => delete r.cells[name]);
  _suiviSave();
  _suiviRenderIntvTable();
}

function _suiviUpdateIntervenant(idx, newName) {
  const p = _suiviGetActive(); if (!p || !p.interventions) return;
  const old = p.interventions.intervenants[idx];
  p.interventions.intervenants[idx] = newName;
  p.interventions.rows.forEach(r => {
    if (old in r.cells) { r.cells[newName] = r.cells[old]; delete r.cells[old]; }
  });
  _suiviSave();
}

function _suiviSetCell(rowId, name, data) {
  const p = _suiviGetActive(); if (!p || !p.interventions) return;
  const r = p.interventions.rows.find(r => r.id === rowId);
  if (!r) return;
  if (!data.duration) delete r.cells[name];
  else r.cells[name] = data;
  p.updatedAt = new Date().toISOString();
  _suiviSave();
}

function _suiviOpenIntvEditor(rowId, name) {
  if (_suiviOpenEditor) _suiviCloseIntvEditor(_suiviOpenEditor.rowId, _suiviOpenEditor.name);
  _suiviOpenEditor = { rowId, name };
  const slot = document.getElementById(`suiviSlot-${rowId}-${CSS.escape(name)}`);
  if (slot) slot.classList.add('editing');
}

function _suiviCloseIntvEditor(rowId, name) {
  const slot = document.getElementById(`suiviSlot-${rowId}-${CSS.escape(name)}`);
  if (slot) slot.classList.remove('editing');
  _suiviOpenEditor = null;
}

function _suiviSaveAndCloseIntvEditor(rowId, name) {
  const eid = `${rowId}-${CSS.escape(name)}`;
  const dur  = document.getElementById(`suiviDur-${eid}`)?.value || '';
  const isJournee = dur === '0,75J' || dur === '1J';
  const per  = isJournee ? 'Journée' : (document.getElementById(`suiviPer-${eid}`)?.value || 'Matin');
  const note = document.getElementById(`suiviNote-${eid}`)?.value || '';
  const valide = document.getElementById(`suiviVal-${eid}`)?.dataset.valide === '1';
  _suiviSetCell(rowId, name, { duration:dur, period:per, note:note.trim(), valide });
  _suiviCloseIntvEditor(rowId, name);
  _suiviRenderIntvTbody();
}

function _suiviToggleCellValide(rowId, name) {
  const eid = `${rowId}-${CSS.escape(name)}`;
  const btn = document.getElementById(`suiviVal-${eid}`);
  if (!btn) return;
  const cur = btn.dataset.valide === '1';
  btn.dataset.valide = cur ? '0' : '1';
  btn.textContent = cur ? 'À valider' : 'Validé';
  btn.className = 'suivi-btn-valid ' + (cur ? 'v-no' : 'v-yes');
}

function _suiviOnDurChange(eid, dur) {
  const perSel = document.getElementById('suiviPer-' + eid);
  if (!perSel) return;
  const isJournee = dur === '0,75J' || dur === '1J';
  perSel.style.display = (isJournee || !dur) ? 'none' : '';
}

/* ── Render ── */
function _suiviSortActions(actions) {
  const typeOrder   = { action:0, comment:1, info:2, alert:3 };
  const statutOrder = { done:0, wip:1, todo:2 };
  return [...actions].sort((a,b) => {
    const t = (typeOrder[a.type||'action']??9) - (typeOrder[b.type||'action']??9);
    if (t !== 0) return t;
    return (statutOrder[a.statut]??9) - (statutOrder[b.statut]??9);
  });
}

function _suiviRenderSidebar() {
  const list = document.getElementById('suiviProjectList');
  if (!list) return;
  list.innerHTML = _suiviState.projects.map(p => `
    <div class="suivi-project-item ${p.id === _suiviState.activeId ? 'active' : ''}"
         onclick="_suiviSetActive('${p.id}')">
      <div class="suivi-project-dot" style="background:${p.color}"></div>
      <span class="suivi-project-name">${_suiviEsc(p.client)}</span>
      <button class="suivi-project-delete" onclick="event.stopPropagation();_suiviDeleteProject('${p.id}')" title="Supprimer">×</button>
    </div>
  `).join('');
}

function _suiviRenderActionsTbody() {
  const p = _suiviGetActive();
  const tbody = document.getElementById('suiviActionsTbody');
  if (!tbody) return;
  if (!p) { tbody.innerHTML = ''; return; }
  const clientLabel = p.client || 'Client';
  tbody.innerHTML = _suiviSortActions(p.actions).map(a => {
    const type      = a.type || 'action';
    const isAction  = type === 'action';
    const typeLabel = _SUIVI_TYPE_LABELS[type] || type;
    const respClass = a.responsable === '4CAD' ? 'suivi-resp-4cad' : 'suivi-resp-client';
    const respLabel = a.responsable === '4CAD' ? '4CAD' : clientLabel;
    const statClass = 'suivi-s-' + a.statut;
    const statLabel = _SUIVI_STATUT_LABELS[a.statut] || a.statut;
    const overdueClass = (isAction && a.statut !== 'done' && _suiviIsOverdue(a.echeance)) ? ' overdue' : '';
    const rowClass = isAction ? '' : ' suivi-row-nonaction';
    return `<tr class="${rowClass}">
      <td class="suivi-col-type">
        <span class="suivi-type-badge suivi-type-${type}" onclick="_suiviCycleType('${a.id}')" title="Cliquer pour changer">${typeLabel}</span>
      </td>
      <td class="suivi-col-action">
        <input class="suivi-action-input" value="${_suiviEsc(a.action)}" placeholder="Saisir le contenu…"
          onblur="_suiviUpdateAction('${a.id}','action',this.value)"
          onkeydown="if(event.key==='Enter')this.blur()">
      </td>
      <td class="suivi-col-resp">
        <span class="suivi-resp-badge ${respClass}" onclick="${isAction ? `_suiviToggleResp('${a.id}')` : 'void(0)'}"
          title="${isAction ? 'Cliquer pour basculer' : ''}">${_suiviEsc(respLabel)}</span>
      </td>
      <td class="suivi-col-ech">
        <input type="date" class="suivi-date-input${overdueClass}" value="${_suiviEsc(a.echeance||'')}"
          onchange="_suiviUpdateAction('${a.id}','echeance',this.value)">
      </td>
      <td class="suivi-col-statut">
        <span class="suivi-statut-badge ${statClass}" onclick="${isAction ? `_suiviCycleStatut('${a.id}')` : 'void(0)'}"
          title="${isAction ? 'Cliquer pour changer' : ''}">${statLabel}</span>
      </td>
      <td class="suivi-col-del">
        <button class="suivi-btn-del" onclick="_suiviRemoveAction('${a.id}')" title="Supprimer">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function _suiviRenderIntvTable() {
  const p = _suiviGetActive();
  const section = document.getElementById('suiviIntvSection');
  if (!section) return;
  if (!p) { section.style.display = 'none'; return; }
  section.style.display = '';
  if (!p.interventions) p.interventions = { intervenants:['Intervenant 1'], rows:[] };
  _suiviRenderIntvThead();
  _suiviRenderIntvTbody();
}

function _suiviRenderIntvThead() {
  const p = _suiviGetActive(); if (!p || !p.interventions) return;
  const ints = p.interventions.intervenants;
  const thead = document.getElementById('suiviIntvThead');
  if (!thead) return;
  thead.innerHTML = `<tr>
    <th style="width:175px">Date</th>
    ${ints.map((n, i) => `
      <th>
        <div class="suivi-th-wrap">
          <input class="suivi-th-input" value="${_suiviEsc(n)}"
            onblur="_suiviUpdateIntervenant(${i},this.value)"
            onkeydown="if(event.key==='Enter')this.blur()">
          <button class="suivi-btn-rm-intv" onclick="_suiviRemoveIntervenant(${i})" title="Supprimer">×</button>
        </div>
      </th>
    `).join('')}
    <th class="suivi-th-add-intv"><button class="suivi-btn-add-col" onclick="_suiviAddIntervenant()">+ Intervenant</button></th>
    <th style="width:30px;background:var(--surface2);border-bottom:1px solid var(--border)"></th>
  </tr>`;
}

function _suiviRenderIntvTbody() {
  const p = _suiviGetActive(); if (!p || !p.interventions) return;
  const ints = p.interventions.intervenants;
  const sorted = [...p.interventions.rows].sort((a,b) => (a.date||'') < (b.date||'') ? -1 : 1);
  const tbody = document.getElementById('suiviIntvTbody');
  if (!tbody) return;
  tbody.innerHTML = sorted.map(row => {
    const dateLabel = row.date ? _suiviFmtIntvDate(row.date) : 'Choisir une date…';
    const dateLabelClass = row.date ? '' : 'empty';
    const cellsHtml = ints.map(name => {
      const cell  = row.cells[name] || null;
      const text  = _suiviFmtCell(cell) || '·';
      const textClass = cell ? (cell.valide ? 'filled' : 'a-valider') : '';
      const valide = cell ? !!cell.valide : true;
      const dur   = cell ? cell.duration : '';
      const per   = cell ? cell.period : 'Matin';
      const note  = cell ? cell.note : '';
      const eid   = `${row.id}-${name}`;
      const eEid  = `${row.id}-${CSS.escape(name)}`;
      return `<td class="suivi-intv-cell">
        <div class="suivi-intv-slot" id="suiviSlot-${eEid}">
          <span class="suivi-slot-text ${textClass}" onclick="_suiviOpenIntvEditor('${row.id}','${_suiviEsc(name)}')">${_suiviEsc(text)}</span>
          <div class="suivi-slot-controls">
            <select class="suivi-intv-select" id="suiviDur-${eEid}" onchange="_suiviOnDurChange('${eEid}',this.value)">
              <option value=""     ${!dur         ? 'selected' : ''}>— vide —</option>
              <option value="0,25J"${dur==='0,25J'? 'selected' : ''}>0,25J</option>
              <option value="0,5J" ${dur==='0,5J' ? 'selected' : ''}>0,5J</option>
              <option value="0,75J"${dur==='0,75J'? 'selected' : ''}>0,75J</option>
              <option value="1J"   ${dur==='1J'   ? 'selected' : ''}>1J</option>
            </select>
            <select class="suivi-intv-select" id="suiviPer-${eEid}" style="${(!dur||dur==='0,75J'||dur==='1J') ? 'display:none' : ''}">
              <option value="Matin"      ${per==='Matin'      ? 'selected' : ''}>Matin</option>
              <option value="Après-midi" ${per==='Après-midi' ? 'selected' : ''}>Après-midi</option>
            </select>
            <input class="suivi-intv-note" id="suiviNote-${eEid}" placeholder="Note (ex: ADV)" value="${_suiviEsc(note)}">
            <div class="suivi-slot-row">
              <button class="suivi-btn-valid ${valide ? 'v-yes' : 'v-no'}" id="suiviVal-${eEid}" data-valide="${valide ? '1' : '0'}"
                onclick="_suiviToggleCellValide('${row.id}','${_suiviEsc(name)}')">${valide ? 'Validé' : 'À valider'}</button>
              <button class="suivi-btn-close" onclick="_suiviSaveAndCloseIntvEditor('${row.id}','${_suiviEsc(name)}')">✓ OK</button>
            </div>
          </div>
        </div>
      </td>`;
    }).join('');
    return `<tr>
      <td>
        <div class="suivi-date-cell">
          <span class="suivi-date-label ${dateLabelClass}">${dateLabel}</span>
          <button class="suivi-cal-btn" onclick="document.getElementById('suiviDp-${row.id}').showPicker()" title="Choisir une date">📅</button>
          <input type="date" class="suivi-date-picker" id="suiviDp-${row.id}" value="${_suiviEsc(row.date||'')}"
            onchange="_suiviUpdateIntvDate('${row.id}',this.value)">
        </div>
      </td>
      ${cellsHtml}
      <td style="width:26px;text-align:center;padding:4px 2px">
        <button class="suivi-btn-rm-row" onclick="_suiviRemoveIntvRow('${row.id}')">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function _suiviRender() {
  _suiviRenderSidebar();
  const p = _suiviGetActive();
  const empty = document.getElementById('suiviEmpty');
  const view  = document.getElementById('suiviProjectView');
  const title = document.getElementById('suiviTitleInput');
  const btnExportJson = document.getElementById('suiviBtnExportJson');
  const btnExportPptx = document.getElementById('suiviBtnExportPptx');
  if (!empty || !view) return;

  if (!p) {
    empty.style.display = 'flex';
    view.style.display  = 'none';
    if (title) { title.value = ''; title.disabled = true; }
    if (btnExportJson) btnExportJson.style.display = 'none';
    if (btnExportPptx) btnExportPptx.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  view.style.display  = '';
  if (title) { title.value = p.client; title.disabled = false; }
  if (btnExportJson) btnExportJson.style.display = '';
  if (btnExportPptx) btnExportPptx.style.display = '';
  _suiviRenderActionsTbody();
  _suiviRenderIntvTable();
}

/* Appelée par le routeur lors du switch vers cet onglet */
function renderSuiviView() {
  _suiviRender();
}
