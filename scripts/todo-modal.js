/* ═══════════════════════════════════════════
   todo-modal.js — Modale détail tâche (1/2)
   Colonne gauche : titre, desc, sous-tâches, commentaires
   Colonne droite : toutes les propriétés
   ═══════════════════════════════════════════ */

let _todoModalTaskId = null;
let _tmActiveSubId   = null; /* null = parent, sinon id sous-tâche active (Option A) */

/* ── Ouverture ── */
function _todoOpenModal(taskId) {
  _todoModalTaskId = taskId;
  _tmActiveSubId   = null;
  _todoRenderModal();
}

/* Ouvre le modal du parent et sélectionne la sous-tâche directement */
function _todoOpenModalSub(subId, parentId) {
  _todoModalTaskId = parentId;
  _tmActiveSubId   = subId;
  _todoRenderModal();
}

/* ── Fermeture (avec validation Type + Statut obligatoires) ── */
function _todoCloseModal() {
  const task = _todoData.tasks.find(t => t.id === _todoModalTaskId);
  if (task) {
    const typeName   = typeof task.type   === 'object' ? task.type?.name   : task.type;
    const statusName = typeof task.status === 'object' ? task.status?.name : task.status;
    if (!typeName || !statusName) {
      const missing = [!typeName && 'Type', !statusName && 'Statut'].filter(Boolean).join(' et ');
      _todoShowToast(`⚠ ${missing} obligatoire(s) — veuillez renseigner avant de fermer`);
      /* Mise en évidence visuelle */
      document.querySelectorAll('.tm-required-missing').forEach(el => el.classList.remove('tm-required-missing'));
      if (!typeName)   document.getElementById('tmPropType')?.classList.add('tm-required-missing');
      if (!statusName) document.getElementById('tmPropStatus')?.classList.add('tm-required-missing');
      return;
    }
  }
  document.getElementById('todoModalOverlay')?.remove();
  _todoModalTaskId = null;
  _tmActiveSubId   = null;
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
      <button class="todo-modal-close" onclick="_todoCloseModal()" title="Fermer">&#x2715;</button>

      <!-- Colonne gauche -->
      <div class="todo-modal-left">
        <div class="todo-modal-left-body">

          <!-- Titre -->
          <textarea class="todo-modal-title-input" id="tmTitle"
            rows="1" placeholder="Titre de la tâche…"
            oninput="_tmAutoResize(this)"
            onfocus="_tmBackToParent()"
            onblur="_tmSaveTitle()">${_esc(task.title)}</textarea>

          <!-- Description -->
          <textarea class="todo-modal-desc" id="tmDesc"
            rows="3" placeholder="Ajouter une description…"
            oninput="_tmAutoResize(this)"
            onfocus="_tmBackToParent()"
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

/* ── Sous-tâches (Option A : clic sur la ligne bascule droite + commentaires) ── */
function _tmRenderSubtasks() {
  const el = document.getElementById('tmSubtasks');
  if (!el) return;
  const subs = _todoData.tasks.filter(t => t.parentId === _todoModalTaskId);
  if (!subs.length) { el.innerHTML = ''; return; }
  el.innerHTML = subs.map(st => {
    const isActive = st.id === _tmActiveSubId;
    return `
    <div class="todo-subtask-item ${st.completed ? 'done' : ''} ${isActive ? 'tm-sub-active' : ''}"
         data-sub-id="${st.id}"
         onclick="_tmSelectSub('${st.id}')">
      <div class="todo-check ${(st.priority||'p4').toLowerCase()} ${st.completed ? 'checked' : ''}"
           style="width:15px;height:15px;border-width:1.5px"
           onclick="event.stopPropagation();_tmToggleSubtask('${st.id}')">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <input type="text" value="${_esc(st.title)}"
             onclick="event.stopPropagation()"
             onfocus="_tmFocusSub('${st.id}')"
             onblur="_tmSaveSubtask('${st.id}',this.value)"
             onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')this.blur()">
      <div class="todo-subtask-del" title="Supprimer"
           onclick="event.stopPropagation();_tmDeleteSubtask('${st.id}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </div>
    </div>`;
  }).join('');
}

function _tmSelectSub(subId) {
  _tmActiveSubId = (_tmActiveSubId === subId) ? null : subId;
  _tmRenderSubtasks();
  _tmRenderRight();
  _tmRenderComments();
}
function _tmFocusSub(subId) {
  if (_tmActiveSubId === subId) return;
  _tmActiveSubId = subId;
  _tmRenderSubtasks();
  _tmRenderRight();
  _tmRenderComments();
}
function _tmBackToParent() {
  if (!_tmActiveSubId) return;
  _tmActiveSubId = null;
  _tmRenderSubtasks();
  _tmRenderRight();
  _tmRenderComments();
}

function _tmAddSubtask() {
  const task = _todoData.tasks.find(t => t.id === _todoModalTaskId);
  if (!task) return;
  const st = _todoCreateTask('Nouvelle sous-tâche', task.folderId, _todoModalTaskId);
  _tmRenderSubtasks();
  _todoRenderTaskList();
  /* Bascule immédiatement sur la sous-tâche pour forcer Type & Statut */
  _tmSelectSub(st.id);
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

/* ── Commentaires (bascule parent/sous-tâche selon _tmActiveSubId) ── */
function _tmRenderComments() {
  const el = document.getElementById('tmComments');
  if (!el) return;
  const activeId = _tmActiveSubId || _todoModalTaskId;
  const task     = _todoData.tasks.find(t => t.id === activeId);
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
          <div class="todo-comment-text" id="ctxt_${c.id}">${_todoLinkify(c.text)}</div>
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
  const activeId = _tmActiveSubId || _todoModalTaskId;
  _todoAddComment(activeId, text);
  input.value = '';
  _tmAutoResize(input);
  _tmRenderComments();
  _todoRenderTaskList();
}

function _tmEditComment(commentId) {
  const activeId = _tmActiveSubId || _todoModalTaskId;
  const task = _todoData.tasks.find(t => t.id === activeId);
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
    const activeId = _tmActiveSubId || _todoModalTaskId;
    if (val && val !== original) _todoEditComment(activeId, commentId, val);
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
  const activeId = _tmActiveSubId || _todoModalTaskId;
  _todoDeleteComment(activeId, commentId);
  _tmRenderComments();
  _todoRenderTaskList();
}

/* ══════════════════════════════════════════
   COLONNE DROITE — propriétés (2/2)
   Option A : bascule sur la sous-tâche active
   ══════════════════════════════════════════ */
function _tmRenderRight() {
  const el = document.getElementById('tmRight');
  if (!el) return;

  /* Tâche affichée : sous-tâche active ou parent */
  const activeId = _tmActiveSubId || _todoModalTaskId;
  const task     = _todoData.tasks.find(t => t.id === activeId);
  if (!task) return;
  const isSub    = !!_tmActiveSubId;

  const parent   = isSub ? _todoData.tasks.find(t => t.id === _todoModalTaskId) : null;
  const folders  = _todoData.folders;
  const types    = _todoData.settings.taskTypes;
  const statuses = _todoData.settings.taskStatuses;
  const recTypes = [
    { val:'none',    label:'Pas de récurrence' },
    { val:'daily',   label:'Tous les jours' },
    { val:'weekly',  label:'Toutes les semaines' },
    { val:'monthly', label:'Tous les mois' },
    { val:'yearly',  label:'Tous les ans' }
  ];

  /* Helpers couleur/nom (compat string legacy) */
  const tName  = t => typeof t === 'object' ? (t?.name  || '') : (t  || '');
  const tColor = t => typeof t === 'object' ? (t?.color || '#546e7a') : '#546e7a';
  const curTypeName   = tName(task.type);
  const curStatusName = tName(task.status);
  const curTypeObj    = types.find(t => tName(t) === curTypeName);
  const curStatusObj  = statuses.find(s => tName(s) === curStatusName);
  const curTypeColor  = curTypeObj   ? tColor(curTypeObj)   : '#546e7a';
  const curStatusColor= curStatusObj ? tColor(curStatusObj) : '#546e7a';

  const assigneeNames = (task.assignees || []).map(a => a.name || a);

  /* Bandeau retour si sous-tâche active */
  const breadcrumb = isSub ? `
    <div class="tm-sub-breadcrumb">
      <span class="tm-sub-back" onclick="_tmSelectSub('${_tmActiveSubId}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        ${_esc(parent?.title || 'Tâche parente')}
      </span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      <span style="color:var(--text);font-weight:600">${_esc(task.title)}</span>
    </div>` : '';

  /* Récurrence sous-tâche : select followsParent */
  const recurrenceBlock = isSub ? `
    <div class="todo-prop">
      <div class="todo-prop-label">Récurrence</div>
      <div class="todo-prop-value" style="padding:4px 8px">
        <select onchange="_tmSetFollowsParent(this.value)">
          <option value="true"  ${task.followsParent !== false ? 'selected' : ''}>Suit la récurrence parente</option>
          <option value="false" ${task.followsParent === false ? 'selected' : ''}>Unique à cette itération</option>
        </select>
      </div>
    </div>` : `
    <div class="todo-prop">
      <div class="todo-prop-label">Récurrence</div>
      <div class="todo-prop-value" style="padding:4px 8px">
        <select onchange="_tmSetRecurrence(this.value)">
          ${recTypes.map(r => `<option value="${r.val}"
            ${(task.recurrence?.type || 'none') === r.val ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select>
      </div>
    </div>`;

  el.innerHTML = `
    ${breadcrumb}

    <!-- Priorité -->
    <div class="todo-prop">
      <div class="todo-prop-label">Priorité</div>
      <div class="todo-priority-opts">
        ${['P1','P2','P3','P4'].map(p => `
          <div class="todo-priority-opt ${p.toLowerCase()} ${task.priority === p ? 'selected' : ''}"
               onclick="_tmSetPriority('${p}')">${p}</div>`).join('')}
      </div>
    </div>

    <!-- Type (OBLIGATOIRE, en premier) -->
    <div class="todo-prop" id="tmPropType">
      <div class="todo-prop-label">
        Type <span class="tm-required-star">*</span>
        <span style="margin-left:auto;cursor:pointer;color:var(--accent);font-size:9px"
              onclick="_tmOpenTagsDialog('type')">Gérer</span>
      </div>
      <div class="todo-prop-value">
        ${curTypeName ? `<span class="tm-color-dot" style="background:${curTypeColor}"></span>` : ''}
        <select onchange="_tmSetType(this.value)">
          <option value="">— Aucun —</option>
          ${types.map(t => {
            const n = tName(t);
            return `<option value="${_esc(n)}" ${curTypeName === n ? 'selected' : ''}>${_esc(n)}</option>`;
          }).join('')}
        </select>
      </div>
    </div>

    <!-- Statut (OBLIGATOIRE, en second) -->
    <div class="todo-prop" id="tmPropStatus">
      <div class="todo-prop-label">
        Statut <span class="tm-required-star">*</span>
        <span style="margin-left:auto;cursor:pointer;color:var(--accent);font-size:9px"
              onclick="_tmOpenTagsDialog('status')">Gérer</span>
      </div>
      <div class="todo-prop-value">
        ${curStatusName ? `<span class="tm-color-dot" style="background:${curStatusColor}"></span>` : ''}
        <select onchange="_tmSetStatus(this.value)">
          <option value="">— Aucun —</option>
          ${statuses.map(s => {
            const n = tName(s);
            return `<option value="${_esc(n)}" ${curStatusName === n ? 'selected' : ''}>${_esc(n)}</option>`;
          }).join('')}
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

    ${recurrenceBlock}

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
               placeholder="Ajouter un responsable…" autocomplete="off"
               style="margin:0;font-size:11px;padding:5px 8px"
               oninput="_tmAssigneeSearch(this.value)"
               onkeydown="_tmAssigneeKey(event)">
        <div class="todo-assignee-dropdown" id="tmAssigneeDropdown" style="display:none"></div>
      </div>
    </div>

    ${!isSub ? `
    <!-- Dossier (parent seulement) -->
    <div class="todo-prop">
      <div class="todo-prop-label">Dossier</div>
      <div class="todo-prop-value">
        <select onchange="_tmSetFolder(this.value)">
          <option value="">— Sans dossier —</option>
          ${folders.map(f => `<option value="${f.id}" ${task.folderId === f.id ? 'selected' : ''}>${_esc(f.name)}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Partage (parent seulement) -->
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
        <input class="todo-dialog-input" id="tmShareInput" placeholder="Email utilisateur…"
               style="margin:0;font-size:11px;padding:5px 8px;flex:1"
               onkeydown="if(event.key==='Enter')_tmShareSubmit()">
        <button class="todo-dialog-ok" style="padding:5px 10px;font-size:11px;white-space:nowrap"
                onclick="_tmShareSubmit()">Partager</button>
      </div>
    </div>` : ''}`;
}

/* ── Setters propriétés (ciblent _tmActiveSubId ou parent) ── */
function _tmSetPriority(p) {
  const id = _tmActiveSubId || _todoModalTaskId;
  _todoUpdateTask(id, { priority: p });
  _todoRenderTaskList();
  _tmRenderRight();
}
function _tmSetStatus(s) {
  const id = _tmActiveSubId || _todoModalTaskId;
  _todoUpdateTask(id, { status: s });
  document.getElementById('tmPropStatus')?.classList.remove('tm-required-missing');
  _todoRenderTaskList();
  _tmRenderRight();
}
function _tmSetType(t) {
  const id = _tmActiveSubId || _todoModalTaskId;
  _todoUpdateTask(id, { type: t });
  document.getElementById('tmPropType')?.classList.remove('tm-required-missing');
  _todoRenderTaskList();
  _tmRenderRight();
}
function _tmSetDueDate(val) {
  const id = _tmActiveSubId || _todoModalTaskId;
  _todoUpdateTask(id, { dueDate: val ? new Date(val).toISOString() : null });
  _todoRenderTaskList();
}
function _tmSetRecurrence(val) {
  const id   = _tmActiveSubId || _todoModalTaskId;
  const task = _todoData.tasks.find(t => t.id === id);
  const rec  = { type: val, interval: task?.recurrence?.interval || 1 };
  _todoUpdateTask(id, { recurrence: rec });
  _todoRenderTaskList();
}
function _tmSetFollowsParent(val) {
  if (_tmActiveSubId) {
    _todoUpdateTask(_tmActiveSubId, { followsParent: val === 'true' || val === true });
    _tmRenderRight();
  }
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
  const activeId = _tmActiveSubId || _todoModalTaskId;
  const task   = _todoData.tasks.find(t => t.id === activeId);
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
  const activeId = _tmActiveSubId || _todoModalTaskId;
  const task = _todoData.tasks.find(t => t.id === activeId);
  if (!task) return;
  const assignees = task.assignees || [];
  if (assignees.find(a => (a.name || a) === name)) return;
  assignees.push({ name });
  _todoUpdateTask(activeId, { assignees });
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
  const activeId = _tmActiveSubId || _todoModalTaskId;
  const task = _todoData.tasks.find(t => t.id === activeId);
  if (!task) return;
  task.assignees = (task.assignees || []).filter(a => (a.name || a) !== name);
  _todoUpdateTask(activeId, { assignees: task.assignees });
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

/* ── Palette couleurs pour types/statuts ── */
const _TM_TAG_COLORS = [
  '#EC7206','#e53935','#8e24aa','#1e88e5','#43a047',
  '#fb8c00','#6d4c41','#546e7a','#00897b','#f06292'
];
let _tmTagPickedColor = _TM_TAG_COLORS[0];

/* Popup flottante générique pour choisir une couleur */
function _tmShowColorPanel(anchorEl, currentColor, onPick) {
  document.getElementById('tmDotColorPanel')?.remove();
  const panel = document.createElement('div');
  panel.id = 'tmDotColorPanel';
  panel.style.cssText = 'position:fixed;z-index:1400;background:var(--surface);' +
    'border:1px solid var(--border);border-radius:8px;padding:8px;' +
    'display:flex;flex-wrap:wrap;gap:5px;width:148px;box-shadow:0 4px 16px var(--shadow)';
  _TM_TAG_COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.style.cssText = `width:18px;height:18px;border-radius:50%;background:${c};cursor:pointer;` +
      `border:2.5px solid ${c === currentColor ? 'var(--text)' : 'transparent'};flex-shrink:0`;
    sw.onclick = e => { e.stopPropagation(); onPick(c); panel.remove(); };
    panel.appendChild(sw);
  });
  document.body.appendChild(panel);
  const rect = anchorEl.getBoundingClientRect();
  panel.style.top  = (rect.bottom + 4) + 'px';
  panel.style.left = rect.left + 'px';
  const close = e => {
    if (!panel.contains(e.target) && e.target !== anchorEl) {
      panel.remove(); document.removeEventListener('click', close, true);
    }
  };
  setTimeout(() => document.addEventListener('click', close, true), 0);
}

/* ── Dialog gestion types / statuts ── */
function _tmOpenTagsDialog(kind) {
  const isType = kind === 'type';
  const label  = isType ? 'Types de tâches' : 'Statuts';
  _tmTagPickedColor = _TM_TAG_COLORS[0];

  document.getElementById('todoDialogOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'todo-dialog-overlay';
  overlay.id = 'todoDialogOverlay';
  overlay.onclick = e => { if (e.target === overlay) { _todoCloseDialog(); _tmRenderRight(); } };

  overlay.innerHTML = `
    <div class="todo-dialog" style="width:340px">
      <div class="todo-dialog-title">${label}</div>
      <div class="todo-tags-list" id="tmTagsList">${_tmTagsListHtml(kind)}</div>
      <div class="todo-tag-add-row">
        <span class="todo-tag-dot" id="tmAddDot" style="background:${_tmTagPickedColor};cursor:pointer"
              onclick="event.stopPropagation();_tmAddDotPick(this)"></span>
        <input class="todo-dialog-input" id="tmTagInput"
               placeholder="Nouveau…" style="margin:0;flex:1;font-size:12px"
               onkeydown="if(event.key==='Enter')_tmTagAdd('${kind}')">
        <button class="todo-tag-add-btn" onclick="_tmTagAdd('${kind}')">+</button>
      </div>
      <div class="todo-dialog-actions">
        <button class="todo-dialog-ok" onclick="_todoCloseDialog();_tmRenderRight()">Fermer</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.getElementById('tmTagInput').focus();
}

function _tmAddDotPick(dotEl) {
  _tmShowColorPanel(dotEl, _tmTagPickedColor, c => {
    _tmTagPickedColor = c;
    dotEl.style.background = c;
  });
}

function _tmTagsListHtml(kind) {
  const cur = kind === 'type' ? _todoData.settings.taskTypes : _todoData.settings.taskStatuses;
  return cur.map(item => {
    const name  = typeof item === 'object' ? (item.name  || '') : item;
    const color = typeof item === 'object' ? (item.color || '#546e7a') : '#546e7a';
    return `
      <div class="todo-tag-item" data-tag-name="${_esc(name)}" data-tag-kind="${kind}"
           onclick="_tmTagEditOpen('${kind}','${_esc(name)}','${color}')">
        <span class="todo-tag-dot" style="background:${color};cursor:pointer"
              onclick="event.stopPropagation();_tmDotColorPick('${kind}','${_esc(name)}','${color}',this)"></span>
        <span class="todo-tag-name">${_esc(name)}</span>
        <div class="todo-tag-del" title="Supprimer"
             onclick="event.stopPropagation();_tmTagRemove('${kind}','${_esc(name)}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
      </div>`;
  }).join('');
}

/* Ouvre un mini-formulaire d'édition inline dans la ligne du tag */
function _tmTagEditOpen(kind, name, color) {
  /* Fermer tout éventuel éditeur déjà ouvert */
  document.querySelector('.tm-tag-edit-form')?.closest('.todo-tag-item')
    ?.replaceWith(document.createRange().createContextualFragment(
      _tmTagsListHtml(kind).split('</div>').slice(0,1).join('') /* fallback — on re-render */
    ));
  const list = document.getElementById('tmTagsList');
  if (!list) return;
  list.innerHTML = _tmTagsListHtml(kind); /* reset propre */

  const row = [...list.querySelectorAll('.todo-tag-item')]
    .find(el => el.dataset.tagName === name);
  if (!row) return;

  row.innerHTML = `
    <div class="tm-tag-edit-form" style="display:flex;gap:6px;align-items:center;width:100%">
      <span class="todo-tag-dot tm-edit-dot" style="background:${color};display:inline-block;
            width:14px;height:14px;min-width:14px;border-radius:50%;cursor:pointer"
            onclick="_tmTagEditCyclePicker(this)"></span>
      <input class="todo-dialog-input tm-tag-name-input" value="${_esc(name)}"
             style="margin:0;flex:1;font-size:12px;padding:4px 8px"
             onkeydown="if(event.key==='Enter')_tmTagEditSave('${kind}','${_esc(name)}');
                        if(event.key==='Escape'){_tmTagRefresh('${kind}');}">
      <div class="tm-color-picker-row" id="tmEditColorPicker" style="display:none;position:absolute;
           background:var(--surface);border:1px solid var(--border);border-radius:7px;
           padding:6px;box-shadow:0 4px 16px var(--shadow);z-index:1300;flex-wrap:wrap;gap:5px;width:160px">
        ${_TM_TAG_COLORS.map(c => `
          <div style="width:16px;height:16px;border-radius:50%;background:${c};cursor:pointer;
               border:2px solid ${c === color ? 'var(--text)' : 'transparent'};flex-shrink:0"
               onclick="event.stopPropagation();_tmTagEditPickColor(this,'${c}')"></div>`).join('')}
      </div>
      <button class="todo-dialog-ok" style="padding:4px 10px;font-size:11px"
              onclick="_tmTagEditSave('${kind}','${_esc(name)}')">OK</button>
      <button class="todo-dialog-cancel" style="padding:4px 8px;font-size:11px"
              onclick="_tmTagRefresh('${kind}')">✕</button>
    </div>`;
  row.querySelector('.tm-tag-name-input')?.focus();
  row.querySelector('.tm-tag-name-input')?.select();
  /* Stocker la couleur courante de l'éditeur */
  row.dataset.editColor = color;
}

function _tmTagEditCyclePicker(dotEl) {
  const picker = document.getElementById('tmEditColorPicker');
  if (!picker) return;
  const rect = dotEl.getBoundingClientRect();
  picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
  picker.style.top  = (rect.bottom + 4) + 'px';
  picker.style.left = rect.left + 'px';
  if (picker.style.display !== 'none') {
    const close = e => { if (!picker.contains(e.target) && e.target !== dotEl) { picker.style.display = 'none'; document.removeEventListener('click', close, true); }};
    setTimeout(() => document.addEventListener('click', close, true), 0);
  }
}

function _tmTagEditPickColor(swatchEl, color) {
  const row = swatchEl.closest('.todo-tag-item');
  if (!row) return;
  row.dataset.editColor = color;
  const dot = row.querySelector('.tm-edit-dot');
  if (dot) dot.style.background = color;
  const picker = document.getElementById('tmEditColorPicker');
  if (picker) {
    picker.querySelectorAll('div').forEach(d => d.style.borderColor = 'transparent');
    swatchEl.style.borderColor = 'var(--text)';
    picker.style.display = 'none';
  }
}

function _tmTagEditSave(kind, oldName) {
  const list = document.getElementById('tmTagsList');
  if (!list) return;
  const row      = [...list.querySelectorAll('.todo-tag-item')].find(el => el.dataset.tagName === oldName);
  const newName  = row?.querySelector('.tm-tag-name-input')?.value.trim();
  const newColor = row?.dataset.editColor || _TM_TAG_COLORS[0];
  if (!newName) return;
  if (kind === 'type')   _todoUpdateType(oldName, newName, newColor);
  else                   _todoUpdateStatus(oldName, newName, newColor);
  _tmTagRefresh(kind);
  _tmRenderRight();
}

function _tmTagRefresh(kind) {
  const list = document.getElementById('tmTagsList');
  if (list) list.innerHTML = _tmTagsListHtml(kind);
}

function _tmDotColorPick(kind, name, currentColor, dotEl) {
  _tmShowColorPanel(dotEl, currentColor, c => {
    if (kind === 'type') _todoUpdateType(name, name, c);
    else                 _todoUpdateStatus(name, name, c);
    _tmTagRefresh(kind);
    _tmRenderRight();
  });
}

function _tmTagAdd(kind) {
  const input = document.getElementById('tmTagInput');
  if (!input?.value.trim()) return;
  if (kind === 'type') _todoAddType(input.value, _tmTagPickedColor);
  else                 _todoAddStatus(input.value, _tmTagPickedColor);
  input.value = '';
  _tmTagRefresh(kind);
}

function _tmTagRemove(kind, name) {
  if (kind === 'type') _todoRemoveType(name);
  else                 _todoRemoveStatus(name);
  _tmTagRefresh(kind);
}
