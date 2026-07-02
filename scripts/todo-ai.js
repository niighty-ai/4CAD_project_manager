/* ═══════════════════════════════════════════
   todo-ai.js — Import IA via Google Gemini
   Transcripts de réunion → tâches ou résumé
   ═══════════════════════════════════════════ */

const _AI_KEY_LS   = 'todoGeminiKey';
const _AI_MODEL_LS = 'todoGeminiModel';

function _aiKey() {
  if (window._GEMINI_KEY) return window._GEMINI_KEY;
  return localStorage.getItem(_AI_KEY_LS) || '';
}
function _aiModel() { return localStorage.getItem(_AI_MODEL_LS) || 'gemini-flash-lite-latest'; }

const _aiBase = () => `https://generativelanguage.googleapis.com/v1beta`;
const _aiUrl  = () => `${_aiBase()}/models/${_aiModel()}:generateContent?key=${_aiKey()}`;

const _aiStrip = s => (s || '').replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1');

let _aiExtractedTasks = [];

/* ── Modèles disponibles ── */
async function _aiFetchModels() {
  const key = _aiKey();
  if (!key) return [];
  const res = await fetch(`${_aiBase()}/models?key=${key}`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.models || [])
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => ({ id: m.name.replace('models/', ''), label: m.displayName || m.name.replace('models/', '') }))
    .sort((a, b) => {
      const score = id => id.includes('flash') ? 0 : id.includes('pro') ? 1 : 2;
      return score(a.id) - score(b.id);
    });
}

/* ══════════════════════════════════════════════════
   Modale transcript → analyse
   ══════════════════════════════════════════════════ */
