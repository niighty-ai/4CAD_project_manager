/* ═══════════════════════════════════════════
   xml_import.js — Import MS Project XML (.xml)
   ═══════════════════════════════════════════ */

/**
 * Parse une durée ISO PT de MS Project en jours (base 8h/j)
 * Ex: "PT36H0M0S" → 4.5
 */
function parseMSProjectDuration(str) {
  if (!str) return null;
  const m = String(str).match(/PT(\d+)H(\d+)M/);
  if (!m) return null;
  const hours = parseInt(m[1]) + parseInt(m[2]) / 60;
  return hours > 0 ? Math.round((hours / 8) * 100) / 100 : null;
}

/**
 * Parse un fichier XML MS Project et retourne { rows, jalons }
 *
 * ⚠️  OutlineLevel est parfois incohérent dans les exports MS Project.
 *     On utilise OutlineNumber ("2.1.3") comme source de vérité pour
 *     calculer la vraie profondeur et reconstruire la hiérarchie.
 *
 * Correspondance hiérarchie :
 *   OutlineNumber depth 1  Summary  → groupe racine (Niveau 1)
 *   OutlineNumber depth 1 !Summary  → tâche sans groupe
 *   OutlineNumber depth 2  Summary  → Niveau 2
 *   OutlineNumber depth 2 !Summary  → tâche dans Niveau 1
 *   OutlineNumber depth N  Summary  → Niveau N
 *   OutlineNumber depth N !Summary  → tâche dans Niveau N-1
 */
function parseMSProjectXML(xmlText, projectName) {
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

  // ── Assignments : map taskUID → heures totales Work ─────────────────────
  const taskWork = {};
  for (const a of getAll('Assignment')) {
    const taskUID = getVal(a, 'TaskUID');
    const workStr = getVal(a, 'Work');
    if (!taskUID || !workStr) continue;
    const m = workStr.match(/PT(\d+)H(\d+)M/);
    if (!m) continue;
    taskWork[taskUID] = (taskWork[taskUID] || 0) + parseInt(m[1]) + parseInt(m[2]) / 60;
  }

  // ── Parse des tâches ────────────────────────────────────────────────────
  const tasks = [];
  for (const el of getAll('Task')) {
    const uid         = getVal(el, 'UID');
    const name        = getVal(el, 'Name') || getVal(el, 'n') || '';
    const isNull      = getVal(el, 'IsNull') === '1';
    const isSummary   = getVal(el, 'Summary') === '1';
    const isMilestone = getVal(el, 'Milestone') === '1';
    const olStr       = getVal(el, 'OutlineNumber') || '';
    const startStr    = getVal(el, 'Start')  || getVal(el, 'ManualStart');
    const finishStr   = getVal(el, 'Finish') || getVal(el, 'ManualFinish');

    if (isNull || !name || !olStr) continue;

    // Profondeur réelle = nb de segments dans OutlineNumber
    const depth = olStr.split('.').length;

    const mkDate = s => { if (!s) return null; const d = new Date(s); d.setHours(0,0,0,0); return d; };
    const start  = mkDate(startStr);
    const finish = mkDate(finishStr);

    let charge = null;
    if (taskWork[uid] != null) {
      charge = Math.round((taskWork[uid] / 8) * 100) / 100 || null;
    } else {
      charge = parseMSProjectDuration(getVal(el, 'Work') || getVal(el, 'Duration'));
    }

    tasks.push({ uid, name, depth, isSummary, isMilestone, start, finish, charge });
  }

  if (!tasks.length) throw new Error('Aucune tâche trouvée dans ce fichier XML.');

  // ── Reconstruction de la hiérarchie via pile de Summary ─────────────────
  // nameStack[d] = nom du dernier nœud Summary rencontré à la profondeur d
  const nameStack = {};
  const rows   = [];
  const jalons = [];

  for (const t of tasks) {
    // Mise à jour de la pile : ce nœud occupe sa profondeur
    nameStack[t.depth] = t.name;
    // On efface toutes les profondeurs enfants
    for (const k of Object.keys(nameStack)) {
      if (parseInt(k) > t.depth) delete nameStack[k];
    }

    // Les Summary servent de repères dans la pile, pas de tâches
    if (t.isSummary) continue;

    // ── Jalon ──
    if (t.isMilestone) {
      if (!t.start) continue;
      jalons.push({ _type: 'jalon', projet: projectName, nom: t.name, date: t.start, couleur: null });
      continue;
    }

    if (!t.start || !t.finish) continue;

    // Niveaux = noms des Summary ancêtres (profondeurs 1 … depth-1)
    const niveaux = [];
    for (let d = 1; d < t.depth; d++) {
      if (nameStack[d]) niveaux.push(nameStack[d]);
    }

    rows.push({ _type: 'tache', projet: projectName, niveaux, tache: t.name, debut: t.start, fin: t.finish, charge: t.charge });
  }

  return { rows, jalons };
}

/**
 * Point d'entrée : importe dans le projet ACTIF du portfolio.
 * Si aucun projet actif, crée un nouveau projet.
 */
function handleXMLImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      // Détermine le nom du projet actif (ou nom de fichier si aucun projet)
      const proj = activeProjectId ? portfolio.find(p => p.id === activeProjectId) : null;
      const projectName = proj ? proj.name : file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');

      const { rows: parsedRows, jalons: parsedJalons } =
        parseMSProjectXML(ev.target.result, projectName);

      if (!parsedRows.length && !parsedJalons.length) {
        alert('Aucune tâche exploitable trouvée dans ce fichier XML.');
        return;
      }

      if (proj) {
        // ── Injecte dans le projet actif ────────────────────────────────
        proj.rows   = [...(proj.rows   || []).filter(r => r._type !== 'jalon'), ...parsedRows];
        proj.jalons = [...(proj.jalons || []),                                  ...parsedJalons];

        // Recharge l'état courant depuis le projet mis à jour
        rows = [
          ...proj.rows.map(r => ({...r})),
          ...proj.jalons.map(r => ({...r}))
        ];
        sortRows();
        proj.rows   = rows.filter(r => r._type === 'tache').map(r => ({...r}));
        proj.jalons = rows.filter(r => r._type === 'jalon').map(r => ({...r}));
        savePortfolio();
        renderNavList();
        renderAll();
      } else {
        // ── Aucun projet actif : crée un nouveau ────────────────────────
        createNewProject(projectName, parsedRows, {}, '');
        const newProj = portfolio.find(p => p.id === activeProjectId);
        if (newProj) {
          newProj.jalons = parsedJalons;
          rows = [...rows.filter(r => r._type !== 'jalon'), ...parsedJalons];
          sortRows();
          newProj.rows   = rows.filter(r => r._type === 'tache').map(r => ({...r}));
          newProj.jalons = rows.filter(r => r._type === 'jalon').map(r => ({...r}));
          savePortfolio();
          renderAll();
        }
      }

      console.log(`[XML Import] ${parsedRows.length} tâche(s), ${parsedJalons.length} jalon(s) importé(s) dans "${projectName}"`);
    } catch (err) {
      alert('Erreur import XML :\n' + err.message);
      console.error(err);
    }
  };
  reader.readAsText(file, 'utf-8');
}
