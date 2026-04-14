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
    const oldName = proj.name;
    proj.name = val;
    /* Mettre à jour r.projet dans proj.rows (données sauvegardées) */
    if(val !== oldName){
      (proj.rows||[]).forEach(r=>{ if(r.projet===oldName) r.projet=val; });
      (proj.jalons||[]).forEach(j=>{ if(j.projet===oldName) j.projet=val; });
      /* Mettre à jour les couleurs */
      if(projectColors[oldName]){ projectColors[val]=projectColors[oldName]; delete projectColors[oldName]; }
      if(proj.projectColors?.[oldName]){ proj.projectColors[val]=proj.projectColors[oldName]; delete proj.projectColors[oldName]; }
      /* Mettre à jour les rows en mémoire si ce projet est actif */
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

  /* ── Filtrer les clients par portefeuille utilisateur ── */
  const allPortfolioClients = [...new Set(portfolio.map(p=>p.client||'').filter(Boolean))].sort();
  const clients = allPortfolioClients.filter(c => userWalletClients.has(c));

  if(clients.length === 0){
    list.innerHTML = '<div class="nav-empty">Portefeuille vide.<br>Recherchez un client ci-dessus.</div>';
    return;
  }

  let html = '';
  clients.forEach(clientName=>{
    const clientProjs = portfolio.filter(p=>(p.client||'')===clientName);
    const clientKey = 'client_' + clientName;
    const isOpen = !navCollapsed[clientKey];
    const allChecked = clientProjs.every(p=>selectedProjectIds.has(p.id));
    const someChecked = clientProjs.some(p=>selectedProjectIds.has(p.id));

    html += `<div class="nav-client" data-client="${escH(clientName)}">
      <div class="nav-client-header" onclick="toggleNavClient('${escH(clientName)}')">
        <span class="nav-client-chevron${isOpen?' open':''}">&#9658;</span>
        <span class="nav-client-name" title="${escH(clientName)}">${escH(clientName)}</span>
        <div class="nav-client-actions">
          <button class="nav-action-btn nav-multiview-btn${allChecked?' active':someChecked?' partial':''}" onclick="selectAllClientProjects('${escH(clientName)}',event)" title="${allChecked?'Décocher tous les projets':'Afficher tous les projets'}">
            ${allChecked?'◉':'◎'}
          </button>
          <button class="nav-action-btn" onclick="renameClient('${escH(clientName)}',event)" title="Renommer le client">&#9998;</button>
          <button class="nav-action-btn" onclick="createFolder('${escH(clientName)}',event)" title="Nouveau dossier">&#128193;</button>
          <button class="nav-action-btn" onclick="addProjectToClient('${escH(clientName)}',event)" title="Nouveau projet">+</button>
          <span class="nav-client-action-sep"></span>
          <button class="nav-action-btn nav-wallet-remove" onclick="removeClientFromWallet('${escH(clientName)}',event)" title="Retirer du portefeuille">&#8854;</button>
          <button class="nav-action-btn danger nav-wallet-delete" onclick="deleteClientFromDB('${escH(clientName)}',event)" title="Supprimer définitivement">&#128465;</button>
        </div>
      </div>
      <div class="nav-client-children${isOpen?'':' collapsed'}">`;

    /* ── Récupère tous les dossiers connus pour ce client ── */
    const folderNames = _getClientFolders(clientName);

    /* ── Projets sans dossier (à la racine du client) ── */
    const rootProjs = clientProjs.filter(p=>!(p.folder||''));
    rootProjs.forEach(p=>{ html += _renderNavProject(p); });

    /* ── Projets dans des dossiers ── */
    folderNames.forEach(folderName=>{
      const folderProjs = clientProjs.filter(p=>(p.folder||'')===folderName);
      const folderKey = 'folder_' + clientName + '_' + folderName;
      const isFolderOpen = !navCollapsed[folderKey];
      html += `<div class="nav-folder" data-client="${escH(clientName)}" data-folder="${escH(folderName)}"
          ondragover="navDragOver(event,'${escH(clientName)}','${escH(folderName)}')"
          ondragleave="navDragLeave(event)"
          ondrop="navDrop(event,'${escH(clientName)}','${escH(folderName)}')">
        <div class="nav-folder-header" onclick="toggleNavFolder('${escH(clientName)}','${escH(folderName)}')">
          <span class="nav-folder-chevron${isFolderOpen?' open':''}">&#9658;</span>
          <span class="nav-folder-icon">${isFolderOpen?'📂':'📁'}</span>
          <span class="nav-folder-name" title="${escH(folderName)}">${escH(folderName)}</span>
          <div class="nav-folder-actions">
            <button class="nav-action-btn" onclick="renameFolder('${escH(clientName)}','${escH(folderName)}',event)" title="Renommer le dossier">&#9998;</button>
            <button class="nav-action-btn" onclick="addProjectToFolder('${escH(clientName)}','${escH(folderName)}',event)" title="Nouveau projet dans ce dossier">+</button>
            <button class="nav-action-btn danger" onclick="deleteFolder('${escH(clientName)}','${escH(folderName)}',event)" title="Supprimer le dossier">&#128465;</button>
          </div>
        </div>
        <div class="nav-folder-children${isFolderOpen?'':' collapsed'}">`;
      folderProjs.forEach(p=>{ html += _renderNavProject(p); });
      html += `</div></div>`;
    });

    /* Drop zone racine du client */
    html += `<div class="nav-client-dropzone" data-client="${escH(clientName)}" data-folder=""
      ondragover="navDragOver(event,'${escH(clientName)}','')"
      ondragleave="navDragLeave(event)"
      ondrop="navDrop(event,'${escH(clientName)}','')"></div>`;
    html += `</div></div>`;
  });
  list.innerHTML = html;
  _initNavDrag();
}

