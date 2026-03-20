/**
 * ui.js
 * General UI interactions: zoom, theme, resize, drag, color picker,
 * date toggles, renderAll, keyboard shortcuts.
 *
 * Depends on: config.js, state.js, utils.js, render.js (renderGantt)
 * Note: The renderAll patch (→ saveCurrentProject) is applied in init.js
 *       after all modules are loaded.
 */

// ── View & Zoom ───────────────────────────────────────────────────────────────

// ====== VIEW / ZOOM ======
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

// ── Date column toggle ────────────────────────────────────────────────────────

// ====== TOGGLE DATES ======
function toggleDates(){
  showDates=!showDates;
  const btn=document.getElementById('toggleDatesBtn');
  if(btn){btn.textContent=showDates?'Masquer dates':'Afficher dates';btn.classList.toggle('hidden-dates',!showDates);}
  document.querySelectorAll('.row-dates').forEach(el=>el.classList.toggle('hidden',!showDates));
}

// ── Left panel resize ─────────────────────────────────────────────────────────

// ====== RESIZE HANDLE ======
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

// ====== COLLAPSE (voir définition plus haut) ======

// ── Drag scroll ───────────────────────────────────────────────────────────────

// ====== DRAG SCROLL ======
function initDrag(el){
  let down=false,startX,sl;
  el.addEventListener('mousedown',e=>{if(e.target.closest('.gantt-bar,.toggle-btn'))return;down=true;startX=e.pageX-el.offsetLeft;sl=el.scrollLeft;el.style.cursor='grabbing';});
  el.addEventListener('mouseleave',()=>{down=false;el.style.cursor='grab';});
  el.addEventListener('mouseup',()=>{down=false;el.style.cursor='grab';});
  el.addEventListener('mousemove',e=>{if(!down)return;e.preventDefault();el.scrollLeft=sl-(e.pageX-el.offsetLeft-startX);});
}

// ── Color picker ─────────────────────────────────────────────────────────────

// ====== COLOR PICKER ======
cpTarget=null;
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
document.getElementById('cpCustom').addEventListener('input', e => {
  if (!cpTarget) return;
  projectColors[cpTarget] = e.target.value;
  document.getElementById('colorGrid').querySelectorAll('.color-opt').forEach(el => el.classList.remove('selected'));
  renderAll();
});
document.addEventListener('click', e => {
  if (!document.getElementById('colorPopup').contains(e.target))
    document.getElementById('colorPopup').style.display = 'none';
});

// ── Theme ─────────────────────────────────────────────────────────────────────

// ====== THEME TOGGLE ======
function toggleTheme(){
  const html=document.documentElement;
  const isDark=html.getAttribute('data-theme')==='dark';
  html.setAttribute('data-theme',isDark?'light':'dark');
  const btn=document.getElementById('btnTheme');
  if(btn)btn.textContent=isDark?'🌙 Sombre':'☀ Clair';
}

// ── renderAll (patched in init.js to also call saveCurrentProject) ────────────

function renderAll() { renderGantt(); }

// ── clearAll ─────────────────────────────────────────────────────────────────

function clearAll() {
  if (!rows.length || confirm('Tout effacer ?')) {
    rows = []; projectColors = {}; collapsed = {}; editingIdx = null;
    const f = document.getElementById('addForm');
    if (f) f.style.display = 'none';
    renderAll();
  }
}

// ── Data section toggle ───────────────────────────────────────────────────────

function toggleDataSection() {
  dataSectionOpen = !dataSectionOpen;
  const section = document.getElementById('dataSection');
  const icon    = document.getElementById('dataToggleIcon');
  if (section) section.style.display = dataSectionOpen ? 'block' : 'none';
  if (icon)    icon.innerHTML = dataSectionOpen ? '&#9660;' : '&#9654;';
}

// ── Rename Gantt title ────────────────────────────────────────────────────────

// ====== RENOMMAGE TITRE GANTT ======
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

// ── Edit panel date validation ────────────────────────────────────────────────

// ====== VALIDATION DATES EDIT PANEL ======
function onEpDebutChange(){
  const debut = document.getElementById('epDebut');
  const fin   = document.getElementById('epFin');
  if(!debut.value) return;
  // Si fin vide ou inférieure au début : initialiser fin = début
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

</script>

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeEditPanel();
    closeJalonPanel();
  }
});
