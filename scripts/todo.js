/* ═══════════════════════════════════════════
   todo.js — État global, Firebase sync, CRUD (1/2)
   ═══════════════════════════════════════════ */

/* ── État global ──────────────────────────────────────────────────────────── */
let _todoData = {
  folders:  [],
  tasks:    [],
  views:    [],
  settings: { taskTypes: [], taskStatuses: [] }
};
let _todoSelectedFolderId = null; /* null = "Toutes les tâches", 'view:id' = vue custom */
let _todoSortConfig       = { field: 'order', dir: 'asc' };
let _todoLoaded           = false;
let _todoSaveTimer        = null;
let _todoSaveTs           = 0;
let _todoSharedTasks      = {}; /* taskId → taskData (tâches partagées avec moi) */

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function _todoId() {
  return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function _todoFmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric',
                                         hour: '2-digit', minute: '2-digit' });
}

function _todoFmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function _todoInitials(email) {
  if (!email) return '?';
  const name = email.split('@')[0].replace(/[._-]/g, ' ');
  return name.split(' ').map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('');
}

function _todoShortName(email) {
  if (!email) return '';
  return email.split('@')[0].replace(/[._]/g, ' ')
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function _todoIsOverdue(dueDate) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function _todoNextOccurrence(dueDate, recurrence) {
  if (!dueDate || !recurrence || recurrence.type === 'none') return dueDate;
  const d = new Date(dueDate);
  const n = parseInt(recurrence.interval) || 1;
  switch (recurrence.type) {
    case 'daily':   d.setDate(d.getDate() + n); break;
    case 'weekly':  d.setDate(d.getDate() + 7 * n); break;
    case 'monthly': d.setMonth(d.getMonth() + n); break;
    case 'yearly':  d.setFullYear(d.getFullYear() + n); break;
  }
  return d.toISOString();
}

/* ── Persistance locale ───────────────────────────────────────────────────── */
function _todoWriteLS() {
  if (!currentUserId) return;
  try { localStorage.setItem('todo_' + currentUserId, JSON.stringify(_todoData)); } catch(e) {}
}

function _todoReadLS() {
  if (!currentUserId) return;
  try {
    const raw = localStorage.getItem('todo_' + currentUserId);
    if (raw) _todoData = JSON.parse(raw);
  } catch(e) {}
}

/* ── Sauvegarde Firebase (debouncée 200 ms) ───────────────────────────────── */
function _todoSave() {
  _todoWriteLS();
  clearTimeout(_todoSaveTimer);
  _todoSaveTimer = setTimeout(() => {
    if (!currentUserId || typeof window._fbSetTodoData !== 'function') return;
    _todoSaveTs = Date.now();
    window._fbSetTodoData(currentUserId, _todoData).catch(e => console.warn('[todo] save error', e));
  }, 200);
}

/* ── Chargement initial (appelé depuis app.js) ────────────────────────────── */
function _startTodoLoad(userId) {
  _todoReadLS();

  /* Écoute temps-réel des données privées */
  if (typeof window._fbOnTodoData === 'function') {
    window._fbOnTodoData(userId, val => {
      if ((Date.now() - _todoSaveTs) < 3000) return; /* anti-écho */
      if (val) {
        _todoData = val;
        _todoData.folders  = _todoData.folders  || [];
        _todoData.tasks    = _todoData.tasks    || [];
        _todoData.views    = _todoData.views    || [];
        _todoData.settings = _todoData.settings || { taskTypes: [], taskStatuses: [] };
        _todoWriteLS();
      }
      _todoLoaded = true;
      if (currentView === 'todo') _todoRender();
    });
  }

  /* Écoute des tâches partagées avec moi */
  if (typeof window._fbOnTodoShares === 'function') {
    window._fbOnTodoShares(userId, refs => {
      _todoSharedTasks = {};
      const ids = Object.keys(refs || {});
      let remaining = ids.length;
      if (remaining === 0) return;
      ids.forEach(taskId => {
        window._fbGetSharedTask(taskId, data => {
          if (data) _todoSharedTasks[taskId] = data;
          remaining--;
          if (remaining === 0 && currentView === 'todo') _todoRender();
        });
      });
    });
  }
}

/* ── Accès aux tâches (propres + partagées) ───────────────────────────────── */
function _todoAllTasks() {
  const shared = Object.values(_todoSharedTasks).filter(t =>
    t && !_todoData.tasks.find(lt => lt.id === t.id)
  );
  return [..._todoData.tasks, ...shared];
}

/* ── CRUD Dossiers ────────────────────────────────────────────────────────── */
function _todoCreateFolder(name, color) {
  const folder = { id: _todoId(), name: name.trim(), color: color || '#EC7206', order: _todoData.folders.length };
  _todoData.folders.push(folder);
  _todoSave();
  _todoRender();
  return folder;
}

function _todoRenameFolder(folderId, name) {
  const f = _todoData.folders.find(f => f.id === folderId);
  if (!f || !name.trim()) return;
  f.name = name.trim();
  _todoSave();
  _todoRenderSidebar();
}

function _todoDeleteFolder(folderId) {
  _todoData.tasks = _todoData.tasks.filter(t => t.folderId !== folderId);
  _todoData.folders = _todoData.folders.filter(f => f.id !== folderId);
  if (_todoSelectedFolderId === folderId) _todoSelectedFolderId = null;
  _todoSave();
  _todoRender();
}

function _todoReorderFolders(fromIdx, toIdx) {
  const arr = _todoData.folders;
  const [moved] = arr.splice(fromIdx, 1);
  arr.splice(toIdx, 0, moved);
  arr.forEach((f, i) => { f.order = i; });
  _todoSave();
  _todoRenderSidebar();
}

/* ── CRUD Vues ────────────────────────────────────────────────────────────── */
function _todoCreateView(name, filters) {
  const view = { id: _todoId(), name: name.trim(), filters: filters || {}, order: _todoData.views.length };
  _todoData.views.push(view);
  _todoSave();
  _todoRenderSidebar();
  return view;
}

function _todoUpdateView(viewId, updates) {
  const v = _todoData.views.find(v => v.id === viewId);
  if (!v) return;
  Object.assign(v, updates);
  _todoSave();
  _todoRenderSidebar();
}

function _todoDeleteView(viewId) {
  _todoData.views = _todoData.views.filter(v => v.id !== viewId);
  if (_todoSelectedFolderId === 'view:' + viewId) _todoSelectedFolderId = null;
  _todoSave();
  _todoRenderSidebar();
}

/* ── CRUD Tâches ──────────────────────────────────────────────────────────── */
function _todoCreateTask(title, folderId, parentId) {
  const now = new Date().toISOString();
  const siblings = _todoData.tasks.filter(t => t.folderId === folderId && t.parentId === (parentId || null));
  /* Type par défaut : parent pour sous-tâche, sinon premier de la liste */
  const _tn = t => typeof t === 'object' ? (t?.name || '') : (t || '');
  const parentTask = parentId ? _todoData.tasks.find(t => t.id === parentId) : null;
  const defaultType = parentTask
    ? _tn(parentTask.type)
    : _tn(_todoData.settings.taskTypes[0]);
  const task = {
    id: _todoId(),
    folderId:   folderId || null,
    parentId:   parentId || null,
    title:      title.trim(),
    description:'',
    type:       defaultType,
    priority:   'P4',
    status:     _todoData.settings.taskStatuses[0] || '',
    assignees:  [],
    dueDate:    null,
    recurrence: { type: 'none', interval: 1 },
    order:      siblings.length,
    comments:   [],
    completed:    false,
    completedAt:  null,
    sharedWith:   [],
    followsParent: parentId ? true : undefined, /* sous-tâche : suit la récurrence par défaut */
    createdAt:    now,
    updatedAt:    now
  };
  _todoData.tasks.push(task);
  _todoSave();
  return task;
}

function _todoUpdateTask(taskId, updates) {
  const task = _todoData.tasks.find(t => t.id === taskId);
  if (!task) return;
  Object.assign(task, updates, { updatedAt: new Date().toISOString() });
  _todoSave();
  /* Sync tâche partagée */
  if (task.sharedWith && task.sharedWith.length > 0) {
    _todoSyncShared(task);
  }
}

function _todoDeleteTask(taskId) {
  /* Supprimer sous-tâches récursivement */
  _todoData.tasks.filter(t => t.parentId === taskId).forEach(st => _todoDeleteTask(st.id));
  const task = _todoData.tasks.find(t => t.id === taskId);
  if (task && task.sharedWith && task.sharedWith.length > 0) {
    if (typeof window._fbRemoveSharedTask === 'function') window._fbRemoveSharedTask(taskId);
    /* Nettoyer les refs de partage */
    task.sharedWith.forEach(uid => {
      if (typeof window._fbOnTodoShares === 'function') {
        /* On réécrit les refs sans ce taskId */
      }
    });
  }
  _todoData.tasks = _todoData.tasks.filter(t => t.id !== taskId);
  _todoSave();
  _todoRenderTaskList();
  if (typeof _todoRenderSidebar === 'function') _todoRenderSidebar();
}

function _todoCompleteTask(taskId) {
  const task = _todoData.tasks.find(t => t.id === taskId);
  if (!task) return;
  if (!task.completed) {
    task.completed   = true;
    task.completedAt = new Date().toISOString();
    /* Récurrence : créer la prochaine occurrence */
    if (task.recurrence && task.recurrence.type !== 'none') {
      /* Compléter d'abord les sous-tâches non terminées avec followsParent:false */
      const subtasks = _todoData.tasks.filter(t => t.parentId === taskId);
      subtasks.forEach(st => {
        if (!st.completed) {
          st.completed   = true;
          st.completedAt = new Date().toISOString();
          st.updatedAt   = new Date().toISOString();
        }
      });

      const next = _todoCreateTask(task.title, task.folderId, task.parentId);
      next.description = task.description;
      next.type        = task.type;
      next.priority    = task.priority;
      next.status      = _todoData.settings.taskStatuses[0]
        ? (typeof _todoData.settings.taskStatuses[0] === 'object'
            ? _todoData.settings.taskStatuses[0].name
            : _todoData.settings.taskStatuses[0])
        : '';
      next.assignees   = [...(task.assignees || [])];
      next.dueDate     = _todoNextOccurrence(task.dueDate, task.recurrence);
      next.recurrence  = { ...task.recurrence };

      /* Dupliquer uniquement les sous-tâches avec followsParent:true */
      subtasks.filter(st => st.followsParent === true).forEach(st => {
        const newSt = _todoCreateTask(st.title, next.folderId, next.id);
        newSt.type          = st.type;
        newSt.priority      = st.priority;
        newSt.assignees     = [...(st.assignees || [])];
        newSt.followsParent = true;
      });

      _todoShowToast('Nouvelle occurrence créée');
    }
  } else {
    task.completed   = false;
    task.completedAt = null;
  }
  task.updatedAt = new Date().toISOString();
  _todoSave();
  _todoRenderTaskList();
  if (typeof _todoRenderSidebar === 'function') _todoRenderSidebar();
}

/* ── CRUD Commentaires ────────────────────────────────────────────────────── */
function _todoAddComment(taskId, text) {
  if (!text.trim()) return;
  const task = _todoData.tasks.find(t => t.id === taskId);
  if (!task) return;
  if (!task.comments) task.comments = [];
  task.comments.push({
    id:         _todoId(),
    text:       text.trim(),
    authorId:   currentUserId,
    authorName: currentUserEmail,
    createdAt:  new Date().toISOString(),
    updatedAt:  null
  });
  task.updatedAt = new Date().toISOString();
  _todoSave();
  if (task.sharedWith && task.sharedWith.length > 0) _todoSyncShared(task);
}

function _todoEditComment(taskId, commentId, text) {
  const task = _todoData.tasks.find(t => t.id === taskId);
  if (!task) return;
  const c = (task.comments || []).find(c => c.id === commentId);
  if (!c || !text.trim()) return;
  c.text      = text.trim();
  c.updatedAt = new Date().toISOString();
  task.updatedAt = new Date().toISOString();
  _todoSave();
  if (task.sharedWith && task.sharedWith.length > 0) _todoSyncShared(task);
}

function _todoDeleteComment(taskId, commentId) {
  const task = _todoData.tasks.find(t => t.id === taskId);
  if (!task) return;
  task.comments = (task.comments || []).filter(c => c.id !== commentId);
  task.updatedAt = new Date().toISOString();
  _todoSave();
  if (task.sharedWith && task.sharedWith.length > 0) _todoSyncShared(task);
}

/* ── Partage de tâche ─────────────────────────────────────────────────────── */
function _todoSyncShared(task) {
  if (!task.sharedWith || task.sharedWith.length === 0) return;
  if (typeof window._fbSetSharedTask === 'function') {
    window._fbSetSharedTask(task.id, task);
  }
}

function _todoShareTask(taskId, targetUserId) {
  const task = _todoData.tasks.find(t => t.id === taskId);
  if (!task) return;
  if (!task.sharedWith) task.sharedWith = [];
  if (task.sharedWith.includes(targetUserId)) return;
  task.sharedWith.push(targetUserId);
  task.updatedAt = new Date().toISOString();
  _todoSyncShared(task);
  /* Écriture de la référence chez le destinataire */
  if (typeof window._fbSetTodoShares === 'function') {
    const refs = {};
    refs[task.id] = currentUserId;
    window._fbSetTodoShares(targetUserId, refs);
  }
  _todoSave();
}

function _todoUnshareTask(taskId, targetUserId) {
  const task = _todoData.tasks.find(t => t.id === taskId);
  if (!task) return;
  task.sharedWith = (task.sharedWith || []).filter(uid => uid !== targetUserId);
  task.updatedAt  = new Date().toISOString();
  if (task.sharedWith.length === 0) {
    if (typeof window._fbRemoveSharedTask === 'function') window._fbRemoveSharedTask(taskId);
  } else {
    _todoSyncShared(task);
  }
  _todoSave();
}

/* ── Paramètres (types/statuts) ── stockage {name,color} ou string legacy ── */
function _todoAddType(name, color) {
  if (!name.trim()) return;
  const exists = _todoData.settings.taskTypes.some(t =>
    (typeof t === 'object' ? t.name : t) === name.trim()
  );
  if (!exists) {
    _todoData.settings.taskTypes.push(color ? { name: name.trim(), color } : name.trim());
    _todoSave();
  }
}
function _todoRemoveType(name) {
  _todoData.settings.taskTypes = _todoData.settings.taskTypes.filter(t =>
    (typeof t === 'object' ? t.name : t) !== name
  );
  _todoSave();
}
function _todoAddStatus(name, color) {
  if (!name.trim()) return;
  const exists = _todoData.settings.taskStatuses.some(s =>
    (typeof s === 'object' ? s.name : s) === name.trim()
  );
  if (!exists) {
    _todoData.settings.taskStatuses.push(color ? { name: name.trim(), color } : name.trim());
    _todoSave();
  }
}
function _todoRemoveStatus(name) {
  _todoData.settings.taskStatuses = _todoData.settings.taskStatuses.filter(s =>
    (typeof s === 'object' ? s.name : s) !== name
  );
  _todoSave();
}

/* Mise à jour (renommage + couleur) d'un type ou statut existant */
function _todoUpdateType(oldName, newName, color) {
  const idx = _todoData.settings.taskTypes.findIndex(t =>
    (typeof t === 'object' ? t.name : t) === oldName
  );
  if (idx === -1) return;
  _todoData.settings.taskTypes[idx] = { name: newName.trim(), color };
  /* Mettre à jour les tâches qui utilisaient l'ancien nom */
  _todoData.tasks.forEach(t => {
    const n = typeof t.type === 'object' ? t.type?.name : t.type;
    if (n === oldName) t.type = newName.trim();
  });
  _todoSave();
}
function _todoUpdateStatus(oldName, newName, color) {
  const idx = _todoData.settings.taskStatuses.findIndex(s =>
    (typeof s === 'object' ? s.name : s) === oldName
  );
  if (idx === -1) return;
  _todoData.settings.taskStatuses[idx] = { name: newName.trim(), color };
  _todoData.tasks.forEach(t => {
    const n = typeof t.status === 'object' ? t.status?.name : t.status;
    if (n === oldName) t.status = newName.trim();
  });
  _todoSave();
}

/* ── Ressources disponibles (depuis le portfolio) ─────────────────────────── */
function _todoGetResources() {
  const names = new Set();
  if (typeof portfolio !== 'undefined') {
    portfolio.forEach(proj => {
      (proj.rows || []).forEach(row => {
        (row.assignments || []).forEach(a => {
          if (a.resourceNom) names.add(a.resourceNom);
        });
      });
    });
  }
  if (typeof resources !== 'undefined') {
    resources.forEach(r => { if (r.nom) names.add(r.nom); });
  }
  return [...names].sort();
}

/* ── Tri des tâches ───────────────────────────────────────────────────────── */
const _PRIORITY_ORDER = { P1: 0, P2: 1, P3: 2, P4: 3 };

function _todoSortTasks(tasks) {
  const { field, dir } = _todoSortConfig;
  const m = dir === 'asc' ? 1 : -1;
  return [...tasks].sort((a, b) => {
    switch (field) {
      case 'priority': return m * ((_PRIORITY_ORDER[a.priority] || 3) - (_PRIORITY_ORDER[b.priority] || 3));
      case 'dueDate':  {
        const da = a.dueDate ? new Date(a.dueDate) : new Date('9999');
        const db = b.dueDate ? new Date(b.dueDate) : new Date('9999');
        return m * (da - db);
      }
      case 'title':    return m * a.title.localeCompare(b.title, 'fr');
      case 'status':   return m * (a.status || '').localeCompare(b.status || '', 'fr');
      case 'type':     return m * (a.type || '').localeCompare(b.type || '', 'fr');
      case 'created':  return m * (new Date(a.createdAt) - new Date(b.createdAt));
      default:         return m * ((a.order || 0) - (b.order || 0));
    }
  });
}

/* ── Filtre vues ──────────────────────────────────────────────────────────── */
function _todoApplyViewFilters(tasks, filters) {
  if (!filters) return tasks;
  const now = new Date();
  return tasks.filter(t => {
    if (filters.priority && filters.priority.length && !filters.priority.includes(t.priority)) return false;
    if (filters.status && filters.status.length) {
      const sn = typeof t.status === 'object' ? (t.status?.name || '') : (t.status || '');
      if (!filters.status.includes(sn)) return false;
    }
    if (filters.type && filters.type.length) {
      const tn = typeof t.type === 'object' ? (t.type?.name || '') : (t.type || '');
      if (!filters.type.includes(tn)) return false;
    }
    if (filters.assignee && !(t.assignees || []).some(a => a.name === filters.assignee)) return false;
    if (filters.showOnlyIncomplete && t.completed) return false;
    if (filters.dateFilter && filters.dateFilter !== 'all') {
      if (!t.dueDate) return !!filters.showNoDate;
      const d = new Date(t.dueDate);
      if (filters.dateFilter === 'today') {
        if (d.toDateString() !== now.toDateString()) return false;
      } else if (filters.dateFilter === 'week') {
        const end = new Date(now); end.setDate(end.getDate() + 7);
        if (d < now || d > end) return false;
      } else if (filters.dateFilter === 'month') {
        const end = new Date(now); end.setMonth(end.getMonth() + 1);
        if (d < now || d > end) return false;
      }
    }
    return true;
  });
}

/* ── Toast ────────────────────────────────────────────────────────────────── */
function _todoShowToast(msg) {
  document.querySelectorAll('.todo-toast').forEach(el => el.remove());
  const el = document.createElement('div');
  el.className = 'todo-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2900);
}
