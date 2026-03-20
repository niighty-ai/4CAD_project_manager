/* =========================================
   DATA.JS — Gestion des données
   Tri, portfolio CRUD, import/export, Firebase sync
   ========================================= */

// ── Tri des lignes ──

function sortRows() {
  rows.forEach(r => {
    if (r._type === 'tache' && r.groupe !== undefined && !r.niveaux) {
      r.niveaux = r.groupe ? [r.groupe] : [];
      delete r.groupe;
    }
    if (r._type === 'tache' && !r.niveaux) r.niveaux = [];
  });

  const jalons = rows.filter(r => r._type === 'jalon');
  const tasks = rows.filter(r => r._type === 'tache');
  const sorted = [];

  function sortLevel(taskList, projet, niveauxPath, depth) {
    if (depth === 0) {
      const pMin = new Date(Math.min(...taskList.map(r => r.debut.getTime())));
      const pMax = new Date(Math.max(...taskList.map(r => r.fin.getTime())));
      const pCharge = taskList.reduce((s, r) => s + (r.charge || 0), 0);
      sorted.push({ _type:'projet', projet, niveaux:[], tache:null, debut:pMin, fin:pMax, charge:pCharge });
    }
    const noMore = taskList.filter(r => !r.niveaux[depth]);
    const withMore = taskList.filter(r => r.niveaux[depth]);
    const groupNames = [...new Set(withMore.map(r => r.niveaux[depth]))];
    const groupMeta = groupNames.map(g => {
      const gT = withMore.filter(r => r.niveaux[depth] === g);
      const gMin = new Date(Math.min(...gT.map(r => r.debut.getTime())));
      const gMax = new Date(Math.max(...gT.map(r => r.fin.getTime())));
      const gCharge = gT.reduce((s, r) => s + (r.charge || 0), 0);
      return { g, gT, gMin, gMax, gCharge };
    });
    const items = [
      ...noMore.map(r => ({ type:'tache', date:r.debut, r })),
      ...groupMeta.map(m => ({ type:'groupe', date:m.gMin, m }))
    ].sort((a, b) => a.date - b.date);

    items.forEach(item => {
      if (item.type === 'tache') {
        sorted.push({ ...item.r, _type:'tache' });
      } else {
        const { g, gT, gMin, gMax, gCharge } = item.m;
        const nPath = [...niveauxPath, g];
        sorted.push({ _type:'groupe', projet, niveaux:nPath, tache:null, debut:gMin, fin:gMax, charge:gCharge, _depth:depth+1 });
        sortLevel(gT, projet, nPath, depth + 1);
      }
    });
  }

  const projOrder = [...new Set(tasks.map(r => r.projet))].sort((a, b) => {
    return Math.min(...tasks.filter(r => r.projet === a).map(r => r.debut.getTime()))
         - Math.min(...tasks.filter(r => r.projet === b).map(r => r.debut.getTime()));
  });

  projOrder.forEach(p => {
    sortLevel(tasks.filter(r => r.projet === p), p, [], 0);
  });

  const final = [];
  let i = 0;
  while (i < sorted.length) {
    const r = sorted[i];
    if (r._type === 'projet') {
      const projet = r.projet;
      const bloc = [];
      while (i < sorted.length && sorted[i].projet === projet) {
        bloc.push(sorted[i++]);
      }
      const jProjet = jalons.filter(j => j.projet === projet).sort((a, b) => (a.date || 0) - (b.date || 0));
      let ji = 0;
      for (const row of bloc) {
        const lineDate = row.debut || null;
        while (ji < jProjet.length && lineDate && jProjet[ji].date <= lineDate) {
          final.push(jProjet[ji++]);
        }
        final.push(row);
      }
      while (ji < jProjet.length) final.push(jProjet[ji++]);
    } else {
      final.push(sorted[i++]);
    }
  }

  const projetsExistants = new Set(tasks.map(r => r.projet));
  jalons.filter(j => !projetsExistants.has(j.projet))
    .sort((a, b) => (a.date || 0) - (b.date || 0))
    .forEach(j => final.push(j));

  rows = final;
}

