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
 * Parse un fichier XML MS Project et retourne { rows, jalons, projectName }
 * compatible avec le format interne de l'application.
 */
function parseMSProjectXML(xmlText, fileName) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  // Vérification parsing
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('XML invalide : ' + parseError.textContent.slice(0, 120));

  // Namespace helper — MS Project utilise un namespace
  const ns = 'http://schemas.microsoft.com/project';
  function getVal(el, tag) {
    const found = el.getElementsByTagNameNS(ns, tag)[0]
                || el.getElementsByTagName(tag)[0];
    return found ? found.textContent.trim() : null;
  }

  // Récupère toutes les tâches
  const taskEls = Array.from(
    doc.getElementsByTagNameNS(ns, 'Task').length
      ? doc.getElementsByTagNameNS(ns, 'Task')
      : doc.getElementsByTagName('Task')
  );

  // Récupère les assignments (pour la charge Work par tâche)
  const assignmentEls = Array.from(
    doc.getElementsByTagNameNS(ns, 'Assignment').length
      ? doc.getElementsByTagNameNS(ns, 'Assignment')
      : doc.getElementsByTagName('Assignment')
  );

  // Map taskUID → work total (heures)
  const taskWork = {};
  for (const a of assignmentEls) {
    const taskUID = getVal(a, 'TaskUID');
    const workStr = getVal(a, 'Work');
    if (!taskUID || !workStr) continue;
    const m = workStr.match(/PT(\d+)H(\d+)M/);
    if (!m) continue;
    const h = parseInt(m[1]) + parseInt(m[2]) / 60;
    taskWork[taskUID] = (taskWork[taskUID] || 0) + h;
  }

  // Parse les tâches
  const tasks = taskEls.map(el => {
    const uid          = getVal(el, 'UID');
    const name         = getVal(el, 'Name') || getVal(el, 'n') || '';
    const outlineLevel = parseInt(getVal(el, 'OutlineLevel') || '0');
    const isMilestone  = getVal(el, 'Milestone') === '1';
    const isSummary    = getVal(el, 'Summary') === '1';
    const isNull       = getVal(el, 'IsNull') === '1';
    const startStr     = getVal(el, 'Start') || getVal(el, 'ManualStart');
    const finishStr    = getVal(el, 'Finish') || getVal(el, 'ManualFinish');
    const durationStr  = getVal(el, 'Work') || getVal(el, 'Duration');

    if (isNull || !name) return null;

    const start  = startStr  ? new Date(startStr)  : null;
    const finish = finishStr ? new Date(finishStr) : null;

    // Normalise à minuit
    if (start)  start.setHours(0, 0, 0, 0);
    if (finish) finish.setHours(0, 0, 0, 0);

    // Charge : priorité aux assignments réels, sinon Duration
    let charge = null;
    if (taskWork[uid] != null) {
      charge = Math.round((taskWork[uid] / 8) * 100) / 100;
    } else {
      charge = parseMSProjectDuration(durationStr);
    }
    if (charge === 0) charge = null;

    return { uid, name, outlineLevel, isMilestone, isSummary, start, finish, charge };
  }).filter(Boolean);

  if (!tasks.length) throw new Error('Aucune tâche trouvée dans ce fichier XML.');

  // Nom du projet : tâche de niveau 1 (outlineLevel=1, summary=true) ou nom du fichier
  const rootTask = tasks.find(t => t.outlineLevel === 1 && t.isSummary);
  const projectName = rootTask
    ? rootTask.name
    : (fileName || 'Projet XML').replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');

  // Construit la hiérarchie de niveaux
  // On ignore les tâches summary (elles deviennent des groupes calculés automatiquement)
  // et on reconstruit les niveaux depuis la pile d'ancêtres
  const rows    = [];
  const jalons  = [];

  // Pile pour reconstruire les niveaux : stack[i] = nom de l'ancêtre à outlineLevel i
  const stack = new Array(20).fill(null);

  for (const t of tasks) {
    const lvl = t.outlineLevel;
    stack[lvl] = t.name;
    // Efface les niveaux enfants
    for (let i = lvl + 1; i < stack.length; i++) stack[i] = null;

    // On ignore les tâches résumé (summary) et la tâche racine
    if (t.isSummary) continue;
    if (lvl <= 1) continue; // racine projet → ignorée

    if (t.isMilestone) {
      // Jalon : utilise la date de début
      if (!t.start) continue;
      jalons.push({
        _type:  'jalon',
        projet: projectName,
        nom:    t.name,
        date:   t.start,
        couleur: null
      });
      continue;
    }

    if (!t.start || !t.finish) continue;

    // Reconstruit les niveaux (ancêtres entre niveau 2 et lvl-1)
    const niveaux = [];
    for (let i = 2; i < lvl; i++) {
      if (stack[i]) niveaux.push(stack[i]);
    }

    rows.push({
      _type:   'tache',
      projet:  projectName,
      niveaux,
      tache:   t.name,
      debut:   t.start,
      fin:     t.finish,
      charge:  t.charge
    });
  }

  return { rows, jalons, projectName };
}

/**
 * Point d'entrée : déclenché par le bouton "Importer XML"
 */
function handleXMLImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const { rows: parsedRows, jalons: parsedJalons, projectName } =
        parseMSProjectXML(ev.target.result, file.name);

      if (!parsedRows.length && !parsedJalons.length) {
        alert('Aucune tâche exploitable trouvée dans ce fichier XML.');
        return;
      }

      // Crée un nouveau projet dans le portfolio
      const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const proj = {
        id,
        name:          projectName,
        client:        '',
        rows:          parsedRows,
        jalons:        parsedJalons,
        projectColors: {},
        collapsed:     {}
      };
      portfolio.push(proj);
      savePortfolio();
      renderNavList();
      switchToProject(id);

      const total = parsedRows.length + parsedJalons.length;
      console.log(`[XML Import] "${projectName}" — ${parsedRows.length} tâche(s), ${parsedJalons.length} jalon(s)`);
    } catch (err) {
      alert('Erreur import XML :\n' + err.message);
      console.error(err);
    }
  };
  reader.readAsText(file, 'utf-8');
}
