/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MAISON J·H — The Constellation engine
   A self-contained canvas graph + a deterministic retrieval brain.
   No libraries, no build step, no network. Ships on GitHub Pages as-is.

   Optional LLM layer: set JH_BRAIN_CONFIG.llmEndpoint (see brief.html)
   to a serverless URL and the oracle upgrades from retrieval to
   generation. Null by default — the deterministic engine always works.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(() => {
  'use strict';

  const KB = window.KNOWLEDGE;
  if (!KB) { console.warn('KNOWLEDGE not loaded'); return; }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* topic → hue map (mirrors constellation.css tokens) */
  const TOPIC_HUE = {
    'Reinforcement Learning': '#d6a75c',
    'LLMs / Foundation Models': '#c8b7e8',
    'Evaluation': '#7fb0a8',
    'AI Fairness & Ethics': '#cf8fa0',
    'Multi-Agent Systems': '#7fa8cf',
    'Agents': '#7fa8cf',
    'Efficient Inference / Quantization': '#c98f6b',
    'Embeddings & Retrieval': '#9fb87f',
    'Data & Datasets': '#b8a37f',
    'Simulation': '#8f9fcf',
    'Systems / Distributed Training': '#b0b0b8',
    'Computer Vision': '#cf9f7f',
    'NLP': '#a8c8b0'
  };
  const hueFor = (t) => TOPIC_HUE[t] || '#c5b8a3';

  const LEVEL_RADIUS = { Expert: 13, Advanced: 9.5, Intermediate: 7 };
  const LEVEL_ORDER = { Expert: 3, Advanced: 2, Intermediate: 1 };

  /* ────────────────────────────────────────────────────────────────
     1 · retrieval brain — BM25 over the knowledge base
     ──────────────────────────────────────────────────────────────── */

  const SYNONYMS = {
    rl: ['reinforcement', 'learning', 'reward', 'policy', 'agent', 'ppo', 'sac', 'gail', 'dpo', 'rlhf', 'mcts'],
    reinforcement: ['rl', 'reward', 'policy', 'agent'],
    llm: ['language', 'model', 'foundation', 'gpt', 'transformer', 'llms'],
    foundation: ['llm', 'model', 'pretraining', 'transformer'],
    eval: ['evaluation', 'benchmark', 'evaluate', 'grounded', 'verifier', 'metric'],
    evaluation: ['eval', 'benchmark', 'verifier', 'metric', 'grounded'],
    fairness: ['bias', 'ethics', 'ethical', 'equity', 'responsible', 'alignment'],
    bias: ['fairness', 'ethics', 'debias', 'equity'],
    ethics: ['fairness', 'ethical', 'alignment', 'responsible', 'philosophy'],
    agent: ['agentic', 'multi-agent', 'agents', 'tool', 'planning'],
    agentic: ['agent', 'agents', 'tool-use', 'planning'],
    inference: ['quantization', 'quantize', 'smoothquant', 'efficient', 'latency', 'serving', 'vllm'],
    quantization: ['inference', 'quantize', 'int8', 'efficient'],
    embedding: ['embeddings', 'retrieval', 'rag', 'vector', 'siglip', 'clip', 'contrastive'],
    retrieval: ['embedding', 'rag', 'vector', 'knowledge graph', 'search'],
    dataset: ['data', 'corpus', 'datasets', 'aave', 'benchmark'],
    simulation: ['simulate', 'monte carlo', 'episode', 'environment', 'gym', 'gymnasium'],
    distributed: ['systems', 'megatron', 'deepspeed', 'nemo', 'training', 'parallel', 'fsdp'],
    vision: ['image', 'visual', 'clip', 'siglip', 'multimodal'],
    nlp: ['language', 'text', 'embeddings', 'word'],
    petroleum: ['oil', 'gas', 'energy', 'riggs', 'collide', 'subsurface'],
    fintech: ['finance', 'financial', 'trading', 'portfolio', 'markets', 'wealth'],
    healthcare: ['nutrition', 'medical', 'clinical', 'abbott'],
    self: ['reasoning', 'reason', 'logic', 'chain']
  };

  /* strip recruiter/question framing so the query keeps only content words */
  const STOP = new Set(('a an the of to for in on at by with and or but is are was were be been being ' +
    'has have had she her he his they them it its this that these those do does did done work works ' +
    'worked project projects ever any some show me tell about please can could would where what which ' +
    'who whom how why when addresses address related relating relate anything something things thing ' +
    'you your i we our us built build building made make experience use used using around into you’ve')
    .split(' '));

  const tokenize = (s) => (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\+\-#\. ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

  function expand(tokens) {
    const out = new Set(tokens);
    tokens.forEach((t) => { (SYNONYMS[t] || []).forEach((s) => s.split(' ').forEach((w) => out.add(w))); });
    return [...out];
  }

  /* build an index doc per node from all its searchable text */
  function docText(n) {
    return [
      n.label, n.summary, (n.topics || []).join(' '), (n.tags || []).join(' '),
      (n.tech_stack || []).join(' '), (n.rl_techniques || []).join(' '),
      n.org || '', (n.evidence || []).join(' '),
      n.excerpt ? (n.excerpt.why || '') : ''
    ].join(' ');
  }

  const nodesData = KB.nodes.filter((n) => n.kind !== 'topic');
  const docs = nodesData.map((n) => tokenize(docText(n)));
  const df = {};
  docs.forEach((d) => new Set(d).forEach((t) => { df[t] = (df[t] || 0) + 1; }));
  const N = docs.length;
  const avgdl = docs.reduce((a, d) => a + d.length, 0) / Math.max(1, N);
  const k1 = 1.5, b = 0.75;

  function search(query) {
    const q = expand(tokenize(query));
    if (!q.length) return [];
    const scores = docs.map((d, i) => {
      const tf = {};
      d.forEach((t) => { tf[t] = (tf[t] || 0) + 1; });
      let s = 0;
      q.forEach((t) => {
        if (!tf[t]) return;
        const idf = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
        const num = tf[t] * (k1 + 1);
        const den = tf[t] + k1 * (1 - b + b * (d.length / avgdl));
        s += idf * (num / den);
      });
      // gentle prior toward Expert-level, central work
      if (s > 0) s *= 1 + 0.08 * (LEVEL_ORDER[nodesData[i].level] || 1);
      return { node: nodesData[i], score: s };
    });
    return scores.filter((x) => x.score > 0).sort((a, x) => x.score - a.score);
  }

  /* ────────────────────────────────────────────────────────────────
     2 · resume / role matching — shared with brief.html
     ──────────────────────────────────────────────────────────────── */

  function matchRole(text, limit) {
    const ranked = search(text);
    const top = ranked.slice(0, limit || 12);
    // collect matched topics for a fit summary
    const topicHits = {};
    top.forEach(({ node, score }) => (node.topics || []).forEach((t) => {
      topicHits[t] = (topicHits[t] || 0) + score;
    }));
    const themes = Object.entries(topicHits).sort((a, x) => x[1] - a[1]).map(([t]) => t);
    return { matches: top, themes };
  }

  window.JHBrain = { search, matchRole, nodes: nodesData, kb: KB, hueFor };

  /* if there's no canvas on the page (e.g. a resume-only view), stop here */
  const canvas = document.getElementById('constellation-canvas');
  if (!canvas) return;

  /* ────────────────────────────────────────────────────────────────
     3 · the living graph
     ──────────────────────────────────────────────────────────────── */

  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* camera */
  const cam = { x: 0, y: 0, scale: 1, tx: 0, ty: 0, tScale: 1 };

  /* build simulation nodes: one hub per topic + one node per work item */
  const topics = [...new Set(nodesData.flatMap((n) => n.topics && n.topics.length ? [n.topics[0]] : []))];
  const hubs = {};
  const simNodes = [];
  const R0 = 620;

  topics.forEach((t, i) => {
    const a = (i / topics.length) * Math.PI * 2 - Math.PI / 2;
    const hub = {
      id: 'hub:' + t, topic: t, isHub: true, label: t,
      x: Math.cos(a) * R0, y: Math.sin(a) * R0,
      vx: 0, vy: 0, r: 4, hue: hueFor(t)
    };
    hubs[t] = hub;
    simNodes.push(hub);
  });

  nodesData.forEach((n, i) => {
    const primary = (n.topics && n.topics[0]) || topics[0];
    const hub = hubs[primary] || simNodes[0];
    const a = (i * 2.399963); // golden-angle spiral seed for even initial spread
    const d = 130 + (i % 7) * 26;
    simNodes.push({
      id: n.id, data: n, isHub: false, topic: primary,
      x: hub.x * 0.75 + Math.cos(a) * d, y: hub.y * 0.75 + Math.sin(a) * d,
      vx: 0, vy: 0,
      r: LEVEL_RADIUS[n.level] || 8,
      hue: hueFor(primary),
      phase: (i % 11) * 0.57
    });
  });

  const workNodes = simNodes.filter((s) => !s.isHub);
  const byId = {}; simNodes.forEach((s) => { byId[s.id] = s; });

  /* edges: work→hub (spokes) + synapses between nodes sharing >=2 tags */
  const edges = [];
  workNodes.forEach((s) => { edges.push({ a: s, b: hubs[s.topic], w: 1, spoke: true }); });
  for (let i = 0; i < workNodes.length; i++) {
    for (let j = i + 1; j < workNodes.length; j++) {
      const A = workNodes[i].data, B = workNodes[j].data;
      const shared = (A.tags || []).filter((t) => (B.tags || []).includes(t));
      const sharedTopic = (A.topics || []).some((t) => (B.topics || []).includes(t));
      if (shared.length >= 2 || (shared.length >= 1 && sharedTopic)) {
        edges.push({ a: workNodes[i], b: workNodes[j], w: 0.4 + shared.length * 0.15, spoke: false });
      }
    }
  }

  /* background starfield — faint drifting dust for depth */
  const stars = [];
  const STAR_N = 220;
  for (let i = 0; i < STAR_N; i++) {
    stars.push({
      x: Math.random(), y: Math.random(),
      z: 0.2 + Math.random() * 0.8,
      tw: Math.random() * Math.PI * 2
    });
  }

  // pin hub home for stable constellations
  Object.values(hubs).forEach((h) => { h.homeX = h.x; h.homeY = h.y; });
  // minimum on-screen separation (world units) so nothing overlaps
  const PAD = 46;

  /* ── physics ── */
  function step() {
    // repulsion (O(n^2), n small)
    for (let i = 0; i < simNodes.length; i++) {
      const p = simNodes[i];
      for (let j = i + 1; j < simNodes.length; j++) {
        const q = simNodes[j];
        let dx = p.x - q.x, dy = p.y - q.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = (i - j) || 1; dy = (j - i) || 1; d2 = 2; }
        const rep = (p.isHub || q.isHub ? 13000 : 6000) / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * rep, fy = (dy / d) * rep;
        p.vx += fx; p.vy += fy; q.vx -= fx; q.vy -= fy;
      }
    }
    // spring along edges
    edges.forEach((e) => {
      const rest = e.spoke ? 150 : 300;
      let dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - rest) * 0.006 * e.w;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      e.a.vx += fx; e.a.vy += fy; e.b.vx -= fx; e.b.vy -= fy;
    });
    // integrate + gentle gravity; hubs ease back to their ring anchor
    simNodes.forEach((p) => {
      if (p.isHub) {
        p.x += (p.homeX - p.x) * 0.06;
        p.y += (p.homeY - p.y) * 0.06;
        p.vx *= 0.5; p.vy *= 0.5;
        return;
      }
      p.vx += (0 - p.x) * 0.0011;
      p.vy += (0 - p.y) * 0.0011;
      p.vx *= 0.85; p.vy *= 0.85;
      if (p === dragNode) { p.vx = p.vy = 0; return; }
      p.x += p.vx * 0.25; p.y += p.vy * 0.25;
    });
    // hard collision resolution — separate any overlapping pair
    for (let i = 0; i < workNodes.length; i++) {
      const p = workNodes[i];
      for (let j = i + 1; j < workNodes.length; j++) {
        const q = workNodes[j];
        const dx = q.x - p.x, dy = q.y - p.y;
        const min = p.r + q.r + PAD;
        let d = Math.hypot(dx, dy);
        if (d > 0 && d < min) {
          const push = (min - d) / 2;
          const nx = dx / d, ny = dy / d;
          if (p !== dragNode) { p.x -= nx * push; p.y -= ny * push; }
          if (q !== dragNode) { q.x += nx * push; q.y += ny * push; }
        }
      }
    }
  }

  /* ── view transform (insets keep the graph centered in the visible area
        when a side panel covers part of the screen) ── */
  const inset = { left: 0, right: 0 };
  const viewCX = () => (inset.left + (W - inset.right)) / 2;
  const viewW = () => Math.max(200, W - inset.left - inset.right);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);

  function setInsets(l, r) {
    inset.left = W > 720 ? (l || 0) : 0;
    inset.right = W > 720 ? (r || 0) : 0;
  }

  const toScreen = (p) => ({
    x: (p.x - cam.x) * cam.scale + viewCX(),
    y: (p.y - cam.y) * cam.scale + H / 2
  });
  const toWorld = (sx, sy) => ({
    x: (sx - viewCX()) / cam.scale + cam.x,
    y: (sy - H / 2) / cam.scale + cam.y
  });

  /* ── interaction state ── */
  let hoverNode = null, activeNode = null, dragNode = null;
  let panning = false, lastX = 0, lastY = 0, moved = false;
  const filterState = { topics: new Set(), levels: new Set(), queryHits: null };

  function nodeVisible(s) {
    if (s.isHub) return true;
    if (filterState.topics.size && !s.data.topics.some((t) => filterState.topics.has(t))) return false;
    if (filterState.levels.size && !filterState.levels.has(s.data.level)) return false;
    return true;
  }
  function nodeDimmed(s) {
    if (s.isHub) return false;
    if (filterState.queryHits && !filterState.queryHits.has(s.id)) return true;
    if (hoverNode && hoverNode !== s && !s.isHub) {
      // dim non-neighbors of hovered
      const nb = neighbors(hoverNode);
      if (hoverNode !== s && !nb.has(s.id)) return true;
    }
    return false;
  }
  function neighbors(s) {
    const set = new Set([s.id]);
    edges.forEach((e) => { if (e.a === s) set.add(e.b.id); if (e.b === s) set.add(e.a.id); });
    return set;
  }

  /* ── render ── */
  let t = 0;
  function draw() {
    t += 0.016;
    if (!reduceMotion) step();
    // ease camera
    cam.x += (cam.tx - cam.x) * 0.12;
    cam.y += (cam.ty - cam.y) * 0.12;
    cam.scale += (cam.tScale - cam.scale) * 0.12;

    ctx.clearRect(0, 0, W, H);

    // per-frame label occupancy for de-cluttering
    const labelRects = [];
    const labelFree = (cx, cy, w, h) => {
      for (const r of labelRects) {
        if (Math.abs(cx - r.cx) * 2 < (w + r.w) && Math.abs(cy - r.cy) * 2 < (h + r.h)) return false;
      }
      return true;
    };
    const claim = (cx, cy, w, h) => labelRects.push({ cx, cy, w, h });

    // starfield
    ctx.save();
    stars.forEach((st) => {
      const px = st.x * W, py = st.y * H;
      const drift = reduceMotion ? 0 : Math.sin(t * 0.2 * st.z + st.tw) * 0.6;
      const tw = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.8 * st.z + st.tw));
      ctx.beginPath();
      ctx.arc(px + drift, py + drift, st.z * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240,232,216,${0.12 * tw * st.z})`;
      ctx.fill();
    });
    ctx.restore();

    // edges
    edges.forEach((e) => {
      if (!nodeVisible(e.a) || !nodeVisible(e.b)) return;
      const A = toScreen(e.a), B = toScreen(e.b);
      const activeEdge = (hoverNode && (e.a === hoverNode || e.b === hoverNode)) ||
        (activeNode && (e.a === activeNode || e.b === activeNode));
      const dimmed = nodeDimmed(e.a) && nodeDimmed(e.b);
      let alpha = e.spoke ? 0.17 : 0.11;
      if (activeEdge) alpha = 0.65;
      if (dimmed) alpha *= 0.2;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
      ctx.strokeStyle = activeEdge ? `rgba(220,178,104,${alpha})` : `rgba(200,188,168,${alpha})`;
      ctx.lineWidth = activeEdge ? 1.4 : 0.75;
      ctx.stroke();
    });

    // hub labels (constellation names) — claimed first so node labels dodge them
    Object.values(hubs).forEach((h) => {
      if (filterState.topics.size && !filterState.topics.has(h.topic)) return;
      const S = toScreen(h);
      ctx.save();
      ctx.font = `600 12px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      const txt = h.label.toUpperCase();
      ctx.globalAlpha = 0.95;
      ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(6,6,6,0.92)';
      ctx.strokeText(txt, S.x, S.y - 15);
      ctx.fillStyle = h.hue;
      ctx.fillText(txt, S.x, S.y - 15);
      claim(S.x, S.y - 15, txt.length * 7.6, 16);
      ctx.beginPath(); ctx.arc(S.x, S.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = h.hue; ctx.fill();
      ctx.restore();
    });

    // work nodes — pass 1: glow + core + rim; collect label candidates
    const labelQueue = [];
    workNodes.forEach((s) => {
      if (!nodeVisible(s)) return;
      const S = toScreen(s);
      const dim = nodeDimmed(s);
      const isActive = s === activeNode || s === hoverNode;
      const isHit = filterState.queryHits && filterState.queryHits.has(s.id);
      const isExpert = s.data.level === 'Expert';
      const pulse = reduceMotion ? 1 : 1 + 0.12 * Math.sin(t * 1.6 + s.phase);
      const r = s.r * cam.scale * (isActive ? 1.35 : 1) * (isHit ? 1.2 : 1) * pulse;
      const baseAlpha = dim ? 0.16 : 1;

      const glowR = r * (isActive ? 4.6 : isHit ? 4 : 3.1);
      const g = ctx.createRadialGradient(S.x, S.y, 0, S.x, S.y, glowR);
      const ga = (isActive ? 0.62 : isHit ? 0.46 : 0.32) * baseAlpha;
      g.addColorStop(0, hexA(s.hue, ga));
      g.addColorStop(1, hexA(s.hue, 0));
      ctx.beginPath(); ctx.arc(S.x, S.y, glowR, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();

      // dark seat — lets the bright core read against a busy field
      ctx.beginPath(); ctx.arc(S.x, S.y, r + 2.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(8,8,8,${0.62 * baseAlpha})`; ctx.fill();
      // core
      ctx.beginPath(); ctx.arc(S.x, S.y, r, 0, Math.PI * 2);
      ctx.fillStyle = hexA(s.hue, Math.min(1, baseAlpha + 0.06));
      ctx.fill();
      // inner highlight for a jewel-like read
      ctx.beginPath(); ctx.arc(S.x - r * 0.3, S.y - r * 0.3, r * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = hexA('#fbf5e8', 0.4 * baseAlpha); ctx.fill();
      // bright bone rim
      ctx.lineWidth = isActive ? 1.9 : 1.15;
      ctx.strokeStyle = hexA('#f4ecdd', (isActive ? 1 : 0.66) * baseAlpha);
      ctx.beginPath(); ctx.arc(S.x, S.y, r, 0, Math.PI * 2); ctx.stroke();
      // Expert ring
      if (isExpert && !dim) {
        ctx.beginPath(); ctx.arc(S.x, S.y, r + 4, 0, Math.PI * 2);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = hexA(s.hue, 0.7 * baseAlpha);
        ctx.stroke();
      }

      // priority: active(3) > hit(2) > visible(1); all non-dim stars are labelled,
      // de-cluttering keeps the most important where they'd collide
      let pri = 0;
      if (isActive) pri = 3; else if (isHit) pri = 2; else if (!dim) pri = 1;
      if (pri > 0) labelQueue.push({ s, S, r, pri, isActive, baseAlpha, size: s.r });
    });

    // pass 2: labels — highest priority, then largest (deepest expertise), de-cluttered
    labelQueue.sort((a, b) => b.pri - a.pri || b.size - a.size);
    labelQueue.forEach(({ s, S, r, pri, isActive, baseAlpha }) => {
      const name = s.data.label;
      const size = isActive ? 16 : 13.5;
      const w = name.length * size * 0.47 + 14;
      const h = size + 8;
      const cy = S.y + r + 13 + size / 2;
      if (!isActive && !labelFree(S.x, cy, w, h)) return;
      ctx.save();
      ctx.textAlign = 'center';
      // rounded legibility scrim with a faint hue border
      ctx.globalAlpha = baseAlpha;
      roundRect(S.x - w / 2, cy - h / 2, w, h, 4);
      ctx.fillStyle = 'rgba(6,6,6,0.82)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = hexA(s.hue, 0.4 * baseAlpha); ctx.stroke();
      // name — dark outline + bright fill = crisp on any background
      ctx.font = `500 ${size}px 'Cormorant Garamond', serif`;
      ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.92)';
      ctx.strokeText(name, S.x, cy + size * 0.34);
      ctx.fillStyle = '#f8f2e6';
      ctx.fillText(name, S.x, cy + size * 0.34);
      claim(S.x, cy, w, h);
      // meta line (year · level) for the focused / matched stars
      const meta = [s.data.year, s.data.level].filter(Boolean).join('  ·  ');
      if ((isActive || pri === 2) && meta) {
        const my = cy + h / 2 + 8;
        ctx.font = `600 9.5px 'JetBrains Mono', monospace`;
        ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.88)';
        ctx.strokeText(meta.toUpperCase(), S.x, my);
        ctx.globalAlpha = baseAlpha;
        ctx.fillStyle = s.hue;
        ctx.fillText(meta.toUpperCase(), S.x, my);
        claim(S.x, my, meta.length * 6.6 + 8, 12);
      }
      ctx.restore();
    });

    requestAnimationFrame(draw);
  }

  function roundRect(x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  /* ── hit testing ── */
  function pick(sx, sy) {
    let best = null, bestD = 22;
    for (const s of workNodes) {
      if (!nodeVisible(s)) continue;
      const S = toScreen(s);
      const d = Math.hypot(S.x - sx, S.y - sy);
      const rr = Math.max(12, s.r * cam.scale + 8);
      if (d < rr && d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /* ── pointer events ── */
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (panning) {
      const dx = (sx - lastX) / cam.scale, dy = (sy - lastY) / cam.scale;
      cam.tx -= dx; cam.ty -= dy; cam.x -= dx; cam.y -= dy;
      lastX = sx; lastY = sy; moved = true;
      if (dragNode) { const w = toWorld(sx, sy); dragNode.x = w.x; dragNode.y = w.y; }
      return;
    }
    hoverNode = pick(sx, sy);
    canvas.classList.toggle('is-hovering', !!hoverNode);
  });

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left; lastY = e.clientY - rect.top;
    moved = false;
    const hit = pick(lastX, lastY);
    if (hit) { dragNode = hit; }
    panning = true;
    canvas.classList.add('is-dragging');
  });

  window.addEventListener('mouseup', (e) => {
    if (panning && !moved) {
      const rect = canvas.getBoundingClientRect();
      const hit = pick(e.clientX - rect.left, e.clientY - rect.top);
      if (hit) openPanel(hit); else if (!hit && activeNode) { /* keep */ }
    }
    panning = false; dragNode = null;
    canvas.classList.remove('is-dragging');
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const before = toWorld(sx, sy);
    const factor = Math.exp(-e.deltaY * 0.0012);
    cam.tScale = Math.min(3.5, Math.max(0.45, cam.tScale * factor));
    cam.scale = cam.tScale; // immediate for zoom-to-cursor accuracy
    const after = toWorld(sx, sy);
    cam.x += before.x - after.x; cam.y += before.y - after.y;
    cam.tx = cam.x; cam.ty = cam.y;
  }, { passive: false });

  /* touch (pan + tap) */
  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const rect = canvas.getBoundingClientRect();
      touchStart = { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top, moved: false };
      lastX = touchStart.x; lastY = touchStart.y;
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && touchStart) {
      const rect = canvas.getBoundingClientRect();
      const sx = e.touches[0].clientX - rect.left, sy = e.touches[0].clientY - rect.top;
      const dx = (sx - lastX) / cam.scale, dy = (sy - lastY) / cam.scale;
      cam.tx -= dx; cam.ty -= dy; cam.x -= dx; cam.y -= dy;
      lastX = sx; lastY = sy; touchStart.moved = true;
    }
  }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (touchStart && !touchStart.moved) {
      const hit = pick(touchStart.x, touchStart.y);
      if (hit) openPanel(hit);
    }
    touchStart = null;
  });

  /* ── camera helpers ── */
  function focusOn(node, scale) {
    cam.tx = node.x; cam.ty = node.y;
    cam.tScale = scale || 1.8;
  }
  function resetView() {
    cam.tx = 0; cam.ty = 0; cam.tScale = 1;
    filterState.queryHits = null;
    activeNode = null;
    document.querySelector('.oracle-answer')?.classList.remove('is-shown');
  }

  /* ────────────────────────────────────────────────────────────────
     4 · detail panel
     ──────────────────────────────────────────────────────────────── */

  const panel = document.getElementById('panel');
  function openPanel(simNode) {
    activeNode = simNode;
    const n = simNode.data;
    focusOn(simNode, Math.max(cam.tScale, 1.7));
    panel.innerHTML = panelHTML(n);
    panel.classList.add('is-open');
    setInsets(inset.left, Math.min(panel.offsetWidth || 560, W * 0.5));
    panel.scrollTop = 0;
    panel.querySelector('.panel-close').onclick = closePanel;
    panel.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.onclick = () => { const s = byId[btn.dataset.goto]; if (s) openPanel(s); };
    });
  }
  function closePanel() { panel.classList.remove('is-open'); activeNode = null; setInsets(inset.left, 0); }

  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function panelHTML(n) {
    const hue = hueFor(n.topics && n.topics[0]);
    const primary = n.topics && n.topics[0];
    const exp = (KB.topicExperience && primary) ? KB.topicExperience[primary] : null;
    const expNote = exp && exp.years >= 2 ? `${exp.years}+ yrs · ${primary}` : '';
    const companyTag = n.org
      ? `<span class="panel-company-tag" style="background:${n.is_company_ip ? 'var(--champagne)' : 'var(--bone-soft)'}">${esc(n.org)}</span>`
      : '';
    let ex = '';
    if (n.excerpt) {
      if (n.excerpt.type === 'code') {
        ex = `<div class="panel-section-label">The most impressive part</div>
          <div class="excerpt"><div class="excerpt-code">${esc(n.excerpt.text)}</div>
          ${n.excerpt.source ? `<div class="excerpt-source">${esc(n.excerpt.source)}</div>` : ''}</div>
          ${n.excerpt.why ? `<p class="excerpt-why">${esc(n.excerpt.why)}</p>` : ''}`;
      } else {
        ex = `<div class="panel-section-label">Excerpt</div>
          <div class="excerpt"><div class="excerpt-quote">${esc(n.excerpt.text)}</div>
          ${n.excerpt.source ? `<div class="excerpt-source">${esc(n.excerpt.source)}</div>` : ''}</div>
          ${n.excerpt.why ? `<p class="excerpt-why">${esc(n.excerpt.why)}</p>` : ''}`;
      }
    }
    const proof = (n.proof && n.proof.length)
      ? `<div class="panel-section-label">Proof &amp; sources</div>
         <ul class="panel-proof">${n.proof.map((p) =>
           `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.label)}</a></li>`).join('')}</ul>`
      : (n.is_company_ip
          ? `<div class="panel-section-label">Proof &amp; sources</div>
             <p class="excerpt-why" style="border-color:var(--champagne)">Proprietary work for ${esc(n.org)} — code and internal artifacts withheld as company IP. Synopsis and public references only.</p>`
          : (n.private
              ? `<div class="panel-section-label">Proof &amp; sources</div>
                 <p class="excerpt-why">Private research repository — synopsis shown here; code and analysis available on request.</p>`
              : ''));
    const tools = (n.tech_stack && n.tech_stack.length)
      ? `<div class="panel-section-label">Tools &amp; packages</div>
         <div class="panel-tags">${n.tech_stack.map((tg) => `<span class="panel-tag panel-tool">${esc(tg)}</span>`).join('')}</div>`
      : '';
    const tags = (n.tags && n.tags.length)
      ? `<div class="panel-section-label">Signals</div>
         <div class="panel-tags">${n.tags.slice(0, 12).map((tg) => `<span class="panel-tag">${esc(tg)}</span>`).join('')}</div>`
      : '';
    // related
    const rel = relatedOf(n).slice(0, 5);
    const related = rel.length
      ? `<div class="panel-section-label">In the same orbit</div>
         <div class="panel-related">${rel.map((r) =>
           `<button data-goto="${esc(r.id)}">${esc(r.label)} <span>· ${esc((r.topics && r.topics[0]) || '')}</span></button>`).join('')}</div>`
      : '';

    return `
      <button class="panel-close" aria-label="Close">&times;</button>
      <div class="panel-kicker">
        <span class="panel-dot" style="color:${hue}"></span>
        <span>${esc(n.kindLabel || n.kind)}</span>
        <span class="panel-level">${esc(n.level || '')}</span>
      </div>
      <h2 class="panel-title">${esc(n.label)}${companyTag}</h2>
      <p class="panel-meta">${esc([n.org, n.year].filter(Boolean).join(' · '))}${n.topics ? ' · ' + esc(n.topics.join(', ')) : ''}</p>
      <div class="panel-badges">
        <span class="panel-badge panel-badge-level" data-level="${esc(n.level || '')}">${esc(n.level || '')}</span>
        ${expNote ? `<span class="panel-badge">${esc(expNote)}</span>` : ''}
        ${n.tech_stack && n.tech_stack.length ? `<span class="panel-badge">${n.tech_stack.length} tools</span>` : ''}
      </div>
      <p class="panel-summary">${esc(n.summary)}</p>
      ${ex}
      ${proof}
      ${tools}
      ${tags}
      ${related}
    `;
  }

  function relatedOf(n) {
    return nodesData.filter((m) => m.id !== n.id).map((m) => {
      const shared = (n.tags || []).filter((tg) => (m.tags || []).includes(tg)).length;
      const topic = (n.topics || []).some((tp) => (m.topics || []).includes(tp)) ? 1 : 0;
      return { m, s: shared + topic };
    }).filter((x) => x.s > 0).sort((a, x) => x.s - a.s).map((x) => x.m);
  }

  /* ────────────────────────────────────────────────────────────────
     5 · oracle — ask the mind
     ──────────────────────────────────────────────────────────────── */

  const cfg = window.JH_BRAIN_CONFIG || {};
  const input = document.querySelector('.oracle-input');
  const answerEl = document.querySelector('.oracle-answer');

  function runQuery(query) {
    if (!query.trim()) { resetView(); return; }
    const ranked = search(query).slice(0, 8);
    if (!ranked.length) {
      filterState.queryHits = new Set();
      showAnswer(`No direct match for <strong>${esc(query)}</strong>. Try a topic — reinforcement learning, evaluation, fairness, embeddings, agents.`, 0);
      return;
    }
    filterState.queryHits = new Set(ranked.map((r) => r.node.id));
    // frame the graph around the hits
    const hits = ranked.map((r) => byId[r.node.id]).filter(Boolean);
    frameNodes(hits);
    const top = ranked[0].node;
    const names = ranked.slice(0, 3).map((r) => `<strong>${esc(r.node.label)}</strong>`).join(', ');
    showAnswer(`Yes — ${names}${ranked.length > 3 ? ' and more' : ''} address this. Nearest match: <strong>${esc(top.label)}</strong>.`, ranked.length, top);

    // optional LLM upgrade
    if (cfg.llmEndpoint) askLLM(query, ranked);
  }

  function frameNodes(hits) {
    if (!hits.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    hits.forEach((h) => { minX = Math.min(minX, h.x); maxX = Math.max(maxX, h.x); minY = Math.min(minY, h.y); maxY = Math.max(maxY, h.y); });
    cam.tx = (minX + maxX) / 2; cam.ty = (minY + maxY) / 2;
    const spanX = (maxX - minX) || 200, spanY = (maxY - minY) || 200;
    cam.tScale = Math.min(1.9, Math.max(0.6, Math.min(viewW() / (spanX + 360), H / (spanY + 360))));
  }

  function showAnswer(html, count, topNode) {
    if (!answerEl) return;
    answerEl.innerHTML = `${html}${count ? ` <span class="oracle-count">${count} node${count > 1 ? 's' : ''} lit</span>` : ''}
      <span class="oracle-clear" role="button">reset</span>`;
    answerEl.classList.add('is-shown');
    answerEl.querySelector('.oracle-clear').onclick = () => { input.value = ''; resetView(); };
    if (topNode) {
      answerEl.style.cursor = 'default';
      // clicking the top strong opens it
      const first = answerEl.querySelector('strong');
      if (first) { first.style.cursor = 'pointer'; first.onclick = () => { const s = byId[topNode.id]; if (s) openPanel(s); }; }
    }
  }

  async function askLLM(query, ranked) {
    try {
      const context = ranked.slice(0, 6).map((r) => `- ${r.node.label}: ${r.node.summary}`).join('\n');
      const res = await fetch(cfg.llmEndpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ask', query, context })
      });
      if (!res.ok) return;
      const { answer } = await res.json();
      if (answer && answerEl) {
        answerEl.innerHTML = `${esc(answer)} <span class="oracle-clear" role="button">reset</span>`;
        answerEl.querySelector('.oracle-clear').onclick = () => { input.value = ''; resetView(); };
      }
    } catch (_) { /* deterministic answer already shown */ }
  }

  if (input) {
    const form = document.querySelector('.oracle-field');
    const submit = () => runQuery(input.value);
    document.querySelector('.oracle-submit')?.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); dismissVeil(); } });
  }

  /* rotating hints */
  const HINTS = [
    'Has she ever built a <b>reinforcement learning</b> system?',
    'Show me her work on <b>model evaluation</b>.',
    'What has she done with <b>AI fairness</b>?',
    'Find work on <b>efficient inference</b>.',
    'Where does she use <b>multi-agent</b> systems?',
    'Show me her <b>embeddings &amp; retrieval</b> work.'
  ];
  const hintEl = document.querySelector('.oracle-hint');
  let hi = 0;
  function rotateHint() {
    if (!hintEl) return;
    hintEl.style.opacity = 0;
    setTimeout(() => { hintEl.innerHTML = HINTS[hi % HINTS.length]; hintEl.style.opacity = 0.85; hi++; }, 400);
  }
  if (hintEl && !reduceMotion) { rotateHint(); setInterval(rotateHint, 4200); }
  else if (hintEl) hintEl.innerHTML = HINTS[0];

  /* ────────────────────────────────────────────────────────────────
     6 · legend + level filters
     ──────────────────────────────────────────────────────────────── */

  const legendItems = document.querySelector('.legend-items');
  if (legendItems) {
    const counts = {};
    nodesData.forEach((n) => (n.topics && n.topics[0]) && (counts[n.topics[0]] = (counts[n.topics[0]] || 0) + 1));
    topics.sort((a, b) => (counts[b] || 0) - (counts[a] || 0)).forEach((tp) => {
      const el = document.createElement('div');
      el.className = 'legend-item';
      el.innerHTML = `<span class="legend-dot" style="color:${hueFor(tp)}"></span><span>${tp}</span><span class="legend-count">${counts[tp] || 0}</span>`;
      el.onclick = () => {
        if (filterState.topics.has(tp)) filterState.topics.delete(tp); else filterState.topics.add(tp);
        el.classList.toggle('is-active');
        // muting visual: if any selected, mute the rest
        legendItems.querySelectorAll('.legend-item').forEach((it, i) => {
          const name = topics[i];
        });
        [...legendItems.children].forEach((child, i) => {
          const nm = child.querySelector('span:nth-child(2)').textContent;
          child.classList.toggle('is-muted', filterState.topics.size > 0 && !filterState.topics.has(nm));
        });
      };
      legendItems.appendChild(el);
    });
    const key = document.createElement('div');
    key.className = 'legend-key';
    key.innerHTML =
      '<span class="legend-key-row"><span class="legend-size-dot lg"></span> Larger star · deeper expertise</span>' +
      '<span class="legend-key-row"><span class="legend-size-dot ring"></span> Ringed · Expert-level work</span>' +
      '<span class="legend-key-row">Labels show the year &amp; level on focus</span>';
    legendItems.parentNode.appendChild(key);
  }

  document.querySelectorAll('.level-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const lv = chip.dataset.level;
      const on = chip.getAttribute('data-on') === 'true';
      chip.setAttribute('data-on', String(!on));
      if (on) filterState.levels.delete(lv); else filterState.levels.add(lv);
    });
  });

  document.getElementById('reset-view')?.addEventListener('click', resetView);

  /* ────────────────────────────────────────────────────────────────
     7 · intro veil
     ──────────────────────────────────────────────────────────────── */

  const veil = document.querySelector('.veil');
  function dismissVeil() { veil?.classList.add('is-gone'); }
  veil?.addEventListener('click', dismissVeil);
  canvas.addEventListener('mousedown', dismissVeil, { once: true });
  canvas.addEventListener('wheel', dismissVeil, { once: true });
  setTimeout(dismissVeil, 5200);

  /* ── boot ── */
  resize();
  // settle the larger layout before first paint
  for (let i = 0; i < 320; i++) step();
  cam.scale = cam.tScale = 0.72; cam.x = cam.tx = 0; cam.y = cam.ty = 0;
  requestAnimationFrame(draw);

  /* expose for brief.html role-mode graph relighting */
  window.JHConstellation = {
    lightNodes(ids) { filterState.queryHits = new Set(ids); const hits = ids.map((i) => byId[i]).filter(Boolean); frameNodes(hits); },
    reset: resetView,
    open: (id) => { const s = byId[id]; if (s) openPanel(s); },
    setInsets
  };
})();
