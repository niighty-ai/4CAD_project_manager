/* ═══════════════════════════════════════════
   data.js — Données, tri, portfolio, Firebase
   ═══════════════════════════════════════════ */

function sortRows(){
  rows.forEach(r=>{
    if(r._type==='tache' && r.groupe !== undefined && !r.niveaux){
      r.niveaux = r.groupe ? [r.groupe] : [];
      delete r.groupe;
    }
    if(r._type==='tache' && !r.niveaux) r.niveaux=[];
    /* Normalisation : r.projet = nom actuel du projet via _srcPid
       Corrige les désynchronisations après renommage dans la sidebar */
    if(r._srcPid){
      const _proj = portfolio.find(p=>p.id===r._srcPid);
      if(_proj && _proj.name && r.projet !== _proj.name) r.projet = _proj.name;
    }
  });
  const jalons=rows.filter(r=>r._type==='jalon');
  const tasks=rows.filter(r=>r._type==='tache');
  const sorted=[];
  function sortLevel(taskList, projet, niveauxPath, depth){
    /* Le projet n'est plus rendu comme ligne spéciale — même en multi-vue,
       il apparaît comme un groupe de niveau 0 (niveaux[0] = nom du projet) */
    const noMore=taskList.filter(r=>!r.niveaux[depth]);
    const withMore=taskList.filter(r=>r.niveaux[depth]);
    const groupNames=[...new Set(withMore.map(r=>r.niveaux[depth]))];
    const groupMeta=groupNames.map(g=>{
      const gT=withMore.filter(r=>r.niveaux[depth]===g);
      const gMin=new Date(Math.min(...gT.map(r=>r.debut.getTime())));
      const gMax=new Date(Math.max(...gT.map(r=>r.fin.getTime())));
      const gCharge=roundCharge(gT.reduce((s,r)=>s+(r.charge||0),0));
      return {g, gT, gMin, gMax, gCharge};
    });
    const items=[
      ...noMore.map(r=>({type:'tache', date:r.debut, r})),
      ...groupMeta.map(m=>({type:'groupe', date:m.gMin, m}))
    ].sort((a,b)=>a.date-b.date);
    items.forEach(item=>{
      if(item.type==='tache'){
        sorted.push({...item.r, _type:'tache'});
      } else {
        const {g, gT, gMin, gMax, gCharge} = item.m;
        const nPath=[...niveauxPath,g];
        sorted.push({_type:'groupe',projet,niveaux:nPath,tache:null,debut:gMin,fin:gMax,charge:gCharge,_depth:depth+1});
        sortLevel(gT, projet, nPath, depth+1);
      }
    });
  }
  if(multiViewMode){
    /* Vue multi-projet : le nom du projet apparaît comme un groupe de niveau 0.
       Les niveaux des tâches NE SONT PAS MODIFIÉS — le groupe projet est inséré
       manuellement avant leurs lignes. Pas de préfixe stocké → pas de corruption. */
    const projOrder=[...new Set(tasks.map(r=>r.projet))].sort((a,b)=>{
      return Math.min(...tasks.filter(r=>r.projet===a).map(r=>r.debut.getTime()))
            -Math.min(...tasks.filter(r=>r.projet===b).map(r=>r.debut.getTime()));
    });
    projOrder.forEach(p=>{
      const projTasks = tasks.filter(r=>r.projet===p);
      if(!projTasks.length) return;
      /* Ligne groupe pour le projet (niveau 0, niveaux=[nomProjet]) */
      const pMin=new Date(Math.min(...projTasks.map(r=>r.debut.getTime())));
      const pMax=new Date(Math.max(...projTasks.map(r=>r.fin.getTime())));
      const pCharge=roundCharge(projTasks.reduce((s,r)=>s+(r.charge||0),0));
      sorted.push({_type:'groupe',projet:p,niveaux:[p],tache:null,
                   debut:pMin,fin:pMax,charge:pCharge,_depth:1,_isProjetGroupe:true});
      /* Trier les tâches du projet normalement (niveaux originaux inchangés)
         depth=0 car les niveaux des tâches sont inchangés (commencent à index 0)
         niveauxPath=[p] positionne les groupes enfants sous le groupe projet */
      sortLevel(projTasks, p, [p], 0);
    });
  } else {
    const projOrder=[...new Set(tasks.map(r=>r.projet))].sort((a,b)=>{
      return Math.min(...tasks.filter(r=>r.projet===a).map(r=>r.debut.getTime()))
            -Math.min(...tasks.filter(r=>r.projet===b).map(r=>r.debut.getTime()));
    });
    projOrder.forEach(p=>{
      sortLevel(tasks.filter(r=>r.projet===p), p, [], 0);
    });
  }
  /* ── Interleave jalons chronologiquement par projet ──
     On regroupe sorted[] par projet et on insère les jalons au bon endroit.
     Fonctionne sans _type='projet' rows. ── */
  const projetsInSorted = [...new Set(sorted.map(r=>r.projet).filter(Boolean))];
  const final=[];

  // Traiter projet par projet dans l'ordre d'apparition
  const handledProjets = new Set();
  for(let i=0; i<sorted.length; i++){
    const r = sorted[i];
    if(!r.projet || handledProjets.has(r.projet)){
      // Ligne déjà traitée ou sans projet (ne devrait pas arriver)
      if(!handledProjets.has(r.projet)) final.push(r);
      continue;
    }
    // Premier item de ce projet : collecter tout le bloc
    const p = r.projet;
    handledProjets.add(p);
    const bloc = sorted.filter(row=>row.projet===p);
    const jProjet = jalons
      .filter(j=>j.projet===p)
      .sort((a,b)=>(a.date||0)-(b.date||0));
    let ji=0;
    for(const row of bloc){
      const lineDate = row.debut || null;
      while(ji < jProjet.length && lineDate && jProjet[ji].date <= lineDate){
        final.push(jProjet[ji++]);
      }
      final.push(row);
    }
    while(ji < jProjet.length) final.push(jProjet[ji++]);
  }

  // Jalons sans projet correspondant dans tasks
  const projetsExistants = new Set(tasks.map(r=>r.projet));
  jalons.filter(j=>!projetsExistants.has(j.projet))
        .sort((a,b)=>(a.date||0)-(b.date||0))
        .forEach(j=>final.push(j));
  rows=final;
}

/* ══════════════════════════════════════════════
   PERSISTANCE — localStorage (immédiat) + Firebase (différé)
   Le localStorage est la source de vérité locale.
   Firebase est la synchronisation cloud.
   ══════════════════════════════════════════════ */
