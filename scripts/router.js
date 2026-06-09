/* ═══════════════════════════════════════════
   router.js — Navigation entre les vues de l'application
   Vues : 'projets' | 'ressources' | 'calendrier' | 'todo' | 'suivi'
   Hash routing : location.hash = '#<vue>'
   ═══════════════════════════════════════════ */

const _VALID_VIEWS = ['projets', 'ressources', 'calendrier', 'todo', 'suivi'];

function _hashView() {
  const h = location.hash.replace(/^#/, '');
  return _VALID_VIEWS.includes(h) ? h : 'projets';
}

let currentView = 'projets';

function _applyView(view) {
  if (!_VALID_VIEWS.includes(view)) view = 'projets';
  currentView = view;

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });

  const viewProjets    = document.getElementById('viewProjets');
  const viewRessources = document.getElementById('viewRessources');
  const viewCalendar   = document.getElementById('viewCalendar');
  const viewTodo       = document.getElementById('viewTodo');
  const viewSuivi      = document.getElementById('viewSuivi');
  const navSidebar     = document.getElementById('navSidebar');

  viewProjets.style.display    = 'none';
  viewRessources.style.display = 'none';
  viewCalendar.style.display   = 'none';
  if (viewTodo)   viewTodo.style.display   = 'none';
  if (viewSuivi)  viewSuivi.style.display  = 'none';

  if (view === 'projets') {
    viewProjets.style.display = '';
    navSidebar.style.display  = '';
    if (typeof renderAll === 'function') renderAll();

  } else if (view === 'ressources') {
    viewRessources.style.display = '';
    navSidebar.style.display     = 'none';
    if (typeof renderResourcesView === 'function') renderResourcesView();

  } else if (view === 'calendrier') {
    viewCalendar.style.display = 'flex';
    navSidebar.style.display   = 'none';
    if (typeof renderCalendarView === 'function') renderCalendarView();

  } else if (view === 'todo') {
    if (viewTodo) viewTodo.style.display = 'flex';
    navSidebar.style.display = 'none';
    if (typeof renderTodoView === 'function') renderTodoView();

  } else if (view === 'suivi') {
    if (viewSuivi) viewSuivi.style.display = 'flex';
    navSidebar.style.display = 'none';
    if (typeof renderSuiviView === 'function') renderSuiviView();
  }
}

/* Guard for <a> link clicks — prevents navigation when unsaved changes exist */
function _navClick(e, view) {
  if (view === currentView) { e.preventDefault(); return; }
  const _hasEdits = (typeof _ganttEdits !== 'undefined' && Object.keys(_ganttEdits).length > 0);
  if ((typeof _tasksDirty !== 'undefined' && _tasksDirty) || _hasEdits) {
    e.preventDefault();
    if (typeof _showUnsavedChangesModal === 'function') {
      _showUnsavedChangesModal(() => { location.hash = '#' + view; });
    }
  }
  /* else: let <a href="#view"> navigate naturally → hashchange → _applyView */
}

/* Legacy: programmatic view switch (keeps working for any existing callers) */
function switchView(view) {
  if (view === currentView) return;
  location.hash = '#' + view;
}

/* React to browser back/forward and programmatic hash changes */
window.addEventListener('hashchange', () => _applyView(_hashView()));

/* On initial page load: apply view from URL hash, DOM only (no render).
   Firebase callbacks will trigger render once data is available. */
document.addEventListener('DOMContentLoaded', () => {
  const view = _hashView();
  currentView = view;

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });

  const viewProjets    = document.getElementById('viewProjets');
  const viewRessources = document.getElementById('viewRessources');
  const viewCalendar   = document.getElementById('viewCalendar');
  const viewTodo       = document.getElementById('viewTodo');
  const viewSuivi      = document.getElementById('viewSuivi');
  const navSidebar     = document.getElementById('navSidebar');
  if (!viewProjets) return;

  viewProjets.style.display    = 'none';
  viewRessources.style.display = 'none';
  viewCalendar.style.display   = 'none';
  if (viewTodo)   viewTodo.style.display   = 'none';
  if (viewSuivi)  viewSuivi.style.display  = 'none';

  if (view === 'projets') {
    viewProjets.style.display = '';
    if (navSidebar) navSidebar.style.display = '';
  } else if (view === 'ressources') {
    viewRessources.style.display = '';
    if (navSidebar) navSidebar.style.display = 'none';
  } else if (view === 'calendrier') {
    viewCalendar.style.display = 'flex';
    if (navSidebar) navSidebar.style.display = 'none';
  } else if (view === 'todo') {
    if (viewTodo) viewTodo.style.display = 'flex';
    if (navSidebar) navSidebar.style.display = 'none';
  } else if (view === 'suivi') {
    if (viewSuivi) viewSuivi.style.display = 'flex';
    if (navSidebar) navSidebar.style.display = 'none';
  }
});
