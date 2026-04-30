/* ═══════════════════════════════════════════
   todo-ui.js — Rendu sidebar + liste (v2)
   ═══════════════════════════════════════════ */

/* ── Helpers types/statuts (compat string legacy ou {name,color}) ── */
function _todoTypeName(t)    { return typeof t === 'object' ? (t?.name  || '') : (t  || ''); }
function _todoTypeColor(t)   { return typeof t === 'object' ? (t?.color || '#546e7a') : '#546e7a'; }
function _todoStatusName(s)  { return typeof s === 'object' ? (s?.name  || '') : (s  || ''); }
function _todoStatusColor(s) { return typeof s === 'object' ? (s?.color || '#546e7a') : '#546e7a'; }
function _todoFindType(name) {
  return _todoData.settings.taskTypes.find(t => _todoTypeName(t) === name) || null;
}
function _todoFindStatus(name) {
  return _todoData.settings.taskStatuses.find(s => _todoStatusName(s) === name) || null;
}

/* ── Préférences de vue persistées ── */
function _todoViewCtx() { return _todoSelectedFolderId || 'all'; }
function _todoGetViewPrefs(ctx) {
  return (_todoData.settings.viewPrefs || {})[ctx || 'all'] || {};
}
function _todoSetViewPrefs(ctx, updates) {
  if (!_todoData.settings.viewPrefs) _todoData.settings.viewPrefs = {};
  const key = ctx || 'all';
  _todoData.settings.viewPrefs[key] = { ...(_todoData.settings.viewPrefs[key] || {}), ...updates };
  _todoSave();
}

