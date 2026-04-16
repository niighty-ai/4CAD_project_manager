/* ═══════════════════════════════════════════════════════════════
   gantt-tips.js — Tooltips et popups d'affichage du Gantt
   (tâche, jalon, charge ressource, détection survol)
   ═══════════════════════════════════════════════════════════════ */

const tip=document.getElementById('tooltip');
function showTip(e,projet,groupe,tache,debut,fin,charge,isPlanned){
  const c=getColor(projet);
  const chargeStyle = isPlanned ? ' style="color:#22c55e;font-style:italic"' : '';
  const chargeLabel = isPlanned ? `${charge}j ✎` : `${charge}j`;
  tip.innerHTML=`<strong style="color:${c}">${escH(projet)}</strong>
    ${groupe?`<div style="color:${lighten(c,20)};font-size:10px;margin-bottom:2px">◆ ${escH(groupe)}</div>`:''}
    ${tache?`<div style="margin-bottom:3px;font-size:11px">${escH(tache)}</div>`:''}
    <div class="tip-row"><span>Début</span><span class="tip-val">${debut}</span></div>
    <div class="tip-row"><span>Fin</span><span class="tip-val">${fin}</span></div>
    ${charge!==null&&charge!=='null'?`<div class="tip-row"><span>Charge</span><span class="tip-val"${chargeStyle}>${chargeLabel}</span></div>`:''}
    ${isPlanned?'<div style="font-size:9px;color:#22c55e;margin-top:3px">✎ Planifié</div>':''}`;
  tip.style.display='block';moveTip(e);
}
function moveTip(e){tip.style.left=(e.clientX+12)+'px';tip.style.top=(e.clientY-9)+'px';}
function hideTip(){tip.style.display='none';}

