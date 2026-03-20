import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
const firebaseConfig = {
  apiKey: "AIzaSyDLpk2xBs-R9gM-tvKZ5abG-EaGNqKUGLk",
  authDomain: "cad-project-manager.firebaseapp.com",
  databaseURL: "https://cad-project-manager-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cad-project-manager",
  storageBucket: "cad-project-manager.firebasestorage.app",
  messagingSenderId: "1005597262191",
  appId: "1:1005597262191:web:86901f88aecbd9ed30689a"
};
const _fbApp = initializeApp(firebaseConfig);
const _fbDb  = getDatabase(_fbApp);
const _fbRef = ref(_fbDb, 'gantt_portfolio');
window._fbSet     = (data) => set(_fbRef, data);
window._fbOnValue = (cb)   => onValue(_fbRef, snap => cb(snap.val()));
