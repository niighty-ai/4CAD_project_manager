import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, update, onValue, get, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
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

/* ── Dossiers utilisateur (par UID) — stockés en JSON pour éviter les restrictions sur les clés Firebase ── */
window._fbSetUserFolders = (userId, data) =>
  set(ref(_fbDb, 'user_folders/' + userId), { d: JSON.stringify(data) });
window._fbOnUserFolders  = (userId, cb)   =>
  onValue(ref(_fbDb, 'user_folders/' + userId), snap => {
    try { const v = snap.val(); cb(v && v.d ? JSON.parse(v.d) : null); }
    catch(e) { cb(null); }
  });

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

/* ── Données To Do par utilisateur ── */
window._fbSetTodoData = (userId, data) =>
  set(ref(_fbDb, 'todo_data/' + userId), { d: JSON.stringify(data) });
window._fbOnTodoData = (userId, cb) =>
  onValue(ref(_fbDb, 'todo_data/' + userId), snap => {
    try { const v = snap.val(); cb(v?.d ? JSON.parse(v.d) : null); }
    catch(e) { cb(null); }
  });

/* ── Tâches partagées entre utilisateurs ── */
window._fbSetSharedTask = (taskId, data) =>
  set(ref(_fbDb, 'todo_shared/' + taskId), { d: JSON.stringify(data) });
window._fbRemoveSharedTask = (taskId) =>
  remove(ref(_fbDb, 'todo_shared/' + taskId));
window._fbGetSharedTask = (taskId, cb) =>
  get(ref(_fbDb, 'todo_shared/' + taskId))
    .then(snap => {
      try { const v = snap.val(); cb(v?.d ? JSON.parse(v.d) : null); }
      catch(e) { cb(null); }
    }).catch(() => cb(null));

/* Encode l'email en clé Firebase valide : '.' → ',' et '@' → '-' */
function _fbEncodeKey(email) {
  return (email || '').replace(/\./g, ',').replace(/@/g, '-');
}

/* ── Références de partage par utilisateur ── */
window._fbSetTodoShares = (userId, refs) =>
  set(ref(_fbDb, 'todo_shares/' + _fbEncodeKey(userId)), refs || null);
window._fbOnTodoShares = (userId, cb) =>
  onValue(ref(_fbDb, 'todo_shares/' + _fbEncodeKey(userId)), snap => cb(snap.val() || {}));

/* Ajoute des entrées dans les références de partage (set individuel par entrée) */
window._fbAddTodoShares = (userId, newRefs) => {
  const key = _fbEncodeKey(userId);
  return Promise.all(
    Object.keys(newRefs).map(taskId =>
      set(ref(_fbDb, 'todo_shares/' + key + '/' + taskId), newRefs[taskId])
    )
  );
};

/* Supprime une référence de partage spécifique */
window._fbRemoveTodoShare = (userId, taskId) =>
  remove(ref(_fbDb, 'todo_shares/' + _fbEncodeKey(userId) + '/' + taskId));

/* Écoute de toutes les tâches partagées (accès admin) */
window._fbOnAllSharedTasks = (cb) =>
  onValue(ref(_fbDb, 'todo_shared'), snap => {
    const val = snap.val() || {};
    const tasks = [];
    Object.values(val).forEach(v => {
      try { if (v?.d) tasks.push(JSON.parse(v.d)); } catch(e) {}
    });
    cb(tasks);
  });

/* Écoute des tâches partagées filtrées par email destinataire */
window._fbOnSharedTasksForEmail = (email, cb) =>
  onValue(ref(_fbDb, 'todo_shared'), snap => {
    const val = snap.val() || {};
    const tasks = [];
    Object.values(val).forEach(v => {
      try {
        if (v?.d) {
          const t = JSON.parse(v.d);
          if (Array.isArray(t.sharedWith) && t.sharedWith.includes(email)) tasks.push(t);
        }
      } catch(e) {}
    });
    cb(tasks);
  });

/* Écoute des modifications apportées par les destinataires sur les tâches de l'owner */
window._fbOnMySharedTasks = (ownerEmail, cb) =>
  onValue(ref(_fbDb, 'todo_shared'), snap => {
    const val = snap.val() || {};
    const tasks = [];
    Object.values(val).forEach(v => {
      try {
        if (v?.d) {
          const t = JSON.parse(v.d);
          if (t.createdBy === ownerEmail) tasks.push(t);
        }
      } catch(e) {}
    });
    cb(tasks);
  });

/* ── Notifications en temps réel (clé = email encodé) ── */
window._fbWriteNotif = (userKey, notif) =>
  set(ref(_fbDb, 'notifications/' + userKey + '/' + notif.id), notif);

window._fbOnNotifs = (userKey, cb) =>
  onValue(ref(_fbDb, 'notifications/' + userKey), snap => {
    const val = snap.val() || {};
    cb(Object.values(val));
  });

window._fbMarkNotifRead = (userKey, notifId) =>
  update(ref(_fbDb, 'notifications/' + userKey + '/' + notifId), {
    read: true, readAt: new Date().toISOString()
  });

window._fbDeleteNotif = (userKey, notifId) =>
  remove(ref(_fbDb, 'notifications/' + userKey + '/' + notifId));

/* ── Préférences de notification ── */
window._fbGetNotifPrefs = (userKey, cb) =>
  get(ref(_fbDb, 'notification_prefs/' + userKey))
    .then(snap => cb(snap.val()))
    .catch(() => cb(null));

window._fbSetNotifPrefs = (userKey, prefs) =>
  set(ref(_fbDb, 'notification_prefs/' + userKey), prefs);
