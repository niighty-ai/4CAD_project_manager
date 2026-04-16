/* ═══════════════════════════════════════════════════════════════
   ui-panel.js — Panneau d'édition tâche/jalon, niveaux hiérarchiques,
                 formulaire projet, backdrop
   Dépendances : ui.js, data.js (rows, sortRows, saveCurrentProject, etc.)
   ═══════════════════════════════════════════════════════════════ */

function _buildNiveauOptions(i, currentVal){
  const taskRows = rows.filter(r=>r._type==='tache');
  const projet = getEpProjet();
  const parentVals = [];
  for(let j=0;j<i;j++){
    const v = _getEpNiveauVal(j);
    parentVals.push(v);
  }
  const parentMatch = taskRows.filter(r=>{
    if(projet && r.projet !== projet) return false;
    for(let j=0;j<i;j++){
      if(parentVals[j] && (r.niveaux||[])[j] !== parentVals[j]) return false;
    }
    return true;
  });
  const existingGroupes = [...new Set(parentMatch
    .filter(r=>(r.niveaux||[]).length > i || (r.niveaux||[])[i])
    .map(r=>(r.niveaux||[])[i]||null).filter(Boolean))];
  const existingTaches = [...new Set(parentMatch
    .filter(r=>(r.niveaux||[]).length === i && r.tache)
    .map(r=>r.tache))];
  let opts = `<option value="">— aucun —</option>`;
  if(existingGroupes.length){
    opts += `<optgroup label="Groupes existants">
      ${existingGroupes.map(v=>`<option value="${escH(v)}"${v===currentVal?' selected':''}>${escH(v)}</option>`).join('')}
    </optgroup>`;
  }
  if(existingTaches.length){
    opts += `<optgroup label="Tâches (seront converties en groupe)">
      ${existingTaches.map(v=>`<option value="__TACHE__${escH(v)}"${('__TACHE__'+v)===currentVal?' selected':''}>${escH(v)} ↗</option>`).join('')}
    </optgroup>`;
  }
  if(currentVal && !existingGroupes.includes(currentVal) && !existingTaches.includes(currentVal) && !currentVal.startsWith('__TACHE__')){
    opts += `<option value="${escH(currentVal)}" selected>${escH(currentVal)}</option>`;
  }
  return opts;
}
function _getEpNiveauVal(i){
  const custom = document.getElementById(`epNiveauCustom_${i}`);
  const sel = document.getElementById(`epNiveau_${i}`);
  let v = (custom?.value||'').trim() || (sel?.value||'').trim();
  if(v.startsWith('__TACHE__')) v = v.slice(9);
  return v;
}
function renderEpNiveaux(niveaux, isGroupe){
  const container = document.getElementById('epNiveauxContainer');
  if(!container) return;
  let html = '';
  for(let i=0; i<MAX_NIVEAUX; i++){
    const val = (niveaux&&niveaux[i]) ? niveaux[i] : '';
    const label = i===0 ? 'Niveau 1 (groupe)' : `Niveau ${i+1} (sous-groupe)`;
    const isOpt = !isGroupe || i>0;
    const opts = _buildNiveauOptions(i, val);
    const hidden = (i > 0 && !val) ? ' style="display:none"' : '';
    html+=`<div class="ep-group ep-niveau-group" id="epNivGroup_${i}"${hidden}>
      <label class="ep-label" style="display:flex;align-items:center;justify-content:space-between">
        <span>${label}${isOpt?' <span style="font-weight:400;opacity:.6">(optionnel)</span>':''}</span>
        ${i>0?`<span style="font-size:10px;color:var(--muted);cursor:pointer;padding:2px 4px" onclick="clearEpNiveauFrom(${i})">✕ effacer</span>`:''}
      </label>
      <select class="ep-input" id="epNiveau_${i}" onchange="onEpNiveauChange(${i})" style="appearance:auto">
        ${opts}
      </select>
      <input class="ep-input" id="epNiveauCustom_${i}" type="text"
        placeholder="Ou saisir un nouveau nom…"
        value=""
        style="margin-top:4px;font-size:11px"
        oninput="onEpNiveauCustomChange(${i})">
    </div>`;
  }
  container.innerHTML = html;
  _updateNiveauxVisibility();
}
function _updateNiveauxVisibility(){
  for(let i=1;i<MAX_NIVEAUX;i++){
    const prevVal = _getEpNiveauVal(i-1);
    const group = document.getElementById(`epNivGroup_${i}`);
    if(!group) continue;
    if(prevVal){
      group.style.display = '';
    } else {
      group.style.display = 'none';
      /* Reset les niveaux cachés */
      const sel = document.getElementById(`epNiveau_${i}`);
      const custom = document.getElementById(`epNiveauCustom_${i}`);
      if(sel) sel.value = '';
      if(custom) custom.value = '';
    }
  }
}
function onEpNiveauCustomChange(idx){
  const sel = document.getElementById(`epNiveau_${idx}`);
  const custom = document.getElementById(`epNiveauCustom_${idx}`);
  if(custom && custom.value.trim()) sel.value = '';
  _refreshNiveauxFrom(idx+1);
  _updateNiveauxVisibility();
}
function onEpNiveauChange(idx){
  const custom = document.getElementById(`epNiveauCustom_${idx}`);
  if(custom) custom.value = '';
  _refreshNiveauxFrom(idx+1);
  _updateNiveauxVisibility();
}
function _refreshNiveauxFrom(fromIdx){
  for(let i=fromIdx;i<MAX_NIVEAUX;i++){
    const sel = document.getElementById(`epNiveau_${i}`);
    const custom = document.getElementById(`epNiveauCustom_${i}`);
    if(!sel) continue;
    sel.value = '';
    if(custom) custom.value = '';
    sel.innerHTML = _buildNiveauOptions(i, '');
  }
}
function clearEpNiveauFrom(idx){
  for(let i=idx;i<MAX_NIVEAUX;i++){
    const sel=document.getElementById(`epNiveau_${i}`);
    const custom=document.getElementById(`epNiveauCustom_${i}`);
    if(sel) sel.value='';
    if(custom) custom.value='';
  }
  _updateNiveauxVisibility();
}
function getEpNiveaux(){
  const niv=[];
  for(let i=0;i<MAX_NIVEAUX;i++){
    const v=_getEpNiveauVal(i);
    if(v) niv.push(v); else break;
  }
  return niv;
}
function _epNiveauIsTacheConversion(i){
  const sel=document.getElementById(`epNiveau_${i}`);
  return sel?.value?.startsWith('__TACHE__') || false;
}
function openAddAfter(refRowIdx, e){
  if(e) e.stopPropagation();
  const ref = rows[refRowIdx];
  openEditPanel(null);
  if(!ref){ return; }
  setTimeout(()=>{
    document.getElementById('epProjetCustom').style.display='none';
    setEpProjet(ref.projet||'');
    document.getElementById('epTache').value = '';
    document.getElementById('epDebut').value = '';
    document.getElementById('epFin').value = '';
    document.getElementById('epCharge').value = '';
    document.getElementById('epTitle').textContent = '+ Nouvelle tâche';
    if(ref._type === 'tache' && ref.tache){
      const parentNiveaux = ref.niveaux||[];
      if(parentNiveaux.length < MAX_NIVEAUX){
        window._promotedBackup = {original: ref};
        rows.splice(refRowIdx, 1);
        const newNiveaux = [...parentNiveaux, ref.tache];
        renderEpNiveaux(newNiveaux);
        sortRows(); renderAll();
      } else {
        renderEpNiveaux(ref.niveaux||[]);
      }
    } else {
      renderEpNiveaux(ref.niveaux||[]);
    }
    document.getElementById('epTache').focus();
  }, 30);
}
function openEditPanel(rowIdx){
  /* ── Refresh préventif + acquisition du verrou ──
     Si une version plus récente est disponible dans Firebase, on rafraîchit
     d'abord pour éviter d'écraser des données plus récentes.
     Le verrou est ensuite acquis avant l'ouverture du panel. */
  const _doWithLock = () => {
    if(typeof _acquireProjectLock==='function'){
      _acquireProjectLock(activeProjectId).then(granted=>{
        if(granted) _doOpenEditPanel(rowIdx);
      });
    } else {
      _doOpenEditPanel(rowIdx);
    }
  };

  if(typeof _pendingFirebaseUpdate!=='undefined' && _pendingFirebaseUpdate
     && typeof refreshActiveProjectFromFirebase==='function'){
    refreshActiveProjectFromFirebase(_doWithLock);
  } else {
    _doWithLock();
  }
}

