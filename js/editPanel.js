/**
 * editPanel.js
 * Edit panel for tasks and groups (multi-level niveaux).
 *
 * Handles:
 *   - Dynamic level dropdowns (cascade filtering)
 *   - Tâche → Groupe promotion
 *   - Create / update / delete tasks and groups
 *   - Delete actions triggered from the Gantt chart
 *
 * Depends on: config.js (MAX_NIVEAUX), state.js, utils.js, sort.js,
 *             portfolio.js (saveCurrentProject), ui.js (renderAll)
 */

// ====== EDIT PANEL — NIVEAUX MULTIPLES ======
let epEditingIdx = null;
let epMode = 'new';
const MAX_NIVEAUX = 5;

// Construit les options d'un select de niveau à partir des sélections courantes
function _buildNiveauOptions(i, currentVal){
  const taskRows = rows.filter(r=>r._type==='tache');
  const projet = document.getElementById('epProjet')?.value.trim() || '';
  // Lire les valeurs actuellement sélectionnées pour les niveaux précédents
  const parentVals = [];
  for(let j=0;j<i;j++){
    const v = _getEpNiveauVal(j);
    parentVals.push(v);
  }
  const parentMatch = taskRows.filter(r=>{
    if(projet && r.projet !== projet) return false;
    for(let j=0;j<i;j++){
      if(parentVals[j] && (r.niveaux||[])[j] !== parentVals[j]) return false;
    }
    return true;
  });
  const existingGroupes = [...new Set(parentMatch
    .filter(r=>(r.niveaux||[]).length > i || (r.niveaux||[])[i])
    .map(r=>(r.niveaux||[])[i]||null).filter(Boolean))];
  const existingTaches = [...new Set(parentMatch
    .filter(r=>(r.niveaux||[]).length === i && r.tache)
    .map(r=>r.tache))];
  let opts = `<option value="">— aucun —</option>`;
  if(existingGroupes.length){
    opts += `<optgroup label="Groupes existants">
      ${existingGroupes.map(v=>`<option value="${escH(v)}"${v===currentVal?' selected':''}>${escH(v)}</option>`).join('')}
    </optgroup>`;
  }
  if(existingTaches.length){
    opts += `<optgroup label="Tâches (seront converties en groupe)">
      ${existingTaches.map(v=>`<option value="__TACHE__${escH(v)}"${('__TACHE__'+v)===currentVal?' selected':''}>${escH(v)} ↗</option>`).join('')}
    </optgroup>`;
  }
  if(currentVal && !existingGroupes.includes(currentVal) && !existingTaches.includes(currentVal) && !currentVal.startsWith('__TACHE__')){
    opts += `<option value="${escH(currentVal)}" selected>${escH(currentVal)}</option>`;
  }
  return opts;
}

// Lire la valeur effective d'un niveau (custom > select)
function _getEpNiveauVal(i){
  const custom = document.getElementById(`epNiveauCustom_${i}`);
  const sel = document.getElementById(`epNiveau_${i}`);
  let v = (custom?.value||'').trim() || (sel?.value||'').trim();
  if(v.startsWith('__TACHE__')) v = v.slice(9);
  return v;
}

function renderEpNiveaux(niveaux, isGroupe){
  const container = document.getElementById('epNiveauxContainer');
  if(!container) return;
  let html = '';
  for(let i=0; i<MAX_NIVEAUX; i++){
    const val = (niveaux&&niveaux[i]) ? niveaux[i] : '';
    const label = i===0 ? 'Niveau 1' : `Niveau ${i+1}`;
    const isOpt = !isGroupe || i>0;
    const opts = _buildNiveauOptions(i, val);
    html+=`<div class="ep-group" id="epNivGroup_${i}">
      <label class="ep-label" style="display:flex;align-items:center;justify-content:space-between">
        <span>${label}${isOpt?' <span style="font-weight:400;opacity:.6">(optionnel)</span>':''}</span>
        ${i>0?`<span style="font-size:10px;color:var(--muted);cursor:pointer;padding:2px 4px" onclick="clearEpNiveauFrom(${i})">✕ effacer</span>`:''}
      </label>
      <select class="ep-input" id="epNiveau_${i}" onchange="onEpNiveauChange(${i})" style="appearance:auto">
        ${opts}
      </select>
      <input class="ep-input" id="epNiveauCustom_${i}" type="text"
        placeholder="Ou saisir un nouveau nom…"
        value=""
        style="margin-top:4px;font-size:11px"
        oninput="onEpNiveauCustomChange(${i})">
    </div>`;
  }
  container.innerHTML = html;
}

function onEpNiveauCustomChange(idx){
  const sel = document.getElementById(`epNiveau_${idx}`);
  const custom = document.getElementById(`epNiveauCustom_${idx}`);
  if(custom && custom.value.trim()) sel.value = '';
  // Rafraîchir les niveaux suivants
  _refreshNiveauxFrom(idx+1);
}

