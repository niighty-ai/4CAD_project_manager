/* ═══════════════════════════════════════════
   app.js — Initialisation, event listeners
   ═══════════════════════════════════════════ */

/* ── Authentification Email/Password ─────────────────────────────────────
   Le chargement Firebase ne se lance qu'après confirmation de la connexion.
   ──────────────────────────────────────────────────────────────────────── */
(function waitForAuth() {
  let attempts = 0;
  const iv = setInterval(() => {
    attempts++;
    if (typeof window._fbOnAuthChange === 'function') {
      clearInterval(iv);
      window._fbOnAuthChange(user => {
        const loginScreen  = document.getElementById('loginScreen');
        const authLoading  = document.getElementById('authLoading');
        const appHeader    = document.querySelector('header');
        /* Masquer le spinner de chargement dès que l'état auth est connu */
        if (authLoading) authLoading.style.display = 'none';
        if (user) {
          /* Connecté → affiche l'appli */
          currentUserId = user.uid;
          currentUserEmail = user.email || user.uid;
          if (loginScreen) loginScreen.style.display = 'none';
          if (appHeader)   appHeader.style.display   = '';
          const userInfo = document.getElementById('connectedUser');
          if (userInfo) userInfo.textContent = user.email;
          /* Lance le chargement des données Firebase maintenant qu'on est auth */
          _startFirebaseLoad();
          _startWalletLoad(user.uid);
          _startFoldersLoad(user.uid);
          if (typeof _startTodoLoad === 'function') _startTodoLoad(user.uid);
          if (typeof _startSuiviLoad === 'function') _startSuiviLoad(user.uid);
          if (typeof _notifInit === 'function') _notifInit(user.email);
        } else {
          /* Non connecté → réinitialise l'état utilisateur */
          currentUserId = null;
          currentUserEmail = null;
          userWalletClients = new Set();
          _walletLoaded = false;
          if (loginScreen) loginScreen.style.display = 'flex';
          if (appHeader)   appHeader.style.display   = 'none';
          const btn = document.getElementById('loginBtn');
          if (btn) { btn.disabled = false; btn.textContent = 'Se connecter'; }
        }
      });
    } else if (attempts > 80) {
      clearInterval(iv);
      console.warn('[Auth] Firebase Auth indisponible après 8 s');
      const authLoading = document.getElementById('authLoading');
      const loginScreen = document.getElementById('loginScreen');
      if (authLoading) authLoading.style.display = 'none';
      if (loginScreen) loginScreen.style.display = 'flex';
    }
  }, 100);
})();

function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pwd   = document.getElementById('loginPwd').value;
  const err   = document.getElementById('loginError');
  const btn   = document.getElementById('loginBtn');
  if (!email || !pwd) {
    err.textContent = 'Veuillez renseigner l\'email et le mot de passe.';
    return;
  }
  err.textContent  = '';
  btn.disabled     = true;
  btn.textContent  = 'Connexion…';
  window._fbSignIn(email, pwd).catch(() => {
    err.textContent = 'Email ou mot de passe incorrect.';
    btn.disabled    = false;
    btn.textContent = 'Se connecter';
  });
}

