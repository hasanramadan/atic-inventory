/* ATIC assistant: a chat on every page. The question goes with today's numbers (from the same calculations the pages use)
   to the Supabase function "ask", which asks Claude and answers in seconds. */
(function () {
  var A = window.ATIC; if (!A) return;
  var H = [], busy = false, ctxCache = null, ctxAt = 0, DATA = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function n(x) { return x == null || isNaN(x) ? '–' : (Math.round(x * 1000) / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 }); }
  function iso(d) { return new Date(d).toISOString().slice(0, 10); }
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }

  /* ---------- the numbers sent with each question ---------- */
  async function context() {
    if (ctxCache && Date.now() - ctxAt < 60000) return ctxCache;
    if (!window.ATICEngine) await loadScript('js/materials-engine.js');
    var E = window.ATICEngine, today = iso(Date.now()), fc, docs, acts = [];
    var r0 = await Promise.all([A.docs.loadAll(), A.planner.list('actuals').catch(function () { return []; })]);
    docs = r0[0].data; acts = r0[1].map(function (x) { return x.data; }).filter(Boolean);
    if (typeof window.run === 'function' && window.run.cache) fc = window.run(); /* on Raw Materials: exactly what the page shows */
    else {
      var days = {}, secs = {};
      acts.forEach(function (a) { if (!a.date || !a.sec) return; var sc = a.sec === 'S1' ? 'SEC-1' : 'SEC-2'; (secs[a.date] = secs[a.date] || {})[sc] = 1; ((a.runs && a.runs.length) ? a.runs : [{ product: a.product, batches: a.batches }]).forEach(function (q) { var b = Number(q.batches) || 0; if (b > 0 && q.product) { var k = q.product + '|' + sc; (days[a.date] = days[a.date] || {})[k] = (days[a.date][k] || 0) + b; } }); });
      fc = E.forecast(docs.baseline, { materials: docs.materials, recipes: docs.recipes, stock: docs.stock, plan: docs.plan, orders: (docs.orders && docs.orders.items) || [], settings: docs.settings, actualDays: days, actualSections: secs }, today);
    }
    var m = fc.model, L = [];
    L.push('Today: ' + today + ' · lot ' + (A.lot ? A.lot(today) : ''));
    L.push('\nMATERIALS (unit · counted (date) · est. now · use per working day · runs out without deliveries / with deliveries · order by · status · open deliveries):');
    fc.results.filter(function (r) { return r.active || r.stockNow; }).forEach(function (r) {
      var cum = 0, act = null; (r.daily || []).forEach(function (x) { if (x.date < today) return; cum += Number(x.received) || 0; if (act === null && r.weekly > 0 && x.closing - cum <= 0) act = x.date; });
      var y = r.stockNow; (r.daily || []).forEach(function (x) { if (x.date < today && r.weeks && x.date >= r.weeks[0].start) y = x.closing; });
      var mat = m.materials.filter(function (q) { return q.id === r.id; })[0] || {};
      L.push('- ' + r.name + ' [' + r.unit + (mat.recipeFactor > 1 ? ', 1 ' + r.unit + ' = ' + mat.recipeFactor + ' ' + mat.recipeUnit : '') + '] counted ' + n(r.stockCounted) + ' (' + (m.stock[r.id] || {}).asOf + ') · now ≈ ' + n(y) + ' · ' + n(r.perDay) + '/day · runs out ' + (act || 'not in 26 wk') + ' / ' + (r.runOut || 'not in 26 wk') + ' · order by ' + (r.orderBy || '–') + ' · ' + r.status +
        (r.openOrders && r.openOrders.length ? ' · coming: ' + r.openOrders.map(function (o) { return '+' + n(o.qty) + ' on ' + o.eta; }).join(', ') : ''));
    });
    var pl = docs.plan || {};
    if (pl.runs && pl.runs.length) {
      L.push('\nFACTORY PLAN ' + (pl.from || '') + ' → ' + (pl.to || '') + ' (product size · dates · line · batches/day or cartons):');
      pl.runs.forEach(function (r) { L.push('- ' + r.product + ' ' + (r.size || '') + ' · ' + r.from + ' → ' + r.to + ' · ' + (r.lines === 'both' ? 'both lines' : r.lines === 'SEC-1' ? 'Line 1' : 'Line 2') + ' · ' + (r.batches > 0 ? r.batches + ' bt/day' : 'estimate') + (r.cartons ? ' · ' + r.cartons + ' ctn' : '') + (r.dayCartons ? ' · ctn per day ' + JSON.stringify(r.dayCartons) : '')); });
      if (pl.lineDays) { var dk = Object.keys(pl.lineDays).sort().filter(function (d) { return d >= today; }).slice(0, 21); L.push('Batches per day (next 3 weeks): ' + dk.map(function (d) { return d.slice(5) + ' ' + ['SEC-1', 'SEC-2'].map(function (s) { return ((pl.lineDays[d] || {})[s] || []).map(function (x) { return (s === 'SEC-1' ? 'L1 ' : 'L2 ') + x.product + ' ' + (x.size || '') + '×' + x.batches; }).join('+'); }).filter(Boolean).join(', '); }).join(' | ')); }
    } else L.push('\nFACTORY PLAN: none saved.');
    L.push('\nRECIPES per batch (material: Section 1 / Section 2, in the material\'s unit):');
    Object.keys(m.recipes || {}).forEach(function (p) { var r = m.recipes[p] || {}, ks = {}; ['SEC-1', 'SEC-2'].forEach(function (s) { Object.keys(r[s] || {}).forEach(function (k) { if (Number(r[s][k]) > 0) ks[k] = 1; }); }); var t = Object.keys(ks).map(function (k) { var mm = m.materials.filter(function (q) { return q.id === k; })[0]; return (mm ? mm.name : k) + ' ' + n((r['SEC-1'] || {})[k]) + '/' + n((r['SEC-2'] || {})[k]); }); if (t.length) L.push('- ' + p + ': ' + t.join(', ')); });
    var recent = acts.filter(function (a) { return a.date && a.date >= iso(Date.now() - 21 * 864e5); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (recent.length) { L.push('\nLINE PLANNER ACTUALS (last 3 weeks: date · line · runs product size batches boxes):'); recent.forEach(function (a) { L.push('- ' + a.date + ' ' + a.sec + ': ' + ((a.runs && a.runs.length) ? a.runs : [a]).map(function (q) { return q.product + ' ' + (q.size || '') + ' ×' + (q.batches == null ? '?' : q.batches) + (q.boxes ? ' (' + q.boxes + ' boxes)' : ''); }).join(' + ') + (a.lot ? ' · lot ' + a.lot : '')); }); }
    var ord = ((docs.orders && docs.orders.items) || []).filter(function (o) { return o.status === 'open' || o.status === 'partial'; });
    if (ord.length) { L.push('\nOPEN PURCHASE ORDERS:'); ord.forEach(function (o) { L.push('- ' + o.material + ' ' + n(o.qty) + ' ' + (o.unit || '') + ' due ' + o.eta + ' · ' + (o.ref || '') + ((o.receipts || []).length ? ' · received ' + n(o.receipts.reduce(function (s, x) { return s + (+x.qty || 0); }, 0)) : '')); }); }
    ctxCache = L.join('\n'); ctxAt = Date.now(); DATA = { fc: fc, docs: docs, acts: acts, today: today }; return ctxCache;
  }

  /* ---------- the free assistant: answers from the website's own numbers, no outside service ---------- */
  var PNAME = { GM: 'Grenadine Molasses', LS: 'Lemon Substitute', WV: 'White Vinegar', RW: 'Rose Water', BW: 'Blossom Water' };
  var ALIAS = { irani: ['irani', 'iran', 'ايراني'], uae: ['uae', 'emirati', 'اماراتي', 'إماراتي'], iraqi: ['iraqi', 'iraq', 'عراقي'], citric: ['citric', 'ستريك', 'سيتريك', 'حامض الليمون'], sugar: ['sugar', 'سكر'], salt: ['salt', 'ملح'],
    pomegranate: ['pomegranate', 'رمان'], caramel: ['caramel', 'كراميل'], orange: ['orange', 'blossom flav', 'زهر'], rose: ['rose flav', 'rose aroma', 'rose', 'ورد'], lemonoil: ['lemon oil', 'lemon flav', 'lemon essential', 'زيت الليمون'], turbid: ['turbid', 'cloud'],
    acetic: ['acetic', 'glacial', 'خل ثلجي', 'اسيتيك'], sorbate: ['sorbate', 'potassium', 'سوربات'], 'inv-color': ['color', 'colour', 'لون'] };
  function nice(d) { return d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '–'; }
  function addD(d, k) { var t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); }
  function findMats(q) { var out = []; DATA.fc.results.forEach(function (r) { var al = (ALIAS[r.id] || []).concat([r.name.toLowerCase()]); if (al.some(function (a) { return q.indexOf(a) >= 0; })) out.push(r); }); return out; }
  function nowOf(r) { var y = r.stockNow; (r.daily || []).forEach(function (x) { if (x.date < DATA.today && r.weeks && x.date >= r.weeks[0].start) y = x.closing; }); return y; }
  function runOuts(r) { var cum = 0, act = null; (r.daily || []).forEach(function (x) { if (x.date < DATA.today) return; cum += Number(x.received) || 0; if (act === null && r.weekly > 0 && x.closing - cum <= 0) act = x.date; }); return { act: act, exp: r.runOut }; }
  function dayOf(q) {
    var t = DATA.today, w = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    if (/tomorrow|بكرا|بكرة|غدا|غداً/.test(q)) return addD(t, 1);
    if (/yesterday|امس|أمس/.test(q)) return addD(t, -1);
    var m = q.match(/(\d{1,2})\s*[\/.-]\s*(\d{1,2})/); if (m) return t.slice(0, 4) + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    var m2 = q.match(/(\d{1,2})\s*(nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct)/); if (m2) { var mo = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m2[2]) + 1; return t.slice(0, 4) + '-' + ('0' + mo).slice(-2) + '-' + ('0' + m2[1]).slice(-2); }
    for (var i = 0; i < 7; i++) if (q.indexOf(w[i]) >= 0) { var d = t; for (var k = 0; k < 7; k++) { if (new Date(d + 'T00:00:00Z').getUTCDay() === i && (k > 0 || q.indexOf('today') >= 0)) return d; d = addD(d, 1); } }
    return t;
  }
  function lineOf(q) { return /line\s*1|section\s*1|sec\s*1|s1\b|خط\s*1|الخط الاول|قسم\s*1/.test(q) ? 'SEC-1' : /line\s*2|section\s*2|sec\s*2|s2\b|خط\s*2|الخط الثاني|قسم\s*2/.test(q) ? 'SEC-2' : null; }
  function planDay(d) { var pl = DATA.docs.plan || {}, ld = (pl.lineDays || {})[d] || {}; return ld; }
  function localAnswer(q0) {
    if (!DATA) return null;
    var q = q0.toLowerCase(), fc = DATA.fc, m = fc.model, mats = findMats(q), ar = /[؀-ۿ]/.test(q0), out = [];
    var has = function (re) { return re.test(q); };
    if (has(/\blot\b|لوت|رقم التشغيل/)) { var d0 = dayOf(q); return 'Lot for ' + nice(d0) + ': ' + (A.lot ? A.lot(d0) : '–'); }
    if (has(/recipe|وصفة|وصفه/)) {
      var ps = Object.keys(PNAME).filter(function (p) { return q.indexOf(p.toLowerCase()) >= 0 || q.indexOf(PNAME[p].toLowerCase()) >= 0 || (p === 'GM' && /grenadine|دبس/.test(q)) || (p === 'LS' && /lemon sub|بديل الليمون/.test(q)); });
      (ps.length ? ps : ['GM', 'LS']).forEach(function (p) { var r = m.recipes[p] || {}; var ks = {}; ['SEC-1', 'SEC-2'].forEach(function (s) { Object.keys(r[s] || {}).forEach(function (k) { if (r[s][k] > 0) ks[k] = 1; }); });
        out.push(PNAME[p] + ' (per batch, Section 1 / Section 2):\n' + Object.keys(ks).map(function (k) { var x = m.materials.filter(function (y) { return y.id === k; })[0] || { name: k, unit: '', recipeFactor: 1, recipeUnit: '' }; var f = x.recipeFactor || 1; return '• ' + x.name + ': ' + n(((r['SEC-1'] || {})[k] || 0) * f) + ' / ' + n(((r['SEC-2'] || {})[k] || 0) * f) + ' ' + (x.recipeUnit || x.unit); }).join('\n')); });
      return out.join('\n\n');
    }
    if (has(/prepare|preparation|raw material.*(for|on)|materials? (for|on)|نحضر|تحضير|مواد.*(بكرا|غدا|اليوم)/) && !mats.length) {
      var d1 = dayOf(q), ld = planDay(d1), L = lineOf(q), need = {}, runs = [];
      ['SEC-1', 'SEC-2'].filter(function (s) { return !L || s === L; }).forEach(function (s) { (ld[s] || []).forEach(function (x) { runs.push((s === 'SEC-1' ? 'Line 1: ' : 'Line 2: ') + x.product + ' ' + (x.size || '') + ' × ' + x.batches); var r = (m.recipes[x.product] || {})[s] || {}; Object.keys(r).forEach(function (k) { need[k] = (need[k] || 0) + (Number(r[k]) || 0) * x.batches; }); }); });
      if (!runs.length) return 'Nothing in the factory plan for ' + nice(d1) + (L ? ' on ' + (L === 'SEC-1' ? 'Line 1' : 'Line 2') : '') + '. Use the Preparation page to enter products and batches.';
      return 'Raw materials for ' + nice(d1) + ' (from the factory plan):\n' + runs.join('\n') + '\n\n' + Object.keys(need).map(function (k) { var x = m.materials.filter(function (y) { return y.id === k; })[0] || { name: k, unit: '' }; var f = x.recipeFactor || 1; return '• ' + x.name + ': ' + n(need[k] * f) + ' ' + (x.recipeUnit || x.unit) + (f !== 1 ? ' (' + n(need[k]) + ' ' + x.unit + ')' : ''); }).join('\n') + '\n\nThe Preparation page shows it per section with bags + kg.';
    }
    if (has(/plan|produc|line\s*[12]|running|run on|what.*(make|made)|خطة|ننتج|انتاج|إنتاج|خط/) && !mats.length) {
      var L2 = lineOf(q), d2 = dayOf(q), week = /week|اسبوع|أسبوع/.test(q), days = [];
      for (var i = 0; i < (week ? 7 : 1); i++) days.push(addD(week && !/next/.test(q) ? d2 : (week ? addD(d2, 7 - new Date(d2 + 'T00:00:00Z').getUTCDay()) : d2), i));
      days.forEach(function (d) { var ld = planDay(d); var t = ['SEC-1', 'SEC-2'].filter(function (s) { return !L2 || s === L2; }).map(function (s) { return (s === 'SEC-1' ? 'L1 ' : 'L2 ') + ((ld[s] || []).map(function (x) { return x.product + ' ' + (x.size || '') + ' ×' + x.batches; }).join(' → ') || '—'); }).join(' · '); out.push(nice(d) + (new Date(d + 'T00:00:00Z').getUTCDay() === 5 ? ' (Friday off)' : '') + ': ' + t); });
      return 'Factory plan:\n' + out.join('\n');
    }
    if (has(/deliver|arriv|coming|incoming|order(ed|s)? (on|coming)|شحن|وصول|واصل|طلبية/) && !has(/should|need to|what to order|نطلب/)) {
      var oo = []; fc.results.forEach(function (r) { if (mats.length && mats.indexOf(r) < 0) return; (r.openOrders || []).forEach(function (o) { if (o.eta >= DATA.today) oo.push(r.name + ': +' + n(o.qty) + ' ' + r.unit + ' on ' + nice(o.eta)); }); });
      return oo.length ? 'Deliveries still to come:\n' + oo.join('\n') : 'No open deliveries' + (mats.length ? ' for ' + mats.map(function (r) { return r.name; }).join(', ') : '') + '.';
    }
    if (has(/what.*order|should.*order|need to order|order now|buy|نطلب|اطلب|نشتري/) && !mats.length) {
      var lst = fc.results.filter(function (r) { return r.status === 'order' || r.status === 'soon'; }).sort(function (a, b) { return (a.orderBy || '9') < (b.orderBy || '9') ? -1 : 1; });
      return lst.length ? 'To order:\n' + lst.map(function (r) { var ro = runOuts(r); return '• ' + r.name + ' — ' + (r.status === 'order' ? 'order NOW' : 'order by ' + nice(r.orderBy)) + ' · runs out ' + nice(ro.act) + (ro.exp && ro.exp !== ro.act ? ' (' + nice(ro.exp) + ' if deliveries arrive)' : '') + (r.suggestedQty ? ' · suggested ≈ ' + n(r.suggestedQty) + ' ' + r.unit : ''); }).join('\n') : 'Nothing needs ordering right now.';
    }
    if (mats.length) {
      mats.forEach(function (r) {
        var ro = runOuts(r), x = m.materials.filter(function (y) { return y.id === r.id; })[0] || {}, k = x.recipeFactor > 1 ? x.recipeFactor : null, lines = [];
        lines.push(r.name + ' (' + r.unit + (k ? ', 1 ' + r.unit + ' = ' + k + ' ' + x.recipeUnit : '') + ')');
        lines.push('• Now ≈ ' + n(nowOf(r)) + ' ' + r.unit + (k ? ' = ' + n(nowOf(r) * k) + ' ' + x.recipeUnit : '') + ' (counted ' + n(r.stockCounted) + ' on ' + nice((m.stock[r.id] || {}).asOf) + ')');
        lines.push('• Use ≈ ' + n(r.perDay) + ' ' + r.unit + ' a working day');
        lines.push('• Runs out ' + (ro.act ? nice(ro.act) : 'not in 26 weeks') + (ro.exp && ro.exp !== ro.act ? ' (' + nice(ro.exp) + ' if the deliveries arrive)' : ''));
        (r.openOrders || []).filter(function (o) { return o.eta >= DATA.today; }).forEach(function (o) { lines.push('• Delivery: +' + n(o.qty) + ' ' + r.unit + ' on ' + nice(o.eta)); });
        lines.push('• ' + (r.status === 'order' ? 'Order NOW' : r.orderBy ? 'Order by ' + nice(r.orderBy) : 'No order needed') + ' · lead time ' + (x.leadMinDays || '–') + ' days' + (x.orderVia ? ' · ordered through ' + x.orderVia : ''));
        out.push(lines.join('\n'));
      });
      return out.join('\n\n');
    }
    return null;
  }

  /* ---------- the chat window ---------- */
  var css = '.asst-btn{position:fixed;left:18px;bottom:18px;z-index:60;border:0;border-radius:999px;padding:12px 18px;font:600 15px var(--f-body);color:#fff;background:linear-gradient(135deg,#0f4c3a,#2a7a5b);box-shadow:0 10px 24px rgba(8,42,32,.35);cursor:pointer}' +
    '.asst{position:fixed;left:18px;bottom:76px;z-index:61;width:min(420px,calc(100vw - 36px));height:min(560px,calc(100vh - 110px));background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden}' +
    '.asst header{padding:12px 14px;background:linear-gradient(135deg,#0f4c3a,#2a7a5b);color:#fff;display:flex;justify-content:space-between;align-items:center}.asst header b{font:600 15px var(--f-display)}.asst header button{background:none;border:0;color:#fff;font-size:20px;cursor:pointer}' +
    '.asst .log{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px}.asst .m{max-width:88%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap}.asst .u{align-self:flex-end;background:var(--brand);color:var(--brand-ink)}.asst .a{align-self:flex-start;background:var(--surface-2)}.asst .e{align-self:flex-start;background:var(--red-soft);color:var(--red)}' +
    '.asst .sug{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px}.asst .sug button{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:5px 10px;font-size:12.5px;cursor:pointer;color:var(--ink)}' +
    '.asst form{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line)}.asst input{flex:1;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--ink);font:15px var(--f-body)}.asst form button{border:0;border-radius:12px;padding:0 16px;background:var(--brand);color:var(--brand-ink);font-weight:600;cursor:pointer}' +
    '@media print{.asst,.asst-btn{display:none!important}}';
  var SUG = ['What should I order now?', 'When does salt run out?', 'How much sugar do we have now?', 'What runs on Line 2 next week?', 'Raw materials for tomorrow?'];
  function mount() {
    if (document.querySelector('.asst-btn')) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var b = document.createElement('button'); b.className = 'asst-btn'; b.type = 'button'; b.innerHTML = '✦ Ask ATIC'; b.title = 'Ask about stock, forecast, plan, recipes'; document.body.appendChild(b);
    var w = null;
    b.onclick = function () {
      if (w) { w.remove(); w = null; return; }
      w = document.createElement('div'); w.className = 'asst'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', 'Ask ATIC');
      w.innerHTML = '<header><b>✦ Ask ATIC</b><button type="button" aria-label="Close">×</button></header><div class="log" id="asLog"></div>' +
        (H.length ? '' : '<div class="sug">' + SUG.map(function (q) { return '<button type="button">' + esc(q) + '</button>'; }).join('') + '</div>') +
        '<form><input id="asIn" placeholder="Ask about stock, forecast, plan…" autocomplete="off"><button>Send</button></form>';
      document.body.appendChild(w);
      var log = w.querySelector('#asLog');
      if (!H.length) log.innerHTML = '<div class="m a">Hi ' + esc(((A.profile || {}).full_name || '').split(' ')[0]) + '! Ask me anything about the stock, run-out dates, orders, the factory plan, recipes or the batches made. I answer from today\'s numbers.</div>';
      H.forEach(function (m) { log.insertAdjacentHTML('beforeend', '<div class="m ' + (m.role === 'user' ? 'u' : 'a') + '">' + esc(m.content) + '</div>'); });
      log.scrollTop = 1e9;
      w.querySelector('header button').onclick = function () { w.remove(); w = null; };
      w.querySelectorAll('.sug button').forEach(function (s) { s.onclick = function () { ask(s.textContent); }; });
      var f = w.querySelector('form'), inp = w.querySelector('#asIn'); inp.focus();
      f.onsubmit = function (e) { e.preventDefault(); var q = inp.value.trim(); if (q) { inp.value = ''; ask(q); } };
      async function ask(q) {
        if (busy) return; busy = true; var sg = w.querySelector('.sug'); if (sg) sg.remove();
        log.insertAdjacentHTML('beforeend', '<div class="m u">' + esc(q) + '</div><div class="m a" id="asWait">…</div>'); log.scrollTop = 1e9;
        try {
          var ctx = await context(), loc = localAnswer(q);
          if (loc && !(window.ATIC_CONFIG && window.ATIC_CONFIG.aiFirst)) { var w0 = w.querySelector('#asWait'); if (w0) w0.remove(); H.push({ role: 'user', content: q }, { role: 'assistant', content: loc }); log.insertAdjacentHTML('beforeend', '<div class="m a">' + esc(loc) + '</div>'); busy = false; log.scrollTop = 1e9; return; }
          var r = await A.sb.functions.invoke('ask', { body: { question: q, context: ctx, history: H.slice(-6) } });
          if (r.error || (r.data && r.data.error)) { var wx = w.querySelector('#asWait'); if (wx) wx.remove(); log.insertAdjacentHTML('beforeend', '<div class="m a">' + esc(loc || 'I can answer questions about: a material (stock now, use per day, run-out, deliveries, order by), what to order, deliveries coming, the plan for a day or a line, raw materials for a day, recipes and lot numbers. Try: "When does salt run out?", "What should I order?", "Line 2 tomorrow", "Raw materials for tomorrow", "GM recipe".') + '</div>'); busy = false; log.scrollTop = 1e9; return; }
          var wt = w.querySelector('#asWait'); if (wt) wt.remove();
          var err = r.error ? ((r.error.context && r.error.context.status === 404) || /Failed to send/i.test(r.error.message || '') ? 'The assistant is not switched on yet (the "ask" function is not set up in Supabase).' : (r.data && r.data.error) || r.error.message) : (r.data && r.data.error);
          if (err) { log.insertAdjacentHTML('beforeend', '<div class="m e">' + esc(err) + '</div>'); }
          else { var ans = (r.data && r.data.answer) || '(no answer)'; H.push({ role: 'user', content: q }, { role: 'assistant', content: ans }); log.insertAdjacentHTML('beforeend', '<div class="m a">' + esc(ans) + '</div>'); }
        } catch (e) { var wt2 = w.querySelector('#asWait'); if (wt2) wt2.remove(); log.insertAdjacentHTML('beforeend', '<div class="m e">' + esc(e.message || String(e)) + '</div>'); }
        busy = false; log.scrollTop = 1e9;
      }
    };
  }
  (function wait() { if (A.profile) mount(); else setTimeout(wait, 400); })();
})();
