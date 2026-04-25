/* ═══════════════════════════════════════════════════════════════
   resources-import.js — Import Excel : liste ressources + GHO
   Dépendances : resources.js (saveResources, saveGhoData, _mergeGhoData,
                  resources[], portfolio[], XLSX, etc.)
   ═══════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════
   IMPORT GHO EXCEL (SheetJS)
   ══════════════════════════════════ */
/* ══════════════════════════════════
   IMPORT LISTE RESSOURCES (Excel 3 colonnes : ID / Name / Profession)
   ══════════════════════════════════ */
function triggerListImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => parseListExcel(evt.target.result);
    reader.readAsArrayBuffer(file);
  };
  input.click();
}

/* Normalise une chaîne lue depuis Excel :
   - apostrophes typographiques (' ') → apostrophe standard (')
   - guillemets typographiques (" ") → guillemets droits (")
   - espaces insécables et espaces spéciaux → espace normal
   - NFC pour les caractères accentués composés */
function _normalizeExcelStr(val) {
  if (val == null) return '';
  return String(val)
    .normalize('NFC')
    .replace(/[\u2018\u2019\u201A\u201B\u02BC\uFF07]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u00A0\u202F\u2009\u2007\u2008\u200B]/g, ' ')
    .trim();
}

function parseListExcel(buffer) {
  try {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS non disponible — vérifiez le chargement de la librairie.');
      return;
    }
    const wb  = XLSX.read(buffer, { type: 'array', cellDates: false });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    if (raw.length < 2) { alert('Fichier vide ou format invalide.'); return; }

    /* ── Détection flexible des colonnes ──
       Stratégie :
         1. Cherche la première colonne dont l'en-tête contient le mot-clé
         2. Si non trouvée, fallback sur la position (0=ID, 1=Nom, 2=Rôle)
       → l'import ne se bloque jamais sur un nom de colonne inattendu        */
    /* Normaliser les en-têtes (espaces insécables, apostrophes typographiques, etc.) */
    const header = (raw[0] || []).map(h => _normalizeExcelStr(h).toLowerCase());

    const _findCol = (patterns, fallback) => {
      const idx = header.findIndex(h => patterns.some(p => p.test(h)));
      return idx >= 0 ? idx : fallback;
    };

    const colId   = _findCol([/\bid\b/, /resource[\s_-]?id/, /id[\s_-]?resource/], 0);
    const colName = _findCol([/\bname\b/, /\bnom\b/, /resource[\s_-]?name/],       1);
    const colProf = _findCol([/\brole\b/, /\bprof/, /\bfonction/, /\bposte\b/,
                              /\btitre\b/, /\btitle\b/, /\bjob\b/],                2);
    const colType = _findCol([/\btype\b/],                                        -1); // pas de fallback positionnel

    /* ── Clé de correspondance : externalId + fullName normalisé ── */
    const _matchKey = (externalId, fullName) =>
      (String(externalId).trim() + '|' + String(fullName).trim()).toLowerCase();

    /* ── 1. Construire la liste des ressources du fichier ── */
    const importedKeys = new Set();
    const importRows   = [];

    for (let ri = 1; ri < raw.length; ri++) {
      const row = raw[ri];
      if (!row) continue;
      const externalId   = _normalizeExcelStr(row[colId]);
      const fullName     = _normalizeExcelStr(row[colName]);
      const profession   = _normalizeExcelStr(colProf >= 0 ? row[colProf] : null);
      const resourceType = _normalizeExcelStr(colType >= 0 ? row[colType] : null);
      if (!externalId && !fullName) continue;
      const key = _matchKey(externalId, fullName);
      importedKeys.add(key);
      importRows.push({ externalId, fullName, profession, resourceType, key });
    }

    if (!importRows.length) { alert('Aucune ligne valide trouvée dans le fichier.'); return; }

    /* ── 2. Upsert : mise à jour ou création ── */
    let created = 0, updated = 0, deleted = 0;

    for (const { externalId, fullName, profession, resourceType, key } of importRows) {
      /* Correspondance par couple ID + Nom (normalisé) */
      const existing = resources.find(r =>
        _matchKey(r.externalId || '', r.fullName || '') === key
      );
      if (existing) {
        existing.fullName     = fullName;
        existing.profession   = profession;
        existing.externalId   = externalId;
        existing.resourceType = resourceType || existing.resourceType || '';
        updated++;
      } else {
        resources.push({ id: genResId(), externalId, fullName, profession, resourceType: resourceType || '' });
        created++;
      }
    }

    /* ── 3. Suppression des ressources absentes du fichier
            (uniquement celles qui avaient un externalId — les ressources
             créées manuellement sans externalId sont préservées) ── */
    const before = resources.length;
    resources = resources.filter(r => {
      if (!r.externalId) return true; // ressource manuelle → conserver
      const key = _matchKey(r.externalId, r.fullName || '');
      return importedKeys.has(key);
    });
    deleted = before - resources.length;

    /* ── 4. Auto-reset du filtre type si aucune ressource ne correspond ── */
    const typesFound = [...new Set(resources.map(r => r.resourceType || '').filter(Boolean))].sort();
    if (_resTypeFilter && !resources.some(r =>
      (r.resourceType || '').toLowerCase() === _resTypeFilter.toLowerCase()
    )) {
      _resTypeFilter = typesFound.length ? typesFound[0] : '';
    }

    saveResources();
    _refreshResView();
    const typesSummary = typesFound.length
      ? `\n• Types détectés : ${typesFound.join(', ')}`
      : '\n• ⚠ Colonne "Resource Type" non détectée (filtre réinitialisé à "Tous")';
    alert(`Import Liste ✓\n• ${created} créée(s)\n• ${updated} mise(s) à jour\n• ${deleted} supprimée(s)${typesSummary}`);
  } catch (err) {
    console.error('List import error:', err);
    alert('Erreur import Liste : ' + err.message);
  }
}

function triggerGHOImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => parseGHOExcel(evt.target.result);
    reader.readAsArrayBuffer(file);
  };
  input.click();
}

/* ── Convertit une valeur de cellule en clé "DD/MM/YYYY", ou null ── */
function _parseDateValue(rawVal) {
  if (rawVal == null) return null;

  /* 1. Numéro de série Excel (plage large pour couvrir 1950-2200) */
  if (typeof rawVal === 'number' && rawVal > 1 && rawVal < 120000) {
    const d = new Date(Date.UTC(1900, 0, 1) + (rawVal - 2) * 86400000);
    if (!isNaN(d.getTime())) {
      return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
    }
  }

  /* 2. Objet Date JS */
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    return `${String(rawVal.getDate()).padStart(2,'0')}/${String(rawVal.getMonth()+1).padStart(2,'0')}/${rawVal.getFullYear()}`;
  }

  const s = _normalizeExcelStr(rawVal);
  if (!s) return null;

  /* Supprimer la partie heure si présente ("01/03/2026 00:00" ou "01/03/2026T00:00:00") */
  const datePart = s.replace(/[\sT]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, '').trim();

  /* 3. DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (avec ou sans padding) */
  let m = datePart.match(/^(\d{1,2})[\/\-\.\s](\d{1,2})[\/\-\.\s](\d{2,4})$/);
  if (m) {
    const d = parseInt(m[1]), mo = parseInt(m[2]);
    const yyyy = m[3].length === 2 ? '20' + m[3] : m[3];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12)
      return `${String(d).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${yyyy}`;
  }

  /* 4. YYYY-MM-DD ou YYYY/MM/DD */
  m = datePart.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (m) {
    const d = parseInt(m[3]), mo = parseInt(m[2]);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12)
      return `${String(d).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${m[1]}`;
  }

  /* 5. Fallback Date.parse — réinterprète DD/MM → ISO avant de parser */
  const iso = s.replace(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/, '$3-$2-$1');
  const ts  = Date.parse(iso);
  if (!isNaN(ts)) {
    const d = new Date(ts);
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
  }

  return null;
}
/* Alias pour la détection en en-tête (même logique) */
const _parseDateHeader = _parseDateValue;