// ── Portfolio CRUD ──

function savePortfolio() {
  const data = portfolio.map(p => ({
    id: p.id, name: p.name, client: p.client || '',
    rows: p.rows
      .filter(r => r._type !== 'jalon')
      .map(r => ({ ...r, debut: r.debut ? r.debut.toISOString() : null, fin: r.fin ? r.fin.toISOString() : null })),
    jalons: (p.jalons || []).map(j => ({ ...j, date: j.date ? j.date.toISOString() : null })),
    projectColors: p.projectColors || {},
    collapsed: p.collapsed || {}
  }));
  scheduleFirebaseSave(data);
}

function loadPortfolio() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    portfolio = data.map(p => ({
      ...p,
      client: p.client || '',
      rows: (p.rows || []).filter(r => r._type !== 'jalon').map(r => ({ ...r, debut: r.debut ? new Date(r.debut) : null, fin: r.fin ? new Date(r.fin) : null })),
      jalons: (p.jalons || []).map(j => ({ ...j, date: j.date ? new Date(j.date) : null }))
    }));
    return portfolio.length > 0;
  } catch (e) { return false; }
}

function saveCurrentProject() {
  if (!activeProjectId) return;
  const proj = portfolio.find(p => p.id === activeProjectId);
  if (proj) {
    proj.rows = rows.filter(r => r._type === 'tache').map(r => ({ ...r }));
    proj.jalons = rows.filter(r => r._type === 'jalon').map(r => ({ ...r }));
    proj.projectColors = { ...projectColors };
    proj.collapsed = { ...collapsed };
    savePortfolio();
  }
}

function createNewProjectPrompt() {
  const clients = [...new Set(portfolio.map(p => p.client || '').filter(Boolean))];
  let clientName = '';
  if (clients.length > 0) {
    const list = clients.map((c, i) => `${i+1}. ${c}`).join('\n');
    const input = prompt(`Client pour ce Gantt :\n${list}\n\nEntrez le numéro ou un nouveau nom :`);
    if (input === null) return;
    const num = parseInt(input);
    clientName = (!isNaN(num) && num >= 1 && num <= clients.length) ? clients[num-1] : input.trim();
  } else {
    clientName = prompt('Nom du client :') || '';
  }
  createNewProject('Nouveau projet', [], {}, clientName);
}

function createNewProject(name, initialRows, initialColors, client) {
  const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const proj = {
    id,
    name: name || 'Nouveau projet ' + (portfolio.length + 1),
    client: client || '',
    rows: initialRows || [],
    projectColors: initialColors || {},
    collapsed: {}
  };
  portfolio.push(proj);
  savePortfolio();
  renderNavList();
  switchToProject(id);
}

function switchToProject(id) {
  if (activeProjectId) {
    const cur = portfolio.find(p => p.id === activeProjectId);
    if (cur) {
      cur.rows = rows.filter(r => r._type === 'tache').map(r => ({ ...r }));
      cur.jalons = rows.filter(r => r._type === 'jalon').map(r => ({ ...r }));
      cur.projectColors = { ...projectColors };
      cur.collapsed = { ...collapsed };
    }
    savePortfolio();
  }
  activeProjectId = id;
  const proj = portfolio.find(p => p.id === id);
  if (!proj) return;
  rows = [
    ...proj.rows.filter(r => r._type === 'tache').map(r => ({ ...r })),
    ...(proj.jalons || []).map(r => ({ ...r }))
  ];
  projectColors = { ...proj.projectColors };
  collapsed = { ...proj.collapsed };
  sortRows();
  document.getElementById('activeProjectName').textContent = proj.name;
  renderNavList();
  renderAll();
}

function deleteProject(id, e) {
  e.stopPropagation();
  const proj = portfolio.find(p => p.id === id);
  if (!proj) return;
  if (!confirm(`Supprimer le projet "${proj.name}" ?`)) return;
  portfolio = portfolio.filter(p => p.id !== id);
  savePortfolio();
  if (activeProjectId === id) {
    activeProjectId = null;
    rows = []; projectColors = {}; collapsed = {};
    document.getElementById('activeProjectName').textContent = '—';
    if (portfolio.length > 0) switchToProject(portfolio[0].id);
    else renderAll();
  }
  renderNavList();
}

