/* ═══════════════════════════════════════════
   gantt.js — Rendu Gantt, chart, zoom, export
   ═══════════════════════════════════════════ */

function buildGanttLeftWithEdit(visible, showDates, labelW){
  const toggleBtn=(key)=>{
    const open=!collapsed[key];
    return`<span class="toggle-btn" onclick="event.stopPropagation();toggleCollapse('${key}')">${open?'&#9660;':'&#9654;'}</span>`;
  };
  const rows_html=visible.map(r=>{
    const c=getColor(r.projet);
    const datesHtml=`<span class="row-dates${showDates?'':' hidden'}">
      <span>${fmtShort(r.debut)}</span><span class="d-sep">&#8594;</span><span>${fmtShort(r.fin)}</span>
    </span>`;
    const chargeHtml=r.charge!==null?`<span class="row-charge">${fmtCharge(r.charge)}j</span>`:'';
    const realIdx=rows.indexOf(r);
    const clickAttr=`onclick="openEditPanel(${realIdx>=0?realIdx:'null'})"`;
    if(r._type==='projet'){
      const key=collapseKey('projet',r.projet,null);
      return`<div class="gantt-left-row is-projet" ${clickAttr}>
        <span class="toggle-btn" onclick="event.stopPropagation();toggleCollapse('${key}')">${!collapsed[key]?'&#9660;':'&#9654;'}</span>
        <span style="color:${c};font-size:9px;flex-shrink:0">&#9632;</span>
        <span class="row-label" style="color:${c}">${escH(r.projet)}</span>
        ${chargeHtml}${datesHtml}
      </div>`;
    }
    if(r._type==='groupe'){
      const key=collapseKey('groupe',r.projet,r.groupe);
      return`<div class="gantt-left-row is-groupe" ${clickAttr}>
        <span style="width:7px;flex-shrink:0"></span>
        <span class="toggle-btn" onclick="event.stopPropagation();toggleCollapse('${key}')">${!collapsed[key]?'&#9660;':'&#9654;'}</span>
        <span style="color:${lighten(c,22)};font-size:8px;flex-shrink:0">&#9670;</span>
        <span class="row-label" style="color:${lighten(c,18)}">${escH(r.groupe)}</span>
        ${chargeHtml}${datesHtml}
      </div>`;
    }
    const indent=r.groupe?22:13;
    return`<div class="gantt-left-row is-tache" ${clickAttr}>
      <span style="width:${indent}px;flex-shrink:0"></span>
      <span style="color:var(--muted);font-size:8px;flex-shrink:0">&#8618;</span>
      <span class="row-label">${escH(r.tache||'—')}</span>
      ${chargeHtml}${datesHtml}
    </div>`;
  }).join('');
  return`<div class="gantt-left${hasTracking?' has-tracking':''}" id="ganttLeftPanel" style="width:${labelW}px">
    <div class="gantt-left-header">
      <span class="lh-title">Projet / Groupe / Tâche</span>
    </div>
    ${rows_html}
    <div style="display:flex;border-top:1px solid var(--border)">
      <div class="gantt-add-row" onclick="openEditPanel(null)" style="flex:1;border-top:none">
        <span class="add-plus">+</span> Ajouter une tâche
      </div>
      <div class="gantt-add-row" onclick="openJalonPanel()" style="flex:1;border-top:none;border-left:1px solid var(--border)">
        <span class="add-plus" style="color:var(--accent)">◆</span> Jalon
      </div>
    </div>
    <div class="resize-handle" id="resizeHandle"></div>
  </div>`;
}
function setView(v){
  view=v;
  ['jour','semaine','mois'].forEach(n=>{document.getElementById('btn'+n.charAt(0).toUpperCase()+n.slice(1))?.classList.toggle('active',n===v);});
  if(v==='mois'){dayWidth=Math.max(dayWidth,40);document.getElementById('zoomUnit').textContent='px/mois';}
  else document.getElementById('zoomUnit').textContent='px/j';
  if(v==='semaine'&&dayWidth>30)dayWidth=6;
  if(v==='jour'&&dayWidth<14)dayWidth=20;
  document.getElementById('zoomLevel').textContent=dayWidth;
  renderGantt();
}
function changeZoom(d){
  if(view==='mois')dayWidth=Math.min(300,Math.max(20,dayWidth+d*20));
  else if(view==='jour')dayWidth=Math.min(80,Math.max(8,dayWidth+d*4));
  else dayWidth=Math.min(30,Math.max(3,dayWidth+d*2));
  document.getElementById('zoomLevel').textContent=dayWidth;
  renderGantt();
}
function toggleCollapse(key){collapsed[key]=!collapsed[key];renderGantt();}
function toggleResCollapse(key){collapsedRes[key]=!collapsedRes[key];renderGantt();}
function toggleResources(){
  showResources=!showResources;
  const btn=document.getElementById('btnResources');
  if(btn){btn.classList.toggle('active',showResources);btn.title=showResources?'Masquer ressources':'Afficher ressources';}
  renderGantt();
}
function initDrag(el){
  let down=false,startX,sl;
  el.addEventListener('mousedown',e=>{if(e.target.closest('.gantt-bar,.toggle-btn'))return;down=true;startX=e.pageX-el.offsetLeft;sl=el.scrollLeft;el.style.cursor='grabbing';});
  el.addEventListener('mouseleave',()=>{down=false;el.style.cursor='grab';});
  el.addEventListener('mouseup',()=>{down=false;el.style.cursor='grab';});
  el.addEventListener('mousemove',e=>{if(!down)return;e.preventDefault();el.scrollLeft=sl-(e.pageX-el.offsetLeft-startX);});
}
function renderGantt(){
  const layout=document.getElementById('ganttLayout');
  const legend=document.getElementById('legend');
  const allTasks=rows.filter(r=>r._type==='tache');
  if(!allTasks.length){
    const projName = portfolio.find(p=>p.id===activeProjectId)?.name || 'ce projet';
    layout.innerHTML=`<div class="gantt-empty">
      <div class="gantt-empty-icon">📐</div>
      <div class="gantt-empty-title">Aucune tâche pour le moment</div>
      <div class="gantt-empty-desc">Commencez à construire le planning de <strong>${escH(projName)}</strong> en ajoutant votre première tâche.</div>
      <div class="gantt-empty-actions">
        <button class="gantt-empty-btn" onclick="openEditPanel(null)">
          <span class="gantt-empty-btn-icon">+</span> Créer une tâche
        </button>
        <button class="gantt-empty-btn secondary" onclick="openJalonPanel()">
          <span class="gantt-empty-btn-icon">◆</span> Ajouter un jalon
        </button>
      </div>
      <div class="gantt-empty-hint">ou importez un fichier Excel via le bouton <strong>📂 Importer</strong> dans la barre d'outils</div>
    </div>`;
    legend.innerHTML='';return;
  }
  const visible=rows.filter(r=>isVisible(r));
  let minD=allTasks.reduce((m,r)=>r.debut<m?r.debut:m,allTasks[0].debut);
  let maxD=allTasks.reduce((m,r)=>r.fin>m?r.fin:m,allTasks[0].fin);
  rows.filter(r=>r._type==='jalon'&&r.date).forEach(j=>{
    if(j.date<minD) minD=new Date(j.date);
    if(j.date>maxD) maxD=new Date(j.date);
  });
  const today=new Date();today.setHours(0,0,0,0);

  /* ── Détermine si des données de suivi existent (3 colonnes) ── */
  const hasTracking = visible.some(r => r._type==='tache' &&
    (r.chargePassee != null || r.chargeRestante != null || (r.assignments && r.assignments.length)));

  /* ── Nombre de lignes ressources visibles par tâche (pour alignement côté droit) ── */
  function resRowCount(r) {
    if (!showResources) return 0;
    if (r._type !== 'tache') return 0;
    const asgns = r.assignments;
    if (!asgns || !asgns.length) return 0;
    const resKey = collapseResKey(rows.indexOf(r));
    return collapsedRes[resKey] ? 0 : asgns.length;
  }

  /* ── Cellule charge : valeur ou tiret, largeur fixe ── */
  function chCell(val, cls) {
    const v = val != null ? fmtCharge(val)+'j' : '—';
    const empty = val == null ? ' ch-empty' : '';
    return `<span class="ch-col ${cls}${empty}">${v}</span>`;
  }

  /* ── Colonnes charge sur une ligne (tâche, groupe, projet) ── */
  function chargeCols(r) {
    if (!hasTracking) {
      return r.charge != null ? `<span class="ch-col ch-prev">${fmtCharge(r.charge)}j</span>` : `<span class="ch-col ch-prev ch-empty">—</span>`;
    }
    return chCell(r.charge, 'ch-prev') +
           chCell(r.chargePassee, 'ch-pass') +
           chCell(r.chargeRestante, 'ch-rest');
  }

  /* ── Colonnes charge sur une ligne ressource ── */
  function chargeColsRes(a) {
    if (!hasTracking) {
      return chCell(a.charge, 'ch-prev') +
             '<span class="ch-col ch-dates ch-dates-empty"></span>';
    }
    return chCell(a.charge, 'ch-prev') +
           chCell(a.chargePassee, 'ch-pass') +
           chCell(a.chargeRestante, 'ch-rest') +
           '<span class="ch-col ch-dates ch-dates-empty"></span>';
  }

  /* ── Lignes détail ressources (panneau gauche) ── */
  function resDetailRows(r, realIdx, indent) {
    if (!showResources) return '';
    const asgns = r.assignments;
    if (!asgns || !asgns.length) return '';
    const resKey = collapseResKey(realIdx);
    if (collapsedRes[resKey]) return '';
    return asgns.map((a,ai) => {
      const dRes = a.debut instanceof Date ? a.debut : (a.debut ? new Date(a.debut) : null);
      const fRes = a.fin   instanceof Date ? a.fin   : (a.fin   ? new Date(a.fin)   : null);
      const datesTxt = (dRes && fRes)
        ? `<span class="ch-col ch-dates" style="font-size:9px">${fmtShort(dRes)}<span class="d-sep">→</span>${fmtShort(fRes)}</span>`
        : `<span class="ch-col ch-dates ch-dates-empty"></span>`;
      return `<div class="gantt-left-row is-res-detail" onclick="event.stopPropagation();openAffectPanel(${realIdx})" style="cursor:pointer" title="Cliquer pour gérer les affectations">
        <span class="row-label-cell" style="padding-left:${indent+20}px">
          <span class="rd-icon">👤</span>
          <span class="rd-name">${escH(a.resourceNom||'?')}</span>
        </span>
        <span class="ch-col ch-slot"></span>
        ${!hasTracking
          ? chCell(a.charge,'ch-prev') + datesTxt
          : chCell(a.charge,'ch-prev') + chCell(a.chargePassee,'ch-pass') + chCell(a.chargeRestante,'ch-rest') + datesTxt
        }
      </div>`;
    }).join('');
  }

  /* ── Bouton affectation sur chaque tâche ── */
  function affectBtn(r, realIdx) {
    const count = (r.assignments||[]).length;
    const hasRes = count > 0;
    const label = hasRes ? count : '+';
    const title = hasRes ? `${count} ressource(s) — cliquer pour gérer` : 'Affecter des ressources';
    return `<button class="affect-btn${hasRes?' has-res':''}" title="${title}"
      onclick="event.stopPropagation();openAffectPanel(${realIdx})">${label}👤</button>`;
  }

  /* ── En-têtes colonnes ── */
  function headerCols() {
    if (!hasTracking) return `<span class="ch-col ch-hdr ch-slot"></span><span class="ch-col ch-hdr ch-prev">Prév.</span><span class="ch-col ch-dates ch-hdr">Début → Fin</span>`;
    return `<span class="ch-col ch-hdr ch-slot"></span><span class="ch-col ch-hdr ch-prev">Prév.</span><span class="ch-col ch-hdr ch-pass">Pass.</span><span class="ch-col ch-hdr ch-rest">Rest.</span><span class="ch-col ch-dates ch-hdr">Début → Fin</span>`;
  }

  /* ── Colonne dates ── */
  function datecol(r) {
    if (r._type === 'jalon') return `<span class="ch-col ch-dates">${fmtShort(r.date)}</span>`;
    return `<span class="ch-col ch-dates">${fmtShort(r.debut)}<span class="d-sep">→</span>${fmtShort(r.fin)}</span>`;
  }

  const leftRows=visible.map(r=>{
    const c=getColor(r.projet);
    const realIdx=rows.indexOf(r);
    const niv=r.niveaux||[];
    const dc = `<span class="ch-col ch-dates">${r._type==='jalon'?fmtShort(r.date):fmtShort(r.debut)+'<span class="d-sep">→</span>'+fmtShort(r.fin)}</span>`;

    if(r._type==='projet'){
      return ''; // _type='projet' n'est plus généré — projet = groupe niveau 0 en multi-vue
    }
    if(r._type==='groupe'){
      const depth=niv.length;
      const key=collapseKey(r.projet,niv);
      const ind=(depth-1)*14;
      const col=lighten(c,Math.min(depth*10,40));
      const nomGroupe=niv[niv.length-1]||'—';
      const icons=['◆','◇','▸','·','–'];
      const icon=icons[Math.min(depth-1,icons.length-1)];
      const niveauxJson=JSON.stringify(niv).replace(/"/g,'&quot;');
      /* Groupe généré automatiquement pour le projet en vue multi-vue : pas éditable */
      if(r._isProjetGroupe){
        return`<div class="gantt-left-row is-groupe is-groupe-depth-${depth}">
          <span class="row-label-cell" style="padding-left:${ind}px">
            <span class="toggle-btn" data-ckey="${escH(key)}" onclick="event.stopPropagation();toggleCollapse(this.dataset.ckey)">${!collapsed[key]?'▾':'▸'}</span>
            <span style="color:${col};font-size:${9-depth}px;flex-shrink:0;margin:0 2px">■</span>
            <span class="row-label" style="color:${col};font-weight:700">${escH(nomGroupe)}</span>
          </span>
          <span class="ch-col ch-slot"></span>
          ${chargeCols(r)}${dc}
        </div>`;
      }
      return`<div class="gantt-left-row is-groupe is-groupe-depth-${depth}" onclick="openEditPanel(${realIdx>=0?realIdx:'null'})">
        <span class="row-label-cell" style="padding-left:${ind}px">
          <span class="toggle-btn" data-ckey="${escH(key)}" onclick="event.stopPropagation();toggleCollapse(this.dataset.ckey)">${!collapsed[key]?'▾':'▸'}</span>
          <span style="color:${col};font-size:${9-depth}px;flex-shrink:0;margin:0 2px">${icon}</span>
          <span class="row-label" style="color:${col};font-weight:${depth===1?700:600}">${escH(nomGroupe)}</span>
          <span class="row-actions">
            <button class="row-add-btn" onclick="event.stopPropagation();openAddAfter(${realIdx>=0?realIdx:'null'},event)" title="Ajouter">+</button>
            <button class="row-del-btn" onclick="event.stopPropagation();deleteGanttGroupe(event,this.dataset.proj,'${niveauxJson}')" data-proj="${escH(r.projet)}" title="Supprimer">&#128465;</button>
          </span>
        </span>
        <span class="ch-col ch-slot"></span>
        ${chargeCols(r)}${dc}
      </div>`;
    }
    if(r._type==='jalon'){
      const jColor=getColor(r.projet||rows.find(x=>x._type==='projet')?.projet||'')||'var(--accent)';
      return`<div class="gantt-left-row is-jalon" onclick="openJalonPanel(${realIdx})">
        <span class="row-label-cell">
          <span class="jalon-diamond" style="background:${jColor}"></span>
          <span class="row-label" style="color:${jColor}">${escH(r.nom||'—')}</span>
          <span class="row-actions">
            <button class="row-del-btn" onclick="event.stopPropagation();deleteJalonDirect(${realIdx})" title="Supprimer">&#128465;</button>
          </span>
        </span>
        <span class="ch-col ch-slot"></span>
        <span class="ch-col ch-prev ch-empty">—</span>
        ${hasTracking?'<span class="ch-col ch-pass ch-empty">—</span><span class="ch-col ch-rest ch-empty">—</span>':''}
        ${dc}
      </div>`;
    }
    /* ── tâche ── */
    const depth=niv.length;
    const indent=depth>0?(depth*14+6):6;
    const hasAsgn = (r.assignments||[]).length > 0;
    const aCount  = (r.assignments||[]).length;
    const aLabel  = hasAsgn ? aCount : '+';
    const aTitle  = hasAsgn ? `${aCount} ressource(s) — gérer` : 'Affecter des ressources';
    const aBtnCls = `affect-btn${hasAsgn?' has-res':''}`;
    const aBtn    = `<button class="${aBtnCls}" title="${aTitle}" onclick="event.stopPropagation();openAffectPanel(${realIdx})">${aLabel}👤</button>`;
    const resRows = resDetailRows(r, realIdx, indent);
    return`<div class="gantt-left-row is-tache" onclick="openEditPanel(${realIdx>=0?realIdx:'null'})">
      <span class="row-label-cell" style="padding-left:${indent}px">
        <span style="color:var(--muted);font-size:8px;flex-shrink:0;margin-right:2px">↳</span>
        <span class="row-label">${escH(r.tache||'—')}</span>
        <span class="row-actions">
          <button class="row-add-btn" onclick="openAddAfter(${realIdx>=0?realIdx:'null'},event)" title="Ajouter">+</button>
          <button class="row-del-btn" onclick="event.stopPropagation();deleteGanttTache(event,this.dataset.idx)" data-idx="${realIdx}" title="Supprimer">&#128465;</button>
        </span>
      </span>
      <span class="ch-col ch-slot">${aBtn}</span>
      ${chargeCols(r)}${dc}
    </div>${resRows}`;
  }).join('');

  const activeProj = portfolio.find(p=>p.id===activeProjectId);
  const lhTitle = activeProj ? escH(activeProj.name) : 'Projet / Groupe / Tâche';
  const leftHTML=`<div class="gantt-left${hasTracking?' has-tracking':''}" id="ganttLeftPanel" style="width:${labelW}px">
    <div class="gantt-left-header">
      <span class="lh-title lh-title-editable" onclick="startRenameLhTitle()" title="Cliquer pour renommer">${lhTitle}</span>
    </div>
    <div class="gantt-left-row gantt-col-headers">
      <span class="ch-hdr-label"></span>${headerCols()}
    </div>
    ${leftRows}
    <div style="display:flex;border-top:1px solid var(--border)">
      <div class="gantt-add-row" onclick="openEditPanel(null)" style="flex:1;border-top:none">
        <span class="add-plus">+</span> Ajouter une tâche
      </div>
      <div class="gantt-add-row" onclick="openJalonPanel()" style="flex:1;border-top:none;border-left:1px solid var(--border)">
        <span class="add-plus" style="color:var(--accent)">◆</span> Jalon
      </div>
    </div>
    <div class="resize-handle" id="resizeHandle"></div>
  </div>`;
  if(view==='mois') renderChart(layout,legend,visible,minD,maxD,today,leftHTML,'mois',hasTracking);
  else if(view==='semaine') renderChart(layout,legend,visible,minD,maxD,today,leftHTML,'semaine',hasTracking);
  else renderChart(layout,legend,visible,minD,maxD,today,leftHTML,'jour',hasTracking);
  const projects=[...new Set(rows.map(r=>r.projet))];
  legend.innerHTML=projects.map(p=>`<div class="legend-item" onclick="openColorPicker(event,'${escH(p)}')"><div class="legend-dot" style="background:${getColor(p)}"></div>${escH(p)}</div>`).join('');
  initResize();
}

function renderChart(layout,legend,visible,minD0,maxD0,today,leftHTML,mode,hasTracking){
  let minD=new Date(minD0),maxD=new Date(maxD0);
  if(mode!=='mois'){
    const dow=minD.getDay();minD.setDate(minD.getDate()-(dow===0?6:dow-1));
    const dow2=maxD.getDay();maxD.setDate(maxD.getDate()+(dow2===0?0:7-dow2));
  }
  const months=[];
  let mc=new Date(minD.getFullYear(),minD.getMonth(),1);
  while(mc<=maxD){
    const start=new Date(mc);const end=new Date(mc.getFullYear(),mc.getMonth()+1,0);
    months.push({label:MOIS[mc.getMonth()]+' '+mc.getFullYear(),start,end});
    mc.setMonth(mc.getMonth()+1);
  }
  let totalW, xOf;
  if(mode==='mois'){
    const mW=dayWidth;
    totalW=months.length*mW;
    xOf=d=>{
      const idx=months.findIndex(m=>d>=m.start&&d<=m.end);
      if(idx<0)return d<months[0].start?0:totalW;
      const m=months[idx];
      const dim=diff(m.start,new Date(m.start.getFullYear(),m.start.getMonth()+1,1));
      return(idx+diff(m.start,d)/dim)*mW;
    };
  }else{
    const totalDays=diff(minD,maxD);
    totalW=totalDays*dayWidth;
    xOf=d=>diff(minD,d)*dayWidth;
  }
  let topCells='',subCells='';
  if(mode==='mois'){
    topCells=months.map(m=>`<div class="gantt-month-cell" style="width:${dayWidth}px">${m.label}</div>`).join('');
  }else{
    const totalDays=diff(minD,maxD);
    const months2=[];
    let mc2=new Date(minD.getFullYear(),minD.getMonth(),1);
    while(mc2<=maxD){
      const start=new Date(mc2);const end=new Date(mc2.getFullYear(),mc2.getMonth()+1,0);
      const sOff=Math.max(0,diff(minD,start));const eOff=Math.min(totalDays,diff(minD,end)+1);
      months2.push({label:MOIS[mc2.getMonth()]+' '+mc2.getFullYear(),sOff,eOff});
      mc2.setMonth(mc2.getMonth()+1);
    }
    topCells=months2.map(m=>`<div class="gantt-month-cell" style="width:${(m.eOff-m.sOff)*dayWidth}px">${m.label}</div>`).join('');
    if(mode==='semaine'){
      let wc=new Date(minD);while(wc<=maxD){
        subCells+=`<div class="gantt-sub-cell" style="width:${7*dayWidth}px">${String(wc.getDate()).padStart(2,'0')}/${String(wc.getMonth()+1).padStart(2,'0')}</div>`;
        wc.setDate(wc.getDate()+7);
      }
    }else{
      let dc=new Date(minD);while(dc<=maxD){
        const wd=dc.getDay();const isWE=wd===0||wd===6;const isToday=diff(today,dc)===0;
        const isFerie=isJourFerie(dc);
        subCells+=`<div class="gantt-sub-cell${isWE||isFerie?' weekend':''}${isToday?' today-col':''}" style="width:${dayWidth}px">${String(dc.getDate()).padStart(2,'0')}</div>`;
        dc.setDate(dc.getDate()+1);
      }
    }
  }
  function buildCols(){
    let h='';
    if(mode==='mois'){
      months.forEach((_,i)=>{h+=`<div class="gantt-col-line month" style="left:${i*dayWidth}px"></div>`;});
    }else{
      const totalDays=diff(minD,maxD);
      const months2=[];let mc2=new Date(minD.getFullYear(),minD.getMonth(),1);
      while(mc2<=maxD){
        const start=new Date(mc2);const sOff=Math.max(0,diff(minD,start));
        months2.push(sOff);mc2.setMonth(mc2.getMonth()+1);
      }
      months2.forEach(sOff=>{h+=`<div class="gantt-col-line month" style="left:${sOff*dayWidth}px"></div>`;});
      if(mode==='semaine'){
        let wc=new Date(minD);while(wc<=maxD){h+=`<div class="gantt-col-line" style="left:${xOf(wc)}px"></div>`;wc.setDate(wc.getDate()+7);}
      }else{
        let d2=new Date(minD);while(d2<=maxD){
          const x=xOf(d2);const isWE=d2.getDay()===0||d2.getDay()===6;
          const isFerieCol=isJourFerie(d2);
          if(isWE||isFerieCol)h+=`<div style="position:absolute;top:0;bottom:0;left:${x}px;width:${dayWidth}px;background:rgba(0,0,0,.07);pointer-events:none"></div>`;
          h+=`<div class="gantt-col-line" style="left:${x}px;opacity:.12"></div>`;
          d2.setDate(d2.getDate()+1);
        }
      }
    }
    return h;
  }
  const colsBase=buildCols();
  const todayX=xOf(today);
  const todayOk=today>=minD&&today<=maxD;
  const ROW_H=22; 
  const colHdrSpacer=`<div class="gantt-col-hdr-spacer" style="width:${totalW}px"></div>`;
  const rowsHTML=visible.map(r=>{
    const c=getColor(r.projet);
    const isProj=r._type==='projet';
    if(isProj) return ''; // _type='projet' n'est plus généré
    const isGrp=r._type==='groupe';
    const realIdx=rows.indexOf(r);
    const barClick=`onclick="openEditPanel(${realIdx>=0?realIdx:'null'})"`;
    let left,width;
    if(mode==='mois'){
      left=xOf(r.debut);
      const rightX=xOf(r.fin)+dayWidth/30;
      width=Math.max(dayWidth*0.05,rightX-left);
    }else{
      left=xOf(r.debut);
      width=Math.max(dayWidth,diff(r.debut,r.fin)*dayWidth+dayWidth);
    }
    const tl=todayOk?`<div class="today-line" style="left:${todayX}px"></div>`:'';
    const tipArgs=`${JSON.stringify(r.projet)},${JSON.stringify(r.groupe||'')},${JSON.stringify(r.tache||'')},${JSON.stringify(fmtD(r.debut))},${JSON.stringify(fmtD(r.fin))},${r.charge}`;
    let barHtml;
    if(isProj){
      const col=c;
      const spineH=6;      
      const hookH=14;      
      const hookW=5;       
      const totalH=hookH+spineH;
      const cy=(ROW_H-totalH)/2; 
      const charge=r.charge!==null?`${fmtCharge(r.charge)}j`:'';
      barHtml=`<svg class="bracket-bar" style="left:${left}px;top:0;cursor:pointer"
        width="${width}" height="${ROW_H}" overflow="visible"
        ${barClick}
        onmouseenter="showTip(event,${tipArgs})" onmousemove="moveTip(event)" onmouseleave="hideTip()">
        <!-- spine -->
        <rect class="b-spine" x="0" y="${cy}" width="${width}" height="${spineH}" rx="2" fill="${col}" opacity="0.85"/>
        <!-- left hook -->
        <path class="b-hook" d="M0,${cy} L0,${cy+hookH} L${hookW},${cy+hookH}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
        <!-- right hook -->
        <path class="b-hook" d="M${width},${cy} L${width},${cy+hookH} L${width-hookW},${cy+hookH}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
        <!-- diamond left cap -->
        <polygon points="${-3},${cy+spineH/2} 0,${cy} ${3},${cy+spineH/2} 0,${cy+spineH}" fill="${col}" opacity="0.9"/>
        <!-- diamond right cap -->
        <polygon points="${width-3},${cy+spineH/2} ${width},${cy} ${width+3},${cy+spineH/2} ${width},${cy+spineH}" fill="${col}" opacity="0.9"/>
        ${charge?`<text x="${width/2}" y="${cy+spineH/2}" text-anchor="middle" dominant-baseline="middle"
          font-family="'DM Mono',monospace" font-size="10" font-weight="700" fill="#fff"
          class="bracket-lbl">${charge}</text>`:''}
      </svg>`;
    } else if(isGrp){
      const col=lighten(c,28);
      const spineH=4;
      const hookH=10;
      const hookW=4;
      const totalH=hookH+spineH;
      const cy=(ROW_H-totalH)/2;
      const charge=r.charge!==null?`${fmtCharge(r.charge)}j`:'';
      barHtml=`<svg class="bracket-bar" style="left:${left}px;top:0;cursor:pointer"
        width="${width}" height="${ROW_H}" overflow="visible"
        ${barClick}
        onmouseenter="showTip(event,${tipArgs})" onmousemove="moveTip(event)" onmouseleave="hideTip()">
        <!-- spine -->
        <rect class="b-spine" x="0" y="${cy}" width="${width}" height="${spineH}" rx="2" fill="${col}" opacity="0.75"/>
        <!-- left hook -->
        <path class="b-hook" d="M0,${cy} L0,${cy+hookH} L${hookW},${cy+hookH}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>
        <!-- right hook -->
        <path class="b-hook" d="M${width},${cy} L${width},${cy+hookH} L${width-hookW},${cy+hookH}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>
        ${charge?`<text x="${width/2}" y="${cy+spineH/2}" text-anchor="middle" dominant-baseline="middle"
          font-family="'DM Mono',monospace" font-size="10" font-weight="700" fill="#fff"
          class="bracket-lbl">${charge}</text>`:''}
      </svg>`;
    } else if(r._type==='jalon'){
      const JALON_H=16;
      const jColor=getColor(r.projet||rows.find(x=>x._type==='projet')?.projet||'')||'var(--accent)';
      const jx=xOf(r.date);
      const s=6; 
      const cy=JALON_H/2;
      const jTip=`${JSON.stringify(r.nom||'')},${JSON.stringify(fmtD(r.date))}`;
      barHtml=`<svg style="position:absolute;top:0;left:0;width:${totalW}px;height:${JALON_H}px;overflow:visible;pointer-events:none;z-index:3">
        <line x1="${jx}" y1="0" x2="${jx}" y2="${JALON_H}" stroke="${jColor}" stroke-width="1" stroke-dasharray="3,2" opacity="0.5"/>
        <polygon points="${jx},${cy-s} ${jx+s},${cy} ${jx},${cy+s} ${jx-s},${cy}"
          fill="${jColor}" opacity="0.9" style="cursor:pointer;pointer-events:all"
          onclick="openJalonPanel(${realIdx})"
          onmouseenter="showTipJalon(event,${jTip})" onmousemove="moveTip(event)" onmouseleave="hideTip()"/>
        <text x="${jx+s+4}" y="${cy}" dominant-baseline="middle"
          font-family="Arial,sans-serif" font-size="10" font-weight="600" fill="${jColor}"
          style="pointer-events:none;user-select:none">${escH(r.nom||'')}</text>
      </svg>`;
      return`<div class="gantt-row is-jalon" style="width:${totalW}px;height:16px">
        ${colsBase}${tl}${barHtml}
      </div>`;
    } else {
      const labelText=r.charge!==null?`${fmtCharge(r.charge)}j`:'';
      barHtml=`<div class="gantt-bar"
        style="left:${left}px;width:${width}px;background:${c}"
        ${barClick}
        onmouseenter="showTip(event,${tipArgs})"
        onmousemove="moveTip(event)" onmouseleave="hideTip()">
        ${labelText?`<span class="bar-lbl">${labelText}</span>`:''}
      </div>`;
    }
    /* tâche principale + lignes ressources vides pour l'alignement */
    const nResRows = (r._type==='tache' && showResources) ? (() => {
      const asgns=r.assignments;
      if(!asgns||!asgns.length) return 0;
      const rk=collapseResKey(realIdx);
      return collapsedRes[rk]?0:asgns.length;
    })() : 0;
    let rowH = isProj||isGrp ? `var(--row-h)` : `var(--row-h)`;
    let rightRows = `<div class="gantt-row${isProj?' is-projet':isGrp?' is-groupe':''}" style="width:${totalW}px">
      ${colsBase}${tl}${barHtml}
    </div>`;
    if(nResRows>0){
      const c2=getColor(r.projet);
      for(let ri=0;ri<nResRows;ri++){
        const a=(r.assignments||[])[ri];
        let miniBar='';
        if(a){
          const _mkMidnight = d => { const x = d instanceof Date ? new Date(d) : new Date(d); x.setHours(0,0,0,0); return x; };
          const aDebut = _mkMidnight(a.debut || r.debut);
          const aFin   = _mkMidnight(a.fin   || r.fin);
          let aLeft, aWidth;
          if(mode==='mois'){
            aLeft  = xOf(aDebut);
            const aRightX = xOf(aFin)+dayWidth/30;
            aWidth = Math.max(dayWidth*0.05, aRightX-aLeft);
          } else {
            aLeft  = xOf(aDebut);
            aWidth = Math.max(dayWidth, diff(aDebut,aFin)*dayWidth+dayWidth);
          }
          miniBar=`<div class="gantt-bar-res" style="left:${aLeft}px;width:${aWidth}px;background:${c2}33;border:1px solid ${c2}88"></div>`;
        }
        rightRows+=`<div class="gantt-row is-res-row" style="width:${totalW}px">${colsBase}${miniBar}</div>`;
      }
    }
    return rightRows;
  }).join('');
  const headerH=mode==='mois'?`style="height:var(--header-h)"`:'' ;
  const subRow=subCells?`<div class="gantt-sub-strip" style="width:${totalW}px">${subCells}</div>`:'';
  layout.innerHTML=leftHTML+`<div class="gantt-right" id="ganttRight">
    <div class="gantt-right-inner">
      <div class="gantt-header-row" ${headerH}>
        <div class="gantt-months-strip" style="width:${totalW}px${mode==='mois'?';height:100%;align-items:center':''}">${topCells}</div>
        ${subRow}
      </div>${colHdrSpacer}${rowsHTML}
      <div class="gantt-click-zone" style="width:${totalW}px" onclick="openEditPanel(null)" title="Cliquer pour ajouter une tâche"></div>
    </div></div>`;
  initDrag(document.getElementById('ganttRight'));
  if(mode==='jour'){
    setTimeout(()=>{const gr=document.getElementById('ganttRight');if(gr&&todayOk)gr.scrollLeft=Math.max(0,todayX-gr.clientWidth/2);},50);
  }
}
const tip=document.getElementById('tooltip');
function showTip(e,projet,groupe,tache,debut,fin,charge){
  const c=getColor(projet);
  tip.innerHTML=`<strong style="color:${c}">${escH(projet)}</strong>
    ${groupe?`<div style="color:${lighten(c,20)};font-size:10px;margin-bottom:2px">◆ ${escH(groupe)}</div>`:''}
    ${tache?`<div style="margin-bottom:3px;font-size:11px">${escH(tache)}</div>`:''}
    <div class="tip-row"><span>Début</span><span class="tip-val">${debut}</span></div>
    <div class="tip-row"><span>Fin</span><span class="tip-val">${fin}</span></div>
    ${charge!==null&&charge!=='null'?`<div class="tip-row"><span>Charge</span><span class="tip-val">${charge}j</span></div>`:''}`;
  tip.style.display='block';moveTip(e);
}
function moveTip(e){tip.style.left=(e.clientX+12)+'px';tip.style.top=(e.clientY-9)+'px';}
function hideTip(){tip.style.display='none';}
function showTipJalon(e,nom,date){
  const tip=document.getElementById('tooltip');
  tip.innerHTML=`<strong>◆ ${escH(nom)}</strong><br>${date}`;
  tip.style.display='block';
  moveTip(e);
}
function renderAll(){renderGantt();}
function toggleTheme(){
  const html=document.documentElement;
  const isDark=html.getAttribute('data-theme')==='dark';
  html.setAttribute('data-theme',isDark?'light':'dark');
  const btn=document.getElementById('btnTheme');
  if(btn)btn.textContent=isDark?'🌙 Sombre':'☀ Clair';
}
function exportPPTX(){
  _pptxExportReady = false;
  const tasks=rows.filter(r=>r._type==='tache');
  if(!tasks.length){alert('Aucune donnée à exporter.');return;}
  const HEADER_H=0.62, AXIS_H=0.26, ROW_H_IN=0.21, SLIDE_H=7.5;
  const TOP_Y=HEADER_H+0.04;
  const AVAILABLE_H=SLIDE_H-TOP_Y-AXIS_H-0.22;
  const ROWS_PER_SLIDE=Math.floor(AVAILABLE_H/ROW_H_IN);
  const visible=rows.filter(r=>isVisible(r));
  const nbSlides=Math.ceil(visible.length/ROWS_PER_SLIDE)||1;
  if(nbSlides>1){
    document.getElementById('pptxModalDesc').textContent =
      `${visible.length} lignes visibles · capacité ${ROWS_PER_SLIDE} lignes/slide`;
    document.getElementById('pptxModalDetail').innerHTML =
      `<b style="color:var(--accent)">${nbSlides} slides</b> seront générées pour contenir tout le Gantt.<br>`+
      `Lignes visibles : <b>${visible.length}</b> &nbsp;|&nbsp; Lignes par slide : <b>${ROWS_PER_SLIDE}</b>`;
    const modal=document.getElementById('pptxModal');
    modal.style.display='flex';
  } else {
    _runPptxExport();
  }
}
function closePptxModal(){
  document.getElementById('pptxModal').style.display='none';
}
function confirmPptxExport(){
  closePptxModal();
  _runPptxExport();
}
function _runPptxExport(){
  const allTasks=rows.filter(r=>r._type==='tache');
  if(!allTasks.length) return;
  const isDark = document.documentElement.getAttribute('data-theme')==='dark';
  const BG      = isDark ? '0f1620' : 'f5f6f8';
  const SURFACE = isDark ? '162130' : 'ffffff';
  const NAVY    = isDark ? '1c2d3f' : '284053';
  const TEXT    = isDark ? 'e2eaf2' : '284053';
  const MUTED   = isDark ? '7a94a8' : '727F8E';
  const ACCENT  = 'EC7206';
  const BORDER  = isDark ? '2a3d52' : 'dde1e8';
  let minD = allTasks.reduce((m,r)=>r.debut<m?r.debut:m, allTasks[0].debut);
  let maxD = allTasks.reduce((m,r)=>r.fin>m?r.fin:m, allTasks[0].fin);
  rows.filter(r=>r._type==='jalon'&&r.date).forEach(j=>{
    if(j.date<minD) minD=new Date(j.date);
    if(j.date>maxD) maxD=new Date(j.date);
  });
  if(view!=='mois'){
    const d1=minD.getDay(); minD=new Date(minD); minD.setDate(minD.getDate()-(d1===0?6:d1-1));
    const d2=maxD.getDay(); maxD=new Date(maxD); maxD.setDate(maxD.getDate()+(d2===0?0:7-d2));
  } else {
    minD=new Date(minD.getFullYear(),minD.getMonth(),1);
    maxD=new Date(maxD.getFullYear(),maxD.getMonth()+1,0);
  }
  const totalDays = diff(minD,maxD)||1;
  const visible   = rows.filter(r=>isVisible(r));
  const SLIDE_W   = 13.3;
  const SLIDE_H   = 7.5;
  const HEADER_H  = 0.55;
  const AXIS_H    = 0.24;
  const MARGIN_B  = 0.20;
  const TOP_Y     = HEADER_H + 0.03;
  const AVAILABLE_H = SLIDE_H - TOP_Y - AXIS_H - MARGIN_B;
  const ROW_H_IN = Math.min(0.20, Math.max(0.10, AVAILABLE_H / Math.max(visible.length, 1)));
  const LABEL_W  = 2.10;
  const DATE_W   = 0.95;
  const CHARGE_W = 0.34;
  const LEFT_W   = LABEL_W + DATE_W + CHARGE_W;
  const CHART_X  = LEFT_W + 0.04;
  const CHART_W  = SLIDE_W - CHART_X - 0.04;
  function hexNoHash(h){ return h.replace('#',''); }
  function projectHex(p){ return hexNoHash(getColor(p)); }
  function lightenHex(hex,pct){
    let c=parseInt(hex,16);
    let r=(c>>16)&0xff,g=(c>>8)&0xff,b=c&0xff;
    r=Math.min(255,r+Math.round((255-r)*pct/100));
    g=Math.min(255,g+Math.round((255-g)*pct/100));
    b=Math.min(255,b+Math.round((255-b)*pct/100));
    return (r<<16|g<<8|b).toString(16).padStart(6,'0');
  }
  const monthsAxis=[];
  let mc=new Date(minD.getFullYear(),minD.getMonth(),1);
  while(mc<=maxD){
    const start=new Date(mc);
    const end=new Date(mc.getFullYear(),mc.getMonth()+1,0);
    let sOff,eOff;
    if(view==='mois'){
      sOff=monthsAxis.length; eOff=monthsAxis.length+1;
    } else {
      sOff=Math.max(0,diff(minD,start))/totalDays;
      eOff=Math.min(1,(diff(minD,end)+1)/totalDays);
    }
    monthsAxis.push({label:MOIS[mc.getMonth()]+' '+mc.getFullYear().toString().slice(2),sOff,eOff});
    mc.setMonth(mc.getMonth()+1);
  }
  if(view==='mois'){
    const n=monthsAxis.length;
    monthsAxis.forEach((m,i)=>{m.sOff=i/n; m.eOff=(i+1)/n;});
  }
  function xOfDay(d){
    if(view==='mois'){
      const mIdx=monthsAxis.findIndex((_,i)=>{
        const ms=new Date(minD.getFullYear(),minD.getMonth()+i,1);
        const me=new Date(minD.getFullYear(),minD.getMonth()+i+1,0);
        return d>=ms&&d<=me;
      });
      if(mIdx<0) return d<minD?0:1;
      const ms=new Date(minD.getFullYear(),minD.getMonth()+mIdx,1);
      const me=new Date(minD.getFullYear(),minD.getMonth()+mIdx+1,1);
      const dim=diff(ms,me);
      return (mIdx+diff(ms,d)/dim)/monthsAxis.length;
    }
    return diff(minD,d)/totalDays;
  }
  function chartX(frac){ return CHART_X + frac*CHART_W; }
  function barW(d1,d2){
    const f = view==='mois'
      ? Math.max(0.008, xOfDay(d2)-xOfDay(d1)+0.004)
      : Math.max(0.008, diff(d1,d2)/totalDays + 1/totalDays);
    return Math.max(0.05, f*CHART_W);
  }
  const pres = new PptxGenJS();
  pres.layout  = 'LAYOUT_WIDE';
  pres.author  = '4CAD Group';
  pres.title   = 'Gantt — ' + new Date().toLocaleDateString('fr-FR');
  const today=new Date(); today.setHours(0,0,0,0);
  const todayFrac=xOfDay(today);
  const todayInRange=today>=minD&&today<=maxD;
  const ROWS_PER_SLIDE = Math.max(visible.length, Math.floor(AVAILABLE_H/0.10));
  const pages=[];
  for(let i=0;i<visible.length;i+=Math.floor(AVAILABLE_H/ROW_H_IN)){
    pages.push(visible.slice(i,i+Math.floor(AVAILABLE_H/ROW_H_IN)));
  }
  if(!pages.length) pages.push([]);
  pages.forEach((pageRows, pageIdx)=>{
    const slide = pres.addSlide();
    slide.background = {color:BG};
    slide.addShape(pres.ShapeType.rect,{x:0,y:0,w:SLIDE_W,h:HEADER_H,fill:{color:NAVY},line:{color:ACCENT,width:3}});
    slide.addText([{text:'GANTT',options:{bold:true,color:'FFFFFF'}},{text:'.',options:{bold:true,color:ACCENT}}],
      {x:0.12,y:0,w:1.4,h:HEADER_H,fontSize:18,fontFace:'Arial',valign:'middle',margin:0});
    const viewLabel=view==='semaine'?'Vue Semaine':view==='mois'?'Vue Mois':'Vue Jour';
    slide.addText(`${viewLabel}  ·  ${new Date().toLocaleDateString('fr-FR')}  ·  ${pageIdx+1}/${pages.length}`,
      {x:1.7,y:0,w:SLIDE_W-2,h:HEADER_H,fontSize:8.5,fontFace:'Arial',color:'FFFFFF',valign:'middle',margin:0});
    slide.addShape(pres.ShapeType.rect,{x:0,y:HEADER_H,w:LEFT_W,h:AXIS_H,fill:{color:NAVY},line:{color:NAVY,width:1}});
    slide.addText('Projet / Groupe / Tâche',{x:0.05,y:HEADER_H,w:LABEL_W-0.05,h:AXIS_H,
      fontSize:7,fontFace:'Arial',color:'FFFFFF',bold:true,valign:'middle',margin:0});
    slide.addShape(pres.ShapeType.line,{x:LABEL_W,y:HEADER_H,w:0,h:AXIS_H,line:{color:'FFFFFF',width:0.5,transparency:60}});
    slide.addText('Début → Fin',{x:LABEL_W+0.02,y:HEADER_H,w:DATE_W-0.04,h:AXIS_H,
      fontSize:6.5,fontFace:'Arial',color:'FFFFFF',bold:true,valign:'middle',align:'center',margin:0});
    slide.addShape(pres.ShapeType.line,{x:LABEL_W+DATE_W,y:HEADER_H,w:0,h:AXIS_H,line:{color:'FFFFFF',width:0.5,transparency:60}});
    slide.addText('Ch.',{x:LABEL_W+DATE_W+0.02,y:HEADER_H,w:CHARGE_W-0.04,h:AXIS_H,
      fontSize:6.5,fontFace:'Arial',color:'FFFFFF',bold:true,valign:'middle',align:'center',margin:0});
    slide.addShape(pres.ShapeType.rect,{x:CHART_X,y:HEADER_H,w:CHART_W,h:AXIS_H,fill:{color:NAVY},line:{color:NAVY,width:1}});
    monthsAxis.forEach(m=>{
      const mx=chartX(m.sOff), mw=Math.max(0.01,(m.eOff-m.sOff)*CHART_W);
      slide.addShape(pres.ShapeType.line,{x:mx,y:HEADER_H,w:0,h:AXIS_H,line:{color:'FFFFFF',width:0.5,transparency:70}});
      if(mw>0.12) slide.addText(m.label,{x:mx+0.02,y:HEADER_H,w:mw-0.02,h:AXIS_H,
        fontSize:6.5,fontFace:'Arial',color:'FFFFFF',valign:'middle',margin:0});
    });
    slide.addShape(pres.ShapeType.line,{x:0,y:HEADER_H+AXIS_H,w:SLIDE_W,h:0,line:{color:ACCENT,width:2}});
    pageRows.forEach((r, rowIdx)=>{
      const ry = TOP_Y + AXIS_H + rowIdx * ROW_H_IN;
      const isProj  = r._type==='projet';
      const isGrp   = r._type==='groupe';
      const isJalon = r._type==='jalon';
      const niv     = r.niveaux||[];
      const depth   = isGrp ? niv.length : 0;
      const barColor = isProj ? projectHex(r.projet)
                     : isGrp  ? lightenHex(projectHex(r.projet), depth*10)
                     : isJalon? hexNoHash(getColor(r.projet)||ACCENT)
                     : projectHex(r.projet);
      const rowFill = isProj  ? (isDark?'1c2d3f':'eef3f8')
                    : isGrp   ? (isDark?'1a2c3a':'f5f8fb')
                    : isJalon ? (isDark?'1e1800':'fff8f0')
                    : SURFACE;
      slide.addShape(pres.ShapeType.rect,{x:0,y:ry,w:SLIDE_W,h:ROW_H_IN,
        fill:{color:rowFill},line:{color:BORDER,width:0.5}});
      if(isJalon){
        slide.addText('◆ '+( r.nom||''), {
          x:0.1,y:ry,w:LABEL_W-0.1,h:ROW_H_IN,
          fontSize:Math.max(5,ROW_H_IN*28),fontFace:'Arial',
          color:barColor,bold:true,italic:true,valign:'middle',margin:0
        });
        slide.addShape(pres.ShapeType.line,{x:LABEL_W,y:ry,w:0,h:ROW_H_IN,line:{color:BORDER,width:0.5}});
        slide.addText(fmtD(r.date),{
          x:LABEL_W+0.02,y:ry,w:DATE_W-0.04,h:ROW_H_IN,
          fontSize:Math.max(5,ROW_H_IN*26),fontFace:'Courier New',
          color:barColor,bold:true,valign:'middle',align:'center',margin:0
        });
        slide.addShape(pres.ShapeType.line,{x:LABEL_W+DATE_W,y:ry,w:0,h:ROW_H_IN,line:{color:BORDER,width:0.5}});
        if(r.date){
          const jx = chartX(xOfDay(r.date));
          const s = Math.min(ROW_H_IN*0.38, 0.08);
          const cy = ry + ROW_H_IN/2;
          slide.addShape(pres.ShapeType.line,{x:jx,y:ry,w:0,h:ROW_H_IN,
            line:{color:barColor,width:1,dashType:'dash',transparency:40}});
          slide.addShape(pres.ShapeType.rect,{
            x:jx-s/2,y:cy-s/2,w:s,h:s,
            fill:{color:barColor},line:{color:barColor,width:1},rotate:45
          });
        }
        monthsAxis.forEach(m=>slide.addShape(pres.ShapeType.line,
          {x:chartX(m.sOff),y:ry,w:0,h:ROW_H_IN,line:{color:BORDER,width:0.5}}));
        if(todayInRange) slide.addShape(pres.ShapeType.line,
          {x:chartX(todayFrac),y:ry,w:0,h:ROW_H_IN,line:{color:ACCENT,width:1.5}});
        return;
      }
      const baseIndent = isProj ? 0.08 : isGrp ? 0.12 + (depth-1)*0.12 : 0.28 + niv.length*0.10;
      const fs = Math.max(5.5, ROW_H_IN * (isProj?30:isGrp?28:26));
      let labelPrefix = '';
      if(isGrp){
        const icons=['◆','◇','▸','·','–'];
        labelPrefix = icons[Math.min(depth-1,icons.length-1)] + ' ';
      }
      const labelText = isProj ? r.projet
                      : isGrp  ? labelPrefix + (niv[niv.length-1]||'')
                      : (r.tache||'—');
      const labelColor = (isProj||isGrp) ? barColor : TEXT;
      slide.addText(labelText,{
        x:baseIndent,y:ry,w:LABEL_W-baseIndent-0.03,h:ROW_H_IN,
        fontSize:fs,fontFace:'Arial',color:labelColor,
        bold:isProj||isGrp,valign:'middle',margin:0
      });
      slide.addShape(pres.ShapeType.line,{x:LABEL_W,y:ry,w:0,h:ROW_H_IN,line:{color:BORDER,width:0.5}});
      slide.addText([
        {text:fmtD(r.debut), options:{color:TEXT,fontSize:Math.max(5,fs-1)}},
        {text:'→',           options:{color:ACCENT,fontSize:Math.max(5,fs-1.5),bold:true}},
        {text:fmtD(r.fin),   options:{color:TEXT,fontSize:Math.max(5,fs-1)}}
      ],{x:LABEL_W+0.02,y:ry,w:DATE_W-0.04,h:ROW_H_IN,
        fontFace:'Courier New',valign:'middle',align:'center',margin:0});
      slide.addShape(pres.ShapeType.line,{x:LABEL_W+DATE_W,y:ry,w:0,h:ROW_H_IN,line:{color:BORDER,width:0.5}});
      if(r.charge!=null){
        slide.addText(`${fmtCharge(r.charge)}j`,{
          x:LABEL_W+DATE_W+0.02,y:ry+Math.max(0.01,ROW_H_IN*0.15),
          w:CHARGE_W-0.04,h:ROW_H_IN*0.70,
          fontSize:Math.max(5,fs-1.5),fontFace:'Courier New',color:ACCENT,bold:true,
          align:'center',valign:'middle',margin:0,
          fill:{color:isDark?'2a2000':'fff3e0'},line:{color:ACCENT,width:0.5}
        });
      }
      const bx = chartX(xOfDay(r.debut));
      const bw = barW(r.debut, r.fin);
      const BAR_H = isProj ? Math.max(0.04, ROW_H_IN*0.25)
                  : isGrp  ? Math.max(0.03, ROW_H_IN*0.20)
                  : Math.max(0.05, ROW_H_IN*0.55);
      const bary = ry + (ROW_H_IN - BAR_H) / 2;
      if(isProj){
        const spineY = bary + BAR_H/2 - 0.02;
        const hookH  = Math.max(0.06, ROW_H_IN*0.45);
        slide.addShape(pres.ShapeType.rect,{x:bx,y:spineY,w:bw,h:0.04,fill:{color:barColor},line:{color:barColor,width:1}});
        slide.addShape(pres.ShapeType.line,{x:bx,y:spineY,w:0,h:hookH,line:{color:barColor,width:2}});
        slide.addShape(pres.ShapeType.line,{x:bx,y:spineY+hookH,w:0.05,h:0,line:{color:barColor,width:2}});
        slide.addShape(pres.ShapeType.line,{x:bx+bw,y:spineY,w:0,h:hookH,line:{color:barColor,width:2}});
        slide.addShape(pres.ShapeType.line,{x:bx+bw-0.05,y:spineY+hookH,w:0.05,h:0,line:{color:barColor,width:2}});
      } else if(isGrp){
        const spineY = bary + BAR_H/2 - 0.015;
        const hookH  = Math.max(0.04, ROW_H_IN*0.35);
        slide.addShape(pres.ShapeType.rect,{x:bx,y:spineY,w:bw,h:0.025,fill:{color:barColor},line:{color:barColor,width:0.5}});
        slide.addShape(pres.ShapeType.line,{x:bx,y:spineY,w:0,h:hookH,line:{color:barColor,width:1.5}});
        slide.addShape(pres.ShapeType.line,{x:bx,y:spineY+hookH,w:0.04,h:0,line:{color:barColor,width:1.5}});
        slide.addShape(pres.ShapeType.line,{x:bx+bw,y:spineY,w:0,h:hookH,line:{color:barColor,width:1.5}});
        slide.addShape(pres.ShapeType.line,{x:bx+bw-0.04,y:spineY+hookH,w:0.04,h:0,line:{color:barColor,width:1.5}});
      } else {
        slide.addShape(pres.ShapeType.rect,{x:bx,y:bary,w:bw,h:BAR_H,
          fill:{color:barColor},line:{color:barColor,width:1},
          shadow:{type:'outer',color:'000000',blur:2,offset:1,angle:135,opacity:0.15}});
        if(r.charge!=null && bw>0.18){
          slide.addText(`${fmtCharge(r.charge)}j`,{x:bx,y:bary,w:bw,h:BAR_H,
            fontSize:Math.max(5,fs-2),fontFace:'Courier New',color:'FFFFFF',bold:true,
            align:'center',valign:'middle',margin:0});
        }
      }
      monthsAxis.forEach(m=>slide.addShape(pres.ShapeType.line,
        {x:chartX(m.sOff),y:ry,w:0,h:ROW_H_IN,line:{color:BORDER,width:0.5}}));
      if(todayInRange) slide.addShape(pres.ShapeType.line,
        {x:chartX(todayFrac),y:ry,w:0,h:ROW_H_IN,line:{color:ACCENT,width:1.5}});
    });
    slide.addShape(pres.ShapeType.line,{x:LEFT_W,y:HEADER_H,w:0,h:SLIDE_H-HEADER_H,line:{color:BORDER,width:1}});
    if(todayInRange) slide.addShape(pres.ShapeType.line,
      {x:chartX(todayFrac),y:HEADER_H,w:0,h:AXIS_H,line:{color:ACCENT,width:2}});
    const projs=[...new Set(rows.filter(r=>r._type==='tache').map(r=>r.projet))];
    let lx=0.10;
    const legendY=SLIDE_H-0.16;
    projs.forEach(p=>{
      const ph=projectHex(p);
      slide.addShape(pres.ShapeType.rect,{x:lx,y:legendY+0.02,w:0.09,h:0.09,fill:{color:ph},line:{color:ph,width:1}});
      slide.addText(p,{x:lx+0.11,y:legendY,w:0.9,h:0.16,fontSize:6.5,fontFace:'Arial',color:TEXT,valign:'middle',margin:0});
      lx+=1.05;
    });
  }); 
  pres.writeFile({fileName:`Gantt_4CAD_${view}_${new Date().toISOString().slice(0,10)}.pptx`});
}
function toggleDataSection(){
  dataSectionOpen=!dataSectionOpen;
  const section=document.getElementById('dataSection');
  const icon=document.getElementById('dataToggleIcon');
  if(section){
    section.style.display=dataSectionOpen?'block':'none';
  }
  if(icon){
    icon.innerHTML=dataSectionOpen?'&#9660;':'&#9654;';
  }
}
const _ganttRenderAll = renderAll;
renderAll = function(){ _ganttRenderAll(); saveCurrentProject(); };
