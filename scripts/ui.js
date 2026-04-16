/* ═══════════════════════════════════════════
   ui.js — Panneaux, sidebar, formulaires, UX
   ═══════════════════════════════════════════ */

function toggleDates(){
  showDates=!showDates;
  const btn=document.getElementById('toggleDatesBtn');
  if(btn){btn.textContent=showDates?'Masquer dates':'Afficher dates';btn.classList.toggle('hidden-dates',!showDates);}
  document.querySelectorAll('.row-dates').forEach(el=>el.classList.toggle('hidden',!showDates));
}
function initResize(){
  const handle=document.getElementById('resizeHandle');
  if(!handle)return;
  let startX,startW;
  handle.addEventListener('mousedown',e=>{
    e.preventDefault();
    startX=e.clientX;startW=labelW;
    handle.classList.add('dragging');
    const onMove=ev=>{
      labelW=Math.max(120,Math.min(700,startW+(ev.clientX-startX)));
      const el=document.getElementById('ganttLeftPanel');
      if(el){el.style.width=labelW+'px';document.documentElement.style.setProperty('--label-w',labelW+'px');}
    };
    const onUp=()=>{handle.classList.remove('dragging');document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);};
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  });
}
function initNavResize(){
  const handle=document.getElementById('navResizeHandle');
  if(!handle)return;
  if(handle._navResizeInit) return;
  handle._navResizeInit=true;
  let startX,startW;
  handle.addEventListener('mousedown',e=>{
    e.preventDefault();
    const sidebar=document.getElementById('navSidebar');
    if(!sidebar||sidebar.classList.contains('collapsed'))return;
    startX=e.clientX;startW=sidebar.offsetWidth;
    handle.classList.add('dragging');
    const onMove=ev=>{
      const newW=Math.max(180,Math.min(500,startW+(ev.clientX-startX)));
      sidebar.style.width=newW+'px';
      sidebar.style.transition='none';
    };
    const onUp=()=>{
      handle.classList.remove('dragging');
      const sidebar=document.getElementById('navSidebar');
      if(sidebar)sidebar.style.transition='';
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onUp);
    };
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  });
}
function openColorPicker(e,p){
  e.stopPropagation();cpTarget=p;
  const cur=getColor(p);
  document.getElementById('cpTitle').textContent=p;
  document.getElementById('cpCustom').value=cur;
  document.getElementById('colorGrid').innerHTML=PALETTE.map(c=>`<div class="color-opt${c===cur?' selected':''}" style="background:${c}" onclick="pickColor('${p.replace(/'/g,"\\'")}','${c}')"></div>`).join('');
  const pop=document.getElementById('colorPopup');pop.style.display='block';
  const rc=e.target.getBoundingClientRect();
  const popH=pop.offsetHeight||220;
  const spaceBelow=window.innerHeight-rc.bottom;
  const top=spaceBelow<popH+8 ? rc.top-popH-4 : rc.bottom+4;
  pop.style.left=Math.min(rc.left,window.innerWidth-214)+'px';
  pop.style.top=Math.max(4,top)+'px';
}
function pickColor(p,c){projectColors[p]=c;document.getElementById('colorPopup').style.display='none';renderAll();}
function showAddForm(){
  cancelInlineEdit();
  ['fProjet','fGroupe','fTache','fDebut','fFin','fCharge'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('addForm').style.display='block';
  document.getElementById('fProjet').focus();
}
function updateDatalists(){
  const tasks=rows.filter(r=>r._type==='tache');
  document.getElementById('projetList').innerHTML=[...new Set(tasks.map(r=>r.projet))].map(p=>`<option value="${escH(p)}">`).join('');
  document.getElementById('groupeList').innerHTML=[...new Set(tasks.filter(r=>r.groupe).map(r=>r.groupe))].map(g=>`<option value="${escH(g)}">`).join('');
}
function submitForm(){
  const p=document.getElementById('fProjet').value.trim();
  const g=document.getElementById('fGroupe').value.trim();
  const t=document.getElementById('fTache').value.trim();
  const d=document.getElementById('fDebut').value;
  const f=document.getElementById('fFin').value;
  const c=document.getElementById('fCharge').value;
  if(!p||!d||!f){alert('Projet, Début et Fin requis.');return;}
  rows.push({_type:'tache',projet:p,groupe:g||null,tache:t||null,debut:parseDate(d),fin:parseDate(f),charge:c?roundCharge(parseFloat(c.replace(',','.'))):null});
  document.getElementById('addForm').style.display='none';
  sortRows();renderAll();
}
function renderTable(){
  const tb=document.getElementById('tableBody');
  const tasks=rows.filter(r=>r._type==='tache');
  if(!tasks.length){tb.innerHTML=`<tr><td colspan="8"><div class="empty"><div class="icon">📋</div><p>Aucune donnée.</p></div></td></tr>`;return;}
  tb.innerHTML=tasks.map(r=>renderTableRow(r,rows.indexOf(r))).join('');
  updateDatalists();
}
function renderTableRow(r,ri){
  const c=getColor(r.projet);
  if(editingIdx===ri){
    return`<tr class="row-tache editing-row" id="row-${ri}">
      <td onclick="event.stopPropagation()"><span class="color-swatch" style="background:${c}" onclick="openColorPicker(event,'${escH(r.projet)}')"></span></td>
      <td><input class="cell-input" id="ei-projet" value="${escH(r.projet)}" list="projetList" style="min-width:80px"></td>
      <td><input class="cell-input" id="ei-groupe" value="${escH(r.groupe||'')}" list="groupeList" placeholder="—" style="min-width:70px"></td>
      <td><input class="cell-input" id="ei-tache" value="${escH(r.tache||'')}" style="min-width:110px"></td>
      <td><input class="cell-input cell-input-date" id="ei-debut" type="date" value="${toInput(r.debut)}"></td>
      <td><input class="cell-input cell-input-date" id="ei-fin" type="date" value="${toInput(r.fin)}"></td>
      <td><input class="cell-input cell-input-charge" id="ei-charge" type="number" step="0.5" min="0" value="${r.charge!==null?r.charge:''}"></td>
      <td style="display:flex;gap:4px;padding:4px 7px">
        <button class="save-btn" onclick="saveInlineEdit(${ri})">✔</button>
        <button class="cancel-btn" onclick="cancelInlineEdit()">✕</button>
      </td>
    </tr>`;
  }
  return`<tr class="row-tache" id="row-${ri}" onclick="startInlineEdit(event,${ri})">
    <td onclick="event.stopPropagation()"><span class="color-swatch" style="background:${c}" onclick="openColorPicker(event,'${escH(r.projet)}')"></span></td>
    <td><span class="tag-projet" style="background:${c}22;color:${c}">${escH(r.projet)}</span></td>
    <td style="color:var(--muted)">${r.groupe?escH(r.groupe):'<em style="opacity:.38">—</em>'}</td>
    <td style="color:var(--text)">${r.tache?escH(r.tache):'<em style="opacity:.38">—</em>'}</td>
    <td>${fmtD(r.debut)}</td><td>${fmtD(r.fin)}</td>
    <td>${r.charge!==null?`<span class="charge-badge">${fmtCharge(r.charge)}j</span>`:'—'}</td>
    <td onclick="event.stopPropagation()"><button class="del-btn" onclick="deleteRow(${ri})">✕</button></td>
  </tr>`;
}
function startInlineEdit(evt,ri){
  if(evt&&evt.target.closest('.del-btn,.color-swatch'))return;
  if(editingIdx===ri)return;
  const prev=editingIdx;editingIdx=ri;
  if(prev!==null){const tr=document.getElementById(`row-${prev}`);if(tr)tr.outerHTML=renderTableRow(rows[prev],prev);}
  const tr=document.getElementById(`row-${ri}`);
  if(tr){tr.outerHTML=renderTableRow(rows[ri],ri);setTimeout(()=>document.getElementById('ei-tache')?.focus(),30);}
}
function saveInlineEdit(ri){
  const p=document.getElementById('ei-projet')?.value.trim();
  const g=document.getElementById('ei-groupe')?.value.trim();
  const t=document.getElementById('ei-tache')?.value.trim();
  const d=document.getElementById('ei-debut')?.value;
  const f=document.getElementById('ei-fin')?.value;
  const c=document.getElementById('ei-charge')?.value;
  if(!p||!d||!f){alert('Projet, Début et Fin requis.');return;}
  const _prevRow = rows[ri] || {};
  rows[ri]={..._prevRow,_type:'tache',projet:p,groupe:g||null,tache:t||null,debut:parseDate(d),fin:parseDate(f),charge:c!==''?roundCharge(parseFloat(c)):null,_source:'planned'};
  editingIdx=null;sortRows();renderAll();saveCurrentProject();
}
function cancelInlineEdit(){
  const prev=editingIdx;editingIdx=null;
  if(prev!==null){const tr=document.getElementById(`row-${prev}`);if(tr&&rows[prev])tr.outerHTML=renderTableRow(rows[prev],prev);}
}
function deleteRow(ri){
  if(editingIdx===ri)editingIdx=null;
  rows.splice(ri,1);
  rows=rows.filter(r=>r._type==='tache');
  sortRows();renderAll();
}

/* ══════════════════════════════════════════════════════════
   PANNEAU D'AFFECTATION DES RESSOURCES
   Slide-in depuis la droite — ouvert par le bouton 👤 sur chaque tâche
   ══════════════════════════════════════════════════════════ */

let affectRowIdx = null; // index de la tâche en cours d'édition

function openAffectPanel(rowIdx) {
  affectRowIdx = rowIdx;
  const r = rows[rowIdx];
  if (!r || r._type !== 'tache') return;

  // Ouvre aussi le backdrop
  document.getElementById('panelBackdrop').classList.add('visible');
  const panel = document.getElementById('affectPanel');
  panel.classList.add('open');

  // Titre
  document.getElementById('affectPanelTitle').textContent =
    '👥 ' + (r.tache || 'Tâche');

  // Point 5 : si aucune ressource, ouvre avec une ligne vide prête à remplir
  if (!r.assignments || r.assignments.length === 0) {
    if (!r.assignments) r.assignments = [];
    r.assignments.push({ resourceId: '', resourceNom: '', charge: null, chargePassee: null, chargeRestante: null, debut: r.debut || null, fin: r.fin || null });
  }
  renderAffectList(r);
}

function closeAffectPanel() {
  affectRowIdx = null;
  document.getElementById('affectPanel').classList.remove('open');
  document.getElementById('panelBackdrop').classList.remove('visible');
}

/* Charge effective = somme des daily sauvegardés + _ganttEdits en attente (point 4) */
function _effectiveAsgnCharge(asgnIdx, a) {
  if (!a.resourceId) return a.charge;
  const prefix = `${affectRowIdx}::${a.resourceId}::`;
  const hasPending = typeof _ganttEdits !== 'undefined' &&
    Object.keys(_ganttEdits).some(k => k.startsWith(prefix));
  const hasDaily = a.daily && Object.keys(a.daily).length > 0;
  if (!hasPending && !hasDaily) return a.charge;
  const merged = { ...(a.daily || {}) };
  if (typeof _ganttEdits !== 'undefined') {
    Object.entries(_ganttEdits).forEach(([k, v]) => {
      if (k.startsWith(prefix)) merged[k.slice(prefix.length)] = v;
    });
  }
  const total = Object.values(merged).reduce((s, v) => s + (v > 0 ? v : 0), 0);
  return Math.round(total * 10000) / 10000 || null;
}

function renderAffectList(r) {
  const asgns = r.assignments || [];
  const container = document.getElementById('affectList');

  const _lcfg = _getLissageConfig();
  const _chStep = _lcfg.strictMin ? _lcfg.minCharge : 0.0625;
  const rows_html = asgns.map((a, i) => {
    const allRes = typeof resources !== 'undefined' ? resources : [];
    const curRes = allRes.find(r => r.id === a.resourceId);
    const curName = curRes ? (curRes.fullName || [curRes.prenom, curRes.nom].filter(Boolean).join(' ') || '?') : '';

    const aDebut = a.debut instanceof Date ? toInput(a.debut) : (a.debut ? String(a.debut).slice(0,10) : '');
    const aFin   = a.fin   instanceof Date ? toInput(a.fin)   : (a.fin   ? String(a.fin).slice(0,10)   : '');
    const dispCharge = _effectiveAsgnCharge(i, a);
    return `<div class="affect-row" data-asgn="${i}">
      <div class="affect-row-main">
        <div class="affect-search-wrap">
          <input type="text" class="affect-search-input" id="affectSearch_${i}"
                 placeholder="Rechercher une ressource…"
                 value="${escH(curName)}"
                 autocomplete="off"
                 oninput="_affectSearchInput(${i},this.value)"
                 onfocus="_affectSearchFocus(${i})"
                 onblur="_affectSearchBlur(${i})">
          <div class="affect-search-drop" id="affectDrop_${i}"></div>
        </div>
        <button class="affect-del-btn" onclick="affectDelRow(${i})" title="Supprimer">✕</button>
      </div>
      <div class="affect-row-dates">
        <div class="affect-charge-group">
          <label class="affect-ch-label ch-prev-lbl">Début</label>
          <input type="date" class="affect-ch-input" value="${aDebut}"
            onchange="affectChangeDate(${i},'debut',this.value)">
        </div>
        <div class="affect-charge-group">
          <label class="affect-ch-label ch-rest-lbl">Fin</label>
          <input type="date" class="affect-ch-input" value="${aFin}"
            onchange="affectChangeDate(${i},'fin',this.value)">
        </div>
      </div>
      <div class="affect-row-charges">
        <div class="affect-charge-group">
          <label class="affect-ch-label ch-prev-lbl">Prévue (j)</label>
          <input type="number" class="affect-ch-input" step="${_chStep}" min="0"
            value="${dispCharge != null ? dispCharge : ''}"
            placeholder="—"
            onchange="affectChangeCharge(${i},'charge',this.value)">
        </div>
        <div class="affect-charge-group">
          <label class="affect-ch-label ch-pass-lbl">Passée (j)</label>
          <input type="number" class="affect-ch-input" step="0.25" min="0"
            value="${a.chargePassee != null ? a.chargePassee : ''}"
            placeholder="—" readonly
            title="Renseignée à l'import ou via l'outil source">
        </div>
        <div class="affect-charge-group">
          <label class="affect-ch-label ch-rest-lbl">Restante (j)</label>
          <input type="number" class="affect-ch-input" step="0.25" min="0"
            value="${a.chargeRestante != null ? a.chargeRestante : ''}"
            placeholder="—" readonly
            title="Calculée automatiquement">
        </div>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = rows_html ||
    '<div class="affect-empty">Aucune ressource affectée</div>';

  updateAffectTotals(r);
}

/* ── Recherche de ressource (combobox) ──────────────────────────────────────── */
function _affectGetResList() {
  return typeof resources !== 'undefined' ? resources : [];
}
function _affectResName(res) {
  return res.fullName || [res.prenom, res.nom].filter(Boolean).join(' ') || '?';
}
function _affectShowDrop(idx, filter) {
  const drop = document.getElementById('affectDrop_' + idx);
  if (!drop) return;
  const q = normalizeStr(filter);
  const matches = _affectGetResList().filter(r =>
    !q || normalizeStr(_affectResName(r)).includes(q)
  );
  if (!matches.length) { drop.innerHTML = '<div class="affect-search-empty">Aucun résultat</div>'; }
  else {
    drop.innerHTML = matches.map(r =>
      `<div class="affect-search-opt" onmousedown="_affectPick(${idx},'${escH(r.id)}')">${escH(_affectResName(r))}</div>`
    ).join('');
  }
  drop.classList.add('open');
}
function _affectSearchInput(idx, val) { _affectShowDrop(idx, val); }
function _affectSearchFocus(idx) {
  const inp = document.getElementById('affectSearch_' + idx);
  _affectShowDrop(idx, inp ? inp.value : '');
}
function _affectSearchBlur(idx) {
  /* Délai pour laisser onmousedown se déclencher avant la fermeture */
  setTimeout(() => {
    const drop = document.getElementById('affectDrop_' + idx);
    if (drop) drop.classList.remove('open');
  }, 180);
}
function _affectPick(asgnIdx, resId) {
  const inp = document.getElementById('affectSearch_' + asgnIdx);
  const res = _affectGetResList().find(r => r.id === resId);
  if (inp && res) inp.value = _affectResName(res);
  affectChangeRes(asgnIdx, resId);
}

function affectChangeRes(idx, resId) {
  const r = rows[affectRowIdx];
  if (!r) return;
  if (!r.assignments) r.assignments = [];
  const res = (typeof resources !== 'undefined' ? resources : []).find(x => x.id === resId);
  r.assignments[idx].resourceId  = resId;
  r.assignments[idx].resourceNom = res ? (res.fullName || [res.prenom, res.nom].filter(Boolean).join(' ') || '?') : '?';
  saveAndRefreshAffect(r);
}

function affectChangeCharge(idx, field, val) {
  const r = rows[affectRowIdx];
  if (!r || !r.assignments) return;
  const v = parseFloat(val);
  r.assignments[idx][field] = isNaN(v) ? null : Math.round(v * 10000) / 10000;
  // Recalcule restante = prévu - passé pour l'assignment modifié
  const a = r.assignments[idx];
  a.chargeRestante = (a.charge != null && a.chargePassee != null)
    ? Math.round((a.charge - a.chargePassee) * 10000) / 10000
    : a.charge;
  // Recalcule charge totale tâche = cumul des ressources
  const totalCharge = r.assignments.reduce((s, a) => s + (a.charge || 0), 0);
  const totalPassee = r.assignments.reduce((s, a) => s + (a.chargePassee || 0), 0);
  r.charge = Math.round(totalCharge * 10000) / 10000 || null;
  r.chargePassee = Math.round(totalPassee * 10000) / 10000 || null;
  r.chargeRestante = (r.charge != null && r.chargePassee != null)
    ? Math.round((r.charge - r.chargePassee) * 10000) / 10000
    : r.charge;
  saveAndRefreshAffect(r);
  /* Lissage automatique sur modification de la charge prévue */
  if (field === 'charge') {
    const a = r.assignments[idx];
    if (!a.charge || a.charge <= 0) {
      /* Charge = 0 : vider toutes les cellules daily de cet assignment */
      if (a.resourceId && typeof _ganttEdits !== 'undefined') {
        const prefix = `${affectRowIdx}::${a.resourceId}::`;
        Object.keys(_ganttEdits).forEach(k => { if (k.startsWith(prefix)) delete _ganttEdits[k]; });
        if (a.daily) Object.keys(a.daily).forEach(dk => { _ganttEdits[`${prefix}${dk}`] = 0; });
      }
      if (typeof _updateSaveBtn === 'function') _updateSaveBtn();
      if (typeof _renderGanttKeepScroll === 'function') _renderGanttKeepScroll();
      else if (typeof renderGantt === 'function') renderGantt();
    } else {
      _proposeLissageForAssignment(idx);
    }
  }
}

function affectChangeDate(idx, field, val) {
  const r = rows[affectRowIdx];
  if (!r || !r.assignments) return;
  if (val) {
    const d = new Date(val);
    d.setHours(0,0,0,0);
    r.assignments[idx][field] = d;
  } else {
    r.assignments[idx][field] = null;
  }
  _recalcTaskDates(r);
  saveAndRefreshAffect(r);
}

function _recalcTaskDates(r) {
  const asgns = r.assignments || [];
  const debuts = asgns.map(a => a.debut instanceof Date ? a.debut : (a.debut ? new Date(a.debut) : null)).filter(Boolean);
  const fins   = asgns.map(a => a.fin   instanceof Date ? a.fin   : (a.fin   ? new Date(a.fin)   : null)).filter(Boolean);
  if (debuts.length) { const d = new Date(Math.min(...debuts.map(x=>x.getTime()))); d.setHours(0,0,0,0); r.debut = d; }
  if (fins.length)   { const d = new Date(Math.max(...fins.map(x=>x.getTime())));   d.setHours(0,0,0,0); r.fin   = d; }
}

function affectDelRow(idx) {
  const r = rows[affectRowIdx];
  if (!r || !r.assignments) return;
  const asgn = r.assignments[idx];

  /* ── Supprimer les entrées GHO pour cette ressource+tâche ── */
  if (asgn && asgn.resourceId && typeof resources !== 'undefined') {
    const res = resources.find(x => x.id === asgn.resourceId);
    if (res && res.ghoData && res.ghoData.projects) {
      res.ghoData.projects.forEach(p => {
        if (!p.tasks) return;
        const tIdx = p.tasks.findIndex(t =>
          (r.externalTaskId && typeof _matchTaskId === 'function' && _matchTaskId(r.externalTaskId, t.taskId)) ||
          (t.taskName || '') === (r.tache || '')
        );
        if (tIdx !== -1) p.tasks.splice(tIdx, 1);
      });
      /* Nettoyer les projets devenus vides */
      res.ghoData.projects = res.ghoData.projects.filter(p => (p.tasks || []).length > 0);
    }
  }

  /* ── Effacer les _ganttEdits en attente pour cet assignment ── */
  if (asgn && asgn.resourceId && typeof _ganttEdits !== 'undefined') {
    const prefix = `${affectRowIdx}::${asgn.resourceId}::`;
    Object.keys(_ganttEdits).forEach(k => { if (k.startsWith(prefix)) delete _ganttEdits[k]; });
    if (typeof _updateSaveBtn === 'function') _updateSaveBtn();
  }

  r.assignments.splice(idx, 1);
  /* Recalcule charge totale = cumul des ressources */
  if (r.assignments.length > 0) {
    const totalCharge = r.assignments.reduce((s, a) => s + (a.charge || 0), 0);
    const totalPassee = r.assignments.reduce((s, a) => s + (a.chargePassee || 0), 0);
    r.charge = Math.round(totalCharge * 10000) / 10000 || null;
    r.chargePassee = Math.round(totalPassee * 10000) / 10000 || null;
    r.chargeRestante = (r.charge != null && r.chargePassee != null)
      ? Math.round((r.charge - r.chargePassee) * 10000) / 10000
      : r.charge;
  }
  if (typeof saveGhoData === 'function') saveGhoData();
  saveAndRefreshAffect(r);
}

function affectAddRow() {
  const r = rows[affectRowIdx];
  if (!r) return;
  if (!r.assignments) r.assignments = [];
  /* Point 1 : dates par défaut = celles de la tâche */
  r.assignments.push({
    resourceId: '', resourceNom: '', charge: null, chargePassee: null, chargeRestante: null,
    debut: r.debut ? new Date(r.debut) : null,
    fin:   r.fin   ? new Date(r.fin)   : null
  });
  renderAffectList(r);
}

function saveAndRefreshAffect(r) {
  /* Capturer une clé stable AVANT le tri.
     sortRows() reconstruit rows[] avec de nouveaux objets ({...spread}),
     donc rows.indexOf(r) retourne toujours -1 — on ne peut pas se fier à la référence. */
  const _stableKey = (row) =>
    (row.projet || '') + '\0' + JSON.stringify(row.niveaux || []) + '\0' + (row.tache || '');
  const curKey = _stableKey(r);

  sortRows();

  /* Resynchroniser affectRowIdx et les clés _ganttEdits après le tri */
  if (affectRowIdx !== null) {
    const newIdx = rows.findIndex(row => row._type === 'tache' && _stableKey(row) === curKey);
    if (newIdx !== -1 && newIdx !== affectRowIdx && typeof _ganttEdits !== 'undefined') {
      const oldPfx = `${affectRowIdx}::`, newPfx = `${newIdx}::`;
      Object.keys(_ganttEdits).filter(k => k.startsWith(oldPfx)).forEach(k => {
        _ganttEdits[newPfx + k.slice(oldPfx.length)] = _ganttEdits[k];
        delete _ganttEdits[k];
      });
    }
    if (newIdx !== -1) affectRowIdx = newIdx;
  }

  saveCurrentProject();
  renderAffectList(rows[affectRowIdx] || r);
  renderGantt();
}

function updateAffectTotals(r) {
  const asgns = r.assignments || [];
  const totalPrev = asgns.reduce((s, a) => s + (a.charge || 0), 0);
  const totalPass = asgns.reduce((s, a) => s + (a.chargePassee || 0), 0);
  // Restante = prévu - passé
  const totalRest = totalPrev - totalPass;

  const el = document.getElementById('affectTotals');
  if (!el) return;

  el.innerHTML = `
    <span class="affect-total-item ch-prev">Prév : <b>${totalPrev ? (Math.round(totalPrev*100)/100)+'j' : '—'}</b></span>
    <span class="affect-total-item ch-pass">Pass : <b>${totalPass ? (Math.round(totalPass*100)/100)+'j' : '—'}</b></span>
    <span class="affect-total-item ch-rest">Rest : <b>${totalRest ? (Math.round(totalRest*100)/100)+'j' : '—'}</b></span>
  `;
}

/* ══════════════════════════════════════════════════════════
   LISSAGE DE CHARGE — Répartition automatique
   ══════════════════════════════════════════════════════════ */

function _getLissageConfig() {
  const proj = (typeof portfolio !== 'undefined' && typeof activeProjectId !== 'undefined')
    ? portfolio.find(p => p.id === activeProjectId) : null;
  const cfg = proj?.lissageConfig || {};
  return {
    minCharge:          cfg.minCharge          !== undefined ? cfg.minCharge          : 0.125,
    strictMin:          cfg.strictMin          !== undefined ? cfg.strictMin          : true,
    preferCharge:       cfg.preferCharge       !== undefined ? cfg.preferCharge       : 0.5,
    strictPrefer:       cfg.strictPrefer       !== undefined ? cfg.strictPrefer       : false,
    avoidDays:          cfg.avoidDays          !== undefined ? cfg.avoidDays          : [5],
    strictAvoid:        cfg.strictAvoid        !== undefined ? cfg.strictAvoid        : false,
    usePlannedInLissage: cfg.usePlannedInLissage !== undefined ? cfg.usePlannedInLissage : true
  };
}

function _dayKeyLocal(d) {
  return typeof _dayKey === 'function' ? _dayKey(d)
    : `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function _getWorkDaysRange(debut, fin) {
  const days = [];
  const d = new Date(debut); d.setHours(0,0,0,0);
  const e = new Date(fin);   e.setHours(0,0,0,0);
  while (d <= e) {
    const dw = d.getDay();
    const notWE = dw !== 0 && dw !== 6;
    const notFerie = !(typeof _isFerie === 'function' && _isFerie(d));
    if (notWE && notFerie) days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/* Capacité disponible d'une ressource pour un jour, en excluant la tâche courante.
   Tient compte des _ganttEdits en attente (point 7). */
function _availCapForDay(resourceId, d, excludeTaskName, excludeExtId) {
  if (typeof resources === 'undefined') return 1;
  const res = resources.find(x => x.id === resourceId);
  const dk = _dayKeyLocal(d);
  const cfg = _getLissageConfig();
  let used = 0;

  /* Base : charges GHO sauvegardées, hors tâche courante */
  if (res && res.ghoData) {
    if (res.ghoData.projects) {
      res.ghoData.projects.forEach(p => {
        (p.tasks || []).forEach(t => {
          const isCur =
            (excludeExtId && typeof _matchTaskId === 'function' && _matchTaskId(excludeExtId, t.taskId)) ||
            (t.taskName || '') === excludeTaskName;
          if (!isCur) used += (t.daily[dk] || 0);
        });
      });
    } else {
      (res.ghoData.activities || []).forEach(a => {
        if ((a.name || '') !== excludeTaskName) used += (a.daily[dk] || 0);
      });
    }
  }

  /* Deltas _ganttEdits en attente pour les autres tâches de la même ressource (point 7) */
  if (typeof _ganttEdits !== 'undefined' && typeof rows !== 'undefined') {
    Object.entries(_ganttEdits).forEach(([ek, pendingCharge]) => {
      const f = ek.indexOf('::'), l = ek.lastIndexOf('::');
      if (ek.slice(f+2, l) !== resourceId || ek.slice(l+2) !== dk) return;
      const row = rows[parseInt(ek.slice(0, f))];
      if (!row) return;
      const isCur =
        (excludeExtId && typeof _matchTaskId === 'function' && _matchTaskId(excludeExtId, row.externalTaskId)) ||
        (row.tache || '') === excludeTaskName;
      if (isCur) return;
      /* Le GHO comptait déjà la valeur sauvegardée ; on applique le delta */
      const asgn = (row.assignments || []).find(a => a.resourceId === resourceId);
      const saved = (asgn?.daily && asgn.daily[dk]) || 0;
      used += (pendingCharge - saved);
    });
  }

  /* Option : delta planifié — ajoute la différence (assignment - GHO) pour toutes les tâches
     du portfolio ayant une affectation sur cette ressource + ce jour (hors tâche courante) */
  if (cfg.usePlannedInLissage && typeof portfolio !== 'undefined' && res) {
    portfolio.forEach(proj => {
      (proj.rows || []).forEach(row => {
        if (row._type !== 'tache') return;
        const isCur =
          (excludeExtId && row.externalTaskId &&
            (typeof _matchTaskId === 'function'
              ? _matchTaskId(excludeExtId, row.externalTaskId)
              : excludeExtId === row.externalTaskId)) ||
          (!excludeExtId && (row.tache || '') === excludeTaskName);
        if (isCur) return;
        const asgn = (row.assignments || []).find(a => a.resourceId === resourceId);
        if (!asgn) return;
        let ghoTask = 0;
        if (res.ghoData && res.ghoData.projects) {
          const gp = res.ghoData.projects.find(p => p.name === row.projet);
          if (gp) {
            const gt = (gp.tasks || []).find(t =>
              (row.externalTaskId && t.taskId === row.externalTaskId) ||
              t.taskName === (row.tache || ''));
            ghoTask = (gt && gt.daily && gt.daily[dk]) || 0;
          }
        }
        const assigned = (asgn.daily && asgn.daily[dk]) || 0;
        used += assigned - ghoTask; /* delta planifié : s'ajoute à la base GHO */
      });
    });
  }

  return Math.max(0, Math.round((1 - used) * 10000) / 10000);
}

/* Algorithme de lissage : retourne { daily, remaining } */
function _computeLissage(charge, debut, fin, resourceId, taskName, extId) {
  const cfg = _getLissageConfig();
  const pc  = cfg.preferCharge || 0;

  /* Filtre des slots selon la règle strictMin */
  const allSlots = _getWorkDaysRange(debut, fin).map(d => ({
    d, dk: _dayKeyLocal(d),
    avail: _availCapForDay(resourceId, d, taskName, extId),
    avoid: cfg.avoidDays.includes(d.getDay())
  })).filter(s => cfg.strictMin ? s.avail >= cfg.minCharge : s.avail > 0);

  /* strictAvoid : si strict, les jours évités sont exclus ; sinon utilisés en fallback */
  const preferred = allSlots.filter(s => !s.avoid);
  const avoided   = cfg.strictAvoid ? [] : allSlots.filter(s => s.avoid);

  const grain     = cfg.strictMin ? cfg.minCharge : 0.0625;
  const floorMin  = (v) => Math.floor(v / grain) * grain;
  const minThresh = cfg.strictMin ? cfg.minCharge : 1e-9;
  const result = {};
  let rem = charge;

  function place(s, amount) {
    const assign = Math.round(floorMin(Math.min(amount, rem)) * 10000) / 10000;
    if (assign >= minThresh && rem > 1e-9) {
      result[s.dk] = Math.round(((result[s.dk] || 0) + assign) * 10000) / 10000;
      rem = Math.round((rem - assign) * 10000) / 10000;
    }
  }

  if (pc > 0) {
    /* Séparer les slots selon qu'ils peuvent absorber au moins pc ou non */
    const prefFull    = preferred.filter(s => s.avail >= pc);
    const prefPartial = preferred.filter(s => s.avail <  pc);
    const avoidFull   = avoided.filter(s => s.avail >= pc);
    const avoidPart   = avoided.filter(s => s.avail <  pc);

    /* Passe 1 : assigner exactement pc sur les slots "full" (preferred first, then avoided) */
    for (const s of [...prefFull, ...avoidFull]) {
      if (rem <= 1e-9) break;
      place(s, rem >= pc ? pc : rem);
    }

    /* Passe 2 : remplir les slots partiels (avail < pc) — toujours, strict ou non */
    for (const s of [...prefPartial, ...avoidPart]) {
      if (rem <= 1e-9) break;
      place(s, s.avail);
    }

    /* Passe 3 (non-strict seulement) : déborder sur les slots "full" au-delà de pc */
    if (!cfg.strictPrefer && rem > 1e-9) {
      for (const s of [...prefFull, ...avoidFull]) {
        if (rem <= 1e-9) break;
        const already = result[s.dk] || 0;
        const extra = s.avail - already;
        if (extra > 1e-9) place(s, extra);
      }
    }
  } else {
    /* pc=0 : remplissage glouton simple */
    for (const list of [preferred, avoided]) {
      for (const s of list) {
        if (rem <= 1e-9) break;
        place(s, s.avail);
      }
      if (rem <= 1e-9) break;
    }
  }

  return { daily: result, remaining: Math.max(0, rem) };
}

/* Propose le lissage via _ganttEdits (cellules bleues).
   Période = debut de l'assignment → fin de la TÂCHE (point 5).
   Le dialog n'apparaît que si on dépasse la fin de la tâche. */
function _proposeLissageForAssignment(idx) {
  const r = rows[affectRowIdx];
  if (!r || !r.assignments || !r.assignments[idx]) return;
  const a = r.assignments[idx];
  if (!a.resourceId || !a.charge || a.charge <= 0) return;

  const debut   = a.debut || r.debut;
  const taskFin = r.fin;                 // limite = fin de la tâche
  if (!debut || !taskFin) return;

  /* Lissage sur toute la période de la tâche */
  const { daily, remaining } = _computeLissage(
    a.charge, debut, taskFin, a.resourceId, r.tache || '', r.externalTaskId || ''
  );

  const applyEdits = (finalDaily, newTaskFin) => {
    const prefix = `${affectRowIdx}::${a.resourceId}::`;
    Object.keys(_ganttEdits).forEach(k => { if (k.startsWith(prefix)) delete _ganttEdits[k]; });
    /* Effacer les anciennes charges non incluses dans le lissage */
    if (a.daily) {
      Object.keys(a.daily).forEach(dk => {
        if (!finalDaily[dk]) _ganttEdits[`${prefix}${dk}`] = 0;
      });
    }
    Object.entries(finalDaily).forEach(([dk, ch]) => {
      _ganttEdits[`${prefix}${dk}`] = ch;
    });
    /* Si l'utilisateur a accepté d'étendre, on met à jour la date de fin de la tâche */
    if (newTaskFin) {
      r.fin = new Date(newTaskFin);
    }
    if (typeof _updateSaveBtn === 'function') _updateSaveBtn();
    if (typeof setView === 'function' && typeof view !== 'undefined' && view !== 'jour') setView('jour');
    if (typeof _renderGanttKeepScroll === 'function') _renderGanttKeepScroll();
    else if (typeof renderGantt === 'function') renderGantt();
    renderAffectList(r);
    const msg = document.getElementById('affectLissageMsg');
    if (msg) {
      msg.textContent = newTaskFin
        ? `Tâche étendue au ${new Date(newTaskFin).toLocaleDateString('fr-FR')} — sauvegardez pour valider.`
        : 'Lissage proposé en bleu dans le Gantt. Sauvegardez pour valider.';
      msg.className = `affect-lissage-msg ${newTaskFin ? 'warn' : 'ok'}`;
      msg.style.display = 'block';
    }
  };

  if (remaining > 1e-9) {
    /* Chercher la date d'extension au-delà de la fin de tâche.
       On cherche les jours ouvrés non-évités les plus proches pouvant absorber le reste. */
    const cfg = _getLissageConfig();
    const pc = cfg.preferCharge || 0;
    const grain = cfg.strictMin ? cfg.minCharge : 0.0625;
    let extD = new Date(taskFin); extD.setHours(0,0,0,0);
    let extRem = remaining;
    const extDaily = { ...daily };
    /* Compteur sur les jours ouvrés uniquement (week-ends et fériés ne comptent pas) */
    let workDaysTried = 0;
    while (extRem > 1e-9 && workDaysTried < 365) {
      extD.setDate(extD.getDate() + 1);
      const dw = extD.getDay();
      if (dw === 0 || dw === 6) continue;
      if (typeof _isFerie === 'function' && _isFerie(extD)) continue;
      if (cfg.avoidDays.includes(dw)) continue;          /* respecter les jours évités */
      workDaysTried++;
      const avail = _availCapForDay(a.resourceId, extD, r.tache || '', r.externalTaskId || '');
      if (avail < (cfg.strictMin ? cfg.minCharge : 1e-9)) continue;
      const dk = _dayKeyLocal(extD);
      const maxSlot = Math.min(avail, extRem);
      const assign = (pc > 0 && maxSlot >= pc)
        ? (extRem >= pc ? pc : Math.floor(extRem / grain) * grain)
        : Math.floor(maxSlot / grain) * grain;
      const a2 = Math.round(assign * 10000) / 10000;
      const minA = cfg.strictMin ? cfg.minCharge : 1e-9;
      if (a2 >= minA) {
        extDaily[dk] = (extDaily[dk] || 0) + a2;
        extRem = Math.round((extRem - a2) * 10000) / 10000;
      }
    }

    const taskFinFmt = taskFin.toLocaleDateString('fr-FR');
    if (extRem > 1e-9) {
      /* Impossible de placer le reste même en étendant (ressource trop chargée ou contraintes) */
      const placed = Math.round((a.charge - remaining) * 1000) / 1000;
      const msg = document.getElementById('affectLissageMsg');
      if (msg) {
        msg.textContent = `Impossible de placer ${Math.round(remaining*1000)/1000}j — répartition partielle : ${placed}j.`;
        msg.className = 'affect-lissage-msg warn';
        msg.style.display = 'block';
      }
      applyEdits(daily, null);
    } else {
      const extFmt = extD.toLocaleDateString('fr-FR');
      const accept = confirm(
        `La charge (${a.charge}j) ne peut pas être entièrement répartie avant la fin de la tâche (${taskFinFmt}).\n` +
        `Reste à placer : ${Math.round(remaining * 1000) / 1000}j\n\n` +
        `OK → Étendre la date de fin de la tâche au ${extFmt}\n` +
        `Annuler → Répartition partielle (${Math.round((a.charge - remaining) * 1000) / 1000}j)`
      );
      applyEdits(accept ? extDaily : daily, accept ? extD : null);
    }
  } else {
    applyEdits(daily, null);
  }
}

/* ══════════════════════════════════════════════════════════
   CONFIG LISSAGE — Panneau de configuration par projet
   ══════════════════════════════════════════════════════════ */

function openLissageConfig() {
  const cfg = _getLissageConfig();
  const _v = (id, val) => { const el = document.getElementById(id); if (el) el.value   = val; };
  const _c = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
  _v('lcfgMinCharge',    cfg.minCharge);
  _c('lcfgStrictMin',    cfg.strictMin);
  _v('lcfgPreferCharge', cfg.preferCharge);
  _c('lcfgStrictPrefer', cfg.strictPrefer);
  _c('lcfgStrictAvoid',  cfg.strictAvoid);
  _c('lcfgUsePlanned',   cfg.usePlannedInLissage);
  document.querySelectorAll('.lcfg-day').forEach(cb => {
    cb.checked = cfg.avoidDays.includes(parseInt(cb.dataset.day));
  });
  const bd = document.getElementById('lissageCfgBackdrop');
  if (bd) bd.style.display = 'flex';
}

function closeLissageConfig() {
  const bd = document.getElementById('lissageCfgBackdrop');
  if (bd) bd.style.display = 'none';
}

function saveLissageConfig() {
  const _fv = id => parseFloat(document.getElementById(id)?.value);
  const _cb = id => document.getElementById(id)?.checked ?? false;
  const minRaw  = _fv('lcfgMinCharge');
  const prefRaw = _fv('lcfgPreferCharge');
  const minCharge    = isNaN(minRaw)  ? 0.125 : Math.max(0.0625, Math.min(1, minRaw));
  const preferCharge = isNaN(prefRaw) ? 0     : Math.max(0,       Math.min(1, prefRaw));
  /* Validation : charge mini doit être < charge maxi (si maxi activée) */
  if (preferCharge > 0 && minCharge >= preferCharge) {
    alert(`La charge journalière minimale (${minCharge}j) doit être inférieure à la charge journalière maximale (${preferCharge}j).`);
    return;
  }
  const avoidDays = [];
  document.querySelectorAll('.lcfg-day').forEach(cb => {
    if (cb.checked) avoidDays.push(parseInt(cb.dataset.day));
  });
  if (typeof portfolio === 'undefined' || typeof activeProjectId === 'undefined') return;
  const proj = portfolio.find(p => p.id === activeProjectId);
  if (!proj) return;
  proj.lissageConfig = {
    minCharge,    strictMin:          _cb('lcfgStrictMin'),
    preferCharge, strictPrefer:       _cb('lcfgStrictPrefer'),
    avoidDays,    strictAvoid:        _cb('lcfgStrictAvoid'),
    usePlannedInLissage: _cb('lcfgUsePlanned')
  };
  /* Sauvegarder la config.
     Si le projet est en édition (_tasksDirty), ne pas déclencher un write Firebase
     séparé pour éviter d'écraser les données en attente : le write Firebase sera
     inclus dans la sauvegarde du projet.
     Aussi mettre à jour le snapshot pour que le revert ne perde pas la config lissage. */
  const inEditMode = typeof _tasksDirty !== 'undefined' && _tasksDirty;
  if (inEditMode) {
    try { localStorage.setItem('gantt4cad_portfolio', JSON.stringify(_serializePortfolio(portfolio))); } catch(e) {}
    if (typeof _tasksSnapshot !== 'undefined' && _tasksSnapshot) {
      try {
        const snap = JSON.parse(_tasksSnapshot);
        const snapProj = snap.find(p => p.id === activeProjectId);
        if (snapProj) snapProj.lissageConfig = proj.lissageConfig;
        _tasksSnapshot = JSON.stringify(snap);
      } catch(e) {}
    }
  } else {
    if (typeof savePortfolio === 'function') savePortfolio();
  }
  closeLissageConfig();
}
