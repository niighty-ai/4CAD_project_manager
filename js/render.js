/**
 * render.js
 * Gantt diagram rendering: left panel labels + right chart bars.
 *
 * Entry points:
 *   renderGantt()  — builds full layout, calls renderChart()
 *   renderChart()  — draws time axis and row bars (shared by all views)
 *
 * Depends on: config.js, state.js, utils.js, sort.js (isVisible, collapseKey)
 * Calls (on init): initResize(), initDrag() from ui.js
 */

// ====== GANTT ======
function renderGantt(){
  const layout=document.getElementById('ganttLayout');
  const legend=document.getElementById('legend');
  const allTasks=rows.filter(r=>r._type==='tache');
  if(!allTasks.length){
    layout.innerHTML=`<div class="empty" style="width:100%"><div class="icon">📊</div><p>Aucune donnée.</p></div>`;
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

  // -- LEFT PANEL --
  function toggleBtn(key){
    const open=!collapsed[key];
    return`<span class="toggle-btn" data-ckey="${escH(key)}" onclick="event.stopPropagation();toggleCollapse(this.dataset.ckey)">${open?'▾':'▸'}</span>`;
  }

  const leftRows=visible.map(r=>{
    const c=getColor(r.projet);
    const datesHtml=`<span class="row-dates${showDates?'':' hidden'}">
      <span>${fmtShort(r.debut)}</span><span class="d-sep">→</span><span>${fmtShort(r.fin)}</span>
    </span>`;
    const chargeHtml=r.charge!==null?`<span class="row-charge">${r.charge}j</span>`:'';
    const realIdx=rows.indexOf(r);
    const clickAttr=`onclick="openEditPanel(${realIdx>=0?realIdx:'null'})"`;
    const niv=r.niveaux||[];

    if(r._type==='projet'){
      const key=collapseKey(r.projet,[]);
      return`<div class="gantt-left-row is-projet"
        onclick="openEditPanel(${realIdx>=0?realIdx:'null'})">
        <span class="toggle-btn" data-ckey="${escH(key)}" onclick="event.stopPropagation();toggleCollapse(this.dataset.ckey)">${!collapsed[key]?'▾':'▸'}</span>
        <span style="color:${c};font-size:9px;flex-shrink:0">■</span>
        <span class="row-label" style="color:${c}">${escH(r.projet)}</span>
        ${chargeHtml}${datesHtml}
        <button class="row-add-btn" onclick="event.stopPropagation();openAddAfter(${realIdx>=0?realIdx:'null'},event)" title="Ajouter une tâche dans ce projet">+</button>
        <button class="row-del-btn" onclick="event.stopPropagation();deleteGanttProjet(event,this.dataset.proj)" data-proj="${escH(r.projet)}" title="Supprimer ce projet">&#128465;</button>
      </div>`;
    }
    if(r._type==='groupe'){
      const depth=niv.length;
      const key=collapseKey(r.projet,niv);
      const indent=(depth-1)*14;
      const lightPct=Math.min(depth*10,40);
      const col=lighten(c,lightPct);
      const nomGroupe=niv[niv.length-1]||'—';
      const icons=['◆','◇','▸','·','–'];
      const icon=icons[Math.min(depth-1,icons.length-1)];
      const niveauxJson=JSON.stringify(niv).replace(/"/g,'&quot;');
      // Clic simple = toggle collapse / Double-clic = édition
      return`<div class="gantt-left-row is-groupe is-groupe-depth-${depth}"
        onclick="openEditPanel(${realIdx>=0?realIdx:'null'})">
        <span style="width:${indent}px;flex-shrink:0"></span>
        <span class="toggle-btn" data-ckey="${escH(key)}" onclick="event.stopPropagation();toggleCollapse(this.dataset.ckey)">${!collapsed[key]?'▾':'▸'}</span>
        <span style="color:${col};font-size:${9-depth}px;flex-shrink:0">${icon}</span>
        <span class="row-label" style="color:${col};font-weight:${depth===1?700:600}">${escH(nomGroupe)}</span>
        ${chargeHtml}${datesHtml}
        <button class="row-add-btn" onclick="event.stopPropagation();openAddAfter(${realIdx>=0?realIdx:'null'},event)" title="Ajouter ici">+</button>
        <button class="row-del-btn" onclick="event.stopPropagation();deleteGanttGroupe(event,this.dataset.proj,'${niveauxJson}')" data-proj="${escH(r.projet)}" title="Supprimer ce groupe">&#128465;</button>
      </div>`;
    }
    // Jalon
    if(r._type==='jalon'){
      const jColor=getColor(r.projet||rows.find(x=>x._type==='projet')?.projet||'')||'var(--accent)';
      return`<div class="gantt-left-row is-jalon" onclick="openJalonPanel(${realIdx})">
        <span class="jalon-diamond" style="background:${jColor}"></span>
        <span class="row-label" style="color:${jColor}">${escH(r.nom||'—')}</span>
        <span class="row-dates${showDates?'':' hidden'}" style="margin-left:auto">
          <span>${fmtShort(r.date)}</span>
        </span>
        <button class="row-del-btn" onclick="event.stopPropagation();deleteJalonDirect(${realIdx})" title="Supprimer ce jalon">&#128465;</button>
      </div>`;
    }
    // Tâche
    const depth=niv.length;
    const indent=depth>0?(depth*14+6):6;
    return`<div class="gantt-left-row is-tache" ${clickAttr}>
      <span style="width:${indent}px;flex-shrink:0"></span>
      <span style="color:var(--muted);font-size:8px;flex-shrink:0">↳</span>
      <span class="row-label">${escH(r.tache||'—')}</span>
      ${chargeHtml}${datesHtml}
      <button class="row-add-btn" onclick="openAddAfter(${realIdx>=0?realIdx:'null'},event)" title="Ajouter une tâche ici">+</button>
      <button class="row-del-btn" onclick="event.stopPropagation();deleteGanttTache(event,this.dataset.idx)" data-idx="${realIdx}" title="Supprimer cette tâche">&#128465;</button>
    </div>`;
  }).join('');

  const activeProj = portfolio.find(p=>p.id===activeProjectId);
  const lhTitle = activeProj ? escH(activeProj.name) : 'Projet / Groupe / Tache';
  const leftHTML=`<div class="gantt-left" id="ganttLeftPanel" style="width:${labelW}px">
    <div class="gantt-left-header">
      <span class="lh-title lh-title-editable" onclick="startRenameLhTitle()" title="Cliquer pour renommer">${lhTitle}</span>
      <button class="toggle-dates-btn${showDates?'':' hidden-dates'}" id="toggleDatesBtn" onclick="toggleDates()">${showDates?'Masquer dates':'Afficher dates'}</button>
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

  if(view==='mois') renderChart(layout,legend,visible,minD,maxD,today,leftHTML,'mois');
  else if(view==='semaine') renderChart(layout,legend,visible,minD,maxD,today,leftHTML,'semaine');
  else renderChart(layout,legend,visible,minD,maxD,today,leftHTML,'jour');

  const projects=[...new Set(rows.map(r=>r.projet))];
  legend.innerHTML=projects.map(p=>`<div class="legend-item" onclick="openColorPicker(event,'${escH(p)}')"><div class="legend-dot" style="background:${getColor(p)}"></div>${escH(p)}</div>`).join('');
  initResize();
}

// ── Chart (axis + bars) ───────────────────────────────────────────────────────

// ====== CHART RENDER (shared) ======
function renderChart(layout,legend,visible,minD0,maxD0,today,leftHTML,mode){
  let minD=new Date(minD0),maxD=new Date(maxD0);

  if(mode!=='mois'){
    const dow=minD.getDay();minD.setDate(minD.getDate()-(dow===0?6:dow-1));
    const dow2=maxD.getDay();maxD.setDate(maxD.getDate()+(dow2===0?0:7-dow2));
  }

  // -- Month boundaries --
  const months=[];
  let mc=new Date(minD.getFullYear(),minD.getMonth(),1);
  while(mc<=maxD){
    const start=new Date(mc);const end=new Date(mc.getFullYear(),mc.getMonth()+1,0);
    months.push({label:MOIS[mc.getMonth()]+' '+mc.getFullYear(),start,end});
    mc.setMonth(mc.getMonth()+1);
  }

  // -- X position function --
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

  // -- Header cells --
  let topCells='',subCells='';
  if(mode==='mois'){
    topCells=months.map(m=>`<div class="gantt-month-cell" style="width:${dayWidth}px">${m.label}</div>`).join('');
  }else{
    // months row
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

  // -- Column lines --
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

  // -- Rows --
  const ROW_H=22; // matches --row-h

  const rowsHTML=visible.map(r=>{
    const c=getColor(r.projet);
    const isProj=r._type==='projet';
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
      // -- PROJET bracket: thick spine + tall hooks, diamond caps --
      const col=c;
      const spineH=6;      // thickness of horizontal bar
      const hookH=14;      // how tall the end hooks drop
      const hookW=5;       // width of hooks
      const totalH=hookH+spineH;
      const cy=(ROW_H-totalH)/2; // top of spine within row
      const charge=r.charge!==null?`${r.charge}j`:'';

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
      // -- GROUPE bracket: medium spine + shorter hooks, rounded caps --
      const col=lighten(c,28);
      const spineH=4;
      const hookH=10;
      const hookW=4;
      const totalH=hookH+spineH;
      const cy=(ROW_H-totalH)/2;
      const charge=r.charge!==null?`${r.charge}j`:'';

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
      // -- JALON -- losange SVG centré sur la date --
      const JALON_H=16;
      const jColor=getColor(r.projet||rows.find(x=>x._type==='projet')?.projet||'')||'var(--accent)';
      const jx=xOf(r.date);
      const s=6; // demi-taille du losange (adapté à la hauteur fine)
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
      // -- TÂCHE -- normal rounded bar --
      const labelText=r.charge!==null?`${r.charge}j`:'';
      barHtml=`<div class="gantt-bar"
        style="left:${left}px;width:${width}px;background:${c}"
        ${barClick}
        onmouseenter="showTip(event,${tipArgs})"
        onmousemove="moveTip(event)" onmouseleave="hideTip()">
        ${labelText?`<span class="bar-lbl">${labelText}</span>`:''}
      </div>`;
    }

    return`<div class="gantt-row${isProj?' is-projet':isGrp?' is-groupe':''}" style="width:${totalW}px">
      ${colsBase}${tl}${barHtml}
    </div>`;
  }).join('');

  const headerH=mode==='mois'?`style="height:var(--header-h)"`:'' ;
  const subRow=subCells?`<div class="gantt-sub-strip" style="width:${totalW}px">${subCells}</div>`:'';

  layout.innerHTML=leftHTML+`<div class="gantt-right" id="ganttRight">
    <div class="gantt-right-inner">
      <div class="gantt-header-row" ${headerH}>
        <div class="gantt-months-strip" style="width:${totalW}px${mode==='mois'?';height:100%;align-items:center':''}">${topCells}</div>
        ${subRow}
      </div>${rowsHTML}
      <div class="gantt-click-zone" style="width:${totalW}px" onclick="openEditPanel(null)" title="Cliquer pour ajouter une tâche"></div>
    </div></div>`;

  initDrag(document.getElementById('ganttRight'));

  if(mode==='jour'){
    setTimeout(()=>{const gr=document.getElementById('ganttRight');if(gr&&todayOk)gr.scrollLeft=Math.max(0,todayX-gr.clientWidth/2);},50);
  }
}

// ====== TOOLTIP ======

// ── Tooltips ─────────────────────────────────────────────────────────────────

// ====== TOOLTIP ======
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

// ====== EXPORT ======