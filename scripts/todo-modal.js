/* ═══════════════════════════════════════════
   todo-modal.js — Modale détail tâche (1/2)
   Colonne gauche : titre, desc, sous-tâches, commentaires
   Colonne droite : toutes les propriétés
   ═══════════════════════════════════════════ */

let _todoModalTaskId  = null;
let _tmActiveSubId    = null; /* null = parent, sinon id sous-tâche active (Option A) */
let _tmLinkPopupOpen  = false;

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
  /* Pas de validation pour les tâches reçues */
  if (!_todoIsReceivedShared(_todoModalTaskId)) {
    const task = _todoData.tasks.find(t => t.id === _todoModalTaskId);
    if (task) {
      const typeName   = typeof task.type   === 'object' ? task.type?.name   : task.type;
      const statusName = typeof task.status === 'object' ? task.status?.name : task.status;
      if (!typeName || !statusName) {
        const missing = [!typeName && 'Type', !statusName && 'Statut'].filter(Boolean).join(' et ');
        _todoShowToast(`⚠ ${missing} obligatoire(s) — veuillez renseigner avant de fermer`);
        document.querySelectorAll('.tm-required-missing').forEach(el => el.classList.remove('tm-required-missing'));
        if (!typeName)   document.getElementById('tmPropType')?.classList.add('tm-required-missing');
        if (!statusName) document.getElementById('tmPropStatus')?.classList.add('tm-required-missing');
        return;
      }
    }
  }
  document.getElementById('todoModalOverlay')?.remove();
  _todoModalTaskId = null;
  _tmActiveSubId   = null;
}

/* ── HTML interne de la modale (réutilisé par rendu initial et navigation) ── */
function _tmModalHtml(task) {
  return `
      <!-- Colonne gauche -->
      <div class="todo-modal-left">
        <div class="todo-modal-left-header">
          ${_tmNavHtml(task.id)}
          <button class="todo-modal-x-btn" onclick="_todoCloseModal()" title="Fermer">&#x2715;</button>
        </div>
        <div class="todo-modal-left-body">

          <!-- Titre -->
          <div class="tm-title-wrap">
            <div class="tm-title-view" id="tmTitleView"
                 onclick="_tmEditTitle(event)">${task.title ? _todoLinkify(task.title) : '<span class="tm-placeholder">Titre de la tâche…</span>'}</div>
            <div class="tm-title-edit" id="tmTitleEdit" style="display:none">
              <textarea class="todo-modal-title-input" id="tmTitle"
                rows="1" placeholder="Titre de la tâche…"
                oninput="_tmAutoResize(this)"
                onblur="_tmSaveTitle()"
                onkeydown="if(event.key==='Escape')this.blur()">${_esc(task.title)}</textarea>
              <button class="tm-link-btn" title="Insérer un lien"
                      onmousedown="event.preventDefault()"
                      onclick="_tmInsertLink('tmTitle',this)"></button>
            </div>
          </div>

          <!-- Description -->
          <div class="tm-desc-wrap">
            <div class="tm-desc-view" id="tmDescView"
                 onclick="_tmEditDesc(event)">${task.description ? _todoNl2br(task.description) : '<span class="tm-placeholder">Ajouter une description…</span>'}</div>
            <div class="tm-desc-edit" id="tmDescEdit" style="display:none">
              <div style="position:relative">
                <textarea class="todo-modal-desc" id="tmDesc"
                  rows="3" placeholder="Ajouter une description…"
                  oninput="_tmAutoResize(this)"
                  onblur="_tmSaveDesc()">${_esc(task.description || '')}</textarea>
                <button class="tm-link-btn tm-link-btn-abs" title="Insérer un lien"
                        onmousedown="event.preventDefault()"
                        onclick="_tmInsertLink('tmDesc',this)"></button>
                <button class="tm-link-btn tm-link-btn-abs tm-ai-field-btn" title="Résumé IA"
                        style="right:36px"
                        onmousedown="event.preventDefault()"
                        onclick="_aiOpenFieldPopup('tmDesc',this)">IA</button>
              </div>
            </div>
          </div>

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
            ${!_todoIsReceivedShared(task.id) ? `<div class="todo-add-subtask" onclick="_tmAddSubtask()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Ajouter une sous-tâche
            </div>` : ''}
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
                <div style="display:flex;justify-content:flex-end;align-items:center;gap:6px;margin-top:6px">
                  <button class="tm-link-btn" title="Insérer un lien"
                          onmousedown="event.preventDefault()"
                          onclick="_tmInsertLink('tmCommentInput',this)"></button>
                  <button class="tm-link-btn tm-ai-field-btn" title="Résumé IA"
                          onmousedown="event.preventDefault()"
                          onclick="_aiOpenFieldPopup('tmCommentInput',this)">IA</button>
                  <button class="todo-comment-submit" onclick="_tmSubmitComment()">Envoyer</button>
                </div>
              </div>
            </div>
          </div>

        </div><!-- /left-body -->

        <!-- Footer gauche -->
        <div class="todo-modal-footer">
          <div class="todo-modal-footer-info">
            Créé le ${_todoFmt(task.createdAt)}${task.createdBy ? ` par ${_esc(_todoShortName(task.createdBy))}` : ''}
            ${task.updatedAt && task.updatedAt !== task.createdAt
              ? ` · Modifié le ${_todoFmt(task.updatedAt)}${task.updatedBy ? ` par ${_esc(_todoShortName(task.updatedBy))}` : ''}` : ''}
          </div>
          <div class="todo-modal-close" title="Fermer" onclick="_todoCloseModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </div>
        </div>
      </div><!-- /left -->

      <!-- Colonne droite (propriétés) -->
      <div class="todo-modal-right" id="tmRight"></div>`;
}