function _serializePortfolio(data){
  return data.map(p=>({
    id:p.id, name:p.name, client:p.client||'', folder:p.folder||'',
    rows: (p.rows||[])
      .filter(r=>r._type!=='jalon')
      .map(r=>{
        const{_srcPid,...rest}=r;
        return{...rest,
          debut:r.debut?r.debut.toISOString():null,
          fin:r.fin?r.fin.toISOString():null,
          assignments:(Array.isArray(r.assignments)?r.assignments:[]).map(a=>({
            ...a,
            debut:a.debut instanceof Date?a.debut.toISOString():(a.debut||null),
            fin:  a.fin   instanceof Date?a.fin.toISOString()  :(a.fin  ||null),
            daily:a.daily?Object.fromEntries(
              Object.entries(a.daily).map(([k,v])=>[k.replace(/\//g,'-'),v])
            ):{}
          }))
        };
      }),
    jalons: (p.jalons||[]).map(j=>{const{_srcPid,...rest}=j;return{...rest,
      date:j.date?j.date.toISOString():null
    };}),
    projectColors: p.projectColors||{},
    collapsed: p.collapsed||{},
    lissageConfig: p.lissageConfig||null,
    _appCreated: p._appCreated || false,
    updatedAt: p.updatedAt || null
  }));
}

function savePortfolio(){
  /* ── 1. Sauvegarde immédiate en localStorage (cookie de sécurité) ── */
  try {
    const serialized = _serializePortfolio(portfolio);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch(e){
    console.warn('localStorage save failed:', e);
  }
  /* ── 2. Sauvegarde différée sur Firebase (sauf si explicitement supprimée) ── */
  if(!_suppressFirebaseSave){
    scheduleFirebaseSave(_serializePortfolio(portfolio));
  }
}

function loadPortfolio(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return false;
    const data = JSON.parse(raw);
    if(!Array.isArray(data) || !data.length) return false;
    portfolio = _deserializePortfolio(data);
    return true;
  }catch(e){ return false; }
}

function _deserializePortfolio(data){
  return data.map(p=>({
    ...p,
    client: p.client||'',
    folder: p.folder||'',
    projectColors: p.projectColors||{},
    collapsed: p.collapsed||{},
    updatedAt: p.updatedAt || null,
    rows: (p.rows||[]).filter(r=>r._type!=='jalon').map(r=>({
      ...r,
      debut: r.debut ? new Date(r.debut) : null,
      fin:   r.fin   ? new Date(r.fin)   : null,
      assignments: (Array.isArray(r.assignments)?r.assignments:[]).map(a=>({
        ...a,
        debut: a.debut ? new Date(a.debut) : null,
        fin:   a.fin   ? new Date(a.fin)   : null,
        daily: a.daily ? Object.fromEntries(
          Object.entries(a.daily).map(([k,v])=>[k.includes('/')?k:k.replace(/-/g,'/'),v])
        ) : {}
      }))
    })),
    jalons: (p.jalons||[]).map(j=>({
      ...j,
      date: j.date ? new Date(j.date) : null
    }))
  }));
}

/* ══════════════════════════════════════════════
   BASE FERME — couche import-only
   ══════════════════════════════════════════════ */

/* Clé stable par tâche (pour comparer ferme vs planifié) */
function _taskKey(row) {
  if (row.externalTaskId) return 'ext:' + row.externalTaskId;
  return (row.niveaux || []).join('\x1F') + '\x1F' + (row.tache || '');
}

/* Sauvegarde la base ferme (localStorage + Firebase) */
function saveFirmPortfolio(firmData) {
  portfolioFirm = firmData;
  try {
    localStorage.setItem(FIRM_STORAGE_KEY, JSON.stringify(_serializePortfolio(firmData)));
  } catch(e) { console.warn('Firm localStorage save failed:', e); }
  scheduleFirebaseSaveFirm(_serializePortfolio(firmData));
}

/* Chargement de la base ferme depuis localStorage */
function loadFirmPortfolio() {
  try {
    const raw = localStorage.getItem(FIRM_STORAGE_KEY);
    if (!raw) return false;
    portfolioFirm = _deserializePortfolio(JSON.parse(raw));
    return true;
  } catch(e) { return false; }
}

function scheduleFirebaseSaveFirm(data) {
  if (typeof window._fbSetFirm !== 'function') return;
  clearTimeout(_fbFirmSaveTimer);
  _fbFirmSaveTimer = setTimeout(() => doFirebaseSaveFirm(data), 1500);
}

async function doFirebaseSaveFirm(data) {
  if (_fbFirmSaving) return;
  if (typeof window._fbSetFirm !== 'function') return;
  _fbFirmSaving = true;
  try {
    await window._fbSetFirm(cleanForFirebase(data));
  } catch(e) {
    console.error('Firebase firm save error:', e);
  } finally { _fbFirmSaving = false; }
}

/* Fusionne un projet ferme dans sa version de travail
   (les tâches _source:'planned' de l'utilisateur sont préservées) */
function _mergeFirmProject(workProj, firmProj) {
  const firmTaskKeys = new Set((firmProj.rows || []).map(_taskKey));
  const newRows = [];
  (firmProj.rows || []).forEach(ft => {
    const key = _taskKey(ft);
    const workTask = (workProj.rows || []).find(wt => _taskKey(wt) === key);
    if (workTask && workTask._source === 'planned') {
      newRows.push(workTask);   // version planifiée par l'utilisateur prime
    } else {
      newRows.push({ ...ft });  // version ferme (sans _source)
    }
  });
  // Tâches créées par l'utilisateur sans contrepartie ferme
  (workProj.rows || [])
    .filter(wt => wt._source === 'planned' && !firmTaskKeys.has(_taskKey(wt)))
    .forEach(wt => newRows.push(wt));
  return { ...workProj, rows: newRows, name: firmProj.name, client: firmProj.client };
}

/* Fusionne toute la nouvelle base ferme dans le portfolio de travail */
function mergeFirmIntoWorking(newFirmData) {
  const firmIds = new Set(newFirmData.map(p => p.id));
  newFirmData.forEach(firmProj => {
    const workIdx = portfolio.findIndex(p => p.id === firmProj.id);
    if (workIdx === -1) {
      portfolio.push({ ...firmProj, rows: (firmProj.rows || []).map(r => ({ ...r })) });
    } else {
      portfolio[workIdx] = _mergeFirmProject(portfolio[workIdx], firmProj);
    }
  });
  // Projets retirés de la base ferme (et non créés dans l'appli)
  const removedFromFirm = portfolio.filter(p => !p._appCreated && !firmIds.has(p.id));
  if (removedFromFirm.length > 0) {
    const msg = `La base ferme a été mise à jour.\n\nLes projets suivants ne sont plus dans l'import :\n${removedFromFirm.map(p => `• ${p.name} (${p.client || 'sans client'})`).join('\n')}\n\nVoulez-vous les conserver dans la planification ?`;
    if (!confirm(msg)) {
      removedFromFirm.forEach(p => {
        const idx = portfolio.indexOf(p);
        if (idx !== -1) portfolio.splice(idx, 1);
        selectedProjectIds.delete(p.id);
      });
    } else {
      removedFromFirm.forEach(p => { p._appCreated = true; });
    }
  }
}

/* Notifie l'utilisateur si des tâches planifiées existent sur des projets mis à jour */
function _notifyFirmConflicts(newFirmData) {
  const conflictProjs = newFirmData
    .map(fp => portfolio.find(wp => wp.id === fp.id))
    .filter(wp => wp && (wp.rows || []).some(r => r._source === 'planned'));
  if (conflictProjs.length === 0) return;
  const msg = `⚠ La base ferme a été mise à jour.\n\nDes modifications planifiées existent sur :\n${conflictProjs.map(p => `• ${p.name}`).join('\n')}\n\nVoulez-vous réinitialiser ces projets à la nouvelle base ferme ?\n(Les modifications planifiées seront perdues)`;
  if (confirm(msg)) {
    conflictProjs.forEach(p => _resetProjectToFirmSilent(p.id, newFirmData));
  }
}

/* Réinitialise un projet à la base ferme sans confirmation */
function _resetProjectToFirmSilent(projectId, firmDataSrc) {
  const src = firmDataSrc || portfolioFirm;
  const firmProj = src.find(p => p.id === projectId);
  if (!firmProj) return;
  const idx = portfolio.findIndex(p => p.id === projectId);
  if (idx === -1) return;
  const cur = portfolio[idx];
  const deser = _deserializePortfolio([JSON.parse(JSON.stringify(_serializePortfolio([firmProj])[0]))])[0];
  portfolio[idx] = {
    ...deser,
    collapsed:     cur.collapsed     || {},
    projectColors: cur.projectColors || firmProj.projectColors || {},
    jalons:        cur.jalons        || firmProj.jalons        || []
  };
}

/* Réinitialise un projet à la base ferme (public, avec confirmation) */
function resetProjectToFirm(projectId, e) {
  if (e) e.stopPropagation();
  const firmProj = portfolioFirm.find(p => p.id === projectId);
  if (!firmProj) {
    alert('Ce projet n\'a pas de base ferme.\nIl a été créé directement dans l\'application.');
    return;
  }
  const proj = portfolio.find(p => p.id === projectId);
  if (!confirm(`Réinitialiser "${proj?.name || firmProj.name}" à la base ferme ?\n\nToutes les modifications planifiées seront perdues.`)) return;
  _resetProjectToFirmSilent(projectId);
  /* Effacer l'état d'édition en cours */
  if (typeof _ganttEdits !== 'undefined') _ganttEdits = {};
  if (typeof _tasksDirty !== 'undefined') _tasksDirty = false;
  if (typeof _tasksSnapshot !== 'undefined') _tasksSnapshot = null;
  if (typeof _updateSaveBtn === 'function') _updateSaveBtn();
  /* Sauvegarde immédiate (pas de bouton "Enregistrer" requis) */
  if (typeof _forcePortfolioFirebaseSave === 'function') _forcePortfolioFirebaseSave();
  /* Toujours recharger les rows et re-rendre (même si le projet n'est pas actif),
     pour éviter tout affichage en cache des valeurs modifiées */
  if (typeof _loadSelectedProjects === 'function') _loadSelectedProjects();
  if (typeof renderAll === 'function') renderAll();
  if (typeof renderNavList === 'function') renderNavList();
  _updateTogglePlannedBtn();
}

/* Bascule le mode d'affichage planifié global (comme semaine/mois/…).
   Un seul état pour toute l'application — persiste en localStorage, jamais sur Firebase. */
function toggleProjectPlanned(projectId, e) {
  if (e) e.stopPropagation();
  usePlanned = !usePlanned;
  /* Persistance locale uniquement (état d'affichage, pas données structurelles) */
  try { localStorage.setItem('4cap_useplanned', usePlanned ? '1' : '0'); } catch(_) {}
  if (typeof renderNavList === 'function') renderNavList();
  if (typeof renderAll === 'function') renderAll();
  _updateTogglePlannedBtn();
}

/* Met à jour l'état visuel du bouton toggle planifié global */
function _updateTogglePlannedBtn() {
  const btn = document.getElementById('btnTogglePlanned');
  if (!btn) return;
  btn.classList.toggle('planned-active', usePlanned);
  btn.title = usePlanned
    ? 'Désactiver le mode planifié (lissage + affichage)'
    : 'Activer le mode planifié (lissage + affichage)';
}

/* ── Modal import — options avant commit ── */
let _pendingImportCallback = null;

function showImportModal(summaryText, onConfirm) {
  _pendingImportCallback = onConfirm;
  const el = document.getElementById('importSummaryText');
  if (el) el.textContent = summaryText;
  const cb = document.getElementById('importResetPlanned');
  if (cb) cb.checked = false;
  const modal = document.getElementById('importOptionsModal');
  if (modal) modal.style.display = 'flex';
}

function confirmImport() {
  const cb = document.getElementById('importResetPlanned');
  const resetPlanned = cb ? cb.checked : false;
  const modal = document.getElementById('importOptionsModal');
  if (modal) modal.style.display = 'none';
  if (_pendingImportCallback) {
    const fn = _pendingImportCallback;
    _pendingImportCallback = null;
    fn(resetPlanned);
  }
}

function cancelImport() {
  _pendingImportCallback = null;
  const modal = document.getElementById('importOptionsModal');
  if (modal) modal.style.display = 'none';
}

/* Supprime les marqueurs planifiés sur tous les projets présents dans firmData
   et supprime aussi les projets créés manuellement (_appCreated:true) */
function _resetPlannedForFirmProjects(firmData) {
  firmData.forEach(fp => {
    const wp = portfolio.find(p => p.id === fp.id);
    if (!wp) return;
    (wp.rows || []).forEach(r => { delete r._source; });
  });
  /* Supprimer les projets créés manuellement */
  const appCreatedIds = portfolio.filter(p => p._appCreated).map(p => p.id);
  if (appCreatedIds.length) {
    portfolio = portfolio.filter(p => !p._appCreated);
    appCreatedIds.forEach(id => {
      selectedProjectIds.delete(id);
      if (activeProjectId === id) activeProjectId = null;
    });
  }
}

function createNewProjectPrompt(){
  const clients = [...new Set(portfolio.map(p=>p.client||'').filter(Boolean))];
  let clientName = '';
  if(clients.length > 0){
    const list = clients.map((c,i)=>`${i+1}. ${c}`).join('\n');
    const input = prompt(`Client pour ce Gantt :\n${list}\n\nEntrez le numéro ou un nouveau nom :`);
    if(input === null) return;
    const num = parseInt(input);
    clientName = (!isNaN(num) && num >= 1 && num <= clients.length) ? clients[num-1] : input.trim();
  } else {
    clientName = prompt('Nom du client :') || '';
  }
  createNewProject('Nouveau projet', [], {}, clientName);
}

function createNewProject(name, initialRows, initialColors, client, folder){
  const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  const proj = {
    id,
    name: name || 'Nouveau projet ' + (portfolio.length+1),
    client: client || '',
    folder: folder || '',
    rows: initialRows || [],
    projectColors: initialColors || {},
    collapsed: {},
    _appCreated: true  // créé dans l'appli, pas issu d'un import ferme
  };
  portfolio.push(proj);
  /* Ajouter automatiquement le client au portefeuille de l'utilisateur */
  if (client && !userWalletClients.has(client)) {
    userWalletClients.add(client);
    saveUserWallet();
  }
  savePortfolio();
  renderNavList();
  switchToProject(id);
}

/* ══════════════════════════════════════════════
   PORTEFEUILLE UTILISATEUR — persistance Firebase
   ══════════════════════════════════════════════ */

/* ── Sauvegarde le portefeuille de l'utilisateur courant ── */
function saveUserWallet() {
  if (!currentUserId || typeof window._fbSetUserWallet !== 'function') return;
  window._fbSetUserWallet(currentUserId, [...userWalletClients]).catch(e => {
    console.error('[Wallet] Erreur sauvegarde:', e);
  });
}

/* ── Ajouter un client au portefeuille (depuis la recherche) ── */
function addClientToWallet(clientName) {
  if (!clientName || userWalletClients.has(clientName)) return;
  userWalletClients.add(clientName);
  saveUserWallet();
  renderNavList();
  const si = document.getElementById('walletSearch');
  const sr = document.getElementById('walletSearchResults');
  if (si) si.value = '';
  if (sr) sr.style.display = 'none';
}

/* ── Retirer un client du portefeuille (sans supprimer les données) ── */
function removeClientFromWallet(clientName, e) {
  if (e) e.stopPropagation();
  if (!confirm(`Retirer "${clientName}" de votre portefeuille ?\n\nLe client et ses projets restent disponibles dans la base de données.`)) return;
  _saveBackToPortfolio();
  const clientProjs = portfolio.filter(p => (p.client||'') === clientName);
  clientProjs.forEach(p => selectedProjectIds.delete(p.id));
  if (clientProjs.some(p => p.id === activeProjectId)) activeProjectId = null;
  userWalletClients.delete(clientName);
  saveUserWallet();
  if (selectedProjectIds.size > 0) {
    if (!activeProjectId) activeProjectId = [...selectedProjectIds][0];
    multiViewMode = selectedProjectIds.size > 1;
    _loadSelectedProjects();
  } else {
    multiViewMode = false;
    activeProjectId = null;
    rows = []; projectColors = {}; collapsed = {};
  }
  renderNavList();
  renderAll();
}

/* ── Décharger tous les clients du portefeuille d'un coup ── */
function clearWallet() {
  if (!userWalletClients.size) return;
  const n = userWalletClients.size;
  if (!confirm(`Retirer les ${n} client${n > 1 ? 's' : ''} de votre portefeuille ?\n\nLes données restent disponibles dans la base de données.`)) return;
  _saveBackToPortfolio();
  selectedProjectIds.clear();
  activeProjectId  = null;
  multiViewMode    = false;
  userWalletClients.clear();
  saveUserWallet();
  rows = []; projectColors = {}; collapsed = {};
  renderNavList();
  renderAll();
}

/* ── Supprimer définitivement un client et tous ses projets de la base ── */
function deleteClientFromDB(clientName, e) {
  if (e) e.stopPropagation();
  const count = portfolio.filter(p => (p.client||'') === clientName).length;
  if (!confirm(`Supprimer définitivement le client "${clientName}" et ses ${count} projet(s) ?\n\nCette action est irréversible pour tous les utilisateurs.`)) return;
  _saveBackToPortfolio();
  const clientProjs = portfolio.filter(p => (p.client||'') === clientName);
  clientProjs.forEach(p => {
    selectedProjectIds.delete(p.id);
    if (p.id === activeProjectId) activeProjectId = null;
  });
  portfolio = portfolio.filter(p => (p.client||'') !== clientName);
  delete navFolders[clientName];
  userWalletClients.delete(clientName);
  savePortfolio();
  saveUserWallet();
  if (selectedProjectIds.size > 0) {
    if (!activeProjectId) activeProjectId = [...selectedProjectIds][0];
    multiViewMode = selectedProjectIds.size > 1;
    _loadSelectedProjects();
  } else {
    multiViewMode = false;
    activeProjectId = null;
    rows = []; projectColors = {}; collapsed = {};
    const first = portfolio.find(p => p.client && userWalletClients.has(p.client));
    if (first) { switchToProject(first.id); return; }
  }
  renderNavList();
  renderAll();
}

/* ── Créer un nouveau dossier dans un client ── */
function createFolder(clientName, e){
  if(e) e.stopPropagation();
  const name = prompt('Nom du dossier :');
  if(!name || !name.trim()) return;
  const folderName = name.trim();
  if(!navFolders[clientName]) navFolders[clientName] = new Set();
  navFolders[clientName].add(folderName);
  renderNavList();
}

/* ── Renommer un dossier ── */
function renameFolder(clientName, oldFolder, e){
  if(e) e.stopPropagation();
  const newName = prompt('Renommer le dossier :', oldFolder);
  if(!newName || !newName.trim() || newName.trim()===oldFolder) return;
  const trimmed = newName.trim();
  portfolio.forEach(p=>{
    if((p.client||'')===clientName && (p.folder||'')===oldFolder) p.folder = trimmed;
  });
  if(navFolders[clientName]){
    navFolders[clientName].delete(oldFolder);
    navFolders[clientName].add(trimmed);
  }
  savePortfolio();
  renderNavList();
}

/* ── Ajouter un projet dans un dossier ── */
function addProjectToFolder(clientName, folderName, e){
  if(e) e.stopPropagation();
  createNewProject('Nouveau projet', [], {}, clientName, folderName);
}

/* ── Supprimer un dossier ── */
function deleteFolder(clientName, folderName, e){
  if(e) e.stopPropagation();
  const projs = portfolio.filter(p=>(p.client||'')===clientName && (p.folder||'')===folderName);
  if(projs.length > 0){
    const choice = confirm(`Supprimer le dossier "${folderName}" ?\n\nOK = déplacer les ${projs.length} projet(s) à la racine\nAnnuler = annuler`);
    if(choice===null) return;
    projs.forEach(p=>{ p.folder = ''; });
  }
  if(navFolders[clientName]) navFolders[clientName].delete(folderName);
  savePortfolio();
  renderNavList();
}

/* ── Déplacer un projet vers un dossier ── */
function moveProjectToFolder(projId, clientName, folderName){
  _saveBackToPortfolio();
  const proj = portfolio.find(p=>p.id===projId);
  if(!proj) return;
  proj.client = clientName;
  proj.folder = folderName || '';
  savePortfolio();
  renderNavList();
}

/* ══════════════════════════════════════════════
   SWITCH / SAVE / LOAD — cœur de la navigation
   ══════════════════════════════════════════════ */

function switchToProject(id){
  /* 1. Sauvegarder l'état courant AVANT tout changement */
  _saveBackToPortfolio();

  /* 2. Contrainte client : si on change de client en multiview, reset sélection */
  const targetProj = portfolio.find(p=>p.id===id);
  if(!targetProj) return;
  const targetClient = targetProj.client||'';
  if(multiViewMode && selectedProjectIds.size > 0){
    const currentClient = portfolio.find(p=>selectedProjectIds.has(p.id))?.client||'';
    if(targetClient !== currentClient){
      selectedProjectIds.clear();
      multiViewMode = false;
    }
  }

  /* 3. Mettre à jour la sélection et persister l'ID actif */
  activeProjectId = id;
  try { localStorage.setItem('gantt4cad_active', id); } catch(e){}
  if(!multiViewMode){
    selectedProjectIds.clear();
    selectedProjectIds.add(id);
  } else {
    selectedProjectIds.add(id);
  }

  /* 4. Charger */
  _loadSelectedProjects();
  renderNavList();
  renderAll();
  _updateTogglePlannedBtn();
  if (typeof _updateRefreshBtn === 'function') _updateRefreshBtn();
}

/* ── Sauvegarde les rows[] vers le(s) projet(s) source dans portfolio ──
   RÈGLE DE SÉCURITÉ : on ne sauvegarde QUE si rows[] contient des données
   appartenant au projet cible. Un rows[] vide ou sans correspondance ne
   doit JAMAIS écraser les données existantes. ── */
function _saveBackToPortfolio(){
  /* Garde : si rows est vide ET qu'aucun projet n'est actif, rien à faire */
  if(!activeProjectId && !multiViewMode) return;

  if(multiViewMode){
    selectedProjectIds.forEach(pid=>{
      const proj = portfolio.find(p=>p.id===pid);
      if(!proj) return;
      /* Sécurité : ne sauvegarder que si des rows taggées pid existent */
      const mine = rows.filter(r=>r._srcPid===pid && r._type==='tache');
      const mineJalons = rows.filter(r=>r._srcPid===pid && r._type==='jalon');
      /* Si aucune tâche ET aucun jalon taggés → projet pas chargé dans cette session,
         on préserve ses données intactes */
      if(mine.length === 0 && mineJalons.length === 0 &&
         (proj.rows||[]).some(r=>r._type==='tache' || proj.jalons?.length)){
        return; /* Ne pas écraser */
      }
      /* Striper le préfixe projet des niveaux avant sauvegarde
         (ajouté par sortRows pour l'affichage multi-vue uniquement) */
      proj.rows   = mine.map(r=>{const{_srcPid,...rest}=r;return{...rest};});
      proj.jalons = mineJalons.map(r=>{const{_srcPid,...rest}=r;return{...rest};});
      const projNames = [...new Set([...mine,...mineJalons].map(r=>r.projet))];
      proj.projectColors = proj.projectColors||{};
      projNames.forEach(n=>{ if(projectColors[n]) proj.projectColors[n]=projectColors[n]; });
      proj.collapsed = proj.collapsed||{};
      Object.assign(proj.collapsed, collapsed);
    });
  } else if(activeProjectId){
    const proj = portfolio.find(p=>p.id===activeProjectId);
    if(!proj) return;
    const taches = rows.filter(r=>r._type==='tache');
    const jalons = rows.filter(r=>r._type==='jalon');
    /* Sécurité : si rows[] est vide MAIS que le projet avait des données,
       c'est un state vide (ex: sélection à 0), on ne touche pas */
    if(taches.length === 0 && jalons.length === 0 &&
       ((proj.rows||[]).filter(r=>r._type==='tache').length > 0 || (proj.jalons||[]).length > 0)){
      return; /* Préserver les données existantes */
    }
    proj.rows   = taches.map(r=>{const{_srcPid,...rest}=r;return{...rest};});
    proj.jalons = jalons.map(r=>{const{_srcPid,...rest}=r;return{...rest};});
    proj.projectColors = {...projectColors};
    proj.collapsed = {...collapsed};
  }
  /* Synchronise en mémoire + localStorage uniquement.
     Les écritures Firebase ne sont déclenchées que par les actions explicites
     de l'utilisateur (bouton Enregistrer → _forcePortfolioFirebaseSave).
     Cela empêche qu'un simple changement de projet écrase les données
     d'un autre utilisateur dans Firebase. */
  _suppressFirebaseSave = true;
  savePortfolio();
  _suppressFirebaseSave = false;
}

/* ── Charge les projets sélectionnés dans rows[] ── */
function _loadSelectedProjects(){
  rows = [];
  projectColors = {};
  collapsed = {};
  selectedProjectIds.forEach(pid=>{
    const proj = portfolio.find(p=>p.id===pid);
    if(!proj) return;
    const taches = (proj.rows||[]).filter(r=>r._type==='tache').map(r=>({...r, _srcPid:pid}));
    const jalons = (proj.jalons||[]).map(r=>({...r, _srcPid:pid}));
    rows.push(...taches, ...jalons);
    Object.assign(projectColors, proj.projectColors||{});
    Object.assign(collapsed, proj.collapsed||{});
  });
  sortRows();
  const names = [...selectedProjectIds].map(id=>portfolio.find(p=>p.id===id)?.name).filter(Boolean);
  if(names.length>1){
    const client = portfolio.find(p=>p.id===activeProjectId)?.client||'';
    
  } else if(names.length===1){
    
  }
}

/* ── Toggle checkbox d'un projet ── */
function toggleProjectSelection(id, e){
  if(e) e.stopPropagation();

  /* Contrainte : multi-sélection limitée au même client */
  const targetProj = portfolio.find(p=>p.id===id);
  if(!targetProj) return;
  const targetClient = targetProj.client||'';
  if(!selectedProjectIds.has(id) && selectedProjectIds.size > 0){
    const currentClient = portfolio.find(p=>selectedProjectIds.has(p.id))?.client||'';
    if(targetClient !== currentClient){
      const item = document.getElementById('navItem_'+id);
      if(item){
        item.style.transition='background .1s';
        item.style.background='rgba(192,57,43,.18)';
        setTimeout(()=>{ item.style.background=''; },500);
      }
      const msg = document.createElement('div');
      msg.style.cssText='position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#c0392b;color:#fff;padding:8px 18px;border-radius:6px;font-size:12px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none';
      msg.textContent = 'Multi-sélection possible uniquement au sein d\'un même client';
      document.body.appendChild(msg);
      setTimeout(()=>msg.remove(), 2800);
      return;
    }
  }

  /* Sauvegarder AVANT de modifier la sélection */
  _saveBackToPortfolio();

  if(selectedProjectIds.has(id)){
    selectedProjectIds.delete(id);
    if(activeProjectId===id && selectedProjectIds.size>0){
      activeProjectId=[...selectedProjectIds][0];
    }
  } else {
    selectedProjectIds.add(id);
  }

  multiViewMode = selectedProjectIds.size > 1;
  if(selectedProjectIds.size===1){
    activeProjectId=[...selectedProjectIds][0];
    multiViewMode=false;
  }

  if(selectedProjectIds.size===0){
    /* On vide la vue SANS écraser les données :
       activeProjectId est mis à null avant renderAll pour bloquer tout save */
    multiViewMode=false;
    activeProjectId=null;
    rows=[]; projectColors={}; collapsed={};
    
    renderNavList(); renderAll(); return;
  }

  _loadSelectedProjects();
  renderNavList(); renderAll();
  if (typeof _updateRefreshBtn === 'function') _updateRefreshBtn();
}

/* ── Tout cocher/décocher pour un client ── */
function selectAllClientProjects(clientName, e){
  if(e) e.stopPropagation();
  _saveBackToPortfolio();
  const clientProjs = portfolio.filter(p=>(p.client||'')===clientName);
  const allChecked = clientProjs.every(p=>selectedProjectIds.has(p.id));
  if(allChecked){
    clientProjs.forEach(p=>selectedProjectIds.delete(p.id));
    if(selectedProjectIds.size===0 && portfolio.length>0){
      /* Fallback : sélectionner le premier projet dispo */
      const first = portfolio[0].id;
      selectedProjectIds.add(first);
      activeProjectId=first;
    }
  } else {
    /* Désélectionner les projets d'autres clients d'abord */
    const hasOtherClient = [...selectedProjectIds].some(id=>{
      const p = portfolio.find(x=>x.id===id);
      return p && (p.client||'') !== clientName;
    });
    if(hasOtherClient) selectedProjectIds.clear();
    clientProjs.forEach(p=>selectedProjectIds.add(p.id));
    if(!activeProjectId || !clientProjs.find(p=>p.id===activeProjectId)){
      activeProjectId=clientProjs[0]?.id;
    }
  }
  multiViewMode = selectedProjectIds.size > 1;
  if(selectedProjectIds.size===1) activeProjectId=[...selectedProjectIds][0];
  _loadSelectedProjects();
  renderNavList(); renderAll();
  if (typeof _updateRefreshBtn === 'function') _updateRefreshBtn();
}

function deleteProject(id, e){
  e.stopPropagation();
  const proj = portfolio.find(p=>p.id===id);
  if(!proj) return;
  if(!confirm(`Supprimer le projet "${proj.name}" ?`)) return;
  /* Sauvegarder avant de supprimer */
  if(selectedProjectIds.has(id)) _saveBackToPortfolio();
  portfolio = portfolio.filter(p=>p.id!==id);
  selectedProjectIds.delete(id);
  if(activeProjectId===id) activeProjectId=null;
  savePortfolio();
  if(!activeProjectId && selectedProjectIds.size>0){
    activeProjectId=[...selectedProjectIds][0];
    multiViewMode=selectedProjectIds.size>1;
    _loadSelectedProjects();
  } else if(!activeProjectId){
    multiViewMode=false;
    rows=[]; projectColors={}; collapsed={};
    
    if(portfolio.length>0) switchToProject(portfolio[0].id);
    else { renderNavList(); renderAll(); }
    return;
  } else if(multiViewMode){
    multiViewMode=selectedProjectIds.size>1;
    _loadSelectedProjects();
  }
  renderNavList(); renderAll();
}

function duplicateProject(id, e){
  e.stopPropagation();
  const proj = portfolio.find(p=>p.id===id);
  if(!proj) return;
  if(selectedProjectIds.has(id)) _saveBackToPortfolio();
  const srcProj = portfolio.find(p=>p.id===id);
  const newId = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  const copy = {
    id: newId,
    name: srcProj.name + ' (copie)',
    client: srcProj.client||'',
    folder: srcProj.folder||'',
    rows: (srcProj.rows||[]).map(r=>({...r})),
    jalons: (srcProj.jalons||[]).map(r=>({...r})),
    projectColors: {...(srcProj.projectColors||{})},
    collapsed: {...(srcProj.collapsed||{})}
  };
  portfolio.push(copy);
  savePortfolio();
  renderNavList();
  switchToProject(newId);
}

function saveCurrentProject(){
  /* Prend un snapshot avant la première modif pour pouvoir annuler */
  if(!_tasksDirty){
    _tasksSnapshot = JSON.stringify(_serializePortfolio(portfolio));
    _tasksDirty = true;
  }
  _suppressFirebaseSave = true;
  _saveBackToPortfolio();
  _suppressFirebaseSave = false;
  if(typeof _updateSaveBtn==='function') _updateSaveBtn();
}

/* Sauvegarde locale sans marquer dirty (utilisé par saveGanttEdits pour les daily) */
function _saveCurrentProjectLocal(){
  _suppressFirebaseSave = true;
  _saveBackToPortfolio();
  _suppressFirebaseSave = false;
}

/* Commit définitif vers Firebase après validation 💾 */
function _forcePortfolioFirebaseSave(){
  _tasksDirty = false;
  _tasksSnapshot = null;
  /* Horodater le projet actif avant sérialisation */
  if(activeProjectId){
    const proj = portfolio.find(p=>p.id===activeProjectId);
    if(proj) proj.updatedAt = Date.now();
  }
  /* Marquer immédiatement pour bloquer les sync Firebase entrants pendant la sauvegarde */
  _lastSaveTs = Date.now();
  scheduleFirebaseSave(_serializePortfolio(portfolio));
  /* Libérer le verrou d'écriture */
  if(typeof _releaseProjectLock==='function') _releaseProjectLock();
}

/* Annule toutes les modifs de tâches et restaure le snapshot */
function revertTaskChanges(){
  if(!_tasksDirty) return;
  if(_tasksSnapshot){
    portfolio = _deserializePortfolio(JSON.parse(_tasksSnapshot));
    /* Recharger les rows[] depuis le portfolio restauré */
    if(typeof _loadSelectedProjects==='function') _loadSelectedProjects();
    else if(typeof switchToProject==='function' && activeProjectId) switchToProject(activeProjectId);
    if(typeof sortRows==='function') sortRows();
    if(typeof renderAll==='function') renderAll();
  }
  _tasksDirty = false;
  _tasksSnapshot = null;
  /* Persister le portfolio annulé en localStorage (sans Firebase) */
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_serializePortfolio(portfolio))); } catch(e){}
  /* Libérer le verrou d'écriture */
  if(typeof _releaseProjectLock==='function') _releaseProjectLock();
  if(typeof _updateSaveBtn==='function') _updateSaveBtn();
}

