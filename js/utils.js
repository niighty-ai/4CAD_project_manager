/**
 * utils.js
 * Pure helper functions — no DOM access, no side effects.
 * Depends on: config.js (PALETTE), state.js (projectColors)
 */

// ── Date utilities ────────────────────────────────────────────────────────────

// ====== JOURS FÉRIÉS FRANÇAIS ======
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

// ====== UTILS ======
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
function diff(a,b){return Math.round((b-a)/86400000);}
function escH(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
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

// ── Color ─────────────────────────────────────────────────────────────────────

function navColor(idx) { return NAV_COLORS[idx % NAV_COLORS.length]; }
