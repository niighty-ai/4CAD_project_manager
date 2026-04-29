/* ═══════════════════════════════════════════
   todo-modal.js — Modale détail tâche (1/2)
   Colonne gauche : titre, desc, sous-tâches, commentaires
   Colonne droite : toutes les propriétés
   ═══════════════════════════════════════════ */

let _todoModalTaskId = null;

/* ── Ouverture ── */
function _todoOpenModal(taskId) {
  _todoModalTaskId = taskId;
  _todoRenderModal();
}

/* ── Fermeture ── */
function _todoCloseModal() {
  document.getElementById('todoModalOverlay')?.remove();
  _todoModalTaskId = null;
}

/* ── Rendu complet de la modale ── */
function _todoRenderModal() {
  document.getElementById('todoModalOverlay')?.remove();
  const task = _todoData.tasks.find(t => t.id === _todoModalTaskId);
  if (!task) return;

  const overlay = document.createElement('div');
  overlay.className = 'todo-modal-overlay';
  overlay.id = 'todoModalOverlay';
  overlay.onclick = e => { if (e.target === overlay) _todoCloseModal(); };

  overlay.innerHTML = `
    <div class="todo-modal" onclick="event.stopPropagation()">

      <!-- Colonne gauche -->
      <div class="todo-modal-left">
        <div class="todo-modal-left-body">

          <!-- Titre -->
          <textarea class="todo-modal-title-input" id="tmTitle"
            rows="1" placeholder="Titre de la tâche…"
            oninput="_tmAutoResize(this)"
            onblur="_tmSaveTitle()">${_esc(task.title)}</textarea>

          <!-- Description -->
          <textarea class="todo-modal-desc" id="tmDesc"
            rows="3" placeholder="Ajouter une description…"
            oninput="_tmAutoResize(this)"
            onblur="_tmSaveDesc()">${_esc(task.description || '')}</textarea>

          <!-- Sous-tâches -->
          <div class="todo-modal-section">
            <div class="todo-modal-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 11 12 14 22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              Sous-tâches
            </div>
            <div class="todo-subtask-list" id="tmSubtasks"></div>
            <div class="todo-add-subtask" onclick="_tmAddSubtask()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Ajouter une sous-tâche
            </div>
          </div>

          <!-- Commentaires -->
          <div class="todo-modal-section">
            <div class="todo-modal-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Commentaires & Notes
            </div>
            <div class="todo-comment-list" id="tmComments"></div>
            <div class="todo-comment-form">
              <div class="todo-comment-avatar">${_todoInitials(currentUserEmail)}</div>
              <div style="flex:1">
                <div class="todo-comment-input-wrap">
                  <textarea class="todo-comment-input" id="tmCommentInput"
                    rows="1" placeholder="Ajouter un commentaire…"
                    oninput="_tmAutoResize(this)"
                    onkeydown="_tmCommentKey(event)"></textarea>
                </div>
                <div style="display:flex;justify-content:flex-end;margin-top:6px">
                  <button class="todo-comment-submit" onclick="_tmSubmitComment()">Envoyer</button>
                </div>
              </div>
            </div>
          </div>

        </div><!-- /left-body -->

        <!-- Footer gauche -->
        <div class="todo-modal-footer">
          <div class="todo-modal-footer-info">
            Créé le ${_todoFmt(task.createdAt)}
            ${task.updatedAt && task.updatedAt !== task.createdAt
              ? ` · Modifié le ${_todoFmt(task.updatedAt)}` : ''}
          </div>
          <div class="todo-modal-close" title="Fermer" onclick="_todoCloseModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </div>
        </div>
      </div><!-- /left -->

      <!-- Colonne droite (propriétés) -->
      <div class="todo-modal-right" id="tmRight"></div>

    </div><!-- /modal -->`;

  document.body.appendChild(overlay);
  _tmRenderSubtasks();
  _tmRenderComments();
  _tmRenderRight();
  /* Auto-resize des textarea initiaux */
  overlay.querySelectorAll('textarea').forEach(_tmAutoResize);
}

/* ── Auto-resize textarea ── */
function _tmAutoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

/* ── Sauvegardes titre / description ── */
function _tmSaveTitle() {
  const val = document.getElementById('tmTitle')?.value.trim();
  if (val && val !== (_todoData.tasks.find(t => t.id === _todoModalTaskId)?.title || '')) {
    _todoUpdateTask(_todoModalTaskId, { title: val });
    _todoRenderTaskList();
    _todoRenderSidebar();
  }
}
function _tmSaveDesc() {
  const val = document.getElementById('tmDesc')?.value || '';
  _todoUpdateTask(_todoModalTaskId, { description: val });
}

