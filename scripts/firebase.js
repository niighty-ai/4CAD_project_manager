import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
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

const _fbRef    = ref(_fbDb, 'gantt_portfolio');
const _fbResRef = ref(_fbDb, 'gantt_resources');
const _fbGhoRef = ref(_fbDb, 'gantt_gho');

window._fbSet              = (data) => set(_fbRef,    data);
window._fbOnValue          = (cb)   => onValue(_fbRef,    snap => cb(snap.val()));
window._fbSetResources     = (data) => set(_fbResRef, data);
window._fbOnValueResources = (cb)   => onValue(_fbResRef, snap => cb(snap.val()));
window._fbSetGho           = (data) => set(_fbGhoRef, data);
window._fbOnValueGho       = (cb)   => onValue(_fbGhoRef, snap => cb(snap.val()));

window._fbAuth         = _fbAuth;
window._fbSignIn       = (email, pw) => signInWithEmailAndPassword(_fbAuth, email, pw);
window._fbSignOut      = () => signOut(_fbAuth);
window._fbOnAuthChange = (cb) => onAuthStateChanged(_fbAuth, cb);
