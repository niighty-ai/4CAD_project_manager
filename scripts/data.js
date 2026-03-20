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
    if(depth===0){
      const pMin=new Date(Math.min(...taskList.map(r=>r.debut.getTime())));
      const pMax=new Date(Math.max(...taskList.map(r=>r.fin.getTime())));
      const pCharge=taskList.reduce((s,r)=>s+(r.charge||0),0);
      sorted.push({_type:'projet',projet,niveaux:[],tache:null,debut:pMin,fin:pMax,charge:pCharge});
    }
    const noMore=taskList.filter(r=>!r.niveaux[depth]);
    const withMore=taskList.filter(r=>r.niveaux[depth]);
    const groupNames=[...new Set(withMore.map(r=>r.niveaux[depth]))];
    const groupMeta=groupNames.map(g=>{
      const gT=withMore.filter(r=>r.niveaux[depth]===g);
      const gMin=new Date(Math.min(...gT.map(r=>r.debut.getTime())));
      const gMax=new Date(Math.max(...gT.map(r=>r.fin.getTime())));
      const gCharge=gT.reduce((s,r)=>s+(r.charge||0),0);
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
function clearAll(){if(!rows.length||confirm('Tout effacer ?')){rows=[];projectColors={};collapsed={};editingIdx=null;document.getElementById('addForm').style.display='none';renderAll();}}
function savePortfolio(){
  const data = portfolio.map(p=>({
    id:p.id, name:p.name, client:p.client||'',
    rows: p.rows
      .filter(r=>r._type!=='jalon') 
      .map(r=>{const{_sourceProjectId,...rest}=r;return{...rest, debut:r.debut?r.debut.toISOString():null, fin:r.fin?r.fin.toISOString():null};}),
    jalons: (p.jalons||[]).map(j=>{const{_sourceProjectId,...rest}=j;return{...rest, date:j.date?j.date.toISOString():null};}),
    projectColors: p.projectColors||{},
    collapsed: p.collapsed||{}
  }));
  scheduleFirebaseSave(data);
}
function loadPortfolio(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return false;
    const data = JSON.parse(raw);
    portfolio = data.map(p=>({
      ...p,
      client: p.client||'',
      rows: (p.rows||[]).filter(r=>r._type!=='jalon').map(r=>({...r, debut:r.debut?new Date(r.debut):null, fin:r.fin?new Date(r.fin):null})),
      jalons: (p.jalons||[]).map(j=>({...j, date:j.date?new Date(j.date):null}))
    }));
    return portfolio.length > 0;
  }catch(e){ return false; }
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
function createNewProject(name, initialRows, initialColors, client){
  const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  const proj = {
    id,
    name: name || 'Nouveau projet ' + (portfolio.length+1),
    client: client || '',
    rows: initialRows || [],
    projectColors: initialColors || {},
    collapsed: {}
  };
  portfolio.push(proj);
  savePortfolio();
  renderNavList();
  switchToProject(id);
}
function switchToProject(id){
  saveActiveProject();
  activeProjectId = id;
  /* En mode multi-vue, on ajoute/garde la sélection */
  if(multiViewMode){
    selectedProjectIds.add(id);
    loadMultiProjectView();
  } else {
    selectedProjectIds.clear();
    selectedProjectIds.add(id);
    const proj = portfolio.find(p=>p.id===id);
    if(!proj) return;
    rows = [
      ...proj.rows.filter(r=>r._type==='tache').map(r=>({...r, _sourceProjectId:id})),
      ...(proj.jalons||[]).map(r=>({...r, _sourceProjectId:id}))
    ];
    projectColors = {...proj.projectColors};
    collapsed = {...proj.collapsed};
    sortRows();
    document.getElementById('activeProjectName').textContent = proj.name;
  }
  renderNavList();
  renderAll();
}
function saveActiveProject(){
  if(!activeProjectId) return;
  const proj = portfolio.find(p=>p.id===activeProjectId);
  if(!proj) return;
  if(multiViewMode){
    /* En multi-vue, ne sauvegarder que les rows qui appartiennent à ce projet */
    const projRows = rows.filter(r=>r._sourceProjectId===activeProjectId);
    proj.rows   = projRows.filter(r=>r._type==='tache').map(r=>{const {_sourceProjectId,...rest}=r;return rest;});
    proj.jalons = projRows.filter(r=>r._type==='jalon').map(r=>{const {_sourceProjectId,...rest}=r;return rest;});
  } else {
    proj.rows   = rows.filter(r=>r._type==='tache').map(r=>{const {_sourceProjectId,...rest}=r;return rest;});
    proj.jalons = rows.filter(r=>r._type==='jalon').map(r=>{const {_sourceProjectId,...rest}=r;return rest;});
  }
  proj.projectColors={...projectColors};
  proj.collapsed={...collapsed};
  savePortfolio();
}
function loadMultiProjectView(){
  /* Sauvegarder d'abord le projet actif */
  if(activeProjectId && !multiViewMode){
    saveActiveProject();
  }
  multiViewMode = true;
  rows = [];
  projectColors = {};
  collapsed = {};
  selectedProjectIds.forEach(pid=>{
    const proj = portfolio.find(p=>p.id===pid);
    if(!proj) return;
    const taches = proj.rows.filter(r=>r._type==='tache').map(r=>({...r, _sourceProjectId:pid}));
    const jalons = (proj.jalons||[]).map(r=>({...r, _sourceProjectId:pid}));
    rows.push(...taches, ...jalons);
    Object.assign(projectColors, proj.projectColors||{});
    Object.assign(collapsed, proj.collapsed||{});
  });
  sortRows();
  /* Mise à jour du header */
  const names = [...selectedProjectIds].map(id=>portfolio.find(p=>p.id===id)?.name).filter(Boolean);
  const clientName = portfolio.find(p=>p.id===activeProjectId)?.client || '';
  if(names.length > 1){
    document.getElementById('activeProjectName').textContent = 
      (clientName ? clientName + ' — ' : '') + names.length + ' projets';
  } else if(names.length === 1){
    document.getElementById('activeProjectName').textContent = names[0];
  }
}
function exitMultiView(){
  multiViewMode = false;
  if(activeProjectId){
    selectedProjectIds.clear();
    switchToProject(activeProjectId);
  }
}
function toggleProjectSelection(id, e){
  if(e) e.stopPropagation();
  if(selectedProjectIds.has(id)){
    selectedProjectIds.delete(id);
    /* Si on décoche le projet actif, basculer l'actif vers un autre sélectionné */
    if(activeProjectId === id && selectedProjectIds.size > 0){
      activeProjectId = [...selectedProjectIds][0];
    }
  } else {
    selectedProjectIds.add(id);
  }
  /* Passer en multi-vue si > 1 sélectionné, sinon mode simple */
  if(selectedProjectIds.size > 1){
    if(!multiViewMode) saveActiveProject();
    multiViewMode = true;
    loadMultiProjectView();
  } else if(selectedProjectIds.size === 1){
    multiViewMode = false;
    const singleId = [...selectedProjectIds][0];
    activeProjectId = singleId;
    switchToProject(singleId);
    return;
  } else {
    /* Rien de sélectionné */
    multiViewMode = false;
    rows = []; projectColors = {}; collapsed = {};
    document.getElementById('activeProjectName').textContent = '—';
  }
  renderNavList();
  renderAll();
}
function selectAllClientProjects(clientName, e){
  if(e) e.stopPropagation();
  const clientProjs = portfolio.filter(p=>(p.client||'')===clientName);
  const allSelected = clientProjs.every(p=>selectedProjectIds.has(p.id));
  if(allSelected){
    /* Tout décocher → revenir au projet actif seul */
    clientProjs.forEach(p=>selectedProjectIds.delete(p.id));
    if(selectedProjectIds.size === 0 && activeProjectId){
      selectedProjectIds.add(activeProjectId);
    }
    if(selectedProjectIds.size <= 1){
      exitMultiView();
      return;
    }
    loadMultiProjectView();
  } else {
    /* Tout cocher */
    if(!multiViewMode) saveActiveProject();
    clientProjs.forEach(p=>selectedProjectIds.add(p.id));
    if(!activeProjectId) activeProjectId = clientProjs[0]?.id;
    multiViewMode = true;
    loadMultiProjectView();
  }
  renderNavList();
  renderAll();
}
function deleteProject(id, e){
  e.stopPropagation();
  const proj = portfolio.find(p=>p.id===id);
  if(!proj) return;
  if(!confirm(`Supprimer le projet "${proj.name}" ?`)) return;
  portfolio = portfolio.filter(p=>p.id!==id);
  selectedProjectIds.delete(id);
  savePortfolio();
  if(activeProjectId===id){
    activeProjectId = null;
    if(multiViewMode && selectedProjectIds.size > 0){
      activeProjectId = [...selectedProjectIds][0];
      loadMultiProjectView();
    } else {
      multiViewMode = false;
      rows=[]; projectColors={}; collapsed={};
      document.getElementById('activeProjectName').textContent = '—';
      if(portfolio.length>0) switchToProject(portfolio[0].id);
      else renderAll();
    }
  } else if(multiViewMode){
    loadMultiProjectView();
    renderAll();
  }
  renderNavList();
}
function duplicateProject(id, e){
  e.stopPropagation();
  const proj = portfolio.find(p=>p.id===id);
  if(!proj) return;
  if(activeProjectId===id){
    proj.rows=[...rows]; proj.projectColors={...projectColors}; proj.collapsed={...collapsed};
  }
  const newId = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  const copy = {
    id: newId,
    name: proj.name + ' (copie)',
    rows: proj.rows.map(r=>({...r})),
    projectColors: {...proj.projectColors},
    collapsed: {...proj.collapsed}
  };
  portfolio.push(copy);
  savePortfolio();
  renderNavList();
  switchToProject(newId);
}
function saveCurrentProject(){
  if(!activeProjectId) return;
  if(multiViewMode){
    /* En multi-vue, sauvegarder tous les projets sélectionnés */
    selectedProjectIds.forEach(pid=>{
      const proj = portfolio.find(p=>p.id===pid);
      if(!proj) return;
      const projRows = rows.filter(r=>r._sourceProjectId===pid);
      proj.rows   = projRows.filter(r=>r._type==='tache').map(r=>{const{_sourceProjectId,...rest}=r;return rest;});
      proj.jalons = projRows.filter(r=>r._type==='jalon').map(r=>{const{_sourceProjectId,...rest}=r;return rest;});
      proj.projectColors = proj.projectColors||{};
      /* Récupérer les couleurs des sous-projets du projetColors global */
      const projNames = [...new Set(projRows.map(r=>r.projet))];
      projNames.forEach(n=>{ if(projectColors[n]) proj.projectColors[n]=projectColors[n]; });
    });
    savePortfolio();
  } else {
    const proj = portfolio.find(p=>p.id===activeProjectId);
    if(proj){
      proj.rows   = rows.filter(r=>r._type==='tache').map(r=>{const{_sourceProjectId,...rest}=r;return rest;});
      proj.jalons = rows.filter(r=>r._type==='jalon').map(r=>{const{_sourceProjectId,...rest}=r;return rest;});
      proj.projectColors={...projectColors};
      proj.collapsed={...collapsed};
      savePortfolio();
    }
  }
}
function importToNewProject(parsedRows, fileName){
  const name = fileName.replace(/\.[^.]+$/, '').replace(/[_-]/g,' ');
  createNewProject(name, parsedRows, {});
}
function exportHTML(){
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  if(!data.length){ alert('Aucune donnée à sauvegarder.'); return; }
  const source = document.documentElement.outerHTML;
  const dataJson = JSON.stringify(data);
  const oldInit = /\/\/ -- INIT --[\s\S]*?}\)\(\);/;
  const newInit = `
(function(){
  const savedData = ${dataJson};
  portfolio = savedData.map(p=>({
    ...p,
    rows: p.rows.map(r=>({...r,
      debut: r.debut ? new Date(r.debut) : null,
      fin:   r.fin   ? new Date(r.fin)   : null
    }))
  }));
  savePortfolio();
  renderNavList();
  if(portfolio.length) switchToProject(portfolio[0].id);
})();`;
  const newSource = source.replace(oldInit, newInit);
  const blob = new Blob([newSource], {type: 'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const d = new Date();
  a.download = `gantt_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.html`;
  a.click();
  URL.revokeObjectURL(url);
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
  return data.map(p=>({
    ...p, client: p.client||'',
    projectColors: p.projectColors||{},
    collapsed: p.collapsed||{},
    jalons: (p.jalons||[
      ...(p.rows||[]).filter(r=>r._type==='jalon')
    ]).map(j=>({
      _type:'jalon', nom:j.nom||'', projet:j.projet||'',
      date: j.date ? new Date(j.date) : null, couleur:j.couleur||null
    })),
    rows: (p.rows||[]).filter(r=>r._type!=='jalon').map(r=>{
      const niveaux = r.niveaux ? r.niveaux : (r.groupe ? [r.groupe] : []);
      return {
        _type:  r._type  || 'tache',
        projet: r.projet || '',
        niveaux,
        tache:  r.tache  || null,
        debut:  r.debut  ? new Date(r.debut) : null,
        fin:    r.fin    ? new Date(r.fin)   : null,
        charge: r.charge != null ? r.charge : null
      };
    })
  }));
}
function downloadModele(){
  /* Génère dynamiquement le modèle Excel d'import avec SheetJS */
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
  /* Largeurs de colonnes */
  ws['!cols'] = [
    {wch:8},{wch:16},{wch:16},{wch:14},{wch:14},{wch:30},{wch:12},{wch:12},{wch:10}
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modèle');
  /* Feuille d'aide */
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