async function _todoOpenAiModal() {
  document.getElementById('todoAiOverlay')?.remove();
  _aiExtractedTasks = [];

  /* Dossier courant (ignore vues virtuelles et boîte de réception) */
  const _curFolder =
    typeof _todoSelectedFolderId !== 'undefined' &&
    _todoSelectedFolderId &&
    !String(_todoSelectedFolderId).startsWith('view:') &&
    _todoSelectedFolderId !== 'inbox'
      ? _todoSelectedFolderId : null;

  const folders = _todoData.folders || [];
  const overlay = document.createElement('div');
  overlay.id = 'todoAiOverlay';
  overlay.className = 'todo-ai-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div class="todo-ai-modal" onclick="event.stopPropagation()">
      <div class="todo-ai-header">
        <div class="todo-ai-title">Import IA</div>
        <button class="todo-ai-x" onclick="document.getElementById('todoAiOverlay').remove()">&#x2715;</button>
      </div>
      <div class="todo-ai-body">
        <div>
          <label class="todo-ai-label">Texte à analyser</label>
          <textarea class="todo-ai-textarea" id="aiTranscript"
            placeholder="Collez votre transcript ici…"></textarea>
        </div>
        <div>
          <label class="todo-ai-label">Dossier de destination</label>
          <select class="todo-ai-select" id="aiFolder">
            <option value="">— Boîte de réception —</option>
            ${folders.map(f => `<option value="${f.id}" ${f.id === _curFolder ? 'selected' : ''}>${_esc(f.name)}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <button class="todo-ai-btn" id="aiAnalyzeBtn" onclick="_aiAnalyze()">
            Analyser avec Gemini
          </button>
          <span class="todo-ai-status" id="aiStatus"></span>
        </div>
        <div class="todo-ai-key-row">
          <select id="aiModelSelect" onchange="localStorage.setItem('${_AI_MODEL_LS}',this.value)"
                  style="font-size:10px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--muted)">
            <option value="">Chargement des modèles…</option>
          </select>
          &middot;
          <span class="todo-ai-key-link" onclick="_aiEditKey()">Modifier la clé API</span>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('aiTranscript')?.focus(), 50);

  if (!_aiKey()) { _aiSetStatus('Clé API manquante — cliquez sur "Modifier la clé API"', true); return; }
  _aiLoadModelSelector();
}

/* Ouvrir la modale IA Todo pré-remplie depuis le bloc-note */
async function _todoOpenAiFromNotes(aggregatedText) {
  await _todoOpenAiModal();
  const ta = document.getElementById('aiTranscript');
  if (ta) { ta.value = aggregatedText; ta.dispatchEvent(new Event('input')); }
}

async function _aiLoadModelSelector() {
  const select = document.getElementById('aiModelSelect');
  if (!select) return;
  try {
    const models = await _aiFetchModels();
    if (!models.length) {
      select.innerHTML = '<option value="">Aucun modèle disponible</option>';
      _aiSetStatus('Vérifiez votre clé API', true);
      return;
    }
    const saved = _aiModel();
    select.innerHTML = models.map(m =>
      `<option value="${m.id}" ${(saved || models[0].id) === m.id ? 'selected' : ''}>${m.label}</option>`
    ).join('');
    if (!saved) localStorage.setItem(_AI_MODEL_LS, models[0].id);
  } catch {
    select.innerHTML = '<option value="">Erreur de chargement</option>';
  }
}

function _aiSetStatus(msg, isError = false) {
  const el = document.getElementById('aiStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#db4035' : 'var(--muted)';
}

async function _aiAnalyze() {
  const transcript = document.getElementById('aiTranscript')?.value.trim();
  if (!transcript) { _aiSetStatus('Collez un transcript avant d\'analyser.', true); return; }
  const btn = document.getElementById('aiAnalyzeBtn');
  btn.disabled = true;
  _aiSetStatus('Analyse en cours…');
  try {
    await _aiExtractTasks(transcript);
  } catch (e) {
    _aiSetStatus('Erreur : ' + (e.message || 'Réponse invalide'), true);
  } finally {
    btn.disabled = false;
  }
}

async function _aiExtractTasks(transcript) {
  const prompt = `Tu es un assistant de gestion de projet. Analyse ce transcript de réunion et extrais toutes les tâches et actions à réaliser.

Pour chaque tâche, extrais :
- title : titre court et clair (obligatoire)
- description : détails supplémentaires si disponibles (chaîne vide sinon)
- assignees : tableau des noms des responsables explicitement mentionnés (tableau vide sinon)
- dueDate : date au format YYYY-MM-DD si explicitement mentionnée, sinon null

Retourne UNIQUEMENT un objet JSON valide :
{"tasks":[{"title":"...","description":"...","assignees":[],"dueDate":null}]}

Transcript :
${transcript}`;

  const raw    = await _aiCall(prompt);
  const parsed = _aiParseJson(raw);

  if (!parsed.tasks?.length) { _aiSetStatus('Aucune tâche détectée dans ce transcript.', true); return; }

  /* Initialise les propriétés brouillon sur chaque tâche */
  _aiExtractedTasks = parsed.tasks.map(t => ({
    ...t,
    _included:   true,
    _priority:   'P4',
    _typeName:   'Divers',
    _statusName: 'Divers',
    _dueDate:    t.dueDate ? new Date(t.dueDate + 'T12:00:00').toISOString() : null
  }));

  /* Mémorise le dossier choisi puis ouvre la review modal */
  const folderId = document.getElementById('aiFolder')?.value || null;
  _aiShowReviewModal(folderId);
}

/* ══════════════════════════════════════════════════
   Review modal — révision avant création
   ══════════════════════════════════════════════════ */
function _aiShowReviewModal(folderId) {
  document.getElementById('todoAiOverlay')?.remove();
  document.getElementById('todoAiReviewOverlay')?.remove();

  const folders = _todoData.folders || [];
  const overlay = document.createElement('div');
  overlay.id = 'todoAiReviewOverlay';
  overlay.className = 'todo-ai-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div class="todo-ai-review-modal" onclick="event.stopPropagation()">

      <div class="todo-ai-header">
        <div class="todo-ai-title">
          ${_aiExtractedTasks.length} tâche(s) détectée(s)
          <span style="font-size:11px;font-weight:400;color:var(--muted);margin-left:8px">
            Cliquez sur les vignettes pour définir les propriétés
          </span>
        </div>
        <button class="todo-ai-x" onclick="document.getElementById('todoAiReviewOverlay').remove()">&#x2715;</button>
      </div>

      <div class="ai-review-toolbar">
        <span style="font-size:11px;color:var(--muted);white-space:nowrap">Dossier :</span>
        <select class="todo-ai-select" id="aiReviewFolder" style="flex:0 0 auto;width:auto;min-width:140px">
          <option value="">— Boîte de réception —</option>
          ${folders.map(f => `<option value="${f.id}" ${f.id === folderId ? 'selected' : ''}>${_esc(f.name)}</option>`).join('')}
        </select>
      </div>

      <div class="ai-review-list" id="aiReviewList"></div>

      <div class="ai-review-footer">
        <button class="todo-ai-btn todo-ai-btn-confirm" onclick="_aiConfirmReview()">
          Créer les tâches sélectionnées
        </button>
        <span class="todo-ai-status" id="aiReviewStatus"></span>
      </div>

    </div>`;

  document.body.appendChild(overlay);
  _aiRenderReviewCards();
}

function _aiRenderReviewCards() {
  const list = document.getElementById('aiReviewList');
  if (!list) return;
  list.innerHTML = _aiExtractedTasks.map((t, i) => _aiReviewCardHtml(t, i)).join('');
}

function _aiReviewCardHtml(t, i) {
  const pColors = { P1: '#db4035', P2: '#ff9a14', P3: '#4073ff', P4: '#aaa' };

  /* Priorité */
  const pPill = t._priority
    ? `<span class="todo-pill todo-pill-priority ${t._priority.toLowerCase()} todo-pill-clickable"
               onclick="event.stopPropagation();_aiDraftPillEdit(event,'priority',${i})">${t._priority}</span>`
    : `<span class="todo-pill ai-pill-empty todo-pill-clickable"
               onclick="event.stopPropagation();_aiDraftPillEdit(event,'priority',${i})">Priorité</span>`;

  /* Type */
  const typeObj   = _todoData.settings.taskTypes.find(x => (typeof x==='object'?x.name:x) === t._typeName);
  const typeColor = typeObj ? (typeof typeObj==='object' ? typeObj.color||'#546e7a' : '#546e7a') : '#546e7a';
  const tPill = t._typeName
    ? `<span class="todo-pill todo-pill-type todo-pill-clickable" style="--c:${typeColor}"
               onclick="event.stopPropagation();_aiDraftPillEdit(event,'type',${i})">${_esc(t._typeName)}</span>`
    : `<span class="todo-pill ai-pill-empty todo-pill-clickable"
               onclick="event.stopPropagation();_aiDraftPillEdit(event,'type',${i})">Type</span>`;

  /* Statut */
  const stObj    = _todoData.settings.taskStatuses.find(x => (typeof x==='object'?x.name:x) === t._statusName);
  const stColor  = stObj ? (typeof stObj==='object' ? stObj.color||'#546e7a' : '#546e7a') : '#546e7a';
  const sPill = t._statusName
    ? `<span class="todo-pill todo-pill-status todo-pill-clickable" style="--c:${stColor}"
               onclick="event.stopPropagation();_aiDraftPillEdit(event,'status',${i})">${_esc(t._statusName)}</span>`
    : `<span class="todo-pill ai-pill-empty todo-pill-clickable"
               onclick="event.stopPropagation();_aiDraftPillEdit(event,'status',${i})">Statut</span>`;

  /* Échéance */
  const dPill = t._dueDate
    ? `<span class="todo-pill todo-pill-date todo-pill-clickable"
               onclick="event.stopPropagation();_aiDraftPillEdit(event,'dueDate',${i})">
         <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
           <rect x="3" y="4" width="18" height="18" rx="2"/>
           <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
           <line x1="3" y1="10" x2="21" y2="10"/>
         </svg>
         ${_todoFmtDate(t._dueDate)}</span>`
    : `<span class="todo-pill ai-pill-empty todo-pill-clickable"
               onclick="event.stopPropagation();_aiDraftPillEdit(event,'dueDate',${i})">
         <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
           <rect x="3" y="4" width="18" height="18" rx="2"/>
           <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
           <line x1="3" y1="10" x2="21" y2="10"/>
         </svg>
         Échéance</span>`;

  const excluded = t._included === false;
  return `
    <div class="ai-review-card ${excluded ? 'ai-review-card-excluded' : ''}" id="aiCard_${i}">
      <label class="ai-review-check" title="${excluded ? 'Inclure' : 'Exclure'}">
        <input type="checkbox" ${excluded ? '' : 'checked'}
               onchange="_aiDraftToggle(${i},this.checked)">
      </label>
      <div class="ai-review-body">
        <input class="ai-review-title" value="${_esc(t.title)}"
               oninput="_aiExtractedTasks[${i}].title=this.value">
        ${t.description ? `<div class="ai-review-desc">${_esc(t.description)}</div>` : ''}
        ${t.assignees?.length ? `<div class="ai-review-desc" style="color:var(--muted)">Responsable(s) : ${t.assignees.map(_esc).join(', ')}</div>` : ''}
        <div class="ai-review-pills">${pPill}${tPill}${sPill}${dPill}</div>
      </div>
    </div>`;
}

function _aiDraftToggle(idx, checked) {
  _aiExtractedTasks[idx]._included = checked;
  const card = document.getElementById(`aiCard_${idx}`);
  if (card) card.classList.toggle('ai-review-card-excluded', !checked);
}

/* ── Dropdown de propriété sur les brouillons ── */
function _aiDraftPillEdit(event, field, idx) {
  document.querySelector('.todo-pill-dropdown')?.remove();
  const t = _aiExtractedTasks[idx];
  if (!t) return;

  const rect = event.currentTarget.getBoundingClientRect();
  const drop = document.createElement('div');
  drop.className = 'todo-pill-dropdown';
  drop.style.cssText = 'position:fixed;z-index:3000;min-width:160px;background:var(--surface);' +
    'border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px var(--shadow);padding:4px 0;';

  let html = '';
  if (field === 'priority') {
    const pCol = { P1:'#db4035', P2:'#ff9a14', P3:'#4073ff', P4:'#aaa' };
    html += `<div class="todo-pill-opt ${!t._priority?'selected':''}"
                  onclick="_aiDraftPillSet(${idx},'priority','')">— Aucune —</div>`;
    ['P1','P2','P3','P4'].forEach(p => {
      html += `<div class="todo-pill-opt ${t._priority===p?'selected':''}"
                    onclick="_aiDraftPillSet(${idx},'priority','${p}')">
        <span class="todo-pill-opt-dot" style="background:${pCol[p]}"></span>${p}</div>`;
    });
  } else if (field === 'type') {
    html += `<div class="todo-pill-opt ${!t._typeName?'selected':''}"
                  onclick="_aiDraftPillSet(${idx},'type','')">— Aucun —</div>`;
    _todoData.settings.taskTypes.forEach(s => {
      const n = typeof s==='object'?s.name:s, c = typeof s==='object'?(s.color||'#546e7a'):'#546e7a';
      html += `<div class="todo-pill-opt ${t._typeName===n?'selected':''}"
                    onclick="_aiDraftPillSet(${idx},'type','${_esc(n)}')">
        <span class="todo-pill-opt-dot" style="background:${c}"></span>${_esc(n)}</div>`;
    });
  } else if (field === 'status') {
    html += `<div class="todo-pill-opt ${!t._statusName?'selected':''}"
                  onclick="_aiDraftPillSet(${idx},'status','')">— Aucun —</div>`;
    _todoData.settings.taskStatuses.forEach(s => {
      const n = typeof s==='object'?s.name:s, c = typeof s==='object'?(s.color||'#546e7a'):'#546e7a';
      html += `<div class="todo-pill-opt ${t._statusName===n?'selected':''}"
                    onclick="_aiDraftPillSet(${idx},'status','${_esc(n)}')">
        <span class="todo-pill-opt-dot" style="background:${c}"></span>${_esc(n)}</div>`;
    });
  } else if (field === 'dueDate') {
    html = `<div style="padding:8px">
      <input type="date" value="${t._dueDate?t._dueDate.slice(0,10):''}"
             style="border:1px solid var(--border);border-radius:5px;padding:5px 8px;
                    background:var(--surface2);color:var(--text);font-size:12px;outline:none"
             onchange="_aiDraftPillSet(${idx},'dueDate',this.value)">
      <div style="margin-top:6px;text-align:right">
        <span style="font-size:11px;color:var(--muted);cursor:pointer"
              onclick="_aiDraftPillSet(${idx},'dueDate','')">Effacer</span>
      </div></div>`;
  }

  drop.innerHTML = html;
  document.body.appendChild(drop);

  const dr = drop.getBoundingClientRect();
  let top = rect.bottom + 4, left = rect.left;
  if (top + dr.height > window.innerHeight) top = rect.top - dr.height - 4;
  if (left + dr.width  > window.innerWidth)  left = window.innerWidth - dr.width - 8;
  drop.style.top = top + 'px'; drop.style.left = left + 'px';

  setTimeout(() => document.addEventListener('click', function h(e) {
    if (!drop.contains(e.target)) { drop.remove(); document.removeEventListener('click', h, true); }
  }, true), 0);
}

function _aiDraftPillSet(idx, field, value) {
  document.querySelector('.todo-pill-dropdown')?.remove();
  const t = _aiExtractedTasks[idx];
  if (!t) return;
  if      (field === 'priority') t._priority   = value || null;
  else if (field === 'type')     t._typeName   = value || null;
  else if (field === 'status')   t._statusName = value || null;
  else if (field === 'dueDate')  t._dueDate    = value ? new Date(value + 'T12:00:00').toISOString() : null;

  /* Remplace la carte sans perdre la position de scroll */
  const card = document.getElementById(`aiCard_${idx}`);
  if (card) {
    const tmp = document.createElement('div');
    tmp.innerHTML = _aiReviewCardHtml(t, idx);
    card.replaceWith(tmp.firstElementChild);
  }
}

/* ── Confirmation finale ── */
function _aiConfirmReview() {
  const folderId = document.getElementById('aiReviewFolder')?.value || null;
  const toCreate = _aiExtractedTasks.filter(t => t._included !== false);

  if (!toCreate.length) {
    const s = document.getElementById('aiReviewStatus');
    if (s) { s.textContent = 'Sélectionnez au moins une tâche.'; s.style.color = '#db4035'; }
    return;
  }

  toCreate.forEach(t => {
    const created = _todoCreateTask(t.title, folderId || null);
    const patch = {};
    if (t.description)       patch.description = t.description;
    if (t._dueDate)          patch.dueDate      = t._dueDate;
    if (t._priority)         patch.priority     = t._priority;
    if (t._typeName)         patch.type         = t._typeName;
    if (t._statusName)       patch.status       = t._statusName;
    if (t.assignees?.length) patch.assignees    = t.assignees.map(n => ({ name: n }));
    if (Object.keys(patch).length) _todoUpdateTask(created.id, patch);
  });

  _todoRenderTaskList();
  _todoRenderSidebar();
  _todoShowToast(`${toCreate.length} tâche(s) créée(s)`);
  document.getElementById('todoAiReviewOverlay')?.remove();
}

/* ── Appel Gemini ── */
async function _aiCall(prompt) {
  const res = await fetch(_aiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Réponse vide de Gemini');
  return text;
}

function _aiParseJson(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return JSON.parse(m ? m[1] : text.trim());
}

/* ── Mise à jour de la clé API ── */
function _aiEditKey() {
  const newKey = prompt('Clé API Google Gemini :', _aiKey());
  if (newKey !== null && newKey.trim()) {
    localStorage.setItem(_AI_KEY_LS, newKey.trim());
    localStorage.removeItem(_AI_MODEL_LS);
    _aiSetStatus('Chargement des modèles…');
    document.getElementById('aiModelSelect').innerHTML = '<option value="">Chargement…</option>';
    _aiLoadModelSelector();
  }
}

/* ══════════════════════════════════════════════════════
   Popup IA inline — résumé de transcript dans un champ
   ══════════════════════════════════════════════════════ */
/* ── Correction IA générique (partagée Suivi + Todo) ── */
const _AI_CORRECT_PROMPT = text =>
  `Tu es un assistant de rédaction professionnel. Corrige le texte suivant : orthographe, grammaire et typographie (ponctuation, espaces, guillemets). Ne modifie pas le sens ni le contenu des phrases. Retourne UNIQUEMENT le texte corrigé, sans guillemets ni explication.\n\nTexte :\n${text}`;

async function _aiCorrectAndShowPopup({ text, btnEl, popupId, cssExtra = '', onApply, toastFn }) {
  if (!text.trim()) return;
  const showErr = msg => typeof toastFn === 'function' ? toastFn(msg) : alert(msg);
  if (!_aiKey || !_aiKey()) { showErr('Clé API Gemini manquante — configurez-la dans Paramètres > IA'); return; }

  document.getElementById(popupId)?.remove();
  btnEl.disabled = true;
  if (typeof _suiviAiShowLoader === 'function') _suiviAiShowLoader();

  let corrected = '';
  try {
    corrected = (await _aiCall(_AI_CORRECT_PROMPT(text)) || '').trim();
  } catch(e) {
    if (typeof _suiviAiHideLoader === 'function') _suiviAiHideLoader();
    btnEl.disabled = false;
    showErr('Erreur Gemini : ' + (e.message || '?'));
    return;
  }
  if (typeof _suiviAiHideLoader === 'function') _suiviAiHideLoader();
  btnEl.disabled = false;

  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const popup = document.createElement('div');
  popup.id = popupId;
  popup.className = 'suivi-ai-popup';
  if (cssExtra) popup.style.cssText = (popup.style.cssText || '') + ';' + cssExtra;

  const textNodeId = popupId + '_text';
  popup.innerHTML = `
    <div class="suivi-ai-popup-label">✦ Suggestion IA</div>
    <div class="suivi-ai-popup-text" id="${textNodeId}">${esc(corrected)}</div>
    <div class="suivi-ai-popup-actions">
      <button class="suivi-ai-popup-accept" id="${popupId}_apply">Appliquer</button>
      <button class="suivi-ai-popup-cancel" onclick="document.getElementById('${popupId}')?.remove()">Annuler</button>
    </div>`;

  /* Positionnement sous (ou au-dessus) du bouton */
  const rect   = btnEl.getBoundingClientRect();
  const left   = Math.max(8, Math.min(rect.left - 200, window.innerWidth - 420));
  popup.style.position = 'fixed';
  popup.style.left     = left + 'px';
  if (rect.top - 120 >= 0) {
    popup.style.bottom    = (window.innerHeight - rect.top + 6) + 'px';
    popup.style.top       = '';
  } else {
    popup.style.top       = (rect.bottom + 6) + 'px';
    popup.style.bottom    = '';
  }

  document.body.appendChild(popup);

  document.getElementById(popupId + '_apply').addEventListener('click', (e) => {
    e.stopPropagation();
    const txt = document.getElementById(textNodeId)?.textContent || '';
    onApply(txt);
    popup.remove();
  });

  setTimeout(() => {
    document.addEventListener('click', function _closeAiCorr(e) {
      const p = document.getElementById(popupId);
      if (!p) { document.removeEventListener('click', _closeAiCorr, true); return; }
      if (!p.contains(e.target) && e.target !== btnEl) {
        p.remove();
        document.removeEventListener('click', _closeAiCorr, true);
      }
    }, true);
  }, 50);
}

/* Entrée Todo (description + commentaire) */
function _aiOpenFieldPopup(textareaId, btnEl) {
  const ta = document.getElementById(textareaId);
  if (!ta) return;
  _aiCorrectAndShowPopup({
    text:    ta.value,
    btnEl,
    popupId: 'tmAiFieldPopup',
    onApply: corrected => {
      ta.value = corrected;
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
      ta.dispatchEvent(new Event('input'));
      /* Mettre à jour la vue et sauvegarder selon le champ */
      if (textareaId === 'tmTitle' && typeof _tmSaveTitle === 'function') _tmSaveTitle();
      else if (textareaId === 'tmDesc' && typeof _tmSaveDesc === 'function') _tmSaveDesc();
    }
  });
}