/* ── Popup charge ressource sur cellule journalière ── */
let _rcpHideTimer=null;
function _ensureResChargePop(){
  let pop=document.getElementById('resChargePop');
  if(!pop){
    pop=document.createElement('div');
    pop.id='resChargePop';
    pop.className='res-charge-pop';
    pop.style.display='none';
    pop.addEventListener('mouseenter',()=>clearTimeout(_rcpHideTimer));
    pop.addEventListener('mouseleave',hideResChargeTip);
    document.body.appendChild(pop);
  }
  return pop;
}
function showResChargeTip(e,resourceId,dateKey,resourceNom){
  if(_ganttDragging){hideResChargeTip();return;}
  clearTimeout(_rcpHideTimer);
  const pop=_ensureResChargePop();

  /* ── Données GHO sauvegardées (base ferme) ── */
  const gho=(typeof getTasksForResourceDay==='function')
    ?getTasksForResourceDay(resourceId,dateKey):{total:0,tasks:[]};

  /* ── Écarts planifiés : tous les projets si le mode planifié global est actif ──
     Pour chaque tâche : si assignment ≠ GHO (ou _source:'planned') → écart à afficher en vert */
  const _tipRes=(typeof resources!=='undefined')?resources.find(x=>x.id===resourceId):null;
  const _tipPlannedProjs=(typeof usePlanned!=='undefined'&&usePlanned&&typeof portfolio!=='undefined')
    ?portfolio:[];
  /* Carte "projet::tache" → {charge, projet, tache} pour les écarts */
  const _ecartMap={};
  _tipPlannedProjs.forEach(proj=>{
    (proj.rows||[]).forEach(row=>{
      if(row._type!=='tache')return;
      const asgn=(row.assignments||[]).find(a=>a.resourceId===resourceId);
      if(!asgn)return;
      const c=(asgn.daily&&asgn.daily[dateKey])||0;
      if(c<=0)return;
      /* Valeur GHO de référence pour cette tâche */
      let ghoTask=0;
      if(_tipRes&&_tipRes.ghoData?.projects){
        const gp=_tipRes.ghoData.projects.find(p=>p.name===row.projet);
        if(gp){
          const gt=(gp.tasks||[]).find(t=>
            (row.externalTaskId&&t.taskId===row.externalTaskId)||t.taskName===(row.tache||''));
          ghoTask=(gt?.daily&&gt.daily[dateKey])||0;
        }
      }
      /* Écart = différent du GHO OU tâche explicitement planifiée */
      if(row._source==='planned'||Math.abs(c-ghoTask)>1e-9)
        _ecartMap[`${row.projet}::${row.tache||''}`]={charge:c,projet:row.projet,tache:row.tache||'—'};
    });
  });

  /* ── Éditions en cours (non sauvegardées) pour cette ressource + ce jour ── */
  const pending={};   // ri → {charge, projet, tache}
  if(typeof _ganttEdits!=='undefined'){
    Object.entries(_ganttEdits).forEach(([ek,charge])=>{
      const f=ek.indexOf('::'),l=ek.lastIndexOf('::');
      const ri=parseInt(ek.slice(0,f));
      const rsid=ek.slice(f+2,l);
      const dk=ek.slice(l+2);
      if(rsid!==resourceId||dk!==dateKey) return;
      const row=(typeof rows!=='undefined')&&rows[ri];
      if(!row) return;
      pending[ri]={charge,projet:row.projet||'—',tache:row.tache||'—'};
    });
  }
  const hasPending=Object.keys(pending).length>0;

  /* ── Fusion : GHO base + écarts planifiés + éditions en cours ──
     1. Partir du GHO complet (toutes les tâches firm)
     2. Remplacer/ajouter les tâches en écart (vert)
     3. Appliquer les éditions non sauvegardées (priorité max) */
  const usedRi=new Set();
  const merged=gho.tasks.map(t=>{
    const key=`${t.projet}::${t.tache}`;
    /* Priorité 1 : édition en cours */
    const riKey=Object.keys(pending).find(k=>pending[k].projet===t.projet&&pending[k].tache===t.tache);
    if(riKey!==undefined){usedRi.add(riKey);return{...t,charge:pending[riKey].charge,edited:true};}
    /* Priorité 2 : écart planifié */
    if(_ecartMap[key])return{...t,charge:_ecartMap[key].charge,isPlanned:true,edited:false};
    return{...t,edited:false};
  });
  /* Tâches planifiées sans entrée GHO (projets _appCreated ou tâches ajoutées dans l'appli) */
  Object.entries(_ecartMap).forEach(([key,v])=>{
    if(gho.tasks.find(t=>`${t.projet}::${t.tache}`===key))return; // déjà dans merged
    const riKey=Object.keys(pending).find(k=>pending[k].projet===v.projet&&pending[k].tache===v.tache);
    if(riKey!==undefined){usedRi.add(riKey);merged.push({projet:v.projet,tache:v.tache,charge:pending[riKey].charge,edited:true});}
    else merged.push({projet:v.projet,tache:v.tache,charge:v.charge,isPlanned:true,edited:false});
  });
  /* Nouvelles lignes uniquement dans _ganttEdits (inconnues du GHO et du planifié) */
  Object.entries(pending).forEach(([ri,ed])=>{
    if(!usedRi.has(ri)&&ed.charge>0)
      merged.push({projet:ed.projet,tache:ed.tache,charge:ed.charge,edited:true});
  });

  /* ── Recalcul total avec éditions ── */
  const total=Math.round(merged.reduce((s,t)=>s+(t.charge||0),0)*10000)/10000;
  const libre=Math.max(0,Math.round((1-total)*10000)/10000);

  const fv=v=>{const r=Math.round(v*10000)/10000;return(r%1===0?r.toFixed(0):r.toFixed(4).replace(/\.?0+$/,''))+'j';};
  const fh=v=>{const h=Math.round(v*8*100)/100;return'('+(h%1===0?h.toFixed(0):h.toFixed(2).replace(/\.?0+$/,''))+'h)';};
  const libre_val=libre;
  const [dd,mm,yyyy]=dateKey.split('/');

  const hasPlannedItems = merged.some(t => t.isPlanned);
  const rowsHtml=merged.map(t=>`<tr${t.edited?' class="rcp-pending"':t.isPlanned?' class="rcp-planned"':''}>
    <td class="rcp-proj" title="${escH(t.projet)}">${escH(t.projet)}</td>
    <td class="rcp-task" title="${escH(t.tache)}">${escH(t.tache)}</td>
    <td class="rcp-charge">${fv(t.charge)}&thinsp;<span class="rcp-h">${fh(t.charge)}</span></td>
  </tr>`).join('');

  pop.innerHTML=`
    <div class="rcp-header-res">${escH(resourceNom||resourceId)}${hasPending?'<span class="rcp-pending-badge" title="Modifications non sauvegardées">✎</span>':''}</div>
    <div class="rcp-date">${dd}/${mm}/${yyyy}</div>
    <div class="rcp-summary${total>1?' rcp-over':''}${hasPending?' rcp-has-pending':''}">
      <span>Total&nbsp;<strong>${fv(total)}</strong>&thinsp;<span class="rcp-h">${fh(total)}</span></span>
      <span class="rcp-libre">Libre&nbsp;<strong>${fv(libre_val)}</strong>&thinsp;<span class="rcp-h">${fh(libre_val)}</span></span>
    </div>
    ${hasPending?'<div class="rcp-pending-hint">✎ Modifications non sauvegardées</div>':''}
    ${hasPlannedItems?'<div class="rcp-planned-hint">✎ Charges planifiées</div>':''}
    ${merged.length?`<div class="rcp-scroll"><table class="rcp-table">
      <thead><tr><th>Projet</th><th>Tâche</th><th>Charge</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table></div>`:'<div class="rcp-empty">Aucune tâche</div>'}`;
  /* Positionnement : au-dessus ou en dessous de la ligne de la cellule
     (jamais au niveau du curseur pour ne pas gêner le glissement horizontal) */
  pop.style.visibility='hidden';
  pop.style.display='block';
  const pw=pop.offsetWidth,ph=pop.offsetHeight,vw=window.innerWidth,vh=window.innerHeight;
  const cellRect=(e.currentTarget||e.target).getBoundingClientRect();
  /* Préférence : au-dessus de la ligne */
  let top=cellRect.top-ph-6;
  if(top<8) top=cellRect.bottom+6;          // pas assez de place en haut → en dessous
  if(top+ph>vh-8) top=Math.max(8,vh-ph-8); // déborde en bas → recaler
  /* Centré horizontalement sur le curseur, contraint à l'écran */
  let left=e.clientX-pw/2;
  if(left+pw>vw-8) left=vw-pw-8;
  if(left<8) left=8;
  pop.style.left=left+'px';
  pop.style.top=top+'px';
  pop.style.visibility='';
}
function hideResChargeTip(){
  clearTimeout(_rcpHideTimer);
  const pop=document.getElementById('resChargePop');
  if(pop)pop.style.display='none';
}
function _hideResChargeTipDelay(){_rcpHideTimer=setTimeout(hideResChargeTip,160);}

/* Calcule le jour survolé depuis la position souris et affiche la popup */
function ganttRowHoverMove(e,el){
  if(_ganttDragging){hideResChargeTip();return;}
  const gr=document.getElementById('ganttRight');
  if(!gr||!_ganttChartMinD) return;
  const grRect=gr.getBoundingClientRect();
  const xInChart=e.clientX-grRect.left+gr.scrollLeft;
  const dayIdx=Math.floor(xInChart/dayWidth);
  if(dayIdx<0) return;
  const d=new Date(_ganttChartMinD);
  d.setDate(d.getDate()+dayIdx);
  const dk=String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
  showResChargeTip(e,el.dataset.rsid,dk,el.dataset.rsnm);
}

function showTipJalon(e,nom,date){
  tip.innerHTML=`<strong>◆ ${escH(nom)}</strong><br>${date}`;
  tip.style.display='block';
  moveTip(e);
}
