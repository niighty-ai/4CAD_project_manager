/* ════════════════════════════════════════════════════════════════════
   notifications.js — Cloche temps réel, dropdown, toast assignation
   ════════════════════════════════════════════════════════════════════ */

const NOTIF_MAX_READ = 5; /* historique max de notifications lues */

let _notifData     = [];     /* toutes les notifications de l'utilisateur */
let _notifUserKey  = null;   /* email encodé (clé Firebase) */
let _notifInitDone = false;  /* premier chargement déjà traité */
let _notifKnownIds = new Set(); /* IDs déjà connus (pour détecter les vrais nouveaux) */
let _notifDropOpen = false;

let _notifPrefs = {
  status_change:   true,
  type_change:     true,
  priority_change: true,
  date_change:     true,
  completed:       true,
  comment:         true,
  assigned:        true
};

/* ── Initialisation (appelée depuis app.js après auth) ─────────────────────── */
function _notifInit(userEmail) {
  if (!userEmail) return;
  _notifUserKey  = _notifEncodeKey(userEmail);
  _notifInitDone = false;
  _notifKnownIds = new Set();
  _notifData     = [];

  /* Charger les préférences de l'utilisateur */
  if (typeof window._fbGetNotifPrefs === 'function') {
    window._fbGetNotifPrefs(_notifUserKey, prefs => {
      if (prefs) _notifPrefs = Object.assign({}, _notifPrefs, prefs);
    });
  }

  /* Écoute temps réel des notifications */
  if (typeof window._fbOnNotifs === 'function') {
    window._fbOnNotifs(_notifUserKey, notifs => {
      const newOnes = notifs.filter(n => n && n.id && !_notifKnownIds.has(n.id));
      notifs.forEach(n => { if (n && n.id) _notifKnownIds.add(n.id); });

      _notifData = notifs
        .filter(n => n && n.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      if (!_notifInitDone) {
        /* Premier chargement : déclencher le nettoyage quotidien */
        _notifInitDone = true;
        _notifDailyCleanup();
      } else {
        /* Notifications réellement nouvelles → toast si assignation */
        newOnes
          .filter(n => !n.read && n.type === 'assigned')
          .forEach(n => _notifShowAssignToast(n));
      }

      _notifUpdateBadge();
      if (_notifDropOpen) _notifRenderDrop();
    });
  }

  /* Fermer le dropdown au clic extérieur */
  document.addEventListener('click', e => {
    if (!_notifDropOpen) return;
    const btn  = document.getElementById('notifBtn');
    const drop = document.getElementById('notifDrop');
    if (btn  && btn.contains(e.target))  return;
    if (drop && drop.contains(e.target)) return;
    _notifCloseDrop();
  });
}

/* ── Nettoyage quotidien — supprime les notifications lues d'un jour antérieur ─ */
function _notifDailyCleanup() {
  const todayStr = new Date().toDateString();
  const lsKey    = 'notif_cleanup_' + _notifUserKey;
  if (localStorage.getItem(lsKey) === todayStr) return; /* déjà fait aujourd'hui */

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  _notifData
    .filter(n => n.read && n.readAt && new Date(n.readAt) < todayStart)
    .forEach(n => {
      if (typeof window._fbDeleteNotif === 'function') {
        window._fbDeleteNotif(_notifUserKey, n.id).catch(() => {});
      }
    });

  localStorage.setItem(lsKey, todayStr);
}

/* ── Envoi d'une notification aux collaborateurs d'une tâche ────────────────── */
function _notifSendChange(task, changeType, extra, targetEmail) {
  if (!task) return;

  const actor    = (typeof currentUserEmail !== 'undefined' && currentUserEmail) || '';
  let recipients = [];

  if (targetEmail) {
    /* Cas assignation : un seul destinataire explicite */
    if (targetEmail !== actor) recipients = [targetEmail];
  } else {
    /* Tous les collaborateurs sauf l'acteur */
    const everyone = new Set(
      [task.createdBy, ...(task.sharedWith || [])].filter(Boolean)
    );
    everyone.delete(actor);
    recipients = [...everyone];
  }

  if (recipients.length === 0) return;

  const actorName = _notifShortName(actor);
  const title     = task.title || '(sans titre)';
  let   message   = '';

  switch (changeType) {
    case 'status_change':
      message = `${actorName} a changé le statut en "${extra}"`; break;
    case 'type_change':
      message = `${actorName} a changé le type en "${extra}"`; break;
    case 'priority_change':
      message = `${actorName} a changé la priorité en ${extra}`; break;
    case 'date_change':
      message = `${actorName} a modifié la date d'échéance`; break;
    case 'completed':
      message = extra
        ? `${actorName} a terminé la tâche`
        : `${actorName} a réouvert la tâche`; break;
    case 'comment':
      message = `${actorName} a ajouté un commentaire`; break;
    case 'assigned':
      message = `${actorName} vous a assigné la tâche "${title}"`; break;
    default:
      message = `${actorName} a modifié la tâche`; break;
  }

  recipients.forEach(email => {
    const userKey = _notifEncodeKey(email);
    const notif   = {
      id:         'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      taskId:     task.id,
      taskTitle:  title,
      type:       changeType,
      message,
      actorEmail: actor,
      read:       false,
      createdAt:  new Date().toISOString(),
      readAt:     null
    };
    if (typeof window._fbWriteNotif === 'function') {
      window._fbWriteNotif(userKey, notif).catch(e => console.warn('[notif] write error', e));
    }
  });
}

/* ── Badge (nombre de non lues filtrées par prefs) ──────────────────────────── */
function _notifUpdateBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  const n = _notifFiltered().filter(x => !x.read).length;
  badge.textContent   = n > 99 ? '99+' : String(n);
  badge.style.display = n > 0 ? 'flex' : 'none';
}