/* ── Sous-tâches ── */
function _tmRenderSubtasks() {
  const el = document.getElementById('tmSubtasks');
  if (!el) return;
  const subs = _todoData.tasks.filter(t => t.parentId === _todoModalTaskId);
  if (!subs.length) { el.innerHTML = ''; return; }
  el.innerHTML = subs.map(st => `
    <div class="todo-subtask-item ${st.completed ? 'done' : ''}" data-sub-id="${st.id}">
      <div class="todo-check ${(st.priority||'p4').toLowerCase()} ${st.completed ? 'checked' : ''}"
           style="width:15px;height:15px;border-width:1.5px"
           onclick="_tmToggleSubtask('${st.id}')">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <input type="text" value="${_esc(st.title)}"
             onblur="_tmSaveSubtask('${st.id}',this.value)"
             onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')this.blur()">
      <div class="todo-subtask-del" onclick="_tmDeleteSubtask('${st.id}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </div>
    </div>`).join('');
}

function _tmAddSubtask() {
  const task = _todoData.tasks.find(t => t.id === _todoModalTaskId);
  if (!task) return;
  const st = _todoCreateTask('Nouvelle sous-tâche', task.folderId, _todoModalTaskId);
  _tmRenderSubtasks();
  /* Mettre le focus sur la nouvelle sous-tâche */
  const input = document.querySelector(`[data-sub-id="${st.id}"] input`);
  if (input) { input.focus(); input.select(); }
  _todoRenderTaskList();
}

function _tmToggleSubtask(subId) {
  _todoCompleteTask(subId);
  _tmRenderSubtasks();
}

function _tmSaveSubtask(subId, val) {
  if (val.trim()) _todoUpdateTask(subId, { title: val.trim() });
  else _todoDeleteTask(subId);
  _tmRenderSubtasks();
  _todoRenderTaskList();
}

function _tmDeleteSubtask(subId) {
  _todoDeleteTask(subId);
  _tmRenderSubtasks();
  _todoRenderTaskList();
}

/* ── Commentaires ── */
function _tmRenderComments() {
  const el = document.getElementById('tmComments');
  if (!el) return;
  const task = _todoData.tasks.find(t => t.id === _todoModalTaskId);
  const comments = task?.comments || [];
  if (!comments.length) { el.innerHTML = ''; return; }

  el.innerHTML = comments.map(c => {
    const initials = _todoInitials(c.authorName);
    const isOwn    = c.authorId === currentUserId;
    return `
      <div class="todo-comment" data-comment-id="${c.id}">
        <div class="todo-comment-avatar">${initials}</div>
        <div class="todo-comment-body">
          <div class="todo-comment-header">
            <span class="todo-comment-author">${_esc(_todoShortName(c.authorName))}</span>
            <span class="todo-comment-date">${_todoFmt(c.createdAt)}</span>
            ${c.updatedAt ? `<span class="todo-comment-edited">(modifié)</span>` : ''}
          </div>
          <div class="todo-comment-text" id="ctxt_${c.id}">${_esc(c.text)}</div>
          ${isOwn ? `
            <div class="todo-comment-actions">
              <span class="todo-comment-action" onclick="_tmEditComment('${c.id}')">Modifier</span>
              <span class="todo-comment-action danger" onclick="_tmDeleteComment('${c.id}')">Supprimer</span>
            </div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function _tmCommentKey(e) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) _tmSubmitComment();
}

function _tmSubmitComment() {
  const input = document.getElementById('tmCommentInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  _todoAddComment(_todoModalTaskId, text);
  input.value = '';
  _tmAutoResize(input);
  _tmRenderComments();
  _todoRenderTaskList();
}

function _tmEditComment(commentId) {
  const task = _todoData.tasks.find(t => t.id === _todoModalTaskId);
  const c    = (task?.comments || []).find(c => c.id === commentId);
  if (!c) return;

  const textEl = document.getElementById('ctxt_' + commentId);
  if (!textEl) return;
  const original = c.text;

  const ta = document.createElement('textarea');
  ta.className = 'todo-comment-input';
  ta.value     = original;
  ta.style.cssText = 'width:100%;margin-bottom:6px';
  textEl.replaceWith(ta);
  _tmAutoResize(ta);
  ta.focus();

  const save = () => {
    const val = ta.value.trim();
    if (val && val !== original) _todoEditComment(_todoModalTaskId, commentId, val);
    _tmRenderComments();
  };
  ta.addEventListener('blur', save);
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ta.blur();
    if (e.key === 'Escape') { ta.value = original; ta.blur(); }
  });
}

