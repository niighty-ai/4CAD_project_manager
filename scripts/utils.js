/* ═══════════════════════════════════════════
   utils.js — Constantes, état global, utilitaires
   ═══════════════════════════════════════════ */

const STORAGE_KEY      = 'gantt4cad_portfolio';
const FIRM_STORAGE_KEY = 'gantt4cad_portfolio_firm';
let portfolio     = [];
let portfolioFirm = [];   // base ferme (import-only)
let activeProjectId = null;
let rows=[];
let view='semaine';
let dayWidth=6;
let projectColors={};
let collapsed={};
let editingIdx=null;
let showDates=true;
let showResources=false; // affiche les lignes ressources sous les tâches
let labelW=520;
const PALETTE=['#6c63ff','#ff6584','#43e97b','#f7971e','#38b2f8','#ff9a3c','#a29bfe','#fd79a8','#00b894','#fdcb6e','#e17055','#74b9ff','#55efc4','#d63031','#6ab04c','#e84393','#0984e3','#b8e994','#f19066','#786fa6'];
const MOIS=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
function getJoursFeries(year){
  const a=year%19,b=Math.floor(year/100),c=year%100;
  const d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25);
  const g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7;
  const m=Math.floor((a+11*h+22*l)/451);
  const mo=Math.floor((h+l-7*m+114)/31)-1;
  const day=((h+l-7*m+114)%31)+1;
  const paques=new Date(year,mo,day);
  function add(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
  function key(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  return new Set([
    new Date(year,0,1), new Date(year,4,1), new Date(year,4,8),
    new Date(year,6,14), new Date(year,7,15), new Date(year,10,1),
    new Date(year,10,11), new Date(year,11,25),
    add(paques,1), add(paques,39), add(paques,50)
  ].map(key));
}
function isJourFerie(date){
  const y=date.getFullYear();
  const cache=isJourFerie._c||(isJourFerie._c={});
  if(!cache[y]) cache[y]=getJoursFeries(y);
  const key=y+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  return cache[y].has(key);
}
function parseDate(s){
  if(!s)return null;
  if(s instanceof Date){const d=new Date(s);d.setHours(0,0,0,0);return d;}
  let m=String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m)return new Date(+m[3],+m[2]-1,+m[1]);
  m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m)return new Date(+m[1],+m[2]-1,+m[3]);
  if(!isNaN(s)){const d=new Date((+s-25569)*86400000);d.setHours(0,0,0,0);return d;}
  return new Date(s);
}
function fmtD(d){if(!d)return'—';return`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;}
function fmtShort(d){if(!d)return'—';return`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;}
function toInput(d){if(!d)return'';return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function roundCharge(v){if(v==null)return null;const n=parseFloat(v);return isNaN(n)?null:Math.round(n*10000)/10000;}
/* Reconvertit une valeur arrondie à 2 décimales vers le 16ème de journée exact si correspondance. */
function snapToSixteenth(v){if(v==null||isNaN(v))return v;const c=Math.round(v*16)/16;return Math.round(c*100)/100===Math.round(v*100)/100?c:v;}
function fmtCharge(v){if(v==null)return'—';const n=parseFloat(v);return isNaN(n)?'—':(Math.round(n*100)/100).toString();}
function diff(a,b){return Math.round((b-a)/86400000);}
function escH(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
/* Normalise une chaîne pour la recherche : minuscules + sans accents */
function normalizeStr(s){return(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
/* Génère l'email @4cad.fr d'une ressource : "Gaël Homère" → "ghomere@4cad.fr"
   Retourne null si le nom est insuffisant (moins de 2 mots). */
function _resourceToEmail(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const firstInit = normalizeStr(parts[0])[0];
  if (!firstInit) return null;
  const lastName = normalizeStr(parts.slice(1).join('')).replace(/[-\s]/g, '');
  if (!lastName) return null;
  return firstInit + lastName + '@4cad.fr';
}

function getColor(p){
  if(!projectColors[p]){const used=Object.values(projectColors);projectColors[p]=PALETTE.find(c=>!used.includes(c))||PALETTE[0];}
  return projectColors[p];
}
function lighten(hex,pct=30){
  let c=parseInt(hex.slice(1),16);
  let r=(c>>16)&0xff,g=(c>>8)&0xff,b=c&0xff;
  r=Math.min(255,r+Math.round((255-r)*pct/100));
  g=Math.min(255,g+Math.round((255-g)*pct/100));
  b=Math.min(255,b+Math.round((255-b)*pct/100));
  return`#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}
function collapseKey(projet,niveaux){
  if(!niveaux||!niveaux.length) return 'P:'+projet;
  return 'G:'+projet+'|'+niveaux.join('|');
}
function isVisible(r){
  if(r._type==='jalon') return true;
  if(r._type==='projet') return false; // _type='projet' n'est plus généré
  if(collapsed[collapseKey(r.projet,[])]) return false;
  const niv=r.niveaux||[];
  if(r._type==='groupe'){
    // niveaux=[p,g1,...] en multi-vue → vérifier à partir de i=1
    // niveaux=[g1,...] en vue simple → vérifier à partir de i=1
    for(let i=1;i<niv.length;i++){
      if(collapsed[collapseKey(r.projet,niv.slice(0,i))]) return false;
    }
    return true;
  }
  if(r._type==='tache'){
    if(multiViewMode){
      // En multi-vue, les clés de collapse sont préfixées par [p]
      // Task niveaux=[g1] → vérifier collapsed['G:p|p'] (projet) et 'G:p|p|g1' (subgroup)
      if(collapsed[collapseKey(r.projet,[r.projet])]) return false;
      for(let i=1;i<=niv.length;i++){
        if(collapsed[collapseKey(r.projet,[r.projet,...niv.slice(0,i)])]) return false;
      }
    } else {
      for(let i=1;i<=niv.length;i++){
        if(collapsed[collapseKey(r.projet,niv.slice(0,i))]) return false;
      }
    }
    return true;
  }
  return true;
}
let cpTarget=null;
cpTarget=null;
let _pptxExportReady = false;
let dataSectionOpen=true;
let navOpen = true;
let navCollapsed = {};
let navFolders = {};  // { clientName: Set<folderName> } — dossiers vides non encore dans portfolio
const NAV_COLORS = ['#EC7206','#284053','#72B6EC','#43e97b','#ff6584','#a29bfe','#fdcb6e','#00b894','#e17055','#6c63ff'];
function navColor(idx){ return NAV_COLORS[idx % NAV_COLORS.length]; }
const _origRenderAll = typeof renderAll !== 'undefined' ? renderAll : null;
let epEditingIdx = null;
let epMode = 'new';
const MAX_NIVEAUX = 5;
let _fbSaveTimer      = null;
let _fbSaving         = false;
let _fbFirmSaveTimer  = null;
let _fbFirmSaving     = false;
let _fbInitLoaded = false;
let _lastSaveTs = 0;
let _tasksDirty = false;         // true si des modifs de tâches non sauvegardées sur Firebase
let _tasksSnapshot = null;       // JSON snapshot du portfolio avant la première modif
let _suppressFirebaseSave = false; // true pour bloquer la synchro Firebase (sauvegarde locale seulement)
let usePlanned = false;            // mode d'affichage global planifié (comme semaine/mois/…)
let jpEditingIdx = null;
let selectedProjectIds = new Set();  // IDs des projets cochés (affichés dans le Gantt)
let multiViewMode = false;           // true quand >1 projet sélectionné
let userWalletClients = new Set();   // Noms de clients chargés dans le portefeuille de l'utilisateur
let currentUserId = null;            // UID Firebase de l'utilisateur connecté
let currentUserEmail = null;         // Email de l'utilisateur connecté (affiché dans les verrous)
let _walletLoaded = false;           // true une fois le wallet utilisateur chargé depuis Firebase

/* ── Verrouillage de projet ── */
let _lockedProjectId     = null;     // ID du projet verrouillé par cet utilisateur
let _lockInactivityTimer = null;     // Timer d'expiration du verrou (10 min)
let _pendingFirebaseUpdate = false;  // Une version plus récente est disponible dans Firebase
let _projectLocks        = {};       // Cache des verrous Firebase { projectId → lockObj }
const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

/* ══════════════════════════════════════════════════════════
   MODÈLE DE DONNÉES — RESSOURCES & AFFECTATIONS
   ══════════════════════════════════════════════════════════

   Chaque tâche (_type==='tache') peut porter :
   ┌─ charge         {number|null}  charge totale prévue (j)  — existant
   ├─ chargePassee   {number|null}  charge déjà consommée (j) — NOUVEAU
   ├─ chargeRestante {number|null}  charge restante (j)       — NOUVEAU
   └─ assignments    {Array}        liste des affectations     — NOUVEAU
        └─ {
             resourceId     {string}       id interne ressource dans l'appli
             resourceNom    {string}       nom affiché "Prénom NOM"
             charge         {number|null}  charge prévue pour cette ressource (j)
             chargePassee   {number|null}  charge passée pour cette ressource (j)
             chargeRestante {number|null}  charge restante pour cette ressource (j)
           }

   Note : chargePassee / chargeRestante peuvent être null si non renseignées
          (tâche créée manuellement sans import XML).
          La charge totale = somme des assignments si ceux-ci existent,
          sinon le champ charge direct.
   ══════════════════════════════════════════════════════════ */

/* Clé de collapse pour le détail ressources d'une tâche (par index de ligne) */
function collapseResKey(rowIdx) {
  return 'RES:' + rowIdx;
}

/* État global des panneaux détail-ressources dépliés */
let collapsedRes = {};

/* Base de conversion heures → jours */
const HEURES_PAR_JOUR = 8;

/**
 * Parse une durée ISO PT MS Project en jours (base HEURES_PAR_JOUR)
 * Ex: "PT22H0M0S" → 2.75 ;  "PT29H31M0S" → 3.69
 * @param {string} str
 * @returns {number|null}
 */
function parsePTtoDays(str) {
  if (!str) return null;
  const m = String(str).match(/PT(\d+)H(\d+)M/);
  if (!m) return null;
  const hours = parseInt(m[1]) + parseInt(m[2]) / 60;
  if (hours <= 0) return 0;
  return Math.round((hours / HEURES_PAR_JOUR) * 10000) / 10000;
}

/**
 * Parse un nom de ressource MS Project "Prénom NOM  - Profession"
 * Règle : les mots entièrement en MAJUSCULES (contigus à la fin) = nom de famille.
 * @param {string} fullName
 * @returns {{ prenom: string, nom: string, profession: string }}
 */
function parseResourceName(fullName) {
  if (!fullName) return { prenom: '', nom: '', profession: '' };
  const dashIdx = fullName.indexOf(' - ');
  const namePart   = dashIdx >= 0 ? fullName.slice(0, dashIdx).trim() : fullName.trim();
  const profession = dashIdx >= 0 ? fullName.slice(dashIdx + 3).trim() : '';

  const parts = namePart.split(/\s+/).filter(Boolean);
  // Remonte depuis la fin tant que les mots sont tout-majuscules → nom de famille
  let nomIdx = parts.length;
  while (nomIdx > 1 && parts[nomIdx - 1] === parts[nomIdx - 1].toUpperCase()
                     && /[A-ZÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ]/.test(parts[nomIdx - 1])) {
    nomIdx--;
  }
  const prenom = parts.slice(0, nomIdx).join(' ');
  const nom    = parts.slice(nomIdx).join(' ');
  return { prenom, nom, profession };
}

/* ── Calcul du lundi de la semaine pour une date donnée ── */
function _weekMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Dim, 1=Lun, …, 6=Sam
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

/* ── Charge passée calculée en temps réel depuis les données journalières GHO ──
   Somme toutes les entrées daily[date] dont la semaine (lundi→dimanche)
   est strictement antérieure à la semaine en cours.
   Retourne null si aucune charge passée trouvée. */
function _chargePasseeFromDaily(daily) {
  if (!daily) return null;
  const currentWeekStart = _weekMonday(new Date()).getTime();
  let total = 0;
  for (const [k, v] of Object.entries(daily)) {
    if (!v || v <= 0) continue;
    const parts = k.split('/');
    if (parts.length !== 3) continue;
    const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    if (_weekMonday(d).getTime() < currentWeekStart) total += v;
  }
  return total > 0 ? Math.round(total * 10000) / 10000 : null;
}