/* ── Rendu complet de la modale ── */
function _todoRenderModal() {
  const task = _todoFindTask(_todoModalTaskId);
  if (!task) { document.getElementById('todoModalOverlay')?.remove(); return; }

  const existing = document.getElementById('todoModalOverlay');
  if (existing) {
    /* Mise à jour en place — pas de flash backdrop */
    existing.querySelector('.todo-modal').innerHTML = _tmModalHtml(task);
  } else {
    const overlay = document.createElement('div');
    overlay.className = 'todo-modal-overlay';
    overlay.id = 'todoModalOverlay';
    overlay.onclick = e => { if (e.target === overlay) _todoCloseModal(); };
    overlay.innerHTML = `<div class="todo-modal" onclick="event.stopPropagation()">${_tmModalHtml(task)}</div>`;
    document.body.appendChild(overlay);
  }

  _tmRenderSubtasks();
  _tmRenderComments();
  _tmRenderRight();
  document.getElementById('todoModalOverlay').querySelectorAll('textarea').forEach(_tmAutoResize);
}

/* ── Auto-resize textarea ── */
function _tmAutoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

/* ── Bascule vue/édition pour le titre ── */
function _tmEditTitle(e) {
  if (e?.target?.tagName === 'A') return;
  if (_todoIsReceivedShared(_todoModalTaskId)) return; /* lecture seule pour les tâches reçues */
  _tmBackToParent();
  document.getElementById('tmTitleView').style.display = 'none';
  const editEl = document.getElementById('tmTitleEdit');
  editEl.style.display = 'flex';
  const ta = document.getElementById('tmTitle');
  _tmAutoResize(ta);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

/* ── Bascule vue/édition pour la description ── */
function _tmEditDesc(e) {
  if (e?.target?.tagName === 'A') return;
  if (_todoIsReceivedShared(_todoModalTaskId)) return; /* lecture seule pour les tâches reçues */
  _tmBackToParent();
  document.getElementById('tmDescView').style.display = 'none';
  const editEl = document.getElementById('tmDescEdit');
  editEl.style.display = '';
  const ta = document.getElementById('tmDesc');
  _tmAutoResize(ta);
  ta.focus();
}

/* ── Sauvegardes titre / description ── */
function _tmSaveTitle() {
  if (_tmLinkPopupOpen) return; // popup lien ouvert → ne pas quitter l'édition
  const ta = document.getElementById('tmTitle');
  if (!ta) return;
  const val = ta.value.trim();
  if (val) {
    const existing = _todoData.tasks.find(t => t.id === _todoModalTaskId);
    if (existing && val !== existing.title) {
      _todoUpdateTask(_todoModalTaskId, { title: val });
      _todoRenderTaskList();
      _todoRenderSidebar();
    }
  }
  const displayVal = val || (_todoData.tasks.find(t => t.id === _todoModalTaskId)?.title || '');
  const viewEl = document.getElementById('tmTitleView');
  const editEl = document.getElementById('tmTitleEdit');
  if (viewEl && editEl) {
    viewEl.innerHTML = displayVal ? _todoLinkify(displayVal) : '<span class="tm-placeholder">Titre de la tâche…</span>';
    editEl.style.display = 'none';
    viewEl.style.display = '';
  }
}
function _tmSaveDesc() {
  if (_tmLinkPopupOpen) return;
  const ta = document.getElementById('tmDesc');
  if (!ta) return;
  const val = ta.value || '';
  _todoUpdateTask(_todoModalTaskId, { description: val });
  const viewEl = document.getElementById('tmDescView');
  const editEl = document.getElementById('tmDescEdit');
  if (viewEl && editEl) {
    viewEl.innerHTML = val ? _todoNl2br(val) : '<span class="tm-placeholder">Ajouter une description…</span>';
    editEl.style.display = 'none';
    viewEl.style.display = '';
  }
}

/* ── Sous-tâches (Option A : clic sur la ligne bascule droite + commentaires) ── */
function _tmRenderSubtasks() {
  const el = document.getElementById('tmSubtasks');
  if (!el) return;
  const received = _todoIsReceivedShared(_todoModalTaskId);
  /* Pour une tâche reçue, les sous-tâches sont dans _todoSharedTasks */
  const subs = received
    ? Object.values(_todoSharedTasks).filter(t => t && t.parentId === _todoModalTaskId)
    : _todoData.tasks.filter(t => t.parentId === _todoModalTaskId);
  if (!subs.length) { el.innerHTML = ''; return; }
  el.innerHTML = subs.map(st => {
    const isActive = st.id === _tmActiveSubId;
    const inputId  = `tmSubInput_${st.id}`;
    /* En mode reçu : titre non éditable, pas de bouton supprimer */
    const titlePart = (!received && isActive)
      ? `<input type="text" id="${inputId}" value="${_esc(st.title)}"
               onclick="event.stopPropagation()"
               onfocus="_tmFocusSub('${st.id}')"
               onblur="_tmSaveSubtask('${st.id}',this.value)"
               onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')this.blur()">
         <button class="tm-link-btn" title="Insérer un lien" style="flex-shrink:0"
                 onmousedown="event.preventDefault()"
                 onclick="event.stopPropagation();_tmInsertLink('${inputId}',this)"></button>`
      : `<div class="tm-sub-title-view ${st.completed ? 'done' : ''}"
              onclick="event.stopPropagation();_tmSelectSub('${st.id}')">${st.title ? _todoLinkify(st.title) : ''}</div>`;
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
      ${titlePart}
      ${!received ? `<div class="todo-subtask-del" title="Supprimer"
           onclick="event.stopPropagation();_tmDeleteSubtask('${st.id}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </div>` : ''}
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
  if (_todoIsReceivedShared(_todoModalTaskId)) return; /* pas d'ajout sur tâche reçue */
  const task = _todoData.tasks.find(t => t.id === _todoModalTaskId);
  if (!task) return;
  const st = _todoCreateTask('Nouvelle sous-tâche', task.folderId, _todoModalTaskId);
  /* Propager automatiquement le partage du parent vers la nouvelle sous-tâche */
  if (task.sharedWith && task.sharedWith.length > 0) {
    st.sharedWith = [...task.sharedWith];
    _todoTouchTask(st);
    _todoSyncShared(st);
    _todoSave();
  }
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
  if (_tmLinkPopupOpen) return;
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
  const task     = _todoFindTask(activeId);
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
          <div class="todo-comment-text" id="ctxt_${c.id}">${_todoNl2br(c.text)}</div>
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
  const task = _todoFindTask(activeId);
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
  const activeId   = _tmActiveSubId || _todoModalTaskId;
  const task       = _todoFindTask(activeId);
  if (!task) return;
  const isSub      = !!_tmActiveSubId;
  const isReceived = _todoIsReceivedShared(_todoModalTaskId); /* tâche reçue (pas possédée) */

  const parent   = isSub ? _todoFindTask(_todoModalTaskId) : null;
  const folders  = _todoData.folders;
  /* Pour une tâche reçue, les statuts/types viennent des settings du créateur */
  const types    = isReceived
    ? (task._ownerSettings?.taskTypes    || _todoData.settings.taskTypes)
    : _todoData.settings.taskTypes;
  const statuses = isReceived
    ? (task._ownerSettings?.taskStatuses || _todoData.settings.taskStatuses)
    : _todoData.settings.taskStatuses;
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
  /* Extrait le texte d'affichage en supprimant la syntaxe [texte](url) */
  const _plain = s => _esc((s || '').replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1'));
  const breadcrumb = isSub ? `
    <div class="tm-sub-breadcrumb">
      <span class="tm-sub-back" onclick="_tmSelectSub('${_tmActiveSubId}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        ${_plain(parent?.title || 'Tâche parente')}
      </span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      <span style="color:var(--text);font-weight:600">${_plain(task.title)}</span>
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

  if (isReceived) {
    /* ── Mode tâche reçue : champs limités ── */
    const ownerEmail = task.createdBy || '';
    const folderName = task._ownerFolderName || (task.folderId ? `Dossier #${task.folderId.slice(-4)}` : '—');
    el.innerHTML = `
      ${breadcrumb}

      <!-- Bandeau "Partagée par" -->
      <div class="todo-prop" style="background:rgba(99,102,241,.07);border-radius:6px;padding:6px 10px;margin-bottom:4px">
        <div style="font-size:10px;color:var(--muted);margin-bottom:2px">Partagée par</div>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="todo-comment-avatar" style="width:22px;height:22px;font-size:9px;flex-shrink:0">${_todoInitials(ownerEmail)}</div>
          <span style="font-size:11px;overflow:hidden;text-overflow:ellipsis">${_esc(_todoShortName(ownerEmail) || ownerEmail)}</span>
        </div>
      </div>

      <!-- Priorité (lecture seule) -->
      <div class="todo-prop">
        <div class="todo-prop-label">Priorité</div>
        <div class="todo-priority-opts">
          ${['P1','P2','P3','P4'].map(p => `
            <div class="todo-priority-opt ${p.toLowerCase()} ${task.priority === p ? 'selected' : ''}"
                 style="pointer-events:none;opacity:${task.priority === p ? '1' : '0.35'}">${p}</div>`).join('')}
        </div>
      </div>

      <!-- Type (lecture seule) -->
      <div class="todo-prop">
        <div class="todo-prop-label">Type
          <span style="margin-left:auto;font-size:9px;color:var(--muted);font-style:italic">Lecture seule</span>
        </div>
        <div class="todo-prop-value">
          ${curTypeName ? `<span class="tm-color-dot" style="background:${curTypeColor}"></span>` : ''}
          <span style="font-size:12px;color:var(--text)">${_esc(curTypeName) || '—'}</span>
        </div>
      </div>

      <!-- Statut (modifiable avec les statuts du créateur) -->
      <div class="todo-prop" id="tmPropStatus">
        <div class="todo-prop-label">Statut</div>
        <div class="todo-prop-value">
          ${curStatusName ? `<span class="tm-color-dot" style="background:${curStatusColor}"></span>` : ''}
          <select onchange="_tmSetStatusShared(this.value)">
            <option value="">— Aucun —</option>
            ${statuses.map(s => {
              const n = tName(s);
              return `<option value="${_esc(n)}" ${curStatusName === n ? 'selected' : ''}>${_esc(n)}</option>`;
            }).join('')}
          </select>
        </div>
      </div>

      <!-- Échéance (lecture seule) -->
      <div class="todo-prop">
        <div class="todo-prop-label">Échéance</div>
        <div class="todo-prop-value" style="padding:4px 8px;font-size:12px;color:var(--text)">
          ${task.dueDate ? _todoFmtDate(task.dueDate) : '—'}
        </div>
      </div>

      <!-- Dossier (lecture seule, affiche le nom du dossier du créateur si disponible) -->
      ${!isSub ? `
      <div class="todo-prop">
        <div class="todo-prop-label">Dossier
          <span style="margin-left:auto;font-size:9px;color:var(--muted);font-style:italic">Lecture seule</span>
        </div>
        <div class="todo-prop-value" style="padding:4px 8px;font-size:12px;color:var(--text)">${_esc(folderName)}</div>
      </div>` : ''}

      <!-- Responsables (modifiable) -->
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
      </div>`;
    return;
  }

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

    <!-- Type (OBLIGATOIRE pour les tâches parentes ; hérité et non modifiable pour les sous-tâches) -->
    <div class="todo-prop" id="tmPropType">
      <div class="todo-prop-label">
        Type ${!isSub ? '<span class="tm-required-star">*</span>' : ''}
        ${isSub
          ? `<span style="margin-left:auto;font-size:9px;color:var(--muted);font-style:italic">Hérité du parent</span>`
          : `<span style="margin-left:auto;cursor:pointer;color:var(--accent);font-size:9px" onclick="_tmOpenTagsDialog('type')">Gérer</span>`}
      </div>
      <div class="todo-prop-value">
        ${curTypeName ? `<span class="tm-color-dot" style="background:${curTypeColor}"></span>` : ''}
        ${isSub
          ? `<span style="font-size:12px;color:var(--text)">${_esc(curTypeName) || '—'}</span>`
          : `<select onchange="_tmSetType(this.value)">
              <option value="">— Aucun —</option>
              ${types.map(t => {
                const n = tName(t);
                return `<option value="${_esc(n)}" ${curTypeName === n ? 'selected' : ''}>${_esc(n)}</option>`;
              }).join('')}
            </select>`}
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
    </div>` : ''}

    <!-- Partage (parent et sous-tâche) -->
    <div class="todo-prop">
      <div class="todo-prop-label">Partager avec</div>
      <div class="todo-share-list" id="tmShareList">
        ${(task.sharedWith || []).map(uid => `
          <div class="todo-share-item">
            <div class="todo-comment-avatar" style="width:22px;height:22px;font-size:9px">${_todoInitials(uid)}</div>
            <span style="font-size:11px;overflow:hidden;text-overflow:ellipsis">${_esc(_todoShortName(uid) || uid)}</span>
            <span class="todo-share-remove" onclick="_tmUnshare('${_esc(uid)}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </span>
          </div>`).join('')}
      </div>
      ${_tmSharePickerHtml()}
    </div>`;
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
  /* Propagation aux sous-tâches si tâche parente */
  if (!_tmActiveSubId) {
    const now = new Date().toISOString();
    _todoData.tasks.filter(s => s.parentId === id).forEach(s => { s.type = t; s.updatedAt = now; });
    _todoSave();
  }
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
  const task   = _todoFindTask(activeId);
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
  const task = _todoFindTask(activeId);
  if (!task) return;
  const assignees = task.assignees || [];
  if (assignees.find(a => (a.name || a) === name)) return;
  assignees.push({ name });
  if (_todoIsReceivedShared(activeId)) {
    _todoUpdateSharedTask(activeId, { assignees });
  } else {
    _todoUpdateTask(activeId, { assignees });
  }
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
  const task = _todoFindTask(activeId);
  if (!task) return;
  task.assignees = (task.assignees || []).filter(a => (a.name || a) !== name);
  if (_todoIsReceivedShared(activeId)) {
    _todoUpdateSharedTask(activeId, { assignees: task.assignees });
  } else {
    _todoUpdateTask(activeId, { assignees: task.assignees });
  }
  _todoRenderTaskList();
  _tmRenderRight();
}

/* ── Partage — sélecteur de ressources ── */

/* Génère le HTML du sélecteur de ressource pour le partage */
function _tmSharePickerHtml() {
  return `<div style="position:relative;margin-top:6px">
    <input class="todo-dialog-input" id="tmShareInput"
           placeholder="Rechercher une ressource…" autocomplete="off"
           style="margin:0;font-size:11px;padding:5px 8px;width:100%;box-sizing:border-box"
           oninput="_tmShareSearch(this.value)"
           onkeydown="if(event.key==='Escape'){document.getElementById('tmShareDropdown').style.display='none';this.value='';}">
    <div id="tmShareDropdown" class="todo-assignee-dropdown" style="display:none"></div>
  </div>`;
}

function _tmShareSearch(val) {
  const drop = document.getElementById('tmShareDropdown');
  if (!drop) return;
  const q = val.trim().toLowerCase();
  if (!q) { drop.style.display = 'none'; return; }
  const activeId = _tmActiveSubId || _todoModalTaskId;
  const task     = _todoFindTask(activeId);
  const already  = (task?.sharedWith || []);
  const matches = _todoGetResources().filter(name => {
    if (name.toLowerCase().indexOf(q) === -1) return false;
    const email = _resourceToEmail(name);
    if (!email) return false; /* pas d'email @4cad.fr → bloqué */
    return !already.includes(email);
  });
  if (!matches.length) { drop.style.display = 'none'; return; }
  drop.style.display = 'block';
  drop.innerHTML = matches.slice(0, 8).map(n => {
    const email = _resourceToEmail(n);
    return `<div class="todo-assignee-opt" onclick="_tmShareWithResource('${_esc(n)}')">
      <span>${_esc(n)}</span>
      <span style="color:var(--muted);font-size:10px;margin-left:auto">${_esc(email)}</span>
    </div>`;
  }).join('');
}

function _tmShareWithResource(name) {
  const email = _resourceToEmail(name);
  if (!email) {
    _todoShowToast('Impossible de déterminer l\'email de cette ressource');
    return;
  }
  _todoShareTask(_tmActiveSubId || _todoModalTaskId, email);
  const inp = document.getElementById('tmShareInput');
  if (inp) inp.value = '';
  document.getElementById('tmShareDropdown').style.display = 'none';
  _tmRenderRight();
  _todoShowToast(`Tâche partagée avec ${name}`);
}

function _tmUnshare(uid) {
  _todoUnshareTask(_tmActiveSubId || _todoModalTaskId, uid);
  _tmRenderRight();
}

/* Setter statut pour une tâche reçue (sauvegarde sur Firebase shared) */
function _tmSetStatusShared(s) {
  const id = _tmActiveSubId || _todoModalTaskId;
  _todoUpdateSharedTask(id, { status: s });
  _todoRenderTaskList();
  _tmRenderRight();
}

/* ── Palette couleurs pour types/statuts ── */
const _TM_TAG_COLORS = [
  '#e53935','#e91e63','#8e24aa','#5c6bc0',
  '#1e88e5','#00acc1','#00897b','#43a047',
  '#c0ca33','#f9a825','#fb8c00','#EC7206',
  '#f06292','#6d4c41','#546e7a','#78909c'
];
let _tmTagPickedColor = _TM_TAG_COLORS[0];

/* Popup flottante générique pour choisir une couleur */
function _tmShowColorPanel(anchorEl, currentColor, onPick) {
  document.getElementById('tmDotColorPanel')?.remove();
  const panel = document.createElement('div');
  panel.id = 'tmDotColorPanel';
  panel.style.cssText = 'position:fixed;z-index:1400;background:var(--surface);' +
    'border:1px solid var(--border);border-radius:8px;padding:8px;' +
    'display:flex;flex-wrap:wrap;gap:5px;width:200px;box-shadow:0 4px 16px var(--shadow)';
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
           padding:6px;box-shadow:0 4px 16px var(--shadow);z-index:1300;flex-wrap:wrap;gap:5px;width:210px">
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

/* ── Insertion de lien [texte](url) dans un textarea ── */
function _tmInsertLink(textareaId, btnEl) {
  document.getElementById('tmLinkPopup')?.remove();
  _tmLinkPopupOpen = true;
  const ta = document.getElementById(textareaId);
  const sel = ta ? ta.value.substring(ta.selectionStart, ta.selectionEnd) : '';

  const popup = document.createElement('div');
  popup.id = 'tmLinkPopup';
  popup.style.cssText = 'position:fixed;z-index:1500;background:var(--surface);' +
    'border:1px solid var(--border);border-radius:8px;padding:12px;' +
    'box-shadow:0 4px 20px var(--shadow);width:240px;';
  popup.innerHTML = `
    <div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Insérer un lien</div>
    <input id="tmLinkText" value="${_esc(sel)}" placeholder="Texte affiché"
           style="width:100%;box-sizing:border-box;margin-bottom:6px;padding:5px 8px;font-size:12px;
                  background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--text);outline:none">
    <input id="tmLinkUrl" placeholder="https://…"
           style="width:100%;box-sizing:border-box;margin-bottom:8px;padding:5px 8px;font-size:12px;
                  background:var(--surface2);border:1px solid var(--border);border-radius:5px;color:var(--text);outline:none"
           onkeydown="if(event.key==='Enter')_tmConfirmLink('${textareaId}');if(event.key==='Escape'){_tmLinkPopupOpen=false;document.getElementById('tmLinkPopup')?.remove();}">
    <div style="display:flex;gap:6px;justify-content:flex-end">
      <button onclick="_tmLinkPopupOpen=false;document.getElementById('tmLinkPopup').remove()"
              style="padding:4px 10px;font-size:11px;border-radius:5px;border:1px solid var(--border);
                     background:transparent;color:var(--text);cursor:pointer">Annuler</button>
      <button onclick="_tmConfirmLink('${textareaId}')"
              style="padding:4px 10px;font-size:11px;border-radius:5px;border:none;
                     background:var(--accent);color:#fff;cursor:pointer">Insérer</button>
    </div>`;

  document.body.appendChild(popup);
  const rect   = btnEl.getBoundingClientRect();
  const popupH = popup.offsetHeight;
  const left   = Math.min(rect.left, window.innerWidth - 252);
  popup.style.left = left + 'px';
  /* Ouvre en bas si pas assez d'espace au-dessus */
  if (rect.top - popupH - 6 >= 0) {
    popup.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
  } else {
    popup.style.top = (rect.bottom + 6) + 'px';
  }

  const focusEl = sel ? document.getElementById('tmLinkUrl') : document.getElementById('tmLinkText');
  focusEl?.focus();

  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!popup.contains(e.target) && e.target !== btnEl) {
        popup.remove();
        _tmLinkPopupOpen = false;
        document.removeEventListener('click', close, true);
        /* Refocus textarea si toujours en mode édition */
        const taEl = document.getElementById(textareaId);
        if (taEl && taEl.offsetParent !== null) taEl.focus();
      }
    }, true);
  }, 0);
}

