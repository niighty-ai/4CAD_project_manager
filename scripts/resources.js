/* ═══════════════════════════════════════════
   resources.js — Gestion des ressources
   CRUD + Calendrier mensuel
   ═══════════════════════════════════════════ */

/* ── État global ressources ── */
const RESOURCES_KEY = 'gantt4cad_resources';
let resources = [];          // [{ id, nom, prenom, profession }]
let resCalendarDate = null;  // Date de référence du calendrier (1er du mois affiché)
let resLabelW = 260;         // Largeur du panneau gauche ressources
let editingResourceId = null;

/* ── Persistance ── */
function saveResources() {
  try { localStorage.setItem(RESOURCES_KEY, JSON.stringify(resources)); } catch(e) {}
  // Firebase : on réutilise le même mécanisme si disponible
  if (typeof scheduleFirebaseSaveResources === 'function') scheduleFirebaseSaveResources();
}

function loadResources() {
  try {
    const raw = localStorage.getItem(RESOURCES_KEY);
    if (raw) resources = JSON.parse(raw);
  } catch(e) { resources = []; }
}

/* ── ID unique ── */
function genResId() {
  return 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

/* ── CRUD ressources ── */
function addResource(nom, prenom, profession) {
  nom = (nom || '').trim();
  prenom = (prenom || '').trim();
  profession = (profession || '').trim();
  if (!nom && !prenom) return false;
  resources.push({ id: genResId(), nom, prenom, profession });
  saveResources();
  return true;
}

function updateResource(id, nom, prenom, profession) {
  const r = resources.find(r => r.id === id);
  if (!r) return false;
  r.nom = (nom || '').trim();
  r.prenom = (prenom || '').trim();
  r.profession = (profession || '').trim();
  saveResources();
  return true;
}

function deleteResource(id) {
  resources = resources.filter(r => r.id !== id);
  saveResources();
  if (editingResourceId === id) cancelResourceEdit();
  renderResourcesView();
}

/* ── Calcul charges depuis le portfolio ── */
/**
 * Retourne la charge totale affectée à une ressource pour un jour donné.
 * Pour l'instant : placeholder — sera connecté à l'affectation réelle
 * quand la fonctionnalité sera ajoutée.
 * @param {string} resourceId
 * @param {Date} date
 * @returns {number} charge en jours
 */
function getChargeForResourceDay(resourceId, date) {
  // TODO : connecter avec les affectations tâches→ressources
  return 0;
}

/* ── Rendu principal de la vue ressources ── */
function renderResourcesView() {
  const container = document.getElementById('viewRessources');
  if (!container) return;

  if (!resCalendarDate) {
    const now = new Date();
    resCalendarDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  container.innerHTML = `
    <div class="res-shell">
      <!-- Panneau gauche : liste + formulaire -->
      <div class="res-left" id="resLeft" style="width:${resLabelW}px">
        <div class="res-left-header">
          <span class="res-lh-title">👤 RESSOURCES</span>
          <button class="res-add-btn" onclick="openResourceForm()" title="Nouvelle ressource">+</button>
        </div>

        <!-- Formulaire création / édition -->
        <div class="res-form" id="resForm" style="display:none">
          <div class="res-form-title" id="resFormTitle">Nouvelle ressource</div>
          <div class="res-form-group">
            <label class="res-form-label">Nom</label>
            <input class="res-form-input" id="resInputNom" type="text" placeholder="Nom de famille">
          </div>
          <div class="res-form-group">
            <label class="res-form-label">Prénom</label>
            <input class="res-form-input" id="resInputPrenom" type="text" placeholder="Prénom">
          </div>
          <div class="res-form-group">
            <label class="res-form-label">Profession</label>
            <input class="res-form-input" id="resInputProfession" type="text" placeholder="Ex: Développeur, Chef de projet…">
          </div>
          <div class="res-form-actions">
            <button class="res-btn-cancel" onclick="cancelResourceEdit()">Annuler</button>
            <button class="res-btn-save" onclick="submitResourceForm()">✓ Enregistrer</button>
          </div>
        </div>

        <!-- Liste des ressources -->
        <div class="res-list" id="resList">
          ${renderResourceList()}
        </div>

        <div class="res-resize-handle" id="resResizeHandle"></div>
      </div>

      <!-- Panneau droit : calendrier mensuel -->
      <div class="res-right" id="resRight">
        ${renderResourceCalendar()}
      </div>
    </div>
  `;

  initResResize();
  attachResFormEnter();
}

/* ── Rendu liste des ressources ── */
function renderResourceList() {
  if (!resources.length) {
    return `<div class="res-empty">
      <div class="res-empty-icon">👤</div>
      <div>Aucune ressource.<br>Cliquez sur <strong>+</strong> pour en créer une.</div>
    </div>`;
  }
  return resources.map(r => {
    const fullName = [r.prenom, r.nom].filter(Boolean).join(' ') || '—';
    const isEditing = editingResourceId === r.id;
    return `<div class="res-item${isEditing ? ' editing' : ''}" id="resItem_${r.id}">
      <div class="res-item-avatar">${getInitials(r.prenom, r.nom)}</div>
      <div class="res-item-info">
        <div class="res-item-name">${escH(fullName)}</div>
        ${r.profession ? `<div class="res-item-prof">${escH(r.profession)}</div>` : ''}
      </div>
      <div class="res-item-actions">
        <button class="res-action-btn" onclick="openResourceEdit('${r.id}')" title="Modifier">✎</button>
        <button class="res-action-btn danger" onclick="confirmDeleteResource('${r.id}')" title="Supprimer">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function getInitials(prenom, nom) {
  const p = (prenom || '').trim()[0] || '';
  const n = (nom || '').trim()[0] || '';
  return (p + n).toUpperCase() || '?';
}

/* ── Formulaire ressource ── */
function openResourceForm() {
  editingResourceId = null;
  document.getElementById('resFormTitle').textContent = 'Nouvelle ressource';
  document.getElementById('resInputNom').value = '';
  document.getElementById('resInputPrenom').value = '';
  document.getElementById('resInputProfession').value = '';
  document.getElementById('resForm').style.display = '';
  document.getElementById('resInputPrenom').focus();
}

function openResourceEdit(id) {
  const r = resources.find(r => r.id === id);
  if (!r) return;
  editingResourceId = id;
  document.getElementById('resFormTitle').textContent = 'Modifier la ressource';
  document.getElementById('resInputNom').value = r.nom || '';
  document.getElementById('resInputPrenom').value = r.prenom || '';
  document.getElementById('resInputProfession').value = r.profession || '';
  document.getElementById('resForm').style.display = '';
  document.getElementById('resInputPrenom').focus();
  // Highlight item
  document.querySelectorAll('.res-item').forEach(el => el.classList.remove('editing'));
  const item = document.getElementById('resItem_' + id);
  if (item) item.classList.add('editing');
}

function cancelResourceEdit() {
  editingResourceId = null;
  const form = document.getElementById('resForm');
  if (form) form.style.display = 'none';
  document.querySelectorAll('.res-item').forEach(el => el.classList.remove('editing'));
}

function submitResourceForm() {
  const nom        = (document.getElementById('resInputNom')?.value || '').trim();
  const prenom     = (document.getElementById('resInputPrenom')?.value || '').trim();
  const profession = (document.getElementById('resInputProfession')?.value || '').trim();

  if (!nom && !prenom) {
    document.getElementById('resInputNom').focus();
    return;
  }

  if (editingResourceId) {
    updateResource(editingResourceId, nom, prenom, profession);
  } else {
    addResource(nom, prenom, profession);
  }

  editingResourceId = null;
  renderResourcesView();
}

function confirmDeleteResource(id) {
  const r = resources.find(r => r.id === id);
  if (!r) return;
  const fullName = [r.prenom, r.nom].filter(Boolean).join(' ') || 'cette ressource';
  if (confirm(`Supprimer "${fullName}" ?`)) {
    deleteResource(id);
  }
}

function attachResFormEnter() {
  const inputs = document.querySelectorAll('#resInputNom, #resInputPrenom, #resInputProfession');
  inputs.forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitResourceForm();
      if (e.key === 'Escape') cancelResourceEdit();
    });
  });
}

/* ── Calendrier mensuel ── */
function renderResourceCalendar() {
  const d = resCalendarDate || new Date();
  const year  = d.getFullYear();
  const month = d.getMonth();

  const monthLabel = new Date(year, month, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  // Jours du mois
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);

  // Colonnes : une par jour
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }

  const COL_W = 34; // px par jour
  const totalW = days.length * COL_W;

  // ── Header : mois + navigation ──
  let html = `<div class="res-cal-wrap">
    <div class="res-cal-topbar">
      <button class="res-cal-nav" onclick="resCalPrev()">‹</button>
      <span class="res-cal-month">${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</span>
      <button class="res-cal-nav" onclick="resCalNext()">›</button>
      <button class="res-cal-today" onclick="resCalToday()">Aujourd'hui</button>
    </div>
    <div class="res-cal-scroll">
      <div class="res-cal-inner" style="min-width:${totalW}px">`;

  // ── Ligne d'en-tête jours ──
  html += `<div class="res-cal-header" style="width:${totalW}px">`;
  days.forEach(day => {
    const isToday    = day.getTime() === today.getTime();
    const isWE       = day.getDay() === 0 || day.getDay() === 6;
    const isFerie    = isJourFerie(day);
    const dayLabel   = day.getDate();
    const dayLetters = ['D','L','M','M','J','V','S'][day.getDay()];
    let cls = 'res-cal-day-head';
    if (isToday)         cls += ' today';
    else if (isFerie)    cls += ' ferie';
    else if (isWE)       cls += ' weekend';
    html += `<div class="${cls}" style="width:${COL_W}px">
      <span class="res-cal-dl">${dayLetters}</span>
      <span class="res-cal-dn">${dayLabel}</span>
    </div>`;
  });
  html += `</div>`; // res-cal-header

  // ── Lignes par ressource ──
  if (!resources.length) {
    html += `<div class="res-cal-empty">Aucune ressource à afficher</div>`;
  } else {
    resources.forEach(r => {
      const fullName = [r.prenom, r.nom].filter(Boolean).join(' ') || '—';
      html += `<div class="res-cal-row" style="width:${totalW}px" title="${escH(fullName)}">`;
      days.forEach(day => {
        const isToday = day.getTime() === today.getTime();
        const isWE    = day.getDay() === 0 || day.getDay() === 6;
        const isFerie = isJourFerie(day);
        const charge  = getChargeForResourceDay(r.id, day);
        let cls = 'res-cal-cell';
        if (isToday)         cls += ' today';
        else if (isFerie)    cls += ' ferie';
        else if (isWE)       cls += ' weekend';
        const chargeHtml = charge > 0
          ? `<div class="res-cal-charge" style="height:${Math.min(charge/1*100, 100)}%">${charge > 0.4 ? charge+'j' : ''}</div>`
          : '';
        html += `<div class="${cls}" style="width:${COL_W}px">${chargeHtml}</div>`;
      });
      html += `</div>`;
    });
  }

  html += `</div></div></div>`; // res-cal-inner, res-cal-scroll, res-cal-wrap
  return html;
}

/* ── Navigation calendrier ── */
function resCalPrev() {
  if (!resCalendarDate) resCalendarDate = new Date();
  resCalendarDate = new Date(resCalendarDate.getFullYear(), resCalendarDate.getMonth() - 1, 1);
  _refreshCalendar();
}

function resCalNext() {
  if (!resCalendarDate) resCalendarDate = new Date();
  resCalendarDate = new Date(resCalendarDate.getFullYear(), resCalendarDate.getMonth() + 1, 1);
  _refreshCalendar();
}

function resCalToday() {
  const now = new Date();
  resCalendarDate = new Date(now.getFullYear(), now.getMonth(), 1);
  _refreshCalendar();
}

function _refreshCalendar() {
  const right = document.getElementById('resRight');
  if (right) right.innerHTML = renderResourceCalendar();
}

/* ── Resize panneau gauche ressources ── */
function initResResize() {
  const handle = document.getElementById('resResizeHandle');
  const left   = document.getElementById('resLeft');
  if (!handle || !left) return;

  let dragging = false, startX = 0, startW = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = left.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newW = Math.min(Math.max(startW + (e.clientX - startX), 180), 560);
    left.style.width = newW + 'px';
    resLabelW = newW;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

/* ── Init au chargement ── */
(function initResources() {
  loadResources();
})();