function _showMissingResPopup(missingNames, updatedCount) {
  const existing = document.getElementById('ghoMissingBackdrop');
  if (existing) existing.remove();

  const listHtml = missingNames.map(n => `<li class="gho-missing-item">${escH(n)}</li>`).join('');
  const el = document.createElement('div');
  el.id = 'ghoMissingBackdrop';
  el.className = 'gho-dialog-backdrop';
  el.style.display = 'flex';
  el.innerHTML = `
    <div class="gho-dialog gho-dialog-wide" onclick="event.stopPropagation()">
      <div class="gho-dialog-title">⚠ Ressources introuvables</div>
      <div class="gho-dialog-body">
        ${updatedCount > 0 ? `<p class="gho-missing-ok">✓ ${updatedCount} ressource(s) mise(s) à jour avec succès.</p>` : ''}
        <p class="gho-missing-warn">Les ressources suivantes sont absentes de la liste et n'ont <strong>pas</strong> été importées :</p>
        <ul class="gho-missing-list">${listHtml}</ul>
        <p class="gho-missing-hint">Importez d'abord ces ressources via <strong>↑ Import Liste</strong>, puis relancez l'import GHO.</p>
      </div>
      <div class="gho-dialog-footer">
        <button class="gho-dlg-save" onclick="document.getElementById('ghoMissingBackdrop').remove()">Fermer</button>
      </div>
    </div>`;
  el.onclick = () => el.remove();
  document.body.appendChild(el);
}

/* ── Reconstruction de la BASE FERME depuis les données GHO (import total) ──
   L'import GHO remplace INTÉGRALEMENT la base ferme.
   Les modifications planifiées (tâches _source:'planned') sont préservées dans
   le portfolio de travail via mergeFirmIntoWorking().
   Retourne { projectsCreated, tasksImported }
   ─────────────────────────────────────────────────────────────────────────────── */
function _upsertPortfolioFromGHO(taskData, taskAssignmentMap = {}, resetPlanned = false) {
  if (typeof _saveBackToPortfolio === 'function') _saveBackToPortfolio();

  let projectsCreated = 0;
  let tasksImported   = 0;
  let _idSeq          = 0;

  /* ── Regrouper les tâches par (clientName, projName) ── */
  const byProject = {};
  Object.values(taskData).forEach(task => {
    if (!task.projName || !task.tache) return;
    const pKey = `${task.clientName}|${task.projName}`;
    if (!byProject[pKey]) byProject[pKey] = { clientName: task.clientName, projName: task.projName, tasks: [] };
    byProject[pKey].tasks.push(task);
  });

  /* ── Construire les données de la base ferme ── */
  const newFirmData = [];

  Object.values(byProject).forEach(({ clientName, projName, tasks }) => {
    /* Réutiliser l'ID existant (work ou firm) ou en créer un nouveau */
    _idSeq++;
    const existWork = portfolio.find(p => p.name === projName && (p.client || '') === clientName);
    const existFirm = portfolioFirm.find(p => p.name === projName && (p.client || '') === clientName);
    const projId = existWork?.id || existFirm?.id ||
      `p_${Date.now()}_${_idSeq}_${Math.random().toString(36).slice(2, 6)}`;

    if (!existWork) projectsCreated++;

    const firmRows = [];
    tasks.forEach(task => {
      const { niveaux, tache, taskId, tKey, debut, fin } = task;
      if (!debut || !fin || isNaN(debut) || isNaN(fin)) return;
      const asgnKey     = `${projName}|${tKey || taskId || tache}`;
      const assignments = (taskAssignmentMap[asgnKey] || []).map(a => ({ ...a }));
      const totalCharge = assignments.reduce((s, a) => s + (a.charge || 0), 0);
      const charge      = totalCharge > 0 ? Math.round(totalCharge * 10000) / 10000 : null;
      firmRows.push({
        _type: 'tache', projet: projName, niveaux, tache, debut, fin, charge,
        chargePassee: null, chargeRestante: null,
        externalTaskId: taskId || null, assignments
      });
      tasksImported++;
    });

    newFirmData.push({
      id: projId, name: projName, client: clientName,
      folder:        existWork?.folder        || existFirm?.folder        || '',
      jalons:        existWork?.jalons        || existFirm?.jalons        || [],
      projectColors: existWork?.projectColors || existFirm?.projectColors || {},
      collapsed:     existWork?.collapsed     || existFirm?.collapsed     || {},
      rows: firmRows
    });
  });

  /* ── Notifier les conflits + fusionner + restaurer (callback-based) ── */
  function _finishGHOImport() {
    if (typeof mergeFirmIntoWorking === 'function') mergeFirmIntoWorking(newFirmData);
    if (resetPlanned && typeof _resetPlannedForFirmProjects === 'function') _resetPlannedForFirmProjects(newFirmData);
    /* Sauvegarder et restaurer la vue utilisateur (préserve le wallet) */
    savePortfolio();
    if (activeProjectId && !portfolio.find(p => p.id === activeProjectId)) {
      activeProjectId = null; multiViewMode = false;
    }
    selectedProjectIds.forEach(id => {
      if (!portfolio.find(p => p.id === id)) selectedProjectIds.delete(id);
    });
    if (activeProjectId && !selectedProjectIds.has(activeProjectId)) selectedProjectIds.add(activeProjectId);
    multiViewMode = selectedProjectIds.size > 1;
    if (!activeProjectId || selectedProjectIds.size === 0) {
      const first = portfolio.find(p => p.client && userWalletClients.has(p.client));
      if (first) { activeProjectId = first.id; selectedProjectIds.clear(); selectedProjectIds.add(first.id); multiViewMode = false; }
    }
    if (typeof _loadSelectedProjects === 'function') _loadSelectedProjects();
    if (typeof renderNavList === 'function') renderNavList();
    if (typeof renderAll === 'function') renderAll();
  }

  if (typeof saveFirmPortfolio === 'function') saveFirmPortfolio(newFirmData);
  if (typeof _notifyFirmConflicts === 'function') {
    _notifyFirmConflicts(newFirmData, _finishGHOImport);
  } else {
    _finishGHOImport();
  }

  return { projectsCreated, tasksImported };
}