function duplicateProject(id, e) {
  e.stopPropagation();
  const proj = portfolio.find(p => p.id === id);
  if (!proj) return;
  if (activeProjectId === id) {
    proj.rows = [...rows]; proj.projectColors = { ...projectColors }; proj.collapsed = { ...collapsed };
  }
  const newId = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const copy = {
    id: newId,
    name: proj.name + ' (copie)',
    rows: proj.rows.map(r => ({ ...r })),
    projectColors: { ...proj.projectColors },
    collapsed: { ...proj.collapsed }
  };
  portfolio.push(copy);
  savePortfolio();
  renderNavList();
  switchToProject(newId);
}

// ── Import Excel ──

function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Auto-rename project if needed
  if (activeProjectId) {
    const proj = portfolio.find(p => p.id === activeProjectId);
    if (proj && proj.name.startsWith('Nouveau projet')) {
      const name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
      proj.name = name;
      document.getElementById('activeProjectName').textContent = name;
      savePortfolio();
      renderNavList();
    }
  }

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const wb = XLSX.read(ev.target.result, { type:'array', cellDates:false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header:1, raw:true });
      let hr = 0;
      for (let i = 0; i < Math.min(5, data.length); i++) {
        const r = data[i].map(c => String(c || '').toLowerCase());
        if (r.some(c => c.includes('projet') || c.includes('tach') || c.includes('but'))) { hr = i; break; }
      }
      const hdrs = data[hr].map(c => String(c || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      const ci = {
        type: hdrs.findIndex(h => h === 'type' || h.includes('type')),
        projet: hdrs.findIndex(h => h.includes('projet')),
        tache: hdrs.findIndex(h => h.includes('tach') || h.includes('nom')),
        debut: hdrs.findIndex(h => h.includes('debut') || h.includes('but') || h === 'debut'),
        fin: hdrs.findIndex(h => h === 'fin' || h.includes('fin')),
        charge: hdrs.findIndex(h => h.includes('charge')),
        niveaux: [1,2,3,4,5].map(n => hdrs.findIndex(h =>
          h === `niveau${n}` || h === `niveau_${n}` || h === `niveau ${n}` ||
          h === `n${n}` || h === `level${n}` || h === `level ${n}` ||
          (n === 1 && (h.includes('groupe') || h.includes('group')))
        ))
      };
      rows = [];
      for (let i = hr + 1; i < data.length; i++) {
        const r = data[i]; if (!r || !r[ci.projet]) continue;
        const typeVal = ci.type >= 0 && r[ci.type] ? String(r[ci.type]).toLowerCase().trim() : '';
        const isJalon = typeVal === 'jalon' || typeVal === 'milestone' || typeVal === 'j';
        const nomVal = ci.tache >= 0 && r[ci.tache] ? String(r[ci.tache]).trim() : null;
        if (isJalon) {
          const d = ci.debut >= 0 ? parseDate(r[ci.debut]) : null;
          if (!d || isNaN(d)) continue;
          rows.push({ _type:'jalon', projet:String(r[ci.projet]).trim(), nom:nomVal || '', date:d });
          continue;
        }
        const d = ci.debut >= 0 ? parseDate(r[ci.debut]) : null;
        const f = ci.fin >= 0 ? parseDate(r[ci.fin]) : null;
        if (!d || !f || isNaN(d) || isNaN(f)) continue;
        let ch = ci.charge >= 0 ? r[ci.charge] : null;
        if (ch !== null) { ch = parseFloat(String(ch).replace(',', '.')); if (isNaN(ch)) ch = null; }
        const niveaux = [];
        for (const idx of ci.niveaux) {
          if (idx >= 0 && r[idx] && String(r[idx]).trim()) niveaux.push(String(r[idx]).trim());
          else break;
        }
        rows.push({ _type:'tache', projet:String(r[ci.projet]).trim(), niveaux, tache:nomVal, debut:d, fin:f, charge:ch });
      }
      projectColors = {}; collapsed = {}; sortRows(); renderAll();
    } catch (err) { alert('Erreur : ' + err.message); }
  };
  reader.readAsArrayBuffer(file); e.target.value = '';
}

