/* ═══════════════════════════════════════════
   router.js — Navigation entre les vues de l'application
   Vues disponibles : 'projets' | 'ressources'
   ═══════════════════════════════════════════ */

let currentView = 'projets';

function switchView(view) {
  if (view === currentView) return;
  currentView = view;

  // Mise à jour des onglets header
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });

  // Affichage/masquage des vues
  const viewProjets    = document.getElementById('viewProjets');
  const viewRessources = document.getElementById('viewRessources');

  if (view === 'projets') {
    viewProjets.style.display    = '';
    viewRessources.style.display = 'none';
    // Sidebar portefeuille
    document.getElementById('navSidebar').style.display = '';
    renderAll();
  } else if (view === 'ressources') {
    viewProjets.style.display    = 'none';
    viewRessources.style.display = '';
    // La sidebar portefeuille est masquée sur la vue ressources
    document.getElementById('navSidebar').style.display = 'none';
    renderResourcesView();
  }
}
