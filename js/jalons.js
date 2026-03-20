/**
 * jalons.js
 * Milestone (jalon) CRUD panel.
 *
 * A jalon = { _type: 'jalon', projet, nom, date, couleur? }
 * Jalons are stored in proj.jalons[] (separate from proj.rows tasks).
 *
 * Depends on: state.js, utils.js (parseDate, toInput, escH, fmtD),
 *             sort.js (sortRows), portfolio.js (saveCurrentProject),
 *             ui.js (renderAll)
 */

// ====== JALONS ======
let jpEditingIdx = null;

function openJalonPanel(idx){
  jpEditingIdx = (idx !== undefined && idx !== null) ? idx : null;
  const panel = document.getElementById('jalonPanel');
  const title = document.getElementById('jpTitle');
  const delBtn = document.getElementById('jpDeleteBtn');
  // Remplir datalist projets
  const projets = [...new Set(rows.filter(r=>r._type==='tache').map(r=>r.projet))];
  document.getElementById('jpProjetList').innerHTML = projets.map(p=>`<option value="${escH(p)}">`).join('');
  if(jpEditingIdx !== null){
    const r = rows[jpEditingIdx];
    title.textContent = '◆ Modifier le jalon';
    document.getElementById('jpProjet').value = r.projet||'';
    document.getElementById('jpNom').value = r.nom||'';
    document.getElementById('jpDate').value = toInput(r.date);
    delBtn.style.display = 'block';
  } else {
    title.textContent = '◆ Nouveau jalon';
    // Pré-remplir avec le projet actif
    const lastProjet = rows.filter(r=>r._type==='projet')[0]?.projet||'';
    document.getElementById('jpProjet').value = lastProjet;
    document.getElementById('jpNom').value = '';
    document.getElementById('jpDate').value = '';
    delBtn.style.display = 'none';
  }
  document.getElementById('editPanel').classList.remove('open');
  panel.classList.add('open');
  setTimeout(()=>document.getElementById('jpNom').focus(), 230);
}

function closeJalonPanel(){
  document.getElementById('jalonPanel').classList.remove('open');
  jpEditingIdx = null;
}

function saveJalonPanel(){
  const projet = document.getElementById('jpProjet').value.trim();
  const nom = document.getElementById('jpNom').value.trim();
  const dateVal = document.getElementById('jpDate').value;
  let hasError = false;
  ['jpProjet','jpNom','jpDate'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el.value.trim()){
      el.style.borderColor='#e17055'; el.style.background='#e1705510';
      el.addEventListener('input',()=>{el.style.borderColor='';el.style.background='';},{once:true});
      hasError=true;
    }
  });
  if(hasError){
    if(!projet) document.getElementById('jpProjet').focus();
    else if(!nom) document.getElementById('jpNom').focus();
    else document.getElementById('jpDate').focus();
    return;
  }
  const jalon = {_type:'jalon', projet, nom, date: parseDate(dateVal)};
  if(jpEditingIdx !== null) rows[jpEditingIdx] = jalon;
  else rows.push(jalon);
  closeJalonPanel();
  sortRows(); renderAll(); saveCurrentProject();
}

function deleteJalon(){
  if(jpEditingIdx === null) return;
  if(!confirm(`Supprimer le jalon "${rows[jpEditingIdx]?.nom}" ?`)) return;
  rows.splice(jpEditingIdx, 1);
  closeJalonPanel();
  sortRows(); renderAll(); saveCurrentProject();
}

function deleteJalonDirect(idx){
  const r = rows[idx];
  if(!r || r._type !== 'jalon') return;
  if(!confirm(`Supprimer le jalon "${r.nom}" ?`)) return;
  rows.splice(idx, 1);
  sortRows(); renderAll(); saveCurrentProject();
}

document.addEventListener('keydown', e=>{
  if(e.key==='Escape') closeJalonPanel();
});