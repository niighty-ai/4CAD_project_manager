/* ═══════════════════════════════════════════
   app.js — Initialisation, event listeners
   ═══════════════════════════════════════════ */

document.getElementById('cpCustom').addEventListener('input',e=>{if(!cpTarget)return;projectColors[cpTarget]=e.target.value;document.getElementById('colorGrid').querySelectorAll('.color-opt').forEach(el=>el.classList.remove('selected'));renderAll();}
);
document.addEventListener('click',e=>{if(!document.getElementById('colorPopup').contains(e.target))document.getElementById('colorPopup').style.display='none';}
);
document.getElementById('fileInput').addEventListener('change',e=>{
  const file=e.target.files[0];if(!file)return;
  // Routing : XML MS Project ou Excel/CSV
  if(file.name.toLowerCase().endsWith('.xml')){
    handleXMLImport(file);
    e.target.value='';
    return;
  }
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
        type:   hdrs.findIndex(h=>h==='type'||h.includes('type')),
        projet: hdrs.findIndex(h=>h.includes('projet')),
        tache:  hdrs.findIndex(h=>h.includes('tach')||h.includes('nom')),
        debut:  hdrs.findIndex(h=>h.includes('debut')||h.includes('but')||h==='debut'),
        fin:    hdrs.findIndex(h=>h==='fin'||h.includes('fin')),
        charge: hdrs.findIndex(h=>h.includes('charge')),
        niveaux: [1,2,3,4,5].map(n=>hdrs.findIndex(h=>
          h===`niveau${n}` || h===`niveau_${n}` || h===`niveau ${n}` ||
          h===`n${n}` || h===`level${n}` || h===`level ${n}` ||
          (n===1 && (h.includes('groupe')||h.includes('group')))
        ))
      };
      rows=[];
      for(let i=hr+1;i<data.length;i++){
        const r=data[i];if(!r||!r[ci.projet])continue;
        const typeVal = ci.type>=0&&r[ci.type] ? String(r[ci.type]).toLowerCase().trim() : '';
        const isJalon = typeVal==='jalon'||typeVal==='milestone'||typeVal==='j';
        const nomVal = ci.tache>=0&&r[ci.tache] ? String(r[ci.tache]).trim() : null;
        if(isJalon){
          const d=ci.debut>=0?parseDate(r[ci.debut]):null;
          if(!d||isNaN(d)) continue;
          rows.push({_type:'jalon',projet:String(r[ci.projet]).trim(),nom:nomVal||'',date:d});
          continue;
        }
        const d=ci.debut>=0?parseDate(r[ci.debut]):null;
        const f=ci.fin>=0?parseDate(r[ci.fin]):null;
        if(!d||!f||isNaN(d)||isNaN(f))continue;
        let ch=ci.charge>=0?r[ci.charge]:null;
        if(ch!==null){ch=parseFloat(String(ch).replace(',','.'));if(isNaN(ch))ch=null;else ch=roundCharge(ch);}
        const niveaux=[];
        for(const idx of ci.niveaux){
          if(idx>=0&&r[idx]&&String(r[idx]).trim()) niveaux.push(String(r[idx]).trim());
          else break;
        }
        rows.push({_type:'tache',projet:String(r[ci.projet]).trim(),niveaux,tache:nomVal,debut:d,fin:f,charge:ch});
      }
      projectColors={};collapsed={};sortRows();renderAll();
    }catch(err){alert('Erreur : '+err.message);}
  };
  reader.readAsArrayBuffer(file);e.target.value='';
}
);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')cancelInlineEdit();
  if(e.key==='Enter'&&editingIdx!==null&&e.target.classList.contains('cell-input'))saveInlineEdit(editingIdx);
}
);
(function(){
  const origHandler = document.getElementById('fileInput').onchange;
  document.getElementById('fileInput').addEventListener('change', function(e){
    const file = e.target.files[0];
    if(file && activeProjectId){
      const proj = portfolio.find(p=>p.id===activeProjectId);
      if(proj && (proj.name.startsWith('Nouveau projet'))){
        const name = file.name.replace(/\.[^.]+$/,'').replace(/[_-]/g,' ');
        proj.name = name;
        // activeProjectName removed from header
        savePortfolio();
        renderNavList();
      }
    }
  });
}
)();
(function(){
  portfolio = [];
  renderNavList();
}
)();
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeEditPanel();
}
);
/* Initialisation des ressources (localStorage + Firebase sync) */
if (typeof initResources === 'function') initResources();
(function waitForFbAndLoad(){
  let attempts = 0;
  const iv = setInterval(()=>{
    attempts++;
    if(typeof window._fbOnValue === 'function'){
      clearInterval(iv);
      setFbStatus('⏳ Chargement...', '#f7971e');
      window._fbOnValue(function(val){
        if(_fbInitLoaded && (Date.now() - _lastSaveTs) < 4000){
          return;
        }
        if(val && Array.isArray(val) && val.length){
          const activeId = activeProjectId;
          portfolio = migrateFirebaseData(val);
          renderNavList();
          const target = activeId && portfolio.find(p=>p.id===activeId)
            ? activeId : portfolio[0]?.id;
          if(target) switchToProject(target);
          setFbStatus('☁ Connecté', '#2e7d32');
        } else if(!_fbInitLoaded){
          setFbStatus('☁ Vide', '#f7971e');
        }
        _fbInitLoaded = true;
      });
    } else if(attempts > 60){
      clearInterval(iv);
      setFbStatus('⚠ Firebase indisponible', '#e17055');
    }
  }, 100);
}
)();
document.addEventListener('keydown', e=>{
  if(e.key==='Escape') closeJalonPanel();
}
);
