/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   THE BRIEF — passphrase gate + role→résumé + résumé→evidence
   Deterministic, in-browser. Reuses window.JHBrain / window.JHConstellation
   from constellation.js. Nothing typed here leaves the page.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(() => {
  'use strict';

  /* ── passphrase gate ─────────────────────────────────────────────
     Change the passphrase by replacing EXPECTED with the djb2 hash of
     your new phrase. Current phrase: "jazmia26".
     To rehash: djb2(str) below, e.g. in the console: djb2("newphrase").
     Not fortress security — it keeps casual visitors and crawlers out. */
  const EXPECTED = '9e4b7709';
  function djb2(s) { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) >>> 0; return x.toString(16); }

  const gate = document.getElementById('gate');
  const gateForm = document.getElementById('gate-form');
  const gateInput = document.getElementById('gate-input');
  const gateError = document.getElementById('gate-error');

  function unlock() { gate.classList.add('is-open'); try { sessionStorage.setItem('jh-brief', '1'); } catch (_) {} }
  function tryPhrase(p) {
    if (p && djb2(p.trim().toLowerCase()) === EXPECTED) { unlock(); return true; }
    return false;
  }

  // already unlocked this session, or ?#key=… in the URL
  const hashKey = (location.hash.match(/key=([^&]+)/) || [])[1];
  if ((() => { try { return sessionStorage.getItem('jh-brief') === '1'; } catch (_) { return false; } })()) unlock();
  else if (hashKey && tryPhrase(decodeURIComponent(hashKey))) { /* opened */ }

  gateForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!tryPhrase(gateInput.value)) { gateError.classList.add('is-shown'); gateInput.select(); }
  });

  /* ── brief sheet open/close ──────────────────────────────────────── */
  const brief = document.getElementById('brief');
  const toggle = document.getElementById('brief-toggle');
  const closeBtn = document.getElementById('brief-close');
  function openBrief() {
    brief.classList.add('is-open');
    if (window.JHConstellation) window.JHConstellation.setInsets(brief.offsetWidth || 600, 0);
  }
  function closeBrief() {
    brief.classList.remove('is-open');
    if (window.JHConstellation) window.JHConstellation.setInsets(0, 0);
  }
  toggle.addEventListener('click', openBrief);
  closeBtn.addEventListener('click', closeBrief);

  /* ── mode switch ─────────────────────────────────────────────────── */
  const modeRole = document.getElementById('mode-role');
  const modeResume = document.getElementById('mode-resume');
  const input = document.getElementById('brief-input');
  const output = document.getElementById('brief-output');
  let mode = 'role';

  function setMode(m) {
    mode = m;
    modeRole.setAttribute('aria-selected', String(m === 'role'));
    modeResume.setAttribute('aria-selected', String(m === 'resume'));
    input.placeholder = m === 'role'
      ? 'Paste the job description / role requirements here…'
      : 'Paste an existing résumé (hers or a candidate spec) here — the map will light where each claim is proven…';
  }
  modeRole.addEventListener('click', () => setMode('role'));
  modeResume.addEventListener('click', () => setMode('resume'));

  document.getElementById('brief-clear').addEventListener('click', () => {
    input.value = ''; output.innerHTML = '';
    window.JHConstellation && window.JHConstellation.reset();
  });
  document.getElementById('brief-generate').addEventListener('click', generate);

  /* ── helpers ─────────────────────────────────────────────────────── */
  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const B = () => window.JHBrain;

  function scoreMap(text) {
    const m = {};
    B().search(text).forEach((s) => { m[s.node.id] = s.score; });
    return m;
  }
  const pretty = (t) => t.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  function themeSentence(themes) {
    const t = themes.slice(0, 3).map((x) => x.toLowerCase()
      .replace('llms / foundation models', 'foundation models')
      .replace('systems / distributed training', 'distributed training systems')
      .replace('efficient inference / quantization', 'efficient inference'));
    if (!t.length) return 'across the full stack of applied AI research and production systems';
    if (t.length === 1) return `centered on ${t[0]}`;
    return `centered on ${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`;
  }

  function generate() {
    const text = input.value.trim();
    if (!text) { output.innerHTML = `<p class="brief-note">Paste ${mode === 'role' ? 'a role' : 'a résumé'} above, then press Generate.</p>`; return; }
    if (mode === 'role') renderResume(text); else renderEvidence(text);
  }

  /* ── tooling taxonomy — so packages read clearly, grouped ────────── */
  const SKILL_CATEGORIES = [
    ['Languages', ['Python', 'TypeScript', 'JavaScript', 'R', 'Ruby', 'LaTeX', 'Node.js']],
    ['RL & training', ['PPO', 'SAC', 'GAIL', 'DPO', 'RLHF', 'EM-RL', 'MCTS/UCT', 'Monte Carlo Tree Search', 'Ray', 'RLlib', 'Gymnasium', 'Stable-Baselines3', 'PyTorch', 'Keras', 'TensorFlow', 'NeMo', 'Megatron-Core', 'DeepSpeed ZeRO-3', 'FSDP2']],
    ['Inference & serving', ['vLLM', 'SGLang', 'AWS Optimum Neuron', 'SmoothQuant', 'Deci', 'Blackwell']],
    ['Data & retrieval', ['Neo4j', 'Qdrant', 'cvxpy', 'numpy', 'pandas', 'scikit-learn', 'KMeans', 'word embeddings']],
    ['Agents & orchestration', ['LangGraph', 'LangChain', 'LangSmith', 'OpenAI', 'asyncio', 'Streamlit', 'pydantic']],
    ['MLOps & cloud', ['Azure', 'Azure ML', 'Microsoft Bonsai', 'Model Card Toolkit', 'SHAP', 'DiCE', 'OpenTelemetry']]
  ];
  function categorize(tools) {
    const set = new Set(tools);
    const groups = [];
    const used = new Set();
    SKILL_CATEGORIES.forEach(([label, list]) => {
      const hits = list.filter((t) => set.has(t));
      hits.forEach((t) => used.add(t));
      if (hits.length) groups.push([label, hits]);
    });
    return groups;
  }

  /* ────────────────────────────────────────────────────────────────
     ROLE → tailored, standalone résumé (reads as a real résumé)
     ──────────────────────────────────────────────────────────────── */
  function renderResume(roleText) {
    const nodes = B().nodes;
    const kb = B().kb;
    const scores = scoreMap(roleText);
    const { themes } = B().matchRole(roleText, 24);

    // relight the map behind the sheet on the relevant work (the résumé itself
    // never refers to it — the map is just ambient context on this page)
    const lit = Object.keys(scores);
    window.JHConstellation && window.JHConstellation.lightNodes(lit.length ? lit : nodes.map((n) => n.id));

    // EXPERIENCE — reverse chronological, the way a résumé reads
    const works = nodes.filter((n) => n.kind === 'work')
      .sort((a, b) => (b.start || 0) - (a.start || 0));

    // relevance per topic, to order the expertise section
    const topicRelevance = {};
    nodes.forEach((n) => (n.topics || []).forEach((t) => {
      topicRelevance[t] = (topicRelevance[t] || 0) + (scores[n.id] || 0);
    }));
    const domains = Object.keys(kb.topicExperience)
      .sort((a, b) => (topicRelevance[b] || 0) - (topicRelevance[a] || 0) ||
        kb.topicExperience[b].years - kb.topicExperience[a].years)
      .slice(0, 8);

    // prefer concrete packages/frameworks; keep only short, name-like techniques
    function domainTooling(topic) {
      const packages = new Set(), techniques = new Set();
      nodes.filter((n) => (n.topics || []).includes(topic)).forEach((n) => {
        (n.tech_stack || []).forEach((x) => packages.add(x));
        (n.rl_techniques || []).forEach((x) => {
          if (x.length <= 24 && !/\b(for|system|with|and|via)\b/i.test(x)) techniques.add(x);
        });
      });
      return [...techniques, ...packages].slice(0, 8);
    }

    // Highlights matched to this role (professional phrasing, no map talk)
    const highlights = nodes.filter((n) => n.kind !== 'work' && (scores[n.id] || 0) > 0)
      .sort((a, b) => scores[b.id] - scores[a.id]).slice(0, 3);

    // Selected projects & open source (public repos only), by relevance
    const projects = nodes.filter((n) => n.kind === 'repo' && !n.is_company_ip)
      .sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0)).slice(0, 5);

    // Publications, patents, recognition & speaking
    const pubs = nodes.filter((n) => ['paper', 'patent', 'book', 'dataset'].includes(n.kind))
      .sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
    const talks = nodes.filter((n) => n.kind === 'talk')
      .sort((a, b) => (b.start || 0) - (a.start || 0));

    const roleTitle = themes.slice(0, 3).map((t) => pretty(t
      .replace('LLMs / Foundation Models', 'Foundation Models')
      .replace('Systems / Distributed Training', 'Distributed Systems')
      .replace('Efficient Inference / Quantization', 'Efficient Inference'))).join(' · ');

    const p = kb.profile;
    const c = p.contact;

    const html = `
      <div class="doc" id="resume-doc">
        <header class="doc-head">
          <div class="doc-name">${esc(p.name)}</div>
          <div class="doc-role">${esc(p.title)}${roleTitle ? ' — ' + esc(roleTitle) : ''}</div>
          <div class="doc-contact">${esc(c.email)} &nbsp;·&nbsp; ${esc(c.github)} &nbsp;·&nbsp; ${esc(c.linkedin)} &nbsp;·&nbsp; ${esc(c.site)}</div>
        </header>

        <section>
          <h3 class="doc-section-label">Summary</h3>
          <p class="doc-summary">${esc(p.summary)}</p>
        </section>

        ${highlights.length ? `
        <section>
          <h3 class="doc-section-label">Highlights for this role</h3>
          <ul class="doc-highlights">
            ${highlights.map((n) => `<li>${esc(n.evidence[0] || n.summary)}${n.org ? ` <span class="doc-company">(${esc(n.org)})</span>` : ''}</li>`).join('')}
          </ul>
        </section>` : ''}

        <section>
          <h3 class="doc-section-label">Core expertise</h3>
          <div class="doc-domains">
            ${domains.map((t) => {
              const exp = kb.topicExperience[t];
              const tools = domainTooling(t);
              if (!tools.length) return '';
              return `<div class="doc-domain">
                <span class="doc-domain-name">${esc(t)}</span>
                <span class="doc-domain-years">${exp.years}+ yrs</span>
                <span class="doc-domain-tools">${tools.map(esc).join(' · ')}</span>
              </div>`;
            }).join('')}
          </div>
        </section>

        <section>
          <h3 class="doc-section-label">Experience</h3>
          ${works.map((n) => `
            <div class="doc-entry">
              <div class="doc-entry-head">
                <span class="doc-entry-title">${esc(n.title || n.label)}${n.org ? `, <span class="doc-company">${esc(n.org)}</span>` : ''}</span>
                <span class="doc-entry-meta">${esc(n.year || '')}</span>
              </div>
              <ul>${(n.evidence || []).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
              ${n.tech_stack && n.tech_stack.length ? `<div class="doc-tools"><span class="doc-tools-label">Tools</span> ${n.tech_stack.map((t) => `<span class="doc-tool">${esc(t)}</span>`).join('')}</div>` : ''}
            </div>`).join('')}
        </section>

        ${projects.length ? `
        <section>
          <h3 class="doc-section-label">Selected projects &amp; open source</h3>
          ${projects.map((n) => `
            <div class="doc-entry">
              <div class="doc-entry-head">
                <span class="doc-entry-title">${esc(n.label)}</span>
                <span class="doc-entry-meta">${esc(n.year || '')}${n.level ? ' · ' + esc(n.level) : ''}</span>
              </div>
              <ul><li>${esc(n.evidence[0] || n.summary)}${proofInline(n)}</li></ul>
              ${n.tech_stack && n.tech_stack.length ? `<div class="doc-tools"><span class="doc-tools-label">Tools</span> ${n.tech_stack.map((t) => `<span class="doc-tool">${esc(t)}</span>`).join('')}</div>` : ''}
            </div>`).join('')}
        </section>` : ''}

        <section>
          <h3 class="doc-section-label">Publications, patents &amp; recognition</h3>
          <ul>
            ${pubs.map((n) => `<li><strong>${esc(n.label)}</strong> — ${esc(n.kindLabel)}${n.year ? `, ${esc(n.year)}` : ''}${proofInline(n)}</li>`).join('')}
          </ul>
        </section>

        ${talks.length ? `
        <section>
          <h3 class="doc-section-label">Selected speaking</h3>
          <ul>
            ${talks.map((n) => `<li><strong>${esc(n.label)}</strong> — ${esc(n.kindLabel)}${n.year ? `, ${esc(n.year)}` : ''}${proofInline(n)}</li>`).join('')}
          </ul>
        </section>` : ''}

        <section>
          <h3 class="doc-section-label">Leadership &amp; impact</h3>
          <ul>${(p.leadership || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        </section>

        <section>
          <h3 class="doc-section-label">Education</h3>
          <ul>${(kb.education || []).map((e) => `<li><strong>${esc(e.school)}</strong> — ${esc(e.detail)}${e.note ? ` (${esc(e.note)})` : ''}</li>`).join('')}</ul>
        </section>

        <div class="doc-foot">${esc(p.name)} · ${esc(c.site)} · ${new Date().toISOString().slice(0, 10)}</div>
      </div>
      <button class="brief-print" id="brief-print" type="button">Download / Save as PDF</button>
    `;
    output.innerHTML = html;
    document.getElementById('brief-print').addEventListener('click', () => window.print());
    output.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function proofInline(n) {
    if (!n.proof || !n.proof.length) return '';
    const p = n.proof[0];
    return ` <span class="doc-proof">[<a href="${esc(p.url)}" target="_blank" rel="noopener">source</a>]</span>`;
  }

  /* ────────────────────────────────────────────────────────────────
     RÉSUMÉ → evidence map
     ──────────────────────────────────────────────────────────────── */
  function renderEvidence(resumeText) {
    const nodes = B().nodes;
    const scores = scoreMap(resumeText);
    const matched = nodes.filter((n) => (scores[n.id] || 0) > 0)
      .sort((a, b) => scores[b.id] - scores[a.id]);

    window.JHConstellation && window.JHConstellation.lightNodes(matched.map((n) => n.id));

    if (!matched.length) {
      output.innerHTML = `<p class="brief-note">No overlap found. This map is built from Jazmia's own body of work — paste a résumé or role that touches AI/ML research, RL, evaluation, foundation models or related areas.</p>`;
      return;
    }

    // group matched nodes by primary topic
    const groups = {};
    matched.forEach((n) => { const t = n.topics[0]; (groups[t] = groups[t] || []).push(n); });

    const html = `
      <div class="doc" id="resume-doc">
        <div class="doc-head">
          <div class="doc-name">Evidence Map</div>
          <div class="doc-role">Where the claims in your document are proven in Jazmia Henry's work</div>
          <div class="doc-contact">${matched.length} matching works · grouped by domain</div>
        </div>
        ${Object.entries(groups).map(([topic, ns]) => `
          <div class="doc-section-label">${esc(topic)}</div>
          <ul>
            ${ns.map((n) => `<li><strong>${esc(n.label)}</strong>${n.org ? ` <span class="doc-company">— ${esc(n.org)}</span>` : ''} — ${esc(n.evidence[0] || n.summary)}${proofInline(n)}</li>`).join('')}
          </ul>`).join('')}
        <div class="doc-foot">Mapped from jazmiahenry.com · The Constellation · ${new Date().toISOString().slice(0, 10)}</div>
      </div>
      <button class="brief-print" id="brief-print" type="button">Print / Save as PDF</button>
    `;
    output.innerHTML = html;
    document.getElementById('brief-print').addEventListener('click', () => window.print());
  }

  setMode('role');
})();