/* ── Recherche rapide (dropdown sous la barre) ── */
function searchClients(query) {
  const results = document.getElementById('walletSearchResults');
  if (!results) return;
  const q = normalizeStr(query);
  if (!q) { results.style.display = 'none'; return; }
  const allClients = [...new Set(portfolio.map(p => p.client||'').filter(Boolean))].sort();
  const filtered = allClients.filter(c => normalizeStr(c).includes(q) && !userWalletClients.has(c));
  if (!filtered.length) {
    results.innerHTML = '<div class="nav-search-empty">Aucun client trouvé</div>';
  } else {
    results.innerHTML = filtered.map(c =>
      `<div class="nav-search-item" onclick="addClientToWallet('${escH(c)}')">${escH(c)}</div>`
    ).join('');
  }
  results.style.display = 'block';
}

/* ══════════════════════════════════════════════
   MODAL — Parcourir tous les clients
   ══════════════════════════════════════════════ */

function openClientModal() {
  const modal = document.getElementById('clientBrowserModal');
  if (!modal) return;
  filterClientModal('');
  modal.style.display = 'flex';
  const si = document.getElementById('cbSearch');
  if (si) { si.value = ''; setTimeout(() => si.focus(), 60); }
}

function closeClientModal(e) {
  /* Depuis le backdrop : fermer seulement si clic direct sur le backdrop */
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById('clientBrowserModal');
  if (modal) modal.style.display = 'none';
}

function filterClientModal(query) {
  const list = document.getElementById('cbList');
  if (!list) return;
  const q = normalizeStr(query);
  const allClients = [...new Set(portfolio.map(p => p.client||'').filter(Boolean))].sort();
  const filtered = q ? allClients.filter(c => normalizeStr(c).includes(q)) : allClients;

  if (!filtered.length) {
    list.innerHTML = '<div class="cb-empty">Aucun client dans la base de données.</div>';
    return;
  }
  list.innerHTML = filtered.map(c => {
    const inWallet = userWalletClients.has(c);
    const count = portfolio.filter(p => (p.client||'') === c).length;
    return `<div class="cb-item${inWallet ? ' cb-item-in' : ''}" ${inWallet ? '' : `onclick="addClientToWalletModal('${escH(c)}')"`}>
      <div class="cb-item-info">
        <span class="cb-item-name">${escH(c)}</span>
        <span class="cb-item-count">${count}&nbsp;projet${count !== 1 ? 's' : ''}</span>
      </div>
      ${inWallet
        ? '<span class="cb-item-badge">&#10003; Chargé</span>'
        : '<button class="cb-item-add">+ Charger</button>'}
    </div>`;
  }).join('');
}

function addClientToWalletModal(clientName) {
  if (!clientName || userWalletClients.has(clientName)) return;
  userWalletClients.add(clientName);
  saveUserWallet();
  renderNavList();
  /* Rafraîchit la liste modale pour afficher "Chargé" */
  filterClientModal(document.getElementById('cbSearch')?.value || '');
}

