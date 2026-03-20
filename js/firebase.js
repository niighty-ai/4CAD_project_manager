/**
 * firebase.js
 * Firebase Realtime Database sync.
 *
 * Architecture:
 *   - The Firebase SDK (ES module) is loaded in index.html and exposes
 *     window._fbSet and window._fbOnValue to the global scope.
 *   - savePortfolio() calls scheduleFirebaseSave() which debounces writes.
 *   - On load, waitForFbAndLoad() polls for the SDK then subscribes with onValue.
 *   - Echoes from our own saves are ignored for 4 seconds (_lastSaveTs).
 *
 * Depends on: state.js, utils.js
 * Calls (at runtime): renderNavList(), switchToProject() from portfolio.js
 */

// ====== FIREBASE REALTIME DATABASE — AUTOSAVE ======
let _fbSaveTimer  = null;
let _fbSaving     = false;
let _fbInitLoaded = false;

function setFbStatus(text, color){
  const el = document.getElementById('fbStatus');
  if(!el) return;
  el.textContent  = text;
  el.style.color  = color || 'var(--muted)';
  el.style.background = color ? color + '18' : 'var(--surface2)';
}

function cleanForFirebase(obj){
  if(Array.isArray(obj)) return obj.map(cleanForFirebase);
  if(obj !== null && typeof obj === 'object'){
    const out = {};
    for(const [k,v] of Object.entries(obj)){
      if(v === undefined) continue;
      if(v === null){ out[k] = null; continue; }
      out[k] = cleanForFirebase(v);
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

let _lastSaveTs = 0; // timestamp du dernier envoi vers Firebase

async function doFirebaseSave(data){
  if(_fbSaving) return;
  if(typeof window._fbSet !== 'function'){ setFbStatus('⚠ SDK non prêt', '#e17055'); return; }
  _fbSaving = true;
  try {
    const clean = cleanForFirebase(data);
    _lastSaveTs = Date.now(); // marquer l'heure de l'envoi
    await window._fbSet(clean);
    const t   = new Date();
    const hms = [t.getHours(),t.getMinutes(),t.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':');
    setFbStatus('☁ ' + hms, '#2e7d32');
  } catch(e){
    console.error('Firebase save error:', e);
    setFbStatus('⚠ Erreur Firebase', '#e17055');
  } finally { _fbSaving = false; }
}

// Migration Firebase: convertir ancien format (groupe string) vers niveaux array
function migrateFirebaseData(data){
  return data.map(p=>({
    ...p, client: p.client||'',
    projectColors: p.projectColors||{},
    collapsed: p.collapsed||{},
    jalons: (p.jalons||[
      // compat ancien format : jalons dans rows
      ...(p.rows||[]).filter(r=>r._type==='jalon')
    ]).map(j=>({
      _type:'jalon', nom:j.nom||'', projet:j.projet||'',
      date: j.date ? new Date(j.date) : null, couleur:j.couleur||null
    })),
    rows: (p.rows||[]).filter(r=>r._type!=='jalon').map(r=>{
      const niveaux = r.niveaux ? r.niveaux : (r.groupe ? [r.groupe] : []);
      return {
        _type:  r._type  || 'tache',
        projet: r.projet || '',
        niveaux,
        tache:  r.tache  || null,
        debut:  r.debut  ? new Date(r.debut) : null,
        fin:    r.fin    ? new Date(r.fin)   : null,
        charge: r.charge != null ? r.charge : null
      };
    })
  }));
}

(function waitForFbAndLoad(){
  let attempts = 0;
  const iv = setInterval(()=>{
    attempts++;
    if(typeof window._fbOnValue === 'function'){
      clearInterval(iv);
      setFbStatus('⏳ Chargement...', '#f7971e');
      window._fbOnValue(function(val){
        // Si c'est l'écho de notre propre sauvegarde (< 4s), ignorer
        if(_fbInitLoaded && (Date.now() - _lastSaveTs) < 4000){
          return;
        }
        if(val && Array.isArray(val) && val.length){
          const activeId = activeProjectId;
          portfolio = migrateFirebaseData(val);
          renderNavList();
          const target = activeId && portfolio.find(p=>p.id===activeId)
            ? activeId : portfolio[0]?.id;
          if(target) switchToProject(target);
          setFbStatus('☁ Connecté', '#2e7d32');
        } else if(!_fbInitLoaded){
          setFbStatus('☁ Vide', '#f7971e');
        }
        _fbInitLoaded = true;
      });
    } else if(attempts > 60){
      clearInterval(iv);
      setFbStatus('⚠ Firebase indisponible', '#e17055');
    }
  }, 100);
})();

// ── Initial load (runs on startup) ───────────────────────────────────────────

// -- INIT -- Firebase est la source de vérité, on attend son chargement
(function(){
  // Ne pas charger de données figées — Firebase va tout fournir via waitForFbAndLoad
  portfolio = [];
  renderNavList();
})();