function importToNewProject(parsedRows, fileName){
  const name = fileName.replace(/\.[^.]+$/, '').replace(/[_-]/g,' ');
  createNewProject(name, parsedRows, {});
}

function setFbStatus(text, color){
  const el = document.getElementById('fbStatus');
  if(!el) return;
  el.textContent  = text;
  el.style.color  = color || 'var(--muted)';
  el.style.background = color ? color + '18' : 'var(--surface2)';
}

function cleanForFirebase(obj){
  if(Array.isArray(obj)) return obj.map(cleanForFirebase);
  if(obj instanceof Date) return obj.toISOString();
  if(obj !== null && typeof obj === 'object'){
    const out = {};
    for(const [k,v] of Object.entries(obj)){
      if(v === undefined) continue;
      /* Encode '/' dans les clés (Firebase interdit ce caractère) */
      const sk = k.replace(/\//g, '-');
      if(v === null){ out[sk] = null; continue; }
      out[sk] = cleanForFirebase(v);
    }
    return out;
  }
  return obj;
}

function scheduleFirebaseSave(data){
  if(typeof window._fbSet !== 'function') return;
  clearTimeout(_fbSaveTimer);
  setFbStatus('⏳ Sync...', '#f7971e');
  _fbSaveTimer = setTimeout(()=> doFirebaseSave(data), 1500);
}

async function doFirebaseSave(data){
  if(_fbSaving) return;
  if(typeof window._fbSet !== 'function'){ setFbStatus('⚠ SDK non prêt', '#e17055'); return; }
  _fbSaving = true;
  try {
    const clean = cleanForFirebase(data);
    _lastSaveTs = Date.now();
    await window._fbSet(clean);
    const t   = new Date();
    const hms = [t.getHours(),t.getMinutes(),t.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':');
    setFbStatus('☁ ' + hms, '#2e7d32');
  } catch(e){
    console.error('Firebase save error:', e);
    setFbStatus('⚠ Erreur Firebase', '#e17055');
  } finally { _fbSaving = false; }
}

function migrateFirebaseData(data){
  return _deserializePortfolio(data.map(p=>({
    ...p,
    client: p.client||'',
    folder: p.folder||'',
    projectColors: p.projectColors||{},
    collapsed: p.collapsed||{},
    jalons: (p.jalons||[
      ...(p.rows||[]).filter(r=>r._type==='jalon')
    ]).map(j=>({
      _type:'jalon', nom:j.nom||'', projet:j.projet||'',
      date: j.date ? j.date : null, couleur:j.couleur||null
    })),
    rows: (p.rows||[]).filter(r=>r._type!=='jalon').map(r=>{
      const _rawNiv = r.niveaux ? r.niveaux : (r.groupe ? [r.groupe] : []);
      const niveaux = _rawNiv;
      return {
        // Préserve TOUS les champs (assignments, chargePassee, chargeRestante, etc.)
        ...r,
        _type:  r._type  || 'tache',
        projet: r.projet || '',
        niveaux,
        tache:  r.tache  || null,
        debut:  r.debut  ? r.debut : null,
        fin:    r.fin    ? r.fin   : null,
        charge: r.charge != null ? r.charge : null,
        chargePassee:   r.chargePassee   ?? null,
        chargeRestante: r.chargeRestante ?? null,
        assignments:    Array.isArray(r.assignments) ? r.assignments : []
      };
    })
  })));
}

function downloadModele(){
  const headers = ['Type','Projet','Niveau 1','Niveau 2','Niveau 3','Tâche','Début','Fin','Charge (j)'];
  const examples = [
    ['','ACME Corp','Cadrage','','','Atelier de lancement','2025-04-01','2025-04-03',1.5],
    ['','ACME Corp','Cadrage','','','Rédaction cahier des charges','2025-04-04','2025-04-15',4],
    ['','ACME Corp','Réalisation','Sprint 1','','Développement module A','2025-04-16','2025-05-02',8],
    ['','ACME Corp','Réalisation','Sprint 1','','Tests unitaires','2025-04-28','2025-05-02',2],
    ['','ACME Corp','Réalisation','Sprint 2','','Développement module B','2025-05-05','2025-05-23',10],
    ['','ACME Corp','Recette','','','Recette client','2025-05-26','2025-06-06',5],
    ['jalon','ACME Corp','','','','Mise en production','2025-06-09','',''],
    ['','Projet Beta','Phase 1','','','Analyse','2025-04-01','2025-04-10',3],
    ['jalon','Projet Beta','','','','Go / No Go','2025-04-11','',''],
  ];
  const data = [headers, ...examples];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:8},{wch:16},{wch:16},{wch:14},{wch:14},{wch:30},{wch:12},{wch:12},{wch:10}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modèle');
  const help = [
    ['Colonne','Description','Obligatoire'],
    ['Type','Laisser vide pour une tâche, écrire "jalon" pour un jalon','Non'],
    ['Projet','Nom du projet (regroupe les tâches)','Oui'],
    ['Niveau 1','Groupe de niveau 1 (ex: Phase, Sprint…)','Non'],
    ['Niveau 2','Sous-groupe de niveau 2','Non'],
    ['Niveau 3','Sous-groupe de niveau 3','Non'],
    ['Tâche','Nom de la tâche ou du jalon','Oui'],
    ['Début','Date de début (YYYY-MM-DD ou DD/MM/YYYY)','Oui'],
    ['Fin','Date de fin (vide pour les jalons)','Oui (sauf jalon)'],
    ['Charge (j)','Charge en jours-homme (nombre décimal)','Non'],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(help);
  ws2['!cols'] = [{wch:12},{wch:50},{wch:16}];
  XLSX.utils.book_append_sheet(wb, ws2, 'Aide');
  XLSX.writeFile(wb, 'modele_import_gantt.xlsx');
}

/* ════════════════════════════════════════════════════════════════════════
   VERROUILLAGE DE PROJET
   — Verrou acquis à l'entrée en mode édition
   — Libéré à la sauvegarde, à l'annulation, après 10 min d'inactivité
     ou lors d'une perte de connexion (Firebase onDisconnect)
   ════════════════════════════════════════════════════════════════════════ */

/* Tente d'acquérir le verrou d'écriture sur un projet.
   Retourne true si le verrou est obtenu, false si bloqué par un autre utilisateur. */
async function _acquireProjectLock(projectId) {
  if (!currentUserId || !projectId) return true; // pas d'auth → édition libre
  if (_lockedProjectId === projectId) return true; // déjà verrouillé par nous

  // Lire le verrou depuis Firebase en temps réel (évite la race condition du cache local)
  let existing = null;
  if (typeof window._fbGetLock === 'function') {
    existing = await window._fbGetLock(projectId);
  } else {
    existing = _projectLocks[projectId] || null;
  }

  if (existing && existing.userId !== currentUserId && existing.expiresAt > Date.now()) {
    _showLockBlockedMessage(existing.userDisplayName);
    return false;
  }

  const now = Date.now();
  const lockData = {
    userId:          currentUserId,
    userDisplayName: currentUserEmail || currentUserId,
    lockedAt:        now,
    expiresAt:       now + LOCK_TTL_MS
  };

  // Marquer le verrou localement en avance (fail-open : en cas d'erreur Firebase on laisse éditer)
  _lockedProjectId = projectId;
  _projectLocks[projectId] = lockData;
  _startLockInactivityTimer();
  _updateRefreshBtn();

  try {
    await window._fbAcquireLock(projectId, lockData);
  } catch(e) {
    console.warn('[Lock] Écriture Firebase échouée (mode dégradé — édition autorisée) :', e);
  }
  return true;
}

/* Libère le verrou d'écriture tenu par cet utilisateur. */
function _releaseProjectLock() {
  if (!_lockedProjectId) return;
  const pid = _lockedProjectId;
  _lockedProjectId = null;
  _pendingFirebaseUpdate = false;
  _clearLockInactivityTimer();
  if (typeof window._fbReleaseLock === 'function') {
    window._fbReleaseLock(pid).catch(e => console.warn('[Lock] Libération échouée :', e));
  }
  _updateRefreshBtn();
}

/* Démarre (ou redémarre) le timer d'inactivité de 10 min. */
function _startLockInactivityTimer() {
  _clearLockInactivityTimer();
  _lockInactivityTimer = setTimeout(() => {
    _releaseProjectLock();
    setFbStatus('⏱ Verrou expiré', '#f7971e');
    setTimeout(() => setFbStatus('☁ Connecté', '#2e7d32'), 3000);
  }, LOCK_TTL_MS);
}

function _clearLockInactivityTimer() {
  if (_lockInactivityTimer) { clearTimeout(_lockInactivityTimer); _lockInactivityTimer = null; }
}

/* Réinitialise le timer d'inactivité à chaque interaction utilisateur dans le panneau. */
function _resetLockInactivityTimer() {
  if (_lockedProjectId) _startLockInactivityTimer();
}

/* Affiche un message bloquant quand un autre utilisateur détient le verrou. */
function _showLockBlockedMessage(holderName) {
  const msg = `Ce projet est en cours d'édition par :\n${holderName}\n\nVeuillez attendre qu'il termine ou que son verrou expire.`;
  alert(msg);
}

/* SVG cadenas inline — injectés dans #lockIndicator */
const _LOCK_SVG_OPEN   = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';
const _LOCK_SVG_CLOSED = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

/* Met à jour l'indicateur cadenas (verrou projet). */
function _updateRefreshBtn() {
  const el = document.getElementById('lockIndicator');
  if (!el) return;

  const pid = activeProjectId;
  const lock = pid ? _projectLocks[pid] : null;
  const lockValid = lock && lock.expiresAt > Date.now();

  if (lockValid) {
    if (lock.userId === currentUserId) {
      el.className = 'lock-indicator locked-me';
      el.title = 'Vous avez le verrou d\'écriture sur ce projet';
    } else {
      el.className = 'lock-indicator locked-other';
      el.title = `Verrou tenu par : ${lock.userDisplayName}`;
    }
    el.innerHTML = _LOCK_SVG_CLOSED;
  } else {
    el.className = 'lock-indicator unlocked';
    el.title = 'Projet libre — aucun verrou actif';
    el.innerHTML = _LOCK_SVG_OPEN;
  }
}

/* Rafraîchit le projet actif depuis Firebase.
   onDone() est appelé une fois le rafraîchissement terminé (succès ou échec). */
function refreshActiveProjectFromFirebase(onDone) {
  if (!_pendingFirebaseUpdate) { if (onDone) onDone(); return; }
  if (typeof window._fbGetPortfolio !== 'function') { if (onDone) onDone(); return; }

  setFbStatus('⏳ Actualisation...', '#f7971e');
  window._fbGetPortfolio(function(val) {
    if (!val || !Array.isArray(val) || !val.length) {
      setFbStatus('⚠ Données vides', '#e17055');
      if (onDone) onDone();
      return;
    }
    _pendingFirebaseUpdate = false;
    portfolio = migrateFirebaseData(val);
    /* Réinitialise le snapshot d'annulation avec les données fraîches.
       NE PAS appeler switchToProject() ici : cela déclencherait _saveBackToPortfolio()
       qui écraserait le portfolio fraîchement chargé avec les rows[] en cache. */
    _tasksSnapshot = null;
    _tasksDirty = false;
    renderNavList();
    /* Recharger rows[] depuis le portfolio actualisé, puis re-rendre le gantt */
    if (typeof _loadSelectedProjects === 'function') _loadSelectedProjects();
    if (typeof renderAll === 'function') renderAll();
    setFbStatus('☁ Actualisé', '#2e7d32');
    if (typeof _updateSaveBtn === 'function') _updateSaveBtn();
    _updateRefreshBtn();
    if (onDone) onDone();
  });
}

/* Démarre l'écoute des verrous depuis Firebase (appelé au chargement). */
function _startLocksListener() {
  if (typeof window._fbOnLocks !== 'function') return;
  window._fbOnLocks(function(locks) {
    _projectLocks = locks || {};
    _updateRefreshBtn();
  });
}