// ── Export HTML local ──

function exportHTML() {
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  if (!data.length) { alert('Aucune donnée à sauvegarder.'); return; }
  const source = document.documentElement.outerHTML;
  const dataJson = JSON.stringify(data);
  const oldInit = /\/\/ -- INIT --[\s\S]*?}\)\(\);/;
  const newInit = `
(function(){
  const savedData = ${dataJson};
  portfolio = savedData.map(p=>({
    ...p,
    rows: p.rows.map(r=>({...r,
      debut: r.debut ? new Date(r.debut) : null,
      fin:   r.fin   ? new Date(r.fin)   : null
    }))
  }));
  savePortfolio();
  renderNavList();
  if(portfolio.length) switchToProject(portfolio[0].id);
})();`;
  const newSource = source.replace(oldInit, newInit);
  const blob = new Blob([newSource], { type:'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const d = new Date();
  a.download = `gantt_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Télécharger le modèle Excel ──

function downloadModele() {
  const b64 = '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';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'modele_import_gantt.xlsx'; a.click();
  URL.revokeObjectURL(url);
}

// ── Firebase sync ──

function setFbStatus(text, color) {
  const el = document.getElementById('fbStatus');
  if (!el) return;
  el.textContent = text;
  el.style.color = color || 'var(--muted)';
  el.style.background = color ? color + '18' : 'var(--surface2)';
}

function cleanForFirebase(obj) {
  if (Array.isArray(obj)) return obj.map(cleanForFirebase);
  if (obj !== null && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      if (v === null) { out[k] = null; continue; }
      out[k] = cleanForFirebase(v);
    }
    return out;
  }
  return obj;
}

function scheduleFirebaseSave(data) {
  if (typeof window._fbSet !== 'function') return;
  clearTimeout(_fbSaveTimer);
  setFbStatus('⏳ Sync...', '#f7971e');
  _fbSaveTimer = setTimeout(() => doFirebaseSave(data), 1500);
}

async function doFirebaseSave(data) {
  if (_fbSaving) return;
  if (typeof window._fbSet !== 'function') { setFbStatus('⚠ SDK non prêt', '#e17055'); return; }
  _fbSaving = true;
  try {
    const clean = cleanForFirebase(data);
    _lastSaveTs = Date.now();
    await window._fbSet(clean);
    const t = new Date();
    const hms = [t.getHours(), t.getMinutes(), t.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
    setFbStatus('☁ ' + hms, '#2e7d32');
  } catch (e) {
    console.error('Firebase save error:', e);
    setFbStatus('⚠ Erreur Firebase', '#e17055');
  } finally { _fbSaving = false; }
}

function migrateFirebaseData(data) {
  return data.map(p => ({
    ...p, client: p.client || '',
    projectColors: p.projectColors || {},
    collapsed: p.collapsed || {},
    jalons: (p.jalons || [
      ...(p.rows || []).filter(r => r._type === 'jalon')
    ]).map(j => ({
      _type:'jalon', nom:j.nom || '', projet:j.projet || '',
      date: j.date ? new Date(j.date) : null, couleur:j.couleur || null
    })),
    rows: (p.rows || []).filter(r => r._type !== 'jalon').map(r => {
      const niveaux = r.niveaux ? r.niveaux : (r.groupe ? [r.groupe] : []);
      return {
        _type: r._type || 'tache',
        projet: r.projet || '',
        niveaux,
        tache: r.tache || null,
        debut: r.debut ? new Date(r.debut) : null,
        fin: r.fin ? new Date(r.fin) : null,
        charge: r.charge != null ? r.charge : null
      };
    })
  }));
}

function clearAll() {
  if (!rows.length || confirm('Tout effacer ?')) {
    rows = []; projectColors = {}; collapsed = {}; editingIdx = null;
    renderAll();
  }
}

function importToNewProject(parsedRows, fileName) {
  const name = fileName.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
  createNewProject(name, parsedRows, {});
}