/* ── Point d'entrée (appelé par router.js) ── */
function renderTodoView() {
  const root = document.getElementById('viewTodo');
  if (!root) return;

  if (!_todoLoaded) {
    root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;
      width:100%;height:100%;color:var(--muted);font-size:13px;gap:10px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>Chargement…</div>`;
    return;
  }

  root.innerHTML = `
    <div class="todo-sidebar" id="todoSidebar"></div>
    <div class="todo-main" id="todoMain"></div>`;

  _todoRenderSidebar();
  _todoRenderTaskList();
  _todoAttachGlobalEvents();
}

/* ── Rendu complet (sidebar + liste) ── */
function _todoRender() {
  const root = document.getElementById('viewTodo');
  if (!root || !root.querySelector('#todoSidebar')) {
    renderTodoView();
    return;
  }
  _todoRenderSidebar();
  _todoRenderTaskList();
}

/* ══════════════════════════════════════════
   SIDEBAR
   ══════════════════════════════════════════ */
function _todoRenderSidebar() {
  const el = document.getElementById('todoSidebar');
  if (!el) return;

  const allCount    = _todoAllTasks().filter(t => !t.parentId && !t.completed).length;
  const inboxCount  = _todoData.tasks.filter(t => !t.parentId && !t.folderId && !t.completed).length;

  let html = `
    <!-- Vue globale + Boîte de réception -->
    <div class="todo-sidebar-section" style="margin-top:4px;">
      <div class="todo-sidebar-item ${_todoSelectedFolderId === null ? 'active' : ''}"
           onclick="_todoSelectFolder(null)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        Toutes les tâches
        <span class="todo-sidebar-count">${allCount}</span>
      </div>
      <div class="todo-sidebar-item ${_todoSelectedFolderId === 'inbox' ? 'active' : ''}"
           onclick="_todoSelectFolder('inbox')"
           ondragover="event.preventDefault();event.currentTarget.classList.add('drag-over-folder')"
           ondragleave="event.currentTarget.classList.remove('drag-over-folder')"
           ondrop="_todoDropToFolder(event,null)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
        </svg>
        Boîte de réception
        <span class="todo-sidebar-count">${inboxCount}</span>
      </div>
    </div>`;

  /* ── Section Vues ── */
  html += `
    <div class="todo-sidebar-section">
      <div class="todo-sidebar-section-header" onclick="_todoToggleSection('views')">
        <div class="todo-section-toggle" id="todoSectionToggleViews">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          Vues
        </div>
        <div class="todo-section-add" title="Nouvelle vue" onclick="event.stopPropagation();_todoOpenViewDialog()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
      </div>
      <div id="todoViewsList">`;

  _todoData.views.forEach(v => {
    const isActive = _todoSelectedFolderId === 'view:' + v.id;
    const cnt = _todoApplyViewFilters(_todoAllTasks().filter(t => !t.parentId && !t.completed), v.filters).length;
    html += `
      <div class="todo-sidebar-item ${isActive ? 'active' : ''}"
           onclick="_todoSelectFolder('view:${v.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(v.name)}</span>
        <span class="todo-sidebar-count">${cnt}</span>
        <div class="todo-folder-actions">
          <div class="todo-folder-btn" title="Modifier" onclick="event.stopPropagation();_todoOpenViewDialog('${v.id}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <div class="todo-folder-btn danger" title="Supprimer" onclick="event.stopPropagation();_todoConfirmDeleteView('${v.id}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
            </svg>
          </div>
        </div>
      </div>`;
  });

  html += `</div></div>`;

  /* ── Section Dossiers ── */
  html += `
    <div class="todo-sidebar-section">
      <div class="todo-sidebar-section-header" onclick="_todoToggleSection('folders')">
        <div class="todo-section-toggle" id="todoSectionToggleFolders">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          Dossiers
        </div>
        <div class="todo-section-add" title="Nouveau dossier" onclick="event.stopPropagation();_todoOpenFolderDialog()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
      </div>
      <div id="todoFoldersList">`;

  const sorted = [..._todoData.folders].sort((a, b) => (a.order || 0) - (b.order || 0));
  sorted.forEach((f, idx) => {
    const isActive = _todoSelectedFolderId === f.id;
    const cnt = _todoData.tasks.filter(t => t.folderId === f.id && !t.parentId && !t.completed).length;
    html += `
      <div class="todo-sidebar-item ${isActive ? 'active' : ''}"
           data-folder-id="${f.id}" data-folder-idx="${idx}"
           draggable="true"
           onclick="_todoSelectFolder('${f.id}')"
           ondragstart="_todoFolderDragStart(event,'${f.id}',${idx})"
           ondragover="_todoTaskDragId ? (event.preventDefault(),event.currentTarget.classList.add('drag-over-folder')) : _todoFolderDragOver(event,${idx})"
           ondragleave="_todoFolderDragLeave(event)"
           ondrop="_todoTaskDragId ? _todoDropToFolder(event,'${f.id}') : _todoFolderDrop(event,${idx})">
        <div class="todo-folder-dot" style="background:${f.color || '#EC7206'}"></div>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(f.name)}</span>
        <span class="todo-sidebar-count">${cnt}</span>
        <div class="todo-folder-actions">
          <div class="todo-folder-btn" title="Renommer" onclick="event.stopPropagation();_todoOpenFolderDialog('${f.id}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <div class="todo-folder-btn danger" title="Supprimer" onclick="event.stopPropagation();_todoConfirmDeleteFolder('${f.id}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            </svg>
          </div>
        </div>
      </div>`;
  });

  html += `</div></div>`;
  el.innerHTML = html;
}

/* ── Sélection dossier / vue ── */
function _todoSelectFolder(id) {
  _todoSelectedFolderId = id;
  _todoRenderSidebar();
  _todoRenderTaskList();
}

/* ── Toggle section (collapse) ── */
function _todoToggleSection(section) {
  const list   = document.getElementById(section === 'views' ? 'todoViewsList' : 'todoFoldersList');
  const toggle = document.getElementById('todoSectionToggle' + (section === 'views' ? 'Views' : 'Folders'));
  if (!list) return;
  const hidden = list.style.display === 'none';
  list.style.display = hidden ? '' : 'none';
  if (toggle) toggle.classList.toggle('collapsed', !hidden);
}

/* ── Drag & drop dossiers ── */
let _todoFolderDragIdx = null;

function _todoFolderDragStart(e, id, idx) {
  _todoFolderDragIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => {
    const el = document.querySelector(`[data-folder-id="${id}"]`);
    if (el) el.classList.add('dragging');
  }, 0);
}

function _todoFolderDragOver(e, toIdx) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.todo-sidebar-item[data-folder-idx]').forEach(el => el.classList.remove('drag-over-folder'));
  const el = document.querySelector(`[data-folder-idx="${toIdx}"]`);
  if (el) el.classList.add('drag-over-folder');
}

function _todoFolderDragLeave(e) {
  e.currentTarget.classList.remove('drag-over-folder');
}

function _todoFolderDrop(e, toIdx) {
  e.preventDefault();
  document.querySelectorAll('.todo-sidebar-item').forEach(el => {
    el.classList.remove('dragging', 'drag-over-folder');
  });
  if (_todoFolderDragIdx === null || _todoFolderDragIdx === toIdx) return;
  _todoReorderFolders(_todoFolderDragIdx, toIdx);
  _todoFolderDragIdx = null;
}

/* ── Utilitaire escaping ── */
function _esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
/* Détecte les URLs dans du texte déjà échappé et les rend cliquables */
function _todoLinkify(text) {
  return _esc(text).replace(
    /(https?:\/\/[^\s<>"']+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" style="color:var(--accent);word-break:break-all;text-decoration:underline">$1</a>'
  );
}

/* ══════════════════════════════════════════
   LISTE DE TÂCHES (2/3)
   ══════════════════════════════════════════ */
function _todoRenderTaskList() {
  const main = document.getElementById('todoMain');
  if (!main) return;

  const ctx           = _todoViewCtx();
  const prefs         = _todoGetViewPrefs(ctx);
  const sort          = prefs.sort          || { field: 'order', dir: 'asc' };
  const group         = prefs.group         || 'none';
  const hideCompleted = prefs.hideCompleted !== false; /* true par défaut */

  let title     = 'Toutes les tâches';
  let filters   = null;
  let baseTasks = _todoAllTasks();

  if (_todoSelectedFolderId === 'inbox') {
    title     = 'Boîte de réception';
    baseTasks = _todoData.tasks.filter(t => !t.folderId);
  } else if (_todoSelectedFolderId && _todoSelectedFolderId.startsWith('view:')) {
    const vid  = _todoSelectedFolderId.slice(5);
    const view = _todoData.views.find(v => v.id === vid);
    title   = view ? view.name : 'Vue';
    filters = view ? view.filters : {};
  } else if (_todoSelectedFolderId) {
    const folder = _todoData.folders.find(f => f.id === _todoSelectedFolderId);
    title     = folder ? folder.name : 'Dossier';
    baseTasks = _todoData.tasks.filter(t => t.folderId === _todoSelectedFolderId);
  }

  if (filters)        baseTasks = _todoApplyViewFilters(baseTasks, filters);
  if (hideCompleted)  baseTasks = baseTasks.filter(t => !t.completed);

  const rootTasks   = baseTasks.filter(t => !t.parentId);
  const sortedTasks = _todoSortTasksBy(rootTasks, sort);

  const sortLabels  = {
    order:'Manuel', priority:'Priorité', dueDate:'Échéance',
    title:'Nom', status:'Statut', type:'Type', created:'Création'
  };
  const groupLabels = { none:'Aucun', type:'Type', status:'Statut', priority:'Priorité', folder:'Dossier' };

  main.innerHTML = `
    <div class="todo-main-header">
      <div class="todo-main-title">${_esc(title)}</div>

      <button class="todo-sort-btn ${hideCompleted ? 'active' : ''}"
              title="${hideCompleted ? 'Afficher terminées' : 'Masquer terminées'}"
              onclick="_todoToggleHideCompleted()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${hideCompleted
            ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
            : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'}
        </svg>
        ${hideCompleted ? 'Masquer terminées' : 'Afficher terminées'}
      </button>

      <div style="position:relative">
        <button class="todo-sort-btn ${group !== 'none' ? 'active' : ''}" onclick="_todoToggleGroupMenu(this)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
          Grouper : ${groupLabels[group] || 'Aucun'}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div class="todo-sort-menu" id="todoGroupMenu">
          ${Object.entries(groupLabels).map(([k, l]) => `
            <div class="todo-sort-option ${group === k ? 'active' : ''}"
                 onclick="_todoSetGroup('${k}')">${l}</div>`).join('')}
        </div>
      </div>

      <div style="position:relative">
        <button class="todo-sort-btn ${sort.field !== 'order' ? 'active' : ''}" onclick="_todoToggleSortMenu(this)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/>
            <line x1="3" y1="18" x2="9" y2="18"/>
          </svg>
          Trier : ${sortLabels[sort.field] || 'Manuel'}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div class="todo-sort-menu" id="todoSortMenu">
          ${Object.entries(sortLabels).map(([f, l]) => `
            <div class="todo-sort-option ${sort.field === f ? 'active' : ''}"
                 onclick="_todoSetSort('${f}')">
              ${l}
              ${sort.field === f ? `<span class="sort-dir">${sort.dir === 'asc' ? '↑' : '↓'}</span>` : ''}
            </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="todo-body" id="todoBody"></div>`;

  const body = document.getElementById('todoBody');

  if (sortedTasks.length === 0) {
    body.innerHTML = `
      <div class="todo-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        <div class="todo-empty-title">Aucune tâche</div>
        <div class="todo-empty-sub">Ajoutez votre première tâche ci-dessous</div>
      </div>`;
  } else if (group === 'none') {
    let html = '';
    sortedTasks.forEach(task => {
      html += _todoTaskRowHtml(task, false);
      _todoSortTasksBy(baseTasks.filter(t => t.parentId === task.id), sort)
        .forEach(st => { html += _todoTaskRowHtml(st, true); });
    });
    body.innerHTML = `<div class="todo-task-list" id="todoTaskList">${html}</div>`;
  } else {
    const groups = _todoGroupTasks(sortedTasks, group);
    let html = '';
    groups.forEach(({ label, color, tasks: gTasks }) => {
      html += `<div class="todo-group">
        <div class="todo-group-title">
          ${color ? `<span class="todo-group-dot" style="background:${color}"></span>` : ''}
          ${_esc(label)}<span class="todo-group-count">${gTasks.length}</span>
        </div>`;
      gTasks.forEach(task => {
        html += _todoTaskRowHtml(task, false);
        _todoSortTasksBy(baseTasks.filter(t => t.parentId === task.id), sort)
          .forEach(st => { html += _todoTaskRowHtml(st, true); });
      });
      html += `</div>`;
    });
    body.innerHTML = `<div class="todo-task-list" id="todoTaskList">${html}</div>`;
  }

  _todoAttachTaskEvents();

  body.insertAdjacentHTML('beforeend', `
    <div class="todo-add-bar" id="todoAddBar" onclick="document.getElementById('todoAddInput').focus()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      <input id="todoAddInput" class="todo-add-input" placeholder="Ajouter une tâche…"
             onkeydown="_todoAddBarKey(event)" onclick="event.stopPropagation()">
    </div>`);
}

/* ── Tri par config objet ── */
function _todoSortTasksBy(tasks, sort) {
  const field = sort?.field || 'order';
  const dir   = sort?.dir   || 'asc';
  const m     = dir === 'asc' ? 1 : -1;
  return [...tasks].sort((a, b) => {
    switch (field) {
      case 'priority': return m * ((_PRIORITY_ORDER[a.priority]||3)-(_PRIORITY_ORDER[b.priority]||3));
      case 'dueDate':  return m * ((a.dueDate ? new Date(a.dueDate) : new Date('9999')) - (b.dueDate ? new Date(b.dueDate) : new Date('9999')));
      case 'title':    return m * a.title.localeCompare(b.title, 'fr');
      case 'status':   return m * (_todoStatusName(a.status)||'').localeCompare(_todoStatusName(b.status)||'', 'fr');
      case 'type':     return m * (_todoTypeName(a.type)||'').localeCompare(_todoTypeName(b.type)||'', 'fr');
      case 'created':  return m * (new Date(a.createdAt) - new Date(b.createdAt));
      default:         return m * ((a.order||0)-(b.order||0));
    }
  });
}

/* ── Groupement ── */
function _todoGroupTasks(tasks, groupBy) {
  const map = new Map();
  const pColors = { P1:'#db4035', P2:'#ff9a14', P3:'#4073ff', P4:'#888' };
  tasks.forEach(task => {
    let key, label, color;
    if (groupBy === 'type') {
      label = _todoTypeName(task.type) || '(Sans type)';
      color = _todoTypeColor(_todoFindType(_todoTypeName(task.type)) || task.type);
      key   = label;
    } else if (groupBy === 'status') {
      label = _todoStatusName(task.status) || '(Sans statut)';
      color = _todoStatusColor(_todoFindStatus(_todoStatusName(task.status)) || task.status);
      key   = label;
    } else if (groupBy === 'folder') {
      const folder = _todoData.folders.find(f => f.id === task.folderId);
      label = folder ? folder.name : '(Sans dossier)';
      color = folder ? (folder.color || '#888') : '#888';
      key   = task.folderId || '__none__';
    } else {
      key   = task.priority || 'P4';
      label = key;
      color = pColors[key] || '#888';
    }
    if (!map.has(key)) map.set(key, { label, color, tasks: [] });
    map.get(key).tasks.push(task);
  });
  return [...map.values()];
}

/* ── HTML d'une ligne de tâche ── */
function _todoTaskRowHtml(task, isSub) {
  const pClass   = (task.priority || 'P4').toLowerCase();
  const checked  = task.completed ? 'checked' : '';
  const doneClass= task.completed ? 'completed' : '';
  const subClass = isSub ? 'subtask' : '';

  /* Méta pills (avec couleurs dynamiques et édition inline) */
  const typeName    = _todoTypeName(task.type);
  const typeColor   = _todoTypeColor(_todoFindType(typeName) || task.type);
  const statusName  = _todoStatusName(task.status);
  const statusColor = _todoStatusColor(_todoFindStatus(statusName) || task.status);

  let meta = '';
  /* Badge dossier en premier — vue globale ET vues personnalisées */
  const _isViewOrAll = !_todoSelectedFolderId || (_todoSelectedFolderId || '').startsWith('view:');
  if (_isViewOrAll && task.folderId && !isSub) {
    const folder = _todoData.folders.find(f => f.id === task.folderId);
    if (folder) {
      meta += `<span class="todo-pill todo-pill-folder" style="--c:${folder.color || '#888'}">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        ${_esc(folder.name)}</span>`;
    }
  }
  if (task.priority && task.priority !== 'P4') {
    meta += `<span class="todo-pill todo-pill-priority ${pClass} todo-pill-clickable"
      onclick="event.stopPropagation();_todoPillEdit(event,'priority','${task.id}')">${_esc(task.priority)}</span>`;
  }
  if (statusName) {
    meta += `<span class="todo-pill todo-pill-status todo-pill-clickable" style="--c:${statusColor}"
      onclick="event.stopPropagation();_todoPillEdit(event,'status','${task.id}')">${_esc(statusName)}</span>`;
  }
  if (typeName) {
    meta += `<span class="todo-pill todo-pill-type todo-pill-clickable" style="--c:${typeColor}"
      onclick="event.stopPropagation();_todoPillEdit(event,'type','${task.id}')">${_esc(typeName)}</span>`;
  }
  if (task.dueDate) {
    const overdue = !task.completed && _todoIsOverdue(task.dueDate) ? 'overdue' : '';
    meta += `<span class="todo-pill todo-pill-date ${overdue} todo-pill-clickable"
      onclick="event.stopPropagation();_todoPillEdit(event,'dueDate','${task.id}')">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      ${_todoFmtDate(task.dueDate)}</span>`;
  }
  if ((task.assignees || []).length) {
    task.assignees.slice(0, 2).forEach(a => {
      meta += `<span class="todo-pill todo-pill-assignee">${_esc(a.name || a)}</span>`;
    });
    if (task.assignees.length > 2) meta += `<span class="todo-pill todo-pill-assignee">+${task.assignees.length - 2}</span>`;
  }

  if (task.recurrence && task.recurrence.type !== 'none') {
    meta += `<span class="todo-recurrence-badge">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
        <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
      </svg>
      Récurrent</span>`;
  }

  /* Comptage sous-tâches */
  const subCount = _todoData.tasks.filter(t => t.parentId === task.id).length;
  const subDone  = _todoData.tasks.filter(t => t.parentId === task.id && t.completed).length;
  if (subCount > 0 && !isSub) {
    meta += `<span class="todo-subtask-count">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
      ${subDone}/${subCount}</span>`;
  }

  const commentCount = (task.comments || []).length;
  if (commentCount > 0) {
    meta += `<span class="todo-subtask-count">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      ${commentCount}</span>`;
  }

  return `
    <div class="todo-task-row ${subClass} ${doneClass}" data-task-id="${task.id}"
         draggable="true"
         ondragstart="_todoTaskDragStart(event,'${task.id}')"
         ondragover="_todoTaskDragOver(event,'${task.id}')"
         ondrop="_todoTaskDrop(event,'${task.id}')"
         ondragleave="_todoTaskDragLeave(event)">
      <div class="todo-check ${pClass} ${checked}"
           onclick="event.stopPropagation();_todoCompleteTask('${task.id}')">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="todo-task-content" onclick="${isSub ? `_todoOpenModalSub('${task.id}','${task.parentId}')` : `_todoOpenModal('${task.id}')`}">
        <div class="todo-task-title">${_todoLinkify(task.title)}</div>
        ${meta ? `<div class="todo-task-meta">${meta}</div>` : ''}
      </div>
      <div class="todo-task-actions">
        <div class="todo-task-action-btn" title="Modifier" onclick="event.stopPropagation();${isSub ? `_todoOpenModalSub('${task.id}','${task.parentId}')` : `_todoOpenModal('${task.id}')`}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </div>
        ${!isSub ? `<div class="todo-task-action-btn" title="Dupliquer" onclick="event.stopPropagation();_todoDuplicateTask('${task.id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </div>` : ''}
        <div class="todo-task-action-btn danger" title="Supprimer" onclick="event.stopPropagation();_todoConfirmDeleteTask('${task.id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          </svg>
        </div>
      </div>
    </div>`;
}

/* ── Ajout rapide — ouvre le modal pour forcer Type & Statut ── */
function _todoAddBarKey(e) {
  if (e.key !== 'Enter') return;
  const input = e.target;
  const title = input.value.trim();
  if (!title) return;
  const _isSpecialCtx = !_todoSelectedFolderId ||
    _todoSelectedFolderId === 'inbox' ||
    _todoSelectedFolderId.startsWith('view:');
  const folderId = _isSpecialCtx ? null : _todoSelectedFolderId;
  const task = _todoCreateTask(title, folderId, null);
  input.value = '';
  _todoRenderTaskList();
  _todoRenderSidebar();
  /* Ouvre immédiatement le modal pour que l'utilisateur renseigne Type & Statut */
  _todoOpenModal(task.id);
  _todoShowToast('Tâche créée — renseignez Type et Statut');
}

/* ── Tri persisté ── */
function _todoToggleSortMenu(btn) {
  const menu = document.getElementById('todoSortMenu');
  if (!menu) return;
  document.getElementById('todoGroupMenu')?.classList.remove('open');
  const open = menu.classList.toggle('open');
  if (open) {
    const close = e => { if (!btn.contains(e.target) && !menu.contains(e.target)) { menu.classList.remove('open'); document.removeEventListener('click', close); }};
    setTimeout(() => document.addEventListener('click', close), 0);
  }
}

function _todoSetSort(field) {
  const ctx   = _todoViewCtx();
  const prefs = _todoGetViewPrefs(ctx);
  const cur   = prefs.sort || { field: 'order', dir: 'asc' };
  const dir   = cur.field === field ? (cur.dir === 'asc' ? 'desc' : 'asc') : 'asc';
  _todoSetViewPrefs(ctx, { sort: { field, dir } });
  document.getElementById('todoSortMenu')?.classList.remove('open');
  _todoRenderTaskList();
}

/* ── Regroupement persisté ── */
function _todoToggleGroupMenu(btn) {
  const menu = document.getElementById('todoGroupMenu');
  if (!menu) return;
  document.getElementById('todoSortMenu')?.classList.remove('open');
  const open = menu.classList.toggle('open');
  if (open) {
    const close = e => { if (!btn.contains(e.target) && !menu.contains(e.target)) { menu.classList.remove('open'); document.removeEventListener('click', close); }};
    setTimeout(() => document.addEventListener('click', close), 0);
  }
}

function _todoSetGroup(group) {
  _todoSetViewPrefs(_todoViewCtx(), { group });
  document.getElementById('todoGroupMenu')?.classList.remove('open');
  _todoRenderTaskList();
}

/* ── Masquer terminées persisté ── */
function _todoToggleHideCompleted() {
  const ctx   = _todoViewCtx();
  const prefs = _todoGetViewPrefs(ctx);
  _todoSetViewPrefs(ctx, { hideCompleted: prefs.hideCompleted === false });
  _todoRenderTaskList();
}

/* ── Édition inline pills ── */
function _todoPillEdit(event, field, taskId) {
  document.querySelector('.todo-pill-dropdown')?.remove();
  const task = _todoData.tasks.find(t => t.id === taskId);
  if (!task) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const drop = document.createElement('div');
  drop.className = 'todo-pill-dropdown';
  drop.style.cssText = 'position:fixed;z-index:2000;min-width:150px;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px var(--shadow);padding:4px 0;';
  let html = '';
  if (field === 'priority') {
    const pCol = { P1:'#db4035', P2:'#ff9a14', P3:'#4073ff', P4:'#aaa' };
    ['P1','P2','P3','P4'].forEach(p => {
      html += `<div class="todo-pill-opt ${task.priority===p?'selected':''}" onclick="_todoPillSet('${taskId}','priority','${p}')">
        <span class="todo-pill-opt-dot" style="background:${pCol[p]}"></span>${p}</div>`;
    });
  } else if (field === 'status') {
    html += `<div class="todo-pill-opt ${!task.status?'selected':''}" onclick="_todoPillSet('${taskId}','status','')">— Aucun —</div>`;
    _todoData.settings.taskStatuses.forEach(s => {
      const n = _todoStatusName(s); const c = _todoStatusColor(s);
      html += `<div class="todo-pill-opt ${_todoStatusName(task.status)===n?'selected':''}" onclick="_todoPillSet('${taskId}','status','${_esc(n)}')">
        <span class="todo-pill-opt-dot" style="background:${c}"></span>${_esc(n)}</div>`;
    });
  } else if (field === 'type') {
    html += `<div class="todo-pill-opt ${!task.type?'selected':''}" onclick="_todoPillSet('${taskId}','type','')">— Aucun —</div>`;
    _todoData.settings.taskTypes.forEach(t => {
      const n = _todoTypeName(t); const c = _todoTypeColor(t);
      html += `<div class="todo-pill-opt ${_todoTypeName(task.type)===n?'selected':''}" onclick="_todoPillSet('${taskId}','type','${_esc(n)}')">
        <span class="todo-pill-opt-dot" style="background:${c}"></span>${_esc(n)}</div>`;
    });
  } else if (field === 'dueDate') {
    html = `<div style="padding:8px">
      <input type="date" value="${task.dueDate?task.dueDate.slice(0,10):''}"
             style="border:1px solid var(--border);border-radius:5px;padding:5px 8px;background:var(--surface2);color:var(--text);font-size:12px;outline:none"
             onchange="_todoPillSet('${taskId}','dueDate',this.value)">
      <div style="margin-top:6px;text-align:right">
        <span style="font-size:11px;color:var(--muted);cursor:pointer" onclick="_todoPillSet('${taskId}','dueDate','')">Effacer</span>
      </div></div>`;
  }
  drop.innerHTML = html;
  document.body.appendChild(drop);
  const dr = drop.getBoundingClientRect();
  let top = rect.bottom + 4, left = rect.left;
  if (top + dr.height > window.innerHeight) top = rect.top - dr.height - 4;
  if (left + dr.width  > window.innerWidth)  left = window.innerWidth - dr.width - 8;
  drop.style.top = top + 'px'; drop.style.left = left + 'px';
  setTimeout(() => document.addEventListener('click', function h(e) {
    if (!drop.contains(e.target)) { drop.remove(); document.removeEventListener('click', h, true); }
  }, true), 0);
}

function _todoPillSet(taskId, field, value) {
  document.querySelector('.todo-pill-dropdown')?.remove();
  if (field === 'dueDate') {
    _todoUpdateTask(taskId, { dueDate: value ? new Date(value).toISOString() : null });
  } else {
    _todoUpdateTask(taskId, { [field]: value });
  }
  _todoRenderTaskList();
  if (typeof _todoModalTaskId !== 'undefined' && _todoModalTaskId) _tmRenderRight();
}

/* ── Drag & drop tâches ── */
let _todoTaskDragId = null;

function _todoTaskDragStart(e, id) {
  _todoTaskDragId = id;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => {
    const el = document.querySelector(`[data-task-id="${id}"]`);
    if (el) el.classList.add('dragging');
  }, 0);
}

function _todoTaskDragOver(e, id) {
  e.preventDefault();
  if (_todoTaskDragId === id) return;
  document.querySelectorAll('.todo-task-row').forEach(el => el.classList.remove('drag-over'));
  const el = document.querySelector(`[data-task-id="${id}"]`);
  if (el) el.classList.add('drag-over');
}

function _todoTaskDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function _todoTaskDrop(e, toId) {
  e.preventDefault();
  document.querySelectorAll('.todo-task-row').forEach(el => el.classList.remove('dragging','drag-over'));
  if (!_todoTaskDragId || _todoTaskDragId === toId) { _todoTaskDragId = null; return; }
  const from = _todoData.tasks.find(t => t.id === _todoTaskDragId);
  const to   = _todoData.tasks.find(t => t.id === toId);
  if (!from || !to) { _todoTaskDragId = null; return; }
  const tmp = from.order; from.order = to.order; to.order = tmp;
  _todoSetViewPrefs(_todoViewCtx(), { sort: { field: 'order', dir: 'asc' } });
  _todoTaskDragId = null;
  _todoSave();
  _todoRenderTaskList();
}

/* Drop d'une tâche sur un dossier (sidebar) ou sur l'inbox (folderId=null) */
function _todoDropToFolder(e, folderId) {
  e.preventDefault();
  document.querySelectorAll('.todo-sidebar-item').forEach(el => el.classList.remove('drag-over-folder'));
  if (!_todoTaskDragId) return;
  const task = _todoData.tasks.find(t => t.id === _todoTaskDragId);
  if (!task) { _todoTaskDragId = null; return; }
  _todoUpdateTask(_todoTaskDragId, { folderId: folderId || null });
  /* Déplacer aussi les sous-tâches */
  _todoData.tasks.filter(t => t.parentId === _todoTaskDragId)
    .forEach(st => _todoUpdateTask(st.id, { folderId: folderId || null }));
  _todoTaskDragId = null;
  _todoRenderSidebar();
  _todoRenderTaskList();
  _todoShowToast('Tâche déplacée');
}

/* Dupliquer une tâche racine avec ses sous-tâches */
function _todoDuplicateTask(id) {
  const orig = _todoData.tasks.find(t => t.id === id);
  if (!orig || orig.parentId) return;
  const copy = _todoCreateTask(orig.title + ' (copie)', orig.folderId, null);
  ['description','type','priority','status','dueDate','recurrence'].forEach(f => {
    if (orig[f] !== undefined) copy[f] = orig[f];
  });
  _todoData.tasks.filter(t => t.parentId === id).forEach(st => {
    const sc = _todoCreateTask(st.title, copy.folderId, copy.id);
    ['description','type','priority','status','followsParent'].forEach(f => {
      if (st[f] !== undefined) sc[f] = st[f];
    });
  });
  _todoSave();
  _todoRenderTaskList();
  _todoRenderSidebar();
  _todoShowToast('Tâche dupliquée');
}

/* ── Événements globaux (une seule fois) ── */
let _todoGlobalEventsAttached = false;
function _todoAttachGlobalEvents() {
  if (_todoGlobalEventsAttached) return;
  _todoGlobalEventsAttached = true;
  document.addEventListener('keydown', _todoGlobalKey);
}

function _todoGlobalKey(e) {
  if (currentView !== 'todo') return;
  if (e.key === 'Escape') {
    document.querySelector('.todo-pill-dropdown')?.remove();
    _todoCloseModal();
    _todoCloseDialog();
  }
}

/* ── Attach events sur les lignes ── */
function _todoAttachTaskEvents() {
  /* Double-clic sur le titre pour renommer inline */
  document.querySelectorAll('.todo-task-title').forEach(el => {
    el.addEventListener('dblclick', e => {
      e.stopPropagation();
      const row    = el.closest('.todo-task-row');
      const taskId = row?.dataset.taskId;
      if (!taskId) return;
      const task = _todoData.tasks.find(t => t.id === taskId);
      if (!task) return;
      const input = document.createElement('input');
      input.type  = 'text';
      input.value = task.title;
      input.className = 'todo-add-input';
      input.style.cssText = 'font-weight:500;font-size:13px;width:100%';
      el.replaceWith(input);
      input.focus();
      input.select();
      const save = () => {
        const val = input.value.trim();
        if (val) _todoUpdateTask(taskId, { title: val });
        _todoRenderTaskList();
      };
      input.addEventListener('blur',  save);
      input.addEventListener('keydown', e2 => {
        if (e2.key === 'Enter') { input.blur(); }
        if (e2.key === 'Escape') { _todoRenderTaskList(); }
      });
    });
  });
}

/* ── Confirmations suppression ── */
function _todoConfirmDeleteTask(id) {
  if (!confirm('Supprimer cette tâche et ses sous-tâches ?')) return;
  _todoDeleteTask(id);
  _todoRenderSidebar();
  _todoShowToast('Tâche supprimée');
}

function _todoConfirmDeleteFolder(id) {
  const f = _todoData.folders.find(f => f.id === id);
  const cnt = _todoData.tasks.filter(t => t.folderId === id).length;
  if (!confirm(`Supprimer le dossier "${f?.name}"${cnt > 0 ? ` et ses ${cnt} tâche(s)` : ''} ?`)) return;
  _todoDeleteFolder(id);
  _todoShowToast('Dossier supprimé');
}

function _todoConfirmDeleteView(id) {
  const v = _todoData.views.find(v => v.id === id);
  if (!confirm(`Supprimer la vue "${v?.name}" ?`)) return;
  _todoDeleteView(id);
  _todoShowToast('Vue supprimée');
}

/* ══════════════════════════════════════════
   DIALOGS (3/3)
   ══════════════════════════════════════════ */

const _FOLDER_COLORS = [
  '#EC7206','#e53935','#8e24aa','#1e88e5',
  '#43a047','#fb8c00','#6d4c41','#546e7a'
];

/* ── Dialog Dossier (créer / renommer) ── */
function _todoOpenFolderDialog(folderId) {
  const existing = folderId ? _todoData.folders.find(f => f.id === folderId) : null;
  const title    = existing ? 'Renommer le dossier' : 'Nouveau dossier';
  let   selColor = existing ? (existing.color || _FOLDER_COLORS[0]) : _FOLDER_COLORS[0];

  const overlay = document.createElement('div');
  overlay.className = 'todo-dialog-overlay';
  overlay.id = 'todoDialogOverlay';

  overlay.innerHTML = `
    <div class="todo-dialog">
      <div class="todo-dialog-title">${title}</div>
      <input class="todo-dialog-input" id="todoDialogInput"
             placeholder="Nom du dossier" value="${_esc(existing?.name || '')}">
      <div class="todo-folder-colors" id="todoFolderColors">
        ${_FOLDER_COLORS.map(c => `
          <div class="todo-folder-color-opt ${c === selColor ? 'selected' : ''}"
               style="background:${c}" data-color="${c}"
               onclick="_todoSelectDialogColor(this,'${c}')"></div>`).join('')}
      </div>
      <div class="todo-dialog-actions">
        <button class="todo-dialog-cancel" onclick="_todoCloseDialog()">Annuler</button>
        <button class="todo-dialog-ok" onclick="_todoSubmitFolderDialog('${folderId || ''}')">
          ${existing ? 'Renommer' : 'Créer'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) _todoCloseDialog(); });
  document.getElementById('todoDialogInput').focus();
  document.getElementById('todoDialogInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') _todoSubmitFolderDialog(folderId || '');
    if (e.key === 'Escape') _todoCloseDialog();
  });
}

