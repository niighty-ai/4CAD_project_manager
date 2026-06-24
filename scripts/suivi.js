/* ═══════════════════════════════════════════
   suivi.js — Suivi COPROJ : état, Firebase sync, CRUD
   Firebase path : suivi_data/{userId}
   La liste des clients est pilotée par les dossiers Todo liés aux clients du portfolio.
   ═══════════════════════════════════════════ */

/* ── État global ── */
let _suiviState    = { projects: [], activeId: null };
let _suiviLoaded   = false;
let _suiviSaveTimer = null;
let _suiviSaveTs   = 0;
let _suiviOpenEditor = null;
let _suiviCommentPanelActionId = null;
let _suiviBacklogPanelOpen = false;
let _suiviBlocNotePanelOpen = false;
let _suiviBlocNoteSaveTimer = null;

/* ── Constantes ── */
const _SUIVI_COLORS  = ['#EC7206','#72B6EC','#3fb950','#bc8cff','#F29318','#f85149','#56d364','#ffa657'];
const _SUIVI_STATUTS = ['todo','planned','wip','done'];
const _SUIVI_STATUT_LABELS = { todo:'À faire', planned:'Planifié', wip:'En cours', done:'Terminé' };
const _SUIVI_STATUT_COL    = { todo:'727F8E', planned:'72B6EC', wip:'F29318', done:'3fb950' };
const _SUIVI_TYPES  = ['action','comment','info','alert'];
const _SUIVI_TYPE_LABELS   = { action:'Action', comment:'Commentaire', info:'Info', alert:'Alerte' };
const _SUIVI_TYPE_COL_PPTX = { action:'EC7206', comment:'bc8cff', info:'72B6EC', alert:'f85149' };

