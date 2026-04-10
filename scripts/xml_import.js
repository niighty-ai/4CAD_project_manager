/* ═══════════════════════════════════════════
   xml_import.js — Import MS Project XML (.xml)
   ═══════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────
   parseMSProjectXML
   Retourne { rows, jalons, importedResources }

   importedResources : ressources créées/fusionnées dans l'appli
   (pour log/notification)
   ────────────────────────────────────────────────────────── */
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

  /* ── 1. Ressources XML → ressources appli ──────────────────
     Format XML : <n>Prénom NOM  - Profession</n>
     On crée ou fusionne dans resources[] (global, défini dans resources.js)
     Clé de fusion : nom complet normalisé (sans espaces doubles, casse normalisée)
     Retourne une map { xmlResourceUID → resourceId (appli) }
  ─────────────────────────────────────────────────────────── */
  const uidToAppId     = {};  // xmlUID → id interne appli
  const missingResources = []; // noms des ressources introuvables dans la liste

  for (const el of getAll('Resource')) {
    const uid      = getVal(el, 'UID');
    const fullName = getVal(el, 'Name') || getVal(el, 'n') || '';
    const type     = getVal(el, 'Type');

    // On ignore la ressource "vide" (UID=0) et les ressources matérielles (Type=0)
    if (!uid || uid === '0' || type === '0' || !fullName) continue;

    /* Normalisation pour la correspondance :
       - supprime la partie profession après " - " (ex: "DUPONT Jean - Chef de projet")
       - insensible à la casse et aux accents */
    const _normResKey = s => s.split(/\s*[-–]\s*/)[0]
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    const normalizedKey = _normResKey(fullName);

    const existing = (typeof resources !== 'undefined' && resources.length)
      ? resources.find(r => {
          const rKey = _normResKey(r.fullName || '');
          return rKey === normalizedKey;
        })
      : null;

    if (existing) {
      if (!existing.xmlUid) existing.xmlUid = uid;
      uidToAppId[uid] = existing.id;
    } else {
      console.warn(`[XML Import] Ressource introuvable: "${fullName}" (clé normalisée: "${normalizedKey}")`);
      if (typeof resources !== 'undefined') {
        console.log(`[XML Import] Ressources disponibles (${resources.length}):`,
          resources.slice(0, 5).map(r => `"${r.fullName}"→"${_normResKey(r.fullName||'')}"`));
      }
      missingResources.push(fullName);
    }
  }

  if (missingResources.length) {
    throw new Error(
      `Impossible d'importer : ${missingResources.length} ressource(s) introuvable(s) dans la liste.\n\n` +
      missingResources.map(n => `  • ${n}`).join('\n') +
      `\n\nImportez d'abord la liste des ressources via "↑ Import Liste".`
    );
  }

  /* ── 2. Assignments XML : map taskUID → [{resourceUID, work, actualWork, remainingWork}]
  ─────────────────────────────────────────────────────────── */
  const taskAssignments = {}; // taskUID → [{ resourceUID, work, actualWork, remainingWork }]

  for (const a of getAll('Assignment')) {
    const taskUID     = getVal(a, 'TaskUID');
    const resourceUID = getVal(a, 'ResourceUID');
    const workStr     = getVal(a, 'Work')          || 'PT0H0M0S';
    const actualStr   = getVal(a, 'ActualWork')    || 'PT0H0M0S';
    const remainStr   = getVal(a, 'RemainingWork') || 'PT0H0M0S';

    if (!taskUID || !resourceUID || resourceUID === '0') continue;
    // On ignore les assignments vers des ressources non mappées
    if (!uidToAppId[resourceUID]) continue;

    if (!taskAssignments[taskUID]) taskAssignments[taskUID] = [];
    const asgStart = getVal(a, 'Start');
    const asgFinish = getVal(a, 'Finish');
    const mkDateA = s => { if (!s) return null; const d = new Date(s); d.setHours(0,0,0,0); return d; };
    taskAssignments[taskUID].push({
      xmlUid:        getVal(a, 'UID'),
      resourceUID,
      work:          parsePTtoDays(workStr),
      actualWork:    parsePTtoDays(actualStr),
      remainingWork: parsePTtoDays(remainStr),
      debut:         mkDateA(asgStart),
      fin:           mkDateA(asgFinish),
      percentComplete: parseFloat(getVal(a, 'PercentWorkComplete') || '0') || 0,
    });
  }

  /* ── 3. Parse des tâches ────────────────────────────────── */
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

    const depth = olStr.split('.').length;
    const mkDate = s => { if (!s) return null; const d = new Date(s); d.setHours(0,0,0,0); return d; };
    const start  = mkDate(startStr);
    const finish = mkDate(finishStr);

    // L'XML fournit uniquement le temps passé (ActualWork).
    // charge (temps prévu) et chargeRestante sont calculés par syncGanttFromResources (GHO).
    let charge         = null;
    let chargePassee   = null;
    let chargeRestante = null;
    let assignments    = [];

    const asgns = taskAssignments[uid];
    if (asgns && asgns.length) {
      chargePassee = asgns.reduce((s, a) => s + (a.actualWork || 0), 0);
      chargePassee = Math.round(chargePassee * 10000) / 10000 || null;
    }

    const taskId = getVal(el, 'ID');

    tasks.push({ uid, id: taskId, name, depth, isSummary, isMilestone, start, finish,
                 charge, chargePassee, chargeRestante, assignments });
  }

  if (!tasks.length) throw new Error('Aucune tâche trouvée dans ce fichier XML.');

  /* ── 4. Reconstruction de la hiérarchie ────────────────── */
  const nameStack = {};
  const rows   = [];
  const jalons = [];

  for (const t of tasks) {
    nameStack[t.depth] = t.name;
    for (const k of Object.keys(nameStack)) {
      if (parseInt(k) > t.depth) delete nameStack[k];
    }

    if (t.isSummary) continue;

    if (t.isMilestone) {
      if (!t.start) continue;
      jalons.push({ _type: 'jalon', projet: projectName, nom: t.name, date: t.start, couleur: null });
      continue;
    }

    if (!t.start || !t.finish) continue;

    const niveaux = [];
    for (let d = 1; d < t.depth; d++) {
      if (nameStack[d]) niveaux.push(nameStack[d]);
    }

    rows.push({
      _type: 'tache',
      projet: projectName,
      niveaux,
      tache:          t.name,
      debut:          t.start,
      fin:            t.finish,
      charge:         t.charge,
      chargePassee:   t.chargePassee,
      chargeRestante: t.chargeRestante,
      assignments:    t.assignments,
      xmlUid:         t.uid,  // lien fort avec MS Project Task.UID
      xmlId:          t.id,   // ordre d'affichage MS Project
      // externalTaskId : NON posé par l'XML — provient exclusivement de l'import GHO unifié
    });
  }

  return { rows, jalons };
}