function onEpNiveauChange(idx){
  // Vider le champ custom du niveau modifié
  const custom = document.getElementById(`epNiveauCustom_${idx}`);
  if(custom) custom.value = '';
  // Effacer et rafraîchir les niveaux suivants dynamiquement
  _refreshNiveauxFrom(idx+1);
}

// Rafraîchit les options des niveaux à partir de fromIdx (sans changer les valeurs)
function _refreshNiveauxFrom(fromIdx){
  for(let i=fromIdx;i<MAX_NIVEAUX;i++){
    const sel = document.getElementById(`epNiveau_${i}`);
    const custom = document.getElementById(`epNiveauCustom_${i}`);
    if(!sel) continue;
    // Vider la valeur des niveaux suivants (la sélection parente a changé)
    sel.value = '';
    if(custom) custom.value = '';
    // Reconstruire les options
    sel.innerHTML = _buildNiveauOptions(i, '');
  }
}

function clearEpNiveauFrom(idx){
  for(let i=idx;i<MAX_NIVEAUX;i++){
    const sel=document.getElementById(`epNiveau_${i}`);
    const custom=document.getElementById(`epNiveauCustom_${i}`);
    if(sel) sel.value='';
    if(custom) custom.value='';
  }
}

function getEpNiveaux(){
  const niv=[];
  for(let i=0;i<MAX_NIVEAUX;i++){
    const v=_getEpNiveauVal(i);
    if(v) niv.push(v); else break;
  }
  return niv;
}

// Retourne true si le niveau i pointe vers une tâche à convertir
function _epNiveauIsTacheConversion(i){
  const sel=document.getElementById(`epNiveau_${i}`);
  return sel?.value?.startsWith('__TACHE__') || false;
}

function openAddAfter(refRowIdx, e){
  if(e) e.stopPropagation();
  const ref = rows[refRowIdx];
  openEditPanel(null);
  if(!ref){ return; }

  setTimeout(()=>{
    document.getElementById('epProjet').value = ref.projet||'';
    document.getElementById('epTache').value = '';
    document.getElementById('epDebut').value = '';
    document.getElementById('epFin').value = '';
    document.getElementById('epCharge').value = '';
    document.getElementById('epTitle').textContent = '+ Nouvelle tâche';

    // Si c'est une tâche (pas un groupe/projet) : la promouvoir en groupe
    // en ajoutant son nom comme niveau supplémentaire
    if(ref._type === 'tache' && ref.tache){
      const parentNiveaux = ref.niveaux||[];
      if(parentNiveaux.length < MAX_NIVEAUX){
        // La tâche est promue en groupe : on la supprime de rows.
        // Le groupe sera créé automatiquement par sortRows() dès qu'une
        // tâche enfant existera. On garde une copie pour restaurer si annulation.
        window._promotedBackup = {original: ref};
        rows.splice(refRowIdx, 1);
        const newNiveaux = [...parentNiveaux, ref.tache];
        renderEpNiveaux(newNiveaux);
        sortRows(); renderAll();
      } else {
        renderEpNiveaux(ref.niveaux||[]);
      }
    } else {
      renderEpNiveaux(ref.niveaux||[]);
    }

    document.getElementById('epTache').focus();
  }, 30);
}

function openEditPanel(rowIdx){
  epMode = rowIdx === null ? 'new' : 'edit';
  epEditingIdx = rowIdx;
  const panel = document.getElementById('editPanel');
  const title = document.getElementById('epTitle');
  const taskRows = rows.filter(r=>r._type==='tache');

  // Construire les selects Projet et Niveaux
  _epRefreshProjetSelect(taskRows);

  if(epMode==='edit'){
    const r = rows[rowIdx];
    const isGroupe = r._type==='groupe';
    title.textContent = isGroupe ? '✏ Modifier le groupe' : '✏ Modifier la tâche';
    document.getElementById('epProjet').value = r.projet||'';
    // Pour un groupe : les niveaux s'arrêtent au parent (sans le dernier = nom du groupe)
    const niveauxParent = isGroupe ? (r.niveaux||[]).slice(0,-1) : (r.niveaux||[]);
    renderEpNiveaux(niveauxParent, isGroupe);
    // Le champ "Tâche" sert à éditer le nom du groupe
    const nomGroupe = isGroupe ? ((r.niveaux||[]).slice(-1)[0]||'') : (r.tache||'');
    document.getElementById('epTache').value = nomGroupe;
    document.getElementById('epDebut').value = toInput(r.debut);
    document.getElementById('epFin').value = toInput(r.fin);
    document.getElementById('epCharge').value = r.charge!==null?r.charge:'';
    document.getElementById('epDeleteBtn').style.display='block';
    _epSetTacheRequired(true, isGroupe);
  } else {
    title.textContent = '+ Nouvelle tâche';
    const last = taskRows[taskRows.length-1];
    document.getElementById('epProjet').value = last?last.projet:'';
    renderEpNiveaux(last?(last.niveaux||[]):[], false);
    document.getElementById('epTache').value = '';
    document.getElementById('epDebut').value = '';
    document.getElementById('epFin').value = '';
    document.getElementById('epCharge').value = '';
    document.getElementById('epDeleteBtn').style.display='none';
    _epSetTacheRequired(true);
  }
  panel.classList.add('open');
  setTimeout(()=>document.getElementById('epTache').focus(), 230);
}

