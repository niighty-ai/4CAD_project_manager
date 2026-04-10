/* ═══════════════════════════════════════════
   xml_import.js — Import MS Project XML (.xml)
   Rôle : extraire uniquement les jalons (milestones).
   La structure tâches et les temps viennent exclusivement de l'import GHO.
   ═══════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────
   parseMSProjectXMLJalons
   Retourne jalons[] extraits du fichier XML MS Project.
   ────────────────────────────────────────────────────────── */
function parseMSProjectXMLJalons(xmlText, projectName) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('XML invalide : ' + parseError.textContent.slice(0, 120));

  const ns = 'http://schemas.microsoft.com/project';

  function getVal(el, tag) {
    return (el.getElementsByTagNameNS(ns, tag)[0] || el.getElementsByTagName(tag)[0])
      ?.textContent?.trim() ?? null;
  }
  function getAll(tag) {
    const r = doc.getElementsByTagNameNS(ns, tag);
    return r.length ? Array.from(r) : Array.from(doc.getElementsByTagName(tag));
  }

  const jalons = [];

  for (const el of getAll('Task')) {
    const name        = getVal(el, 'Name') || getVal(el, 'n') || '';
    const isNull      = getVal(el, 'IsNull') === '1';
    const isMilestone = getVal(el, 'Milestone') === '1';
    const olStr       = getVal(el, 'OutlineNumber') || '';
    const startStr    = getVal(el, 'Start') || getVal(el, 'ManualStart');

    if (isNull || !name || !olStr || !isMilestone) continue;
    if (!startStr) continue;

    const d = new Date(startStr);
    d.setHours(0, 0, 0, 0);
    if (isNaN(d)) continue;

    jalons.push({ _type: 'jalon', projet: projectName, nom: name, date: d, couleur: null });
  }

  return jalons;
}

/* ──────────────────────────────────────────────────────────
   handleXMLImport — point d'entrée (appelé par app.js)
   Met à jour uniquement les jalons du projet actif.
   ────────────────────────────────────────────────────────── */
function handleXMLImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const proj = activeProjectId ? portfolio.find(p => p.id === activeProjectId) : null;
      if (!proj) {
        alert('Aucun projet sélectionné.\nOuvrez un projet dans la liste avant d\'importer un fichier XML.');
        return;
      }

      const jalons = parseMSProjectXMLJalons(ev.target.result, proj.name);

      if (!jalons.length) {
        alert('Aucun jalon trouvé dans ce fichier XML.');
        return;
      }

      /* Remplacer uniquement les jalons — tâches et temps intacts */
      proj.jalons = jalons;

      /* Mettre à jour rows[] en retirant les anciens jalons et en ajoutant les nouveaux */
      rows = [
        ...rows.filter(r => r._type !== 'jalon'),
        ...jalons.map(r => ({ ...r, _srcPid: proj.id })),
      ];
      sortRows();
      proj.jalons = rows.filter(r => r._type === 'jalon').map(r => {
        const { _srcPid, ...rest } = r; return rest;
      });
      savePortfolio();
      renderNavList();
      renderAll();

      alert(`Import XML ✓\n${jalons.length} jalon(s) importé(s) dans "${proj.name}".`);
      console.log(`[XML Import] ${jalons.length} jalon(s) importé(s) dans "${proj.name}"`);

    } catch (err) {
      alert('Erreur import XML :\n' + err.message);
      console.error(err);
    }
  };
  reader.readAsText(file, 'utf-8');
}
