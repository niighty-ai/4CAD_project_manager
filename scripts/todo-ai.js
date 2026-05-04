/* ═══════════════════════════════════════════
   todo-ai.js — Import IA via Google Gemini Flash
   Transcripts de réunion → tâches ou résumé
   ═══════════════════════════════════════════ */

const _AI_KEY_LS   = 'todoGeminiKey';
const _AI_MODEL_LS = 'todoGeminiModel';

const _AI_MODELS = [
  { id: 'gemini-1.5-flash-8b',            label: 'Gemini 1.5 Flash 8B (free tier)' },
  { id: 'gemini-1.5-flash-latest',        label: 'Gemini 1.5 Flash' },
  { id: 'gemini-2.0-flash-lite',          label: 'Gemini 2.0 Flash Lite' },
  { id: 'gemini-2.0-flash',               label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.5-flash-preview-04-17', label: 'Gemini 2.5 Flash Preview' },
];

function _aiKey() {
  /* Toujours écraser si la clé stockée est l'ancienne révoquée */
  const stored = localStorage.getItem(_AI_KEY_LS);
  const legacy = 'AIzaSyAlmN7ocL9sfNGkSCBH5yZTFSVHCTo2s2o';
  if (!stored || stored === legacy) {
    localStorage.setItem(_AI_KEY_LS, 'AIzaSyDYxmdPwvaP-mbBNnBBV78gIQvJ3m9x5nU');
  }
  return localStorage.getItem(_AI_KEY_LS);
}
function _aiModel() {
  return localStorage.getItem(_AI_MODEL_LS) || _AI_MODELS[0].id;
}

const _aiUrl = () =>
  `https://generativelanguage.googleapis.com/v1/models/${_aiModel()}:generateContent?key=${_aiKey()}`;

/* Texte brut sans syntaxe [texte](url) */
const _aiStrip = s => (s || '').replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1');

let _aiMode = 'tasks';
let _aiExtractedTasks = [];

/* ── Ouverture de la modale ── */
function _todoOpenAiModal() {
  document.getElementById('todoAiOverlay')?.remove();
  _aiMode = 'tasks';
  _aiExtractedTasks = [];

  const folders = _todoData.folders || [];
  const tasks   = (_todoData.tasks  || []).filter(t => !t.parentId);

  const overlay = document.createElement('div');
  overlay.id = 'todoAiOverlay';
  overlay.className = 'todo-ai-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div class="todo-ai-modal" onclick="event.stopPropagation()">

      <div class="todo-ai-header">
        <div class="todo-ai-title">Import IA — Transcript de réunion</div>
        <button class="todo-ai-x" onclick="document.getElementById('todoAiOverlay').remove()">&#x2715;</button>
      </div>

      <div class="todo-ai-tabs">
        <div class="todo-ai-tab active" id="aiTabTasks"    onclick="_aiSwitchTab('tasks')">Créer des tâches</div>
        <div class="todo-ai-tab"        id="aiTabSummary"  onclick="_aiSwitchTab('summary')">Résumé en commentaire</div>
      </div>

      <div class="todo-ai-body">

        <div>
          <label class="todo-ai-label">Transcript de réunion</label>
          <textarea class="todo-ai-textarea" id="aiTranscript"
            placeholder="Collez votre transcript ici…"></textarea>
        </div>

        <div id="aiOptTasks">
          <label class="todo-ai-label">Dossier de destination</label>
          <select class="todo-ai-select" id="aiFolder">
            <option value="">— Boîte de réception —</option>
            ${folders.map(f => `<option value="${f.id}">${_esc(f.name)}</option>`).join('')}
          </select>
        </div>

        <div id="aiOptSummary" style="display:none">
          <label class="todo-ai-label">Ajouter le résumé à la tâche</label>
          <select class="todo-ai-select" id="aiTaskTarget">
            <option value="">— Sélectionner une tâche —</option>
            ${tasks.map(t => `<option value="${t.id}">${_esc(_aiStrip(t.title))}</option>`).join('')}
          </select>
        </div>

        <div style="display:flex;align-items:center;gap:12px">
          <button class="todo-ai-btn" id="aiAnalyzeBtn" onclick="_aiAnalyze()">
            Analyser avec Gemini
          </button>
          <span class="todo-ai-status" id="aiStatus"></span>
        </div>

        <div id="aiResults" style="display:none;margin-top:4px">
          <div class="todo-ai-results-title" id="aiResultsTitle"></div>
          <div id="aiResultsBody"></div>
          <button class="todo-ai-btn todo-ai-btn-confirm" onclick="_aiConfirm()" style="margin-top:10px">
            Confirmer
          </button>
        </div>

        <div class="todo-ai-key-row">
          <select id="aiModelSelect" onchange="localStorage.setItem('todoGeminiModel',this.value)"
                  style="font-size:10px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--muted)">
            ${_AI_MODELS.map(m => `<option value="${m.id}" ${_aiModel()===m.id?'selected':''}>${m.label}</option>`).join('')}
          </select>
          &middot;
          <span class="todo-ai-key-link" onclick="_aiEditKey()">Modifier la clé API</span>
        </div>

      </div>
    </div>`;

  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('aiTranscript')?.focus(), 50);
}

/* ── Bascule entre les onglets ── */
function _aiSwitchTab(mode) {
  _aiMode = mode;
  document.getElementById('aiTabTasks')?.classList.toggle('active',   mode === 'tasks');
  document.getElementById('aiTabSummary')?.classList.toggle('active', mode === 'summary');
  document.getElementById('aiOptTasks').style.display   = mode === 'tasks'   ? '' : 'none';
  document.getElementById('aiOptSummary').style.display = mode === 'summary' ? '' : 'none';
  document.getElementById('aiResults').style.display = 'none';
  _aiSetStatus('');
}

function _aiSetStatus(msg, isError = false) {
  const el = document.getElementById('aiStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#db4035' : 'var(--muted)';
}

/* ── Lancement de l'analyse ── */
async function _aiAnalyze() {
  const transcript = document.getElementById('aiTranscript')?.value.trim();
  if (!transcript) { _aiSetStatus('Collez un transcript avant d\'analyser.', true); return; }

  document.getElementById('aiResults').style.display = 'none';
  const btn = document.getElementById('aiAnalyzeBtn');
  btn.disabled = true;
  _aiSetStatus('Analyse en cours…');

  try {
    if (_aiMode === 'tasks') await _aiExtractTasks(transcript);
    else                     await _aiSummarize(transcript);
  } catch (e) {
    _aiSetStatus('Erreur : ' + (e.message || 'Réponse invalide'), true);
  } finally {
    btn.disabled = false;
  }
}

/* ── Extraction de tâches ── */
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
  _aiExtractedTasks = parsed.tasks || [];

  if (!_aiExtractedTasks.length) {
    _aiSetStatus('Aucune tâche détectée dans ce transcript.', true);
    return;
  }

  _aiSetStatus(`${_aiExtractedTasks.length} tâche(s) détectée(s)`);

  document.getElementById('aiResultsBody').innerHTML = _aiExtractedTasks.map((t, i) => `
    <div class="todo-ai-task-row">
      <label class="todo-ai-check-label">
        <input type="checkbox" checked data-idx="${i}" class="ai-task-cb">
        <div style="flex:1;min-width:0">
          <div class="todo-ai-task-title">${_esc(t.title)}</div>
          ${t.description ? `<div class="todo-ai-task-desc">${_esc(t.description)}</div>` : ''}
          ${t.assignees?.length ? `<div class="todo-ai-task-meta">Responsable(s) : ${t.assignees.map(_esc).join(', ')}</div>` : ''}
          ${t.dueDate        ? `<div class="todo-ai-task-meta">Échéance : ${t.dueDate}</div>` : ''}
        </div>
      </label>
    </div>`).join('');

  document.getElementById('aiResultsTitle').textContent = 'Tâches à créer :';
  document.getElementById('aiResults').style.display = '';
}

/* ── Résumé en commentaire ── */
async function _aiSummarize(transcript) {
  const prompt = `Tu es un assistant de gestion de projet. Fais un résumé concis en français de ce transcript de réunion.
Utilise des tirets (-) pour structurer les points.
Inclus : décisions prises, points clés abordés, actions identifiées, prochaines étapes.
Retourne uniquement le texte du résumé, sans titre ni introduction.

Transcript :
${transcript}`;

  const summary = await _aiCall(prompt);

  const body = document.getElementById('aiResultsBody');
  body.innerHTML = `<textarea class="todo-ai-summary-edit" id="aiSummaryText"
    oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,300)+'px'"
    >${_esc(summary)}</textarea>`;

  setTimeout(() => {
    const ta = document.getElementById('aiSummaryText');
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 300) + 'px'; }
  }, 0);

  document.getElementById('aiResultsTitle').textContent = 'Résumé (modifiable avant ajout) :';
  document.getElementById('aiResults').style.display = '';
  _aiSetStatus('Résumé généré');
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

/* Extrait le JSON d'une réponse qui peut contenir des blocs ```json … ``` */
function _aiParseJson(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return JSON.parse(m ? m[1] : text.trim());
}

/* ── Confirmation ── */
function _aiConfirm() {
  if (_aiMode === 'tasks') {
    const folderId = document.getElementById('aiFolder')?.value || null;
    const checked  = [...document.querySelectorAll('.ai-task-cb:checked')];
    if (!checked.length) { _aiSetStatus('Cochez au moins une tâche.', true); return; }

    checked.forEach(cb => {
      const t = _aiExtractedTasks[+cb.dataset.idx];
      if (!t) return;
      const created = _todoCreateTask(t.title, folderId || null);
      const patch = {};
      if (t.description)   patch.description = t.description;
      if (t.dueDate)       patch.dueDate      = t.dueDate;
      if (t.assignees?.length) patch.assignees = t.assignees.map(n => ({ name: n }));
      if (Object.keys(patch).length) _todoUpdateTask(created.id, patch);
    });

    _todoRenderTaskList();
    _todoRenderSidebar();
    _todoShowToast(`${checked.length} tâche(s) créée(s)`);
    document.getElementById('todoAiOverlay')?.remove();

  } else {
    const taskId  = document.getElementById('aiTaskTarget')?.value;
    const summary = document.getElementById('aiSummaryText')?.value.trim();
    if (!taskId)  { _aiSetStatus('Sélectionnez une tâche de destination.', true); return; }
    if (!summary) { _aiSetStatus('Le résumé est vide.', true); return; }

    _todoAddComment(taskId, summary);
    _todoRenderTaskList();
    _todoShowToast('Résumé ajouté en commentaire');
    document.getElementById('todoAiOverlay')?.remove();
  }
}

/* ── Mise à jour de la clé API ── */
function _aiEditKey() {
  const newKey = prompt('Clé API Google Gemini :', _aiKey());
  if (newKey !== null && newKey.trim()) {
    localStorage.setItem(_AI_KEY_LS, newKey.trim());
    _aiSetStatus('Clé API mise à jour');
  }
}