/* ── Helpers ── */
function _suiviUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}
function _suiviEsc(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* Retourne le projet actif depuis _suiviState.projects (keyed par client name) */
function _suiviGetActive() {
  if (!_suiviState.activeId) return null;
  let p = _suiviState.projects.find(p => p.client === _suiviState.activeId);
  if (!p) {
    /* Auto-création d'un projet vierge si le dossier existe mais pas encore de données */
    p = {
      client: _suiviState.activeId,
      actions: [],
      interventions: { intervenants: ['Consultant 1'], rows: [] },
      updatedAt: new Date().toISOString()
    };
    _suiviState.projects.push(p);
  }
  return p;
}

/* Retourne les dossiers Todo dont le nom correspond à un client du portfolio */
function _suiviGetLinkedClients() {
  const portfolioClients = new Set(
    (typeof portfolio !== 'undefined' ? portfolio : []).map(p => p.client || '').filter(Boolean)
  );
  const folders = (typeof _todoData !== 'undefined' ? _todoData.folders || [] : []);
  return folders.filter(f => portfolioClients.has(f.name));
}

function _suiviFmtDate(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function _suiviIsOverdue(iso) {
  if (!iso) return false;
  return new Date(iso) < new Date(new Date().toDateString());
}
function _suiviFmtIntvDateShort(iso) {
  if (!iso) return '-';
  const d = new Date(iso + 'T12:00:00');
  const j = ['Dim.','Lun.','Mar.','Mer.','Jeu.','Ven.','Sam.'][d.getDay()];
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${j} ${dd}/${mm}`;
}
function _suiviFmtIntvDate(iso) {
  if (!iso) return '';
  const JOURS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const d = new Date(iso + 'T12:00:00');
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${JOURS[d.getDay()]} ${dd}/${mm}/${d.getFullYear()}`;
}
function _suiviFmtDur(dur) {
  if (!dur) return '';
  const LEGACY = { '0,25J':'2h', '0,5J':'4h', '0,75J':'6h', '1J':'Journée' };
  if (LEGACY[dur]) return LEGACY[dur];
  const h = parseFloat(dur);
  if (!isFinite(h)) return dur;
  if (h >= 8) return 'Journée';
  const hours = Math.floor(h);
  const mins  = Math.round((h - hours) * 60);
  if (hours === 0) return `${mins}min`;
  if (mins === 0)  return `${hours}h`;
  return `${hours}h${mins}`;
}
function _suiviDurOptsHtml(cur) {
  const steps = [0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8];
  return '<option value="">— vide —</option>' +
    steps.map(h => {
      const val = String(h);
      return `<option value="${val}"${cur===val?' selected':''}>${_suiviFmtDur(val)}</option>`;
    }).join('');
}
function _suiviDurHasPeriod(dur) {
  const h = parseFloat(dur);
  return dur && isFinite(h) && h <= 4;
}
function _suiviFmtCell(cell) {
  if (!cell || !cell.duration) return '';
  let s = _suiviFmtDur(cell.duration);
  if (_suiviDurHasPeriod(cell.duration) && cell.period) s += ' ' + cell.period;
  if (cell.note) s += ' ' + cell.note;
  return s;
}

/* ── Helpers responsables ── */
function _suiviInitials(name) {
  const PARTICLES = new Set(['du','de','la','le','les','des','d','l','au','aux','en','et','sur','sous','von','van']);
  const parts = (name || '').trim()
    .split(/[\s'‘’ʼ\-]+/)
    .map(p => p.replace(/[^a-zA-ZÀ-ɏ]/g, ''))
    .filter(p => p.length > 0 && !PARTICLES.has(p.toLowerCase()));
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  if (parts.length === 2) return (parts[0][0] + parts[1].slice(0, 2)).toUpperCase();
  return parts.map(p => p[0]).join('').toUpperCase();
}
function _suiviRespPillColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return _SUIVI_COLORS[h % _SUIVI_COLORS.length];
}
function _suiviGetAllResources() {
  const base = typeof _todoGetResources === 'function' ? _todoGetResources()
    : (typeof resources !== 'undefined' ? resources.map(r => r.nom || r.fullName || '').filter(Boolean) : []);
  const set = new Set(base);
  (_suiviState.projects || []).forEach(proj => {
    (proj.actions || []).forEach(a => {
      (a.responsables || []).forEach(r => { if (r.name) set.add(r.name); });
    });
  });
  if (typeof _todoData !== 'undefined' && _todoData?.tasks) {
    _todoData.tasks.forEach(t => {
      (t.assignees || []).forEach(a => { if (a.name) set.add(a.name); });
    });
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}
function _suiviRespPillsHtml(responsables) {
  const max = 3;
  const pills = (responsables || []).slice(0, max).map(r => {
    const ini = _suiviInitials(r.name);
    const col = _suiviRespPillColor(r.name);
    return `<span class="suivi-resp-pill" style="background:${col}" title="${_suiviEsc(r.name)}">${ini}</span>`;
  }).join('');
  const more = (responsables || []).length > max
    ? `<span class="suivi-resp-pill-more">+${(responsables || []).length - max}</span>` : '';
  const empty = !(responsables || []).length ? '<span class="suivi-resp-empty">＋</span>' : '';
  return pills + more + empty;
}

/* ── Migration ── */
function _suiviMigrateIntvDate(d) {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (/^\d{1,2}\/\d{1,2}$/.test(d)) {
    const [dd,mm] = d.split('/');
    return `2026-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d)) {
    const [dd,mm,yyyy] = d.split('/');
    return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
  }
  return d;
}
function _suiviMigrateProject(p) {
  if (p?.interventions?.rows)
    p.interventions.rows.forEach(r => { r.date = _suiviMigrateIntvDate(r.date||''); });
  /* Migration responsable → societe + init responsables[] */
  (p?.actions || []).forEach(a => {
    if (a.responsable !== undefined && a.societe === undefined) a.societe = a.responsable;
    if (!a.societe && (a.type === 'action' || !a.type)) a.societe = '4CAD';
    if (!a.responsables) a.responsables = [];
  });
  /* Migration bloc-note */
  if (!p.blocNote) p.blocNote = { entries: [] };
  if (!p.blocNote.entries) p.blocNote.entries = [];
  /* Migration numéros : attribuer un numéro 4 chiffres aux actions qui n'en ont pas */
  let maxNum = (p?.actions || []).reduce((m, a) => {
    const n = parseInt(a.numero, 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  (p?.actions || []).forEach(a => {
    if (!a.numero) {
      maxNum++;
      a.numero = String(maxNum).padStart(4, '0');
    }
  });
  return p;
}
function _suiviMigrateState(s) {
  if (s?.projects) s.projects.forEach(_suiviMigrateProject);
  /* Migration activeId : si c'est un UID (ancien format), tenter de retrouver le client */
  if (s?.activeId && s?.projects) {
    const byId = s.projects.find(p => p.id === s.activeId);
    if (byId) s.activeId = byId.client;
  }
  return s;
}

/* ── Persistance locale ── */
function _suiviWriteLS() {
  if (!currentUserId) return;
  try { localStorage.setItem('suivi_' + currentUserId, JSON.stringify(_suiviState)); } catch(e) {}
}
function _suiviReadLS() {
  if (!currentUserId) return;
  try {
    const raw = localStorage.getItem('suivi_' + currentUserId);
    if (raw) { _suiviState = JSON.parse(raw); _suiviMigrateState(_suiviState); }
  } catch(e) {}
}

/* ── Sauvegarde Firebase (debouncée 500 ms) ── */
function _suiviSave() {
  _suiviWriteLS();
  _suiviSaveTs = Date.now();
  clearTimeout(_suiviSaveTimer);
  _suiviSaveTimer = setTimeout(() => {
    if (!currentUserId || typeof window._fbSetSuiviData !== 'function') return;
    _suiviSaveTs = Date.now();
    window._fbSetSuiviData(currentUserId, _suiviState)
      .catch(e => console.warn('[suivi] save error', e));
  }, 500);
}

/* ── Chargement initial (appelé depuis app.js) ── */
function _startSuiviLoad(userId) {
  _suiviReadLS();
  if (typeof window._fbOnSuiviData === 'function') {
    window._fbOnSuiviData(userId, val => {
      if ((Date.now() - _suiviSaveTs) < 3000) return;
      if (val) {
        _suiviState = val;
        _suiviMigrateState(_suiviState);
        _suiviState.projects = _suiviState.projects || [];
        _suiviWriteLS();
      }
      _suiviLoaded = true;
      if (currentView === 'suivi') _suiviRender();
    });
  } else {
    _suiviLoaded = true;
  }

  /* Abonnement secondaire aux données Todo :
     - rafraîchit la vue complète (sidebar dépend à la fois de _todoData ET de portfolio)
     - synchronise les statuts Todo → Suivi en temps réel */
  if (typeof window._fbOnTodoData === 'function') {
    window._fbOnTodoData(userId, () => {
      /* Différer d'un tick pour que todo.js ait eu le temps de mettre à jour _todoData */
      setTimeout(() => {
        if (currentView === 'suivi') _suiviRender();
        _suiviSyncTodoToSuivi();
      }, 0);
    });
  }
}

/* ── Nouveau client : dropdown depuis les clients du portfolio ── */
function _suiviNewProject() {
  const panel = document.getElementById('suiviNewClientPanel');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : '';
  if (!isOpen) {
    _suiviFilterNewClientList('');
    const inp = panel.querySelector('.suivi-new-client-search');
    if (inp) { inp.value = ''; inp.focus(); }
  }
}

function _suiviFilterNewClientList(q) {
  const list = document.getElementById('suiviNewClientList');
  if (!list) return;
  const portfolioClients = [...new Set(
    (typeof portfolio !== 'undefined' ? portfolio : []).map(p => p.client || '').filter(Boolean)
  )].sort();
  const existingFolderNames = new Set(
    (typeof _todoData !== 'undefined' ? _todoData.folders || [] : []).map(f => f.name)
  );
  const filtered = q
    ? portfolioClients.filter(c => c.toLowerCase().includes(q.toLowerCase()))
    : portfolioClients;

  if (!filtered.length) {
    list.innerHTML = '<div class="suivi-new-client-empty">Aucun client trouvé</div>';
    return;
  }
  list.innerHTML = filtered.map(c => {
    const exists = existingFolderNames.has(c);
    return `<div class="suivi-new-client-item" onclick="_suiviSelectNewClient('${_suiviEsc(c)}')">
      <span>${_suiviEsc(c)}</span>
      ${exists ? '<span class="suivi-client-tag">✓ ajouté</span>' : ''}
    </div>`;
  }).join('');
}

function _suiviSelectNewClient(name) {
  if (!name) return;
  /* Créer le dossier Todo si inexistant */
  if (typeof _todoData !== 'undefined') {
    if (!_todoData.folders) _todoData.folders = [];
    const exists = _todoData.folders.find(f => f.name === name);
    if (!exists) {
      const color = _SUIVI_COLORS[_todoData.folders.length % _SUIVI_COLORS.length];
      if (typeof _todoCreateFolder === 'function') {
        _todoCreateFolder(name, color);
      } else {
        _todoData.folders.push({ id: _suiviUid(), name, color, order: _todoData.folders.length });
        if (typeof _todoSave === 'function') _todoSave();
      }
    }
  }
  _suiviState.activeId = name;
  _suiviSave();
  const panel = document.getElementById('suiviNewClientPanel');
  if (panel) panel.style.display = 'none';
  _suiviRender();
}

/* Ferme les panels flottants si on clique ailleurs */
document.addEventListener('click', e => {
  const newClientPanel = document.getElementById('suiviNewClientPanel');
  const newBtn = document.querySelector('.suivi-btn-new');
  if (newClientPanel && newClientPanel.style.display !== 'none' &&
      !newClientPanel.contains(e.target) && e.target !== newBtn) {
    newClientPanel.style.display = 'none';
  }
  const linkPanel = document.getElementById('suiviLinkPanel');
  if (linkPanel && linkPanel.style.display !== 'none' &&
      !linkPanel.contains(e.target) && !e.target.closest('.suivi-link-btn')) {
    _suiviCloseLinkPanel();
  }
  const commentPanel = document.getElementById('suiviCommentPanel');
  if (commentPanel && commentPanel.style.display !== 'none' &&
      !commentPanel.contains(e.target) && !e.target.closest('.suivi-comment-btn') &&
      !e.target.closest('.suivi-ai-popup')) {
    _suiviCloseCommentPanel();
  }
  const backlogPanel = document.getElementById('suiviBacklogPanel');
  const backlogBtn   = document.getElementById('suiviBtnHistorique');
  if (backlogPanel && !backlogPanel.contains(e.target) && e.target !== backlogBtn && !backlogBtn?.contains(e.target)) {
    _suiviCloseBacklogPanel();
  }
  const bnPanel = document.getElementById('suiviBlocNotePanel');
  const bnBtn   = document.getElementById('suiviBtnBlocNote');
  if (bnPanel && !bnPanel.contains(e.target) && !bnBtn?.contains(e.target) &&
      !e.target.closest('#suiviBnClearOverlay') && !e.target.closest('#suiviAiOverlay')) {
    _suiviCloseBlocNotePanel();
  }
  const resumePanel = document.getElementById('suiviResumePanel');
  const resumeBtn   = document.getElementById('suiviBtnResume');
  if (resumePanel && !resumePanel.contains(e.target) && !resumeBtn?.contains(e.target) &&
      !e.target.closest('#suiviAiOverlay')) {
    _suiviCloseResumePanel();
  }
}, true);

/* ── Commentaires sur les actions ── */

/* Retourne les commentaires d'une action : depuis la tâche Todo liée si elle existe,
   sinon depuis action.comments directement */
function _suiviGetActionComments(action) {
  if (action?.todoTaskId) {
    const task = _suiviGetTodoTask(action.todoTaskId);
    return task?.comments || [];
  }
  return action?.comments || [];
}

function _suiviAddActionComment(actionId, text) {
  if (!text?.trim()) return;
  const p = _suiviGetActive(); if (!p) return;
  const action = p.actions.find(a => a.id === actionId); if (!action) return;

  if (action.todoTaskId && typeof _todoAddComment === 'function') {
    _todoAddComment(action.todoTaskId, text);
    return;
  }

  if (!action.comments) action.comments = [];
  action.comments.push({
    id:         _suiviUid(),
    text:       text.trim(),
    authorId:   currentUserId,
    authorName: currentUserEmail,
    createdAt:  new Date().toISOString(),
    updatedAt:  null
  });
  p.updatedAt = new Date().toISOString();
  _suiviSave();
}

function _suiviEditActionComment(actionId, commentId, text) {
  if (!text?.trim()) return;
  const p = _suiviGetActive(); if (!p) return;
  const action = p.actions.find(a => a.id === actionId); if (!action) return;

  if (action.todoTaskId && typeof _todoEditComment === 'function') {
    _todoEditComment(action.todoTaskId, commentId, text);
    return;
  }

  const c = (action.comments || []).find(c => c.id === commentId);
  if (!c) return;
  c.text = text.trim();
  c.updatedAt = new Date().toISOString();
  p.updatedAt = new Date().toISOString();
  _suiviSave();
}

function _suiviDeleteActionComment(actionId, commentId) {
  const p = _suiviGetActive(); if (!p) return;
  const action = p.actions.find(a => a.id === actionId); if (!action) return;

  if (action.todoTaskId && typeof _todoDeleteComment === 'function') {
    _todoDeleteComment(action.todoTaskId, commentId);
    return;
  }

  action.comments = (action.comments || []).filter(c => c.id !== commentId);
  p.updatedAt = new Date().toISOString();
  _suiviSave();
}

function _suiviOpenCommentPanel(actionId, btnEl) {
  _suiviCloseLinkPanel();

  let panel = document.getElementById('suiviCommentPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'suiviCommentPanel';
    panel.className = 'suivi-comment-panel';
    document.body.appendChild(panel);
  }

  /* Toggle : fermer si déjà ouvert sur la même action */
  if (panel.style.display === 'block' && _suiviCommentPanelActionId === actionId) {
    _suiviCloseCommentPanel();
    return;
  }

  _suiviCommentPanelActionId = actionId;

  _suiviRenderCommentPanel(actionId);
  panel.style.display = 'block';

  const r = btnEl.getBoundingClientRect();
  panel.style.top  = (r.bottom + 4) + 'px';
  panel.style.left = r.left + 'px';

  requestAnimationFrame(() => {
    const pr = panel.getBoundingClientRect();
    if (pr.right > window.innerWidth - 8)  panel.style.left = (window.innerWidth - pr.width - 8) + 'px';
    if (pr.bottom > window.innerHeight - 8) panel.style.top  = (r.top - pr.height - 4) + 'px';
    const ta = panel.querySelector('.suivi-cp-input');
    if (ta) ta.focus();
  });
}

function _suiviCloseCommentPanel() {
  _suiviCommentPanelActionId = null;
  const panel = document.getElementById('suiviCommentPanel');
  if (panel) panel.style.display = 'none';
}

function _suiviRenderCommentPanel(actionId) {
  const panel = document.getElementById('suiviCommentPanel');
  if (!panel) return;
  const p = _suiviGetActive();
  const action = p?.actions.find(a => a.id === actionId);
  if (!action) { panel.innerHTML = ''; return; }

  const comments = _suiviGetActionComments(action);
  const linkedTask = action.todoTaskId ? _suiviGetTodoTask(action.todoTaskId) : null;

  const commentsHtml = comments.length ? comments.map(c => {
    const ini = _suiviInitials(c.authorName || c.authorId || '?');
    const isOwn = c.authorId === currentUserId;
    const authorShort = (c.authorName || '').split('@')[0] || c.authorId || '?';
    const dateStr = c.createdAt
      ? new Date(c.createdAt).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})
      : '';
    return `<div class="suivi-cp-comment" data-cid="${c.id}">
      <div class="suivi-cp-avatar">${ini}</div>
      <div class="suivi-cp-body">
        <div class="suivi-cp-header">
          <span class="suivi-cp-author">${_suiviEsc(authorShort)}</span>
          <span class="suivi-cp-date">${dateStr}</span>
          ${c.updatedAt ? `<span class="suivi-cp-edited">(modifié)</span>` : ''}
        </div>
        <div class="suivi-cp-text" id="scptxt_${c.id}">${_suiviEsc(c.text).replace(/\n/g,'<br>')}</div>
        ${isOwn ? `<div class="suivi-cp-actions">
          <span class="suivi-cp-action" onclick="_suiviEditCpComment('${actionId}','${c.id}')">Modifier</span>
          <span class="suivi-cp-action danger" onclick="_suiviDeleteCpComment('${actionId}','${c.id}')">Supprimer</span>
        </div>` : ''}
      </div>
    </div>`;
  }).join('') : '<div class="suivi-cp-empty">Aucun commentaire</div>';

  const linkedNote = linkedTask
    ? `<div class="suivi-cp-linked-note">Commentaires partagés avec la tâche Todo&ensp;"<em>${_suiviEsc(linkedTask.title)}</em>"</div>`
    : '';

  panel.innerHTML = `
    <div class="suivi-cp-header-bar">
      <span class="suivi-cp-title">Commentaires</span>
      <button class="suivi-cp-close" onclick="_suiviCloseCommentPanel()">✕</button>
    </div>
    ${linkedNote}
    <div class="suivi-cp-list">${commentsHtml}</div>
    <div class="suivi-cp-form">
      <textarea class="suivi-cp-input" id="suiviCpInput" rows="2"
        placeholder="Ajouter un commentaire… (Ctrl+Entrée)"
        onkeydown="if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();_suiviSubmitCpComment('${actionId}');}"
        oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
      <div class="suivi-cp-form-footer">
        <button class="suivi-ai-inline-btn" title="Correction IA"
          onmousedown="event.preventDefault()"
          onclick="event.stopPropagation();_suiviAiCorrectComment(this)">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          IA</button>
        <button class="suivi-cp-submit" onclick="_suiviSubmitCpComment('${actionId}')">Envoyer</button>
      </div>
    </div>`;
}

function _suiviSubmitCpComment(actionId) {
  const panel = document.getElementById('suiviCommentPanel');
  const ta = panel?.querySelector('.suivi-cp-input');
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) return;
  _suiviAddActionComment(actionId, text);
  ta.value = '';
  ta.style.height = 'auto';
  _suiviRenderCommentPanel(actionId);
  _suiviRenderActionsTbody();
}

function _suiviEditCpComment(actionId, commentId) {
  const panel = document.getElementById('suiviCommentPanel');
  const textEl = panel?.querySelector(`#scptxt_${commentId}`);
  if (!textEl) return;
  const p = _suiviGetActive(); if (!p) return;
  const action = p.actions.find(a => a.id === actionId); if (!action) return;
  const comments = _suiviGetActionComments(action);
  const c = comments.find(c => c.id === commentId);
  if (!c) return;
  const original = c.text;

  const ta = document.createElement('textarea');
  ta.className = 'suivi-cp-input';
  ta.value = original;
  ta.style.cssText = 'width:100%;margin-bottom:4px';
  textEl.replaceWith(ta);
  ta.style.height = ta.scrollHeight + 'px';
  ta.focus();

  const save = () => {
    const val = ta.value.trim();
    if (val && val !== original) _suiviEditActionComment(actionId, commentId, val);
    _suiviRenderCommentPanel(actionId);
    _suiviRenderActionsTbody();
  };
  ta.addEventListener('blur', save);
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ta.blur();
    if (e.key === 'Escape') { ta.value = original; ta.blur(); }
  });
}

function _suiviDeleteCpComment(actionId, commentId) {
  if (!confirm('Supprimer ce commentaire ?')) return;
  _suiviDeleteActionComment(actionId, commentId);
  _suiviRenderCommentPanel(actionId);
  _suiviRenderActionsTbody();
}

/* ── Lien Todo ── */

let _suiviLinkPanelActionId = null;

const _SUIVI_LINK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
const _SUIVI_DONE_LINK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
const _SUIVI_COMMENT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const _SUIVI_BACKLOG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;

function _suiviGetClientFolderId() {
  const p = _suiviGetActive();
  if (!p) return null;
  const folder = (typeof _todoData !== 'undefined' ? _todoData.folders || [] : []).find(f => f.name === p.client);
  return folder ? folder.id : null;
}

function _suiviGetTodoTask(taskId) {
  if (!taskId || typeof _todoData === 'undefined') return null;
  return (_todoData.tasks || []).find(t => t.id === taskId) || null;
}

function _suiviOpenLinkPanel(actionId, btnEl) {
  if (_suiviLinkPanelActionId === actionId) { _suiviCloseLinkPanel(); return; }
  _suiviLinkPanelActionId = actionId;

  const p = _suiviGetActive();
  if (!p) return;
  const action = p.actions.find(a => a.id === actionId);
  if (!action) return;

  let panel = document.getElementById('suiviLinkPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'suiviLinkPanel';
    panel.className = 'suivi-link-panel';
    document.body.appendChild(panel);
  }

  const folderId = _suiviGetClientFolderId();
  const allTasks = typeof _todoData !== 'undefined' ? _todoData.tasks || [] : [];
  const folderTasks = folderId ? allTasks.filter(t => t.folderId === folderId && !t.parentId) : [];
  const linkedTask = action.todoTaskId ? _suiviGetTodoTask(action.todoTaskId) : null;

  let html = `<div class="suivi-lp-title">Lier à une tâche Todo</div>`;

  if (linkedTask) {
    html += `<div class="suivi-lp-current">
      <span class="suivi-lp-current-label">Liée :</span>
      <button class="suivi-lp-current-name ${linkedTask.completed ? 'done' : ''}"
              onclick="_suiviOpenLinkedTaskModal('${linkedTask.id}')"
              title="Ouvrir dans Todo">
        ${_suiviEsc(linkedTask.title)}
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </button>
      <button class="suivi-lp-unlink" onclick="_suiviUnlinkTask('${actionId}')">Délier</button>
    </div>`;
  }

  html += `<button class="suivi-lp-create" onclick="_suiviCreateLinkTask('${actionId}')">
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    Créer une nouvelle tâche
  </button>`;

  if (folderTasks.length) {
    html += `<div class="suivi-lp-sep">Tâches existantes — ${_suiviEsc(p.client)}</div>`;
    html += `<div class="suivi-lp-list">` + folderTasks.map(t => {
      const isLinked = action.todoTaskId === t.id;
      const clickFn  = isLinked
        ? `_suiviOpenLinkedTaskModal('${t.id}')`
        : `_suiviLinkToTask('${actionId}','${t.id}')`;
      const itemTitle = isLinked ? 'Ouvrir dans Todo' : 'Lier cette tâche';
      return `<div class="suivi-lp-task ${isLinked ? 'selected' : ''}"
                   onclick="${clickFn}" title="${itemTitle}">
        <span class="suivi-lp-check ${t.completed ? 'done' : ''}">${t.completed ? '✓' : '○'}</span>
        <span class="suivi-lp-task-title">${_suiviEsc(t.title)}</span>
        ${isLinked ? `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--accent)"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>` : ''}
      </div>`;
    }).join('') + `</div>`;
  } else {
    html += `<div class="suivi-lp-empty">Aucune tâche dans ce dossier</div>`;
  }

  panel.innerHTML = html;
  panel.style.display = 'block';

  const r = btnEl.getBoundingClientRect();
  panel.style.top  = (r.bottom + 4) + 'px';
  panel.style.left = r.left + 'px';

  requestAnimationFrame(() => {
    const pr = panel.getBoundingClientRect();
    if (pr.right > window.innerWidth - 8)  panel.style.left = (window.innerWidth - pr.width - 8) + 'px';
    if (pr.bottom > window.innerHeight - 8) panel.style.top  = (r.top - pr.height - 4) + 'px';
  });
}

function _suiviCloseLinkPanel() {
  _suiviLinkPanelActionId = null;
  const panel = document.getElementById('suiviLinkPanel');
  if (panel) panel.style.display = 'none';
}

/* Ferme le panel et ouvre le modal Todo de la tâche liée */
function _suiviOpenLinkedTaskModal(taskId) {
  _suiviCloseLinkPanel();
  if (typeof _todoOpenModal === 'function') {
    setTimeout(() => _todoOpenModal(taskId), 50);
  }
}

function _suiviCreateLinkTask(actionId) {
  const p = _suiviGetActive(); if (!p) return;
  const action = p.actions.find(a => a.id === actionId); if (!action) return;
  const folderId = _suiviGetClientFolderId();
  if (!folderId) { _suiviToast('Dossier Todo introuvable pour ce client', 'error'); return; }
  if (typeof _todoCreateTask !== 'function') { _suiviToast('Module Todo indisponible', 'error'); return; }
  const title = action.action && action.action.trim() ? action.action.trim() : 'Nouvelle tâche';
  const task = _todoCreateTask(title, folderId, null);
  if (typeof _todoUpdateTask === 'function') {
    const patch = {};
    if (action.echeance) patch.dueDate = action.echeance;
    if (action.responsables && action.responsables.length) patch.assignees = action.responsables.map(r => ({ name: r.name }));
    if (Object.keys(patch).length) _todoUpdateTask(task.id, patch);
  }
  action.todoTaskId = task.id;

  /* Migration des commentaires de l'action vers la nouvelle tâche Todo */
  if (action.comments && action.comments.length) {
    const createdTask = typeof _todoData !== 'undefined'
      ? (_todoData.tasks || []).find(t => t.id === task.id) : null;
    if (createdTask) {
      createdTask.comments = [...action.comments];
      if (typeof _todoSave === 'function') _todoSave();
    }
    delete action.comments;
  }

  p.updatedAt = new Date().toISOString();
  _suiviSave();
  _suiviCloseLinkPanel();
  _suiviRenderActionsTbody();
  /* Ouvre le modal Todo pour que l'utilisateur complète Type, Statut et renomme si besoin */
  if (typeof _todoOpenModal === 'function') {
    setTimeout(() => _todoOpenModal(task.id), 50);
  }
}

function _suiviLinkToTask(actionId, taskId) {
  const p = _suiviGetActive(); if (!p) return;
  const action = p.actions.find(a => a.id === actionId); if (!action) return;
  action.todoTaskId = taskId;

  /* Migration des commentaires de l'action vers la tâche Todo liée */
  if (action.comments && action.comments.length && typeof _todoData !== 'undefined') {
    const task = (_todoData.tasks || []).find(t => t.id === taskId);
    if (task) {
      if (!task.comments) task.comments = [];
      task.comments = [...action.comments, ...task.comments];
      if (typeof _todoSave === 'function') _todoSave();
    }
    delete action.comments;
  }

  p.updatedAt = new Date().toISOString();
  _suiviSave();
  _suiviCloseLinkPanel();
  _suiviRenderActionsTbody();
}

function _suiviUnlinkTask(actionId) {
  const p = _suiviGetActive(); if (!p) return;
  const action = p.actions.find(a => a.id === actionId); if (!action) return;
  delete action.todoTaskId;
  p.updatedAt = new Date().toISOString();
  _suiviSave();
  _suiviCloseLinkPanel();
  _suiviRenderActionsTbody();
}

/* Suivi → Todo : quand l'action change de statut ou d'échéance, synchronise la tâche liée */
function _suiviSyncSuiviToTodo(action) {
  if (!action?.todoTaskId) return;
  const task = _suiviGetTodoTask(action.todoTaskId);
  if (!task) return;
  /* Sync statut */
  const shouldBeDone = action.statut === 'done';
  if (task.completed !== shouldBeDone && typeof _todoCompleteTask === 'function') {
    _todoCompleteTask(task.id);
  }
  /* Sync échéance */
  if (typeof _todoUpdateTask === 'function') {
    const newDate = action.echeance || null;
    if ((task.dueDate || null) !== newDate) {
      _todoUpdateTask(task.id, { dueDate: newDate });
    }
  }
}

/* Retourne l'ensemble des IDs de tâches Todo liées à des actions Suivi */
function _suiviGetLinkedTaskIds() {
  const ids = new Set();
  _suiviState.projects.forEach(proj => {
    (proj.actions || []).forEach(a => { if (a.todoTaskId) ids.add(a.todoTaskId); });
  });
  return ids;
}

/* Ouvre le date picker natif pour une ligne d'intervention */
function _suiviOpenIntvDate(rowId) {
  const inp = document.getElementById('suiviDP-' + rowId);
  if (!inp) return;
  try { inp.showPicker(); } catch(e) { inp.focus(); inp.click(); }
}

/* Todo → Suivi : quand _todoData change, met à jour le statut des actions liées */
function _suiviSyncTodoToSuivi() {
  if (typeof _todoData === 'undefined') return;
  let changed = false;
  _suiviState.projects.forEach(proj => {
    (proj.actions || []).forEach(action => {
      if (!action.todoTaskId) return;
      if (action.statut === 'backlog') return;  /* ne pas écraser le statut backlog */
      const task = _suiviGetTodoTask(action.todoTaskId);
      if (!task) {
        /* Tâche todo supprimée → nettoyer le lien orphelin */
        delete action.todoTaskId;
        action.updatedAt = new Date().toISOString();
        changed = true;
        return;
      }
      const taskDone = task.completed === true;
      const actionDone = action.statut === 'done';
      if (taskDone !== actionDone) {
        action.statut = taskDone ? 'done' : 'todo';
        action.updatedAt = new Date().toISOString();
        changed = true;
      }
      /* Sync échéance Todo → Suivi
         Normalise en YYYY-MM-DD : task.dueDate peut être un ISO complet
         ("2026-06-25T00:00:00.000Z") selon l'origine de la mise à jour */
      const taskDate = (task.dueDate || '').slice(0, 10);
      if (taskDate !== (action.echeance || '')) {
        action.echeance = taskDate;
        action.updatedAt = new Date().toISOString();
        changed = true;
      }
    });
  });
  if (changed) {
    _suiviSave();
    if (currentView === 'suivi') _suiviRenderActionsTbody();
  }
}

/* ── CRUD Actions ── */
function _suiviNextNumero(p) {
  const max = (p?.actions || []).reduce((m, a) => {
    const n = parseInt(a.numero, 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return String(max + 1).padStart(4, '0');
}

function _suiviAddAction() {
  const p = _suiviGetActive(); if (!p) return;
  p.actions.push({ id:_suiviUid(), numero:_suiviNextNumero(p), type:'action', action:'', societe:'4CAD', responsables:[], echeance:'', statut:'todo' });
  _suiviSave();
  _suiviRenderActionsTbody();
  setTimeout(() => {
    const rows = document.querySelectorAll('.suivi-action-input');
    if (rows.length) rows[rows.length-1].focus();
  }, 50);
}

function _suiviRemoveAction(id) {
  const p = _suiviGetActive(); if (!p) return;
  p.actions = p.actions.filter(a => a.id !== id);
  _suiviSave();
  _suiviRenderActionsTbody();
}

function _suiviMoveToBacklog(id) {
  const p = _suiviGetActive(); if (!p) return;
  const a = p.actions.find(a => a.id === id); if (!a) return;
  a.backlogPrevStatut = a.statut || 'todo';
  a.backlogDate = new Date().toISOString();
  a.statut = 'backlog';
  p.updatedAt = new Date().toISOString();
  _suiviSave();
  _suiviRenderActionsTbody();
  _suiviUpdateBacklogCount();
}

function _suiviRestoreFromBacklog(id) {
  const p = _suiviGetActive(); if (!p) return;
  const a = p.actions.find(a => a.id === id); if (!a) return;
  a.statut = a.backlogPrevStatut || 'todo';
  delete a.backlogPrevStatut;
  delete a.backlogDate;
  p.updatedAt = new Date().toISOString();
  _suiviSave();
  _suiviRenderActionsTbody();
  _suiviRenderBacklogPanel();
  _suiviUpdateBacklogCount();
}

function _suiviUpdateBacklogCount() {
  const p = _suiviGetActive();
  const btn = document.getElementById('suiviBtnHistorique');
  if (!btn) return;
  const count = p ? p.actions.filter(a => a.statut === 'backlog').length : 0;
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg> Backlog${count > 0 ? ` <span class="suivi-backlog-count">${count}</span>` : ''}`;
}

function _suiviUpdateBlocNoteCount() {
  const p = _suiviGetActive();
  const btn = document.getElementById('suiviBtnBlocNote');
  if (!btn) return;
  const count = p?.blocNote?.entries?.filter(e => e.text.trim()).length ?? 0;
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Notes${count > 0 ? ` <span class="suivi-backlog-count">${count}</span>` : ''}`;
}

function _suiviOpenBacklogPanel() {
  _suiviBacklogPanelOpen = !_suiviBacklogPanelOpen;
  if (!_suiviBacklogPanelOpen) {
    const panel = document.getElementById('suiviBacklogPanel');
    if (panel) panel.remove();
    return;
  }
  _suiviRenderBacklogPanel();
}

function _suiviCloseBacklogPanel() {
  _suiviBacklogPanelOpen = false;
  const panel = document.getElementById('suiviBacklogPanel');
  if (panel) panel.remove();
}

function _suiviRenderBacklogPanel() {
  const p = _suiviGetActive();
  const btn = document.getElementById('suiviBtnHistorique');
  if (!btn) return;

  let panel = document.getElementById('suiviBacklogPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'suiviBacklogPanel';
    document.body.appendChild(panel);
  }

  const backlogActions = p ? p.actions
    .filter(a => a.statut === 'backlog')
    .slice()
    .sort((a, b) => (b.backlogDate || '').localeCompare(a.backlogDate || ''))
    : [];

  const clientLabel = p ? (p.client || 'Client') : 'Client';

  const rows = backlogActions.map(a => {
    const type      = a.type || 'action';
    const isAction  = type === 'action';
    const typeLabel = _SUIVI_TYPE_LABELS[type] || type;
    const societe   = a.societe || '4CAD';
    const societeLabel = societe === '4CAD' ? '4CAD'
                       : societe === 'both'  ? `4CAD + ${clientLabel}`
                       : clientLabel;
    const respNames = (a.responsables || []).map(r => r.name).join(', ') || '-';
    const statutLabel = _SUIVI_STATUT_LABELS[a.backlogPrevStatut] || a.backlogPrevStatut || '-';
    const echeanceStr = _suiviFmtDate(a.echeance) || '-';
    const backlogDateStr = a.backlogDate
      ? new Date(a.backlogDate).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' })
      : '-';
    return `<tr>
      <td class="sbp-col-num">${a.numero ? `<span class="suivi-num-badge">${_suiviEsc(a.numero)}</span>` : ''}</td>
      <td class="sbp-col-type"><span class="sbp-type-badge sbp-type-${type}">${_suiviEsc(typeLabel)}</span></td>
      <td class="sbp-col-action">${_suiviEsc(a.action || '-')}</td>
      <td class="sbp-col-resp">${_suiviEsc(respNames)}</td>
      <td class="sbp-col-soc">${_suiviEsc(societeLabel)}</td>
      <td class="sbp-col-ech">${_suiviEsc(echeanceStr)}</td>
      <td class="sbp-col-stat"><span class="suivi-statut-badge suivi-s-${a.backlogPrevStatut || 'todo'}">${_suiviEsc(statutLabel)}</span></td>
      <td class="sbp-col-date">${_suiviEsc(backlogDateStr)}</td>
      <td class="sbp-col-restore"><button class="sbp-restore-btn" onclick="_suiviRestoreFromBacklog('${a.id}')">Restaurer</button></td>
    </tr>`;
  }).join('');

  panel.innerHTML = `
    <div class="sbp-header">
      <span class="sbp-title">📦 Backlog — Actions archivées</span>
      <button class="sbp-close" onclick="_suiviCloseBacklogPanel()">×</button>
    </div>
    <div class="sbp-body">
      ${backlogActions.length === 0
        ? '<div class="sbp-empty">Aucune action en backlog</div>'
        : `<table class="sbp-table">
            <thead><tr>
              <th class="sbp-col-num">N°</th>
              <th class="sbp-col-type">Type</th>
              <th class="sbp-col-action">Contenu</th>
              <th class="sbp-col-resp">Responsable</th>
              <th class="sbp-col-soc">Société</th>
              <th class="sbp-col-ech">Échéance</th>
              <th class="sbp-col-stat">Statut avant</th>
              <th class="sbp-col-date">Mis en backlog</th>
              <th class="sbp-col-restore"></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>`
      }
    </div>`;

  /* Position sous le bouton */
  const rect = btn.getBoundingClientRect();
  panel.style.cssText = `position:fixed;top:${rect.bottom + 6}px;right:${window.innerWidth - rect.right}px;`;
}

function _suiviUpdateAction(id, field, value) {
  const p = _suiviGetActive(); if (!p) return;
  const a = p.actions.find(a => a.id === id);
  if (a) {
    a[field] = value;
    p.updatedAt = new Date().toISOString();
    _suiviSave();
    if (field === 'statut' || field === 'echeance') _suiviSyncSuiviToTodo(a);
  }
  if (field === 'type' || field === 'statut' || field === 'echeance') _suiviRenderActionsTbody();
}

/* ── Export PPTX ── */
async function _suiviExportPPTX() {
  const p = _suiviGetActive();
  if (!p) return _suiviToast('Aucun projet sélectionné', 'error');

  if (typeof PptxGenJS === 'undefined') {
    _suiviToast('Bibliothèque PPTX non chargée', 'error');
    return;
  }

  const btn = document.getElementById('suiviBtnExportPptx');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Génération…'; }

  try {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';

    const NAVY  = '284053';
    const ORANGE = 'EC7206';
    const GRAY  = '727F8E';
    const WHITE = 'FFFFFF';
    const LBLUE = '72B6EC';
    const FONT  = 'Arial';

    function addBadge(slide) {
      slide.addText('4CAD', {
        x:12.0, y:0.1, w:1.2, h:0.35,
        fontSize:11, bold:true, color:WHITE, fontFace:FONT,
        align:'center', valign:'middle',
        fill:{ color:ORANGE }, shape:'rect'
      });
    }
    function addFooter(slide, dateStr) {
      slide.addText('4CAD  |  FOR YOUR INDUSTRY', {
        x:0.3, y:7.1, w:5, h:0.28, fontSize:8, color:ORANGE, fontFace:FONT, bold:true, valign:'middle'
      });
      slide.addText(dateStr, {
        x:10.5, y:7.1, w:2.5, h:0.28, fontSize:8, color:GRAY, fontFace:FONT, align:'right', valign:'middle'
      });
    }
    function addOrangeBar(slide, y, h) {
      slide.addText('', { x:0.3, y, w:0.05, h, fill:{ color:ORANGE } });
    }

    const today = new Date().toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric'});

    const s1 = pptx.addSlide();
    s1.background = { color: NAVY };
    addBadge(s1);
    addOrangeBar(s1, 3.8, 2.0);
    s1.addText('COPROJ', { x:0.5, y:1.0, w:12, h:1.6, fontSize:64, bold:true, color:WHITE, fontFace:FONT });
    s1.addText('Suivi hebdomadaire des actions', { x:0.5, y:2.6, w:10, h:0.55, fontSize:18, color:GRAY, fontFace:FONT });
    s1.addText(p.client, { x:0.55, y:3.85, w:9, h:0.8, fontSize:28, bold:true, color:ORANGE, fontFace:FONT });
    s1.addText(today,    { x:0.55, y:4.7,  w:8, h:0.45, fontSize:13, color:GRAY, fontFace:FONT });
    s1.addText('4CAD, FOR YOUR INDUSTRY', { x:0.55, y:6.6, w:8, h:0.35, fontSize:9, bold:true, color:ORANGE, fontFace:FONT, charSpacing:2 });

    const s2 = pptx.addSlide();
    s2.background = { color: NAVY };
    addBadge(s2);
    addOrangeBar(s2, 0.25, 0.5);
    s2.addText('Actions & Livrables', { x:0.5, y:0.2, w:11.5, h:0.6, fontSize:22, bold:true, color:WHITE, fontFace:FONT });

    const HDR_FILL = { color:'1e2f3f' };
    const ROW_FILL = { color:NAVY };
    const hdr = [
      { text:'N°',               options:{ bold:true, color:WHITE, fill:HDR_FILL, fontSize:11, fontFace:FONT, align:'center', valign:'middle' } },
      { text:'Type',             options:{ bold:true, color:WHITE, fill:HDR_FILL, fontSize:11, fontFace:FONT, align:'center', valign:'middle' } },
      { text:'Action / Contenu', options:{ bold:true, color:WHITE, fill:HDR_FILL, fontSize:11, fontFace:FONT, align:'left',   valign:'middle' } },
      { text:'Responsable',      options:{ bold:true, color:WHITE, fill:HDR_FILL, fontSize:11, fontFace:FONT, align:'center', valign:'middle' } },
      { text:'Société',          options:{ bold:true, color:WHITE, fill:HDR_FILL, fontSize:11, fontFace:FONT, align:'center', valign:'middle' } },
      { text:'Echéance',         options:{ bold:true, color:WHITE, fill:HDR_FILL, fontSize:11, fontFace:FONT, align:'center', valign:'middle' } },
      { text:'Statut',           options:{ bold:true, color:WHITE, fill:HDR_FILL, fontSize:11, fontFace:FONT, align:'center', valign:'middle' } }
    ];

    const dataRows = p.actions.filter(a => a.statut !== 'backlog').map(a => {
      const type      = a.type || 'action';
      const isAction  = type === 'action';
      const typeLabel = _SUIVI_TYPE_LABELS[type] || type;
      const typeColor = _SUIVI_TYPE_COL_PPTX[type] || GRAY;
      const clientName = p.client || 'Client';
      const societe   = a.societe || (isAction ? '4CAD' : '');
      const societeLabel = !societe         ? '-'
                         : societe === '4CAD'  ? '4CAD'
                         : societe === 'both'  ? '4CAD + ' + clientName
                         : clientName;
      const societeColor = societe === '4CAD' ? ORANGE : societe === 'both' ? '3fb950' : LBLUE;
      const respInitials = (a.responsables || []).map(r => _suiviInitials(r.name)).join(', ') || '-';
      const statLabel = isAction ? (_SUIVI_STATUT_LABELS[a.statut] || a.statut) : '-';
      const statColor = isAction ? (_SUIVI_STATUT_COL[a.statut] || GRAY) : GRAY;
      const dateStr   = isAction ? (_suiviFmtDate(a.echeance) || '-') : '-';
      const dateColor = (isAction && a.statut !== 'done' && _suiviIsOverdue(a.echeance)) ? 'f85149' : GRAY;
      return [
        { text:a.numero || '-',                      options:{ color:GRAY,                   fontSize:10, fontFace:'Courier New', align:'center', valign:'middle', fill:ROW_FILL, bold:true } },
        { text:typeLabel,                            options:{ color:typeColor,               fontSize:11, fontFace:FONT, align:'center', valign:'middle', fill:ROW_FILL, bold:true } },
        { text:a.action || '-',                      options:{ color:WHITE,                   fontSize:11, fontFace:FONT, align:'left',   valign:'top',    fill:ROW_FILL } },
        { text:respInitials,  options:{ color: respInitials !== '-' ? WHITE : GRAY,     fontSize:11, fontFace:FONT, align:'center', valign:'middle', fill:ROW_FILL } },
        { text:societeLabel,  options:{ color: societe       ? societeColor : GRAY,    fontSize:11, fontFace:FONT, align:'center', valign:'middle', fill:ROW_FILL, bold:!!societe } },
        { text:dateStr,                              options:{ color:dateColor,               fontSize:11, fontFace:FONT, align:'center', valign:'middle', fill:ROW_FILL } },
        { text:statLabel,                            options:{ color:statColor,               fontSize:11, fontFace:FONT, align:'center', valign:'middle', fill:ROW_FILL, bold:isAction } }
      ];
    });

    if (dataRows.length) {
      /* ── Largeur maximale : colonnes fixes au minimum, contenu prend le reste ── */
      const TABLE_X = 0.15;
      const TABLE_W = 13.33 - TABLE_X * 2;   // ≈ 13.03"
      const TABLE_Y = 0.9;

      /* Largeurs calibrées */
      const cNum  = 0.65;   // "0001" monospace
      const cType = 1.4;    // "Commentaire" 11 chars bold
      const cResp = 1.45;   // "Responsable" header
      const cSoc  = 1.3;    // "4CAD + Client"
      const cEch  = 1.15;   // "dd/mm/yyyy"
      const cStat = 1.1;    // "Planifié"
      const cAct  = parseFloat((TABLE_W - cNum - cType - cResp - cSoc - cEch - cStat).toFixed(3));

      /* ── Hauteurs variables ── */
      const CHARS_PER_LINE = Math.max(50, Math.round(cAct * 13));
      const H1 = 0.28;
      const Hx = 0.17;

      const visibleActions = p.actions.filter(a => a.statut !== 'backlog');
      const rowHeights = [
        0.32,
        ...visibleActions.map(a => {
          const lines = Math.max(1, Math.ceil((a.action || '').length / CHARS_PER_LINE));
          return parseFloat((H1 + Math.max(0, lines - 1) * Hx).toFixed(3));
        })
      ];

      s2.addTable([hdr, ...dataRows], {
        x: TABLE_X, y: TABLE_Y, w: TABLE_W,
        colW: [cNum, cType, cAct, cResp, cSoc, cEch, cStat],
        rowH: rowHeights,
        border: { type:'solid', color:'3d5972', pt:0.5 }
      });
    }
    addFooter(s2, today);

    /* ── Diapositives de commentaires : tableau Date/Commentaire, plusieurs actions par slide ── */
    const actionsWithComments = p.actions.filter(a => a.statut !== 'backlog' && _suiviGetActionComments(a).length > 0);
    if (actionsWithComments.length > 0) {
      const SLIDE_TOP   = 0.9;
      const SLIDE_BTM   = 6.75;
      const TBL_X       = 0.3;
      const TBL_W       = 13.0;
      const DATE_W      = 1.8;
      const COMM_W      = TBL_W - DATE_W;
      const TYPE_H      = 0.22;
      const HDR_ROW_H   = 0.28;
      const BASE_ROW_H  = 0.28;
      const ROW_CHARS   = 100;
      const EXTRA_H     = 0.18;
      const TITLE_CHARS = 90;
      const TITLE_BASE  = 0.3;
      const TITLE_EXTRA = 0.18;
      const GAP         = 0.28;
      const HDR_FILL    = { color:'1e2f3f' };
      const ROW_FILL    = { color:NAVY };

      function _cpActionLabel(a) {
        return (a.numero ? `Action ${a.numero} — ` : '') + (a.action || '—');
      }
      function _cpTitleH(a) {
        const lines = Math.max(1, Math.ceil(_cpActionLabel(a).length / TITLE_CHARS));
        return TITLE_BASE + Math.max(0, lines - 1) * TITLE_EXTRA;
      }
      function _cpRowH(c) {
        const lines = Math.max(1, Math.ceil((c.text || '').length / ROW_CHARS));
        return BASE_ROW_H + Math.max(0, lines - 1) * EXTRA_H;
      }
      function _cpBlockH(a) {
        const comments = _suiviGetActionComments(a);
        const rowsH = comments.reduce((s, c) => s + _cpRowH(c), 0);
        return TYPE_H + _cpTitleH(a) + HDR_ROW_H + rowsH + GAP;
      }

      let sc = null;
      let yPos = SLIDE_TOP;

      const newCpSlide = () => {
        if (sc) addFooter(sc, today);
        sc = pptx.addSlide();
        sc.background = { color: NAVY };
        addBadge(sc);
        addOrangeBar(sc, 0.25, 0.5);
        sc.addText('Points sur les actions', { x:0.5, y:0.2, w:11.5, h:0.6, fontSize:22, bold:true, color:WHITE, fontFace:FONT });
        yPos = SLIDE_TOP;
      };

      newCpSlide();

      for (const a of actionsWithComments) {
        const comments = _suiviGetActionComments(a);
        const bH = _cpBlockH(a);

        if (yPos > SLIDE_TOP && yPos + bH > SLIDE_BTM) newCpSlide();

        const typeLabel = (_SUIVI_TYPE_LABELS[a.type || 'action'] || (a.type || 'action')).toUpperCase();
        const typeColor = _SUIVI_TYPE_COL_PPTX[a.type || 'action'] || GRAY;
        sc.addText(typeLabel, { x:TBL_X, y:yPos, w:3, h:TYPE_H, fontSize:9, bold:true, color:typeColor, fontFace:FONT });
        yPos += TYPE_H;

        const titleH = _cpTitleH(a);
        sc.addText(_cpActionLabel(a), { x:TBL_X, y:yPos, w:TBL_W, h:titleH, fontSize:13, bold:true, color:WHITE, fontFace:FONT, breakLine:true });
        yPos += titleH;

        const tableHdr = [
          { text:'Date',          options:{ bold:true, color:WHITE, fill:HDR_FILL, fontSize:10, fontFace:FONT, align:'center', valign:'middle' } },
          { text:'Commentaires',  options:{ bold:true, color:WHITE, fill:HDR_FILL, fontSize:10, fontFace:FONT, align:'left',   valign:'middle' } }
        ];
        const rowHeightsTable = [HDR_ROW_H, ...comments.map(_cpRowH)];
        const tableData = [tableHdr, ...comments.map(c => {
          const dateStr = c.createdAt
            ? new Date(c.createdAt).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'})
            : '—';
          return [
            { text:dateStr,    options:{ color:ORANGE, fill:ROW_FILL, fontSize:10, fontFace:FONT, align:'center', valign:'middle', bold:true } },
            { text:c.text||'', options:{ color:WHITE,  fill:ROW_FILL, fontSize:10, fontFace:FONT, align:'left',   valign:'top', breakLine:true } }
          ];
        })];

        sc.addTable(tableData, {
          x:TBL_X, y:yPos, w:TBL_W,
          colW:[DATE_W, COMM_W],
          rowH:rowHeightsTable,
          border:{ type:'solid', color:'3d5972', pt:0.5 }
        });
        yPos += rowHeightsTable.reduce((s, h) => s + h, 0) + GAP;
      }
      if (sc) addFooter(sc, today);
    }

    if (p.interventions && p.interventions.rows.length > 0) {
      const intv = p.interventions;
      const s3 = pptx.addSlide();
      s3.background = { color: NAVY };
      addBadge(s3);
      addOrangeBar(s3, 0.25, 0.5);
      s3.addText('Planning des interventions', { x:0.5, y:0.2, w:11.5, h:0.6, fontSize:22, bold:true, color:WHITE, fontFace:FONT });
      s3.addText(p.client, { x:0.5, y:0.75, w:11.5, h:0.3, fontSize:12, color:ORANGE, fontFace:FONT, bold:true });

      const nInt = intv.intervenants.length;
      const totalW = 12.7;
      const dateW  = 1.6;
      const intW   = (totalW - dateW) / Math.max(nInt, 1);

      const intvHdr = [
        { text:'Date', options:{ bold:true, color:WHITE, fill:{color:'1e2f3f'}, fontSize:11, fontFace:FONT, align:'center', valign:'middle' } },
        ...intv.intervenants.map(n => ({ text:n, options:{ bold:true, color:WHITE, fill:{color:'1e2f3f'}, fontSize:11, fontFace:FONT, align:'center', valign:'middle' } }))
      ];
      const intvRows = intv.rows.map(row => [
        { text: _suiviFmtIntvDateShort(row.date), options:{ color:WHITE, fontSize:11, fontFace:FONT, align:'center', valign:'middle', fill:{color:NAVY}, bold:true } },
        ...intv.intervenants.map(name => {
          const cell  = row.cells[name] || null;
          const text  = cell ? _suiviFmtCell(cell) : '';
          const color = (cell && !cell.valide) ? ORANGE : (cell ? WHITE : '3d5972');
          return { text: text || '-', options:{ color, fontSize:11, fontFace:FONT, align:'center', valign:'middle', fill:{color:NAVY}, italic: !!(cell && !cell.valide) } };
        })
      ]);

      s3.addTable([intvHdr, ...intvRows], {
        x:0.3, y:1.1, w:totalW,
        colW:[dateW, ...intv.intervenants.map(() => intW)],
        rowH:0.32,
        border:{ type:'solid', color:'3d5972', pt:0.5 }
      });
      addFooter(s3, today);
    }

    await pptx.writeFile({ fileName: `COPROJ_${p.client.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.pptx` });
    _suiviToast('PPTX généré ✓');
  } catch(err) {
    console.error('[suivi] PPTX error:', err);
    _suiviToast('Erreur PPTX : ' + (err.message || err), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📊 PPTX'; }
  }
}

/* ── Toast ── */
function _suiviToast(msg, type = 'success') {
  const t = document.getElementById('suivi-toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `show ${type}`;
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.className = ''; }, 2800);
}

/* ── Interventions CRUD ── */
function _suiviAddIntvRow() {
  const p = _suiviGetActive(); if (!p) return;
  if (!p.interventions) p.interventions = { intervenants:['Intervenant 1'], rows:[] };
  p.interventions.rows.push({ id:_suiviUid(), date:'', cells:{} });
  _suiviSave();
  _suiviRenderIntvTable();
}

function _suiviRemoveIntvRow(id) {
  const p = _suiviGetActive(); if (!p || !p.interventions) return;
  p.interventions.rows = p.interventions.rows.filter(r => r.id !== id);
  _suiviSave();
  _suiviRenderIntvTable();
}

function _suiviUpdateIntvDate(id, val) {
  const p = _suiviGetActive(); if (!p || !p.interventions) return;
  const r = p.interventions.rows.find(r => r.id === id);
  if (r) {
    r.date = val;
    p.interventions.rows = [...p.interventions.rows].sort((a,b) => (a.date||'') < (b.date||'') ? -1 : 1);
    _suiviSave();
    _suiviRenderIntvTbody();
  }
}

function _suiviAddIntervenant() {
  const p = _suiviGetActive(); if (!p) return;
  if (!p.interventions) p.interventions = { intervenants:[], rows:[] };
  p.interventions.intervenants.push('Intervenant');
  _suiviSave();
  _suiviRenderIntvTable();
  setTimeout(() => {
    const ins = document.querySelectorAll('.suivi-th-input');
    if (ins.length) { ins[ins.length-1].focus(); ins[ins.length-1].select(); }
  }, 50);
}

function _suiviRemoveIntervenant(idx) {
  const p = _suiviGetActive(); if (!p || !p.interventions) return;
  const name = p.interventions.intervenants[idx];
  p.interventions.intervenants.splice(idx, 1);
  p.interventions.rows.forEach(r => delete r.cells[name]);
  _suiviSave();
  _suiviRenderIntvTable();
}

function _suiviUpdateIntervenant(idx, newName) {
  const p = _suiviGetActive(); if (!p || !p.interventions) return;
  const old = p.interventions.intervenants[idx];
  p.interventions.intervenants[idx] = newName;
  p.interventions.rows.forEach(r => {
    if (old in r.cells) { r.cells[newName] = r.cells[old]; delete r.cells[old]; }
  });
  _suiviSave();
}

function _suiviSetCell(rowId, name, data) {
  const p = _suiviGetActive(); if (!p || !p.interventions) return;
  const r = p.interventions.rows.find(r => r.id === rowId);
  if (!r) return;
  if (!data.duration) delete r.cells[name];
  else r.cells[name] = data;
  p.updatedAt = new Date().toISOString();
  _suiviSave();
}

function _suiviOpenIntvEditor(rowId, name) {
  if (_suiviOpenEditor) _suiviCloseIntvEditor(_suiviOpenEditor.rowId, _suiviOpenEditor.name);
  _suiviOpenEditor = { rowId, name };
  const slot = document.getElementById(`suiviSlot-${rowId}-${CSS.escape(name)}`);
  if (slot) slot.classList.add('editing');
}

function _suiviCloseIntvEditor(rowId, name) {
  const slot = document.getElementById(`suiviSlot-${rowId}-${CSS.escape(name)}`);
  if (slot) slot.classList.remove('editing');
  _suiviOpenEditor = null;
}

function _suiviSaveAndCloseIntvEditor(rowId, name) {
  const eid    = `${rowId}-${CSS.escape(name)}`;
  const dur    = document.getElementById(`suiviDur-${eid}`)?.value || '';
  const per    = _suiviDurHasPeriod(dur)
    ? (document.getElementById(`suiviPer-${eid}`)?.value || 'Matin') : '';
  const note   = document.getElementById(`suiviNote-${eid}`)?.value || '';
  const valide = document.getElementById(`suiviVal-${eid}`)?.dataset.valide === '1';
  _suiviSetCell(rowId, name, { duration:dur, period:per, note:note.trim(), valide });
  _suiviCloseIntvEditor(rowId, name);
  _suiviRenderIntvTbody();
}

function _suiviToggleCellValide(rowId, name) {
  const eid = `${rowId}-${CSS.escape(name)}`;
  const btn = document.getElementById(`suiviVal-${eid}`);
  if (!btn) return;
  const cur = btn.dataset.valide === '1';
  btn.dataset.valide = cur ? '0' : '1';
  btn.textContent = cur ? 'À valider' : 'Validé';
  btn.className = 'suivi-btn-valid ' + (cur ? 'v-no' : 'v-yes');
}

function _suiviOnDurChange(eid, dur) {
  const perSel = document.getElementById('suiviPer-' + eid);
  if (perSel) perSel.style.display = _suiviDurHasPeriod(dur) ? '' : 'none';
}

/* ── SVG calendrier (même icône que les onglets) ── */
const _SUIVI_CAL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

/* ── Render ── */
function _suiviSortActions(actions) {
  const typeOrder   = { action:0, comment:1, info:2, alert:3 };
  const statutOrder = { done:0, wip:1, planned:2, todo:3 };
  return [...actions].sort((a,b) => {
    const t = (typeOrder[a.type||'action']??9) - (typeOrder[b.type||'action']??9);
    if (t !== 0) return t;
    return (statutOrder[a.statut]??9) - (statutOrder[b.statut]??9);
  });
}

function _suiviSetActive(clientName) {
  _suiviState.activeId = clientName;
  _suiviSave();
  _suiviRender();
}

function _suiviRenderSidebar() {
  const list = document.getElementById('suiviProjectList');
  if (!list) return;
  const folders = _suiviGetLinkedClients();
  if (!folders.length) {
    list.innerHTML = '<div class="suivi-sidebar-empty">Aucun dossier Todo lié à un client.<br>Cliquez "+ Nouveau" pour en créer un.</div>';
    return;
  }
  list.innerHTML = folders.map(f => `
    <div class="suivi-project-item ${f.name === _suiviState.activeId ? 'active' : ''}"
         onclick="_suiviSetActive('${_suiviEsc(f.name)}')">
      <div class="suivi-project-dot" style="background:${f.color}"></div>
      <span class="suivi-project-name">${_suiviEsc(f.name)}</span>
    </div>
  `).join('');
}

function _suiviRenderActionsTbody() {
  const p = _suiviGetActive();
  const tbody = document.getElementById('suiviActionsTbody');
  if (!tbody) return;
  if (!p) { tbody.innerHTML = ''; return; }
  const clientLabel = p.client || 'Client';

  tbody.innerHTML = p.actions.filter(a => a.statut !== 'backlog').map(a => {
    const type      = a.type || 'action';
    const isAction  = type === 'action';
    const societe   = isAction ? (a.societe || a.responsable || '4CAD') : (a.societe || '');
    const overdueClass = (isAction && a.statut !== 'done' && _suiviIsOverdue(a.echeance)) ? ' overdue' : '';
    const rowClass = isAction ? '' : ' suivi-row-nonaction';

    /* Type : liste déroulante colorée */
    const typeSelect = `<select class="suivi-type-select suivi-type-${type}"
        onchange="_suiviUpdateAction('${a.id}','type',this.value)">
      <option value="action"  ${type==='action'  ?'selected':''}>Action</option>
      <option value="comment" ${type==='comment' ?'selected':''}>Commentaire</option>
      <option value="info"    ${type==='info'    ?'selected':''}>Info</option>
      <option value="alert"   ${type==='alert'   ?'selected':''}>Alerte</option>
    </select>`;

    /* Société : liste déroulante (toutes lignes, vide optionnel pour non-actions) */
    const societeClass = societe ? `suivi-resp-${societe}` : 'suivi-resp-none';
    const societeSelect = `<select class="suivi-resp-select ${societeClass}"
          onchange="this.className='suivi-resp-select '+(this.value?'suivi-resp-'+this.value:'suivi-resp-none');_suiviUpdateAction('${a.id}','societe',this.value)">
        ${!isAction ? `<option value="" ${!societe?'selected':''}></option>` : ''}
        <option value="4CAD"   ${societe==='4CAD'  ?'selected':''}>4CAD</option>
        <option value="client" ${societe==='client' ?'selected':''}>${clientLabel}</option>
        <option value="both"   ${societe==='both'   ?'selected':''}>4CAD + ${clientLabel}</option>
      </select>`;

    /* Responsable : pastilles colorées + picker au clic */
    const persCell = `<div class="suivi-resp-cell" data-aid="${a.id}"
        onclick="_suiviOpenRespPicker('${a.id}',this)" title="Cliquer pour modifier">
      ${_suiviRespPillsHtml(a.responsables)}
    </div>`;

    /* Statut : liste déroulante colorée (actions seulement) */
    const statutCell = isAction
      ? `<select class="suivi-statut-select suivi-s-${a.statut}"
            onchange="_suiviUpdateAction('${a.id}','statut',this.value)">
          <option value="todo"    ${a.statut==='todo'    ?'selected':''}>À faire</option>
          <option value="planned" ${a.statut==='planned' ?'selected':''}>Planifié</option>
          <option value="wip"     ${a.statut==='wip'     ?'selected':''}>En cours</option>
          <option value="done"    ${a.statut==='done'    ?'selected':''}>Terminé</option>
        </select>`
      : `<span class="suivi-statut-badge suivi-s-todo" style="cursor:default">—</span>`;

    /* Bouton de lien Todo — visible uniquement pour les actions 4CAD ou 4CAD+Client */
    const canLink    = isAction && (societe === '4CAD' || societe === 'both');
    const linkedTask = canLink && a.todoTaskId ? _suiviGetTodoTask(a.todoTaskId) : null;
    const taskDone   = linkedTask?.completed === true;
    const linkBtnClass = a.todoTaskId ? (taskDone ? 'suivi-link-btn linked done' : 'suivi-link-btn linked') : 'suivi-link-btn';
    const linkTitle  = linkedTask
      ? `Liée à : ${linkedTask.title}${taskDone ? ' ✓' : ''}`
      : 'Lier à une tâche Todo';
    const linkBtnHtml = canLink
      ? `<button class="${linkBtnClass}" onclick="_suiviOpenLinkPanel('${a.id}',this)" title="${_suiviEsc(linkTitle)}">${taskDone ? _SUIVI_DONE_LINK_ICON : _SUIVI_LINK_ICON}</button>`
      : '';

    /* Bouton commentaires */
    const actionComments = _suiviGetActionComments(a);
    const commentCount = actionComments.length;
    const commentBtnClass = commentCount > 0 ? 'suivi-comment-btn has-comments' : 'suivi-comment-btn';
    const commentTitle = commentCount > 0
      ? `${commentCount} commentaire${commentCount !== 1 ? 's' : ''}`
      : 'Ajouter un commentaire';
    const commentBtnHtml = `<button class="${commentBtnClass}"
      onclick="event.stopPropagation();_suiviOpenCommentPanel('${a.id}',this)"
      title="${commentTitle}">
      ${_SUIVI_COMMENT_ICON}${commentCount > 0 ? `<span>${commentCount}</span>` : ''}
    </button>`;

    /* Bouton backlog */
    const backlogBtnHtml = `<button class="suivi-backlog-btn"
      onclick="event.stopPropagation();_suiviMoveToBacklog('${a.id}')"
      title="Mettre en backlog">${_SUIVI_BACKLOG_ICON}</button>`;

    return `<tr class="${rowClass}" data-rid="${a.id}">
      <td class="suivi-drag-handle" title="Glisser pour réordonner">
        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
          <circle cx="4" cy="3" r="1.5"/><circle cx="8" cy="3" r="1.5"/>
          <circle cx="4" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/>
          <circle cx="4" cy="13" r="1.5"/><circle cx="8" cy="13" r="1.5"/>
        </svg>
      </td>
      <td class="suivi-col-num" title="N° action">${a.numero ? `<span class="suivi-num-badge">${_suiviEsc(a.numero)}</span>` : ''}</td>
      <td class="suivi-col-link">${linkBtnHtml}</td>
      <td class="suivi-col-comment">${commentBtnHtml}</td>
      <td class="suivi-col-backlog">${backlogBtnHtml}</td>
      <td class="suivi-col-type">${typeSelect}</td>
      <td class="suivi-col-action">
        <div class="suivi-action-cell-wrap">
          <textarea class="suivi-action-input" data-aid="${a.id}" rows="1" placeholder="Saisir le contenu…"
            onblur="_suiviUpdateAction('${a.id}','action',this.value)"
            onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.blur()}"
            oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
          >${_suiviEsc(a.action)}</textarea>
          <button class="suivi-ai-inline-btn" onclick="event.stopPropagation();_suiviAiCorrect('${a.id}',this)" title="Correction IA">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          </button>
        </div>
      </td>
      <td class="suivi-col-pers">${persCell}</td>
      <td class="suivi-col-societe">${societeSelect}</td>
      <td class="suivi-col-ech">
        <input type="date" class="suivi-date-input${overdueClass}" value="${_suiviEsc(a.echeance||'')}"
          onchange="_suiviUpdateAction('${a.id}','echeance',this.value)">
      </td>
      <td class="suivi-col-statut">${statutCell}</td>
      <td class="suivi-col-del">
        <button class="suivi-btn-del" onclick="_suiviRemoveAction('${a.id}')" title="Supprimer">🗑</button>
      </td>
    </tr>`;
  }).join('');

  /* Auto-resize des textareas après injection dans le DOM */
  requestAnimationFrame(() => {
    tbody.querySelectorAll('textarea.suivi-action-input').forEach(ta => {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    });
  });

  _suiviInitActionDrag(tbody);
}

function _suiviRenderIntvTable() {
  const p = _suiviGetActive();
  const section = document.getElementById('suiviIntvSection');
  if (!section) return;
  if (!p) { section.style.display = 'none'; return; }
  section.style.display = '';
  if (!p.interventions) p.interventions = { intervenants:['Intervenant 1'], rows:[] };
  _suiviRenderIntvThead();
  _suiviRenderIntvTbody();
}

function _suiviRenderIntvThead() {
  const p = _suiviGetActive(); if (!p || !p.interventions) return;
  const ints = p.interventions.intervenants;
  const thead = document.getElementById('suiviIntvThead');
  if (!thead) return;
  thead.innerHTML = `<tr>
    <th style="width:185px">Date</th>
    ${ints.map((n, i) => `
      <th>
        <div class="suivi-th-wrap">
          <input class="suivi-th-input" value="${_suiviEsc(n)}"
            onblur="_suiviUpdateIntervenant(${i},this.value)"
            onkeydown="if(event.key==='Enter')this.blur()">
          <button class="suivi-btn-rm-intv" onclick="_suiviRemoveIntervenant(${i})" title="Supprimer">×</button>
        </div>
      </th>
    `).join('')}
    <th class="suivi-th-add-intv"><button class="suivi-btn-add-col" onclick="_suiviAddIntervenant()">+ Intervenant</button></th>
    <th style="width:30px;background:var(--surface2);border-bottom:1px solid var(--border)"></th>
  </tr>`;
}

let _suiviDragRowId = null;

function _suiviRenderIntvTbody() {
  const p = _suiviGetActive(); if (!p || !p.interventions) return;
  const ints = p.interventions.intervenants;
  const sorted = [...p.interventions.rows].sort((a,b) => (a.date||'') < (b.date||'') ? -1 : 1);
  const tbody = document.getElementById('suiviIntvTbody');
  if (!tbody) return;

  tbody.innerHTML = sorted.map(row => {
    const dateLabel = row.date ? _suiviFmtIntvDate(row.date) : 'Choisir une date…';
    const dateLabelClass = row.date ? '' : 'empty';

    const dateCellHtml = `<div class="suivi-date-cell" onclick="_suiviOpenIntvDate('${row.id}')" title="Choisir une date">
      <span class="suivi-date-label ${dateLabelClass}">${dateLabel}</span>
      <span class="suivi-cal-icon">${_SUIVI_CAL_ICON}</span>
      <input type="date" id="suiviDP-${row.id}" class="suivi-date-picker-hidden" value="${_suiviEsc(row.date||'')}"
        onchange="_suiviUpdateIntvDate('${row.id}',this.value)">
    </div>`;

    const cellsHtml = ints.map(name => {
      const cell  = row.cells[name] || null;
      const text  = _suiviFmtCell(cell) || '·';
      const textClass = cell ? (cell.valide ? 'filled' : 'a-valider') : '';
      const valide = cell ? !!cell.valide : true;
      const dur   = cell ? cell.duration : '';
      const per   = cell ? (cell.period || 'Matin') : 'Matin';
      const note  = cell ? cell.note : '';
      const eEid  = `${row.id}-${CSS.escape(name)}`;
      return `<td class="suivi-intv-cell">
        <div class="suivi-intv-slot" id="suiviSlot-${eEid}">
          <span class="suivi-slot-text ${textClass}" onclick="_suiviOpenIntvEditor('${row.id}','${_suiviEsc(name)}')">${_suiviEsc(text)}</span>
          <div class="suivi-slot-controls">
            <select class="suivi-intv-select" id="suiviDur-${eEid}" onchange="_suiviOnDurChange('${eEid}',this.value)">
              ${_suiviDurOptsHtml(dur)}
            </select>
            <select class="suivi-intv-select" id="suiviPer-${eEid}" style="${_suiviDurHasPeriod(dur) ? '' : 'display:none'}">
              <option value="Matin"      ${per==='Matin'      ? 'selected' : ''}>Matin</option>
              <option value="Après-midi" ${per==='Après-midi' ? 'selected' : ''}>Après-midi</option>
            </select>
            <input class="suivi-intv-note" id="suiviNote-${eEid}" placeholder="Note (ex: ADV)" value="${_suiviEsc(note)}">
            <div class="suivi-slot-row">
              <button class="suivi-btn-valid ${valide ? 'v-yes' : 'v-no'}" id="suiviVal-${eEid}" data-valide="${valide ? '1' : '0'}"
                onclick="_suiviToggleCellValide('${row.id}','${_suiviEsc(name)}')">${valide ? 'Validé' : 'À valider'}</button>
              <button class="suivi-btn-close" onclick="_suiviSaveAndCloseIntvEditor('${row.id}','${_suiviEsc(name)}')">✓ OK</button>
            </div>
          </div>
        </div>
      </td>`;
    }).join('');

    const isPast = row.date && _suiviIsOverdue(row.date);

    return `<tr${isPast ? ' class="suivi-intv-past"' : ''}>
      <td>${dateCellHtml}</td>
      ${cellsHtml}
      <td style="width:26px;text-align:center;padding:4px 2px">
        <button class="suivi-btn-rm-row" onclick="_suiviRemoveIntvRow('${row.id}')">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function _suiviInitActionDrag(tbody) {
  if (tbody._dragReady) return;   /* déjà initialisé sur ce tbody — ne pas ajouter de doublons */
  tbody._dragReady = true;

  let draggedTr     = null;
  let placeholder   = null;
  let dragFromHandle = false;

  function cleanup() {
    document.querySelectorAll('.suivi-drag-placeholder').forEach(el => el.remove());
    document.querySelectorAll('.suivi-row-dragging').forEach(el => el.classList.remove('suivi-row-dragging'));
    tbody.querySelectorAll('tr[data-rid]').forEach(tr => tr.removeAttribute('draggable'));
    draggedTr      = null;
    placeholder    = null;
    dragFromHandle = false;
    _suiviDragRowId = null;
  }

  /* Activer draggable uniquement sur la poignée → ne plus bloquer le curseur dans la textarea */
  tbody.addEventListener('mousedown', e => {
    dragFromHandle = !!e.target.closest('.suivi-drag-handle');
    if (dragFromHandle) {
      const tr = e.target.closest('tr[data-rid]');
      if (tr) tr.setAttribute('draggable', 'true');
    }
  });
  document.addEventListener('mouseup', () => {
    if (!draggedTr) {
      /* Pas de drag en cours : retirer draggable sur tous les tr */
      tbody.querySelectorAll('tr[data-rid]').forEach(tr => tr.removeAttribute('draggable'));
      dragFromHandle = false;
    }
  });

  function movePlaceholder(overTr, clientY) {
    if (!placeholder || !overTr || overTr === draggedTr || overTr === placeholder) return;
    const rect = overTr.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      overTr.parentNode.insertBefore(placeholder, overTr);
    } else {
      overTr.parentNode.insertBefore(placeholder, overTr.nextSibling);
    }
  }

  tbody.addEventListener('dragstart', e => {
    const tr = e.target.closest('tr[data-rid]');
    if (!tr || !dragFromHandle) { e.preventDefault(); return; }

    /* Nettoyage de tout état orphelin avant de commencer */
    cleanup();

    draggedTr = tr;
    _suiviDragRowId = tr.dataset.rid;
    e.dataTransfer.effectAllowed = 'move';

    /* Image de drag explicite (clone au rendu normal) pour éviter le flash
       lié à l'opacité appliquée juste après */
    const ghost = tr.cloneNode(true);
    ghost.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${tr.offsetWidth}px`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, e.offsetX, e.offsetY);
    setTimeout(() => ghost.remove(), 0);

    /* Placeholder + opacité : immédiat, pas de rAF */
    placeholder = document.createElement('tr');
    placeholder.className = 'suivi-drag-placeholder';
    placeholder.innerHTML = `<td colspan="99" style="height:${tr.offsetHeight}px"></td>`;
    tr.classList.add('suivi-row-dragging');
    tr.parentNode.insertBefore(placeholder, tr.nextSibling);
  });

  tbody.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    movePlaceholder(e.target.closest('tr[data-rid]'), e.clientY);
  });

  tbody.addEventListener('dragend', () => {
    cleanup();
  });

  tbody.addEventListener('drop', e => {
    e.preventDefault();
    if (!draggedTr || !placeholder || !placeholder.parentNode) return;
    placeholder.parentNode.insertBefore(draggedTr, placeholder);
    const p = _suiviGetActive();
    if (p) {
      const newOrder = [...tbody.querySelectorAll('tr[data-rid]')].map(tr => tr.dataset.rid);
      p.actions.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
      _suiviSave();
    }
    cleanup();
    _suiviRenderActionsTbody();
  });
}

/* ═══════════════════════════════════════════
   Bloc-note — panneau flottant de prise de notes par client
   ═══════════════════════════════════════════ */

function _suiviBlocNoteUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function _suiviFmtBlocNoteTs(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const JOURS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${JOURS[d.getDay()]} ${dd}/${mm}/${d.getFullYear()} — ${hh}:${mi}`;
}

function _suiviOpenBlocNotePanel() {
  _suiviBlocNotePanelOpen = !_suiviBlocNotePanelOpen;
  if (!_suiviBlocNotePanelOpen) {
    _suiviCloseBlocNotePanel();
    return;
  }
  _suiviRenderBlocNotePanel();
}

function _suiviCloseBlocNotePanel() {
  _suiviBlocNotePanelOpen = false;
  const panel = document.getElementById('suiviBlocNotePanel');
  if (panel) panel.remove();
}

function _suiviBlocNoteAddEntry() {
  const p = _suiviGetActive(); if (!p) return;
  if (!p.blocNote) p.blocNote = { entries: [] };
  const entry = { id: _suiviBlocNoteUid(), createdAt: new Date().toISOString(), text: '' };
  p.blocNote.entries.push(entry);
  _suiviSave();
  _suiviRenderBlocNotePanel();
  /* Focus sur le nouveau textarea */
  setTimeout(() => {
    const ta = document.querySelector(`.suivi-bn-entry[data-eid="${entry.id}"] textarea`);
    if (ta) ta.focus();
  }, 30);
}

function _suiviBlocNoteDeleteEntry(id) {
  const p = _suiviGetActive(); if (!p || !p.blocNote) return;
  p.blocNote.entries = p.blocNote.entries.filter(e => e.id !== id);
  _suiviSave();
  _suiviRenderBlocNotePanel();
}

function _suiviBlocNoteSaveEntry(id, text) {
  const p = _suiviGetActive(); if (!p || !p.blocNote) return;
  const entry = p.blocNote.entries.find(e => e.id === id);
  if (!entry) return;
  entry.text = text;
  clearTimeout(_suiviBlocNoteSaveTimer);
  _suiviBlocNoteSaveTimer = setTimeout(() => _suiviSave(), 600);
}


function _suiviBlocNoteAiCorrectEntry(entryId, btnEl) {
  const p = _suiviGetActive(); if (!p || !p.blocNote) return;
  const entry = p.blocNote.entries.find(e => e.id === entryId); if (!entry) return;
  _aiCorrectAndShowPopup({
    text:     entry.text,
    btnEl,
    popupId:  'suiviBnAiPopup',
    cssExtra: 'z-index:10001',
    toastFn:  _suiviToast,
    onApply:  corrected => {
      entry.text = corrected;
      _suiviSave();
      _suiviRenderBlocNotePanel();
    }
  });
}


function _suiviBlocNoteOpenAi() {
  const p = _suiviGetActive(); if (!p) return;
  const entries = (p.blocNote?.entries || []).filter(e => e.text.trim());
  if (!entries.length) {
    _suiviToast('Le bloc-note est vide — ajoutez des notes avant d\'analyser', 'error');
    return;
  }
  const aggregated = entries.map(e => e.text.trim()).join('\n\n');

  _suiviCloseBlocNotePanel();
  _suiviAiShowLoader();
  _suiviOpenAiModal().then(() => {
    _suiviAiHideLoader();
    /* Pré-remplir le textarea après ouverture de la modale */
    const ta = document.getElementById('suiviAiTranscript');
    if (ta) {
      ta.value = aggregated;
      ta.dispatchEvent(new Event('input'));
    }
  });
}

function _suiviBlocNoteConfirmClear() {
  const overlay = document.createElement('div');
  overlay.id = 'suiviBnClearOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:30000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)';
  overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px 32px;max-width:380px;text-align:center;box-shadow:0 12px 40px var(--shadow)">
      <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:10px">Effacer les notes ?</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:22px">Supprimer toutes les entrées du bloc-note de ce client ?</div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button onclick="document.getElementById('suiviBnClearOverlay').remove()"
          style="padding:7px 18px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-weight:600">Non, garder</button>
        <button onclick="_suiviBlocNoteClearAll()"
          style="padding:7px 18px;border-radius:6px;border:none;background:#f85149;color:#fff;cursor:pointer;font-weight:600">Oui, effacer</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function _suiviBlocNoteClearAll() {
  document.getElementById('suiviBnClearOverlay')?.remove();
  const p = _suiviGetActive(); if (!p) return;
  if (p.blocNote) p.blocNote.entries = [];
  _suiviSave();
  if (_suiviBlocNotePanelOpen) _suiviRenderBlocNotePanel();
  _suiviUpdateBlocNoteCount();
}

function _suiviRenderBlocNotePanel() {
  const p = _suiviGetActive();
  const btn = document.getElementById('suiviBtnBlocNote');
  if (!btn) return;
  _suiviUpdateBlocNoteCount();

  let panel = document.getElementById('suiviBlocNotePanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'suiviBlocNotePanel';
    document.body.appendChild(panel);
  }

  const entries = p?.blocNote?.entries || [];

  const entriesHtml = entries.length === 0
    ? '<div class="suivi-bn-empty">Aucune note — cliquez sur "+ Note" pour commencer</div>'
    : entries.map(e => `
        <div class="suivi-bn-entry" data-eid="${e.id}">
          <div class="suivi-bn-entry-header">
            <span class="suivi-bn-entry-ts">${_suiviEsc(_suiviFmtBlocNoteTs(e.createdAt))}</span>
            <div class="suivi-bn-entry-actions">
              <button class="suivi-bn-entry-ai" onclick="event.stopPropagation();_suiviBlocNoteAiCorrectEntry('${e.id}',this)" title="Corriger avec l'IA">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              </button>
              <button class="suivi-bn-entry-del" onclick="_suiviBlocNoteDeleteEntry('${e.id}')" title="Supprimer cette note">×</button>
            </div>
          </div>
          <textarea class="suivi-bn-textarea"
            placeholder="Saisir vos notes…"
            oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px';_suiviBlocNoteSaveEntry('${e.id}',this.value)"
          >${_suiviEsc(e.text)}</textarea>
        </div>`).join('');

  panel.innerHTML = `
    <div class="suivi-bn-header">
      <span class="suivi-bn-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        Bloc-note${p ? ' — ' + _suiviEsc(p.client) : ''}
      </span>
      <div class="suivi-bn-header-actions">
        <button class="suivi-bn-btn-ai" onclick="_suiviBlocNoteOpenAi()" title="Analyser avec l'IA et créer des actions">✦ IA</button>
        <button class="suivi-bn-btn-clear" onclick="_suiviBlocNoteConfirmClear()" title="Effacer toutes les notes">Effacer</button>
        <button class="suivi-bn-close" onclick="_suiviCloseBlocNotePanel()">×</button>
      </div>
    </div>
    <div class="suivi-bn-body" id="suiviBnBody">
      ${entriesHtml}
    </div>
    <div class="suivi-bn-footer">
      <button class="suivi-bn-btn-add" onclick="_suiviBlocNoteAddEntry()">+ Note</button>
    </div>`;

  /* Positionnement : centré à l'écran */
  const panelW = Math.min(window.innerWidth * 0.7, 780);
  panel.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:${panelW}px;`;

  /* Auto-resize des textareas existants */
  requestAnimationFrame(() => {
    panel.querySelectorAll('textarea.suivi-bn-textarea').forEach(ta => {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    });
  });
}

function _suiviRender() {
  _suiviRenderSidebar();
  const activeFolder = _suiviGetLinkedClients().find(f => f.name === _suiviState.activeId);
  /* Si le client actif n'est plus lié (dossier supprimé), réinitialiser */
  if (_suiviState.activeId && !activeFolder) {
    const first = _suiviGetLinkedClients()[0];
    _suiviState.activeId = first ? first.name : null;
  }

  const p = _suiviGetActive();
  const empty = document.getElementById('suiviEmpty');
  const view  = document.getElementById('suiviProjectView');
  const title = document.getElementById('suiviTitleInput');
  const btnExportPptx  = document.getElementById('suiviBtnExportPptx');
  const btnAi          = document.getElementById('suiviBtnAi');
  const btnHistorique  = document.getElementById('suiviBtnHistorique');
  const btnBlocNote    = document.getElementById('suiviBtnBlocNote');
  const btnResume      = document.getElementById('suiviBtnResume');
  if (!empty || !view) return;

  if (!p) {
    empty.style.display = 'flex';
    view.style.display  = 'none';
    if (title) { title.value = ''; }
    if (btnExportPptx)  btnExportPptx.style.display  = 'none';
    if (btnAi)          btnAi.style.display           = 'none';
    if (btnHistorique)  btnHistorique.style.display   = 'none';
    if (btnBlocNote)    btnBlocNote.style.display     = 'none';
    if (btnResume)      btnResume.style.display       = 'none';
    return;
  }

  /* Couleur de la pastille depuis le dossier Todo */
  const color = activeFolder ? activeFolder.color : '';

  empty.style.display = 'none';
  view.style.display  = '';
  if (title) {
    title.value = p.client;
    /* Pastille de couleur dans le topbar */
    const dot = document.getElementById('suiviTitleDot');
    if (dot) dot.style.background = color;
  }
  if (btnExportPptx)  btnExportPptx.style.display  = '';
  if (btnAi)          btnAi.style.display          = '';
  if (btnHistorique)  btnHistorique.style.display  = '';
  if (btnBlocNote)    btnBlocNote.style.display    = '';
  if (btnResume)      btnResume.style.display      = '';
  _suiviRenderActionsTbody();
  _suiviUpdateBacklogCount();
  _suiviUpdateBlocNoteCount();
  _suiviRenderIntvTable();
}

/* Appelée par le routeur lors du switch vers cet onglet */
function renderSuiviView() {
  _suiviRender();
}

/* ═══════════════════════════════════════════
   IA — correction inline (bouton étoile)
   ═══════════════════════════════════════════ */

function _suiviAiShowLoader() {
  let el = document.getElementById('suiviAiLoader');
  if (!el) {
    el = document.createElement('div');
    el.id = 'suiviAiLoader';
    el.style.cssText = 'position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;pointer-events:none';
    el.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px 28px;display:flex;align-items:center;gap:14px;box-shadow:0 8px 32px var(--shadow)">
      <div class="suivi-ai-spinner"></div>
      <span style="font-size:13px;color:var(--text);font-weight:600">Gemini réfléchit…</span>
    </div>`;
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
}
function _suiviAiHideLoader() {
  const el = document.getElementById('suiviAiLoader');
  if (el) el.remove();
}

function _suiviAiCorrect(actionId, btnEl) {
  const inp = document.querySelector(`textarea.suivi-action-input[data-aid="${actionId}"]`);
  if (!inp) return;
  _aiCorrectAndShowPopup({
    text:    inp.value,
    btnEl,
    popupId: 'suiviAiInlinePopup',
    toastFn: _suiviToast,
    onApply: corrected => {
      inp.value = corrected;
      inp.style.height = 'auto';
      inp.style.height = inp.scrollHeight + 'px';
      _suiviUpdateAction(actionId, 'action', corrected);
    }
  });
}


/* Correction IA pour la textarea de commentaire dans le panel
   Même logique que _suiviAiCorrect mais cible #suiviCpInput
   et utilise un z-index supérieur au panel (9999) */
function _suiviAiCorrectComment(btnEl) {
  const inp = document.getElementById('suiviCpInput');
  if (!inp) return;
  /* z-index 10000 pour passer au-dessus du panel commentaires (9999) */
  _aiCorrectAndShowPopup({
    text:     inp.value,
    btnEl,
    popupId:  'suiviAiCommentPopup',
    cssExtra: 'z-index:10000;transform:translateY(-100%)',
    toastFn:  _suiviToast,
    onApply:  corrected => {
      const target = document.getElementById('suiviCpInput') || inp;
      target.value = corrected;
      target.style.height = 'auto';
      target.style.height = target.scrollHeight + 'px';
      target.focus();
    }
  });
}

/* ═══════════════════════════════════════════
   IA — modale transcript → actions Suivi
   ═══════════════════════════════════════════ */

let _suiviAiDraftActions = [];

async function _suiviOpenAiModal() {
  document.getElementById('suiviAiOverlay')?.remove();
  _suiviAiDraftActions = [];

  const p = _suiviGetActive();
  const clientLabel = p ? p.client : '';

  const overlay = document.createElement('div');
  overlay.id = 'suiviAiOverlay';
  overlay.className = 'suivi-ai-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div class="suivi-ai-modal" onclick="event.stopPropagation()">
      <div class="suivi-ai-modal-header">
        <div class="suivi-ai-modal-title">✦ Import IA — Actions Suivi${clientLabel ? ' · ' + _suiviEsc(clientLabel) : ''}</div>
        <button class="suivi-ai-modal-x" onclick="document.getElementById('suiviAiOverlay').remove()">&#x2715;</button>
      </div>
      <div class="suivi-ai-modal-body">
        <div>
          <label class="suivi-ai-label">Transcript de réunion</label>
          <textarea class="suivi-ai-textarea" id="suiviAiTranscript"
            placeholder="Collez votre transcript ici…"></textarea>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <button class="suivi-ai-btn" id="suiviAiAnalyzeBtn" onclick="_suiviAiAnalyze()">
            Analyser avec Gemini
          </button>
          <span class="suivi-ai-status" id="suiviAiStatus"></span>
        </div>
        <div class="suivi-ai-key-row">
          <select id="suiviAiModelSelect"
            onchange="localStorage.setItem('${typeof _AI_MODEL_LS !== 'undefined' ? _AI_MODEL_LS : 'todoGeminiModel'}',this.value)"
            style="font-size:10px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--muted)">
            <option value="">Chargement…</option>
          </select>
          &middot;
          <span class="suivi-ai-key-link" onclick="_suiviAiEditKey()">Modifier la clé API</span>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  if (typeof _aiKey === 'undefined' || !_aiKey()) {
    _suiviAiSetStatus('Clé API manquante — cliquez sur "Modifier la clé API"', true);
  }
  _suiviAiLoadModels();
  /* Retourne une Promise résolue après que le DOM est prêt (pour pré-remplissage externe) */
  return new Promise(resolve => setTimeout(resolve, 30));
}

async function _suiviAiLoadModels() {
  const sel = document.getElementById('suiviAiModelSelect');
  if (!sel || typeof _aiFetchModels === 'undefined') return;
  try {
    const models = await _aiFetchModels();
    if (!models.length) { sel.innerHTML = '<option value="">Aucun modèle</option>'; return; }
    const saved = typeof _aiModel !== 'undefined' ? _aiModel() : '';
    sel.innerHTML = models.map(m =>
      `<option value="${m.id}" ${(saved || models[0].id) === m.id ? 'selected' : ''}>${m.label}</option>`
    ).join('');
    if (!saved && typeof _AI_MODEL_LS !== 'undefined') localStorage.setItem(_AI_MODEL_LS, models[0].id);
  } catch {
    sel.innerHTML = '<option value="">Erreur chargement</option>';
  }
}

function _suiviAiSetStatus(msg, isError = false) {
  const el = document.getElementById('suiviAiStatus') || document.getElementById('suiviAiReviewStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#db4035' : 'var(--muted)';
}

async function _suiviAiAnalyze() {
  const transcript = document.getElementById('suiviAiTranscript')?.value.trim();
  if (!transcript) { _suiviAiSetStatus('Collez un transcript avant d\'analyser.', true); return; }
  const btn = document.getElementById('suiviAiAnalyzeBtn');
  if (btn) btn.disabled = true;
  _suiviAiSetStatus('Analyse en cours…');
  try {
    await _suiviAiExtractActions(transcript);
  } catch(e) {
    _suiviAiSetStatus('Erreur : ' + (e.message || 'Réponse invalide'), true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function _suiviAiExtractActions(transcript) {
  const types  = _SUIVI_TYPES.join(', ');
  const prompt = `Tu es un assistant de gestion de projet. Analyse ce transcript de réunion et extrais toutes les actions, décisions et points importants.

Pour chaque élément, extrais :
- action : texte court et clair (obligatoire)
- type : l'un de (${types}) selon la nature (action=tâche à faire, comment=commentaire, info=information, alert=alerte)
- resp : responsable parmi "4CAD", "client", "both" (both = les deux)
- echeance : date au format YYYY-MM-DD si mentionnée, sinon null

Retourne UNIQUEMENT un objet JSON valide :
{"actions":[{"action":"...","type":"action","resp":"4CAD","echeance":null}]}

Transcript :
${transcript}`;

  const raw    = await _aiCall(prompt);
  const parsed = typeof _aiParseJson !== 'undefined' ? _aiParseJson(raw) : JSON.parse(raw.replace(/```json|```/g,'').trim());

  if (!parsed.actions?.length) {
    _suiviAiSetStatus('Aucune action détectée dans ce transcript.', true);
    return;
  }

  _suiviAiDraftActions = parsed.actions.map(a => ({
    action:   a.action || '',
    type:     _SUIVI_TYPES.includes(a.type) ? a.type : 'action',
    resp:     ['4CAD','client','both'].includes(a.resp) ? a.resp : '4CAD',
    echeance: a.echeance || null,
    _included: true
  }));

  _suiviAiShowReview();
}

function _suiviAiShowReview() {
  document.getElementById('suiviAiOverlay')?.remove();
  document.getElementById('suiviAiReviewOverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'suiviAiReviewOverlay';
  overlay.className = 'suivi-ai-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div class="suivi-ai-review-modal" onclick="event.stopPropagation()">
      <div class="suivi-ai-modal-header">
        <div class="suivi-ai-modal-title">
          ${_suiviAiDraftActions.length} action(s) détectée(s)
          <span style="font-size:11px;font-weight:400;color:var(--muted);margin-left:8px">Cliquez pour modifier</span>
        </div>
        <button class="suivi-ai-modal-x" onclick="document.getElementById('suiviAiReviewOverlay').remove()">&#x2715;</button>
      </div>
      <div class="suivi-ai-review-list" id="suiviAiReviewList"></div>
      <div class="suivi-ai-review-footer">
        <button class="suivi-ai-btn" onclick="_suiviAiConfirmReview()">Créer les actions sélectionnées</button>
        <span class="suivi-ai-status" id="suiviAiReviewStatus"></span>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  _suiviAiRenderReviewCards();
}

function _suiviAiRenderReviewCards() {
  const list = document.getElementById('suiviAiReviewList');
  if (!list) return;
  list.innerHTML = _suiviAiDraftActions.map((a, i) => _suiviAiReviewCardHtml(a, i)).join('');
}

function _suiviAiReviewCardHtml(a, i) {
  const typeLabel = _SUIVI_TYPE_LABELS[a.type] || a.type;
  const respLabel = a.resp === 'both' ? '4CAD + Client' : a.resp;
  const dateLabel = a.echeance ? _suiviFmtDate(a.echeance) : 'Échéance';
  const typeCls  = 'suivi-ai-pill suivi-ai-pill-type';
  const respCls  = 'suivi-ai-pill suivi-ai-pill-resp';
  const dateCls  = a.echeance ? 'suivi-ai-pill suivi-ai-pill-date' : 'suivi-ai-pill suivi-ai-pill-empty';
  const cardCls  = a._included ? 'suivi-ai-review-card' : 'suivi-ai-review-card excluded';
  const tglCls   = a._included ? 'suivi-ai-card-toggle on' : 'suivi-ai-card-toggle';
  const tglIcon  = a._included ? '✓' : '';

  return `<div class="${cardCls}" id="suiviAiCard-${i}">
    <div class="suivi-ai-card-top">
      <button class="${tglCls}" onclick="_suiviAiDraftToggle(${i})">${tglIcon}</button>
      <input class="suivi-ai-card-title" value="${_suiviEsc(a.action)}"
        oninput="_suiviAiDraftActions[${i}].action=this.value" placeholder="Contenu…">
    </div>
    <div class="suivi-ai-card-pills">
      <span class="${typeCls}" onclick="event.stopPropagation();_suiviAiPickPill(event,'type',${i})">${_suiviEsc(typeLabel)}</span>
      <span class="${respCls}" onclick="event.stopPropagation();_suiviAiPickPill(event,'resp',${i})">${_suiviEsc(respLabel)}</span>
      <span class="${dateCls}" onclick="event.stopPropagation();_suiviAiPickDate(${i},this)">${_suiviEsc(dateLabel)}</span>
    </div>
  </div>`;
}

function _suiviAiDraftToggle(i) {
  _suiviAiDraftActions[i]._included = !_suiviAiDraftActions[i]._included;
  _suiviAiRefreshCard(i);
}

function _suiviAiRefreshCard(i) {
  const card = document.getElementById(`suiviAiCard-${i}`);
  if (!card) return;
  card.outerHTML = _suiviAiReviewCardHtml(_suiviAiDraftActions[i], i);
}

function _suiviAiPickPill(evt, field, i) {
  document.getElementById('suiviAiPillSelect')?.remove();
  const sel = document.createElement('div');
  sel.id = 'suiviAiPillSelect';
  sel.className = 'suivi-ai-pill-select';

  let opts = [];
  if (field === 'type') {
    opts = _SUIVI_TYPES.map(t => ({ value: t, label: _SUIVI_TYPE_LABELS[t] }));
  } else if (field === 'resp') {
    const p = _suiviGetActive();
    const cl = p ? p.client : 'Client';
    opts = [
      { value: '4CAD',   label: '4CAD' },
      { value: 'client', label: cl },
      { value: 'both',   label: '4CAD + ' + cl }
    ];
  }

  sel.innerHTML = opts.map(o => {
    const active = _suiviAiDraftActions[i][field] === o.value ? ' active' : '';
    return `<div class="suivi-ai-pill-opt${active}" onclick="
      event.stopPropagation();
      _suiviAiDraftActions[${i}]['${field}']='${o.value}';
      document.getElementById('suiviAiPillSelect')?.remove();
      _suiviAiRefreshCard(${i})
    ">${_suiviEsc(o.label)}</div>`;
  }).join('');

  const rect = evt.currentTarget.getBoundingClientRect();
  sel.style.cssText = `top:${rect.bottom + 4}px;left:${rect.left}px`;
  document.body.appendChild(sel);

  setTimeout(() => {
    document.addEventListener('click', function _closePill(e) {
      if (!sel.contains(e.target)) {
        sel.remove();
        document.removeEventListener('click', _closePill);
      }
    });
  }, 50);
}

function _suiviAiPickDate(i, pillEl) {
  document.getElementById('suiviAiDatePicker')?.remove();
  const inp = document.createElement('input');
  inp.type = 'date';
  inp.id = 'suiviAiDatePicker';
  inp.className = 'suivi-ai-date-input';
  if (_suiviAiDraftActions[i].echeance) inp.value = _suiviAiDraftActions[i].echeance;
  inp.onchange = () => {
    _suiviAiDraftActions[i].echeance = inp.value || null;
    inp.remove();
    _suiviAiRefreshCard(i);
  };
  const rect = pillEl.getBoundingClientRect();
  inp.style.cssText = `top:${rect.bottom + 4}px;left:${rect.left}px`;
  document.body.appendChild(inp);
  try { inp.showPicker(); } catch { inp.click(); }
}

function _suiviAiConfirmReview() {
  const p = _suiviGetActive();
  if (!p) { _suiviAiSetStatus('Aucun client actif.', true); return; }

  const toCreate = _suiviAiDraftActions.filter(a => a._included && a.action.trim());
  if (!toCreate.length) { _suiviAiSetStatus('Aucune action sélectionnée.', true); return; }

  toCreate.forEach(a => {
    const newAction = {
      id:       _suiviUid(),
      type:     a.type,
      action:   a.action.trim(),
      societe:      a.resp,
      responsables: [],
      echeance: a.echeance || '',
      statut:   'todo',
      linkedTaskId: null
    };
    if (!p.actions) p.actions = [];
    p.actions.push(newAction);
  });

  _suiviSave();
  document.getElementById('suiviAiReviewOverlay')?.remove();
  _suiviToast(`${toCreate.length} action(s) créée(s)`);
}

function _suiviAiEditKey() {
  const key = prompt('Entrez votre clé API Gemini :', typeof _aiKey !== 'undefined' ? _aiKey() : '');
  if (key === null) return;
  const LS = typeof _AI_KEY_LS !== 'undefined' ? _AI_KEY_LS : 'todoGeminiKey';
  localStorage.setItem(LS, key.trim());
  _suiviAiSetStatus('Clé enregistrée.');
}

/* ═══════════════════════════════════════════
   Picker responsables (pastilles colorées)
   ═══════════════════════════════════════════ */

let _suiviRespPickerAid = null;

function _suiviToggleActionResp(actionId, name) {
  const p = _suiviGetActive(); if (!p) return;
  const a = p.actions.find(x => x.id === actionId); if (!a) return;
  if (!a.responsables) a.responsables = [];
  const idx = a.responsables.findIndex(r => r.name === name);
  if (idx === -1) a.responsables.push({ name });
  else a.responsables.splice(idx, 1);
  p.updatedAt = new Date().toISOString();
  _suiviSave();
  /* Mise à jour de la cellule sans re-render complet */
  const cell = document.querySelector(`.suivi-resp-cell[data-aid="${actionId}"]`);
  if (cell) cell.innerHTML = _suiviRespPillsHtml(a.responsables);
}

function _suiviOpenRespPicker(actionId, cellEl) {
  const existing = document.getElementById('suiviRespPickerPopup');
  if (existing) {
    existing.remove();
    if (_suiviRespPickerAid === actionId) { _suiviRespPickerAid = null; return; }
  }
  _suiviRespPickerAid = actionId;

  const popup = document.createElement('div');
  popup.id = 'suiviRespPickerPopup';
  popup.className = 'suivi-resp-picker';
  const rect = cellEl.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - 230);
  popup.style.cssText = `top:${rect.bottom + 4}px;left:${Math.max(4, left)}px`;
  popup.innerHTML = `
    <input class="suivi-resp-picker-search" id="suiviRespPickerSearch" placeholder="Rechercher…" autocomplete="off">
    <div class="suivi-resp-picker-list" id="suiviRespPickerList"></div>`;

  document.body.appendChild(popup);
  _suiviRenderRespPickerList('');

  const searchEl = document.getElementById('suiviRespPickerSearch');
  searchEl.addEventListener('input', () => _suiviRenderRespPickerList(searchEl.value));
  searchEl.focus();

  setTimeout(() => {
    document.addEventListener('click', function _closeRespPicker(e) {
      const pop = document.getElementById('suiviRespPickerPopup');
      if (!pop) { document.removeEventListener('click', _closeRespPicker); return; }
      if (!pop.contains(e.target) && !e.target.closest('.suivi-resp-cell')) {
        pop.remove();
        _suiviRespPickerAid = null;
        document.removeEventListener('click', _closeRespPicker);
      }
    });
  }, 50);
}

function _suiviRenderRespPickerList(filter) {
  const list = document.getElementById('suiviRespPickerList');
  if (!list || !_suiviRespPickerAid) return;
  const p = _suiviGetActive(); if (!p) return;
  const a = p.actions.find(x => x.id === _suiviRespPickerAid); if (!a) return;
  const selected = new Set((a.responsables || []).map(r => r.name));
  const allRes = _suiviGetAllResources();
  const filtered = (filter ? allRes.filter(n => n.toLowerCase().includes(filter.toLowerCase())) : allRes)
    .sort((a, b) => {
      const ac = selected.has(a), bc = selected.has(b);
      return ac === bc ? 0 : ac ? -1 : 1;
    });

  list.innerHTML = '';
  filtered.forEach(name => {
    const isChecked = selected.has(name);
    const item = document.createElement('div');
    item.className = 'suivi-resp-picker-item' + (isChecked ? ' checked' : '');
    const ini = _suiviInitials(name);
    const col = _suiviRespPillColor(name);
    item.innerHTML = `
      <span class="suivi-resp-pill sm" style="background:${col}">${ini}</span>
      <span class="suivi-resp-picker-name">${_suiviEsc(name)}</span>
      ${isChecked ? '<span class="suivi-resp-check">✓</span>' : ''}`;
    item.addEventListener('click', e => {
      e.stopPropagation();
      _suiviToggleActionResp(_suiviRespPickerAid, name);
      const searchEl = document.getElementById('suiviRespPickerSearch');
      _suiviRenderRespPickerList(searchEl ? searchEl.value : '');
    });
    list.appendChild(item);
  });

  /* Bouton "Ajouter" si le filtre ne correspond à aucune ressource exacte */
  const trimmed = (filter || '').trim();
  const exactMatch = trimmed && allRes.some(n => n.toLowerCase() === trimmed.toLowerCase());
  if (trimmed && !exactMatch) {
    const ini = _suiviInitials(trimmed);
    const col = _suiviRespPillColor(trimmed);
    const addEl = document.createElement('div');
    addEl.className = 'suivi-resp-picker-item suivi-resp-picker-add-row';
    addEl.innerHTML = `
      <span class="suivi-resp-pill sm" style="background:${col}">${ini}</span>
      <span class="suivi-resp-picker-name">Ajouter « ${_suiviEsc(trimmed)} »</span>
      <span class="suivi-resp-add-icon">＋</span>`;
    addEl.addEventListener('click', e => {
      e.stopPropagation();
      _suiviToggleActionResp(_suiviRespPickerAid, trimmed);
      const searchEl = document.getElementById('suiviRespPickerSearch');
      if (searchEl) searchEl.value = '';
      _suiviRenderRespPickerList('');
    });
    list.appendChild(addEl);
  } else if (!filtered.length) {
    list.innerHTML = '<div class="suivi-resp-picker-empty">Aucune ressource trouvée</div>';
  }
}

/* ═══════════════════════════════════════════
   Résumé IA — compte rendu email
   ═══════════════════════════════════════════ */

function _suiviCloseResumePanel() {
  document.getElementById('suiviResumePanel')?.remove();
}

function _suiviRenderResumePanel(text) {
  document.getElementById('suiviResumePanel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'suiviResumePanel';

  /* Nettoyage et formatage du texte Gemini */
  const formatted = _suiviEsc(text)
    /* Supprimer le gras markdown **texte** → texte */
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    /* Supprimer l'italique markdown *texte* → texte */
    .replace(/\*([^*]+)\*/g, '$1')
    /* ## Titre → section colorée */
    .replace(/^## (.+)$/gm, '<span class="suivi-resume-section">$1</span>')
    /* --- → séparateur */
    .replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:10px 0">')
    /* Lignes de commentaires indentées "  - " → indentation visuelle */
    .replace(/^  - /gm, '<span style="margin-left:18px;display:inline-block">↳ </span>')
    /* Numéro d'action [XXXX] → badge monospace orange */
    .replace(/\[(\d{4})\]/g, '<span style="font-family:\'Courier New\',monospace;font-weight:700;color:var(--accent);font-size:11px">[$1]</span>');

  panel.innerHTML = `
    <div class="suivi-resume-header">
      <span class="suivi-resume-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Compte rendu généré par IA
      </span>
      <button class="suivi-resume-btn-close" onclick="_suiviCloseResumePanel()">×</button>
    </div>
    <div class="suivi-resume-body">
      <div class="suivi-resume-text">${formatted}</div>
    </div>
    <div class="suivi-resume-footer">
      <button class="suivi-resume-btn-close" onclick="_suiviCloseResumePanel()">Fermer</button>
      <button class="suivi-resume-btn-copy" id="suiviResumeCopyBtn" onclick="_suiviResumeCopy()">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copier
      </button>
    </div>`;

  /* Stocke le texte brut pour la copie */
  panel._rawText = text;
  document.body.appendChild(panel);
}

function _suiviResumeCopy() {
  const panel = document.getElementById('suiviResumePanel');
  const raw   = panel?._rawText || '';
  if (!raw) return;

  /* ── Texte brut nettoyé pour Outlook ── */
  const plainLines = raw.split('\n').map(line => {
    // ## Titre → ligne en majuscules encadrée
    line = line.replace(/^##\s+(.+)$/, (_, t) => '\r\n' + t.toUpperCase() + '\r\n' + '-'.repeat(t.length));
    // Supprimer gras **texte**
    line = line.replace(/\*\*([^*]+)\*\*/g, '$1');
    // Supprimer italique *texte*
    line = line.replace(/\*([^*]+)\*/g, '$1');
    // Séparateurs ---
    line = line.replace(/^---+$/, '─'.repeat(40));
    return line;
  });
  // Jointure avec \r\n pour Windows/Outlook
  const plain = plainLines.join('\r\n');

  /* ── Version HTML pour collage enrichi dans Outlook ── */
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const htmlLines = raw.split('\n').map(line => {
    // ## Titre → <h3>
    const hm = line.match(/^##\s+(.+)$/);
    if (hm) return `<h3 style="margin:16px 0 4px;font-size:13px;border-bottom:1px solid #ccc;padding-bottom:4px;font-family:Arial,sans-serif">${esc(hm[1])}</h3>`;
    // Séparateur ---
    if (/^---+$/.test(line.trim())) return '<hr style="border:none;border-top:1px solid #ccc;margin:8px 0">';
    // Ligne indentée commentaire "  - "
    const cm = line.match(/^  - (.+)$/);
    if (cm) {
      let content = esc(cm[1]).replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/\[(\d{4})\]/g,'<b>[$1]</b>');
      return `<p style="margin:2px 0 2px 18px;font-family:Arial,sans-serif;font-size:12px;color:#444">↳ ${content}</p>`;
    }
    // Ligne à puce "- "
    const bm = line.match(/^(- )(.+)$/);
    if (bm) {
      let content = esc(bm[2]).replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/\[(\d{4})\]/g,'<b>[$1]</b>');
      return `<p style="margin:3px 0;font-family:Arial,sans-serif;font-size:12px">&#8226; ${content}</p>`;
    }
    // Ligne vide
    if (!line.trim()) return '<br>';
    // Ligne normale
    let content = esc(line).replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/\[(\d{4})\]/g,'<b>[$1]</b>');
    return `<p style="margin:3px 0;font-family:Arial,sans-serif;font-size:12px">${content}</p>`;
  });
  const html = `<html><body>${htmlLines.join('')}</body></html>`;

  const _onSuccess = () => {
    const btn = document.getElementById('suiviResumeCopyBtn');
    if (btn) {
      btn.textContent = '✓ Copié !';
      setTimeout(() => { btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copier'; }, 2000);
    }
  };

  /* Tentative avec ClipboardItem (HTML + texte) pour Outlook */
  if (window.ClipboardItem) {
    const item = new ClipboardItem({
      'text/html' : new Blob([html],  { type: 'text/html'  }),
      'text/plain': new Blob([plain], { type: 'text/plain' })
    });
    navigator.clipboard.write([item]).then(_onSuccess).catch(() => {
      /* Fallback : texte seul */
      navigator.clipboard.writeText(plain).then(_onSuccess)
        .catch(() => _suiviToast('Impossible de copier — utilisez Ctrl+A / Ctrl+C', 'error'));
    });
  } else {
    navigator.clipboard.writeText(plain).then(_onSuccess)
      .catch(() => _suiviToast('Impossible de copier — utilisez Ctrl+A / Ctrl+C', 'error'));
  }
}

function _suiviBuildResumeData(p) {
  const today    = new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
  const clientName = p.client || 'Client';
  const lines    = [];

  const actions = (p.actions || []).filter(a => a.statut !== 'backlog');
  actions.forEach(a => {
    const typeLabel   = (_SUIVI_TYPE_LABELS[a.type || 'action'] || a.type || 'action').toUpperCase();
    const statutLabel = a.type === 'action' ? (_SUIVI_STATUT_LABELS[a.statut] || a.statut) : null;
    const resp        = (a.responsables || []).map(r => _suiviInitials(r.name)).join(', ');
    const societeRaw  = a.societe || (a.type === 'action' ? '4CAD' : '');
    const societe     = societeRaw === '4CAD' ? '4CAD'
                      : societeRaw === 'both'  ? '4CAD + ' + clientName
                      : societeRaw === 'client' ? clientName
                      : societeRaw;
    const echeance    = _suiviFmtDate(a.echeance) || '';
    const overdue     = a.type === 'action' && a.statut !== 'done' && _suiviIsOverdue(a.echeance);

    let line = `[${a.numero || '????'}] [${typeLabel}] ${a.action || '(sans contenu)'}`;
    if (resp)     line += ` — Responsable : ${resp}`;
    if (societe)  line += ` — Société : ${societe}`;
    if (echeance) line += ` — Échéance : ${echeance}${overdue ? ' ⚠ EN RETARD' : ''}`;
    if (statutLabel) line += ` — Statut : ${statutLabel}`;
    lines.push(line);

    const comments = _suiviGetActionComments(a);
    comments.forEach(c => {
      const dateStr = c.createdAt
        ? new Date(c.createdAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' })
        : '';
      lines.push(`  → Commentaire${dateStr ? ' (' + dateStr + ')' : ''} : ${c.text || ''}`);
    });
  });

  return { today, clientName, donnees: lines.join('\n') };
}

async function _suiviGenerateResume() {
  const p = _suiviGetActive();
  if (!p) return;
  if (!_aiKey || !_aiKey()) {
    _suiviToast('Clé API Gemini manquante — configurez-la dans Paramètres > IA', 'error');
    return;
  }

  const btn = document.getElementById('suiviBtnResume');
  if (btn) btn.disabled = true;
  _suiviAiShowLoader();

  try {
    /* Charger le prompt depuis le fichier */
    let promptTemplate = '';
    try {
      const resp = await fetch('prompts/suivi-resume.txt?_=' + Date.now());
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      promptTemplate = await resp.text();
    } catch (e) {
      _suiviAiHideLoader();
      if (btn) btn.disabled = false;
      _suiviToast('Impossible de charger prompts/suivi-resume.txt : ' + e.message, 'error');
      return;
    }

    /* Construire les données */
    const { today, clientName, donnees } = _suiviBuildResumeData(p);

    /* Injection des variables dans le prompt */
    const prompt = promptTemplate
      .replace(/\{\{CLIENT\}\}/g, clientName)
      .replace(/\{\{DATE\}\}/g,   today)
      .replace(/\{\{DONNEES\}\}/g, donnees);

    /* Appel Gemini */
    const result = await _aiCall(prompt);
    _suiviAiHideLoader();
    if (btn) btn.disabled = false;

    if (!result?.trim()) {
      _suiviToast('Gemini n\'a retourné aucun résultat', 'error');
      return;
    }

    _suiviRenderResumePanel(result.trim());

  } catch (err) {
    _suiviAiHideLoader();
    if (btn) btn.disabled = false;
    _suiviToast('Erreur lors de la génération : ' + (err.message || err), 'error');
  }
}
