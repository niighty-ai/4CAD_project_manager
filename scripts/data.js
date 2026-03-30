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
  });
  const jalons=rows.filter(r=>r._type==='jalon');
  const tasks=rows.filter(r=>r._type==='tache');
  const sorted=[];
  function sortLevel(taskList, projet, niveauxPath, depth){
    if(depth===0 && multiViewMode){
      /* En vue multi-projet : ligne séparateur avec le nom du projet */
      const pMin=new Date(Math.min(...taskList.map(r=>r.debut.getTime())));
      const pMax=new Date(Math.max(...taskList.map(r=>r.fin.getTime())));
      const pCharge=roundCharge(taskList.reduce((s,r)=>s+(r.charge||0),0));
      sorted.push({_type:'projet',projet,niveaux:[],tache:null,debut:pMin,fin:pMax,charge:pCharge});
    }
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
  const projOrder=[...new Set(tasks.map(r=>r.projet))].sort((a,b)=>{
    return Math.min(...tasks.filter(r=>r.projet===a).map(r=>r.debut.getTime()))
          -Math.min(...tasks.filter(r=>r.projet===b).map(r=>r.debut.getTime()));
  });
  projOrder.forEach(p=>{
    sortLevel(tasks.filter(r=>r.projet===p), p, [], 0);
  });
  const final=[];
  let i=0;
  while(i < sorted.length){
    const r = sorted[i];
    if(r._type === 'projet'){
      const projet = r.projet;
      const bloc = [];
      while(i < sorted.length && (sorted[i]._type==='projet' ? sorted[i].projet===projet : sorted[i].projet===projet)){
        bloc.push(sorted[i++]);
      }
      const jProjet = jalons
        .filter(j=>j.projet===projet)
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
    } else {
      final.push(sorted[i++]);
    }
  }
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
      .map(r=>{const{_srcPid,...rest}=r;return{...rest,
        debut:r.debut?r.debut.toISOString():null,
        fin:r.fin?r.fin.toISOString():null
      };}),
    jalons: (p.jalons||[]).map(j=>{const{_srcPid,...rest}=j;return{...rest,
      date:j.date?j.date.toISOString():null
    };}),
    projectColors: p.projectColors||{},
    collapsed: p.collapsed||{}
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
  /* ── 2. Sauvegarde différée sur Firebase ── */
  scheduleFirebaseSave(_serializePortfolio(portfolio));
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
    rows: (p.rows||[]).filter(r=>r._type!=='jalon').map(r=>({
      ...r,
      debut: r.debut ? new Date(r.debut) : null,
      fin:   r.fin   ? new Date(r.fin)   : null
    })),
    jalons: (p.jalons||[]).map(j=>({
      ...j,
      date: j.date ? new Date(j.date) : null
    }))
  }));
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
    collapsed: {}
  };
  portfolio.push(proj);
  savePortfolio();
  renderNavList();
  switchToProject(id);
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

  /* 3. Mettre à jour la sélection */
  activeProjectId = id;
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
  savePortfolio();
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
  _saveBackToPortfolio();
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
  if(obj !== null && typeof obj === 'object'){
    const out = {};
    for(const [k,v] of Object.entries(obj)){
      if(v === undefined) continue;
      if(v === null){ out[k] = null; continue; }
      out[k] = cleanForFirebase(v);
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
      const niveaux = r.niveaux ? r.niveaux : (r.groupe ? [r.groupe] : []);
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
