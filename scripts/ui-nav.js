/* ═══════════════════════════════════════════════════════════════
   ui-nav.js — Sidebar de navigation : liste projets, clients, dossiers,
               drag-and-drop, renommage, recherche
   Dépendances : ui.js, data.js (portfolio, switchToProject, etc.)
   ═══════════════════════════════════════════════════════════════ */

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
      <div class="nav-client-header" onclick="toggleNavClient('${escH(clientName)}')"
          ondragover="navDragOver(event,'${escH(clientName)}','')"
          ondragleave="navDragLeave(event)"
          ondrop="navDrop(event,'${escH(clientName)}','')">
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
      ${p._appCreated?`<button class="nav-action-btn" onclick="startRename('${p.id}',event)" title="Renommer">&#9998;</button>`:''}
      <button class="nav-action-btn" onclick="duplicateProject('${p.id}',event)" title="Dupliquer">&#10063;</button>
      ${hasFirm?`<button class="nav-action-btn" onclick="resetProjectToFirm('${p.id}',event)" title="Réinitialiser à la base ferme">&#8635;</button>`:''}
      ${p._appCreated?`<button class="nav-action-btn danger" onclick="deleteProject('${p.id}',event)" title="Supprimer">&#128465;</button>`:''}
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
