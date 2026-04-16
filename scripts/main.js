const STORAGE_KEY = 'gantt4cad_portfolio';
let portfolio = [];
let activeProjectId = null;
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
    const chargeHtml=r.charge!==null?`<span class="row-charge">${r.charge}j</span>`:'';
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
  return`<div class="gantt-left" id="ganttLeftPanel" style="width:${labelW}px">
    <div class="gantt-left-header">
      <span class="lh-title">Projet / Groupe / Tâche</span>
      <button class="toggle-dates-btn${showDates?'':' hidden-dates'}" id="toggleDatesBtn" onclick="toggleDates()">${showDates?'Masquer dates':'Afficher dates'}</button>
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
let rows=[];
let view='semaine';
let dayWidth=6;
let projectColors={};
let collapsed={};
let editingIdx=null;
let showDates=true;
let labelW=400; 
const PALETTE=['#6c63ff','#ff6584','#43e97b','#f7971e','#38b2f8','#ff9a3c','#a29bfe','#fd79a8','#00b894','#fdcb6e','#e17055','#74b9ff','#55efc4','#d63031','#6ab04c','#e84393','#0984e3','#b8e994','#f19066','#786fa6'];
const MOIS=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
function getJoursFeries(year){
  const a=year%19,b=Math.floor(year/100),c=year%100;
  const d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25);
  const g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7;
  const m=Math.floor((a+11*h+22*l)/451);
  const mo=Math.floor((h+l-7*m+114)/31)-1;
  const day=((h+l-7*m+114)%31)+1;
  const paques=new Date(year,mo,day);
  function add(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
  function key(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  return new Set([
    new Date(year,0,1), new Date(year,4,1), new Date(year,4,8),
    new Date(year,6,14), new Date(year,7,15), new Date(year,10,1),
    new Date(year,10,11), new Date(year,11,25),
    add(paques,1), add(paques,39), add(paques,50)
  ].map(key));
}
function isJourFerie(date){
  const y=date.getFullYear();
  const cache=isJourFerie._c||(isJourFerie._c={});
  if(!cache[y]) cache[y]=getJoursFeries(y);
  const key=y+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  return cache[y].has(key);
}
function parseDate(s){
  if(!s)return null;
  if(s instanceof Date){const d=new Date(s);d.setHours(0,0,0,0);return d;}
  let m=String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m)return new Date(+m[3],+m[2]-1,+m[1]);
  m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m)return new Date(+m[1],+m[2]-1,+m[3]);
  if(!isNaN(s)){const d=new Date((+s-25569)*86400000);d.setHours(0,0,0,0);return d;}
  return new Date(s);
}
function fmtD(d){if(!d)return'—';return`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;}
function fmtShort(d){if(!d)return'—';return`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;}
function toInput(d){if(!d)return'';return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function diff(a,b){return Math.round((b-a)/86400000);}
function escH(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function getColor(p){
  if(!projectColors[p]){const used=Object.values(projectColors);projectColors[p]=PALETTE.find(c=>!used.includes(c))||PALETTE[0];}
  return projectColors[p];
}
function lighten(hex,pct=30){
  let c=parseInt(hex.slice(1),16);
  let r=(c>>16)&0xff,g=(c>>8)&0xff,b=c&0xff;
  r=Math.min(255,r+Math.round((255-r)*pct/100));
  g=Math.min(255,g+Math.round((255-g)*pct/100));
  b=Math.min(255,b+Math.round((255-b)*pct/100));
  return`#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}
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
function toggleCollapse(key){collapsed[key]=!collapsed[key];renderGantt();}
function collapseKey(projet,niveaux){
  if(!niveaux||!niveaux.length) return 'P:'+projet;
  return 'G:'+projet+'|'+niveaux.join('|');
}
function isVisible(r){
  if(r._type==='jalon') return true;
  if(r._type==='projet') return true;
  if(collapsed[collapseKey(r.projet,[])]) return false;
  const niv=r.niveaux||[];
  if(r._type==='groupe'){
    for(let i=1;i<niv.length;i++){
      if(collapsed[collapseKey(r.projet,niv.slice(0,i))]) return false;
    }
    return true;
  }
  if(r._type==='tache'){
    for(let i=1;i<=niv.length;i++){
      if(collapsed[collapseKey(r.projet,niv.slice(0,i))]) return false;
    }
    return true;
  }
  return true;
}
let cpTarget=null;
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
  rows.push({_type:'tache',projet:p,groupe:g||null,tache:t||null,debut:parseDate(d),fin:parseDate(f),charge:c?parseFloat(c.replace(',','.')):null});
  document.getElementById('addForm').style.display='none';
  sortRows();renderAll();
}
document.getElementById('fileInput').addEventListener('change',e=>{
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const wb=XLSX.read(ev.target.result,{type:'array',cellDates:false});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const data=XLSX.utils.sheet_to_json(ws,{header:1,raw:true});
      let hr=0;
      for(let i=0;i<Math.min(5,data.length);i++){
        const r=data[i].map(c=>String(c||'').toLowerCase());
        if(r.some(c=>c.includes('projet')||c.includes('tach')||c.includes('but'))){hr=i;break;}
      }
      const hdrs=data[hr].map(c=>String(c||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
      const ci={
        type:   hdrs.findIndex(h=>h==='type'||h.includes('type')),
        projet: hdrs.findIndex(h=>h.includes('projet')),
        tache:  hdrs.findIndex(h=>h.includes('tach')||h.includes('nom')),
        debut:  hdrs.findIndex(h=>h.includes('debut')||h.includes('but')||h==='debut'),
        fin:    hdrs.findIndex(h=>h==='fin'||h.includes('fin')),
        charge: hdrs.findIndex(h=>h.includes('charge')),
        niveaux: [1,2,3,4,5].map(n=>hdrs.findIndex(h=>
          h===`niveau${n}` || h===`niveau_${n}` || h===`niveau ${n}` ||
          h===`n${n}` || h===`level${n}` || h===`level ${n}` ||
          (n===1 && (h.includes('groupe')||h.includes('group')))
        ))
      };
      rows=[];
      for(let i=hr+1;i<data.length;i++){
        const r=data[i];if(!r||!r[ci.projet])continue;
        const typeVal = ci.type>=0&&r[ci.type] ? String(r[ci.type]).toLowerCase().trim() : '';
        const isJalon = typeVal==='jalon'||typeVal==='milestone'||typeVal==='j';
        const nomVal = ci.tache>=0&&r[ci.tache] ? String(r[ci.tache]).trim() : null;
        if(isJalon){
          const d=ci.debut>=0?parseDate(r[ci.debut]):null;
          if(!d||isNaN(d)) continue;
          rows.push({_type:'jalon',projet:String(r[ci.projet]).trim(),nom:nomVal||'',date:d});
          continue;
        }
        const d=ci.debut>=0?parseDate(r[ci.debut]):null;
        const f=ci.fin>=0?parseDate(r[ci.fin]):null;
        if(!d||!f||isNaN(d)||isNaN(f))continue;
        let ch=ci.charge>=0?r[ci.charge]:null;
        if(ch!==null){ch=parseFloat(String(ch).replace(',','.'));if(isNaN(ch))ch=null;}
        const niveaux=[];
        for(const idx of ci.niveaux){
          if(idx>=0&&r[idx]&&String(r[idx]).trim()) niveaux.push(String(r[idx]).trim());
          else break;
        }
        rows.push({_type:'tache',projet:String(r[ci.projet]).trim(),niveaux,tache:nomVal,debut:d,fin:f,charge:ch});
      }
      projectColors={};collapsed={};sortRows();renderAll();
    }catch(err){alert('Erreur : '+err.message);}
  };
  reader.readAsArrayBuffer(file);e.target.value='';
});
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
    <td>${r.charge!==null?`<span class="charge-badge">${r.charge}j</span>`:'—'}</td>
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
  rows[ri]={_type:'tache',projet:p,groupe:g||null,tache:t||null,debut:parseDate(d),fin:parseDate(f),charge:c!==''?parseFloat(c):null};
  editingIdx=null;sortRows();renderAll();
}
function cancelInlineEdit(){
  const prev=editingIdx;editingIdx=null;
  if(prev!==null){const tr=document.getElementById(`row-${prev}`);if(tr&&rows[prev])tr.outerHTML=renderTableRow(rows[prev],prev);}
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')cancelInlineEdit();
  if(e.key==='Enter'&&editingIdx!==null&&e.target.classList.contains('cell-input'))saveInlineEdit(editingIdx);
});
function deleteRow(ri){
  if(editingIdx===ri)editingIdx=null;
  rows.splice(ri,1);
  rows=rows.filter(r=>r._type==='tache');
  sortRows();renderAll();
}
function clearAll(){if(!rows.length||confirm('Tout effacer ?')){rows=[];projectColors={};collapsed={};editingIdx=null;document.getElementById('addForm').style.display='none';renderAll();}}
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
function renderChart(layout,legend,visible,minD0,maxD0,today,leftHTML,mode){
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
      const col=c;
      const spineH=6;      
      const hookH=14;      
      const hookW=5;       
      const totalH=hookH+spineH;
      const cy=(ROW_H-totalH)/2; 
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
let _pptxExportReady = false; 
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
        slide.addText(`${r.charge}j`,{
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
          slide.addText(`${r.charge}j`,{x:bx,y:bary,w:bw,h:BAR_H,
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
let dataSectionOpen=true;
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
(function(){
  const origHandler = document.getElementById('fileInput').onchange;
  document.getElementById('fileInput').addEventListener('change', function(e){
    const file = e.target.files[0];
    if(file && activeProjectId){
      const proj = portfolio.find(p=>p.id===activeProjectId);
      if(proj && (proj.name.startsWith('Nouveau projet'))){
        const name = file.name.replace(/\.[^.]+$/,'').replace(/[_-]/g,' ');
        proj.name = name;
        
        savePortfolio();
        renderNavList();
      }
    }
  });
})();
let navOpen = true;
let navCollapsed = {}; 
const NAV_COLORS = ['#EC7206','#284053','#72B6EC','#43e97b','#ff6584','#a29bfe','#fdcb6e','#00b894','#e17055','#6c63ff'];
function navColor(idx){ return NAV_COLORS[idx % NAV_COLORS.length]; }
function savePortfolio(){
  const data = portfolio.map(p=>({
    id:p.id, name:p.name, client:p.client||'',
    rows: p.rows
      .filter(r=>r._type!=='jalon') 
      .map(r=>({...r, debut:r.debut?r.debut.toISOString():null, fin:r.fin?r.fin.toISOString():null})),
    jalons: (p.jalons||[]).map(j=>({...j, date:j.date?j.date.toISOString():null})),
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
  if(activeProjectId){
    const cur = portfolio.find(p=>p.id===activeProjectId);
    if(cur){
      cur.rows   = rows.filter(r=>r._type==='tache').map(r=>({...r}));
      cur.jalons = rows.filter(r=>r._type==='jalon').map(r=>({...r}));
      cur.projectColors={...projectColors};
      cur.collapsed={...collapsed};
    }
    savePortfolio();
  }
  activeProjectId = id;
  const proj = portfolio.find(p=>p.id===id);
  if(!proj) return;
  rows = [
    ...proj.rows.filter(r=>r._type==='tache').map(r=>({...r})),
    ...(proj.jalons||[]).map(r=>({...r}))
  ];
  projectColors = {...proj.projectColors};
  collapsed = {...proj.collapsed};
  sortRows();
  
  renderNavList();
  renderAll();
}
function deleteProject(id, e){
  e.stopPropagation();
  const proj = portfolio.find(p=>p.id===id);
  if(!proj) return;
  if(!confirm(`Supprimer le projet "${proj.name}" ?`)) return;
  portfolio = portfolio.filter(p=>p.id!==id);
  savePortfolio();
  if(activeProjectId===id){
    activeProjectId = null;
    rows=[]; projectColors={}; collapsed={};
    
    if(portfolio.length>0) switchToProject(portfolio[0].id);
    else renderAll();
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
const _origRenderAll = typeof renderAll !== 'undefined' ? renderAll : null;
function saveCurrentProject(){
  if(!activeProjectId) return;
  const proj = portfolio.find(p=>p.id===activeProjectId);
  if(proj){
    proj.rows   = rows.filter(r=>r._type==='tache').map(r=>({...r}));
    proj.jalons = rows.filter(r=>r._type==='jalon').map(r=>({...r}));
    proj.projectColors={...projectColors};
    proj.collapsed={...collapsed};
    savePortfolio();
  }
}
function importToNewProject(parsedRows, fileName){
  const name = fileName.replace(/\.[^.]+$/, '').replace(/[_-]/g,' ');
  createNewProject(name, parsedRows, {});
}
(function(){
  portfolio = [];
  renderNavList();
})();
let epEditingIdx = null;
let epMode = 'new';
const MAX_NIVEAUX = 5;
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
      /* Task ID externe (importé depuis XML) — lecture seule */
      const _extIdGrp = document.getElementById('epExternalIdGroup');
      if (_extIdGrp) {
        if (r.externalTaskId) {
          document.getElementById('epExternalId').value = r.externalTaskId;
          _extIdGrp.style.display = '';
        } else {
          _extIdGrp.style.display = 'none';
        }
      }
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
    const _extIdGrpNew = document.getElementById('epExternalIdGroup');
    if (_extIdGrpNew) _extIdGrpNew.style.display = 'none';
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
  const projets = [...new Set((taskRows||rows.filter(r=>r._type==='tache')).map(r=>r.projet))];
  const sel = document.getElementById('epProjetSelect');
  if(!sel) return;
  sel.innerHTML = projets.map(p=>`<option value="${escH(p)}">${escH(p)}</option>`).join('')
    + `<option value="__NEW__">＋ Nouveau projet…</option>`;
}
function getEpProjet(){
  const sel = document.getElementById('epProjetSelect');
  const custom = document.getElementById('epProjetCustom');
  if(sel && sel.value === '__NEW__') return (custom?.value||'').trim();
  return (sel?.value||'').trim();
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
function onEpProjetSelectChange(){
  const sel = document.getElementById('epProjetSelect');
  const custom = document.getElementById('epProjetCustom');
  if(sel && sel.value==='__NEW__'){
    custom.style.display='block';
    custom.value='';
    custom.focus();
  } else {
    custom.style.display='none';
    custom.value='';
  }
  renderEpNiveaux([], false);
  _updateNiveauxVisibility();
}
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
function closeAllPanels(){ closeEditPanel(); closeJalonPanel(); }
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
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeEditPanel();
});
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
let _fbSaveTimer  = null;
let _fbSaving     = false;
let _fbInitLoaded = false;
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
let _lastSaveTs = 0; 
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
(function waitForFbAndLoad(){
  let attempts = 0;
  const iv = setInterval(()=>{
    attempts++;
    if(typeof window._fbOnValue === 'function'){
      clearInterval(iv);
      setFbStatus('⏳ Chargement...', '#f7971e');
      window._fbOnValue(function(val){
        if(_fbInitLoaded && (Date.now() - _lastSaveTs) < 4000){
          return;
        }
        if(val && Array.isArray(val) && val.length){
          const activeId = activeProjectId;
          portfolio = migrateFirebaseData(val);
          renderNavList();
          const target = activeId && portfolio.find(p=>p.id===activeId)
            ? activeId : portfolio[0]?.id;
          if(target) switchToProject(target);
          setFbStatus('☁ Connecté', '#2e7d32');
        } else if(!_fbInitLoaded){
          setFbStatus('☁ Vide', '#f7971e');
        }
        _fbInitLoaded = true;
      });
    } else if(attempts > 60){
      clearInterval(iv);
      setFbStatus('⚠ Firebase indisponible', '#e17055');
    }
  }, 100);
})();
let jpEditingIdx = null;
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
  if(e.key==='Escape') closeJalonPanel();
});
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