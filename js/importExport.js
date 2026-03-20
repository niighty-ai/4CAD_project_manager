/**
 * importExport.js
 * Excel import, HTML export, Excel template download.
 *
 * Import column mapping (auto-detected, accent-insensitive):
 *   Type, Projet, Niveau 1-5, Nom/Tache, Debut, Fin, Charge
 *
 * Depends on: state.js, utils.js, sort.js, portfolio.js, ui.js
 * Requires: SheetJS (XLSX) global
 */

// ── Excel import ─────────────────────────────────────────────────────────────

// ====== EXCEL IMPORT ======
document.getElementById('fileInput').addEventListener('change',e=>{
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const wb=XLSX.read(ev.target.result,{type:'array',cellDates:false});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const data=XLSX.utils.sheet_to_json(ws,{header:1,raw:true});
      let hr=0;
      for(let i=0;i<Math.min(5,data.length);i++){
        const r=data[i].map(c=>String(c||'').toLowerCase());
        if(r.some(c=>c.includes('projet')||c.includes('tach')||c.includes('but'))){hr=i;break;}
      }
      const hdrs=data[hr].map(c=>String(c||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
      const ci={
        projet:hdrs.findIndex(h=>h.includes('projet')),
        groupe:hdrs.findIndex(h=>h.includes('groupe')||h.includes('group')),
        tache:hdrs.findIndex(h=>h.includes('tach')),
        debut:hdrs.findIndex(h=>h.includes('debut')||h.includes('but')||h==='debut'),
        fin:hdrs.findIndex(h=>h==='fin'||h.includes('fin')),
        charge:hdrs.findIndex(h=>h.includes('charge')),
      };
      rows=[];
      for(let i=hr+1;i<data.length;i++){
        const r=data[i];if(!r||!r[ci.projet])continue;
        const d=ci.debut>=0?parseDate(r[ci.debut]):null;
        const f=ci.fin>=0?parseDate(r[ci.fin]):null;
        if(!d||!f||isNaN(d)||isNaN(f))continue;
        let ch=ci.charge>=0?r[ci.charge]:null;
        if(ch!==null){ch=parseFloat(String(ch).replace(',','.'));if(isNaN(ch))ch=null;}
        rows.push({_type:'tache',projet:String(r[ci.projet]).trim(),groupe:ci.groupe>=0&&r[ci.groupe]?String(r[ci.groupe]).trim():null,tache:ci.tache>=0&&r[ci.tache]?String(r[ci.tache]).trim():null,debut:d,fin:f,charge:ch});
      }
      projectColors={};collapsed={};sortRows();renderAll();
    }catch(err){alert('Erreur : '+err.message);}
  };
  reader.readAsArrayBuffer(file);e.target.value='';
});

// ── Rename project after import ───────────────────────────────────────────────

document.getElementById('fileInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (file && activeProjectId) {
    const proj = portfolio.find(p => p.id === activeProjectId);
    if (proj && proj.name.startsWith('Nouveau projet')) {
      proj.name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
      document.getElementById('activeProjectName').textContent = proj.name;
      savePortfolio();
      renderNavList();
    }
  }
});

// ── Export HTML (offline backup) ──────────────────────────────────────────────

// ====== EXPORT HTML (sauvegarde avec données intégrées) ======
function exportHTML(){
  // Sauvegarder d'abord l'état courant
  saveCurrentProject();
  // Sérialiser le portfolio en mémoire (source de vérité = Firebase/mémoire)
  const data = portfolio.map(p => ({
    ...p,
    rows:   (p.rows||[]).filter(r=>r._type!=='jalon').map(r=>({...r,debut:r.debut?r.debut.toISOString():null,fin:r.fin?r.fin.toISOString():null})),
    jalons: (p.jalons||[]).map(j=>({...j,date:j.date?j.date.toISOString():null})),
  }));
  if(!data.length){ alert('Aucune donnée à sauvegarder.'); return; }

  // Lire le source de la page actuelle
  const source = document.documentElement.outerHTML;

  // Remplacer le bloc INIT par un bloc qui injecte directement les données
  const dataJson = JSON.stringify(data);

  const oldInit = /\/\/ -- INIT --[\s\S]*?}\)\(\);/;

  const newInit = `// -- INIT --
(function(){
  // Données sauvegardées le ${new Date().toLocaleDateString('fr-FR')}
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

  // Télécharger
  const blob = new Blob([newSource], {type: 'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const d = new Date();
  a.download = `gantt_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Download Excel template ───────────────────────────────────────────────────

function downloadModele() {
  const b64 = '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';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const blob = new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'modele_import_gantt.xlsx'; a.click();
  URL.revokeObjectURL(url);
}
