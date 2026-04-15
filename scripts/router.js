/* ═══════════════════════════════════════════
   router.js — Navigation entre les vues de l'application
   Vues disponibles : 'projets' | 'ressources' | 'calendrier'
   ═══════════════════════════════════════════ */

let currentView = 'projets';

function switchView(view) {
  if (view === currentView) return;
  /* Garde : modifications en cours → demander confirmation */
  const _hasEdits = (typeof _ganttEdits !== 'undefined' && Object.keys(_ganttEdits).length > 0);
  if (((typeof _tasksDirty !== 'undefined' && _tasksDirty) || _hasEdits)) {
    if (typeof _showUnsavedChangesModal === 'function') {
      _showUnsavedChangesModal(() => {
        /* Ne pas pré-setter currentView ici : confirmUnsavedSwitch vide
           _ganttEdits/_tasksDirty, donc la garde ne se re-déclenche pas,
           et currentView est correctement mis à jour dans switchView. */
        switchView(view);
      });
      return;
    }
  }
  currentView = view;

  /* Mise à jour des onglets header */
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });

  /* Références aux conteneurs */
  const viewProjets    = document.getElementById('viewProjets');
  const viewRessources = document.getElementById('viewRessources');
  const viewCalendar   = document.getElementById('viewCalendar');
  const navSidebar     = document.getElementById('navSidebar');

  /* Masquer tout */
  viewProjets.style.display    = 'none';
  viewRessources.style.display = 'none';
  viewCalendar.style.display   = 'none';

  if (view === 'projets') {
    viewProjets.style.display = '';
    navSidebar.style.display  = '';
    renderAll();

  } else if (view === 'ressources') {
    viewRessources.style.display = '';
    navSidebar.style.display     = 'none';
    renderResourcesView();

  } else if (view === 'calendrier') {
    viewCalendar.style.display = 'flex';
    navSidebar.style.display   = 'none';
    renderCalendarView();
  }
}
