/* =========================================
   APP.JS — Initialisation & point d'entrée
   Démarrage de l'application, event listeners
   ========================================= */

// ── Override de renderAll pour sauvegarder automatiquement ──
const _ganttRenderAll = renderAll;
renderAll = function() {
  _ganttRenderAll();
  saveCurrentProject();
};

// ── Event listeners ──

// Import de fichier Excel
document.getElementById('fileInput').addEventListener('change', handleFileImport);

// Color picker custom
document.getElementById('cpCustom').addEventListener('input', e => {
  if (!cpTarget) return;
  projectColors[cpTarget] = e.target.value;
  document.getElementById('colorGrid').querySelectorAll('.color-opt').forEach(el => el.classList.remove('selected'));
  renderAll();
});

// Fermer le color picker au clic extérieur
document.addEventListener('click', e => {
  if (!document.getElementById('colorPopup').contains(e.target))
    document.getElementById('colorPopup').style.display = 'none';
});

// ── Initialisation du portfolio ──
(function() {
  portfolio = [];
  renderNavList();
})();

// ── Connexion Firebase & chargement initial ──
(function waitForFbAndLoad() {
  let attempts = 0;
  const iv = setInterval(() => {
    attempts++;
    if (typeof window._fbOnValue === 'function') {
      clearInterval(iv);
      setFbStatus('⏳ Chargement...', '#f7971e');
      window._fbOnValue(function(val) {
        if (_fbInitLoaded && (Date.now() - _lastSaveTs) < 4000) {
          return;
        }
        if (val && Array.isArray(val) && val.length) {
          const activeId = activeProjectId;
          portfolio = migrateFirebaseData(val);
          renderNavList();
          const target = activeId && portfolio.find(p => p.id === activeId)
            ? activeId : portfolio[0]?.id;
          if (target) switchToProject(target);
          setFbStatus('☁ Connecté', '#2e7d32');
        } else if (!_fbInitLoaded) {
          setFbStatus('☁ Vide', '#f7971e');
        }
        _fbInitLoaded = true;
      });
    } else if (attempts > 60) {
      clearInterval(iv);
      setFbStatus('⚠ Firebase indisponible', '#e17055');
    }
  }, 100);
})();