function _tmDeleteComment(commentId) {
  if (!confirm('Supprimer ce commentaire ?')) return;
  _todoDeleteComment(_todoModalTaskId, commentId);
  _tmRenderComments();
  _todoRenderTaskList();
}

/* ══════════════════════════════════════════
   COLONNE DROITE — propriétés (2/2)
   ══════════════════════════════════════════ */
function _tmRenderRight() {
  const el = document.getElementById('tmRight');
  if (!el) return;
  const task = _todoData.tasks.find(t => t.id === _todoModalTaskId);
  if (!task) return;

  const folders   = _todoData.folders;
  const types     = _todoData.settings.taskTypes;
  const statuses  = _todoData.settings.taskStatuses;
  const recTypes  = [
    { val:'none',    label:'Pas de récurrence' },
    { val:'daily',   label:'Tous les jours' },
    { val:'weekly',  label:'Toutes les semaines' },
    { val:'monthly', label:'Tous les mois' },
    { val:'yearly',  label:'Tous les ans' }
  ];

  const assigneeNames = (task.assignees || []).map(a => a.name || a);

  el.innerHTML = `
    <!-- Priorité -->
    <div class="todo-prop">
      <div class="todo-prop-label">Priorité</div>
      <div class="todo-priority-opts">
        ${['P1','P2','P3','P4'].map(p => `
          <div class="todo-priority-opt ${p.toLowerCase()} ${task.priority === p ? 'selected' : ''}"
               onclick="_tmSetPriority('${p}')">${p}</div>`).join('')}
      </div>
    </div>

    <!-- Statut -->
    <div class="todo-prop">
      <div class="todo-prop-label">
        Statut
        <span style="margin-left:auto;cursor:pointer;color:var(--accent);font-size:9px"
              onclick="_tmOpenTagsDialog('status')">Gérer</span>
      </div>
      <div class="todo-prop-value">
        <select onchange="_tmSetStatus(this.value)">
          <option value="">— Aucun —</option>
          ${statuses.map(s => `<option value="${_esc(s)}" ${task.status === s ? 'selected' : ''}>${_esc(s)}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Type -->
    <div class="todo-prop">
      <div class="todo-prop-label">
        Type
        <span style="margin-left:auto;cursor:pointer;color:var(--accent);font-size:9px"
              onclick="_tmOpenTagsDialog('type')">Gérer</span>
      </div>
      <div class="todo-prop-value">
        <select onchange="_tmSetType(this.value)">
          <option value="">— Aucun —</option>
          ${types.map(t => `<option value="${_esc(t)}" ${task.type === t ? 'selected' : ''}>${_esc(t)}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Date d'échéance -->
    <div class="todo-prop">
      <div class="todo-prop-label">Échéance</div>
      <div class="todo-prop-value">
        <input type="date" value="${task.dueDate ? task.dueDate.slice(0,10) : ''}"
               onchange="_tmSetDueDate(this.value)">
      </div>
    </div>

    <!-- Récurrence -->
    <div class="todo-prop">
      <div class="todo-prop-label">Récurrence</div>
      <div class="todo-prop-value" style="padding:4px 8px">
        <select onchange="_tmSetRecurrence(this.value)">
          ${recTypes.map(r => `<option value="${r.val}"
            ${(task.recurrence?.type || 'none') === r.val ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Responsables -->
    <div class="todo-prop">
      <div class="todo-prop-label">Responsable(s)</div>
      <div class="todo-assignees" id="tmAssignees">
        ${assigneeNames.map(n => `
          <span class="todo-assignee-tag">
            ${_esc(n)}
            <span class="todo-assignee-remove" onclick="_tmRemoveAssignee('${_esc(n)}')">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </span>
          </span>`).join('')}
      </div>
      <div style="position:relative;margin-top:4px">
        <input class="todo-dialog-input" id="tmAssigneeInput"
               placeholder="Ajouter un responsable…"
               autocomplete="off"
               style="margin:0;font-size:11px;padding:5px 8px"
               oninput="_tmAssigneeSearch(this.value)"
               onkeydown="_tmAssigneeKey(event)">
        <div class="todo-assignee-dropdown" id="tmAssigneeDropdown" style="display:none"></div>
      </div>
    </div>

    <!-- Dossier -->
    <div class="todo-prop">
      <div class="todo-prop-label">Dossier</div>
      <div class="todo-prop-value">
        <select onchange="_tmSetFolder(this.value)">
          <option value="">— Sans dossier —</option>
          ${folders.map(f => `<option value="${f.id}" ${task.folderId === f.id ? 'selected' : ''}>${_esc(f.name)}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Partage -->
    <div class="todo-prop">
      <div class="todo-prop-label">Partager avec</div>
      <div class="todo-share-list" id="tmShareList">
        ${(task.sharedWith || []).map(uid => `
          <div class="todo-share-item">
            <div class="todo-comment-avatar" style="width:22px;height:22px;font-size:9px">${_todoInitials(uid)}</div>
            <span style="font-size:11px;overflow:hidden;text-overflow:ellipsis">${_esc(uid)}</span>
            <span class="todo-share-remove" onclick="_tmUnshare('${_esc(uid)}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </span>
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <input class="todo-dialog-input" id="tmShareInput"
               placeholder="Email utilisateur…"
               style="margin:0;font-size:11px;padding:5px 8px;flex:1"
               onkeydown="if(event.key==='Enter')_tmShareSubmit()">
        <button class="todo-dialog-ok" style="padding:5px 10px;font-size:11px;white-space:nowrap"
                onclick="_tmShareSubmit()">Partager</button>
      </div>
    </div>`;
}

/* ── Setters propriétés ── */
function _tmSetPriority(p) {
  _todoUpdateTask(_todoModalTaskId, { priority: p });
  _todoRenderTaskList();
  _tmRenderRight();
}
function _tmSetStatus(s) {
  _todoUpdateTask(_todoModalTaskId, { status: s });
  _todoRenderTaskList();
}
function _tmSetType(t) {
  _todoUpdateTask(_todoModalTaskId, { type: t });
  _todoRenderTaskList();
}
function _tmSetDueDate(val) {
  _todoUpdateTask(_todoModalTaskId, { dueDate: val ? new Date(val).toISOString() : null });
  _todoRenderTaskList();
}
function _tmSetRecurrence(val) {
  const task = _todoData.tasks.find(t => t.id === _todoModalTaskId);
  const rec  = { type: val, interval: task?.recurrence?.interval || 1 };
  _todoUpdateTask(_todoModalTaskId, { recurrence: rec });
  _todoRenderTaskList();
}
function _tmSetFolder(folderId) {
  _todoUpdateTask(_todoModalTaskId, { folderId: folderId || null });
  _todoRenderTaskList();
  _todoRenderSidebar();
}

/* ── Assignés ── */
function _tmAssigneeSearch(val) {
  const drop = document.getElementById('tmAssigneeDropdown');
  if (!drop) return;
  const q = val.trim().toLowerCase();
  if (!q) { drop.style.display = 'none'; return; }
  const task   = _todoData.tasks.find(t => t.id === _todoModalTaskId);
  const already= (task?.assignees || []).map(a => (a.name || a).toLowerCase());
  const matches= _todoGetResources().filter(n => n.toLowerCase().includes(q) && !already.includes(n.toLowerCase()));
  if (!matches.length) { drop.style.display = 'none'; return; }
  drop.style.display = 'block';
  drop.innerHTML = matches.slice(0, 8).map(n =>
    `<div class="todo-assignee-opt" onclick="_tmPickAssignee('${_esc(n)}')">${_esc(n)}</div>`
  ).join('');
}

function _tmAssigneeKey(e) {
  if (e.key === 'Enter') {
    const val = e.target.value.trim();
    if (val) _tmPickAssignee(val);
  }
  if (e.key === 'Escape') {
    document.getElementById('tmAssigneeDropdown').style.display = 'none';
    e.target.value = '';
  }
}

function _tmPickAssignee(name) {
  const task = _todoData.tasks.find(t => t.id === _todoModalTaskId);
  if (!task) return;
  const assignees = task.assignees || [];
  if (assignees.find(a => (a.name || a) === name)) return;
  assignees.push({ name });
  _todoUpdateTask(_todoModalTaskId, { assignees });
  document.getElementById('tmAssigneeInput').value = '';
  document.getElementById('tmAssigneeDropdown').style.display = 'none';
  _todoRenderTaskList();
  /* Re-render juste les assignés */
  const wrap = document.getElementById('tmAssignees');
  if (wrap) {
    const names = assignees.map(a => a.name || a);
    wrap.innerHTML = names.map(n => `
      <span class="todo-assignee-tag">
        ${_esc(n)}
        <span class="todo-assignee-remove" onclick="_tmRemoveAssignee('${_esc(n)}')">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </span>
      </span>`).join('');
  }
}

function _tmRemoveAssignee(name) {
  const task = _todoData.tasks.find(t => t.id === _todoModalTaskId);
  if (!task) return;
  task.assignees = (task.assignees || []).filter(a => (a.name || a) !== name);
  _todoUpdateTask(_todoModalTaskId, { assignees: task.assignees });
  _todoRenderTaskList();
  _tmRenderRight();
}

/* ── Partage ── */
function _tmShareSubmit() {
  const input = document.getElementById('tmShareInput');
  const uid   = input?.value.trim();
  if (!uid) return;
  _todoShareTask(_todoModalTaskId, uid);
  input.value = '';
  _tmRenderRight();
  _todoShowToast('Tâche partagée');
}
function _tmUnshare(uid) {
  _todoUnshareTask(_todoModalTaskId, uid);
  _tmRenderRight();
}

/* ── Dialog gestion types / statuts ── */
function _tmOpenTagsDialog(kind) {
  const isType   = kind === 'type';
  const list     = isType ? _todoData.settings.taskTypes : _todoData.settings.taskStatuses;
  const label    = isType ? 'Types de tâches' : 'Statuts';
  const addFn    = isType ? _todoAddType : _todoAddStatus;
  const removeFn = isType ? _todoRemoveType : _todoRemoveStatus;

  document.getElementById('todoDialogOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'todo-dialog-overlay';
  overlay.id = 'todoDialogOverlay';
  overlay.onclick = e => { if (e.target === overlay) { _todoCloseDialog(); _tmRenderRight(); } };

  const renderList = () => {
    const cur = isType ? _todoData.settings.taskTypes : _todoData.settings.taskStatuses;
    return cur.map(item => `
      <div class="todo-tag-item">
        <span>${_esc(item)}</span>
        <div class="todo-tag-del" onclick="_tmTagRemove('${kind}','${_esc(item)}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
      </div>`).join('');
  };

  overlay.innerHTML = `
    <div class="todo-dialog">
      <div class="todo-dialog-title">${label}</div>
      <div class="todo-tags-list" id="tmTagsList">${renderList()}</div>
      <div style="display:flex;gap:8px">
        <input class="todo-dialog-input" id="tmTagInput"
               placeholder="Nouveau…" style="margin:0;flex:1"
               onkeydown="if(event.key==='Enter')_tmTagAdd('${kind}')">
        <button class="todo-dialog-ok" style="padding:7px 12px"
                onclick="_tmTagAdd('${kind}')">Ajouter</button>
      </div>
      <div class="todo-dialog-actions">
        <button class="todo-dialog-ok" onclick="_todoCloseDialog();_tmRenderRight()">Fermer</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.getElementById('tmTagInput').focus();
}

function _tmTagAdd(kind) {
  const input = document.getElementById('tmTagInput');
  if (!input?.value.trim()) return;
  if (kind === 'type') _todoAddType(input.value);
  else _todoAddStatus(input.value);
  input.value = '';
  const list = document.getElementById('tmTagsList');
  if (list) {
    const cur = kind === 'type' ? _todoData.settings.taskTypes : _todoData.settings.taskStatuses;
    list.innerHTML = cur.map(item => `
      <div class="todo-tag-item">
        <span>${_esc(item)}</span>
        <div class="todo-tag-del" onclick="_tmTagRemove('${kind}','${_esc(item)}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
      </div>`).join('');
  }
}

function _tmTagRemove(kind, name) {
  if (kind === 'type') _todoRemoveType(name);
  else _todoRemoveStatus(name);
  const list = document.getElementById('tmTagsList');
  if (list) {
    const cur = kind === 'type' ? _todoData.settings.taskTypes : _todoData.settings.taskStatuses;
    list.innerHTML = cur.map(item => `
      <div class="todo-tag-item">
        <span>${_esc(item)}</span>
        <div class="todo-tag-del" onclick="_tmTagRemove('${kind}','${_esc(item)}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
      </div>`).join('');
  }
}
