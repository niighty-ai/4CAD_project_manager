/**
 * sort.js
 * Row sorting and collapse/visibility logic.
 * Depends on: state.js (rows, collapsed), utils.js (diff)
 *
 * sortRows() rebuilds `rows` with:
 *   1. Migration from old string-group format to niveaux array
 *   2. Synthetic projet/groupe rows calculated from tasks
 *   3. Chronological sort at every level
 *   4. Jalons intercalated inside their projet block by date
 */

// ====== COLLAPSE ======
function toggleCollapse(key){collapsed[key]=!collapsed[key];renderGantt();}
function collapseKey(projet,niveaux){
  if(!niveaux||!niveaux.length) return 'P:'+projet;
  return 'G:'+projet+'|'+niveaux.join('|');
}
function isVisible(r){
  if(r._type==='jalon') return true;
  if(r._type==='projet') return true;
  // Si le projet est réduit, cacher tout sauf le projet lui-même
  if(collapsed[collapseKey(r.projet,[])]) return false;
  const niv=r.niveaux||[];
  if(r._type==='groupe'){
    // Un groupe est visible si aucun de ses ANCÊTRES n'est réduit
    // (sa propre clé niv.slice(0, niv.length) = lui-même → ne pas vérifier)
    for(let i=1;i<niv.length;i++){
      if(collapsed[collapseKey(r.projet,niv.slice(0,i))]) return false;
    }
    return true;
  }
  if(r._type==='tache'){
    // Une tâche est cachée si elle-même ou un de ses ancêtres groupes est réduit
    for(let i=1;i<=niv.length;i++){
      if(collapsed[collapseKey(r.projet,niv.slice(0,i))]) return false;
    }
    return true;
  }
  return true;
}

// ====== SORT ======
function sortRows(){
  // Migration: convertir ancien format groupe->string vers niveaux->array
  rows.forEach(r=>{
    if(r._type==='tache' && r.groupe !== undefined && !r.niveaux){
      r.niveaux = r.groupe ? [r.groupe] : [];
      delete r.groupe;
    }
    if(r._type==='tache' && !r.niveaux) r.niveaux=[];
  });

  // Conserver les jalons séparément — ils ne participent pas au tri des tâches
  const jalons=rows.filter(r=>r._type==='jalon');
  const tasks=rows.filter(r=>r._type==='tache');
  const sorted=[];

  // Tri récursif par niveaux
  function sortLevel(taskList, projet, niveauxPath, depth){
    if(depth===0){
      // Niveau projet
      const pMin=new Date(Math.min(...taskList.map(r=>r.debut.getTime())));
      const pMax=new Date(Math.max(...taskList.map(r=>r.fin.getTime())));
      const pCharge=taskList.reduce((s,r)=>s+(r.charge||0),0);
      sorted.push({_type:'projet',projet,niveaux:[],tache:null,debut:pMin,fin:pMax,charge:pCharge});
    }
    // Tâches directes à ce niveau (sans sous-niveau)
    const noMore=taskList.filter(r=>!r.niveaux[depth]);
    const withMore=taskList.filter(r=>r.niveaux[depth]);

    // Groupes : calculer leur date min pour le tri
    const groupNames=[...new Set(withMore.map(r=>r.niveaux[depth]))];
    const groupMeta=groupNames.map(g=>{
      const gT=withMore.filter(r=>r.niveaux[depth]===g);
      const gMin=new Date(Math.min(...gT.map(r=>r.debut.getTime())));
      const gMax=new Date(Math.max(...gT.map(r=>r.fin.getTime())));
      const gCharge=gT.reduce((s,r)=>s+(r.charge||0),0);
      return {g, gT, gMin, gMax, gCharge};
    });

    // Construire une liste mixte [tâches directes + en-têtes de groupes] triée par date
    const items=[
      ...noMore.map(r=>({type:'tache', date:r.debut, r})),
      ...groupMeta.map(m=>({type:'groupe', date:m.gMin, m}))
    ].sort((a,b)=>a.date-b.date);

    // Émettre dans l'ordre
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

  // Intercaler les jalons DANS leur projet, triés par date
  const final=[];
  // Regrouper sorted par blocs de projet
  let i=0;
  while(i < sorted.length){
    const r = sorted[i];
    if(r._type === 'projet'){
      const projet = r.projet;
      // Collecter toutes les lignes de ce projet
      const bloc = [];
      while(i < sorted.length && (sorted[i]._type==='projet' ? sorted[i].projet===projet : sorted[i].projet===projet)){
        bloc.push(sorted[i++]);
      }
      // Jalons de ce projet triés par date
      const jProjet = jalons
        .filter(j=>j.projet===projet)
        .sort((a,b)=>(a.date||0)-(b.date||0));
      // Intercaler les jalons dans le bloc par date
      let ji=0;
      for(const row of bloc){
        const lineDate = row.debut || null;
        while(ji < jProjet.length && lineDate && jProjet[ji].date <= lineDate){
          final.push(jProjet[ji++]);
        }
        final.push(row);
      }
      // Jalons restants du projet (après toutes ses tâches)
      while(ji < jProjet.length) final.push(jProjet[ji++]);
    } else {
      final.push(sorted[i++]);
    }
  }
  // Jalons sans projet correspondant → à la fin
  const projetsExistants = new Set(tasks.map(r=>r.projet));
  jalons.filter(j=>!projetsExistants.has(j.projet))
        .sort((a,b)=>(a.date||0)-(b.date||0))
        .forEach(j=>final.push(j));

  rows=final;
}