function _todoSelectDialogColor(el, color) {
  el.closest('.todo-folder-colors').querySelectorAll('.todo-folder-color-opt').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  el.dataset.selected = '1';
}

function _todoGetSelectedDialogColor() {
  const sel = document.querySelector('.todo-folder-color-opt.selected');
  return sel ? sel.dataset.color : _FOLDER_COLORS[0];
}

function _todoSubmitFolderDialog(folderId) {
  const name  = document.getElementById('todoDialogInput')?.value.trim();
  const color = _todoGetSelectedDialogColor();
  if (!name) { document.getElementById('todoDialogInput')?.focus(); return; }
  if (folderId) {
    const f = _todoData.folders.find(f => f.id === folderId);
    if (f) { f.name = name; f.color = color; _todoSave(); }
  } else {
    _todoCreateFolder(name, color);
  }
  _todoCloseDialog();
  _todoRenderSidebar();
  _todoRenderTaskList();
}

/* ── Dialog Vue amélioré (date filter + showNoDate + 500px) ── */
function _todoOpenViewDialog(viewId) {
  const existing   = viewId ? _todoData.views.find(v => v.id === viewId) : null;
  const title      = existing ? 'Modifier la vue' : 'Nouvelle vue';
  const f          = existing?.filters || {};
  const statuses   = _todoData.settings.taskStatuses;
  const types      = _todoData.settings.taskTypes;
  const dateFilter = f.dateFilter || 'all';
  const showNoDate = f.showNoDate !== false;

  const chkP = p => (f.priority || []).includes(p) ? 'checked' : '';
  const chkS = s => (f.status || []).includes(_todoStatusName(s)) ? 'checked' : '';
  const chkT = t => (f.type   || []).includes(_todoTypeName(t))   ? 'checked' : '';

  const overlay = document.createElement('div');
  overlay.className = 'todo-dialog-overlay';
  overlay.id = 'todoDialogOverlay';

  overlay.innerHTML = `
    <div class="todo-dialog" style="width:500px;max-width:96vw">
      <div class="todo-dialog-title">${title}</div>
      <input class="todo-dialog-input" id="todoViewNameInput"
             placeholder="Nom de la vue" value="${_esc(existing?.name || '')}">

      <div class="todo-vd-section-label">Priorité</div>
      <div class="todo-vd-checkrow">
        ${['P1','P2','P3','P4'].map(p => `
          <label class="todo-vd-check">
            <input type="checkbox" value="${p}" class="vf-priority" ${chkP(p)}>
            <span class="todo-vd-check-label ${p.toLowerCase()}">${p}</span>
          </label>`).join('')}
      </div>

      ${statuses.length ? `
        <div class="todo-vd-section-label">Statut</div>
        <div class="todo-vd-checkrow wrap">
          ${statuses.map(s => {
            const n = _todoStatusName(s); const c = _todoStatusColor(s);
            return `<label class="todo-vd-check">
              <input type="checkbox" value="${_esc(n)}" class="vf-status" ${chkS(s)}>
              <span class="todo-vd-check-label"><span class="todo-vd-dot" style="background:${c}"></span>${_esc(n)}</span>
            </label>`;
          }).join('')}
        </div>` : ''}

      ${types.length ? `
        <div class="todo-vd-section-label">Type</div>
        <div class="todo-vd-checkrow wrap">
          ${types.map(t => {
            const n = _todoTypeName(t); const c = _todoTypeColor(t);
            return `<label class="todo-vd-check">
              <input type="checkbox" value="${_esc(n)}" class="vf-type" ${chkT(t)}>
              <span class="todo-vd-check-label"><span class="todo-vd-dot" style="background:${c}"></span>${_esc(n)}</span>
            </label>`;
          }).join('')}
        </div>` : ''}

      <div class="todo-vd-section-label">Date d'échéance</div>
      <div class="todo-vd-radio-row">
        ${[['all','Tout'],['today',"Aujourd'hui"],['week','Cette semaine'],['month','Ce mois']].map(([v,l]) =>
          `<label class="todo-vd-radio">
            <input type="radio" name="vfDate" value="${v}" ${dateFilter===v?'checked':''}>${l}
          </label>`).join('')}
      </div>
      <label class="todo-vd-check" style="margin-top:6px">
        <input type="checkbox" id="vfShowNoDate" ${showNoDate?'checked':''}>
        <span style="font-size:12px;color:var(--text)">Afficher les tâches sans date</span>
      </label>

      <div class="todo-dialog-actions">
        <button class="todo-dialog-cancel" onclick="_todoCloseDialog()">Annuler</button>
        <button class="todo-dialog-ok" onclick="_todoSubmitViewDialog('${viewId||''}')">
          ${existing ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) _todoCloseDialog(); });
  const ni = document.getElementById('todoViewNameInput');
  ni.focus();
  ni.addEventListener('keydown', e => { if (e.key === 'Enter') _todoSubmitViewDialog(viewId||''); if (e.key === 'Escape') _todoCloseDialog(); });
}

function _todoSubmitViewDialog(viewId) {
  const name = document.getElementById('todoViewNameInput')?.value.trim();
  if (!name) { document.getElementById('todoViewNameInput')?.focus(); return; }

  const getChecked = cls => [...document.querySelectorAll(`.${cls}:checked`)].map(el => el.value);
  const dateFilter = document.querySelector('input[name="vfDate"]:checked')?.value || 'all';
  const filters = {
    priority:           getChecked('vf-priority'),
    status:             getChecked('vf-status'),
    type:               getChecked('vf-type'),
    dateFilter:         dateFilter !== 'all' ? dateFilter : undefined,
    showNoDate:         document.getElementById('vfShowNoDate')?.checked || undefined
  };
  if (!filters.priority.length)       delete filters.priority;
  if (!filters.status.length)         delete filters.status;
  if (!filters.type.length)           delete filters.type;
  if (!filters.dateFilter)            delete filters.dateFilter;
  if (filters.showNoDate === undefined) delete filters.showNoDate;

  if (viewId) {
    _todoUpdateView(viewId, { name, filters });
  } else {
    const v = _todoCreateView(name, filters);
    _todoSelectedFolderId = 'view:' + v.id;
  }
  _todoCloseDialog();
  _todoRender();
}

/* ── Fermeture dialog ── */
function _todoCloseDialog() {
  document.getElementById('todoDialogOverlay')?.remove();
}