function _epSetTacheRequired(required, isGroupe){
  const el = document.getElementById('epTache');
  const lbl = document.getElementById('epTacheLabel');
  if(el){
    el.placeholder = isGroupe ? 'Nom du groupe' : 'Description de la tâche';
    el.dataset.required = required ? '1' : '0';
    el.dataset.isgroupe = isGroupe ? '1' : '0';
  }
  if(lbl) lbl.textContent = isGroupe ? 'Nom du groupe' : 'Tâche';
}

function _epRefreshProjetSelect(taskRows){
  const projets = [...new Set((taskRows||rows.filter(r=>r._type==='tache')).map(r=>r.projet))];
  document.getElementById('epProjetList').innerHTML = projets.map(p=>`<option value="${escH(p)}">`).join('');
}

function closeEditPanel(){
  document.getElementById('editPanel').classList.remove('open');
  epEditingIdx=null;
  // Si l'utilisateur annule après une promotion, restaurer la tâche originale
  if(window._promotedBackup){
    rows.push(window._promotedBackup.original);
    window._promotedBackup = null;
    sortRows(); renderAll();
  }
}

function saveEditPanel(){
  const p=document.getElementById('epProjet').value.trim();
  const niveaux=getEpNiveaux();
  const t=document.getElementById('epTache').value.trim();
  // Promouvoir les tâches sélectionnées comme groupe avant de sauvegarder
  for(let i=0;i<MAX_NIVEAUX;i++){
    if(_epNiveauIsTacheConversion(i)){
      const nomTache=niveaux[i]; // déjà nettoyé par getEpNiveaux
      // Trouver la tâche correspondante et la promouvoir
      const tacheIdx=rows.findIndex(r=>
        r._type==='tache' && r.projet===p &&
        (r.niveaux||[]).length===i && r.tache===nomTache
      );
      if(tacheIdx>=0){
        // Supprimer la tâche — elle devient un groupe (recréé par sortRows)
        rows.splice(tacheIdx, 1);
        // Ajuster epEditingIdx si nécessaire
        if(epEditingIdx !== null && tacheIdx < epEditingIdx) epEditingIdx--;
      }
    }
  }
  const d=document.getElementById('epDebut').value;
  const f=document.getElementById('epFin').value;
  const c=document.getElementById('epCharge').value;
  // Validation visuelle — tâche optionnelle si groupe
  const tacheEl = document.getElementById('epTache');
  const tacheRequired = tacheEl?.dataset.required !== '0';
  const requiredFields = tacheRequired ? ['epProjet','epTache','epDebut','epFin'] : ['epProjet','epDebut','epFin'];
  let hasError = false;
  requiredFields.forEach(id => {
    const el = document.getElementById(id);
    if(el && !el.value.trim()){
      el.style.borderColor = '#e17055';
      el.style.background  = '#e1705510';
      el.addEventListener('input', () => {
        el.style.borderColor = '';
        el.style.background  = '';
      }, {once: true});
      hasError = true;
    }
  });
  if(!p)            { document.getElementById('epProjet').focus(); }
  else if(!t && tacheRequired) { document.getElementById('epTache').focus(); }
  else if(!d)       { document.getElementById('epDebut').focus(); }
  else if(!f)       { document.getElementById('epFin').focus(); }
  if(hasError) return;
  const tacheEl2 = document.getElementById('epTache');
  const isGroupeEdit = tacheEl2?.dataset.isgroupe === '1';
  let newRow;
  if(isGroupeEdit){
    // Pour un groupe : le champ tache contient le nouveau nom du groupe (dernier niveau)
    const nouveauNom = t;
    if(!nouveauNom){ document.getElementById('epTache').focus(); return; }
    const newNiveaux = [...niveaux, nouveauNom];
    // Retrouver les tâches enfants de l'ancien groupe et les rebaser
    const r = epEditingIdx !== null ? rows[epEditingIdx] : null;
    const oldNiveaux = r?.niveaux||[];
    // Mettre à jour toutes les tâches enfants
    rows = rows.map(row=>{
      if(row._type!=='tache' || row.projet!==p) return row;
      const rn = row.niveaux||[];
      if(rn.length>=oldNiveaux.length && oldNiveaux.every((n,i)=>rn[i]===n)){
        return {...row, niveaux:[...newNiveaux,...rn.slice(oldNiveaux.length)]};
      }
      return row;
    });
    sortRows(); renderAll(); saveCurrentProject();
    window._promotedBackup = null;
    closeEditPanel();
    return;
  } else {
    newRow={_type:'tache',projet:p,niveaux,tache:t||null,debut:parseDate(d),fin:parseDate(f),charge:c!==''?parseFloat(c.replace(',','.')):null};
  }
  if(epMode==='edit'&&epEditingIdx!==null) rows[epEditingIdx]=newRow;
  else rows.push(newRow);
  window._promotedBackup = null; // Promotion confirmée, pas de restauration
  closeEditPanel();
  sortRows();
  renderAll();
  saveCurrentProject();
}

