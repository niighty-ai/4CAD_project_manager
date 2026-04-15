import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue, get, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDLpk2xBs-R9gM-tvKZ5abG-EaGNqKUGLk",
  authDomain: "cad-project-manager.firebaseapp.com",
  databaseURL: "https://cad-project-manager-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cad-project-manager",
  storageBucket: "cad-project-manager.firebasestorage.app",
  messagingSenderId: "1005597262191",
  appId: "1:1005597262191:web:86901f88aecbd9ed30689a"
};

const _fbApp  = initializeApp(firebaseConfig);
const _fbDb   = getDatabase(_fbApp);
const _fbAuth = getAuth(_fbApp);

const _fbRef     = ref(_fbDb, 'gantt_portfolio');
const _fbResRef  = ref(_fbDb, 'gantt_resources');
const _fbGhoRef  = ref(_fbDb, 'gantt_gho');
const _fbFirmRef = ref(_fbDb, 'gantt_portfolio_firm');

window._fbSet              = (data) => set(_fbRef,    data);
window._fbOnValue          = (cb)   => onValue(_fbRef,    snap => cb(snap.val()));
window._fbSetResources     = (data) => set(_fbResRef, data);
window._fbOnValueResources = (cb)   => onValue(_fbResRef, snap => cb(snap.val()));
window._fbSetGho           = (data) => set(_fbGhoRef, data);
window._fbOnValueGho       = (cb)   => onValue(_fbGhoRef, snap => cb(snap.val()));
window._fbSetFirm          = (data) => set(_fbFirmRef, data);
window._fbOnValueFirm      = (cb)   => onValue(_fbFirmRef, snap => cb(snap.val()));

window._fbAuth         = _fbAuth;
window._fbSignIn       = (email, pw) => signInWithEmailAndPassword(_fbAuth, email, pw);
window._fbSignOut      = () => signOut(_fbAuth);
window._fbOnAuthChange = (cb) => onAuthStateChanged(_fbAuth, cb);

/* ── Portefeuille utilisateur (par UID) ── */
window._fbSetUserWallet = (userId, data) => set(ref(_fbDb, 'user_wallets/' + userId), data);
window._fbOnUserWallet  = (userId, cb)   => onValue(ref(_fbDb, 'user_wallets/' + userId), snap => cb(snap.val()));

/* ── Lecture unique du portfolio (pour refresh forcé) ── */
window._fbGetPortfolio = (cb) =>
  get(_fbRef).then(snap => cb(snap.val())).catch(() => cb(null));

/* ── Verrous de projet (project_locks/{projectId}) ──
   Chaque verrou : { userId, userDisplayName, lockedAt, expiresAt }
   onDisconnect supprime automatiquement le verrou en cas de perte de connexion. */
window._fbAcquireLock = async (projectId, lockData) => {
  const lockRef = ref(_fbDb, 'project_locks/' + projectId);
  await set(lockRef, lockData);
  onDisconnect(lockRef).remove();
};
window._fbReleaseLock = (projectId) =>
  remove(ref(_fbDb, 'project_locks/' + projectId));
window._fbOnLocks = (cb) =>
  onValue(ref(_fbDb, 'project_locks'), snap => cb(snap.val() || {}));
window._fbGetLock = (projectId) =>
  get(ref(_fbDb, 'project_locks/' + projectId))
    .then(snap => snap.val())
    .catch(() => null);

/* ── Positions du calendrier (par UID) ──
   Les clés d'événements contiennent des caractères spéciaux (| /) non admis
   par Firebase RTDB. On sérialise donc l'objet entier en JSON dans un champ "d". */
window._fbSetCalPositions = (userId, data) =>
  set(ref(_fbDb, 'calendar_positions/' + userId), { d: JSON.stringify(data) });

window._fbGetCalPositions = (userId, cb) =>
  get(ref(_fbDb, 'calendar_positions/' + userId))
    .then(snap => {
      try { const v = snap.val(); cb(v?.d ? JSON.parse(v.d) : null); }
      catch(e) { cb(null); }
    })
    .catch(() => cb(null));
