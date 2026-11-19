/* ATIC Research: projects (why, who, what), flexible trials and formulas, a test builder with formulas,
   solutions, results with live calculations, comparison charts, a journal, printable reports and calculators.
   Stored in planner_docs: res_projects, res_tests, res_solutions, res_files. */
(async function () {
  'use strict';
  var A = await ATIC.boot({ page: 'research', area: 'research', subs: [
    { id: 'home', label: 'Projects' }, { id: 'tests', label: 'Test builder' }, { id: 'solutions', label: 'Solutions' }, { id: 'tools', label: 'Calculators' }] });
  if (!A) return;
  var sb = A.sb || window.sb;
  var P = A.profile, ME = P.full_name || P.username || 'Me';
  var EDIT = true; /* the database decides; a refused save shows a message */
  var R = { projects: [], tests: [], sols: [], files: {}, people: [], mats: [], products: [], recipes: null, matInfo: {}, labCfg: null };
  var V = { filter: 'active', q: '', ptab: 'setup', tp: '', cmp: '', view: 'amount', scale: '' };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var main = $('#main');
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid(p) { return (p || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
  function nice(d) { if (!d) return '–'; var t = new Date(d.slice(0, 10) + 'T12:00:00'); return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function num(v) { if (v === '' || v == null) return null; var n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : null; }
  function fmt(n, dp) { if (n == null || !isFinite(n)) return '–'; dp = dp == null ? 2 : dp; return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dp }); }
  function toast(t) { var el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 3000); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- formulas: a small safe calculator (no eval) ---------- */
  var FN = { sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp, pow: Math.pow, floor: Math.floor, ceil: Math.ceil,
    min: function () { return Math.min.apply(null, arguments); }, max: function () { return Math.max.apply(null, arguments); },
    sum: function () { var s = 0; for (var i = 0; i < arguments.length; i++) s += arguments[i]; return s; },
    avg: function () { var a = [].slice.call(arguments).filter(function (x) { return x != null && isFinite(x); }); return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : NaN; },
    round: function (x, d) { var f = Math.pow(10, d || 0); return Math.round(x * f) / f; },
    if: function (c, a, b) { return c ? a : b; } };
  function tokenize(s) {
    var t = [], i = 0, m; s = String(s || '');
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if ((m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i)))) { t.push({ t: 'n', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i)))) { t.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
      if ((m = /^(<=|>=|==|!=|[-+*/^(),<>%×÷])/.exec(s.slice(i)))) { var o = m[0] === '×' ? '*' : m[0] === '÷' ? '/' : m[0]; t.push({ t: 'op', v: o }); i += m[0].length; continue; }
      throw new Error('Unknown sign "' + c + '"');
    }
    return t;
  }
  function evalF(src, scope) {
    var t = tokenize(src), p = 0;
    function peek(v) { return t[p] && t[p].t === 'op' && t[p].v === v; }
    function cmp() { var a = expr(); while (t[p] && t[p].t === 'op' && /^(<|>|<=|>=|==|!=)$/.test(t[p].v)) { var o = t[p++].v, b = expr(); a = o === '<' ? +(a < b) : o === '>' ? +(a > b) : o === '<=' ? +(a <= b) : o === '>=' ? +(a >= b) : o === '==' ? +(a === b) : +(a !== b); } return a; }
    function expr() { var a = term(); while (peek('+') || peek('-')) { var o = t[p++].v, b = term(); a = o === '+' ? a + b : a - b; } return a; }
    function term() { var a = power(); while (peek('*') || peek('/') || peek('%')) { var o = t[p++].v, b = power(); a = o === '*' ? a * b : o === '/' ? a / b : a % b; } return a; }
    function power() { var a = unary(); if (peek('^')) { p++; return Math.pow(a, power()); } return a; }
    function unary() { if (peek('-')) { p++; return -unary(); } if (peek('+')) { p++; return unary(); } return prim(); }
    function prim() {
      var k = t[p++]; if (!k) throw new Error('The formula ends too early');
      if (k.t === 'n') return k.v;
      if (k.t === 'op' && k.v === '(') { var v = cmp(); if (!peek(')')) throw new Error('A bracket ")" is missing'); p++; return v; }
      if (k.t === 'id') {
        if (peek('(')) { var f = FN[k.v.toLowerCase()]; if (!f) throw new Error('Unknown function ' + k.v); p++; var args = []; if (!peek(')')) { args.push(cmp()); while (peek(',')) { p++; args.push(cmp()); } } if (!peek(')')) throw new Error('A bracket ")" is missing'); p++; return f.apply(null, args); }
        if (k.v === 'pi' || k.v === 'PI') return Math.PI;
        if (!(k.v in scope)) throw new Error('Unknown name "' + k.v + '"');
        var x = scope[k.v]; if (x == null || x === '') throw new Error('missing'); return Number(x);
      }
      throw new Error('Unexpected "' + k.v + '"');
    }
    var r = cmp(); if (p < t.length) throw new Error('Unexpected "' + t[p].v + '"'); return r;
  }

  /* ---------- data ---------- */
  var editSeq = 0;
  async function loadAll(live) {
    var seq = editSeq;
    var ls = await Promise.all(['res_projects', 'res_tests', 'res_solutions'].map(function (c) { return A.planner.list(c).catch(function (e) { console.warn(c, e); return []; }); }));
    if (live && (seq !== editSeq || saving || Object.keys(pend).length)) return false;
    R.projects = ls[0].map(function (r) { return r.data; }).filter(Boolean);
    R.tests = ls[1].map(function (r) { return r.data; }).filter(Boolean).sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    R.sols = ls[2].map(function (r) { return r.data; }).filter(Boolean).sort(function (a, b) { return (b.prepared || '').localeCompare(a.prepared || ''); });
    return true;
  }
  async function loadRefs() {
    try {
      var d = await sb.from('app_docs').select('name,data').in('name', ['baseline', 'materials', 'recipes']);
      var by = {}; (d.data || []).forEach(function (x) { by[x.name] = x.data; });
      var names = {};
      var bm = (by.baseline && by.baseline.materials) || {};
      Object.keys(bm).forEach(function (k) { var m = bm[k]; names[k] = { id: k, name: m.name || k, unit: m.recipeUnit || m.unit || '' }; });
      ((by.materials && by.materials.extra) || []).forEach(function (m) { names[m.id] = { id: m.id, name: m.name, unit: m.recipeUnit || m.unit || '' }; });
      R.matInfo = names; R.mats = Object.keys(names).map(function (k) { return names[k].name; }).sort();
      R.recipes = by.recipes || null;
    } catch (e) { console.warn('refs', e); }
    try { var c = await sb.from('planner_docs').select('id,data').eq('coll', 'lab_config').eq('id', 'main').single(); R.labCfg = c.data && c.data.data; R.products = ((R.labCfg && R.labCfg.products) || []).map(function (p) { return { code: p.code || p.id, name: p.name }; }); } catch (e) {}
    try { var pr = await sb.from('profiles').select('full_name,username'); R.people = (pr.data || []).map(function (x) { return x.full_name || x.username; }).filter(Boolean).sort(); } catch (e) {}
    if (R.people.indexOf(ME) < 0) R.people.push(ME);
  }
  var saveT = {}, saving = 0;
  function chip() { var c = $('#saveChip'); if (c) c.textContent = saving ? 'Saving…' : 'All changes saved'; }
  async function put(coll, obj) {
    obj.updatedAt = new Date().toISOString(); obj.updatedBy = ME; editSeq++;
    saving++; chip();
    try { await A.planner.set(coll, obj.id, obj); }
    catch (e) { toast('Could not save: ' + (/row-level|42501|permission/i.test((e.message || '') + e.code) ? 'this account is not allowed to save research yet (ask the admin).' : (e.message || e))); }
    saving--; chip();
  }
  var pend = {};
  function saveProject(p, now) { editSeq++; clearTimeout(saveT[p.id]); if (now) { delete pend[p.id]; return put('res_projects', p); } pend[p.id] = 1; saveT[p.id] = setTimeout(function () { delete pend[p.id]; put('res_projects', p); }, 600); }
  async function delDoc(coll, id) { try { await A.planner.del(coll, id); } catch (e) { toast('Could not delete: ' + (e.message || e)); } }
  function log(p, text) { (p.log = p.log || []).unshift({ id: uid('l'), at: new Date().toISOString(), by: ME, text: text, auto: true }); }

  /* ---------- reference lists ---------- */
  var STATUS = [['idea', 'Idea'], ['planned', 'Planned'], ['running', 'Running'], ['review', 'In review'], ['done', 'Done'], ['stopped', 'Stopped']];
  var STL = {}; STATUS.forEach(function (s) { STL[s[0]] = s[1]; });
  var UNITS = [['%w/w', '% w/w (of batch weight)'], ['%w/v', '% w/v (g per 100 mL)'], ['g/L', 'g/L'], ['g/kg', 'g/kg'], ['ppm', 'ppm (mg/kg)'], ['kg', 'kg per batch'], ['g', 'g per batch'], ['L', 'L per batch'], ['mL', 'mL per batch'], ['qs', 'q.s. (fill to batch)'], ['unit', 'units per batch (bucket, bag…)']];
  var KINDS = [['chem', 'Chemical'], ['phys', 'Physical'], ['micro', 'Microbiology'], ['sensory', 'Sensory'], ['other', 'Other']];
  var TEMPLATES = {
    recipe: { label: 'New or improved recipe', icon: '🧪', why: 'Try a new recipe or change an existing one and check it meets the specs.', tps: ['Day 0'], trials: ['Control (current)', 'Trial A', 'Trial B'], tests: ['Brix', 'pH', 'Acidity', 'Density', 'Taste panel', 'Appearance'] },
    shelf: { label: 'Shelf-life / stability', icon: '⏳', why: 'Check how the product changes over time in storage.', tps: ['Day 0', 'Week 1', 'Week 2', 'Month 1', 'Month 2', 'Month 3'], storage: 'Room temperature 25–30 °C', trials: ['Sample A'], tests: ['Brix', 'pH', 'Acidity', 'Total viable count', 'Yeast & mould', 'Appearance', 'Taste panel'] },
    supplier: { label: 'New supplier / material check', icon: '📦', why: 'Compare a new supplier\'s material with the current one before using it.', tps: ['Day 0'], trials: ['Current supplier', 'New supplier'], tests: ['Brix', 'pH', 'Acidity', 'Appearance', 'Taste panel'] },
    process: { label: 'Process change', icon: '⚙️', why: 'Test a change in the process (temperature, time, order of mixing, filtration…).', tps: ['Day 0'], trials: ['Current process', 'New process'], tests: ['Brix', 'pH', 'Appearance'] },
    blank: { label: 'Blank project', icon: '📄', why: '', tps: ['Day 0'], trials: ['Trial 1'], tests: [] }
  };
  var STARTER = [
    { name: 'Brix', kind: 'phys', method: 'Refractometer at 20 °C', inputs: [{ key: 'x', label: 'Reading', unit: '°Bx' }], outputs: [{ key: 'brix', label: 'Brix', unit: '°Bx', dp: 1, formula: 'x' }] },
    { name: 'pH', kind: 'chem', method: 'pH meter (calibrated)', inputs: [{ key: 'x', label: 'pH', unit: '' }], outputs: [{ key: 'ph', label: 'pH', unit: '', dp: 2, formula: 'x' }] },
    { name: 'Acidity', kind: 'chem', method: 'Titration with NaOH, phenolphthalein, as citric acid', inputs: [{ key: 'V', label: 'NaOH used', unit: 'mL' }, { key: 'W', label: 'Sample weight', unit: 'g' }], consts: [{ key: 'N', label: 'NaOH normality', unit: 'N', value: '0.1' }, { key: 'E', label: 'Citric acid eq. weight', unit: 'g/eq', value: '64.04' }], outputs: [{ key: 'acid', label: 'Acidity', unit: '%', dp: 2, formula: 'V*N*E/(W*10)' }] },
    { name: 'Density', kind: 'phys', method: 'Weigh 10 mL at 20 °C', inputs: [{ key: 'm', label: 'Mass of 10 mL', unit: 'g' }], outputs: [{ key: 'd', label: 'Density', unit: 'g/mL', dp: 3, formula: 'm/10' }] },
    { name: 'Viscosity', kind: 'phys', method: 'Viscometer', inputs: [{ key: 'x', label: 'Reading', unit: 'cP' }], outputs: [{ key: 'v', label: 'Viscosity', unit: 'cP', dp: 0, formula: 'x' }] },
    { name: 'Colour (L a b)', kind: 'phys', method: 'Colorimeter', inputs: [{ key: 'L', label: 'L*', unit: '' }, { key: 'a', label: 'a*', unit: '' }, { key: 'b', label: 'b*', unit: '' }], consts: [{ key: 'L0', label: 'Reference L*', unit: '', value: '' }, { key: 'a0', label: 'Reference a*', unit: '', value: '' }, { key: 'b0', label: 'Reference b*', unit: '', value: '' }], outputs: [{ key: 'L_', label: 'L*', unit: '', dp: 1, formula: 'L' }, { key: 'dE', label: 'ΔE vs reference', unit: '', dp: 2, formula: 'sqrt((L-L0)^2+(a-a0)^2+(b-b0)^2)', max: '3' }] },
    { name: 'Total viable count', kind: 'micro', method: 'Plate count agar, 30 °C, 72 h', inputs: [{ key: 'c', label: 'Colonies', unit: '' }, { key: 'dil', label: 'Dilution factor', unit: '' }], outputs: [{ key: 'tvc', label: 'TVC', unit: 'cfu/g', dp: 0, formula: 'c*dil' }] },
    { name: 'Yeast & mould', kind: 'micro', method: 'PDA/DRBC, 25 °C, 5 days', inputs: [{ key: 'c', label: 'Colonies', unit: '' }, { key: 'dil', label: 'Dilution factor', unit: '' }], outputs: [{ key: 'ym', label: 'Yeast & mould', unit: 'cfu/g', dp: 0, formula: 'c*dil' }] },
    { name: 'Taste panel', kind: 'sensory', method: '5 tasters score 1 (dislike) to 9 (like very much)', inputs: [1, 2, 3, 4, 5].map(function (i) { return { key: 'p' + i, label: 'Taster ' + i, unit: '1–9' }; }), outputs: [{ key: 'score', label: 'Average score', unit: '/9', dp: 1, formula: 'avg(p1,p2,p3,p4,p5)', min: '6' }] },
    { name: 'Appearance', kind: 'sensory', method: 'Visual check: colour, clarity, sediment, foam', inputs: [{ key: 'ok', label: 'Result', unit: '', type: 'pf' }, { key: 'note', label: 'Comment', unit: '', type: 'text' }], outputs: [] }
  ];

  /* ---------- project helpers ---------- */
  function P0(id) { return R.projects.filter(function (p) { return p.id === id; })[0]; }
  function nextCode() { var y = String(new Date().getFullYear()).slice(-2), n = 0; R.projects.forEach(function (p) { var m = /^R-(\d\d)-(\d+)$/.exec(p.code || ''); if (m && m[1] === y) n = Math.max(n, +m[2]); }); return 'R-' + y + '-' + String(n + 1).padStart(3, '0'); }
  function testFromLib(name) { var t = R.tests.filter(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })[0] || STARTER.filter(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })[0]; if (!t) return null; var c = clone(t); c.id = uid('t'); c.libId = t.id || null; return normTest(c); }
  function normTest(t) { t.inputs = t.inputs || []; t.consts = t.consts || []; t.outputs = t.outputs || []; t.inputs.forEach(function (i) { i.type = i.type || 'num'; }); return t; }
  function newTrial(p, name, copyFrom) {
    var n = (p.trials || []).length + 1, t = copyFrom ? clone(copyFrom) : { formula: {}, process: '', conditions: '', notes: '' };
    t.id = uid('tr'); t.code = 'T' + n; while ((p.trials || []).some(function (x) { return x.code === t.code; })) t.code = 'T' + (++n);
    t.name = name || (copyFrom ? copyFrom.name + ' (copy)' : 'Trial ' + n); t.date = today(); t.by = ME; t.status = 'planned'; t.parent = copyFrom ? copyFrom.id : null; t.control = false;
    return t;
  }
  function createProject(kind, f) {
    var T = TEMPLATES[kind] || TEMPLATES.blank;
    var p = { id: uid('rp'), code: nextCode(), kind: kind, title: f.title || T.label, product: f.product || '', goal: f.goal || T.why, hypothesis: '', owner: f.owner || ME, team: '', status: 'planned', priority: 'normal',
      start: today(), due: '', tags: '', batch: { size: 100, unit: 'L', density: 1 }, ings: [], trials: [], tests: [], tps: T.tps.map(function (n) { return { id: uid('tp'), name: n, date: '' }; }), storage: T.storage || '',
      results: {}, log: [], conclusion: '', decision: '', signoff: null, created: new Date().toISOString(), createdBy: ME };
    T.trials.forEach(function (n, i) { var t = newTrial(p, n); if (i === 0 && /control|current/i.test(n)) t.control = true; p.trials.push(t); });
    T.tests.forEach(function (n) { var t = testFromLib(n); if (t) p.tests.push(t); });
    log(p, 'Project created (' + T.label + ')');
    R.projects.push(p); saveProject(p, true); return p;
  }

  /* batch maths: everything to kg per batch */
  function batchKg(p) { var b = p.batch || {}, s = num(b.size) || 0, d = num(b.density) || 1; return b.unit === 'kg' ? s : s * d; }
  function batchL(p) { var b = p.batch || {}, s = num(b.size) || 0, d = num(b.density) || 1; return b.unit === 'L' ? s : s / d; }
  function ingKg(p, ing, v) {
    if (v == null) return null; var u = ing.unit, d = num(ing.density) || 1, BK = batchKg(p), BL = batchL(p);
    switch (u) { case '%w/w': return v / 100 * BK; case '%w/v': return v * BL / 100; case 'g/L': return v * BL / 1000; case 'g/kg': return v * BK / 1000; case 'ppm': return v * BK / 1e6;
      case 'kg': return v; case 'g': return v / 1000; case 'L': return v * d; case 'mL': return v * d / 1000; case 'unit': return num(ing.kgPer) != null ? v * num(ing.kgPer) : null; default: return null; }
  }
  function trialKg(p, tr) {
    var rows = {}, tot = 0, qs = null;
    (p.ings || []).forEach(function (ing) { if (ing.unit === 'qs') { qs = ing; return; } var k = ingKg(p, ing, num((tr.formula || {})[ing.id])); rows[ing.id] = k; if (k != null) tot += k; });
    if (qs) { rows[qs.id] = Math.max(0, batchKg(p) - tot); tot = Math.max(tot, batchKg(p)); }
    return { rows: rows, total: tot };
  }
  /* results */
  function scopeOf(test, entry) {
    var s = {}; test.consts.forEach(function (c) { var v = c.sol ? solValue(c.sol) : c.value; s[c.key] = num(v); });
    test.inputs.forEach(function (i) { var v = entry && entry.in ? entry.in[i.key] : null; s[i.key] = i.type === 'pf' ? (v === 'pass' ? 1 : v === 'fail' ? 0 : null) : num(v); });
    return s;
  }
  function outputs(test, entry) {
    var s = scopeOf(test, entry), o = {};
    test.outputs.forEach(function (out) { try { var v = evalF(out.formula, s); o[out.key] = isFinite(v) ? v : null; s[out.key] = o[out.key]; } catch (e) { o[out.key] = null; } });
    return o;
  }
  function judge(out, v) { if (v == null) return ''; var mn = num(out.min), mx = num(out.max); if (mn == null && mx == null) return ''; return (mn != null && v < mn) || (mx != null && v > mx) ? 'bad' : 'good'; }
  function entryOf(p, tr, tp, test) { return ((((p.results || {})[tr] || {})[tp] || {})[test]) || null; }
  function filled(e) { return e && e.in && Object.keys(e.in).some(function (k) { return e.in[k] !== '' && e.in[k] != null; }); }
  function progress(p) { var need = (p.trials || []).length * (p.tps || []).length * (p.tests || []).length, got = 0; (p.trials || []).forEach(function (tr) { (p.tps || []).forEach(function (tp) { (p.tests || []).forEach(function (t) { if (filled(entryOf(p, tr.id, tp.id, t.id))) got++; }); }); }); return need ? got / need : 0; }
  function solValue(id) { var s = R.sols.filter(function (x) { return x.id === id; })[0]; if (!s) return null; return num(s.actual) != null ? num(s.actual) : num(s.target); }

  /* ---------- rendering ---------- */
  function route() { var h = location.hash.slice(1) || 'home'; if (h.indexOf('p=') === 0) { var parts = h.slice(2).split('/'); return { v: 'project', id: parts[0], tab: parts[1] || 'setup' }; } return { v: h }; }
  function render() {
    var r = route(); A.setSub(r.v === 'project' ? 'home' : r.v);
    if (r.v === 'project') { var p = P0(r.id); if (!p) { location.hash = 'home'; return; } V.ptab = r.tab; main.innerHTML = projectHTML(p); bindProject(p); }
    else if (r.v === 'tests') { main.innerHTML = testsHTML(); bindTests(); }
    else if (r.v === 'solutions') { main.innerHTML = solsHTML(); bindSols(); }
    else if (r.v === 'tools') { main.innerHTML = toolsHTML(); bindTools(); }
    else { main.innerHTML = homeHTML(); bindHome(); }
    chip();
  }
  function rerender() { var a = document.activeElement, k = a && a.dataset && a.dataset.k, y = window.scrollY, sx = {}; document.querySelectorAll('.tablewrap').forEach(function (w, i) { sx[i] = w.scrollLeft; }); render(); window.scrollTo(0, y); document.querySelectorAll('.tablewrap').forEach(function (w, i) { if (sx[i]) w.scrollLeft = sx[i]; }); if (k) { var n = document.querySelector('[data-k="' + CSS.escape(k) + '"]'); if (n) { n.focus(); if (n.select && n.type !== 'date') try { n.select(); } catch (e) {} } } }
  function header(title, sub, right) { return '<div class="rs-top"><div><h1>' + title + '<span class="rs-tag">Under testing</span></h1>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div><div class="row" style="gap:8px;align-items:center"><span class="save-chip" id="saveChip"></span>' + (right || '') + '</div></div>'; }
  function stBadge(s) { return '<span class="st st-' + esc(s || 'idea') + '">' + esc(STL[s] || s) + '</span>'; }
  function opts(list, cur) { return list.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join(''); }
  function dl(id, list) { return '<datalist id="' + id + '">' + list.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>'; }

  /* HOME */
  function homeHTML() {
    var ps = R.projects.slice().sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
    var act = ps.filter(function (p) { return ['planned', 'running', 'review', 'idea'].indexOf(p.status) >= 0; });
    var q = V.q.toLowerCase();
    var list = ps.filter(function (p) { if (V.filter === 'active' && ['done', 'stopped'].indexOf(p.status) >= 0) return false; if (V.filter === 'mine' && p.owner !== ME && (p.team || '').indexOf(ME) < 0) return false; if (STL[V.filter] && p.status !== V.filter) return false; return !q || [p.title, p.code, p.product, p.goal, p.owner, p.tags].join(' ').toLowerCase().indexOf(q) >= 0; });
    var overdue = act.filter(function (p) { return p.due && p.due < today(); }).length;
    var h = header('Research', 'Trials and experiments: what is tested, why, by whom, the formulas, the results and the decision.', '<button class="btn primary" id="newP">+ New project</button>');
    h += '<div class="rs-kpis">' + [['Active projects', act.length], ['Running now', ps.filter(function (p) { return p.status === 'running'; }).length], ['Waiting for review', ps.filter(function (p) { return p.status === 'review'; }).length], ['Finished', ps.filter(function (p) { return p.status === 'done'; }).length], ['Overdue', overdue]].map(function (k) { return '<div class="rs-kpi"><div class="l">' + k[0] + '</div><div class="v">' + k[1] + '</div></div>'; }).join('') + '</div>';
    h += '<div class="rs-filters"><input type="search" id="q" placeholder="Search title, product, person…" value="' + esc(V.q) + '">' + [['active', 'Active'], ['mine', 'Mine'], ['all', 'All']].concat(STATUS).map(function (f) { return '<button class="pill" data-f="' + f[0] + '" aria-pressed="' + (V.filter === f[0]) + '">' + f[1] + '</button>'; }).join('') + '</div>';
    if (!R.projects.length) h += '<div class="empty2"><div style="font-size:42px">🔬</div><h3 style="margin:8px 0">No research projects yet</h3><p>Start one with <b>+ New project</b>. Pick a template (new recipe, shelf life, new supplier, process change) and everything is set up for you: trials, tests and time points. Change anything after.</p></div>';
    else if (!list.length) h += '<div class="empty2">Nothing matches this filter.</div>';
    else h += '<div class="rs-cards">' + list.map(function (p) {
      var pr = progress(p), od = p.due && p.due < today() && ['done', 'stopped'].indexOf(p.status) < 0;
      return '<button class="rs-card" data-open="' + p.id + '"><div class="row" style="justify-content:space-between;gap:8px"><span class="mono" style="font-size:12px;color:var(--rs);font-weight:600">' + esc(p.code) + ' · ' + esc((TEMPLATES[p.kind] || {}).icon || '📄') + '</span>' + stBadge(p.status) + '</div><h3>' + esc(p.title) + '</h3><p class="why">' + esc(p.goal || 'No goal written yet') + '</p><div class="meta"><span>👤 ' + esc(p.owner || '–') + '</span>' + (p.product ? '<span>🏷️ ' + esc(p.product) + '</span>' : '') + '<span>🧪 ' + (p.trials || []).length + ' trial' + ((p.trials || []).length === 1 ? '' : 's') + '</span><span>📋 ' + (p.tests || []).length + ' tests</span>' + (p.due ? '<span style="' + (od ? 'color:var(--red);font-weight:600' : '') + '">📅 ' + (od ? 'Overdue · ' : 'Due ') + nice(p.due) + '</span>' : '') + '</div><div class="rs-bar" title="Results entered"><i style="width:' + Math.round(pr * 100) + '%"></i></div><div class="meta"><span>' + Math.round(pr * 100) + '% of results entered</span><span>Updated ' + nice((p.updatedAt || p.created || '').slice(0, 10)) + (p.updatedBy ? ' by ' + esc(p.updatedBy) : '') + '</span></div></button>';
    }).join('') + '</div>';
    return h;
  }
  function bindHome() {
    $('#newP').onclick = newProjectModal;
    $('#q').oninput = function (e) { V.q = e.target.value; var pos = e.target.selectionStart; render(); var q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); };
    main.querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { V.filter = b.dataset.f; render(); }; });
    main.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { location.hash = 'p=' + b.dataset.open + '/setup'; }; });
  }
  function modal(html, bind) { var bg = document.createElement('div'); bg.className = 'mbg'; bg.innerHTML = '<div class="mbox" role="dialog" aria-modal="true">' + html + '</div>'; document.body.appendChild(bg); var close = function () { bg.remove(); document.removeEventListener('keydown', kd); }; var kd = function (e) { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', kd); bg.addEventListener('mousedown', function (e) { if (e.target === bg) close(); }); bind(bg.firstChild, close); return close; }
  function newProjectModal() {
    var kind = 'recipe';
    modal('<h2>New research project</h2><div class="rs-cards" id="tpl" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">' + Object.keys(TEMPLATES).map(function (k) { var t = TEMPLATES[k]; return '<button class="rs-card" data-k="' + k + '" style="padding:10px 12px' + (k === kind ? ';outline:2px solid var(--rs)' : '') + '"><div style="font-size:24px">' + t.icon + '</div><b style="font-size:13.5px">' + t.label + '</b></button>'; }).join('') + '</div>' +
      '<div class="rs-grid2"><label class="rs-f w2">Title<input id="nt" placeholder="e.g. Grenadine with less sugar"></label><label class="rs-f">Product<input id="np" list="dlProd" placeholder="GM, BW, a new product…"></label><label class="rs-f">Who is in charge<input id="no" list="dlPeople" value="' + esc(ME) + '"></label><label class="rs-f w2">Why are we doing this?<textarea id="ng" placeholder="The goal: what problem it solves or what we want to learn"></textarea></label></div>' +
      dl('dlProd', R.products.map(function (p) { return p.code + ' – ' + p.name; })) + dl('dlPeople', R.people) +
      '<p class="hint" id="tplInfo"></p><div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-x>Cancel</button><button class="btn primary" id="mk">Create project</button></div>', function (box, close) {
      function info() { var t = TEMPLATES[kind]; box.querySelector('#tplInfo').innerHTML = 'Sets up: <b>' + t.trials.join(', ') + '</b> · tests: ' + (t.tests.length ? t.tests.join(', ') : 'none yet') + ' · time points: ' + t.tps.join(', ') + '. Everything can be changed after.'; if (!box.querySelector('#ng').value || box.querySelector('#ng').dataset.auto) { box.querySelector('#ng').value = t.why; box.querySelector('#ng').dataset.auto = '1'; } }
      box.querySelectorAll('#tpl [data-k]').forEach(function (b) { b.onclick = function () { kind = b.dataset.k; box.querySelectorAll('#tpl [data-k]').forEach(function (x) { x.style.outline = x === b ? '2px solid var(--rs)' : ''; }); info(); }; });
      box.querySelector('#ng').oninput = function (e) { delete e.target.dataset.auto; };
      info();
      box.querySelector('[data-x]').onclick = close;
      box.querySelector('#mk').onclick = function () { var p = createProject(kind, { title: box.querySelector('#nt').value.trim(), product: box.querySelector('#np').value.trim(), owner: box.querySelector('#no').value.trim(), goal: box.querySelector('#ng').value.trim() }); close(); location.hash = 'p=' + p.id + '/setup'; };
      setTimeout(function () { box.querySelector('#nt').focus(); }, 30);
    });
  }

  /* PROJECT */
  var PTABS = [['setup', 'Overview'], ['formula', 'Formulas'], ['tests', 'Tests'], ['results', 'Results'], ['compare', 'Compare'], ['journal', 'Journal'], ['report', 'Report']];
  function projectHTML(p) {
    var h = '<div class="noprint"><a href="#home" class="muted" style="text-decoration:none;font-size:13px">← All projects</a></div>';
    h += header('<span class="mono" style="color:var(--rs);font-size:16px;margin-right:8px">' + esc(p.code) + '</span>' + esc(p.title), stBadge(p.status) + ' · 👤 ' + esc(p.owner || '–') + (p.product ? ' · 🏷️ ' + esc(p.product) : '') + ' · ' + (p.trials || []).length + ' trials · ' + Math.round(progress(p) * 100) + '% of results in', '<button class="btn noprint" id="dupP" title="Copy this project with its trials and tests (no results)">Duplicate</button><button class="btn noprint" id="delP">Delete</button>');
    h += '<div class="rs-ptabs">' + PTABS.map(function (t) { var n = t[0] === 'formula' ? (p.trials || []).length : t[0] === 'tests' ? (p.tests || []).length : t[0] === 'journal' ? (p.log || []).filter(function (x) { return !x.auto; }).length : null; return '<button data-pt="' + t[0] + '" aria-pressed="' + (V.ptab === t[0]) + '">' + t[1] + (n ? '<span class="n">' + n + '</span>' : '') + '</button>'; }).join('') + '</div>';
    h += ({ setup: setupHTML, formula: formulaHTML, tests: ptestsHTML, results: resultsHTML, compare: compareHTML, journal: journalHTML, report: reportHTML })[V.ptab](p);
    return h;
  }
  function F(label, k, val, type, extra, cls) { var t = type || 'text'; return '<label class="rs-f' + (cls ? ' ' + cls : '') + '">' + label + (t === 'textarea' ? '<textarea data-k="' + k + '"' + (extra || '') + '>' + esc(val) + '</textarea>' : t === 'select' ? '<select data-k="' + k + '">' + extra + '</select>' : '<input type="' + t + '" data-k="' + k + '" value="' + esc(val) + '"' + (extra || '') + '>') + '</label>'; }
  function setupHTML(p) {
    var b = p.batch || {};
    var h = '<div class="panel"><div class="rs-sec"><h2>What, why and who</h2></div><div class="rs-grid2">' +
      F('Title', 'p.title', p.title, 'text', '', 'w2') + F('Status', 'p.status', '', 'select', opts(STATUS, p.status)) + F('Priority', 'p.priority', '', 'select', opts([['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']], p.priority)) +
      F('Why are we doing this? (goal)', 'p.goal', p.goal, 'textarea', '', 'w2') + F('What do we expect? (hypothesis)', 'p.hypothesis', p.hypothesis, 'textarea', ' placeholder="e.g. Replacing 20% of sugar with … keeps Brix ≥ 65 and taste ≥ 7/9"', 'w2') +
      F('Product', 'p.product', p.product, 'text', ' list="dlProd"') + F('Person in charge', 'p.owner', p.owner, 'text', ' list="dlPeople"') + F('Team (helpers)', 'p.team', p.team, 'text', ' list="dlPeople" placeholder="names, separated by commas"') + F('Tags', 'p.tags', p.tags, 'text', ' placeholder="sugar, cost saving…"') +
      F('Start', 'p.start', p.start, 'date') + F('Due', 'p.due', p.due, 'date') + '</div></div>';
    h += '<div class="panel"><div class="rs-sec"><h2>Batch size for the formulas</h2><span class="hint">Used to turn percentages into kg for each trial (a lab batch can be 1 L, a factory batch 1,000 L).</span></div><div class="rs-grid2">' +
      F('Batch size', 'b.size', b.size, 'number', ' step="any"') + F('Unit', 'b.unit', '', 'select', opts([['L', 'Litres'], ['kg', 'kg'], ['mL', 'mL (lab)'], ['g', 'g (lab)']], b.unit)) + F('Product density (g/mL)', 'b.density', b.density, 'number', ' step="any" placeholder="1.32"') + '</div></div>';
    h += '<div class="panel"><div class="rs-sec"><h2>Time points</h2><span class="hint">When samples are tested. One point for a normal trial; several for shelf life.</span></div>' +
      '<div class="rs-grid2">' + F('Storage condition', 'p.storage', p.storage, 'text', ' placeholder="e.g. 25–30 °C, dark; 40 °C accelerated"', 'w2') + '</div><div class="tablewrap" style="margin-top:10px"><table class="ft"><thead><tr><th>Time point</th><th>Planned date</th><th></th></tr></thead><tbody>' +
      (p.tps || []).map(function (tp) { return '<tr><td><input class="nm" data-k="tp|' + tp.id + '|name" value="' + esc(tp.name) + '"></td><td><input type="date" data-k="tp|' + tp.id + '|date" value="' + esc(tp.date || '') + '" style="width:150px"></td><td><button class="iconbtn" data-deltp="' + tp.id + '" title="Remove">✕</button></td></tr>'; }).join('') + '</tbody></table></div><div class="row" style="gap:8px;margin-top:8px"><button class="btn" id="addTp">+ Time point</button><button class="btn ghost" id="shelfTp">Shelf-life set (D0, W1, W2, M1, M2, M3, M6)</button><button class="btn ghost" id="autoDates">Fill dates from start</button></div></div>';
    h += '<div class="panel"><div class="rs-sec"><h2>Conclusion and decision</h2>' + (p.signoff ? '<span class="chip ok">✔ Signed off by ' + esc(p.signoff.by) + ' · ' + nice(p.signoff.at.slice(0, 10)) + '</span>' : '') + '</div><div class="rs-grid2">' +
      F('What did we find?', 'p.conclusion', p.conclusion, 'textarea', ' placeholder="Main results in plain words"', 'w2') + F('Decision', 'p.decision', '', 'select', opts([['', '— not decided —'], ['adopt', 'Adopt: use it in production'], ['repeat', 'Repeat / more trials'], ['change', 'Change and test again'], ['reject', 'Reject']], p.decision)) + F('Chosen trial', 'p.chosen', '', 'select', '<option value="">—</option>' + opts((p.trials || []).map(function (t) { return [t.id, t.code + ' · ' + t.name]; }), p.chosen)) +
      '</div><div class="row" style="gap:8px;margin-top:10px">' + (p.signoff ? '<button class="btn" id="unsign">Remove sign-off</button>' : '<button class="btn primary" id="sign">Sign off as ' + esc(ME) + '</button>') + '</div></div>';
    return h + dl('dlProd', R.products.map(function (x) { return x.code + ' – ' + x.name; })) + dl('dlPeople', R.people);
  }
  function formulaHTML(p) {
    var trs = p.trials || [], ings = p.ings || [], ctrl = trs.filter(function (t) { return t.control; })[0] || trs[0];
    var h = '<div class="panel"><div class="rs-sec"><h2>Formulas</h2><div class="row" style="gap:6px;flex-wrap:wrap"><div class="seg" role="group">' + [['amount', 'As entered'], ['kg', 'kg per batch'], ['pct', '% of batch']].map(function (x) { return '<button data-view="' + x[0] + '" aria-pressed="' + (V.view === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div></div>' +
      '<p class="hint">Rows are ingredients, columns are trials. Enter each amount in the unit you like (% w/w, g/L, kg per batch, ppm, q.s.…); totals are worked out for a batch of <b>' + fmt(num(p.batch && p.batch.size)) + ' ' + esc(p.batch && p.batch.unit) + '</b> (change it in Overview). Cells that differ from the control trial are shaded.</p>';
    if (!trs.length) h += '<div class="empty2">No trials yet. Add one below.</div>';
    else {
      var kgs = trs.map(function (t) { return trialKg(p, t); });
      h += '<div class="tablewrap"><table class="ft"><thead><tr><th class="stick">Ingredient</th><th>Unit</th><th title="Price per kg, for the cost of each trial">Price / kg</th>' + trs.map(function (t) { return '<th><div class="trh"><b>' + esc(t.code) + (t.control ? ' · control' : '') + (p.chosen === t.id ? ' ★' : '') + '</b><input data-k="tr|' + t.id + '|name" value="' + esc(t.name) + '"><span><button class="iconbtn" data-copytr="' + t.id + '" title="Copy this trial">⧉</button><button class="iconbtn" data-ctrl="' + t.id + '" title="Make it the control">◎</button><button class="iconbtn" data-deltr="' + t.id + '" title="Delete trial">✕</button></span></div></th>'; }).join('') + '<th></th></tr></thead><tbody>';
      ings.forEach(function (ing) {
        h += '<tr><td class="stick"><input class="nm" list="dlMat" data-k="ing|' + ing.id + '|name" value="' + esc(ing.name) + '"></td><td><select data-k="ing|' + ing.id + '|unit" style="width:120px">' + opts(UNITS.map(function (u) { return [u[0], u[0] === 'unit' ? 'units/batch' : u[0] === 'qs' ? 'q.s.' : u[0]]; }), ing.unit) + '</select>' + (ing.unit === 'unit' ? '<br><input data-k="ing|' + ing.id + '|kgPer" value="' + esc(ing.kgPer || '') + '" placeholder="kg each" title="kg in one unit (bucket, bag…)" style="width:80px">' : '') + (ing.unit === 'L' || ing.unit === 'mL' ? '<br><input data-k="ing|' + ing.id + '|density" value="' + esc(ing.density || '') + '" placeholder="density" style="width:80px">' : '') + '</td><td><input data-k="ing|' + ing.id + '|price" value="' + esc(ing.price || '') + '" placeholder="OMR" style="width:70px"></td>';
        trs.forEach(function (t, i) {
          var v = (t.formula || {})[ing.id], cv = ctrl ? (ctrl.formula || {})[ing.id] : v, diff = ctrl && t !== ctrl && String(v == null ? '' : v) !== String(cv == null ? '' : cv);
          if (ing.unit === 'qs') { h += '<td class="out">' + fmt(kgs[i].rows[ing.id], 3) + ' kg</td>'; return; }
          if (V.view === 'amount') h += '<td' + (diff ? ' class="chg"' : '') + '><input data-k="f|' + t.id + '|' + ing.id + '" value="' + esc(v == null ? '' : v) + '" inputmode="decimal"></td>';
          else { var k = kgs[i].rows[ing.id]; h += '<td class="out' + (diff ? ' chg' : '') + '">' + (V.view === 'kg' ? fmt(k, 3) : fmt(k != null && kgs[i].total ? k / kgs[i].total * 100 : null, 2) + '%') + '</td>'; }
        });
        h += '<td><button class="iconbtn" data-deling="' + ing.id + '" title="Remove ingredient">✕</button></td></tr>';
      });
      var cost = trs.map(function (t, i) { var c = 0, any = false; ings.forEach(function (ing) { var k = kgs[i].rows[ing.id], pr = num(ing.price); if (k != null && pr != null) { c += k * pr; any = true; } }); return any ? c : null; });
      h += '</tbody><tfoot><tr><td class="stick">Total weight per batch</td><td></td><td></td>' + kgs.map(function (k) { return '<td class="out">' + fmt(k.total, 2) + ' kg</td>'; }).join('') + '<td></td></tr>' +
        '<tr><td class="stick">Cost per batch</td><td></td><td></td>' + cost.map(function (c) { return '<td class="out">' + (c == null ? '–' : fmt(c, 3) + ' OMR') + '</td>'; }).join('') + '<td></td></tr>' +
        '<tr><td class="stick">Cost per kg of product</td><td></td><td></td>' + cost.map(function (c, i) { return '<td class="out">' + (c == null || !kgs[i].total ? '–' : fmt(c / kgs[i].total, 4)) + '</td>'; }).join('') + '<td></td></tr></tfoot></table></div>';
    }
    h += '<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn" id="addIng">+ Ingredient</button><button class="btn" id="addTr">+ Trial</button>' + (R.recipes ? '<button class="btn ghost" id="fromRecipe">Load a production recipe…</button>' : '') + '<button class="btn ghost" id="scaleBtn">Scale to another batch size…</button></div></div>';
    h += '<div class="panel"><div class="rs-sec"><h2>How each trial is made</h2><span class="hint">Who made it, when, the process and conditions.</span></div>' + trs.map(function (t) {
      var par = t.parent && trs.filter(function (x) { return x.id === t.parent; })[0];
      return '<details class="rs-test"' + (trs.length <= 3 ? ' open' : '') + '><summary><b class="mono" style="color:var(--rs)">' + esc(t.code) + '</b> ' + esc(t.name) + ' ' + stBadge(t.status) + (par ? ' <span class="hint">copied from ' + esc(par.code) + '</span>' : '') + '</summary><div class="rs-grid2" style="margin-top:10px">' +
        F('Made by', 'tr|' + t.id + '|by', t.by, 'text', ' list="dlPeople"') + F('Date', 'tr|' + t.id + '|date', t.date, 'date') + F('Status', 'tr|' + t.id + '|status', '', 'select', opts([['planned', 'Planned'], ['running', 'Made / testing'], ['done', 'Finished'], ['stopped', 'Stopped']], t.status)) + F('Batch / lot no.', 'tr|' + t.id + '|lot', t.lot || '', 'text') +
        F('Process (steps, order of adding, mixing, heating, filtering…)', 'tr|' + t.id + '|process', t.process, 'textarea', '', 'w2') + F('Conditions (temperature, time, speed…)', 'tr|' + t.id + '|conditions', t.conditions, 'textarea') + F('Notes / observations', 'tr|' + t.id + '|notes', t.notes, 'textarea') + '</div></details>';
    }).join('') + '</div>';
    return h + dl('dlMat', R.mats) + dl('dlPeople', R.people);
  }
  function ptestsHTML(p) {
    var h = '<div class="panel"><div class="rs-sec"><h2>Tests in this project</h2><div class="row" style="gap:8px"><button class="btn" id="addLib">+ From the test library</button><button class="btn primary" id="newPT">+ Build a new test</button></div></div><p class="hint">Each project keeps its own copy of a test, so you can set limits and targets just for this project without changing the library.</p>';
    if (!(p.tests || []).length) h += '<div class="empty2">No tests yet. Add from the library or build one (any formula, any inputs).</div>';
    (p.tests || []).forEach(function (t, i) {
      h += '<div class="rs-test"><div class="rs-sec" style="margin:0"><div><h3>' + esc(t.name) + ' <span class="hint">' + esc((KINDS.filter(function (k) { return k[0] === t.kind; })[0] || [0, ''])[1]) + '</span></h3><div class="m">' + esc(t.method || '') + (t.consts.length ? ' · uses ' + t.consts.map(function (c) { return esc(c.label || c.key) + ' = ' + esc(c.sol ? (solName(c.sol) + ' (' + fmt(solValue(c.sol), 5) + ')') : c.value); }).join(', ') : '') + '</div></div><div class="row" style="gap:2px"><button class="iconbtn" data-up="' + i + '" title="Move up">▲</button><button class="iconbtn" data-edpt="' + t.id + '" title="Edit">✎</button><button class="iconbtn" data-delpt="' + t.id + '" title="Remove">✕</button></div></div>';
      if (t.outputs.length) h += '<div class="tablewrap" style="margin-top:8px"><table class="ft"><thead><tr><th>Result</th><th>Formula</th><th>Unit</th><th>Min</th><th>Target</th><th>Max</th></tr></thead><tbody>' + t.outputs.map(function (o) { return '<tr><td><b>' + esc(o.label) + '</b></td><td class="mono" style="font-size:12.5px">' + esc(o.formula) + '</td><td>' + esc(o.unit) + '</td><td><input data-k="spec|' + t.id + '|' + o.key + '|min" value="' + esc(o.min == null ? '' : o.min) + '" style="width:70px"></td><td><input data-k="spec|' + t.id + '|' + o.key + '|target" value="' + esc(o.target == null ? '' : o.target) + '" style="width:70px"></td><td><input data-k="spec|' + t.id + '|' + o.key + '|max" value="' + esc(o.max == null ? '' : o.max) + '" style="width:70px"></td></tr>'; }).join('') + '</tbody></table></div>';
      h += '</div>';
    });
    return h + '</div>';
  }
  function solName(id) { var s = R.sols.filter(function (x) { return x.id === id; })[0]; return s ? s.name : 'missing solution'; }
  function resultsHTML(p) {
    var tps = p.tps || [], trs = p.trials || [];
    if (!V.tp || !tps.some(function (x) { return x.id === V.tp; })) V.tp = (tps[0] || {}).id || '';
    var h = '<div class="panel"><div class="rs-sec"><h2>Results</h2><div class="row" style="gap:6px;flex-wrap:wrap">' + (tps.length > 1 ? tps.map(function (tp) { return '<button class="pill" data-tp="' + tp.id + '" aria-pressed="' + (V.tp === tp.id) + '">' + esc(tp.name) + (tp.date ? ' · ' + nice(tp.date).slice(0, 6) : '') + '</button>'; }).join('') : '') + '<button class="btn ghost" id="csv">Export CSV</button></div></div><p class="hint">Type the readings; results are calculated straight away and turn <b style="color:var(--green)">green</b> inside the limits or <b style="color:var(--red)">red</b> outside. Press Tab to move to the next box.</p>';
    if (!trs.length || !(p.tests || []).length) return h + '<div class="empty2">Add trials (Formulas) and tests (Tests) first.</div></div>';
    (p.tests || []).forEach(function (t) {
      h += '<div class="rs-test"><h3>' + esc(t.name) + ' <span class="m">' + esc(t.method || '') + '</span></h3><div class="tablewrap"><table class="ft"><thead><tr><th class="stick">Trial</th>' + t.inputs.map(function (i) { return '<th>' + esc(i.label) + (i.unit ? ' <span class="hint">' + esc(i.unit) + '</span>' : '') + '</th>'; }).join('') + t.outputs.map(function (o) { return '<th style="text-align:right">= ' + esc(o.label) + (o.unit ? ' <span class="hint">' + esc(o.unit) + '</span>' : '') + (o.min || o.max ? '<br><span class="hint">' + (o.min ? '≥ ' + esc(o.min) : '') + (o.min && o.max ? ', ' : '') + (o.max ? '≤ ' + esc(o.max) : '') + '</span>' : '') + '</th>'; }).join('') + '<th>By</th></tr></thead><tbody>';
      trs.forEach(function (tr) {
        var e = entryOf(p, tr.id, V.tp, t.id), o = outputs(t, e);
        h += '<tr><td class="stick"><b class="mono" style="color:var(--rs)">' + esc(tr.code) + '</b> ' + esc(tr.name) + '</td>' + t.inputs.map(function (i) {
          var v = e && e.in ? e.in[i.key] : '', k = 'r|' + tr.id + '|' + V.tp + '|' + t.id + '|' + i.key;
          if (i.type === 'pf') return '<td><select data-k="' + k + '" style="width:100px">' + opts([['', '—'], ['pass', '✔ Pass'], ['fail', '✕ Fail']], v) + '</select></td>';
          if (i.type === 'choice') return '<td><select data-k="' + k + '" style="width:130px"><option value="">—</option>' + opts(String(i.options || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean), v) + '</select></td>';
          if (i.type === 'text') return '<td><input data-k="' + k + '" value="' + esc(v == null ? '' : v) + '" style="width:200px"></td>';
          return '<td><input data-k="' + k + '" value="' + esc(v == null ? '' : v) + '" inputmode="decimal"></td>';
        }).join('') + t.outputs.map(function (out) { var v = o[out.key]; return '<td class="out ' + judge(out, v) + '">' + fmt(v, out.dp == null ? 2 : out.dp) + '</td>'; }).join('') + '<td class="hint">' + (e && e.by ? esc(e.by) + '<br>' + nice((e.at || '').slice(0, 10)) : '') + '</td></tr>';
      });
      h += '</tbody></table></div></div>';
    });
    return h + '</div>';
  }
  /* charts */
  function barChart(items, out) {
    var W = 640, H = 240, pad = 40, vals = items.map(function (x) { return x.v; }).filter(function (v) { return v != null; });
    if (!vals.length) return '<div class="empty2">No numbers yet for this result.</div>';
    var mn = num(out.min), mx = num(out.max), tg = num(out.target);
    var top = Math.max.apply(null, vals.concat([mx, tg, mn].filter(function (v) { return v != null; }))) * 1.12 || 1, bw = Math.min(70, (W - pad * 2) / items.length * 0.6);
    var y = function (v) { return H - 30 - (v / top) * (H - 50); };
    var s = '<svg class="svgc" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(out.label) + ' by trial">';
    if (mn != null || mx != null) s += '<rect x="' + pad + '" y="' + y(mx != null ? mx : top) + '" width="' + (W - pad * 2) + '" height="' + (y(mn != null ? mn : 0) - y(mx != null ? mx : top)) + '" fill="var(--green-soft)" opacity=".7"/>';
    if (tg != null) s += '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y(tg) + '" y2="' + y(tg) + '" stroke="var(--gold)" stroke-dasharray="5 4"/><text x="' + (W - pad) + '" y="' + (y(tg) - 4) + '" text-anchor="end">target ' + tg + '</text>';
    s += '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + (H - 30) + '" y2="' + (H - 30) + '" stroke="var(--line)"/>';
    items.forEach(function (it, i) { var cx = pad + (W - pad * 2) / items.length * (i + 0.5); if (it.v != null) { var j = judge(out, it.v); s += '<rect x="' + (cx - bw / 2) + '" y="' + y(it.v) + '" width="' + bw + '" height="' + (H - 30 - y(it.v)) + '" rx="5" fill="' + (j === 'bad' ? 'var(--red)' : 'var(--rs)') + '"/><text x="' + cx + '" y="' + (y(it.v) - 5) + '" text-anchor="middle" style="fill:var(--ink);font-weight:600">' + fmt(it.v, out.dp == null ? 2 : out.dp) + '</text>'; } s += '<text x="' + cx + '" y="' + (H - 12) + '" text-anchor="middle">' + esc(it.l) + '</text>'; });
    return s + '</svg>';
  }
  var PAL = ['#7c5cd6', '#0F8A6A', '#B7832F', '#C2410C', '#2563EB', '#BE185D', '#4D7C0F', '#6B7280'];
  function lineChart(series, labels, out) {
    var W = 640, H = 240, pad = 44, all = []; series.forEach(function (s) { s.v.forEach(function (v) { if (v != null) all.push(v); }); });
    if (!all.length) return '<div class="empty2">No numbers yet over time.</div>';
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all); if (hi === lo) { hi += 1; lo -= 1; } var r = hi - lo; lo -= r * .1; hi += r * .1;
    var x = function (i) { return pad + (W - pad * 2) * (labels.length < 2 ? .5 : i / (labels.length - 1)); }, y = function (v) { return H - 30 - (v - lo) / (hi - lo) * (H - 50); };
    var s = '<svg class="svgc" viewBox="0 0 ' + W + ' ' + H + '" width="100%">';
    [lo, (lo + hi) / 2, hi].forEach(function (v) { s += '<text x="' + (pad - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + fmt(v, 2) + '</text><line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)" stroke-dasharray="2 4"/>'; });
    [['min', 'var(--red)'], ['max', 'var(--red)'], ['target', 'var(--gold)']].forEach(function (q) { var v = num(out[q[0]]); if (v != null && v >= lo && v <= hi) s += '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + q[1] + '" stroke-dasharray="6 4"/><text x="' + (W - pad) + '" y="' + (y(v) - 4) + '" text-anchor="end">' + q[0] + ' ' + v + '</text>'; });
    labels.forEach(function (l, i) { s += '<text x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(l) + '</text>'; });
    series.forEach(function (se, k) { var c = PAL[k % PAL.length], d = ''; se.v.forEach(function (v, i) { if (v == null) return; d += (d ? 'L' : 'M') + x(i) + ' ' + y(v); }); s += '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2.5"/>'; se.v.forEach(function (v, i) { if (v != null) s += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="4" fill="' + c + '"><title>' + esc(se.l) + ': ' + v + '</title></circle>'; }); });
    s += '</svg><div class="legend">' + series.map(function (se, k) { return '<span><i style="background:' + PAL[k % PAL.length] + '"></i>' + esc(se.l) + '</span>'; }).join('') + '</div>';
    return s;
  }
  function allOutputs(p) { var o = []; (p.tests || []).forEach(function (t) { t.outputs.forEach(function (x) { o.push({ id: t.id + '|' + x.key, t: t, o: x, label: (t.outputs.length > 1 || x.label !== t.name ? t.name + ' · ' + x.label : t.name) }); }); }); return o; }
  function valOf(p, tr, tp, t, key) { var e = entryOf(p, tr, tp, t.id); return filled(e) ? outputs(t, e)[key] : null; }
  function scoreTrials(p) {
    /* count of results inside limits and closeness to targets → a simple ranking */
    var outs = allOutputs(p), tp = (p.tps || [])[0]; if (!tp) return [];
    return (p.trials || []).map(function (tr) {
      var ok = 0, bad = 0, dist = 0, nd = 0;
      outs.forEach(function (x) { var v = valOf(p, tr.id, tp.id, x.t, x.o.key); if (v == null) return; var j = judge(x.o, v); if (j === 'good') ok++; if (j === 'bad') bad++; var tg = num(x.o.target); if (tg != null && tg !== 0) { dist += Math.abs(v - tg) / Math.abs(tg); nd++; } });
      (p.tests || []).forEach(function (t) { t.inputs.forEach(function (i) { if (i.type === 'pf') { var e = entryOf(p, tr.id, tp.id, t.id); var v = e && e.in && e.in[i.key]; if (v === 'pass') ok++; if (v === 'fail') bad++; } }); });
      return { tr: tr, ok: ok, bad: bad, dist: nd ? dist / nd : null };
    }).sort(function (a, b) { return a.bad - b.bad || b.ok - a.ok || ((a.dist == null ? 9 : a.dist) - (b.dist == null ? 9 : b.dist)); });
  }
  function compareHTML(p) {
    var outs = allOutputs(p), trs = p.trials || [], tps = p.tps || [];
    if (!outs.length || !trs.length) return '<div class="panel"><div class="empty2">Add trials, tests and results to compare them here.</div></div>';
    if (!outs.some(function (x) { return x.id === V.cmp; })) V.cmp = outs[0].id;
    var cur = outs.filter(function (x) { return x.id === V.cmp; })[0];
    var h = '<div class="panel"><div class="rs-sec"><h2>Compare trials</h2><label class="rs-f" style="min-width:260px"><select id="cmpSel">' + opts(outs.map(function (x) { return [x.id, x.label]; }), V.cmp) + '</select></label></div>';
    if (tps.length > 1) h += '<h3 style="font-size:15px;margin:6px 0">' + esc(cur.label) + ' over time' + (p.storage ? ' <span class="hint">(' + esc(p.storage) + ')</span>' : '') + '</h3>' + lineChart(trs.map(function (tr) { return { l: tr.code + ' ' + tr.name, v: tps.map(function (tp) { return valOf(p, tr.id, tp.id, cur.t, cur.o.key); }) }; }), tps.map(function (tp) { return tp.name; }), cur.o);
    var tp0 = tps[0];
    h += '<h3 style="font-size:15px;margin:14px 0 6px">' + esc(cur.label) + (tp0 ? ' at ' + esc(tp0.name) : '') + '</h3>' + barChart(trs.map(function (tr) { return { l: tr.code, v: tp0 ? valOf(p, tr.id, tp0.id, cur.t, cur.o.key) : null }; }), cur.o) + '</div>';
    var rank = scoreTrials(p), best = rank[0] && (rank[0].ok || rank[0].dist != null) ? rank[0].tr.id : null;
    h += '<div class="panel"><div class="rs-sec"><h2>All results side by side' + (tp0 ? ' · ' + esc(tp0.name) : '') + '</h2><span class="hint">★ = best so far (fewest results outside limits, then closest to targets)</span></div><div class="tablewrap"><table class="ft"><thead><tr><th class="stick">Result</th>' + trs.map(function (tr) { return '<th style="text-align:right">' + (tr.id === best ? '<span class="best">★ </span>' : '') + esc(tr.code) + '<br><span class="hint">' + esc(tr.name) + '</span></th>'; }).join('') + '</tr></thead><tbody>';
    outs.forEach(function (x) { h += '<tr><td class="stick">' + esc(x.label) + (x.o.unit ? ' <span class="hint">' + esc(x.o.unit) + '</span>' : '') + '</td>' + trs.map(function (tr) { var v = tp0 ? valOf(p, tr.id, tp0.id, x.t, x.o.key) : null; return '<td class="out ' + judge(x.o, v) + '">' + fmt(v, x.o.dp == null ? 2 : x.o.dp) + '</td>'; }).join('') + '</tr>'; });
    (p.tests || []).forEach(function (t) { t.inputs.filter(function (i) { return i.type !== 'num'; }).forEach(function (i) { h += '<tr><td class="stick">' + esc(t.name) + ' · ' + esc(i.label) + '</td>' + trs.map(function (tr) { var e = tp0 && entryOf(p, tr.id, tp0.id, t.id), v = e && e.in ? e.in[i.key] : ''; return '<td style="text-align:right' + (v === 'fail' ? ';color:var(--red)' : v === 'pass' ? ';color:var(--green)' : '') + '">' + esc(v === 'pass' ? '✔ Pass' : v === 'fail' ? '✕ Fail' : v || '–') + '</td>'; }).join('') + '</tr>'; }); });
    h += '<tr><td class="stick"><b>Inside limits / outside</b></td>' + trs.map(function (tr) { var r = rank.filter(function (x) { return x.tr.id === tr.id; })[0]; return '<td class="out">' + (r ? '<span style="color:var(--green)">' + r.ok + '</span> / <span style="color:var(--red)">' + r.bad + '</span>' : '–') + '</td>'; }).join('') + '</tr></tbody></table></div></div>';
    var ctrl = trs.filter(function (t) { return t.control; })[0] || trs[0];
    h += '<div class="panel"><div class="rs-sec"><h2>What changed versus ' + esc(ctrl.code) + ' (' + esc(ctrl.name) + ')</h2></div>' + trs.filter(function (t) { return t !== ctrl; }).map(function (t) { var d = diffs(p, ctrl, t); return '<div style="margin-bottom:8px"><b class="mono" style="color:var(--rs)">' + esc(t.code) + '</b> ' + esc(t.name) + ': <span class="rs-diff">' + (d.length ? d.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') : '<span>same formula</span>') + '</span></div>'; }).join('') + '</div>';
    return h;
  }
  function diffs(p, a, b) { var out = []; (p.ings || []).forEach(function (ing) { var x = num((a.formula || {})[ing.id]), y = num((b.formula || {})[ing.id]); if (x === y) return; if (x == null) out.push('+ ' + ing.name + ' ' + y + ' ' + ing.unit); else if (y == null) out.push('− ' + ing.name); else out.push(ing.name + ' ' + x + ' → ' + y + ' ' + ing.unit + (x ? ' (' + (y > x ? '+' : '') + Math.round((y - x) / x * 100) + '%)' : '')); }); if ((a.process || '') !== (b.process || '') && b.process) out.push('process changed'); return out; }
  function journalHTML(p) {
    var h = '<div class="panel"><div class="rs-sec"><h2>Journal</h2><span class="hint">Notes, observations and photos, with who wrote them and when.</span></div><div class="rs-grid2"><label class="rs-f w2">New note<textarea id="jt" placeholder="What did you see or do today?"></textarea></label></div><div class="row" style="gap:8px;margin-top:8px"><button class="btn primary" id="jAdd">Add note</button><label class="btn" style="cursor:pointer">📷 Add photo<input type="file" id="jPh" accept="image/*" hidden></label><label class="row" style="gap:6px;font-size:13px"><input type="checkbox" id="jAuto"' + (V.showAuto ? ' checked' : '') + '> show automatic entries</label></div></div>';
    var items = (p.log || []).filter(function (x) { return V.showAuto || !x.auto; });
    h += '<div class="panel">' + (items.length ? items.map(function (x) { return '<div class="jr"><div class="d">' + esc(new Date(x.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + '<br>' + esc(x.by || '') + '</div><div style="flex:1">' + (x.auto ? '<span class="hint">' + esc(x.text) + '</span>' : esc(x.text).replace(/\n/g, '<br>')) + (x.photo ? '<img data-ph="' + esc(x.photo) + '" alt="photo">' : '') + '</div>' + (!x.auto && x.by === ME ? '<button class="iconbtn" data-delj="' + x.id + '">✕</button>' : '') + '</div>'; }).join('') : '<div class="empty2">No notes yet.</div>') + '</div>';
    return h;
  }
  function reportHTML(p) {
    var trs = p.trials || [], tps = p.tps || [], outs = allOutputs(p), rank = scoreTrials(p), chosen = trs.filter(function (t) { return t.id === p.chosen; })[0];
    var DEC = { adopt: 'Adopt: use it in production', repeat: 'Repeat / more trials', change: 'Change and test again', reject: 'Reject' };
    var h = '<div class="row noprint" style="gap:8px;justify-content:flex-end;margin:8px 0"><button class="btn primary" onclick="window.print()">🖨 Print / save as PDF</button></div><div class="rep">';
    h += '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><div style="font:600 12px var(--f-mono);color:#7c5cd6">ATIC OMAN · RESEARCH · ' + esc(p.code) + '</div><h1>' + esc(p.title) + '</h1></div><div style="text-align:right;font-size:12px;color:#555">Printed ' + nice(today()) + '<br>Status: ' + esc(STL[p.status] || p.status) + '</div></div>';
    h += '<h2>Project</h2><div class="kv"><b>Product</b><span>' + esc(p.product || '–') + '</span><b>Why</b><span>' + esc(p.goal || '–') + '</span><b>Expected</b><span>' + esc(p.hypothesis || '–') + '</span><b>In charge</b><span>' + esc(p.owner || '–') + (p.team ? ' · team: ' + esc(p.team) : '') + '</span><b>Dates</b><span>' + nice(p.start) + ' → ' + (p.due ? nice(p.due) : '–') + '</span>' + (p.storage ? '<b>Storage</b><span>' + esc(p.storage) + '</span>' : '') + '<b>Batch</b><span>' + fmt(num(p.batch && p.batch.size)) + ' ' + esc(p.batch && p.batch.unit) + '</span></div>';
    if ((p.ings || []).length && trs.length) { var kgs = trs.map(function (t) { return trialKg(p, t); }); h += '<h2>Formulas</h2><table><tr><th>Ingredient</th><th>Unit</th>' + trs.map(function (t) { return '<th>' + esc(t.code) + ' ' + esc(t.name) + '</th>'; }).join('') + '</tr>' + p.ings.map(function (ing) { return '<tr><td>' + esc(ing.name) + '</td><td>' + esc(ing.unit) + '</td>' + trs.map(function (t, i) { return '<td>' + (ing.unit === 'qs' ? fmt(kgs[i].rows[ing.id], 3) + ' kg' : esc((t.formula || {})[ing.id] == null ? '–' : t.formula[ing.id])) + '</td>'; }).join('') + '</tr>'; }).join('') + '<tr><th>Total kg/batch</th><th></th>' + kgs.map(function (k) { return '<th>' + fmt(k.total, 2) + '</th>'; }).join('') + '</tr></table>'; }
    h += '<h2>Trials</h2><table><tr><th>Trial</th><th>Made by</th><th>Date</th><th>Process / conditions</th><th>Notes</th></tr>' + trs.map(function (t) { return '<tr><td><b>' + esc(t.code) + '</b> ' + esc(t.name) + (t.control ? ' (control)' : '') + '</td><td>' + esc(t.by || '') + '</td><td>' + nice(t.date) + '</td><td>' + esc([t.process, t.conditions].filter(Boolean).join(' · ')) + '</td><td>' + esc(t.notes || '') + '</td></tr>'; }).join('') + '</table>';
    tps.forEach(function (tp) {
      if (!outs.length) return;
      h += '<h2>Results' + (tps.length > 1 ? ' · ' + esc(tp.name) + (tp.date ? ' (' + nice(tp.date) + ')' : '') : '') + '</h2><table><tr><th>Result</th><th>Limits</th>' + trs.map(function (t) { return '<th>' + esc(t.code) + '</th>'; }).join('') + '</tr>' + outs.map(function (x) { return '<tr><td>' + esc(x.label) + (x.o.unit ? ' (' + esc(x.o.unit) + ')' : '') + '</td><td>' + [x.o.min ? '≥ ' + x.o.min : '', x.o.max ? '≤ ' + x.o.max : '', x.o.target ? 'target ' + x.o.target : ''].filter(Boolean).join(', ') + '</td>' + trs.map(function (t) { var v = valOf(p, t.id, tp.id, x.t, x.o.key), j = judge(x.o, v); return '<td style="' + (j === 'bad' ? 'color:#b42318;font-weight:600' : '') + '">' + fmt(v, x.o.dp == null ? 2 : x.o.dp) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
    });
    if (outs.length && trs.length) { var cur = outs.filter(function (x) { return x.id === V.cmp; })[0] || outs[0]; h += '<h2>' + esc(cur.label) + '</h2>' + (tps.length > 1 ? lineChart(trs.map(function (tr) { return { l: tr.code + ' ' + tr.name, v: tps.map(function (tp) { return valOf(p, tr.id, tp.id, cur.t, cur.o.key); }) }; }), tps.map(function (tp) { return tp.name; }), cur.o) : barChart(trs.map(function (tr) { return { l: tr.code, v: tps[0] ? valOf(p, tr.id, tps[0].id, cur.t, cur.o.key) : null }; }), cur.o)); }
    h += '<h2>Conclusion</h2><div class="kv"><b>Findings</b><span>' + esc(p.conclusion || '–').replace(/\n/g, '<br>') + '</span><b>Decision</b><span>' + esc(DEC[p.decision] || '–') + '</span><b>Chosen trial</b><span>' + (chosen ? esc(chosen.code + ' ' + chosen.name) : rank[0] && rank[0].ok ? '– (best by results: ' + esc(rank[0].tr.code + ' ' + rank[0].tr.name) + ')' : '–') + '</span><b>Signed off</b><span>' + (p.signoff ? esc(p.signoff.by) + ', ' + nice(p.signoff.at.slice(0, 10)) : '________________________') + '</span></div>';
    var notes = (p.log || []).filter(function (x) { return !x.auto; });
    if (notes.length) h += '<h2>Journal</h2>' + notes.slice(0, 12).map(function (x) { return '<p style="font-size:12.5px;margin:4px 0"><b>' + nice(x.at.slice(0, 10)) + ', ' + esc(x.by) + ':</b> ' + esc(x.text) + '</p>'; }).join('');
    return h + '</div>';
  }

  /* project events */
  function bindProject(p) {
    main.querySelectorAll('[data-pt]').forEach(function (b) { b.onclick = function () { location.hash = 'p=' + p.id + '/' + b.dataset.pt; }; });
    $('#delP').onclick = function () { if (!confirm('Delete "' + p.title + '" with all its trials and results? This cannot be undone.')) return; R.projects = R.projects.filter(function (x) { return x !== p; }); delDoc('res_projects', p.id); location.hash = 'home'; };
    $('#dupP').onclick = function () { var c = clone(p); c.id = uid('rp'); c.code = nextCode(); c.title = p.title + ' (copy)'; c.results = {}; c.log = []; c.signoff = null; c.status = 'planned'; c.conclusion = ''; c.decision = ''; c.created = new Date().toISOString(); c.createdBy = ME; log(c, 'Copied from ' + p.code); R.projects.push(c); saveProject(c, true); location.hash = 'p=' + c.id + '/setup'; };
    main.onchange = function (e) { var k = e.target.dataset && e.target.dataset.k; if (!k) return; onField(p, k, e.target.value, e.target); };
    main.oninput = function (e) { var k = e.target.dataset && e.target.dataset.k; if (!k || e.target.tagName === 'SELECT') return; onField(p, k, e.target.value, e.target, true); };
    var on = function (sel, f) { main.querySelectorAll(sel).forEach(function (b) { b.onclick = function () { f(b); }; }); };
    var ch = function (msg) { if (msg) log(p, msg); saveProject(p); rerender(); };
    /* setup */
    on('#addTp', function () { p.tps.push({ id: uid('tp'), name: 'Point ' + (p.tps.length + 1), date: '' }); ch(); });
    on('#shelfTp', function () { var old = p.tps.map(function (t) { return t.name; }); ['Day 0', 'Week 1', 'Week 2', 'Month 1', 'Month 2', 'Month 3', 'Month 6'].forEach(function (n) { if (old.indexOf(n) < 0) p.tps.push({ id: uid('tp'), name: n, date: '' }); }); ch('Shelf-life time points added'); });
    on('#autoDates', function () { var D = { 'day 0': 0, 'week 1': 7, 'week 2': 14, 'week 3': 21, 'month 1': 30, 'month 2': 60, 'month 3': 90, 'month 4': 120, 'month 6': 180, 'month 9': 270, 'month 12': 365, 'year 1': 365 }; p.tps.forEach(function (tp) { var m = /^(day|week|month|year)\s*(\d+)/i.exec(tp.name), d = m ? (+m[2]) * ({ day: 1, week: 7, month: 30, year: 365 })[m[1].toLowerCase()] : D[tp.name.toLowerCase()]; if (d != null && p.start) { var t = new Date(p.start + 'T12:00:00'); t.setDate(t.getDate() + d); tp.date = t.toISOString().slice(0, 10); } }); ch(); });
    on('[data-deltp]', function (b) { var tp = p.tps.filter(function (x) { return x.id === b.dataset.deltp; })[0]; if (!confirm('Remove time point "' + tp.name + '" and its results?')) return; p.tps = p.tps.filter(function (x) { return x !== tp; }); Object.keys(p.results || {}).forEach(function (k) { delete p.results[k][tp.id]; }); ch('Time point removed: ' + tp.name); });
    on('#sign', function () { if (!p.conclusion) { toast('Write what you found first (conclusion).'); return; } p.signoff = { by: ME, at: new Date().toISOString() }; if (p.status !== 'done') p.status = 'done'; ch('Signed off by ' + ME); });
    on('#unsign', function () { p.signoff = null; ch('Sign-off removed'); });
    /* formulas */
    on('[data-view]', function (b) { V.view = b.dataset.view; render(); });
    on('#addIng', function () { (p.ings = p.ings || []).push({ id: uid('i'), name: '', unit: '%w/w' }); saveProject(p); render(); var last = main.querySelectorAll('input.nm[list="dlMat"]'); if (last.length) last[last.length - 1].focus(); });
    on('#addTr', function () { var src = p.trials[p.trials.length - 1]; var t = newTrial(p, null, src); t.name = 'Trial ' + t.code.slice(1); p.trials.push(t); ch('Trial added: ' + t.code); });
    on('[data-copytr]', function (b) { var src = p.trials.filter(function (x) { return x.id === b.dataset.copytr; })[0], t = newTrial(p, null, src); p.trials.push(t); ch('Trial ' + t.code + ' copied from ' + src.code); });
    on('[data-ctrl]', function (b) { p.trials.forEach(function (t) { t.control = t.id === b.dataset.ctrl; }); ch(); });
    on('[data-deltr]', function (b) { var t = p.trials.filter(function (x) { return x.id === b.dataset.deltr; })[0]; if (!confirm('Delete trial ' + t.code + ' (' + t.name + ') and its results?')) return; p.trials = p.trials.filter(function (x) { return x !== t; }); delete (p.results || {})[t.id]; ch('Trial deleted: ' + t.code + ' ' + t.name); });
    on('[data-deling]', function (b) { var ing = p.ings.filter(function (x) { return x.id === b.dataset.deling; })[0]; if (ing.name && !confirm('Remove ' + ing.name + ' from all trials?')) return; p.ings = p.ings.filter(function (x) { return x !== ing; }); p.trials.forEach(function (t) { delete (t.formula || {})[ing.id]; }); ch(); });
    on('#fromRecipe', function () { recipeModal(p); });
    on('#scaleBtn', function () { var to = prompt('New batch size in ' + (p.batch.unit || 'L') + ' (now ' + p.batch.size + ').\nAmounts given per batch (kg, g, L, mL, units) are scaled; percentages and g/L stay the same.'); var n = num(to); if (!n || !num(p.batch.size)) return; var f = n / num(p.batch.size); p.trials.forEach(function (t) { p.ings.forEach(function (ing) { if (['kg', 'g', 'L', 'mL', 'unit'].indexOf(ing.unit) >= 0 && num((t.formula || {})[ing.id]) != null) t.formula[ing.id] = +(num(t.formula[ing.id]) * f).toPrecision(6); }); }); log(p, 'Batch scaled from ' + p.batch.size + ' to ' + n + ' ' + p.batch.unit); p.batch.size = n; ch(); });
    /* tests */
    on('#addLib', function () { libPicker(p); });
    on('#newPT', function () { testBuilder(normTest({ id: uid('t'), name: '', kind: 'chem', method: '', inputs: [{ key: 'x', label: 'Reading', unit: '', type: 'num' }], consts: [], outputs: [{ key: 'r', label: 'Result', unit: '', dp: 2, formula: 'x' }] }), function (t, alsoLib) { p.tests.push(t); if (alsoLib) saveLib(clone(t)); ch('Test added: ' + t.name); }, true); });
    on('[data-edpt]', function (b) { var i = p.tests.findIndex(function (x) { return x.id === b.dataset.edpt; }); testBuilder(clone(p.tests[i]), function (t, alsoLib) { p.tests[i] = t; if (alsoLib) saveLib(clone(t)); ch('Test changed: ' + t.name); }, true); });
    on('[data-delpt]', function (b) { var t = p.tests.filter(function (x) { return x.id === b.dataset.delpt; })[0]; if (!confirm('Remove the test "' + t.name + '" and its results from this project?')) return; p.tests = p.tests.filter(function (x) { return x !== t; }); ch('Test removed: ' + t.name); });
    on('[data-up]', function (b) { var i = +b.dataset.up; if (i > 0) { var t = p.tests.splice(i, 1)[0]; p.tests.splice(i - 1, 0, t); ch(); } });
    /* results */
    on('[data-tp]', function (b) { V.tp = b.dataset.tp; render(); });
    on('#csv', function () { csv(p); });
    /* compare */
    var cs = $('#cmpSel'); if (cs) cs.onchange = function () { V.cmp = cs.value; render(); };
    /* journal */
    on('#jAdd', function () { var t = $('#jt').value.trim(); if (!t) return; (p.log = p.log || []).unshift({ id: uid('l'), at: new Date().toISOString(), by: ME, text: t }); ch(); });
    var ja = $('#jAuto'); if (ja) ja.onchange = function () { V.showAuto = ja.checked; render(); };
    var jp = $('#jPh'); if (jp) jp.onchange = function () { var f = jp.files[0]; if (!f) return; shrink(f, function (data) { var fid = uid('f'); A.planner.set('res_files', fid, { id: fid, project: p.id, data: data, name: f.name, by: ME, at: new Date().toISOString() }).then(function () { R.files[fid] = data; (p.log = p.log || []).unshift({ id: uid('l'), at: new Date().toISOString(), by: ME, text: $('#jt').value.trim() || 'Photo: ' + f.name, photo: fid }); ch(); }).catch(function (e) { toast('Could not save the photo: ' + (e.message || e)); }); }); };
    on('[data-delj]', function (b) { var x = p.log.filter(function (l) { return l.id === b.dataset.delj; })[0]; if (!confirm('Delete this note?')) return; if (x.photo) delDoc('res_files', x.photo); p.log = p.log.filter(function (l) { return l !== x; }); ch(); });
    main.querySelectorAll('img[data-ph]').forEach(function (img) { loadPhoto(img.dataset.ph, function (d) { img.src = d; }); });
  }
  function onField(p, k, v, el, typing) {
    var parts = k.split('|'), redraw = !typing;
    if (k.indexOf('p.') === 0) { var f = k.slice(2), old = p[f]; p[f] = v; if (f === 'status' && old !== v) log(p, 'Status: ' + (STL[old] || old) + ' → ' + (STL[v] || v)); if (f === 'decision' && v) log(p, 'Decision: ' + v); redraw = !typing && ['status', 'decision', 'chosen', 'title', 'owner', 'product'].indexOf(f) >= 0; }
    else if (k.indexOf('b.') === 0) { p.batch = p.batch || {}; p.batch[k.slice(2)] = v; redraw = false; }
    else if (parts[0] === 'tp') { var tp = p.tps.filter(function (x) { return x.id === parts[1]; })[0]; tp[parts[2]] = v; redraw = false; }
    else if (parts[0] === 'f') { var tr = p.trials.filter(function (x) { return x.id === parts[1]; })[0]; (tr.formula = tr.formula || {})[parts[2]] = v === '' ? null : v; if (v === '') delete tr.formula[parts[2]]; }
    else if (parts[0] === 'ing') { var ing = p.ings.filter(function (x) { return x.id === parts[1]; })[0]; ing[parts[2]] = v; if (parts[2] === 'name' && !typing) { var mi = Object.keys(R.matInfo).filter(function (q) { return R.matInfo[q].name === v; })[0]; if (mi) ing.mat = mi; } if (parts[2] === 'name') redraw = false; }
    else if (parts[0] === 'tr') { var t2 = p.trials.filter(function (x) { return x.id === parts[1]; })[0]; t2[parts[2]] = v; redraw = !typing && (parts[2] === 'status'); }
    else if (parts[0] === 'spec') { var tt = p.tests.filter(function (x) { return x.id === parts[1]; })[0], o = tt.outputs.filter(function (x) { return x.key === parts[2]; })[0]; o[parts[3]] = v; redraw = false; }
    else if (parts[0] === 'r') { var R1 = p.results = p.results || {}, a = R1[parts[1]] = R1[parts[1]] || {}, b = a[parts[2]] = a[parts[2]] || {}, e = b[parts[3]] = b[parts[3]] || { in: {} }; e.in[parts[4]] = v; e.by = ME; e.at = new Date().toISOString(); if (typing) { updateOutRow(p, parts, el); redraw = false; } }
    saveProject(p);
    if (redraw) setTimeout(rerender, 0);
  }
  function updateOutRow(p, parts, el) {
    var t = p.tests.filter(function (x) { return x.id === parts[3]; })[0], e = entryOf(p, parts[1], parts[2], parts[3]), o = outputs(t, e), tr = el.closest('tr'); if (!tr) return;
    var cells = tr.querySelectorAll('td.out'); t.outputs.forEach(function (out, i) { var c = cells[i]; if (!c) return; c.textContent = fmt(o[out.key], out.dp == null ? 2 : out.dp); c.className = 'out ' + judge(out, o[out.key]); });
  }
  function csv(p) {
    var outs = allOutputs(p), rows = [['Project', 'Trial', 'Trial name', 'Time point', 'Test', 'Result', 'Value', 'Unit', 'Min', 'Max', 'Entered by', 'Entered at']];
    p.trials.forEach(function (tr) { p.tps.forEach(function (tp) { p.tests.forEach(function (t) { var e = entryOf(p, tr.id, tp.id, t.id); if (!filled(e)) return; var o = outputs(t, e); t.inputs.forEach(function (i) { rows.push([p.code, tr.code, tr.name, tp.name, t.name, i.label + ' (reading)', e.in[i.key] == null ? '' : e.in[i.key], i.unit, '', '', e.by, e.at]); }); t.outputs.forEach(function (out) { rows.push([p.code, tr.code, tr.name, tp.name, t.name, out.label, o[out.key] == null ? '' : o[out.key], out.unit, out.min || '', out.max || '', e.by, e.at]); }); }); }); });
    A.download(p.code + '-results.csv', rows.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\n'));
    void outs;
  }
  function shrink(file, cb) { var img = new Image(), fr = new FileReader(); fr.onload = function () { img.onload = function () { var m = 1000, s = Math.min(1, m / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); cb(c.toDataURL('image/jpeg', 0.72)); }; img.src = fr.result; }; fr.readAsDataURL(file); }
  function loadPhoto(id, cb) { if (R.files[id]) return cb(R.files[id]); sb.from('planner_docs').select('data').eq('coll', 'res_files').eq('id', id).single().then(function (r) { if (r.data && r.data.data) { R.files[id] = r.data.data.data; cb(R.files[id]); } }); }
  function recipeModal(p) {
    var rec = R.recipes.recipes || {}, prods = Object.keys(rec);
    modal('<h2>Load a production recipe</h2><p class="hint">Adds the recipe as a new trial (amounts per production batch, in the units the factory uses: buckets, bags, kg…). Add the kg in one unit to get weights.</p><div class="rs-grid2"><label class="rs-f">Product<select id="rp">' + opts(prods) + '</select></label><label class="rs-f">Section<select id="rs"></select></label></div><div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-x>Cancel</button><button class="btn primary" id="ok">Add as a trial</button></div>', function (box, close) {
      var fill = function () { box.querySelector('#rs').innerHTML = opts(Object.keys(rec[box.querySelector('#rp').value] || {})); }; box.querySelector('#rp').onchange = fill; fill();
      box.querySelector('[data-x]').onclick = close;
      box.querySelector('#ok').onclick = function () {
        var pr = box.querySelector('#rp').value, se = box.querySelector('#rs').value, r = (rec[pr] || {})[se] || {}, t = newTrial(p, pr + ' ' + se + ' (production)');
        Object.keys(r).forEach(function (mid) { var mi = R.matInfo[mid] || { name: mid, unit: '' }, ing = (p.ings = p.ings || []).filter(function (x) { return x.mat === mid || x.name === mi.name; })[0]; if (!ing) { ing = { id: uid('i'), name: mi.name, unit: 'unit', mat: mid, note: mi.unit }; p.ings.push(ing); } t.formula[ing.id] = r[mid]; });
        if (!p.trials.some(function (x) { return x.control; })) t.control = true; p.trials.push(t); log(p, 'Production recipe loaded: ' + pr + ' ' + se); saveProject(p); close(); rerender();
      };
    });
  }
  function libPicker(p) {
    var lib = R.tests.length ? R.tests : STARTER.map(function (x) { var c = clone(x); c.id = 'starter-' + x.name; return c; });
    modal('<h2>Add tests from the library</h2><p class="hint">' + (R.tests.length ? '' : 'The library is empty, so these are the starter tests. ') + 'Tick the ones you want.</p><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:6px">' + lib.map(function (t) { var has = p.tests.some(function (x) { return x.libId === t.id || x.name === t.name; }); return '<label class="rs-test" style="margin:0;display:flex;gap:8px;align-items:flex-start;cursor:pointer"><input type="checkbox" value="' + esc(t.id) + '"' + (has ? ' disabled checked' : '') + '><span><b>' + esc(t.name) + '</b><br><span class="hint">' + esc(t.method || '') + '</span></span></label>'; }).join('') + '</div><div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-x>Cancel</button><button class="btn primary" id="ok">Add</button></div>', function (box, close) {
      box.querySelector('[data-x]').onclick = close;
      box.querySelector('#ok').onclick = function () { var n = []; box.querySelectorAll('input:checked:not(:disabled)').forEach(function (c) { var t = clone(lib.filter(function (x) { return x.id === c.value; })[0]); t.libId = t.id; t.id = uid('t'); p.tests.push(normTest(t)); n.push(t.name); }); if (n.length) log(p, 'Tests added: ' + n.join(', ')); saveProject(p); close(); rerender(); };
    });
  }

  /* ---------- test builder (shared by library and projects) ---------- */
  function keyOk(k) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(k); }
  function testBuilder(t, done, inProject) {
    normTest(t);
    var sample = {};
    function html() {
      var vars = t.inputs.map(function (i) { return i.key; }).concat(t.consts.map(function (c) { return c.key; })), h = '';
      h += '<h2>' + (t.name ? 'Edit test' : 'Build a test') + '</h2><div class="rs-grid2"><label class="rs-f">Test name<input data-b="name" value="' + esc(t.name) + '" placeholder="e.g. Total sugars"></label><label class="rs-f">Type<select data-b="kind">' + opts(KINDS, t.kind) + '</select></label><label class="rs-f w2">Method / how to do it<input data-b="method" value="' + esc(t.method || '') + '" placeholder="e.g. Titration with NaOH 0.1 N, phenolphthalein"></label></div>';
      h += '<div><div class="rs-sec"><h3>1 · What is measured (inputs)</h3><button class="btn" data-add="in">+ Input</button></div><div class="mrow"><span class="hd">Short name</span><span class="hd">Label</span><span class="hd">Unit</span><span class="hd">Kind</span><span></span></div>' + t.inputs.map(function (i, n) { return '<div class="mrow" style="margin-top:4px"><input data-in="' + n + '|key" value="' + esc(i.key) + '" class="mono"><input data-in="' + n + '|label" value="' + esc(i.label) + '"><input data-in="' + n + '|unit" value="' + esc(i.unit || '') + '"><select data-in="' + n + '|type">' + opts([['num', 'Number'], ['pf', 'Pass / fail'], ['choice', 'Choice list'], ['text', 'Text']], i.type) + '</select><button class="iconbtn" data-rm="in|' + n + '">✕</button>' + (i.type === 'choice' ? '<input data-in="' + n + '|options" value="' + esc(i.options || '') + '" placeholder="options, separated by commas" style="grid-column:2/5">' : '') + '</div>'; }).join('') + '<p class="hint">Tip: a taste panel = one input per taster (p1, p2, p3…) and the result <span class="mono">avg(p1,p2,p3)</span>.</p></div>';
      h += '<div><div class="rs-sec"><h3>2 · Fixed values (constants, solutions)</h3><button class="btn" data-add="c">+ Constant</button></div>' + (t.consts.length ? '<div class="mrow"><span class="hd">Short name</span><span class="hd">Label</span><span class="hd">Unit</span><span class="hd">Value or solution</span><span></span></div>' : '<p class="hint">e.g. NaOH normality, a factor, a sample volume. Link a solution and its standardised strength is used automatically.</p>') + t.consts.map(function (c, n) { return '<div class="mrow" style="margin-top:4px"><input data-c="' + n + '|key" value="' + esc(c.key) + '" class="mono"><input data-c="' + n + '|label" value="' + esc(c.label) + '"><input data-c="' + n + '|unit" value="' + esc(c.unit || '') + '"><span style="display:flex;gap:4px"><input data-c="' + n + '|value" value="' + esc(c.value || '') + '" placeholder="value"' + (c.sol ? ' disabled' : '') + ' style="width:70px"><select data-c="' + n + '|sol" title="Take it from a solution"><option value="">or solution…</option>' + opts(R.sols.map(function (s) { return [s.id, s.name + ' (' + fmt(num(s.actual) != null ? num(s.actual) : num(s.target), 5) + ')']; }), c.sol) + '</select></span><button class="iconbtn" data-rm="c|' + n + '">✕</button></div>'; }).join('') + '</div>';
      h += '<div><div class="rs-sec"><h3>3 · Results and their formulas</h3><button class="btn" data-add="o">+ Result</button></div><div class="mrow o"><span class="hd">Short name</span><span class="hd">Label</span><span class="hd">Unit</span><span class="hd">Formula</span><span class="hd">Decimals</span><span class="hd">Min</span><span class="hd">Max</span><span></span></div>' + t.outputs.map(function (o, n) { return '<div class="mrow o" style="margin-top:4px"><input data-o="' + n + '|key" value="' + esc(o.key) + '" class="mono"><input data-o="' + n + '|label" value="' + esc(o.label) + '"><input data-o="' + n + '|unit" value="' + esc(o.unit || '') + '"><input data-o="' + n + '|formula" value="' + esc(o.formula) + '" class="mono" data-fx="' + n + '"><input data-o="' + n + '|dp" value="' + esc(o.dp == null ? 2 : o.dp) + '"><input data-o="' + n + '|min" value="' + esc(o.min == null ? '' : o.min) + '"><input data-o="' + n + '|max" value="' + esc(o.max == null ? '' : o.max) + '"><button class="iconbtn" data-rm="o|' + n + '">✕</button></div>'; }).join('');
      h += '<div style="margin-top:8px"><span class="hint">Click to add to the formula you are in:</span><div>' + vars.concat(t.outputs.map(function (o) { return o.key; })).map(function (v) { return '<span class="chipk" data-ins="' + esc(v) + '">' + esc(v) + '</span>'; }).join('') + ['+', '−', '×', '÷', '(', ')', '^'].map(function (o) { return '<span class="chipk op" data-ins="' + o + '">' + o + '</span>'; }).join('') + ['avg( )', 'sum( )', 'sqrt( )', 'min( )', 'max( )', 'round( ,2)', 'log( )', 'if( , , )'].map(function (o) { return '<span class="chipk op" data-ins="' + o.replace(/ /g, '') + '">' + o + '</span>'; }).join('') + '</div></div></div>';
      h += '<div class="rs-test"><h3>Try it</h3><div class="row" style="gap:8px;flex-wrap:wrap;margin:6px 0">' + t.inputs.filter(function (i) { return i.type === 'num' || i.type === 'pf'; }).map(function (i) { return '<label class="rs-f" style="width:120px">' + esc(i.label || i.key) + (i.type === 'pf' ? '<select data-s="' + esc(i.key) + '">' + opts([['', '—'], ['pass', 'Pass'], ['fail', 'Fail']], sample[i.key]) + '</select>' : '<input data-s="' + esc(i.key) + '" value="' + esc(sample[i.key] == null ? '' : sample[i.key]) + '" inputmode="decimal">') + '</label>'; }).join('') + '</div><div id="prev"></div></div>';
      h += '<div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap">' + (inProject ? '<label class="row" style="gap:6px;font-size:13px"><input type="checkbox" id="alsoLib"' + (t.libId ? '' : ' checked') + '> also save to the test library</label>' : '<span></span>') + '<span class="row" style="gap:8px"><button class="btn" data-x>Cancel</button><button class="btn primary" id="ok">Save test</button></span></div>';
      return h;
    }
    function preview(box) {
      var e = { in: {} }; Object.keys(sample).forEach(function (k) { e.in[k] = sample[k]; });
      var s = scopeOf(t, e), lines = [];
      t.outputs.forEach(function (o) { try { tokenize(o.formula); var v = evalF(o.formula, s); s[o.key] = v; lines.push('<div class="fprev">' + esc(o.label || o.key) + ' = <b>' + fmt(v, o.dp == null ? 2 : num(o.dp)) + '</b> ' + esc(o.unit || '') + ' <span class="' + judge(o, v) + '"></span></div>'); } catch (err) { lines.push('<div class="fprev' + (err.message === 'missing' ? '' : ' err') + '">' + esc(o.label || o.key) + ': ' + (err.message === 'missing' ? 'enter the values above to see the result' : esc(err.message)) + '</div>'); } });
      box.querySelector('#prev').innerHTML = lines.join('') || '<span class="hint">No results defined.</span>';
    }
    var lastFx = null;
    modal('<div id="tb"></div>', function (box, close) {
      var host = box.querySelector('#tb');
      function draw() { host.innerHTML = html(); preview(host); bind(); }
      function bind() {
        host.querySelectorAll('[data-b]').forEach(function (el) { el.oninput = el.onchange = function () { t[el.dataset.b] = el.value; }; });
        [['in', t.inputs], ['c', t.consts], ['o', t.outputs]].forEach(function (g) { host.querySelectorAll('[data-' + g[0] + ']').forEach(function (el) { var a = el.dataset[g[0]].split('|'); el.oninput = function () { g[1][+a[0]][a[1]] = el.value; preview(host); }; el.onchange = function () { g[1][+a[0]][a[1]] = el.value; if (a[1] === 'type' || a[1] === 'sol' || a[1] === 'key') draw(); }; }); });
        host.querySelectorAll('[data-fx]').forEach(function (el) { el.onfocus = function () { lastFx = el; }; });
        host.querySelectorAll('[data-s]').forEach(function (el) { el.oninput = el.onchange = function () { sample[el.dataset.s] = el.value; preview(host); }; });
        host.querySelectorAll('[data-add]').forEach(function (b) { b.onclick = function () { var k = b.dataset.add; if (k === 'in') { var n = t.inputs.length + 1, key = 'x' + n; while (t.inputs.some(function (i) { return i.key === key; })) key = 'x' + (++n); t.inputs.push({ key: key, label: 'Reading ' + n, unit: '', type: 'num' }); } if (k === 'c') t.consts.push({ key: 'K' + (t.consts.length + 1), label: '', unit: '', value: '' }); if (k === 'o') t.outputs.push({ key: 'r' + (t.outputs.length + 1), label: 'Result', unit: '', dp: 2, formula: '' }); draw(); }; });
        host.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { var a = b.dataset.rm.split('|'); ({ in: t.inputs, c: t.consts, o: t.outputs })[a[0]].splice(+a[1], 1); draw(); }; });
        host.querySelectorAll('[data-ins]').forEach(function (c) { c.onmousedown = function (e) { e.preventDefault(); }; c.onclick = function () { var el = lastFx || host.querySelector('[data-fx]'); if (!el) return; var ins = c.dataset.ins.replace('−', '-').replace('×', '*').replace('÷', '/'), s = el.selectionStart == null ? el.value.length : el.selectionStart, e2 = el.selectionEnd == null ? s : el.selectionEnd; el.value = el.value.slice(0, s) + ins + el.value.slice(e2); var pos = s + ins.length; if (/\(\)$|\(,|\(,,/.test(ins)) pos = s + ins.indexOf('(') + 1; el.focus(); el.setSelectionRange(pos, pos); el.dispatchEvent(new Event('input')); }; });
        host.querySelector('[data-x]').onclick = close;
        host.querySelector('#ok').onclick = function () {
          t.name = (t.name || '').trim(); if (!t.name) { toast('Give the test a name.'); return; }
          var keys = {}, bad = null; t.inputs.concat(t.consts).forEach(function (x) { if (!keyOk(x.key)) bad = 'Short names must start with a letter and have no spaces: "' + x.key + '"'; else if (keys[x.key]) bad = 'The short name "' + x.key + '" is used twice'; keys[x.key] = 1; });
          t.outputs.forEach(function (o) { if (!keyOk(o.key)) bad = 'Bad short name "' + o.key + '"'; try { tokenize(o.formula); var sc = {}; Object.keys(keys).forEach(function (k) { sc[k] = 1; }); t.outputs.forEach(function (q) { sc[q.key] = 1; }); evalF(o.formula, sc); } catch (e) { if (e.message !== 'missing') bad = (o.label || o.key) + ': ' + e.message; } });
          if (bad) { toast(bad); return; }
          t.outputs.forEach(function (o) { o.dp = num(o.dp) == null ? 2 : num(o.dp); });
          var al = host.querySelector('#alsoLib'); close(); done(t, al && al.checked);
        };
      }
      draw();
    });
  }
  function saveLib(t) { var ex = R.tests.filter(function (x) { return x.id === t.libId || x.name.toLowerCase() === t.name.toLowerCase(); })[0]; t.id = ex ? ex.id : uid('lt'); delete t.libId; if (ex) R.tests[R.tests.indexOf(ex)] = t; else R.tests.push(t); put('res_tests', t); }

  /* TEST LIBRARY */
  function testsHTML() {
    var h = header('Test builder', 'Your library of tests. Build any test: what is measured, fixed values and solutions, and the formulas for the results.', '<button class="btn" id="impLab">Copy tests from the Lab</button><button class="btn" id="impStart">Add starter tests</button><button class="btn primary" id="newT">+ New test</button>');
    if (!R.tests.length) return h + '<div class="empty2"><div style="font-size:40px">🧮</div><p>No tests in the library yet. Add the <b>starter tests</b> (Brix, pH, acidity, density, viscosity, colour, TVC, yeast & mould, taste panel, appearance), <b>copy the tests the Lab already uses</b>, or build your own.</p></div>';
    var by = {}; R.tests.forEach(function (t) { (by[t.kind || 'other'] = by[t.kind || 'other'] || []).push(t); });
    KINDS.forEach(function (k) { if (!by[k[0]]) return; h += '<div class="panel"><div class="rs-sec"><h2>' + k[1] + '</h2></div>' + by[k[0]].map(function (t) { return '<div class="rs-test"><div class="rs-sec" style="margin:0"><div><h3>' + esc(t.name) + '</h3><div class="m">' + esc(t.method || '') + '</div><div class="m">Measures: ' + t.inputs.map(function (i) { return '<span class="mono">' + esc(i.key) + '</span> ' + esc(i.label) + (i.unit ? ' (' + esc(i.unit) + ')' : ''); }).join(', ') + (t.consts && t.consts.length ? ' · Fixed: ' + t.consts.map(function (c) { return '<span class="mono">' + esc(c.key) + '</span>=' + esc(c.sol ? solName(c.sol) : c.value); }).join(', ') : '') + '</div>' + (t.outputs || []).map(function (o) { return '<div class="m">→ <b>' + esc(o.label) + '</b> = <span class="mono">' + esc(o.formula) + '</span> ' + esc(o.unit || '') + (o.min || o.max ? ' · limits ' + (o.min ? '≥' + esc(o.min) : '') + ' ' + (o.max ? '≤' + esc(o.max) : '') : '') + '</div>'; }).join('') + '</div><div class="row" style="gap:2px"><button class="iconbtn" data-ed="' + t.id + '" title="Edit">✎</button><button class="iconbtn" data-cp="' + t.id + '" title="Copy">⧉</button><button class="iconbtn" data-del="' + t.id + '" title="Delete">✕</button></div></div></div>'; }).join('') + '</div>'; });
    return h;
  }
  function bindTests() {
    $('#newT').onclick = function () { testBuilder({ id: 'new', name: '', kind: 'chem', method: '', inputs: [{ key: 'x', label: 'Reading', unit: '', type: 'num' }], consts: [], outputs: [{ key: 'r', label: 'Result', unit: '', dp: 2, formula: 'x' }] }, function (t) { t.id = uid('lt'); R.tests.push(t); put('res_tests', t); render(); }); };
    $('#impStart').onclick = function () { var n = 0; STARTER.forEach(function (s) { if (R.tests.some(function (x) { return x.name.toLowerCase() === s.name.toLowerCase(); })) return; var t = normTest(clone(s)); t.id = uid('lt'); R.tests.push(t); put('res_tests', t); n++; }); toast(n ? n + ' starter tests added' : 'They are already in the library'); render(); };
    $('#impLab').onclick = function () {
      var prods = (R.labCfg && R.labCfg.products) || [], n = 0, seen = {}; R.tests.forEach(function (t) { seen[t.name.toLowerCase()] = 1; });
      prods.forEach(function (pr) { (pr.tests || []).forEach(function (lt) { var nm = lt.name; if (seen[nm.toLowerCase()]) return; seen[nm.toLowerCase()] = 1; var t = normTest({ id: uid('lt'), name: nm, kind: lt.kind === 'micro' ? 'micro' : lt.kind === 'org' ? 'sensory' : 'chem', method: lt.method || '', inputs: (lt.inputs || []).map(function (i) { return { key: i.key, label: i.label, unit: i.unit || '', type: 'num' }; }), consts: (lt.consts || []).map(function (c) { return { key: c.key, label: c.label, unit: c.unit || '', value: c.value || '' }; }), outputs: (lt.outputs || []).map(function (o) { return { key: o.key, label: o.label, unit: o.unit || '', dp: o.dp == null ? 2 : o.dp, formula: o.formula || (lt.inputs && lt.inputs[0] ? lt.inputs[0].key : ''), min: '', max: '' }; }), from: 'Lab (' + (pr.code || pr.id) + ')' }); if (!t.inputs.length) t.inputs = [{ key: 'x', label: nm, unit: '', type: lt.kind === 'org' ? 'pf' : 'num' }]; R.tests.push(t); put('res_tests', t); n++; }); });
      toast(n ? n + ' lab tests copied (limits left empty: set them per project)' : (prods.length ? 'All lab tests are already in the library' : 'Could not read the Lab tests from this account')); render();
    };
    main.querySelectorAll('[data-ed]').forEach(function (b) { b.onclick = function () { var t = R.tests.filter(function (x) { return x.id === b.dataset.ed; })[0]; testBuilder(clone(t), function (n) { n.id = t.id; R.tests[R.tests.indexOf(t)] = n; put('res_tests', n); render(); }); }; });
    main.querySelectorAll('[data-cp]').forEach(function (b) { b.onclick = function () { var t = clone(R.tests.filter(function (x) { return x.id === b.dataset.cp; })[0]); t.id = uid('lt'); t.name += ' (copy)'; R.tests.push(t); put('res_tests', t); render(); }; });
    main.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { var t = R.tests.filter(function (x) { return x.id === b.dataset.del; })[0]; if (!confirm('Delete "' + t.name + '" from the library? Projects keep their own copy.')) return; R.tests = R.tests.filter(function (x) { return x !== t; }); delDoc('res_tests', t.id); render(); }; });
  }

  /* SOLUTIONS */
  function solGrams(s) { var V2 = num(s.volume), c = num(s.target), mw = num(s.mw), eq = num(s.eq) || 1, pur = (num(s.purity) || 100) / 100; if (V2 == null || c == null) return null; var g; switch (s.unit) { case 'M': g = mw ? c * V2 / 1000 * mw : null; break; case 'N': g = mw ? c / eq * V2 / 1000 * mw : null; break; case '%w/v': g = c * V2 / 100; break; case 'g/L': g = c * V2 / 1000; break; case 'ppm': g = c * V2 / 1e6; break; default: g = null; } return g == null ? null : g / pur; }
  function solsHTML() {
    var h = header('Solutions', 'Reagents and standard solutions: how much to weigh, the real strength after standardisation, and when they expire. Tests can use a solution\'s strength automatically.', '<button class="btn primary" id="newS">+ New solution</button>');
    if (!R.sols.length) return h + '<div class="empty2"><div style="font-size:40px">⚗️</div><p>No solutions yet. Add one (e.g. NaOH 0.1 N, 1 L) and the page tells you how many grams to weigh.</p></div>';
    h += '<div class="panel"><div class="tablewrap"><table class="ft"><thead><tr><th class="stick">Solution</th><th>Target</th><th>Real strength</th><th>Volume</th><th>Weigh</th><th>Prepared</th><th>Expires</th><th>By</th><th></th></tr></thead><tbody>' + R.sols.map(function (s) { var g = solGrams(s), ex = s.expires && s.expires < today(), soon = s.expires && !ex && s.expires <= addDays(today(), 7); return '<tr><td class="stick"><b>' + esc(s.name) + '</b><br><span class="hint">' + esc(s.chem || '') + (s.mw ? ' · MW ' + esc(s.mw) : '') + '</span></td><td>' + esc(s.target) + ' ' + esc(s.unit) + '</td><td class="out">' + (s.actual ? esc(s.actual) + ' ' + esc(s.unit) : '<span class="hint">not standardised</span>') + '</td><td>' + esc(s.volume || '') + ' mL</td><td class="out">' + (g == null ? '–' : fmt(g, 4) + ' g') + '</td><td>' + nice(s.prepared) + '</td><td>' + (s.expires ? '<span class="chip ' + (ex ? 'order' : soon ? 'soon' : 'ok') + '">' + (ex ? 'Expired ' : '') + nice(s.expires) + '</span>' : '–') + '</td><td>' + esc(s.by || '') + '</td><td><button class="iconbtn" data-eds="' + s.id + '">✎</button><button class="iconbtn" data-dels="' + s.id + '">✕</button></td></tr>'; }).join('') + '</tbody></table></div></div>';
    return h;
  }
  function addDays(d, n) { var t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); }
  function solModal(s) {
    var isNew = !s; s = s ? clone(s) : { id: uid('so'), name: '', chem: '', mw: '', eq: 1, purity: 100, target: '', unit: 'N', volume: 1000, prepared: today(), expires: addDays(today(), 30), actual: '', by: ME, notes: '' };
    var COMMON = { 'NaOH': [40.00, 1], 'HCl': [36.46, 1], 'AgNO3': [169.87, 1], 'KMnO4': [158.03, 5], 'H2SO4': [98.08, 2], 'Citric acid': [192.12, 3], 'EDTA': [372.24, 1], 'NaCl': [58.44, 1], 'Na2S2O3': [158.11, 1], 'I2': [253.81, 2] };
    modal('<h2>' + (isNew ? 'New solution' : 'Edit solution') + '</h2><div class="rs-grid2"><label class="rs-f">Name<input data-s="name" value="' + esc(s.name) + '" placeholder="NaOH 0.1 N"></label><label class="rs-f">Chemical<input data-s="chem" list="dlChem" value="' + esc(s.chem) + '"></label><label class="rs-f">Molar mass (g/mol)<input data-s="mw" value="' + esc(s.mw) + '"></label><label class="rs-f">Equivalents per mole (for N)<input data-s="eq" value="' + esc(s.eq) + '"></label><label class="rs-f">Target strength<input data-s="target" value="' + esc(s.target) + '"></label><label class="rs-f">Unit<select data-s="unit">' + opts([['N', 'N (normality)'], ['M', 'M (mol/L)'], ['%w/v', '% w/v'], ['g/L', 'g/L'], ['ppm', 'ppm']], s.unit) + '</select></label><label class="rs-f">Volume to make (mL)<input data-s="volume" value="' + esc(s.volume) + '"></label><label class="rs-f">Purity of the chemical (%)<input data-s="purity" value="' + esc(s.purity) + '"></label><label class="rs-f">Real strength after standardising<input data-s="actual" value="' + esc(s.actual) + '" placeholder="e.g. 0.1072"></label><label class="rs-f">Prepared<input type="date" data-s="prepared" value="' + esc(s.prepared) + '"></label><label class="rs-f">Expires<input type="date" data-s="expires" value="' + esc(s.expires) + '"></label><label class="rs-f">Prepared by<input data-s="by" list="dlPeople" value="' + esc(s.by) + '"></label><label class="rs-f w2">Notes<input data-s="notes" value="' + esc(s.notes) + '"></label></div>' + dl('dlChem', Object.keys(COMMON)) + dl('dlPeople', R.people) +
      '<div class="rs-test"><b>To make it:</b> <span id="howto"></span></div><div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-x>Cancel</button><button class="btn primary" id="ok">Save</button></div>', function (box, close) {
      var how = function () { var g = solGrams(s); box.querySelector('#howto').innerHTML = g == null ? '<span class="hint">enter strength, unit, volume (and molar mass for N or M)</span>' : 'weigh <b class="ans">' + fmt(g, 4) + ' g</b> of ' + esc(s.chem || 'the chemical') + ' and make up to <b>' + fmt(num(s.volume)) + ' mL</b>' + (num(s.actual) && num(s.target) ? ' · factor ' + fmt(num(s.actual) / num(s.target), 4) : ''); };
      box.querySelectorAll('[data-s]').forEach(function (el) { el.oninput = el.onchange = function () { s[el.dataset.s] = el.value; if (el.dataset.s === 'chem' && COMMON[el.value]) { s.mw = COMMON[el.value][0]; s.eq = COMMON[el.value][1]; box.querySelector('[data-s="mw"]').value = s.mw; box.querySelector('[data-s="eq"]').value = s.eq; } how(); }; });
      how(); box.querySelector('[data-x]').onclick = close;
      box.querySelector('#ok').onclick = function () { if (!s.name.trim()) { toast('Give it a name'); return; } var i = R.sols.findIndex(function (x) { return x.id === s.id; }); if (i >= 0) R.sols[i] = s; else R.sols.unshift(s); put('res_solutions', s); close(); render(); };
    });
  }
  function bindSols() { $('#newS').onclick = function () { solModal(null); }; main.querySelectorAll('[data-eds]').forEach(function (b) { b.onclick = function () { solModal(R.sols.filter(function (x) { return x.id === b.dataset.eds; })[0]); }; }); main.querySelectorAll('[data-dels]').forEach(function (b) { b.onclick = function () { var s = R.sols.filter(function (x) { return x.id === b.dataset.dels; })[0]; if (!confirm('Delete ' + s.name + '?')) return; R.sols = R.sols.filter(function (x) { return x !== s; }); delDoc('res_solutions', s.id); render(); }; }); }

  /* CALCULATORS */
  var TOOLS = [
    { id: 'dil', t: 'Dilution (C1·V1 = C2·V2)', d: 'Leave one box empty: it is calculated.', f: [['c1', 'Stock strength C1'], ['v1', 'Stock volume V1'], ['c2', 'Final strength C2'], ['v2', 'Final volume V2']], run: function (x) { var k = ['c1', 'v1', 'c2', 'v2'].filter(function (q) { return x[q] == null; }); if (k.length !== 1) return 'Fill exactly three boxes.'; var m = k[0], r = m === 'c1' ? x.c2 * x.v2 / x.v1 : m === 'v1' ? x.c2 * x.v2 / x.c1 : m === 'c2' ? x.c1 * x.v1 / x.v2 : x.c1 * x.v1 / x.c2; return ({ c1: 'C1', v1: 'V1', c2: 'C2', v2: 'V2' })[m] + ' = <span class="ans">' + fmt(r, 4) + '</span>' + (m === 'v1' && x.v2 ? '<br>Take ' + fmt(r, 3) + ' of stock and add ' + fmt(x.v2 - r, 3) + ' of water.' : ''); } },
    { id: 'pear', t: 'Blend two materials to a target (Pearson square)', d: 'e.g. mix a 72 Brix syrup with a 40 Brix one to get 65 Brix.', f: [['a', 'Material A (strength)'], ['b', 'Material B (strength)'], ['t', 'Target strength'], ['m', 'Total amount wanted (kg)']], run: function (x) { if ([x.a, x.b, x.t].some(function (v) { return v == null; })) return 'Fill A, B and the target.'; if ((x.t - x.a) * (x.t - x.b) > 0) return 'The target must be between A and B.'; var pa = Math.abs(x.t - x.b), pb = Math.abs(x.a - x.t), s = pa + pb; return 'A : B = <span class="ans">' + fmt(pa, 3) + ' : ' + fmt(pb, 3) + '</span> (' + fmt(pa / s * 100, 1) + '% A)' + (x.m ? '<br>For ' + fmt(x.m) + ' kg: <b>' + fmt(x.m * pa / s, 3) + ' kg A</b> + <b>' + fmt(x.m * pb / s, 3) + ' kg B</b>' : ''); } },
    { id: 'raise', t: 'Raise a concentration (Brix, acidity, salt…)', d: 'How much pure ingredient to add to a batch to go from the current % to the target %.', f: [['m', 'Batch weight now (kg)'], ['c0', 'Current %'], ['ct', 'Target %'], ['p', 'Ingredient strength % (sugar 100, citric 100…)']], run: function (x) { var p = x.p == null ? 100 : x.p; if ([x.m, x.c0, x.ct].some(function (v) { return v == null; })) return 'Fill weight, current and target.'; if (x.ct >= p) return 'The target must be below the ingredient strength.'; var add = x.m * (x.ct - x.c0) / (p - x.ct); return add >= 0 ? 'Add <span class="ans">' + fmt(add, 3) + ' kg</span> · new weight ' + fmt(x.m + add, 2) + ' kg' : 'Already above target: add <b>' + fmt(x.m * (x.c0 - x.ct) / x.ct, 3) + ' kg water</b> to come down.'; } },
    { id: 'lower', t: 'Lower a concentration with water', d: 'Water to add to dilute a batch to the target %.', f: [['m', 'Batch weight now (kg)'], ['c0', 'Current %'], ['ct', 'Target %']], run: function (x) { if ([x.m, x.c0, x.ct].some(function (v) { return v == null; }) || !x.ct) return 'Fill all three.'; var w = x.m * (x.c0 - x.ct) / x.ct; return w >= 0 ? 'Add <span class="ans">' + fmt(w, 3) + ' kg water</span> · new weight ' + fmt(x.m + w, 2) + ' kg' : 'Already below target.'; } },
    { id: 'conv', t: 'Concentration converter', d: 'Between % w/v, g/L, ppm and mol/L (needs molar mass).', f: [['v', 'Value'], ['mw', 'Molar mass g/mol (optional)'], ['d', 'Density g/mL (for w/w, optional)']], sel: [['u', 'From', [['%w/v', '% w/v'], ['g/L', 'g/L'], ['ppm', 'ppm (mg/L)'], ['M', 'mol/L']]]], run: function (x) { if (x.v == null) return 'Enter a value.'; var gl = x.u === '%w/v' ? x.v * 10 : x.u === 'g/L' ? x.v : x.u === 'ppm' ? x.v / 1000 : x.mw ? x.v * x.mw : null; if (gl == null) return 'Enter the molar mass.'; return '<b>' + fmt(gl / 10, 4) + '</b> % w/v · <b>' + fmt(gl, 4) + '</b> g/L · <b>' + fmt(gl * 1000, 2) + '</b> ppm' + (x.mw ? ' · <b>' + fmt(gl / x.mw, 5) + '</b> mol/L' : '') + (x.d ? ' · <b>' + fmt(gl / 10 / x.d, 4) + '</b> % w/w' : ''); } },
    { id: 'scale', t: 'Scale a lab batch to the factory', d: 'Amount used in the lab → amount for the production batch.', f: [['q', 'Amount in the lab'], ['lb', 'Lab batch size'], ['fb', 'Factory batch size (same unit)']], run: function (x) { if ([x.q, x.lb, x.fb].some(function (v) { return v == null; }) || !x.lb) return 'Fill all three.'; return 'Factory amount = <span class="ans">' + fmt(x.q * x.fb / x.lb, 4) + '</span> (× ' + fmt(x.fb / x.lb, 2) + ')'; } },
    { id: 'cfu', t: 'Plate count (cfu/g or cfu/mL)', d: 'Average colonies × dilution ÷ volume plated.', f: [['c1', 'Colonies plate 1'], ['c2', 'Colonies plate 2 (optional)'], ['dil', 'Dilution factor (e.g. 10, 100)'], ['vol', 'Volume plated mL (default 1)']], run: function (x) { if (x.c1 == null || !x.dil) return 'Enter colonies and dilution.'; var c = x.c2 == null ? x.c1 : (x.c1 + x.c2) / 2, r = c * x.dil / (x.vol || 1); return '<span class="ans">' + fmt(r, 0) + '</span> cfu/g · ' + (r ? r.toExponential(1).replace('e+', ' × 10^') : '0'); } },
    { id: 'free', t: 'Free calculator', d: 'Type any formula: sqrt(), avg(), round(x,2)…', f: [], free: true, run: function (x) { try { return '= <span class="ans">' + fmt(evalF(x.expr || '0', {}), 6) + '</span>'; } catch (e) { return '<span style="color:var(--red)">' + esc(e.message) + '</span>'; } } }
  ];
  var TV = {};
  function toolsHTML() {
    var h = header('Calculators', 'Everyday lab maths: dilutions, blending, raising or lowering Brix and acidity, conversions, scale-up and plate counts.');
    h += '<div class="rs-tools">' + TOOLS.map(function (t) { var v = TV[t.id] = TV[t.id] || {}; return '<div class="rs-tool" data-tool="' + t.id + '"><h3>' + t.t + '</h3><div class="hint">' + t.d + '</div><div class="two">' + (t.free ? '<label class="rs-f" style="grid-column:span 2"><input data-tv="expr" value="' + esc(v.expr || '') + '" class="mono" placeholder="(72-65)/(72-40)*100"></label>' : '') + t.f.map(function (f) { return '<label class="rs-f">' + f[1] + '<input data-tv="' + f[0] + '" value="' + esc(v[f[0]] == null ? '' : v[f[0]]) + '" inputmode="decimal"></label>'; }).join('') + (t.sel || []).map(function (s) { return '<label class="rs-f">' + s[1] + '<select data-tv="' + s[0] + '">' + opts(s[2], v[s[0]]) + '</select></label>'; }).join('') + '</div><div class="out" data-out></div></div>'; }).join('') + '</div>';
    return h;
  }
  function bindTools() {
    main.querySelectorAll('[data-tool]').forEach(function (box) {
      var t = TOOLS.filter(function (x) { return x.id === box.dataset.tool; })[0], v = TV[t.id];
      var run = function () { var x = {}; box.querySelectorAll('[data-tv]').forEach(function (el) { var k = el.dataset.tv; v[k] = el.value; x[k] = el.tagName === 'SELECT' || k === 'expr' ? el.value : num(el.value); }); box.querySelector('[data-out]').innerHTML = t.run(x); };
      box.querySelectorAll('[data-tv]').forEach(function (el) { el.oninput = el.onchange = run; }); run();
    });
  }

  /* ---------- start ---------- */
  main.innerHTML = '<div class="boot"><div><i></i>Loading research…</div></div>';
  try { await Promise.all([loadAll(), loadRefs()]); } catch (e) { main.innerHTML = '<div class="panel noacc"><h2>Could not load research</h2><p class="muted">' + esc(e.message || e) + '</p></div>'; return; }
  window.addEventListener('hashchange', render);
  /* live updates from other people: refresh unless someone is typing here */
  var busy = 0; document.addEventListener('focusin', function () { busy = Date.now(); });
  A.planner.subscribe(function (pl) { var c = pl && (pl.new && pl.new.coll || pl.old && pl.old.coll); if (!c || c.indexOf('res_') !== 0 || c === 'res_files') return; setTimeout(async function () { if (saving || Object.keys(pend).length) return; var a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && Date.now() - busy < 20000) return; if (document.querySelector('.mbg')) return; if (await loadAll(true)) rerender(); }, 1200); });
  render();
  window.RS = { R: R, evalF: evalF, render: render }; /* for checks */
})();