function deleteFromPanel(){
  if(epEditingIdx===null)return;
  const r=rows[epEditingIdx];
  if(!confirm(`Supprimer "${r.tache||r.projet}" ?`))return;
  rows.splice(epEditingIdx,1);
  rows=rows.filter(r=>r._type==='tache');
  sortRows();
  closeEditPanel();
  renderAll();
  saveCurrentProject();
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeEditPanel();
});

// ── Delete actions from the Gantt chart ──────────────────────────────────────

// ====== SUPPRESSION DEPUIS LE GANTT ======
function deleteGanttTache(e, idx){
  e.stopPropagation();
  const realIdx = parseInt(idx);
  const r = rows[realIdx];
  if(!r || r._type !== 'tache') return;
  if(!confirm('Supprimer la tâche "' + (r.tache || r.projet) + '" ?')) return;
  rows.splice(realIdx, 1);
  rows = rows.filter(x => x._type === 'tache');
  sortRows(); renderAll(); saveCurrentProject();
}
function deleteGanttGroupe(e, projet, niveauxJson){
  e.stopPropagation();
  let niveaux;
  try { niveaux = JSON.parse(niveauxJson); } catch(ex){ niveaux=[niveauxJson]; }
  const nomGroupe = niveaux[niveaux.length-1] || 'groupe';

  // Modale personnalisée avec 3 choix
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif';
  modal.innerHTML = `
    <div style="background:var(--surface);border-top:4px solid #e17055;border-radius:8px;padding:24px 28px;max-width:420px;width:90%;box-shadow:0 12px 40px rgba(0,0,0,.35)">
      <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px">🗑 Supprimer "${escH(nomGroupe)}"</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:20px">Que voulez-vous faire avec les tâches enfants ?</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button id="dgBtnAll" style="text-align:left;padding:10px 14px;border:1px solid #e17055;border-radius:6px;background:#e1705510;color:var(--text);font-size:12px;font-weight:600;cursor:pointer">
          🗑 Supprimer le groupe <strong>et tous ses enfants</strong>
        </button>
        <button id="dgBtnUp" style="text-align:left;padding:10px 14px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--text);font-size:12px;font-weight:600;cursor:pointer">
          ↑ Supprimer le groupe et <strong>remonter les enfants</strong> d'un niveau
        </button>
        <button id="dgBtnCancel" style="padding:8px 14px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--muted);font-size:12px;cursor:pointer">
          Annuler
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  // Vérifie si une tâche appartient à ce groupe ou à un sous-groupe
  function isInGroup(r){
    if(r._type !== 'tache' || r.projet !== projet) return false;
    const rNiv = r.niveaux||[];
    if(rNiv.length < niveaux.length) return false;
    return niveaux.every((n,i) => rNiv[i] === n);
  }

  modal.querySelector('#dgBtnAll').onclick = () => {
    modal.remove();
    rows = rows.filter(r => !isInGroup(r));
    sortRows(); renderAll(); saveCurrentProject();
  };

  modal.querySelector('#dgBtnUp').onclick = () => {
    modal.remove();
    rows = rows.map(r => {
      if(!isInGroup(r)) return r;
      // Remonter d'un niveau : retirer le dernier niveau du chemin du groupe
      const rNiv = r.niveaux||[];
      const newNiv = [...niveaux.slice(0,-1), ...rNiv.slice(niveaux.length)];
      return {...r, niveaux: newNiv};
    });
    sortRows(); renderAll(); saveCurrentProject();
  };

  modal.querySelector('#dgBtnCancel').onclick = () => modal.remove();
  modal.onclick = ev => { if(ev.target===modal) modal.remove(); };
}
function deleteGanttProjet(e, projet){
  e.stopPropagation();
  if(!confirm('Supprimer le projet "' + projet + '" et toutes ses tâches ?')) return;
  rows = rows.filter(r => !(r._type === 'tache' && r.projet === projet));
  sortRows(); renderAll(); saveCurrentProject();
}