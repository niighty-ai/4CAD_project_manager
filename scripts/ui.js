/* =========================================
   UI.JS — Gestion de l'interface utilisateur
   Panneaux, sidebar, color picker, navigation
   ========================================= */

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
document.getElementById('cpCustom').addEventListener('input',e=>{if(!cpTarget)return;projectColors[cpTarget]=e.target.value;document.getElementById('colorGrid').querySelectorAll('.color-opt').forEach(el=>el.classList.remove('selected'));renderAll();});
document.addEventListener('click',e=>{if(!document.getElementById('colorPopup').contains(e.target))document.getElementById('colorPopup').style.display='none';});
function showAddForm(){
  cancelInlineEdit();

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

function startRename(id, e){
  if(e) e.stopPropagation();
  const item = document.getElementById('navItem_'+id);
  if(!item) return;
  const nameEl = item.querySelector('.nav-item-name');
  const proj = portfolio.find(p=>p.id===id);
  if(!proj || !nameEl) return;
  if(item.querySelector('.nav-rename-input')) return;
  nameEl.style.visibility='hidden';
  const input = document.createElement('input');
  input.className='nav-rename-input';
  input.value = proj.name;
  nameEl.parentNode.insertBefore(input, nameEl);
  input.focus(); input.select();
  const commit = ()=>{
    const val = input.value.trim() || proj.name;
    proj.name = val;
    savePortfolio();
    input.remove();
    nameEl.style.visibility='';
    renderNavList();
    if(activeProjectId===id) renderGantt();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', ev=>{ ev.stopPropagation(); if(ev.key==='Enter') input.blur(); if(ev.key==='Escape'){input.remove();nameEl.style.visibility='';} });
}

function renderNavList(){
  const list = document.getElementById('navList');
  if(!list) return;
  if(portfolio.length===0){
    list.innerHTML='<div class="nav-empty">Aucun projet.<br>Créez-en un pour commencer.</div>';
    return;
  }
  const clients = [...new Set(portfolio.map(p=>p.client||''))].sort();
  let html = '';
  clients.forEach(clientName=>{
    const projs = portfolio.filter(p=>(p.client||'')===clientName);
    const clientKey = 'client_' + clientName;
    const isOpen = !navCollapsed[clientKey];
    if(clientName){
      html += `<div class="nav-client">
        <div class="nav-client-header" onclick="toggleNavClient('${escH(clientName)}')">
          <span class="nav-client-chevron${isOpen?' open':''}">&#9658;</span>
          <span class="nav-client-name" title="${escH(clientName)}">${escH(clientName)}</span>
          <div class="nav-client-actions">
            <button class="nav-action-btn" onclick="renameClient('${escH(clientName)}',event)" title="Renommer le client">&#9998;</button>
            <button class="nav-action-btn" onclick="addProjectToClient('${escH(clientName)}',event)" title="Nouveau projet">+</button>
          </div>
        </div>
        <div class="nav-client-children${isOpen?'':' collapsed'}">`;
    }
    projs.forEach((p,i)=>{
      const isActive = p.id===activeProjectId;
      const taskCount = p.rows.filter(r=>r._type==='tache').length;
      const dot = navColor(portfolio.indexOf(p));
      html += `<div class="nav-item${isActive?' active':''}" id="navItem_${p.id}" onclick="switchToProject('${p.id}')">
        <div class="nav-item-dot" style="background:${dot};border-color:${dot}40"></div>
        <div style="flex:1;min-width:0;overflow:hidden">
          <div class="nav-item-name" title="${escH(p.name)}">${escH(p.name)}</div>
          <div class="nav-item-meta">${taskCount} tâche${taskCount!==1?'s':''}</div>
        </div>
        <div class="nav-item-actions">
          <button class="nav-action-btn" onclick="startRename('${p.id}',event)" title="Renommer">&#9998;</button>
          <button class="nav-action-btn" onclick="duplicateProject('${p.id}',event)" title="Dupliquer">&#10063;</button>
          <button class="nav-action-btn danger" onclick="deleteProject('${p.id}',event)" title="Supprimer">&#128465;</button>
        </div>
      </div>`;
    });
    if(clientName){
      html += `</div></div>`;
    }
  });
  list.innerHTML = html;
}

function toggleNavClient(clientName){
  const key = 'client_' + clientName;
  navCollapsed[key] = !navCollapsed[key];
  renderNavList();
}
function renameClient(oldName, e){
  e.stopPropagation();
  const newName = prompt('Renommer le client :', oldName);
  if(!newName || newName.trim()===oldName) return;
  portfolio.forEach(p=>{ if((p.client||'')===oldName) p.client = newName.trim(); });
  savePortfolio();
  renderNavList();
}
function addProjectToClient(clientName, e){
  e.stopPropagation();
  createNewProject('Nouveau projet', [], {}, clientName);
}
function toggleNav(){
  navOpen = !navOpen;
  const sidebar = document.getElementById('navSidebar');
  const toggle = document.getElementById('navToggle');
  sidebar.classList.toggle('collapsed', !navOpen);
  toggle.innerHTML = navOpen ? '&#8249;' : '&#8250;';
  toggle.title = navOpen ? 'Réduire' : 'Développer';
}
// (saveCurrentProject, importToNewProject → data.js)
// (epEditingIdx, epMode → utils.js)
// (init portfolio → app.js)

function _buildNiveauOptions(i, currentVal){
  const taskRows = rows.filter(r=>r._type==='tache');
  const projet = document.getElementById('epProjet')?.value.trim() || '';
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
    const label = i===0 ? 'Niveau 1' : `Niveau ${i+1}`;
    const isOpt = !isGroupe || i>0;
    const opts = _buildNiveauOptions(i, val);
    html+=`<div class="ep-group" id="epNivGroup_${i}">
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
}
function onEpNiveauCustomChange(idx){
  const sel = document.getElementById(`epNiveau_${idx}`);
  const custom = document.getElementById(`epNiveauCustom_${idx}`);
  if(custom && custom.value.trim()) sel.value = '';
  _refreshNiveauxFrom(idx+1);
}
function onEpNiveauChange(idx){
  const custom = document.getElementById(`epNiveauCustom_${idx}`);
  if(custom) custom.value = '';
  _refreshNiveauxFrom(idx+1);
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

function openAddAfter(refRowIdx, e){
  if(e) e.stopPropagation();
  const ref = rows[refRowIdx];
  openEditPanel(null);
  if(!ref){ return; }
  setTimeout(()=>{
    document.getElementById('epProjet').value = ref.projet||'';
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
  epMode = rowIdx === null ? 'new' : 'edit';
  epEditingIdx = rowIdx;
  const panel = document.getElementById('editPanel');
  const title = document.getElementById('epTitle');
  const taskRows = rows.filter(r=>r._type==='tache');
  _epRefreshProjetSelect(taskRows);
  if(epMode==='edit'){
    const r = rows[rowIdx];
    const isGroupe = r._type==='groupe';
    title.textContent = isGroupe ? '✏ Modifier le groupe' : '✏ Modifier la tâche';
    document.getElementById('epProjet').value = r.projet||'';
    const niveauxParent = isGroupe ? (r.niveaux||[]).slice(0,-1) : (r.niveaux||[]);
    renderEpNiveaux(niveauxParent, isGroupe);
    const nomGroupe = isGroupe ? ((r.niveaux||[]).slice(-1)[0]||'') : (r.tache||'');
    document.getElementById('epTache').value = nomGroupe;
    document.getElementById('epDebut').value = toInput(r.debut);
    document.getElementById('epFin').value = toInput(r.fin);
    document.getElementById('epCharge').value = r.charge!==null?r.charge:'';
    document.getElementById('epDeleteBtn').style.display='block';
    _epSetTacheRequired(true, isGroupe);
  } else {
    title.textContent = '+ Nouvelle tâche';
    const last = taskRows[taskRows.length-1];
    document.getElementById('epProjet').value = last?last.projet:'';
    renderEpNiveaux(last?(last.niveaux||[]):[], false);
    document.getElementById('epTache').value = '';
    document.getElementById('epDebut').value = '';
    document.getElementById('epFin').value = '';
    document.getElementById('epCharge').value = '';
    document.getElementById('epDeleteBtn').style.display='none';
    _epSetTacheRequired(true);
  }
  panel.classList.add('open');
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
  const projets = [...new Set((taskRows||rows.filter(r=>r._type==='tache')).map(r=>r.projet))];
  document.getElementById('epProjetList').innerHTML = projets.map(p=>`<option value="${escH(p)}">`).join('');
}

function closeEditPanel(){
  document.getElementById('editPanel').classList.remove('open');
  epEditingIdx=null;
  if(window._promotedBackup){
    rows.push(window._promotedBackup.original);
    window._promotedBackup = null;
    sortRows(); renderAll();
  }
}
function saveEditPanel(){
  const p=document.getElementById('epProjet').value.trim();
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
  const requiredFields = tacheRequired ? ['epProjet','epTache','epDebut','epFin'] : ['epProjet','epDebut','epFin'];
  let hasError = false;
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
  if(!p)            { document.getElementById('epProjet').focus(); }
  else if(!t && tacheRequired) { document.getElementById('epTache').focus(); }
  else if(!d)       { document.getElementById('epDebut').focus(); }
  else if(!f)       { document.getElementById('epFin').focus(); }
  if(hasError) return;
  const tacheEl2 = document.getElementById('epTache');
  const isGroupeEdit = tacheEl2?.dataset.isgroupe === '1';
  let newRow;
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
    newRow={_type:'tache',projet:p,niveaux,tache:t||null,debut:parseDate(d),fin:parseDate(f),charge:c!==''?parseFloat(c.replace(',','.')):null};
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
  if(!confirm(`Supprimer "${r.tache||r.projet}" ?`))return;
  rows.splice(epEditingIdx,1);
  rows=rows.filter(r=>r._type==='tache');
  sortRows();
  closeEditPanel();
  renderAll();
  saveCurrentProject();
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeEditPanel();

function startRenameLhTitle(){
  if(!activeProjectId) return;
  const proj = portfolio.find(p=>p.id===activeProjectId);
  if(!proj) return;
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
    proj.name = val;
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
function exportHTML(){
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

function openJalonPanel(idx){
  jpEditingIdx = (idx !== undefined && idx !== null) ? idx : null;
  const panel = document.getElementById('jalonPanel');
  const title = document.getElementById('jpTitle');
  const delBtn = document.getElementById('jpDeleteBtn');
  const projets = [...new Set(rows.filter(r=>r._type==='tache').map(r=>r.projet))];
  document.getElementById('jpProjetList').innerHTML = projets.map(p=>`<option value="${escH(p)}">`).join('');
  if(jpEditingIdx !== null){
    const r = rows[jpEditingIdx];
    title.textContent = '◆ Modifier le jalon';
    document.getElementById('jpProjet').value = r.projet||'';
    document.getElementById('jpNom').value = r.nom||'';
    document.getElementById('jpDate').value = toInput(r.date);
    delBtn.style.display = 'block';
  } else {
    title.textContent = '◆ Nouveau jalon';
    const lastProjet = rows.filter(r=>r._type==='projet')[0]?.projet||'';
    document.getElementById('jpProjet').value = lastProjet;
    document.getElementById('jpNom').value = '';
    document.getElementById('jpDate').value = '';
    delBtn.style.display = 'none';
  }
  document.getElementById('editPanel').classList.remove('open');
  panel.classList.add('open');
  setTimeout(()=>document.getElementById('jpNom').focus(), 230);
}
function closeJalonPanel(){
  document.getElementById('jalonPanel').classList.remove('open');
  jpEditingIdx = null;
}
function saveJalonPanel(){
  const projet = document.getElementById('jpProjet').value.trim();
  const nom = document.getElementById('jpNom').value.trim();
  const dateVal = document.getElementById('jpDate').value;
  let hasError = false;
  ['jpProjet','jpNom','jpDate'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el.value.trim()){
      el.style.borderColor='#e17055'; el.style.background='#e1705510';
      el.addEventListener('input',()=>{el.style.borderColor='';el.style.background='';},{once:true});
      hasError=true;
    }
  });
  if(hasError){
    if(!projet) document.getElementById('jpProjet').focus();
    else if(!nom) document.getElementById('jpNom').focus();
    else document.getElementById('jpDate').focus();
    return;
  }
  const jalon = {_type:'jalon', projet, nom, date: parseDate(dateVal)};
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
document.addEventListener('keydown', e=>{

// ── Raccourcis clavier pour les panneaux ──
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeEditPanel();
    closeJalonPanel();
  }
});

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