function _doOpenEditPanel(rowIdx){
  epMode = rowIdx === null ? 'new' : 'edit';
  epEditingIdx = rowIdx;
  const panel = document.getElementById('editPanel');
  const title = document.getElementById('epTitle');
  const taskRows = rows.filter(r=>r._type==='tache');
  _epRefreshProjetSelect(taskRows);
  /* Reset visibility of all fields */
  document.getElementById('epNiveauxContainer').style.display='';
  document.getElementById('epTache').parentElement.style.display='';
  document.querySelectorAll('.ep-dates-row, .ep-charge-row').forEach(el=>el.style.display='');
  const datesRow = document.getElementById('epDebut').closest('.ep-group.ep-row') || document.getElementById('epDebut').parentElement.parentElement;
  const chargeRow = document.getElementById('epCharge').closest('.ep-group') || document.getElementById('epCharge').parentElement;
  if(epMode==='edit'){
    const r = rows[rowIdx];
    const isProjet = r._type==='projet';
    const isGroupe = r._type==='groupe';
    if(isProjet){
      /* ── Mode renommage de projet ── */
      title.textContent = '✏ Renommer le projet';
      setEpProjet(r.projet||'');
      document.getElementById('epProjetSelect').disabled = true;
      document.getElementById('epNiveauxContainer').style.display='none';
      document.getElementById('epTache').parentElement.style.display='';
      _epSetTacheRequired(true, false);
      document.getElementById('epTacheLabel').textContent = 'Nouveau nom du projet';
      document.getElementById('epTache').value = r.projet||'';
      document.getElementById('epTache').placeholder = 'Nom du projet';
      document.getElementById('epTache').dataset.isprojet = '1';
      datesRow.style.display='none';
      chargeRow.style.display='none';
      document.getElementById('epDeleteBtn').style.display='block';
    } else {
      document.getElementById('epProjetSelect').disabled = false;
      document.getElementById('epTache').dataset.isprojet = '0';
      title.textContent = isGroupe ? '✏ Modifier le groupe' : '✏ Modifier la tâche';
      setEpProjet(r.projet||'');
      const niveauxParent = isGroupe ? (r.niveaux||[]).slice(0,-1) : (r.niveaux||[]);
      renderEpNiveaux(niveauxParent, isGroupe);
      const nomGroupe = isGroupe ? ((r.niveaux||[]).slice(-1)[0]||'') : (r.tache||'');
      document.getElementById('epTache').value = nomGroupe;
      document.getElementById('epDebut').value = toInput(r.debut);
      document.getElementById('epFin').value = toInput(r.fin);
      document.getElementById('epCharge').value = r.charge!==null?r.charge:'';
      datesRow.style.display='';
      chargeRow.style.display='';
      document.getElementById('epDeleteBtn').style.display='block';
      _epSetTacheRequired(true, isGroupe);
    }
  } else {
    document.getElementById('epProjetSelect').disabled = false;
    document.getElementById('epTache').dataset.isprojet = '0';
    datesRow.style.display='';
    chargeRow.style.display='';
    title.textContent = '+ Nouvelle tâche';
    const last = taskRows[taskRows.length-1];
    const activeProj = portfolio.find(p=>p.id===activeProjectId);
    setEpProjet(last?last.projet:(activeProj?activeProj.name:''));
    renderEpNiveaux(last?(last.niveaux||[]):[], false);
    document.getElementById('epTache').value = '';
    if(!last){
      const _today = new Date(); _today.setHours(0,0,0,0);
      const _in2w = new Date(_today); _in2w.setDate(_in2w.getDate()+14);
      document.getElementById('epDebut').value = toInput(_today);
      document.getElementById('epFin').value = toInput(_in2w);
    } else {
      document.getElementById('epDebut').value = '';
      document.getElementById('epFin').value = '';
    }
    document.getElementById('epCharge').value = '';
    document.getElementById('epDeleteBtn').style.display='none';
    _epSetTacheRequired(true);
  }
  /* ── Task ID externe + badge de synchronisation ── */
  const _extIdGrp   = document.getElementById('epExternalIdGroup');
  const _extIdInput = document.getElementById('epExternalId');
  const _syncBadge  = document.getElementById('epSyncBadge');
  if (_extIdGrp && _extIdInput) {
    const extId = (epMode === 'edit') ? (rows[epEditingIdx]?.externalTaskId || null) : null;
    if (extId) {
      _extIdInput.value  = extId;
      _extIdGrp.style.display = '';
      if (_syncBadge) {
        const synced = typeof _isTaskSyncedWithGho === 'function' && _isTaskSyncedWithGho(extId);
        _syncBadge.style.display = synced ? 'inline-flex' : 'none';
      }
    } else {
      _extIdGrp.style.display = 'none';
      if (_syncBadge) _syncBadge.style.display = 'none';
    }
  }

  panel.classList.add('open');
  _showBackdrop();
  /* Réinitialise le timer d'inactivité à chaque interaction dans le panel */
  if(typeof _resetLockInactivityTimer==='function'){
    panel.addEventListener('input', _resetLockInactivityTimer, {once: false});
    panel.addEventListener('click', _resetLockInactivityTimer, {once: false});
  }
  setTimeout(()=>document.getElementById('epTache').focus(), 230);
}
function _epSetTacheRequired(required, isGroupe){
  const el = document.getElementById('epTache');
  const lbl = document.getElementById('epTacheLabel');
  if(el){
    el.placeholder = isGroupe ? 'Nom du groupe' : 'Description de la tâche';
    el.dataset.required = required ? '1' : '0';
    el.dataset.isgroupe = isGroupe ? '1' : '0';
  }
  if(lbl) lbl.textContent = isGroupe ? 'Nom du groupe' : 'Tâche';
}
function _epRefreshProjetSelect(taskRows){
  /* Le champ Projet est masqué — on garde juste la valeur du projet actif */
  const activeProj = portfolio.find(p=>p.id===activeProjectId);
  const projName = activeProj?.name || (rows.find(r=>r._type==='tache')?.projet) || '';
  const sel = document.getElementById('epProjetSelect');
  if(!sel) return;
  if(projName) sel.innerHTML = `<option value="${escH(projName)}">${escH(projName)}</option>`;
}
function getEpProjet(){
  /* Le projet est toujours celui actif dans la sidebar */
  const activeProj = portfolio.find(p=>p.id===activeProjectId);
  if(activeProj) return activeProj.name;
  /* Fallback : premier projet des tâches existantes */
  const firstTask = rows.find(r=>r._type==='tache');
  return firstTask?.projet || '';
}
function setEpProjet(val){
  const sel = document.getElementById('epProjetSelect');
  const custom = document.getElementById('epProjetCustom');
  if(!sel) return;
  const opt = [...sel.options].find(o=>o.value===val);
  if(opt){
    sel.value = val;
    if(custom) custom.style.display='none';
  } else if(val){
    sel.value = '__NEW__';
    if(custom){ custom.style.display='block'; custom.value=val; }
  } else {
    sel.selectedIndex = 0;
    if(custom) custom.style.display='none';
  }
}
function onEpProjetSelectChange(){ /* no-op — projet field is hidden */ }
function _jpRefreshProjetSelect(){
  const projets = [...new Set(rows.filter(r=>r._type==='tache').map(r=>r.projet))];
  const sel = document.getElementById('jpProjetSelect');
  if(!sel) return;
  sel.innerHTML = projets.map(p=>`<option value="${escH(p)}">${escH(p)}</option>`).join('')
    + `<option value="__NEW__">＋ Nouveau projet…</option>`;
}
function getJpProjet(){
  const sel = document.getElementById('jpProjetSelect');
  const custom = document.getElementById('jpProjetCustom');
  if(sel && sel.value === '__NEW__') return (custom?.value||'').trim();
  return (sel?.value||'').trim();
}
function setJpProjet(val){
  const sel = document.getElementById('jpProjetSelect');
  const custom = document.getElementById('jpProjetCustom');
  if(!sel) return;
  const opt = [...sel.options].find(o=>o.value===val);
  if(opt){
    sel.value = val;
    if(custom) custom.style.display='none';
  } else if(val){
    sel.value = '__NEW__';
    if(custom){ custom.style.display='block'; custom.value=val; }
  } else {
    sel.selectedIndex = 0;
    if(custom) custom.style.display='none';
  }
}
function onJpProjetSelectChange(){
  const sel = document.getElementById('jpProjetSelect');
  const custom = document.getElementById('jpProjetCustom');
  if(sel && sel.value==='__NEW__'){
    custom.style.display='block';
    custom.value='';
    custom.focus();
  } else {
    custom.style.display='none';
    custom.value='';
  }
}
function _showBackdrop(){ document.getElementById('panelBackdrop')?.classList.add('visible'); }
function _hideBackdrop(){ document.getElementById('panelBackdrop')?.classList.remove('visible'); }
/* Libère le verrou si aucune modification en attente */
function _releaseLockIfClean() {
  const hasEdits = typeof _ganttEdits !== 'undefined' && Object.keys(_ganttEdits).length > 0;
  if (!_tasksDirty && !hasEdits) {
    if (typeof _releaseProjectLock === 'function') _releaseProjectLock();
  }
}
/* Fermeture via annulation (croix, bouton Annuler, backdrop) */
function cancelEditPanel()  { closeEditPanel();  _releaseLockIfClean(); }
function cancelJalonPanel() { closeJalonPanel(); _releaseLockIfClean(); }
function cancelAffectPanel(){ closeAffectPanel(); _releaseLockIfClean(); }
function closeAllPanels(){ closeEditPanel(); closeJalonPanel(); closeAffectPanel(); _releaseLockIfClean(); }
function closeEditPanel(){
  document.getElementById('editPanel').classList.remove('open');
  _hideBackdrop();
  document.getElementById('epProjetSelect').disabled = false;
  const tacheEl = document.getElementById('epTache');
  if(tacheEl) tacheEl.dataset.isprojet = '0';
  epEditingIdx=null;
  if(window._promotedBackup){
    rows.push(window._promotedBackup.original);
    window._promotedBackup = null;
    sortRows(); renderAll();
  }
}
function saveEditPanel(){
  const p=getEpProjet();
  const niveaux=getEpNiveaux();
  const t=document.getElementById('epTache').value.trim();
  for(let i=0;i<MAX_NIVEAUX;i++){
    if(_epNiveauIsTacheConversion(i)){
      const nomTache=niveaux[i]; 
      const tacheIdx=rows.findIndex(r=>
        r._type==='tache' && r.projet===p &&
        (r.niveaux||[]).length===i && r.tache===nomTache
      );
      if(tacheIdx>=0){
        rows.splice(tacheIdx, 1);
        if(epEditingIdx !== null && tacheIdx < epEditingIdx) epEditingIdx--;
      }
    }
  }
  const d=document.getElementById('epDebut').value;
  const f=document.getElementById('epFin').value;
  const c=document.getElementById('epCharge').value;
  const tacheEl = document.getElementById('epTache');
  const tacheRequired = tacheEl?.dataset.required !== '0';
  const requiredFields = tacheRequired ? ['epTache','epDebut','epFin'] : ['epDebut','epFin'];
  let hasError = false;
  if(!p){
    const sel = document.getElementById('epProjetSelect');
    const custom = document.getElementById('epProjetCustom');
    const target = (sel && sel.value==='__NEW__') ? custom : sel;
    if(target){ target.style.borderColor='#e17055'; target.style.background='#e1705510'; target.addEventListener('input',()=>{target.style.borderColor='';target.style.background='';},{once:true}); target.addEventListener('change',()=>{target.style.borderColor='';target.style.background='';},{once:true}); }
    hasError = true;
  }
  requiredFields.forEach(id => {
    const el = document.getElementById(id);
    if(el && !el.value.trim()){
      el.style.borderColor = '#e17055';
      el.style.background  = '#e1705510';
      el.addEventListener('input', () => {
        el.style.borderColor = '';
        el.style.background  = '';
      }, {once: true});
      hasError = true;
    }
  });
  if(!p)            { (document.getElementById('epProjetSelect').value==='__NEW__'?document.getElementById('epProjetCustom'):document.getElementById('epProjetSelect')).focus(); }
  else if(!t && tacheRequired) { document.getElementById('epTache').focus(); }
  else if(!d)       { document.getElementById('epDebut').focus(); }
  else if(!f)       { document.getElementById('epFin').focus(); }
  if(hasError) return;
  const tacheEl2 = document.getElementById('epTache');
  const isProjetEdit = tacheEl2?.dataset.isprojet === '1';
  const isGroupeEdit = tacheEl2?.dataset.isgroupe === '1';
  let newRow;
  if(isProjetEdit){
    /* ── Renommage de projet ── */
    const nouveauNom = t;
    if(!nouveauNom){ document.getElementById('epTache').focus(); return; }
    const r = epEditingIdx !== null ? rows[epEditingIdx] : null;
    const oldName = r?.projet||'';
    if(nouveauNom !== oldName){
      /* Renommer dans toutes les tâches et jalons */
      rows = rows.map(row=>{
        if(row.projet === oldName) return {...row, projet: nouveauNom};
        return row;
      });
      /* Renommer dans projectColors */
      if(projectColors[oldName]){
        projectColors[nouveauNom] = projectColors[oldName];
        delete projectColors[oldName];
      }
    }
    sortRows(); renderAll(); saveCurrentProject();
    window._promotedBackup = null;
    document.getElementById('epProjetSelect').disabled = false;
    closeEditPanel();
    return;
  }
  if(isGroupeEdit){
    const nouveauNom = t;
    if(!nouveauNom){ document.getElementById('epTache').focus(); return; }
    const newNiveaux = [...niveaux, nouveauNom];
    const r = epEditingIdx !== null ? rows[epEditingIdx] : null;
    const oldNiveaux = r?.niveaux||[];
    rows = rows.map(row=>{
      if(row._type!=='tache' || row.projet!==p) return row;
      const rn = row.niveaux||[];
      if(rn.length>=oldNiveaux.length && oldNiveaux.every((n,i)=>rn[i]===n)){
        return {...row, niveaux:[...newNiveaux,...rn.slice(oldNiveaux.length)]};
      }
      return row;
    });
    sortRows(); renderAll(); saveCurrentProject();
    window._promotedBackup = null;
    closeEditPanel();
    return;
  } else {
    /* Préserve les champs de suivi (assignments, chargePassee, chargeRestante) si on édite */
    const _existingRow = (epMode==='edit' && epEditingIdx!==null) ? rows[epEditingIdx] : null;
    const _newCharge = c!==''?roundCharge(parseFloat(c.replace(',','.'))):null;
    const _assignments = _existingRow?.assignments || [];
    /* Si des assignments existent, la charge = leur somme (toujours) */
    const _chargeFromAssign = _assignments.length > 0
      ? Math.round(_assignments.reduce((s,a)=>s+(a.charge||0),0)*10000)/10000 || null
      : null;
    const _charge = _chargeFromAssign !== null ? _chargeFromAssign : _newCharge;
    const _chargePassee = _existingRow?.chargePassee ?? null;
    /* Restante = prévu - passé */
    const _chargeRestante = (_charge != null && _chargePassee != null)
      ? Math.round((_charge - _chargePassee) * 10000) / 10000
      : _charge;
    newRow={
      _type:'tache', projet:p, niveaux, tache:t||null,
      debut:parseDate(d), fin:parseDate(f),
      charge:         _charge,
      chargePassee:   _chargePassee,
      chargeRestante: _chargeRestante,
      assignments:    _assignments,
      _srcPid: activeProjectId,
      _source: 'planned'
    };
  }
  if(epMode==='edit'&&epEditingIdx!==null) rows[epEditingIdx]=newRow;
  else rows.push(newRow);
  window._promotedBackup = null; 
  closeEditPanel();
  sortRows();
  renderAll();
  saveCurrentProject();
}
function deleteFromPanel(){
  if(epEditingIdx===null)return;
  const r=rows[epEditingIdx];
  if(r._type==='projet'){
    if(!confirm(`Supprimer le projet "${r.projet}" et toutes ses tâches ?`))return;
    rows = rows.filter(row=>row.projet!==r.projet);
  } else {
    if(!confirm(`Supprimer "${r.tache||r.projet}" ?`))return;
    rows.splice(epEditingIdx,1);
    rows=rows.filter(r=>r._type==='tache');
  }
  sortRows();
  closeEditPanel();
  renderAll();
  saveCurrentProject();
}
function startRenameLhTitle(){
  if(!activeProjectId) return;
  const proj = portfolio.find(p=>p.id===activeProjectId);
  if(!proj || !proj._appCreated) return;
  const titleEl = document.querySelector('.lh-title-editable');
  if(!titleEl || titleEl.querySelector('.lh-title-input')) return;
  titleEl.style.visibility = 'hidden';
  const input = document.createElement('input');
  input.className = 'lh-title-input';
  input.value = proj.name;
  titleEl.parentNode.insertBefore(input, titleEl);
  input.focus(); input.select();
  const commit = ()=>{
    const val = input.value.trim() || proj.name;
    const oldName = proj.name;
    proj.name = val;
    if(val !== oldName){
      /* Mettre à jour r.projet dans proj.rows et jalons */
      (proj.rows||[]).forEach(r=>{ if(r.projet===oldName) r.projet=val; });
      (proj.jalons||[]).forEach(j=>{ if(j.projet===oldName) j.projet=val; });
      /* Mettre à jour les couleurs */
      if(projectColors[oldName]){ projectColors[val]=projectColors[oldName]; delete projectColors[oldName]; }
      if(proj.projectColors?.[oldName]){ proj.projectColors[val]=proj.projectColors[oldName]; delete proj.projectColors[oldName]; }
      /* Mettre à jour les rows en mémoire */
      rows = rows.map(r=>r.projet===oldName ? {...r, projet:val} : r);
      /* Mettre à jour les noms de projet dans ghoData des ressources */
      if(typeof resources!=='undefined'){
        resources.forEach(res=>{
          if(res.ghoData&&res.ghoData.projects){
            res.ghoData.projects.forEach(gp=>{ if(gp.name===oldName) gp.name=val; });
          }
        });
        if(typeof saveGhoData==='function') saveGhoData();
        if(typeof _refreshTbody==='function') _refreshTbody();
      }
    }
    savePortfolio();
    input.remove();
    titleEl.style.visibility = '';
    renderNavList();
    renderGantt();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', ev=>{
    ev.stopPropagation();
    if(ev.key==='Enter') input.blur();
    if(ev.key==='Escape'){ input.remove(); titleEl.style.visibility=''; }
  });
}
function deleteGanttTache(e, idx){
  e.stopPropagation();
  const realIdx = parseInt(idx);
  const r = rows[realIdx];
  if(!r || r._type !== 'tache') return;
  if(!confirm('Supprimer la tâche "' + (r.tache || r.projet) + '" ?')) return;
  rows.splice(realIdx, 1);
  rows = rows.filter(x => x._type === 'tache');
  sortRows(); renderAll(); saveCurrentProject();
}
function deleteGanttGroupe(e, projet, niveauxJson){
  e.stopPropagation();
  let niveaux;
  try { niveaux = JSON.parse(niveauxJson); } catch(ex){ niveaux=[niveauxJson]; }
  const nomGroupe = niveaux[niveaux.length-1] || 'groupe';
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif';
  modal.innerHTML = `
    <div style="background:var(--surface);border-top:4px solid #e17055;border-radius:8px;padding:24px 28px;max-width:420px;width:90%;box-shadow:0 12px 40px rgba(0,0,0,.35)">
      <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px">🗑 Supprimer "${escH(nomGroupe)}"</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:20px">Que voulez-vous faire avec les tâches enfants ?</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button id="dgBtnAll" style="text-align:left;padding:10px 14px;border:1px solid #e17055;border-radius:6px;background:#e1705510;color:var(--text);font-size:12px;font-weight:600;cursor:pointer">
          🗑 Supprimer le groupe <strong>et tous ses enfants</strong>
        </button>
        <button id="dgBtnUp" style="text-align:left;padding:10px 14px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--text);font-size:12px;font-weight:600;cursor:pointer">
          ↑ Supprimer le groupe et <strong>remonter les enfants</strong> d'un niveau
        </button>
        <button id="dgBtnCancel" style="padding:8px 14px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--muted);font-size:12px;cursor:pointer">
          Annuler
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  function isInGroup(r){
    if(r._type !== 'tache' || r.projet !== projet) return false;
    const rNiv = r.niveaux||[];
    if(rNiv.length < niveaux.length) return false;
    return niveaux.every((n,i) => rNiv[i] === n);
  }
  modal.querySelector('#dgBtnAll').onclick = () => {
    modal.remove();
    rows = rows.filter(r => !isInGroup(r));
    sortRows(); renderAll(); saveCurrentProject();
  };
  modal.querySelector('#dgBtnUp').onclick = () => {
    modal.remove();
    rows = rows.map(r => {
      if(!isInGroup(r)) return r;
      const rNiv = r.niveaux||[];
      const newNiv = [...niveaux.slice(0,-1), ...rNiv.slice(niveaux.length)];
      return {...r, niveaux: newNiv};
    });
    sortRows(); renderAll(); saveCurrentProject();
  };
  modal.querySelector('#dgBtnCancel').onclick = () => modal.remove();
  modal.onclick = ev => { if(ev.target===modal) modal.remove(); };
}
function deleteGanttProjet(e, projet){
  e.stopPropagation();
  if(!confirm('Supprimer le projet "' + projet + '" et toutes ses tâches ?')) return;
  rows = rows.filter(r => !(r._type === 'tache' && r.projet === projet));
  sortRows(); renderAll(); saveCurrentProject();
}
function openJalonPanel(idx){
  jpEditingIdx = (idx !== undefined && idx !== null) ? idx : null;
  const panel = document.getElementById('jalonPanel');
  const title = document.getElementById('jpTitle');
  const delBtn = document.getElementById('jpDeleteBtn');
  _jpRefreshProjetSelect();
  if(jpEditingIdx !== null){
    const r = rows[jpEditingIdx];
    title.textContent = '◆ Modifier le jalon';
    setJpProjet(r.projet||'');
    document.getElementById('jpNom').value = r.nom||'';
    document.getElementById('jpDate').value = toInput(r.date);
    delBtn.style.display = 'block';
  } else {
    title.textContent = '◆ Nouveau jalon';
    const lastProjet = rows.filter(r=>r._type==='projet')[0]?.projet||'';
    setJpProjet(lastProjet);
    document.getElementById('jpNom').value = '';
    document.getElementById('jpDate').value = '';
    delBtn.style.display = 'none';
  }
  document.getElementById('editPanel').classList.remove('open');
  panel.classList.add('open');
  _showBackdrop();
  setTimeout(()=>document.getElementById('jpNom').focus(), 230);
}
function closeJalonPanel(){
  document.getElementById('jalonPanel').classList.remove('open');
  _hideBackdrop();
  jpEditingIdx = null;
}
function saveJalonPanel(){
  const projet = getJpProjet();
  const nom = document.getElementById('jpNom').value.trim();
  const dateVal = document.getElementById('jpDate').value;
  let hasError = false;
  if(!projet){
    const sel = document.getElementById('jpProjetSelect');
    const custom = document.getElementById('jpProjetCustom');
    const target = (sel && sel.value==='__NEW__') ? custom : sel;
    if(target){ target.style.borderColor='#e17055'; target.style.background='#e1705510'; target.addEventListener('input',()=>{target.style.borderColor='';target.style.background='';},{once:true}); target.addEventListener('change',()=>{target.style.borderColor='';target.style.background='';},{once:true}); }
    hasError=true;
  }
  ['jpNom','jpDate'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el.value.trim()){
      el.style.borderColor='#e17055'; el.style.background='#e1705510';
      el.addEventListener('input',()=>{el.style.borderColor='';el.style.background='';},{once:true});
      hasError=true;
    }
  });
  if(hasError){
    if(!projet) (document.getElementById('jpProjetSelect').value==='__NEW__'?document.getElementById('jpProjetCustom'):document.getElementById('jpProjetSelect')).focus();
    else if(!nom) document.getElementById('jpNom').focus();
    else document.getElementById('jpDate').focus();
    return;
  }
  const jalon = {_type:'jalon', projet, nom, date: parseDate(dateVal), _srcPid:activeProjectId};
  if(jpEditingIdx !== null) rows[jpEditingIdx] = jalon;
  else rows.push(jalon);
  closeJalonPanel();
  sortRows(); renderAll(); saveCurrentProject();
}
function deleteJalon(){
  if(jpEditingIdx === null) return;
  if(!confirm(`Supprimer le jalon "${rows[jpEditingIdx]?.nom}" ?`)) return;
  rows.splice(jpEditingIdx, 1);
  closeJalonPanel();
  sortRows(); renderAll(); saveCurrentProject();
}
function deleteJalonDirect(idx){
  const r = rows[idx];
  if(!r || r._type !== 'jalon') return;
  if(!confirm(`Supprimer le jalon "${r.nom}" ?`)) return;
  rows.splice(idx, 1);
  sortRows(); renderAll(); saveCurrentProject();
}
function onEpDebutChange(){
  const debut = document.getElementById('epDebut');
  const fin   = document.getElementById('epFin');
  if(!debut.value) return;
  if(!fin.value || fin.value < debut.value){
    fin.value = debut.value;
  }
  fin.min = debut.value;
}
function onEpFinChange(){
  const debut = document.getElementById('epDebut');
  const fin   = document.getElementById('epFin');
  if(debut.value && fin.value && fin.value < debut.value){
    fin.value = debut.value;
  }
}