function parseGHOExcel(buffer) {
  /* Format attendu (vertical) :
     [Société] | Activity Name | [Full Name] | ID Task | Task Name |
     [Start Date] | [End Date] | [Expended Effort] | [Remaining Effort] |
     Resource User | Date | Charge (J)
     Une ligne par jour/tâche/ressource. La charge est en jours (virgule décimale fr).
     Les colonnes entre crochets sont optionnelles. Si "Start Date" et "End Date" sont
     présentes, le portfolio (clients / projets / tâches) est créé ou mis à jour
     automatiquement. L'import XML reste complémentaire pour les jalons et le détail
     par ressource non couvert ici. */
  try {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS non disponible — vérifiez le chargement de la librairie.');
      return;
    }
    const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    if (raw.length < 2) { alert('Fichier vide ou format invalide.'); return; }

    /* ── Trouver la première ligne non-vide = en-têtes ── */
    let headerRowIdx = 0;
    while (headerRowIdx < raw.length && !(raw[headerRowIdx] || []).some(v => v != null)) headerRowIdx++;
    const header = (raw[headerRowIdx] || []).map(h => _normalizeExcelStr(h).toLowerCase());

    /* ── Helpers de détection ── */
    const _findCol = (patterns, label) => {
      const idx = header.findIndex(h => patterns.some(p => p.test(h)));
      if (idx < 0) { alert(`Colonne "${label}" introuvable dans le fichier.`); }
      return idx;
    };
    const _findColOpt = patterns => header.findIndex(h => patterns.some(p => p.test(h)));

    /* ── Colonnes optionnelles (portfolio) détectées en premier pour éviter
       les faux positifs sur les colonnes requises "Date" et "Charge" ── */
    const colClient    = _findColOpt([/soci[eé]t[eé]|company|organisation|\bclient\b/]);
    const colFullName  = _findColOpt([/full[\s_]+name|chemin|full[\s_]+path/]);
    const colStartDate = _findColOpt([/start[\s_]+date|d[eé]but[\s_]+t[aâ]che|date[\s_]+d[eé]but/]);
    const colEndDate   = _findColOpt([/end[\s_]+date|fin[\s_]+t[aâ]che|date[\s_]+fin/]);
    const colExpended  = _findColOpt([/expended[\s_]+effort|temps[\s_]+pass[eé]|charge[\s_]+pass[eé]/]);
    const colRemaining = _findColOpt([/remaining[\s_]+effort|temps[\s_]+restant|charge[\s_]+restante/]);

    /* ── Colonnes requises ── */
    const colRes      = _findCol([/ressource|resource[\s_-]?user|\buser\b|\bnom\b/],         'Resource / Ressource');
    const colProj     = _findCol([/activit[yé][\s_-]?name|scoped[\s_:]?with|activit[éye]|projet|project/], 'Activity Name / Projet');
    const colTaskId   = _findCol([/\bid[\s_-]?task\b|\btask[\s_-]?id\b/],                    'ID Task');
    const colTaskName = _findCol([/task[\s_:]+name|nom[\s_-]?t[aâ]che/],                      'Task Name');

    /* "Date" (charge ressource) : exclure les indices déjà pris par Start/End Date */
    const _skipDateIdx = new Set([colStartDate, colEndDate].filter(i => i >= 0));
    const colDate = (() => {
      const idx = header.findIndex((h, i) => !_skipDateIdx.has(i) && /\bdate\b/.test(h));
      if (idx < 0) alert('Colonne "Date" introuvable dans le fichier.');
      return idx;
    })();

    /* "Charge (J)" : on n'utilise PAS "effort" comme pattern (trop ambigu avec
       Expended/Remaining Effort). Le mécanisme _skipChargeIdx reste en sécurité. */
    const _skipChargeIdx = new Set([colExpended, colRemaining].filter(i => i >= 0));
    const colCharge = (() => {
      const idx = header.findIndex((h, i) => !_skipChargeIdx.has(i) && /\bcharge\b|^jours?\b|^load\b/.test(h));
      if (idx < 0) alert('Colonne "Charge (J)" introuvable dans le fichier.');
      return idx;
    })();

    if ([colRes, colProj, colDate, colCharge].some(c => c < 0)) return;

    /* L'import portfolio est activé si les colonnes de dates de tâche sont présentes */
    const doPortfolioImport = colStartDate >= 0 && colEndDate >= 0;

    /* ── Lecture des lignes ── */
    /* parsed  : { resName → { projName → { tKey → { taskId, taskName, daily } } } } */
    /* taskData: { 'client|proj|tKey' → task-level info } (si doPortfolioImport) */
    const parsed   = {};
    const taskData = {};
    /* seenRes : toutes les ressources rencontrées dans le fichier, même si Charge (J) = 0.
       Sert à vider les anciennes données GHO pour ces ressources même quand elles
       n'ont aucune charge réelle dans l'import courant. */
    const seenRes = new Set();

    for (let ri = headerRowIdx + 1; ri < raw.length; ri++) {
      const row = raw[ri];
      if (!row) continue;
      const projName = _normalizeExcelStr(row[colProj]);
      if (!projName) continue;

      const taskId   = colTaskId   >= 0 ? _normalizeExcelStr(row[colTaskId])   : '';
      const taskName = colTaskName >= 0 ? _normalizeExcelStr(row[colTaskName]) : '';
      const tKey     = taskId || taskName || '__default__';

      /* ── Collecte données portfolio (indépendante de la charge ressource) ──
         Exécutée pour toutes les lignes ayant un projet, même si Charge (J) est vide. */
      if (doPortfolioImport) {
        const clientName  = colClient   >= 0 ? (_normalizeExcelStr(row[colClient])   || '') : '';
        const fullNameRaw = colFullName >= 0 ? (_normalizeExcelStr(row[colFullName]) || '') : '';

        /* Déduire niveaux + nom de tâche depuis Full Name (séparateur ">") */
        const parts   = fullNameRaw ? fullNameRaw.split(/>/).map(s => s.trim()).filter(Boolean) : [];
        const niveaux = parts.length > 1 ? parts.slice(0, -1) : [];
        const tache   = parts.length > 0 ? parts[parts.length - 1] : (taskName || taskId);

        const dataKey = `${clientName}|${projName}|${tKey}`;
        if (!taskData[dataKey]) {
          /* Dates de la tâche (globales — pas celles de la ligne ressource) */
          const startStr  = _parseDateValue(row[colStartDate]);
          const endStr    = _parseDateValue(row[colEndDate]);
          const debutTask = startStr ? parseDate(startStr) : null;
          const finTask   = endStr   ? parseDate(endStr)   : null;

          const rawExp = colExpended  >= 0 ? row[colExpended]  : null;
          const rawRem = colRemaining >= 0 ? row[colRemaining] : null;
          const cpVal  = rawExp != null ? parseFloat(String(rawExp).replace(',', '.'))  : null;
          const crVal  = rawRem != null ? parseFloat(String(rawRem).replace(',', '.')) : null;

          taskData[dataKey] = {
            clientName, projName, niveaux, tache, taskId, tKey,
            debut:          debutTask,
            fin:            finTask,
            chargePassee:   (cpVal != null && !isNaN(cpVal)  && cpVal  >= 0) ? cpVal  : null,
            chargeRestante: (crVal != null && !isNaN(crVal) && crVal >= 0) ? crVal : null
          };
        }
      }

      /* ── Collecte données charge ressource ──
         La relation ressource↔tâche est enregistrée AVANT le test de date et AVANT le test de charge,
         pour que les ressources affectées sans charge journalière restent visibles même si
         aucune date n'est renseignée pour cette ligne dans le fichier GHO. */
      const resName = _normalizeExcelStr(row[colRes]);
      if (!resName) continue;

      /* Enregistrer la ressource comme "vue dans ce fichier" même si charge = 0 */
      seenRes.add(resName);

      /* Créer l'entrée parsed ressource↔tâche même sans date et même si charge = 0 :
         la relation d'affectation est enregistrée dès qu'une ligne existe pour cette ressource,
         quelle que soit la présence d'une date ou d'une charge journalière. */
      if (!parsed[resName])             parsed[resName]           = {};
      if (!parsed[resName][projName])   parsed[resName][projName] = {};
      if (!parsed[resName][projName][tKey]) {
        parsed[resName][projName][tKey] = { taskId, taskName: taskName || taskId, daily: {} };
      }

      const dateKey = _parseDateValue(row[colDate]);
      if (!dateKey) continue;

      const chargeRaw = row[colCharge];
      let jours = parseFloat(String(chargeRaw ?? '').replace(',', '.'));
      if (!jours || jours <= 0) continue; /* Charge nulle/vide → pas d'entrée daily */
      jours = snapToSixteenth(jours);

      const daily = parsed[resName][projName][tKey].daily;
      daily[dateKey] = Math.round(((daily[dateKey] || 0) + jours) * 10000) / 10000;
    }

    /* ── Construire la map ressource↔tâche pour peupler les assignments du portfolio ──
       Clé : 'projName|tKey' → [{ resourceId, resourceNom, charge?, daily?, debut?, fin? }]
       Construit à partir de parsed (déjà complet) et de resources[]. */
    const taskAssignmentMap = {};
    Object.entries(parsed).forEach(([resName, projMap]) => {
      const res = _findResourceByName(resName);
      if (!res) return;
      Object.entries(projMap).forEach(([pName, taskMap]) => {
        Object.entries(taskMap).forEach(([tKey, taskInfo]) => {
          const key = `${pName}|${tKey}`;
          if (!taskAssignmentMap[key]) taskAssignmentMap[key] = [];
          const daily = taskInfo.daily || {};
          let totalCharge = 0, minDate = null, maxDate = null;
          Object.entries(daily).forEach(([k, v]) => {
            if (v <= 0) return;
            totalCharge += v;
            const parts = k.split('/');
            if (parts.length === 3) {
              const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
              if (!minDate || d < minDate) minDate = new Date(d);
              if (!maxDate || d > maxDate) maxDate = new Date(d);
            }
          });
          const asgn = { resourceId: res.id, resourceNom: res.fullName || res.id };
          if (totalCharge > 0) {
            asgn.charge = Math.round(totalCharge * 10000) / 10000;
            asgn.daily  = { ...daily };
            if (minDate) asgn.debut = minDate;
            if (maxDate) asgn.fin   = maxDate;
          }
          taskAssignmentMap[key].push(asgn);
        });
      });
    });

    /* ── Mise à jour ghoData des ressources ── */
    const now        = new Date();
    const importDate = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
    const importTs   = Date.now(); // timestamp précis pour arbitrage lors des fusions Firebase
    const missing    = [];
    let   updated    = 0;

    /* 1. Ressources avec des charges effectives → mettre à jour */
    Object.entries(parsed).forEach(([resName, projMap]) => {
      const res = _findResourceByName(resName);
      if (!res) { missing.push(resName); return; }

      const projects = Object.entries(projMap)
        .map(([projName, taskMap]) => ({
          name : projName,
          tasks: Object.values(taskMap)  // inclut les tâches sans charge (daily:{}) pour conserver les assignations
        }))
        .filter(p => p.tasks.length > 0);

      /* Toujours écrire ghoData, même si projects est vide, pour écraser les anciennes données */
      res.ghoData = { importDate, importTs, projects };
      updated++;
    });

    /* 2. Ressources vues dans le fichier mais sans aucune charge réelle (Charge J = 0 partout)
          → vider explicitement leurs anciennes données GHO pour éviter les résidus */
    seenRes.forEach(resName => {
      if (parsed[resName]) return; /* Déjà traitée ci-dessus */
      const res = _findResourceByName(resName);
      if (!res) return; /* Introuvable — déjà dans missing si nécessaire */
      res.ghoData = { importDate, importTs, projects: [] }; /* Vide → plus de charges affichées */
    });

    saveResources(); // métadonnées → gantt_resources
    saveGhoData();   // charges/projets/tâches → gantt_gho
    _refreshResView();

    /* ── Mise à jour du portfolio : modal d'options si données disponibles ── */
    if (doPortfolioImport && Object.keys(taskData).length > 0 && typeof showImportModal === 'function') {
      const projCount = new Set(Object.values(taskData).map(t => `${t.clientName}|${t.projName}`)).size;
      const taskCount = Object.keys(taskData).length;
      const resMsg = missing.length > 0
        ? `${updated} ressource(s) mise(s) à jour, ${missing.length} introuvable(s).`
        : `${updated} ressource(s) mise(s) à jour.`;
      showImportModal(
        `${resMsg}\n${projCount} projet(s), ${taskCount} tâche(s) à importer dans le portfolio.`,
        (resetPlanned) => {
          const portfolioStats = _upsertPortfolioFromGHO(taskData, taskAssignmentMap, resetPlanned);
          if (missing.length > 0) {
            _showMissingResPopup(missing, updated);
          } else {
            const pMsg = `\n• ${portfolioStats.projectsCreated} projet(s) créé(s), ${portfolioStats.tasksImported} tâche(s) importées`;
            alert(`Import GHO ✓\n• ${updated} ressource(s) mise(s) à jour${pMsg}`);
          }
        }
      );
    } else {
      /* Pas de données portfolio (ou modal indisponible) → comportement direct */
      let portfolioStats = null;
      if (doPortfolioImport && Object.keys(taskData).length > 0) {
        portfolioStats = _upsertPortfolioFromGHO(taskData, taskAssignmentMap, false);
      }
      if (missing.length > 0) {
        _showMissingResPopup(missing, updated);
      } else {
        const pMsg = portfolioStats
          ? `\n• ${portfolioStats.projectsCreated} projet(s) créé(s), ${portfolioStats.tasksImported} tâche(s) importées`
          : '';
        alert(`Import GHO ✓\n• ${updated} ressource(s) mise(s) à jour${pMsg}`);
      }
    }
  } catch(err) {
    console.error('GHO import error:', err);
    alert('Erreur import GHO : ' + err.message);
  }
}

function _findResourceByName(fullName) {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
  const t = norm(fullName);
  return resources.find(r => norm(r.fullName || '') === t) || null;
}