/* Filtre par préférences de l'utilisateur */
function _notifFiltered() {
  return _notifData.filter(n => _notifPrefs[n.type] !== false);
}

/* ── Toggle dropdown (position calculée via getBoundingClientRect) ───────────── */
function _notifToggleDrop() {
  _notifDropOpen = !_notifDropOpen;
  const drop = document.getElementById('notifDrop');
  const btn  = document.getElementById('notifBtn');
  if (!drop) return;
  if (_notifDropOpen) {
    _notifRenderDrop();
    drop.style.display = 'block';
    /* Positionner après affichage pour avoir la largeur réelle */
    if (btn) {
      const rect       = btn.getBoundingClientRect();
      const dropWidth  = drop.offsetWidth || 340;
      drop.style.top   = (rect.bottom + 6) + 'px';
      drop.style.left  = Math.max(8, rect.right - dropWidth) + 'px';
    }
  } else {
    drop.style.display = 'none';
  }
}

function _notifCloseDrop() {
  _notifDropOpen = false;
  const drop = document.getElementById('notifDrop');
  if (drop) drop.style.display = 'none';
}

/* ── Rendu du dropdown ──────────────────────────────────────────────────────── */
function _notifRenderDrop() {
  const drop = document.getElementById('notifDrop');
  if (!drop) return;

  const filtered = _notifFiltered();
  const unread   = filtered.filter(n => !n.read);
  const read     = filtered.filter(n =>  n.read).slice(0, NOTIF_MAX_READ);

  if (unread.length === 0 && read.length === 0) {
    drop.innerHTML = '<div class="notif-empty">Aucune notification</div>';
    return;
  }

  let html = '<div class="notif-header-bar"><span>Notifications</span>';
  if (unread.length > 0) {
    html += `<button class="notif-mark-all-btn" onclick="_notifMarkAllRead()">Tout marquer lu</button>`;
  }
  html += '</div>';

  if (unread.length > 0) {
    html += '<div class="notif-sep-label">Non lues</div>';
    unread.forEach(n => { html += _notifItemHTML(n); });
  }
  if (read.length > 0) {
    html += '<div class="notif-sep-label notif-sep-label--muted">Historique</div>';
    read.forEach(n => { html += _notifItemHTML(n); });
  }

  drop.innerHTML = html;
}

function _notifItemHTML(n) {
  const cls  = n.read ? ' notif-item--read' : '';
  const time = _notifTimeAgo(n.createdAt);
  const safeId    = _notifEsc(n.id);
  const safeTask  = _notifEsc(n.taskId);
  return `<div class="notif-item${cls}" onclick="_notifClick('${safeId}','${safeTask}')">
    <div class="notif-icon-col">${_notifTypeIcon(n.type)}</div>
    <div class="notif-body">
      <div class="notif-task-name">${_notifEsc(n.taskTitle)}</div>
      <div class="notif-msg">${_notifEsc(n.message)}</div>
      <div class="notif-time">${time}</div>
    </div>
    ${!n.read ? '<div class="notif-dot"></div>' : ''}
  </div>`;
}