/* ──────────────────────────────────────────────────────────
   handleXMLImport — point d'entrée (appelé par app.js)
   ────────────────────────────────────────────────────────── */
function handleXMLImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const proj = activeProjectId ? portfolio.find(p => p.id === activeProjectId) : null;
      const projectName = proj
        ? proj.name
        : file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');

      const { rows: parsedRows, jalons: parsedJalons } =
        parseMSProjectXML(ev.target.result, projectName);

      if (!parsedRows.length && !parsedJalons.length) {
        alert('Aucune tâche exploitable trouvée dans ce fichier XML.');
        return;
      }

      if (proj) {
        /* Sauvegarder les données GHO avant remplacement — l'XML ne doit pas les écraser.
           Clé : tache||niveaux (identique entre XML et GHO pour un même projet) */
        const savedExtIds  = {};  // key → externalTaskId
        const savedAssigns = {};  // key → assignments[] (GHO)
        const savedCharge  = {};  // key → charge (temps prévu calculé par Sync GHO)
        (proj.rows || []).forEach(r => {
          if (r._type !== 'tache') return;
          const k = `${(r.tache || '').trim()}||${JSON.stringify(r.niveaux || [])}`;
          if (r.externalTaskId)                  savedExtIds[k]  = r.externalTaskId;
          if (r.assignments && r.assignments.length) savedAssigns[k] = r.assignments;
          if (r.charge != null)                  savedCharge[k]  = r.charge;
        });

        /* REPLACE all project data from the XML import */
        proj.rows   = [...parsedRows];
        proj.jalons = [...parsedJalons];
        proj.assignments = {};

        /* Restaurer les données GHO sur les nouvelles tâches XML et recalculer chargeRestante */
        proj.rows.forEach(r => {
          if (r._type !== 'tache') return;
          const k = `${(r.tache || '').trim()}||${JSON.stringify(r.niveaux || [])}`;
          if (savedExtIds[k])  r.externalTaskId = savedExtIds[k];
          if (savedAssigns[k]) r.assignments    = savedAssigns[k];
          if (savedCharge[k] != null) {
            r.charge = savedCharge[k];
            // chargeRestante = temps prévu − temps passé
            r.chargeRestante = (r.chargePassee != null)
              ? Math.round((r.charge - r.chargePassee) * 10000) / 10000
              : r.charge;
          }
        });

        rows = [
          ...proj.rows.map(r => ({...r})),
          ...proj.jalons.map(r => ({...r})),
        ];
        sortRows();
        proj.rows   = rows.filter(r => r._type === 'tache').map(r => ({...r}));
        proj.jalons = rows.filter(r => r._type === 'jalon').map(r => ({...r}));
        savePortfolio();
        renderNavList();
        renderAll();
        syncGanttFromResources(true);
      } else {
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
          syncGanttFromResources(true);
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