/* ── Rendu d'un item projet dans la nav ── */
function _renderNavProject(p){
  const isActive   = p.id===activeProjectId;
  const isChecked  = selectedProjectIds.has(p.id);
  const taskCount  = (p.rows||[]).filter(r=>r._type==='tache').length;
  /* Projet "planifié" = créé dans l'appli OU contient au moins une tâche avec écart (_source:'planned') */
  const hasPlanned = p._appCreated || (p.rows||[]).some(r=>r._source==='planned');
  const hasFirm    = typeof portfolioFirm !== 'undefined' && portfolioFirm.some(f=>f.id===p.id);
  return `<div class="nav-item${isActive?' active':''}${isChecked?' checked':''}${hasPlanned?' nav-item-planned':''}" id="navItem_${p.id}"
      draggable="true"
      ondragstart="navDragStart(event,'${p.id}')"
      ondragend="navDragEnd(event)"
      onclick="switchToProject('${p.id}')">
    <input type="checkbox" class="nav-item-check" ${isChecked?'checked':''} onclick="toggleProjectSelection('${p.id}',event)" title="Inclure dans la vue">
    <div style="flex:1;min-width:0;overflow:hidden">
      <div class="nav-item-name" title="${escH(p.name)}">${escH(p.name)}</div>
      <div class="nav-item-meta">${taskCount} tâche${taskCount!==1?'s':''}</div>
    </div>
    <div class="nav-item-actions">
      <button class="nav-action-btn" onclick="startRename('${p.id}',event)" title="Renommer">&#9998;</button>
      <button class="nav-action-btn" onclick="duplicateProject('${p.id}',event)" title="Dupliquer">&#10063;</button>
      ${hasFirm?`<button class="nav-action-btn" onclick="resetProjectToFirm('${p.id}',event)" title="Réinitialiser à la base ferme">&#8635;</button>`:''}
      <button class="nav-action-btn danger" onclick="deleteProject('${p.id}',event)" title="Supprimer">&#128465;</button>
    </div>
  </div>`;
}

/* ── Retourne les dossiers connus pour un client
   (union de navFolders + dossiers existant dans portfolio) ── */
function _getClientFolders(clientName){
  const fromPortfolio = portfolio
    .filter(p=>(p.client||'')===clientName && (p.folder||''))
    .map(p=>p.folder);
  const fromNav = navFolders[clientName] ? [...navFolders[clientName]] : [];
  return [...new Set([...fromPortfolio, ...fromNav])].sort();
}

/* ── Drag-and-drop nav ── */
let _navDragId = null;

function _initNavDrag(){
  /* rien — les handlers sont inline dans le HTML */
}
function navDragStart(e, projId){
  _navDragId = projId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', projId);
  setTimeout(()=>{
    const el = document.getElementById('navItem_'+projId);
    if(el) el.classList.add('nav-item-dragging');
  }, 0);
}
function navDragEnd(e){
  _navDragId = null;
  document.querySelectorAll('.nav-item-dragging').forEach(el=>el.classList.remove('nav-item-dragging'));
  document.querySelectorAll('.nav-drop-over').forEach(el=>el.classList.remove('nav-drop-over'));
}
function navDragOver(e, clientName, folderName){
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  /* Highlight drop target */
  const target = e.currentTarget;
  document.querySelectorAll('.nav-drop-over').forEach(el=>{ if(el!==target) el.classList.remove('nav-drop-over'); });
  target.classList.add('nav-drop-over');
}
function navDragLeave(e){
  /* Ne retire le highlight que si on quitte vraiment le conteneur */
  const related = e.relatedTarget;
  const current = e.currentTarget;
  if(!current.contains(related)){
    current.classList.remove('nav-drop-over');
  }
}
function navDrop(e, clientName, folderName){
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('nav-drop-over');
  const projId = e.dataTransfer.getData('text/plain') || _navDragId;
  if(!projId) return;
  const proj = portfolio.find(p=>p.id===projId);
  if(!proj) return;
  /* Vérifier contrainte client */
  if((proj.client||'') !== clientName){
    const msg = document.createElement('div');
    msg.style.cssText='position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#c0392b;color:#fff;padding:8px 18px;border-radius:6px;font-size:12px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none';
    msg.textContent = 'Impossible de déplacer un projet vers un autre client';
    document.body.appendChild(msg);
    setTimeout(()=>msg.remove(), 2800);
    return;
  }
  moveProjectToFolder(projId, clientName, folderName);
}

function toggleNavClient(clientName){
  const key = 'client_' + clientName;
  navCollapsed[key] = !navCollapsed[key];
  renderNavList();
}
function toggleNavFolder(clientName, folderName){
  const key = 'folder_' + clientName + '_' + folderName;
  navCollapsed[key] = !navCollapsed[key];
  renderNavList();
}
function renameClient(oldName, e){
  e.stopPropagation();
  const newName = prompt('Renommer le client :', oldName);
  if(!newName || newName.trim()===oldName) return;
  const trimmed = newName.trim();
  portfolio.forEach(p=>{ if((p.client||'')===oldName) p.client = trimmed; });
  /* Migrer navFolders */
  if(navFolders[oldName]){
    navFolders[trimmed] = navFolders[oldName];
    delete navFolders[oldName];
  }
  /* Migrer le portefeuille utilisateur */
  if(userWalletClients.has(oldName)){
    userWalletClients.delete(oldName);
    userWalletClients.add(trimmed);
    saveUserWallet();
  }
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
  /* La rotation de l'icône est gérée par CSS via .nav-sidebar.collapsed .nav-toggle svg */
  toggle.title = navOpen ? 'Réduire' : 'Développer';
}
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
function closeAllPanels(){ closeEditPanel(); closeJalonPanel(); closeAffectPanel(); }
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
    r.assignments.push({ resourceId: '', resourceNom: '', charge: null, chargePassee: null, chargeRestante: null });
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
          <input type="number" class="affect-ch-input" step="0.125" min="0"
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
  if (field === 'charge') _proposeLissageForAssignment(idx);
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
  sortRows();
  saveCurrentProject();
  renderAffectList(r);
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
    usePlannedInLissage: cfg.usePlannedInLissage !== undefined ? cfg.usePlannedInLissage : false
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

  /* preferCharge : vérifier si faisable en tranches de pc */
  const prefSlots = allSlots.filter(s => s.avail >= pc);
  const prefCap   = pc > 0 ? prefSlots.length * pc : 0;
  const usePref   = pc > 0 && prefCap >= charge;

  const result = {};
  let rem = charge;

  for (const list of [preferred, avoided]) {
    for (const s of list) {
      if (rem <= 1e-9) break;

      /* strictPrefer : n'utiliser ce slot que s'il peut absorber exactement pc */
      if (cfg.strictPrefer && pc > 0 && s.avail < pc) continue;

      const maxSlot = Math.min(s.avail, rem);
      const floorMin = (v) => Math.floor(v / cfg.minCharge) * cfg.minCharge;
      let assign;
      if (usePref && s.avail >= pc) {
        assign = rem >= pc ? pc : floorMin(rem);
      } else if (!cfg.strictPrefer) {
        assign = floorMin(maxSlot);
      } else {
        continue; // strict prefer mais slot insuffisant → déjà géré par le continue ci-dessus
      }
      assign = Math.round(assign * 10000) / 10000;
      const minThresh = cfg.strictMin ? cfg.minCharge : 1e-9;
      if (assign >= minThresh) {
        result[s.dk] = (result[s.dk] || 0) + assign;
        rem = Math.round((rem - assign) * 10000) / 10000;
      }
    }
    if (rem <= 1e-9) break;
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
    /* Chercher la date d'extension au-delà de la fin de tâche */
    const cfg = _getLissageConfig();
    const pc = cfg.preferCharge || 0;
    let extD = new Date(taskFin); extD.setHours(0,0,0,0);
    let extRem = remaining;
    const extDaily = { ...daily };
    let iters = 0;
    while (extRem > 1e-9 && iters++ < 730) {
      extD.setDate(extD.getDate() + 1);
      const dw = extD.getDay();
      if (dw === 0 || dw === 6) continue;
      if (typeof _isFerie === 'function' && _isFerie(extD)) continue;
      const avail = _availCapForDay(a.resourceId, extD, r.tache || '', r.externalTaskId || '');
      if (avail < cfg.minCharge) continue;
      const dk = _dayKeyLocal(extD);
      const maxSlot = Math.min(avail, extRem);
      const assign = (pc > 0 && maxSlot >= pc)
        ? (extRem >= pc ? pc : Math.floor(extRem / cfg.minCharge) * cfg.minCharge)
        : Math.floor(maxSlot / cfg.minCharge) * cfg.minCharge;
      const a2 = Math.round(assign * 10000) / 10000;
      if (a2 >= cfg.minCharge) {
        extDaily[dk] = (extDaily[dk] || 0) + a2;
        extRem = Math.round((extRem - a2) * 10000) / 10000;
      }
    }

    const taskFinFmt = taskFin.toLocaleDateString('fr-FR');
    const extFmt = extD.toLocaleDateString('fr-FR');
    const accept = confirm(
      `La charge (${a.charge}j) ne peut pas être entièrement répartie avant la fin de la tâche (${taskFinFmt}).\n` +
      `Reste à placer : ${Math.round(remaining * 1000) / 1000}j\n\n` +
      `OK → Étendre la date de fin de la tâche au ${extFmt}\n` +
      `Annuler → Répartition partielle (${Math.round((a.charge - remaining) * 1000) / 1000}j)`
    );
    applyEdits(
      accept && extRem < 1e-9 ? extDaily : daily,
      accept && extRem < 1e-9 ? extD : null
    );
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
  if (typeof savePortfolio === 'function') savePortfolio();
  closeLissageConfig();
}