/* ── Clic sur une notification ──────────────────────────────────────────────── */
function _notifClick(notifId, taskId) {
  /* Marquer comme lu */
  const notif = _notifData.find(n => n.id === notifId);
  if (notif && !notif.read && _notifUserKey && typeof window._fbMarkNotifRead === 'function') {
    window._fbMarkNotifRead(_notifUserKey, notifId).catch(() => {});
  }
  _notifCloseDrop();
  /* Naviguer vers la tâche */
  if (taskId) {
    const alreadyOnTodo = location.hash === '#todo';
    if (!alreadyOnTodo) location.hash = '#todo';
    setTimeout(() => {
      if (typeof _todoOpenModal === 'function') _todoOpenModal(taskId);
    }, alreadyOnTodo ? 50 : 350);
  }
}

/* ── Marquer toutes les notifications comme lues ────────────────────────────── */
function _notifMarkAllRead() {
  if (!_notifUserKey || typeof window._fbMarkNotifRead !== 'function') return;
  _notifData
    .filter(n => !n.read)
    .forEach(n => window._fbMarkNotifRead(_notifUserKey, n.id).catch(() => {}));
}

/* ── Toast d'assignation ────────────────────────────────────────────────────── */
function _notifShowAssignToast(notif) {
  document.querySelectorAll('.notif-assign-toast').forEach(el => el.remove());

  const el = document.createElement('div');
  el.className = 'notif-assign-toast';
  el.innerHTML = `
    <div class="nat-bell">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    </div>
    <div class="nat-body">
      <div class="nat-title">Nouvelle tâche assignée</div>
      <div class="nat-task">${_notifEsc(notif.taskTitle)}</div>
      <div class="nat-from">${_notifEsc(notif.message)}</div>
    </div>
    <button class="nat-close"
      onclick="event.stopPropagation();this.closest('.notif-assign-toast').remove()">✕</button>
  `;
  el.addEventListener('click', e => {
    if (e.target.closest('.nat-close')) return;
    _notifClick(notif.id, notif.taskId);
    el.remove();
  });
  document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, 7000);
}

/* ── Panneau de préférences (rendu dans un modal) ───────────────────────────── */
function _notifOpenPrefs() {
  _notifCloseDrop();
  const labels = {
    status_change:   'Changement de statut',
    type_change:     'Changement de type',
    priority_change: 'Changement de priorité',
    date_change:     'Changement de date d\'échéance',
    completed:       'Tâche terminée / réouverte',
    comment:         'Nouveau commentaire',
    assigned:        'Assignation d\'une tâche'
  };

  let rows = '';
  Object.entries(labels).forEach(([key, label]) => {
    const checked = _notifPrefs[key] !== false ? 'checked' : '';
    rows += `<label class="notif-pref-row">
      <input type="checkbox" ${checked} onchange="_notifTogglePref('${key}',this.checked)">
      <span>${label}</span>
    </label>`;
  });

  /* Réutiliser le pattern de modal existant dans l'app */
  const existing = document.getElementById('notifPrefsModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id        = 'notifPrefsModal';
  modal.className = 'notif-prefs-modal-overlay';
  modal.innerHTML = `
    <div class="notif-prefs-modal">
      <div class="notif-prefs-header">
        <span>Préférences de notification</span>
        <button onclick="document.getElementById('notifPrefsModal').remove()">✕</button>
      </div>
      <div class="notif-prefs-body">${rows}</div>
      <div class="notif-prefs-footer">
        <button class="notif-prefs-save-btn"
          onclick="_notifSavePrefs();document.getElementById('notifPrefsModal').remove()">
          Enregistrer
        </button>
      </div>
    </div>
  `;
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
}

function _notifTogglePref(key, val) {
  _notifPrefs[key] = val;
}

function _notifSavePrefs() {
  if (!_notifUserKey || typeof window._fbSetNotifPrefs !== 'function') return;
  window._fbSetNotifPrefs(_notifUserKey, _notifPrefs).catch(() => {});
  _notifUpdateBadge();
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */
function _notifEncodeKey(email) {
  return (email || '').replace(/\./g, ',').replace(/@/g, '-');
}

function _notifShortName(email) {
  if (!email) return '';
  return email.split('@')[0].replace(/[._]/g, ' ')
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function _notifTimeAgo(iso) {
  if (!iso) return '';
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return 'à l\'instant';
  if (mins  < 60) return `il y a ${mins} min`;
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${days} j`;
}

function _notifTypeIcon(type) {
  const icons = {
    status_change:   '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    type_change:     '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    priority_change: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    date_change:     '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    completed:       '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    comment:         '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    assigned:        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
  };
  return `<span class="notif-type-icon notif-icon-${type}">${icons[type] || '🔔'}</span>`;
}

function _notifEsc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