function _tmConfirmLink(textareaId) {
  const ta      = document.getElementById(textareaId);
  const text    = document.getElementById('tmLinkText')?.value.trim();
  const url     = document.getElementById('tmLinkUrl')?.value.trim();
  if (!ta || !url) { document.getElementById('tmLinkUrl')?.focus(); return; }
  const label   = text || url;
  const snippet = `[${label}](${url})`;
  const start   = ta.selectionStart;
  const end     = ta.selectionEnd;
  ta.value = ta.value.substring(0, start) + snippet + ta.value.substring(end);
  ta.selectionStart = ta.selectionEnd = start + snippet.length;
  _tmAutoResize(ta);
  document.getElementById('tmLinkPopup')?.remove();
  _tmLinkPopupOpen = false;
  ta.focus();
}

/* ── Navigation tâche précédente / suivante dans la vue courante ── */
function _tmNavHtml(taskId) {
  const ids = window._todoVisibleTaskIds || [];
  const idx = ids.indexOf(taskId);
  if (ids.length <= 1 || idx === -1) return '';

  const hasPrev = idx > 0;
  const hasNext = idx < ids.length - 1;

  return `
    <div class="tm-nav">
      <button class="tm-nav-btn${hasPrev ? '' : ' tm-nav-btn-off'}"
              title="Tâche précédente"
              ${hasPrev ? `onclick="_tmNavGo(${idx - 1})"` : 'disabled'}>&#8249;</button>
      <span class="tm-nav-count">${idx + 1}&thinsp;/&thinsp;${ids.length}</span>
      <button class="tm-nav-btn${hasNext ? '' : ' tm-nav-btn-off'}"
              title="Tâche suivante"
              ${hasNext ? `onclick="_tmNavGo(${idx + 1})"` : 'disabled'}>&#8250;</button>
    </div>`;
}

function _tmNavGo(idx) {
  const ids = window._todoVisibleTaskIds || [];
  const id  = ids[idx];
  if (!id) return;
  _todoModalTaskId = id;
  _tmActiveSubId   = null;
  _todoRenderModal();
}