/* ── Chargement Firebase (appelé uniquement après auth confirmée) ── */
let _fbLoadStarted = false;
function _startFirebaseLoad() {
  if (_fbLoadStarted) return; /* Ne lancer qu'une seule fois */
  _fbLoadStarted = true;

  /* Restaurer l'état du mode planifié global depuis localStorage */
  try { usePlanned = localStorage.getItem('4cap_useplanned') === '1'; } catch(_) {}
  if (typeof _updateTogglePlannedBtn === 'function') _updateTogglePlannedBtn();

  /* Initialisation des ressources */
  if (typeof initResources === 'function') initResources();

  /* Chargement du portfolio de travail */
  let attempts = 0;
  const iv = setInterval(() => {
    attempts++;
    if (typeof window._fbOnValue === 'function') {
      clearInterval(iv);
      setFbStatus('⏳ Chargement...', '#f7971e');
      window._fbOnValue(function(val) {
        /* Filtre anti-écho : on ignore les mises à jour Firebase qui arrivent
           dans les 4 secondes suivant notre propre sauvegarde. */
        if (_fbInitLoaded && (Date.now() - _lastSaveTs) < 4000) return;

        if (val && Array.isArray(val) && val.length) {

          /* ── CAS 1 : Verrou actif (utilisateur en mode édition) ──────────────
             On préserve le projet verrouillé localement et on signale qu'une
             version plus récente est disponible si Firebase a bougé. */
          if (_fbInitLoaded && _lockedProjectId) {
            const fbProj    = val.find(p => p.id === _lockedProjectId);
            const localProj = portfolio.find(p => p.id === _lockedProjectId);

            if (fbProj && localProj) {
              /* Firebase a reçu des données pour notre projet verrouillé
                 (l'anti-écho ci-dessus garantit que ce n'est pas notre propre écho)
                 → signaler qu'une version externe plus récente est disponible. */
              _pendingFirebaseUpdate = true;
              if (typeof _updateRefreshBtn === 'function') _updateRefreshBtn();
            }

            /* Mettre à jour tous les projets SAUF celui verrouillé */
            const updated = migrateFirebaseData(val);
            const lockedIdx = updated.findIndex(p => p.id === _lockedProjectId);
            if (lockedIdx >= 0 && localProj) updated[lockedIdx] = localProj;
            portfolio = updated;
            renderNavList();
            return;
          }

          /* ── CAS 2 : Aucun verrou (mode consultation) ────────────────────────
             On remplace le portfolio. Si le projet actif a été modifié par un
             autre utilisateur, on signale qu'un refresh manuel est disponible. */
          const prevProj = activeProjectId
            ? portfolio.find(p => p.id === activeProjectId)
            : null;
          const prevUpdatedAt = prevProj ? (prevProj.updatedAt || 0) : 0;

          portfolio = migrateFirebaseData(val);
          renderNavList();

          if (_fbInitLoaded && activeProjectId) {
            const newProj = portfolio.find(p => p.id === activeProjectId);
            const newUpdatedAt = newProj ? (newProj.updatedAt || 0) : 0;
            if (newUpdatedAt > prevUpdatedAt) {
              /* Le projet actif a une version plus récente dans Firebase :
                 recharger la vue gantt automatiquement (pas d'édition en cours). */
              if (typeof _loadSelectedProjects === 'function') _loadSelectedProjects();
              if (typeof renderAll === 'function') renderAll();
            }
          }

          _tryAutoSelectProject();
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

  /* Écoute des verrous de projet */
  if (typeof _startLocksListener === 'function') _startLocksListener();

  /* Chargement de la base ferme (lecture seule, sync temps-réel) */
  loadFirmPortfolio(); // localStorage d'abord
  let firmAttempts = 0;
  const firmIv = setInterval(() => {
    firmAttempts++;
    if (typeof window._fbOnValueFirm === 'function') {
      clearInterval(firmIv);
      window._fbOnValueFirm(function(val) {
        if (val && Array.isArray(val) && val.length) {
          portfolioFirm = migrateFirebaseData(val);
          try { localStorage.setItem(FIRM_STORAGE_KEY, JSON.stringify(_serializePortfolio(portfolioFirm))); } catch(e) {}
        }
      });
    } else if (firmAttempts > 60) {
      clearInterval(firmIv);
    }
  }, 100);
}

/* ── Sélection automatique du projet au démarrage ──────────────────────────
   Respecte l'ordre de priorité :
   1. Dernier projet actif sauvegardé (localStorage) s'il est dans le wallet
   2. Premier projet du wallet
   3. Rien → écran vide si le wallet est vide
   ── Appelée dès que portfolio ET wallet sont tous les deux chargés ── */
function _tryAutoSelectProject() {
  if (activeProjectId) return;      /* déjà sélectionné */
  if (!_walletLoaded) return;       /* wallet pas encore chargé */
  if (portfolio.length === 0) return; /* portfolio pas encore chargé */

  const savedId = localStorage.getItem('gantt4cad_active');
  if (savedId) {
    const savedProj = portfolio.find(p => p.id === savedId);
    if (savedProj && savedProj.client && userWalletClients.has(savedProj.client)) {
      switchToProject(savedId);
      return;
    }
  }
  /* Fallback : premier projet d'un client du wallet */
  const first = portfolio.find(p => p.client && userWalletClients.has(p.client));
  if (first) switchToProject(first.id);
  /* Wallet vide → rien sélectionné, écran vide ✓ */
}

/* ── Chargement du portefeuille utilisateur (appelé après auth) ── */
function _startWalletLoad(userId) {
  let attempts = 0;
  const iv = setInterval(() => {
    attempts++;
    if (typeof window._fbOnUserWallet === 'function') {
      clearInterval(iv);
      window._fbOnUserWallet(userId, (val) => {
        userWalletClients = Array.isArray(val) ? new Set(val) : new Set();
        _walletLoaded = true;
        renderNavList();
        _tryAutoSelectProject();
      });
    } else if (attempts > 60) {
      clearInterval(iv);
    }
  }, 100);
}

/* ── Chargement des dossiers utilisateur (appelé après auth) ── */
function _startFoldersLoad(userId) {
  let attempts = 0;
  const iv = setInterval(() => {
    attempts++;
    if (typeof window._fbOnUserFolders === 'function') {
      clearInterval(iv);
      window._fbOnUserFolders(userId, (val) => {
        if (val && typeof val === 'object') {
          /* Fusionner avec navFolders existants (union avec les dossiers issus du portfolio) */
          Object.entries(val).forEach(([client, folders]) => {
            if (Array.isArray(folders) && folders.length > 0) {
              if (!navFolders[client]) navFolders[client] = new Set();
              folders.forEach(f => navFolders[client].add(f));
            }
          });
          renderNavList();
        }
      });
    } else if (attempts > 60) {
      clearInterval(iv);
    }
  }, 100);
}

/* ── Reste de l'initialisation ─────────────────────────────────────────── */

document.getElementById('cpCustom').addEventListener('input',e=>{if(!cpTarget)return;projectColors[cpTarget]=e.target.value;document.getElementById('colorGrid').querySelectorAll('.color-opt').forEach(el=>el.classList.remove('selected'));renderAll();}
);
document.addEventListener('click',e=>{if(!document.getElementById('colorPopup').contains(e.target))document.getElementById('colorPopup').style.display='none';});
document.addEventListener('click', e => {
  const container = document.getElementById('walletSearchContainer');
  if (container && !container.contains(e.target)) {
    const results = document.getElementById('walletSearchResults');
    if (results) results.style.display = 'none';
  }
});
document.getElementById('fileInput').addEventListener('change',e=>{
  const file=e.target.files[0];if(!file)return;
  if(file.name.toLowerCase().endsWith('.xml')){
    handleXMLImport(file);
    e.target.value='';
    return;
  }
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const wb=XLSX.read(ev.target.result,{type:'array',cellDates:false});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const data=XLSX.utils.sheet_to_json(ws,{header:1,raw:true});
      let hr=0;
      for(let i=0;i<Math.min(5,data.length);i++){
        const r=data[i].map(c=>String(c||'').toLowerCase());
        if(r.some(c=>c.includes('projet')||c.includes('tach')||c.includes('but'))){hr=i;break;}
      }
      const hdrs=data[hr].map(c=>String(c||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
      const ci={
        type:   hdrs.findIndex(h=>h==='type'||h.includes('type')),
        projet: hdrs.findIndex(h=>h.includes('projet')),
        tache:  hdrs.findIndex(h=>h.includes('tach')||h.includes('nom')),
        debut:  hdrs.findIndex(h=>h.includes('debut')||h.includes('but')||h==='debut'),
        fin:    hdrs.findIndex(h=>h==='fin'||h.includes('fin')),
        charge: hdrs.findIndex(h=>h.includes('charge')),
        niveaux: [1,2,3,4,5].map(n=>hdrs.findIndex(h=>
          h===`niveau${n}` || h===`niveau_${n}` || h===`niveau ${n}` ||
          h===`n${n}` || h===`level${n}` || h===`level ${n}` ||
          (n===1 && (h.includes('groupe')||h.includes('group')))
        ))
      };
      /* ── Parser les lignes ── */
      const parsedRows = [];
      const parsedJalons = [];
      for(let i=hr+1;i<data.length;i++){
        const r=data[i];if(!r||!r[ci.projet])continue;
        const typeVal = ci.type>=0&&r[ci.type] ? String(r[ci.type]).toLowerCase().trim() : '';
        const isJalon = typeVal==='jalon'||typeVal==='milestone'||typeVal==='j';
        const nomVal = ci.tache>=0&&r[ci.tache] ? String(r[ci.tache]).trim() : null;
        if(isJalon){
          const d=ci.debut>=0?parseDate(r[ci.debut]):null;
          if(!d||isNaN(d)) continue;
          parsedJalons.push({_type:'jalon',projet:String(r[ci.projet]).trim(),nom:nomVal||'',date:d});
          continue;
        }
        const d=ci.debut>=0?parseDate(r[ci.debut]):null;
        const f=ci.fin>=0?parseDate(r[ci.fin]):null;
        if(!d||!f||isNaN(d)||isNaN(f))continue;
        let ch=ci.charge>=0?r[ci.charge]:null;
        if(ch!==null){ch=parseFloat(String(ch).replace(',','.'));if(isNaN(ch))ch=null;else ch=roundCharge(snapToSixteenth(ch));}
        const niveaux=[];
        for(const idx of ci.niveaux){
          if(idx>=0&&r[idx]&&String(r[idx]).trim()) niveaux.push(String(r[idx]).trim());
          else break;
        }
        parsedRows.push({_type:'tache',projet:String(r[ci.projet]).trim(),niveaux,tache:nomVal,debut:d,fin:f,charge:ch});
      }

      /* ── Construire la base ferme depuis le fichier (remplacement total) ── */
      const firmByProj = {};
      parsedRows.forEach(r => {
        if(!firmByProj[r.projet]) firmByProj[r.projet] = [];
        firmByProj[r.projet].push(r);
      });
      parsedJalons.forEach(j => {
        if(!firmByProj[j.projet]) firmByProj[j.projet] = [];
      });

      let _seq = 0;
      const newFirmData = Object.entries(firmByProj).map(([projName, projRows]) => {
        _seq++;
        const existWork = portfolio.find(p => p.name === projName);
        const existFirm = portfolioFirm.find(p => p.name === projName);
        const projId = existWork?.id || existFirm?.id ||
          `p_${Date.now()}_${_seq}_${Math.random().toString(36).slice(2,6)}`;
        const firmRows = projRows.filter(r => r._type === 'tache');
        const firmJalons = parsedJalons.filter(j => j.projet === projName);
        return {
          id: projId, name: projName,
          client:        existWork?.client        || existFirm?.client        || '',
          folder:        existWork?.folder        || existFirm?.folder        || '',
          projectColors: existWork?.projectColors || existFirm?.projectColors || {},
          collapsed:     existWork?.collapsed     || existFirm?.collapsed     || {},
          jalons: firmJalons.length ? firmJalons : (existWork?.jalons || existFirm?.jalons || []),
          rows: firmRows
        };
      });

      /* ── Afficher la modal d'options avant de committer ── */
      const _projCount = Object.keys(firmByProj).length;
      const _taskCount = parsedRows.length;
      const _jalCount  = parsedJalons.length;
      const _summary   = `${_projCount} projet(s), ${_taskCount} tâche(s)${_jalCount > 0 ? `, ${_jalCount} jalon(s)` : ''} détectés.`;
      /* Restaure la vue utilisateur après import (respecte le wallet + sélection courante) */
      function _postImportRestore() {
        savePortfolio();
        /* 1. Si le projet actif a été retiré du portfolio, le désélectionner */
        if (activeProjectId && !portfolio.find(p => p.id === activeProjectId)) {
          activeProjectId = null;
          multiViewMode   = false;
        }
        /* 2. Nettoyer selectedProjectIds des IDs supprimés */
        selectedProjectIds.forEach(id => {
          if (!portfolio.find(p => p.id === id)) selectedProjectIds.delete(id);
        });
        if (activeProjectId && !selectedProjectIds.has(activeProjectId)) selectedProjectIds.add(activeProjectId);
        multiViewMode = selectedProjectIds.size > 1;
        /* 3. Si plus rien de sélectionné, reprendre le premier projet du wallet */
        if (!activeProjectId || selectedProjectIds.size === 0) {
          const first = portfolio.find(p => p.client && userWalletClients.has(p.client));
          if (first) { activeProjectId = first.id; selectedProjectIds.clear(); selectedProjectIds.add(first.id); multiViewMode = false; }
        }
        /* 4. Recharger rows depuis le portfolio fusionné (ne montre QUE les projets sélectionnés) */
        if (typeof _loadSelectedProjects === 'function') _loadSelectedProjects();
        renderNavList();
        renderAll();
      }

      function _doImport(resetPlanned) {
        if(typeof saveFirmPortfolio === 'function') saveFirmPortfolio(newFirmData);
        if(typeof _notifyFirmConflicts === 'function') {
          _notifyFirmConflicts(newFirmData, () => {
            if(typeof mergeFirmIntoWorking === 'function') mergeFirmIntoWorking(newFirmData);
            if(resetPlanned && typeof _resetPlannedForFirmProjects === 'function') _resetPlannedForFirmProjects(newFirmData);
            _postImportRestore();
          });
        } else {
          if(typeof mergeFirmIntoWorking === 'function') mergeFirmIntoWorking(newFirmData);
          if(resetPlanned && typeof _resetPlannedForFirmProjects === 'function') _resetPlannedForFirmProjects(newFirmData);
          _postImportRestore();
        }
      }
      if(typeof showImportModal === 'function'){
        showImportModal(_summary, _doImport);
      } else {
        _doImport(false);
      }
    }catch(err){alert('Erreur : '+err.message);}
  };
  reader.readAsArrayBuffer(file);e.target.value='';
}
);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')cancelInlineEdit();
  if(e.key==='Enter'&&editingIdx!==null&&e.target.classList.contains('cell-input'))saveInlineEdit(editingIdx);
}
);
(function(){
  document.getElementById('fileInput').addEventListener('change', function(e){
    const file = e.target.files[0];
    if(file && activeProjectId){
      const proj = portfolio.find(p=>p.id===activeProjectId);
      if(proj && (proj.name.startsWith('Nouveau projet'))){
        const name = file.name.replace(/\.[^.]+$/,'').replace(/[_-]/g,' ');
        proj.name = name;
        savePortfolio();
        renderNavList();
      }
    }
  });
}
)();
(function(){
  portfolio = [];
  renderNavList();
}
)();
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    closeEditPanel();
    closeClientModal();
  }
});
document.addEventListener('keydown', e=>{
  if(e.key==='Escape') closeJalonPanel();
}
);
