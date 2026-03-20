/**
 * portfolio.js
 * Project portfolio management: CRUD, persistence, navigation.
 *
 * Depends on: config.js, state.js, utils.js (escH), sort.js (sortRows),
 *             firebase.js (scheduleFirebaseSave)
 * Calls (at runtime): renderAll(), renderGantt() from render.js / ui.js
 */

// ── Persistence ───────────────────────────────────────────────────────────────

// -- Persist --
function savePortfolio(){
  const data = portfolio.map(p=>({
    id:p.id, name:p.name, client:p.client||'',
    rows: p.rows
      .filter(r=>r._type!=='jalon') // jalons stockés séparément
      .map(r=>({...r, debut:r.debut?r.debut.toISOString():null, fin:r.fin?r.fin.toISOString():null})),
    jalons: (p.jalons||[]).map(j=>({...j, date:j.date?j.date.toISOString():null})),
    projectColors: p.projectColors||{},
    collapsed: p.collapsed||{}
  }));
  scheduleFirebaseSave(data);
}


// ── Save current project state ────────────────────────────────────────────────

// -- Auto-save current project on any renderAll --
const _origRenderAll = typeof renderAll !== 'undefined' ? renderAll : null;
function saveCurrentProject(){
  if(!activeProjectId) return;
  const proj = portfolio.find(p=>p.id===activeProjectId);
  if(proj){
    // Ne sauvegarder que les données brutes (tâches + jalons), pas les lignes synthétiques
    proj.rows   = rows.filter(r=>r._type==='tache').map(r=>({...r}));
    proj.jalons = rows.filter(r=>r._type==='jalon').map(r=>({...r}));
    proj.projectColors={...projectColors};
    proj.collapsed={...collapsed};
    savePortfolio();
  }
}

// -- Import Excel -> creates new project --
function importToNewProject(parsedRows, fileName){
  const name = fileName.replace(/\.[^.]+$/, '').replace(/[_-]/g,' ');
  createNewProject(name, parsedRows, {});
}

// ── Switch active project ────────────────────────────────────────────────────

// -- Switch active project --
function switchToProject(id){
  // Save current state first
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
  // Load into global state — tâches depuis proj.rows, jalons depuis proj.jalons
  rows = [
    ...proj.rows.filter(r=>r._type==='tache').map(r=>({...r})),
    ...(proj.jalons||[]).map(r=>({...r}))
  ];
  projectColors = {...proj.projectColors};
  collapsed = {...proj.collapsed};
  // Trier avant affichage
  sortRows();
  // Update page title
  document.getElementById('activeProjectName').textContent = proj.name;
  renderNavList();
  renderAll();
}

// ── Create ───────────────────────────────────────────────────────────────────

// -- Create new project --

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

// ── Delete / Duplicate / Rename ───────────────────────────────────────────────

// -- Delete project --
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
    document.getElementById('activeProjectName').textContent = '—';
    if(portfolio.length>0) switchToProject(portfolio[0].id);
    else renderAll();
  }
  renderNavList();
}

// -- Duplicate project --
function duplicateProject(id, e){
  e.stopPropagation();
  const proj = portfolio.find(p=>p.id===id);
  if(!proj) return;
  // Save current state before duplicating
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

// -- Rename project -- inline in nav --
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

// ── Sidebar navigation ────────────────────────────────────────────────────────

// -- Render nav list --
function renderNavList(){
  const list = document.getElementById('navList');
  if(!list) return;
  if(portfolio.length===0){
    list.innerHTML='<div class="nav-empty">Aucun projet.<br>Créez-en un pour commencer.</div>';
    return;
  }
  // Grouper par client
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

// -- Toggle nav collapse --

// ── Client navigation ─────────────────────────────────────────────────────────

// ====== NAVIGATION CLIENT ======
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