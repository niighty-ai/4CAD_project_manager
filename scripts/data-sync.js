/* ═══════════════════════════════════════════════════════════════
   data-sync.js — Synchronisation Firebase principale + verrouillage de projet
   (setFbStatus, scheduleFirebaseSave, doFirebaseSave, migrateFirebaseData,
    downloadModele, _acquireProjectLock, _releaseProjectLock, etc.)
   Dépendances : data.js (portfolio, activeProjectId, savePortfolio, etc.)
   ═══════════════════════════════════════════════════════════════ */

function setFbStatus(text, color){
  const el = document.getElementById('fbStatus');
  if(!el) return;
  el.textContent  = text;
  el.style.color  = color || 'var(--muted)';
  el.style.background = color ? color + '18' : 'var(--surface2)';
}

function cleanForFirebase(obj){
  if(Array.isArray(obj)) return obj.map(cleanForFirebase);
  if(obj instanceof Date) return obj.toISOString();
  if(obj !== null && typeof obj === 'object'){
    const out = {};
    for(const [k,v] of Object.entries(obj)){
      if(v === undefined) continue;
      /* Encode '/' dans les clés (Firebase interdit ce caractère) */
      const sk = k.replace(/\//g, '-');
      if(v === null){ out[sk] = null; continue; }
      out[sk] = cleanForFirebase(v);
    }
    return out;
  }
  return obj;
}

function scheduleFirebaseSave(data){
  if(typeof window._fbSet !== 'function') return;
  clearTimeout(_fbSaveTimer);
  setFbStatus('⏳ Sync...', '#f7971e');
  _fbSaveTimer = setTimeout(()=> doFirebaseSave(data), 1500);
}

async function doFirebaseSave(data){
  if(_fbSaving) return;
  if(typeof window._fbSet !== 'function'){ setFbStatus('⚠ SDK non prêt', '#e17055'); return; }
  _fbSaving = true;
  try {
    const clean = cleanForFirebase(data);
    _lastSaveTs = Date.now();
    await window._fbSet(clean);
    const t   = new Date();
    const hms = [t.getHours(),t.getMinutes(),t.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':');
    setFbStatus('☁ ' + hms, '#2e7d32');
  } catch(e){
    console.error('Firebase save error:', e);
    setFbStatus('⚠ Erreur Firebase', '#e17055');
  } finally { _fbSaving = false; }
}

function migrateFirebaseData(data){
  return _deserializePortfolio(data.map(p=>({
    ...p,
    client: p.client||'',
    folder: p.folder||'',
    projectColors: p.projectColors||{},
    collapsed: p.collapsed||{},
    jalons: (p.jalons||[
      ...(p.rows||[]).filter(r=>r._type==='jalon')
    ]).map(j=>({
      _type:'jalon', nom:j.nom||'', projet:j.projet||'',
      date: j.date ? j.date : null, couleur:j.couleur||null
    })),
    rows: (p.rows||[]).filter(r=>r._type!=='jalon').map(r=>{
      const _rawNiv = r.niveaux ? r.niveaux : (r.groupe ? [r.groupe] : []);
      const niveaux = _rawNiv;
      return {
        // Préserve TOUS les champs (assignments, chargePassee, chargeRestante, etc.)
        ...r,
        _type:  r._type  || 'tache',
        projet: r.projet || '',
        niveaux,
        tache:  r.tache  || null,
        debut:  r.debut  ? r.debut : null,
        fin:    r.fin    ? r.fin   : null,
        charge: r.charge != null ? r.charge : null,
        chargePassee:   r.chargePassee   ?? null,
        chargeRestante: r.chargeRestante ?? null,
        assignments:    Array.isArray(r.assignments) ? r.assignments : []
      };
    })
  })));
}

function downloadModele(){
  const headers = ['Type','Projet','Niveau 1','Niveau 2','Niveau 3','Tâche','Début','Fin','Charge (j)'];
  const examples = [
    ['','ACME Corp','Cadrage','','','Atelier de lancement','2025-04-01','2025-04-03',1.5],
    ['','ACME Corp','Cadrage','','','Rédaction cahier des charges','2025-04-04','2025-04-15',4],
    ['','ACME Corp','Réalisation','Sprint 1','','Développement module A','2025-04-16','2025-05-02',8],
    ['','ACME Corp','Réalisation','Sprint 1','','Tests unitaires','2025-04-28','2025-05-02',2],
    ['','ACME Corp','Réalisation','Sprint 2','','Développement module B','2025-05-05','2025-05-23',10],
    ['','ACME Corp','Recette','','','Recette client','2025-05-26','2025-06-06',5],
    ['jalon','ACME Corp','','','','Mise en production','2025-06-09','',''],
    ['','Projet Beta','Phase 1','','','Analyse','2025-04-01','2025-04-10',3],
    ['jalon','Projet Beta','','','','Go / No Go','2025-04-11','',''],
  ];
  const data = [headers, ...examples];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:8},{wch:16},{wch:16},{wch:14},{wch:14},{wch:30},{wch:12},{wch:12},{wch:10}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modèle');
  const help = [
    ['Colonne','Description','Obligatoire'],
    ['Type','Laisser vide pour une tâche, écrire "jalon" pour un jalon','Non'],
    ['Projet','Nom du projet (regroupe les tâches)','Oui'],
    ['Niveau 1','Groupe de niveau 1 (ex: Phase, Sprint…)','Non'],
    ['Niveau 2','Sous-groupe de niveau 2','Non'],
    ['Niveau 3','Sous-groupe de niveau 3','Non'],
    ['Tâche','Nom de la tâche ou du jalon','Oui'],
    ['Début','Date de début (YYYY-MM-DD ou DD/MM/YYYY)','Oui'],
    ['Fin','Date de fin (vide pour les jalons)','Oui (sauf jalon)'],
    ['Charge (j)','Charge en jours-homme (nombre décimal)','Non'],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(help);
  ws2['!cols'] = [{wch:12},{wch:50},{wch:16}];
  XLSX.utils.book_append_sheet(wb, ws2, 'Aide');
  XLSX.writeFile(wb, 'modele_import_gantt.xlsx');
}

/* ════════════════════════════════════════════════════════════════════════
   VERROUILLAGE DE PROJET
   — Verrou acquis à l'entrée en mode édition
   — Libéré à la sauvegarde, à l'annulation, après 10 min d'inactivité
     ou lors d'une perte de connexion (Firebase onDisconnect)
   ════════════════════════════════════════════════════════════════════════ */

/* Tente d'acquérir le verrou d'écriture sur un projet.
   Retourne true si le verrou est obtenu, false si bloqué par un autre utilisateur. */
async function _acquireProjectLock(projectId) {
  if (!currentUserId || !projectId) return true; // pas d'auth → édition libre
  if (_lockedProjectId === projectId) return true; // déjà verrouillé par nous

  // Lire le verrou depuis Firebase en temps réel (évite la race condition du cache local)
  let existing = null;
  if (typeof window._fbGetLock === 'function') {
    existing = await window._fbGetLock(projectId);
  } else {
    existing = _projectLocks[projectId] || null;
  }

  if (existing && existing.userId !== currentUserId && existing.expiresAt > Date.now()) {
    _showLockBlockedMessage(existing.userDisplayName);
    return false;
  }

  const now = Date.now();
  const lockData = {
    userId:          currentUserId,
    userDisplayName: currentUserEmail || currentUserId,
    lockedAt:        now,
    expiresAt:       now + LOCK_TTL_MS
  };

  // Marquer le verrou localement en avance (fail-open : en cas d'erreur Firebase on laisse éditer)
  _lockedProjectId = projectId;
  _projectLocks[projectId] = lockData;
  _startLockInactivityTimer();
  _updateRefreshBtn();

  try {
    await window._fbAcquireLock(projectId, lockData);
  } catch(e) {
    console.warn('[Lock] Écriture Firebase échouée (mode dégradé — édition autorisée) :', e);
  }
  return true;
}

/* Libère le verrou d'écriture tenu par cet utilisateur. */
function _releaseProjectLock() {
  if (!_lockedProjectId) return;
  const pid = _lockedProjectId;
  _lockedProjectId = null;
  _pendingFirebaseUpdate = false;
  _clearLockInactivityTimer();
  if (typeof window._fbReleaseLock === 'function') {
    window._fbReleaseLock(pid).catch(e => console.warn('[Lock] Libération échouée :', e));
  }
  _updateRefreshBtn();
}

/* Démarre (ou redémarre) le timer d'inactivité de 10 min. */
function _startLockInactivityTimer() {
  _clearLockInactivityTimer();
  _lockInactivityTimer = setTimeout(() => {
    _releaseProjectLock();
    setFbStatus('⏱ Verrou expiré', '#f7971e');
    setTimeout(() => setFbStatus('☁ Connecté', '#2e7d32'), 3000);
  }, LOCK_TTL_MS);
}

function _clearLockInactivityTimer() {
  if (_lockInactivityTimer) { clearTimeout(_lockInactivityTimer); _lockInactivityTimer = null; }
}

/* Réinitialise le timer d'inactivité à chaque interaction utilisateur dans le panneau. */
function _resetLockInactivityTimer() {
  if (_lockedProjectId) _startLockInactivityTimer();
}

/* Affiche un message bloquant quand un autre utilisateur détient le verrou. */
function _showLockBlockedMessage(holderName) {
  const msg = `Ce projet est en cours d'édition par :\n${holderName}\n\nVeuillez attendre qu'il termine ou que son verrou expire.`;
  alert(msg);
}

/* Met à jour l'indicateur cadenas (verrou projet).
   Utilise ICONS['lock'] / ICONS['lock-open'] de icons.js (chargé après data.js,
   donc on teste typeof ICONS au moment de l'appel). */
function _updateRefreshBtn() {
  const el = document.getElementById('lockIndicator');
  if (!el) return;

  const iconLock     = (typeof ICONS !== 'undefined' && ICONS['lock'])      || '';
  const iconLockOpen = (typeof ICONS !== 'undefined' && ICONS['lock-open']) || '';

  const pid = activeProjectId;
  const lock = pid ? _projectLocks[pid] : null;
  const lockValid = lock && lock.expiresAt > Date.now();

  if (lockValid) {
    if (lock.userId === currentUserId) {
      el.className = 'lock-indicator locked-me';
      el.title = 'Vous avez le verrou d\'écriture sur ce projet';
    } else {
      el.className = 'lock-indicator locked-other';
      el.title = `Verrou tenu par : ${lock.userDisplayName}`;
    }
    el.innerHTML = iconLock;
  } else {
    el.className = 'lock-indicator unlocked';
    el.title = 'Projet libre — aucun verrou actif';
    el.innerHTML = iconLockOpen;
  }
}

/* Rafraîchit le projet actif depuis Firebase.
   onDone() est appelé une fois le rafraîchissement terminé (succès ou échec). */
function refreshActiveProjectFromFirebase(onDone) {
  if (!_pendingFirebaseUpdate) { if (onDone) onDone(); return; }
  if (typeof window._fbGetPortfolio !== 'function') { if (onDone) onDone(); return; }

  setFbStatus('⏳ Actualisation...', '#f7971e');
  window._fbGetPortfolio(function(val) {
    if (!val || !Array.isArray(val) || !val.length) {
      setFbStatus('⚠ Données vides', '#e17055');
      if (onDone) onDone();
      return;
    }
    _pendingFirebaseUpdate = false;
    portfolio = migrateFirebaseData(val);
    /* Réinitialise le snapshot d'annulation avec les données fraîches.
       NE PAS appeler switchToProject() ici : cela déclencherait _saveBackToPortfolio()
       qui écraserait le portfolio fraîchement chargé avec les rows[] en cache. */
    _tasksSnapshot = null;
    _tasksDirty = false;
    renderNavList();
    /* Recharger rows[] depuis le portfolio actualisé, puis re-rendre le gantt */
    if (typeof _loadSelectedProjects === 'function') _loadSelectedProjects();
    if (typeof renderAll === 'function') renderAll();
    setFbStatus('☁ Actualisé', '#2e7d32');
    if (typeof _updateSaveBtn === 'function') _updateSaveBtn();
    _updateRefreshBtn();
    if (onDone) onDone();
  });
}

/* Démarre l'écoute des verrous depuis Firebase (appelé au chargement). */
function _startLocksListener() {
  if (typeof window._fbOnLocks !== 'function') return;
  window._fbOnLocks(function(locks) {
    _projectLocks = locks || {};
    _updateRefreshBtn();
  });
}
