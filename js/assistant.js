/* ATIC assistant: a free guided chat on every page. Menus and typed questions are answered here, in the browser,
   from the website's own numbers (forecast, plan, Line Planner, lab). Nothing is sent to a paid service. */
(function () {
  var A = window.ATIC; if (!A) return;
  var H = [], busy = false, ctxCache = null, ctxAt = 0, DATA = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function n(x) { if (x == null || isNaN(x)) return '–'; var a = Math.abs(x), dp = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3; return Number(x).toLocaleString('en-US', { maximumFractionDigits: dp }); }
  function iso(d) { return new Date(d).toISOString().slice(0, 10); }
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }

  /* ---------- the numbers sent with each question ---------- */
  async function context() {
    if (ctxCache && Date.now() - ctxAt < 60000) return ctxCache;
    if (!window.ATICEngine) await loadScript('js/materials-engine.js');
    var E = window.ATICEngine, today = iso(Date.now()), fc, docs, acts = [];
    var r0 = await Promise.all([A.docs.loadAll(), A.planner.list('actuals').catch(function () { return []; }), A.planner.list('plans').catch(function () { return []; })]);
    docs = r0[0].data; acts = r0[1].map(function (x) { return x.data; }).filter(Boolean); var plans = r0[2].map(function (x) { return x.data; }).filter(Boolean);
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
    ctxCache = L.join('\n'); ctxAt = Date.now(); DATA = { fc: fc, docs: docs, acts: acts, plans: plans, today: today }; return ctxCache;
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
    if (has(/produc|made|carton|ctn|boxes|box\b|stop|stoppage|downtime|filled|yesterday.*(line|section)|what happened|انتجنا|أنتجنا|كراتين|كرتون|توقف|توقفات|عملنا/) && !has(/plan|will|next|tomorrow|going to|خطة|بكرا|غدا|رح ن/)) {
      var week = has(/week|اسبوع|أسبوع/), L3 = lineOf(q), byDay = {};
      DATA.acts.forEach(function (a) { if (a && a.date) (byDay[a.date] = byDay[a.date] || []).push(a); });
      var dates = Object.keys(byDay).sort(), dd;
      if (week) { var ws = has(/last week|الاسبوع الماضي|الأسبوع الماضي/) ? addD(DATA.today, -7 - new Date(DATA.today + 'T00:00:00Z').getUTCDay()) : addD(DATA.today, -new Date(DATA.today + 'T00:00:00Z').getUTCDay()); var we = addD(ws, 6), tot = {}, nd = 0, st = 0;
        dates.filter(function (d) { return d >= ws && d <= we; }).forEach(function (d) { nd++; byDay[d].forEach(function (a) { if (L3 && (a.sec === 'S1' ? 'SEC-1' : 'SEC-2') !== L3) return; st += Number(a.stopMin) || 0; ((a.runs && a.runs.length) ? a.runs : [a]).forEach(function (r) { var k = r.product + ' ' + (r.size || ''); tot[k] = tot[k] || { b: 0, c: 0 }; tot[k].b += Number(r.batches) || 0; tot[k].c += Number(r.boxes) || 0; }); }); });
        if (!nd) return 'No actuals saved in the Line Planner for the week of ' + nice(ws) + '.';
        return 'Produced ' + nice(ws) + ' – ' + nice(we) + ' (' + nd + ' day' + (nd === 1 ? '' : 's') + ' entered' + (L3 ? ', ' + (L3 === 'SEC-1' ? 'Line 1' : 'Line 2') : '') + '):\n' + Object.keys(tot).map(function (k) { return '• ' + k + ': ' + n(tot[k].c) + ' cartons · ' + n(tot[k].b) + ' batches'; }).join('\n') + '\n• Stops: ' + n(st) + ' min in total';
      }
      if (has(/yesterday|امس|أمس|today|اليوم|\d{1,2}\s*[\/.-]\s*\d{1,2}|\d{1,2}\s*(nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct)|sun|mon|tue|wed|thu|sat/)) dd = dayOf(q);
      else dd = dates.filter(function (d) { return d <= DATA.today; }).pop();
      var list = (byDay[dd] || []).filter(function (a) { return !L3 || (a.sec === 'S1' ? 'SEC-1' : 'SEC-2') === L3; }).sort(function (a, b) { return a.sec < b.sec ? -1 : 1; });
      if (!list.length) return 'No actual saved in the Line Planner for ' + nice(dd) + (L3 ? ' on ' + (L3 === 'SEC-1' ? 'Line 1' : 'Line 2') : '') + '. ' + (dates.length ? 'Last day entered: ' + nice(dates[dates.length - 1]) + '.' : '');
      var res = ['Produced on ' + nice(dd) + (list[0].lot ? ' · lot ' + list[0].lot : '') + ':'];
      list.forEach(function (a) {
        var pl = (DATA.plans || []).filter(function (x) { return x.date === dd && x.sec === a.sec; })[0], po = pl && pl.out;
        var runs = (a.runs && a.runs.length) ? a.runs : [a], c = a.changeover || {};
        res.push('\n' + (a.sec === 'S1' ? 'LINE 1' : 'LINE 2'));
        runs.forEach(function (r) { res.push('• ' + r.product + ' ' + (r.size || '') + ': ' + n(r.boxes) + ' cartons · ' + n(r.batches) + ' batches' + (r.opening != null || r.closing != null ? ' · tank ' + n(r.opening) + ' → ' + n(r.closing) + ' bt' : '') + (r.prepOnly ? ' (prepared only)' : '')); });
        if (runs.length > 1) res.push('• Total: ' + n(a.boxes) + ' cartons');
        if (po) res.push('• Forecast was ≈ ' + n(Math.round(po.boxesP50)) + ' cartons (range ' + n(Math.round(po.boxesP10)) + '–' + n(Math.round(po.boxesP90)) + ') → ' + (a.boxes >= po.boxesP50 ? '+' : '') + n(Math.round(a.boxes - po.boxesP50)) + ' vs forecast');
        res.push('• Time: worked ' + n(a.workMin) + ' min · filling ' + n(a.fillMin) + ' min · stops ' + n(a.stopMin) + ' min' + (a.workMin ? ' (' + Math.round(a.stopMin / a.workMin * 1000) / 10 + '%)' : '') + (po ? ' (forecast ' + n(Math.round(po.stopMin)) + ' min)' : ''));
        var parts = [a.startMin ? 'start-up ' + a.startMin + ' min' : '', a.cleanRoutineMin ? 'cleaning ' + a.cleanRoutineMin + ' min' : '', a.cleanDeepMin ? 'CIP ' + a.cleanDeepMin + ' min' : '', c.done || c.min ? 'changeover ' + (c.type || '') + ' ' + (c.min || 0) + ' min' : 'no changeover', a.prepMin ? 'batch prep ' + a.prepMin + ' min' : ''].filter(Boolean);
        res.push('• ' + parts.join(' · ') + (a.lastBox ? ' · last carton ' + a.lastBox : ''));
        if (a.reasons) res.push('• Stop reasons: ' + a.reasons);
        if (a.notes) res.push('• Notes: ' + a.notes);
      });
      return res.join('\n');
    }
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
      return 'Raw materials for ' + nice(d1) + ' (from the factory plan):\n' + runs.join('\n') + '\n\n' + Object.keys(need).filter(function (k) { return need[k] > 0; }).map(function (k) { var x = m.materials.filter(function (y) { return y.id === k; })[0] || { name: k, unit: '' }; var f = x.recipeFactor || 1; return '• ' + x.name + ': ' + n(need[k] * f) + ' ' + (x.recipeUnit || x.unit) + (f !== 1 ? ' (' + n(need[k]) + ' ' + x.unit + ')' : ''); }).join('\n') + '\n\nThe Preparation page shows it per section with bags + kg.';
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
        lines.push('• Normal use ≈ ' + n(r.perDay) + ' ' + r.unit + ' per working day (' + n(r.weekly) + ' a week, average of recent production)');
        lines.push('• Runs out ' + (ro.act ? nice(ro.act) : 'not in 26 weeks') + (ro.exp && ro.exp !== ro.act ? ' (' + nice(ro.exp) + ' if the deliveries arrive)' : ''));
        (r.openOrders || []).filter(function (o) { return o.eta >= DATA.today; }).forEach(function (o) { lines.push('• Delivery: +' + n(o.qty) + ' ' + r.unit + ' on ' + nice(o.eta)); });
        lines.push('• ' + (r.status === 'order' ? 'Order NOW' : r.orderBy ? 'Order by ' + nice(r.orderBy) : 'No order needed') + ' · lead time ' + (x.leadMinDays || '–') + ' days' + (x.orderVia ? ' · ordered through ' + x.orderVia : ''));
        out.push(lines.join('\n'));
      });
      return out.join('\n\n');
    }
    return null;
  }

  /* ---------- extra answers: production analysis ---------- */
  function wd(d) { return new Date(d + 'T00:00:00Z').getUTCDay(); }
  function secName(s) { return s === 'S1' || s === 'SEC-1' ? 'Line 1' : 'Line 2'; }
  function todayForecast(day) {
    var d = day || DATA.today, ps = (DATA.plans || []).filter(function (x) { return x.date === d; }).sort(function (a, b) { return a.sec < b.sec ? -1 : 1; });
    if (!ps.length) return 'No forecast saved in the Line Planner for ' + nice(d) + ' yet. Open the Line Planner and press "Save forecast" for each section.';
    var out = ['Forecast for ' + nice(d) + ':'];
    ps.forEach(function (p) { var o = p.out || {}, ins = (p.inputs && p.inputs.runs) || [];
      out.push('\n' + secName(p.sec).toUpperCase());
      ins.forEach(function (r) { out.push('• ' + r.product + ' ' + (r.size || '') + ': ' + n(r.batches || 0) + ' batches prepared + ' + n(r.openingResolved != null ? r.openingResolved : r.opening) + ' in the tank'); });
      out.push('• Expected ≈ ' + n(o.boxesP50) + ' cartons (range ' + n(o.boxesP10) + '–' + n(o.boxesP90) + ')');
      out.push('• Filling ' + n(o.fillMin) + ' min · stops ' + n(o.stopMin) + ' min · last carton ' + (o.finish || '–') + ' · left in tank ' + n(o.closingBatches) + ' batches');
    });
    var acts = DATA.acts.filter(function (a) { return a.date === d; }); if (acts.length) out.push('\nActual so far: ' + acts.map(function (a) { return secName(a.sec) + ' ' + n(a.boxes) + ' cartons'; }).join(' · '));
    return out.join('\n');
  }
  function stopReasons(days) {
    var from = addD(DATA.today, -days), agg = {}, tot = 0, nd = 0;
    DATA.acts.filter(function (a) { return a.date >= from && a.date <= DATA.today && a.reasons; }).forEach(function (a) { nd++;
      String(a.reasons).split(/;\s*/).forEach(function (part) { var m = part.match(/^\s*(.+?)\s+(\d+)\s*min/i); if (!m) return; var k = m[1].trim().replace(/^[a-z]/, function (c) { return c.toUpperCase(); }); if (/arrangement|start-?up|cleaning|cip/i.test(k)) k = /clean|cip/i.test(k) ? 'Cleaning / CIP' : 'Start-up & arrangement'; agg[k] = agg[k] || { min: 0, n: 0 }; agg[k].min += +m[2]; agg[k].n++; tot += +m[2]; }); });
    var ks = Object.keys(agg).sort(function (a, b) { return agg[b].min - agg[a].min; }).slice(0, 10);
    if (!ks.length) return 'No stop reasons written in the actuals of the last ' + days + ' days.';
    return 'Top stop reasons, last ' + days + ' days (' + nd + ' line-days, ' + n(tot) + ' min in total):\n' + ks.map(function (k, i) { return (i + 1) + '. ' + k + ': ' + n(agg[k].min) + ' min (' + agg[k].n + '×, ' + Math.round(agg[k].min / tot * 100) + '%)'; }).join('\n') + '\n\nPlanned stops (start-up, cleaning, CIP) are grouped; the rest are machine stops worth fixing first.';
  }
  function accuracy(days) {
    var from = addD(DATA.today, -days), rows = [];
    DATA.acts.filter(function (a) { return a.date >= from && a.date < DATA.today && a.boxes > 0; }).forEach(function (a) { var p = (DATA.plans || []).filter(function (x) { return x.date === a.date && x.sec === a.sec; })[0]; if (p && p.out && p.out.boxesP50) rows.push({ d: a.date, s: a.sec, act: a.boxes, fc: p.out.boxesP50, lo: p.out.boxesP10, hi: p.out.boxesP90 }); });
    if (!rows.length) return 'No days in the last ' + days + ' days have both a saved forecast and an actual.';
    var err = rows.reduce(function (s, r) { return s + Math.abs(r.act - r.fc) / r.act; }, 0) / rows.length, inR = rows.filter(function (r) { return r.act >= r.lo && r.act <= r.hi; }).length;
    rows.sort(function (a, b) { return a.d < b.d ? 1 : -1; });
    return 'Forecast vs actual, last ' + days + ' days (' + rows.length + ' line-days):\n• Average miss: ' + Math.round(err * 100) + '% (' + Math.round((1 - err) * 100) + '% accurate)\n• Inside the forecast range: ' + inR + ' of ' + rows.length + '\n\n' + rows.slice(0, 8).map(function (r) { return nice(r.d) + ' ' + secName(r.s) + ': ' + n(r.act) + ' vs ' + n(Math.round(r.fc)) + ' (' + (r.act >= r.fc ? '+' : '') + Math.round((r.act - r.fc) / r.fc * 100) + '%)'; }).join('\n');
  }
  function monthSummary() {
    var m0 = DATA.today.slice(0, 7) + '-01', tot = {}, nd = {}, st = 0, wk = 0, best = null;
    DATA.acts.filter(function (a) { return a.date >= m0 && a.date <= DATA.today; }).forEach(function (a) { nd[a.date] = 1; st += +a.stopMin || 0; wk += +a.workMin || 0; ((a.runs && a.runs.length) ? a.runs : [a]).forEach(function (r) { if (r.prepOnly) return; var k = r.product + ' ' + (r.size || ''); tot[k] = tot[k] || { c: 0, b: 0 }; tot[k].c += +r.boxes || 0; tot[k].b += +r.batches || 0; }); if (!best || a.boxes > best.boxes) best = a; });
    var ks = Object.keys(tot); if (!ks.length) return 'No actuals entered this month yet.';
    var all = ks.reduce(function (s, k) { return s + tot[k].c; }, 0);
    return 'This month so far (' + Object.keys(nd).length + ' working days):\n' + ks.sort(function (a, b) { return tot[b].c - tot[a].c; }).map(function (k) { return '• ' + k + ': ' + n(tot[k].c) + ' cartons'; }).join('\n') + '\n• Total: ' + n(all) + ' cartons\n• Stops: ' + n(st) + ' min (' + (wk ? Math.round(st / wk * 100) : 0) + '% of working time)' + (best ? '\n• Best line-day: ' + nice(best.date) + ' ' + secName(best.sec) + ', ' + n(best.boxes) + ' cartons' : '');
  }
  function runOutList() {
    var rs = DATA.fc.results.filter(function (r) { return r.active; }).map(function (r) { return { r: r, ro: runOuts(r) }; }).sort(function (a, b) { return (a.ro.act || '9') < (b.ro.act || '9') ? -1 : 1; });
    return 'Run-out dates (soonest first):\n' + rs.map(function (x) { var st = x.r.status === 'order' ? '🔴' : x.r.status === 'soon' ? '🟠' : '🟢'; return st + ' ' + x.r.name + ': ' + (x.ro.act ? nice(x.ro.act) : 'not in 26 weeks') + (x.ro.exp && x.ro.exp !== x.ro.act ? ' (' + nice(x.ro.exp) + ' with deliveries)' : ''); }).join('\n') + '\n\n🔴 order now · 🟠 order soon · 🟢 fine';
  }

  /* ---------- lab (doctor and admins only) ---------- */
  var LAB = null;
  function labAllowed() { var p = A.profile || {}, ar = p.areas || []; return !!(p.is_owner || p.role === 'admin' || (ar.indexOf('lab') >= 0 && ar.indexOf('production') >= 0)); }
  async function labLoad() {
    if (LAB && Date.now() - LAB.at < 60000) return LAB;
    var r = await Promise.all([A.planner.list('lab_sessions'), A.planner.list('lab_samples'), A.sb.from('planner_docs').select('data').eq('coll', 'lab_config').eq('id', 'main').single(), A.planner.list('lab_people').catch(function () { return []; }), A.planner.list('lab_daybatch').catch(function () { return []; })]);
    var cfg = (r[2].data && r[2].data.data) || { products: [] }, people = {}; r[3].forEach(function (x) { people[x.id] = (x.data && x.data.name) || x.id; });
    var ses = r[0].map(function (x) { var d = x.data || {}; d.id = x.id; return d; }), sam = r[1].map(function (x) { var d = x.data || {}; d.id = x.id; return d; });
    var db = {}; r[4].forEach(function (x) { db[x.id] = (x.data && x.data.items) || {}; });
    LAB = { at: Date.now(), cfg: cfg, ses: ses, sam: sam, people: people, db: db, prod: {} }; (cfg.products || []).forEach(function (p) { LAB.prod[p.id] = p; });
    return LAB;
  }
  function fx(src, sc) { /* small safe formula reader: + - * / ^ ( ) and names */
    var t = String(src || '').match(/\d+\.?\d*|[A-Za-z_]\w*|[-+*/^()]/g) || [], p = 0;
    function e() { var a = tm(); while (t[p] === '+' || t[p] === '-') { var o = t[p++], b = tm(); a = o === '+' ? a + b : a - b; } return a; }
    function tm() { var a = pw(); while (t[p] === '*' || t[p] === '/') { var o = t[p++], b = pw(); a = o === '*' ? a * b : a / b; } return a; }
    function pw() { var a = un(); if (t[p] === '^') { p++; return Math.pow(a, pw()); } return a; }
    function un() { if (t[p] === '-') { p++; return -un(); } return pr(); }
    function pr() { var k = t[p++]; if (k === '(') { var v = e(); p++; return v; } if (/^\d/.test(k)) return parseFloat(k); var v2 = sc[k]; if (v2 == null || v2 === '' || isNaN(v2)) throw 0; return Number(v2); }
    try { var v = e(); return isFinite(v) ? v : null; } catch (x) { return null; }
  }
  function sampleOuts(test, res) {
    if (!res) return null;
    if (test.kind === 'org' || !test.outputs) return res.value != null ? [{ label: test.name, v: res.value, txt: true, bad: /not|reject|fail/i.test(res.value) }] : null;
    var sc = {}; (test.consts || []).forEach(function (c) { sc[c.key] = res.k && res.k[c.key] != null ? res.k[c.key] : c.value; }); Object.keys(res.in || {}).forEach(function (k) { sc[k] = res.in[k]; });
    var out = []; test.outputs.forEach(function (o) { if (o.grp && test.pick && res.pick && o.grp !== res.pick) return; var v = fx(o.formula, sc); sc[o.key] = v; if (v == null) return; var mn = o.min === '' || o.min == null ? null : +o.min, mx = o.max === '' || o.max == null ? null : +o.max; out.push({ label: o.label, unit: o.unit || '', v: v, dp: o.dp == null ? 2 : o.dp, bad: (mn != null && v < mn) || (mx != null && v > mx), lim: (mn != null ? '≥' + mn : '') + (mx != null ? ' ≤' + mx : '') }); });
    return out.length ? out : null;
  }
  function fmtV(o) { return o.txt ? o.v : Number(o.v).toLocaleString('en-US', { maximumFractionDigits: o.dp }) + (o.unit ? ' ' + o.unit : ''); }
  function labToday(day) {
    var d = day || DATA.today, ss = LAB.ses.filter(function (s) { return s.date === d; }), sent = LAB.db[d] || {};
    var out = ['Lab on ' + nice(d) + ':'];
    if (Object.keys(sent).length) out.push('Batches sent to the lab: ' + Object.keys(sent).map(function (k) { var a = k.split('|'); return a[0] + ' ' + (a[1] === 'SEC-1' ? 'L1' : 'L2') + ' ×' + sent[k]; }).join(', '));
    if (!ss.length) { out.push('No lab sessions opened yet.'); return out.join('\n'); }
    ss.forEach(function (s) { var p = LAB.prod[s.productId] || { name: s.productId, tests: [] }, sm = LAB.sam.filter(function (x) { return x.sessionId === s.id; }), done = sm.filter(function (x) { return x.testedAt; }).length, bad = 0;
      sm.forEach(function (x) { (p.tests || []).forEach(function (t) { (sampleOuts(t, (x.results || {})[t.id]) || []).forEach(function (o) { if (o.bad) bad++; }); }); });
      out.push('• ' + p.name + ' · ' + (s.section === 'Lab' ? 'lab' : secName(s.section)) + ': ' + (s.batches || 0) + ' batches · ' + sm.length + ' samples · ' + done + ' tested' + (bad ? ' · ⚠ ' + bad + ' result(s) out of limits' : '') + (s.validated ? ' · ✔ validated' : ' · not validated yet')); });
    return out.join('\n');
  }
  function labProduct(pid) {
    var p = LAB.prod[pid]; if (!p) return 'Unknown product.';
    var ss = LAB.ses.filter(function (s) { return s.productId === pid; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 6);
    if (!ss.length) return 'No lab records for ' + p.name + ' yet.';
    var out = [p.name + ': last ' + ss.length + ' sessions'];
    ss.forEach(function (s) {
      var sm = LAB.sam.filter(function (x) { return x.sessionId === s.id; }), rng = {}, bad = 0, miss = 0;
      sm.forEach(function (x) { (p.tests || []).forEach(function (t) { var o = sampleOuts(t, (x.results || {})[t.id]); if (!o) { if (t.kind !== 'micro' && !t.optional) miss++; return; } o.forEach(function (q) { if (q.bad) bad++; if (q.txt) { (rng[q.label] = rng[q.label] || { txt: {} }).txt[q.v] = 1; return; } var r = rng[q.label] = rng[q.label] || { lo: q.v, hi: q.v, unit: q.unit, dp: q.dp }; r.lo = Math.min(r.lo, q.v); r.hi = Math.max(r.hi, q.v); }); }); });
      out.push('\n' + nice(s.date) + ' · ' + (s.section === 'Lab' ? 'lab' : secName(s.section)) + (s.lot ? ' · lot ' + s.lot : '') + ' · ' + sm.length + '/' + (s.batches || 0) + ' samples' + (s.validated ? ' · ✔' : ' · not validated'));
      Object.keys(rng).forEach(function (k) { var r = rng[k]; out.push('  ' + k + ': ' + (r.txt ? Object.keys(r.txt).join(', ') : (r.lo === r.hi ? fmtV({ v: r.lo, unit: r.unit, dp: r.dp }) : fmtV({ v: r.lo, unit: '', dp: r.dp }) + '–' + fmtV({ v: r.hi, unit: r.unit, dp: r.dp })))); });
      if (bad) out.push('  ⚠ ' + bad + ' result(s) out of limits'); if (miss) out.push('  ⏳ ' + miss + ' result(s) still missing');
    });
    return out.join('\n');
  }
  function labOut(days) {
    var from = addD(DATA.today, -days), rows = [];
    LAB.sam.filter(function (x) { return (x.date || '') >= from; }).forEach(function (x) { var p = LAB.prod[x.productId]; if (!p) return; (p.tests || []).forEach(function (t) { (sampleOuts(t, (x.results || {})[t.id]) || []).forEach(function (o) { if (o.bad) rows.push(nice(x.date) + ' · ' + p.name + ' ' + (x.code || '') + ' · ' + o.label + ' ' + fmtV(o) + (o.lim ? ' (limit ' + o.lim.trim() + ')' : '')); }); }); });
    return rows.length ? 'Results out of limits, last ' + days + ' days (' + rows.length + '):\n' + rows.join('\n') : 'No results out of limits in the last ' + days + ' days. ✔';
  }
  function labGaps() {
    var out = [], from = addD(DATA.today, -14);
    LAB.ses.filter(function (s) { return s.date >= from; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (s) {
      var p = LAB.prod[s.productId]; if (!p) return; var sm = LAB.sam.filter(function (x) { return x.sessionId === s.id; }), gaps = [];
      if ((s.batches || 0) > sm.length && s.section !== 'Lab') gaps.push((s.batches - sm.length) + ' sample(s) not taken');
      var missT = {}; sm.forEach(function (x) { (p.tests || []).forEach(function (t) { if (t.optional) return; var r = (x.results || {})[t.id], has = r && (r.value != null || (r.in && Object.keys(r.in).some(function (k) { return r.in[k] !== '' && r.in[k] != null; }))); if (has) return; if (t.kind === 'micro') { if (addD(s.date, t.incubDays || 0) >= DATA.today) return; missT[t.name + ' (overdue)'] = (missT[t.name + ' (overdue)'] || 0) + 1; } else missT[t.name] = (missT[t.name] || 0) + 1; }); });
      Object.keys(missT).forEach(function (k) { gaps.push(k + ' ×' + missT[k]); });
      if (!s.validated && s.date < DATA.today) gaps.push('not validated');
      if (gaps.length) out.push('• ' + nice(s.date) + ' ' + p.name + ' ' + (s.section === 'Lab' ? '(lab)' : secName(s.section)) + ': ' + gaps.join(', '));
    });
    Object.keys(LAB.db).filter(function (d) { return d >= from && d < DATA.today; }).forEach(function (d) { Object.keys(LAB.db[d]).forEach(function (k) { var a = k.split('|'); if (!LAB.ses.some(function (s) { return s.date === d && s.productId === a[0] && s.section === a[1]; })) out.push('• ' + nice(d) + ' ' + ((LAB.prod[a[0]] || {}).name || a[0]) + ' ' + secName(a[1]) + ': ' + LAB.db[d][k] + ' batches sent, no session opened'); }); });
    var last = function (pid) { var s = LAB.ses.filter(function (x) { return x.productId === pid; }).map(function (x) { return x.date; }).sort().pop(); return s ? nice(s) : 'never'; };
    out.push('\nLast checks: water ' + last('WTR') + ' · hand swab ' + last('HSW') + ' · surface swab ' + last('SSW'));
    return out.length > 1 ? 'Lab gaps, last 14 days:\n' + out.join('\n') : 'No gaps in the last 14 days. ✔' + out.join('');
  }
  function labWho(days) {
    var from = addD(DATA.today, -days), c = {};
    LAB.sam.filter(function (x) { return (x.date || '') >= from && x.testedBy; }).forEach(function (x) { var k = LAB.people[x.testedBy] || x.testedBy; c[k] = (c[k] || 0) + 1; });
    var ks = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; });
    return ks.length ? 'Samples tested, last ' + days + ' days:\n' + ks.map(function (k) { return '• ' + k + ': ' + c[k]; }).join('\n') : 'No samples tested in the last ' + days + ' days.';
  }
  /* ---------- research ---------- */
  async function research() {
    var ps = (await A.planner.list('res_projects').catch(function () { return []; })).map(function (x) { return x.data; }).filter(Boolean);
    if (!ps.length) return 'No research projects yet. Open Research → + New project.';
    var L = { idea: 'Idea', planned: 'Planned', running: 'Running', review: 'In review', done: 'Done', stopped: 'Stopped' };
    return 'Research projects:\n' + ps.sort(function (a, b) { return (b.updatedAt || '') < (a.updatedAt || '') ? -1 : 1; }).slice(0, 10).map(function (p) { return '• ' + p.code + ' ' + p.title + ' — ' + (L[p.status] || p.status) + ' · ' + (p.owner || '') + (p.due ? ' · due ' + nice(p.due) + (p.due < DATA.today && ['done', 'stopped'].indexOf(p.status) < 0 ? ' ⚠ overdue' : '') : ''); }).join('\n');
  }

  /* ---------- the guided menu (free: everything is worked out here, nothing is sent outside) ---------- */
  var onLab = /lab/.test(location.pathname);
  function menu() {
    var lab = labAllowed(), o = [];
    if (onLab && lab) o.push(['🧪 Lab', 'lab']);
    o.push(['🏭 Production', 'prod'], ['📦 Raw materials', 'mat'], ['🗓 Factory plan', 'plan']);
    if (!onLab && lab) o.push(['🧪 Lab', 'lab']);
    o.push(['🔬 Research', 'res'], ['❓ What can I ask?', 'help']);
    return o;
  }
  var HOME = ['🏠 Menu', 'menu'];
  var NODES = {
    menu: function () { return { t: 'What do you want to know?', o: menu() }; },
    help: function () { return { t: 'Tap a topic, or type a question like:\n• What did we produce yesterday?\n• Line 2 yesterday stoppages\n• When does salt run out?\n• What should I order?\n• Deliveries coming\n• Raw materials for tomorrow\n• Plan next week\n• GM recipe\n• Lot for tomorrow' + (labAllowed() ? '\n• Lab LS results\n• Lab gaps\n• Out of limits' : '') + '\n\nEverything is worked out from the website\'s own numbers, for free.', o: menu() }; },
    prod: function () { return { t: 'Production: what do you want to see?', o: [['Yesterday, both lines', 'q:what did we produce yesterday'], ['Today\'s forecast', 'f:today'], ['This week', 'q:cartons this week'], ['Last week', 'q:produced last week'], ['This month', 'f:month'], ['Top stop reasons (30 days)', 'f:stops'], ['Forecast accuracy', 'f:acc'], ['Pick a day…', 'pday'], HOME] }; },
    pday: function () { var o = []; for (var i = 1; o.length < 6 && i < 14; i++) { var d = addD(DATA.today, -i); if (wd(d) !== 5) o.push([nice(d), 'q:produced on ' + d.slice(8) + '/' + d.slice(5, 7)]); } o.push(HOME); return { t: 'Which day?', o: o }; },
    mat: function () { return { t: 'Raw materials: what do you want to see?', o: [['What to order now', 'q:what should i order'], ['Run-out dates', 'f:runout'], ['Deliveries coming', 'q:deliveries coming'], ['One material…', 'mlist'], ['Raw materials for today', 'q:raw materials for today'], ['Raw materials for tomorrow', 'q:raw materials for tomorrow'], ['Recipes…', 'rlist'], HOME] }; },
    mlist: function () { return { t: 'Which material?', o: DATA.fc.results.filter(function (r) { return r.active; }).map(function (r) { return [r.name, 'm:' + r.id]; }).concat([HOME]) }; },
    rlist: function () { return { t: 'Which product?', o: Object.keys(PNAME).map(function (p) { return [PNAME[p], 'q:' + p.toLowerCase() + ' recipe']; }).concat([HOME]) }; },
    plan: function () { return { t: 'Factory plan: which period?', o: [['Today', 'q:plan today'], ['Tomorrow', 'q:plan tomorrow'], ['This week', 'q:plan this week'], ['Next week', 'q:plan next week'], ['Line 1 next week', 'q:line 1 plan next week'], ['Line 2 next week', 'q:line 2 plan next week'], ['Lot number for today', 'q:lot today'], HOME] }; },
    lab: function () { return labAllowed() ? { t: 'Lab: what do you want to see?', o: [['Today in the lab', 'l:today'], ['Yesterday in the lab', 'l:yday'], ['Records for a product…', 'lprod'], ['Gaps and missing results', 'l:gaps'], ['Out of limits (14 days)', 'l:out'], ['Who tested what (7 days)', 'l:who'], HOME] } : { t: 'The lab topics are for the doctor and the admins.', o: menu() }; },
    lprod: function () { return { t: 'Which product?', o: (LAB.cfg.products || []).map(function (p) { return [p.name, 'lp:' + p.id]; }).concat([HOME]) }; },
    res: function () { return { t: 'Research', o: [['Projects and status', 'r:list'], HOME] }; }
  };
  function follow(act) {
    if (/^q:.*(produc|cartons|stop)/.test(act) || /^f:(today|month|stops|acc)/.test(act)) return [['Stop reasons', 'f:stops'], ['Forecast accuracy', 'f:acc'], ['This month', 'f:month'], ['🏭 Production', 'prod'], HOME];
    if (/^(m:|q:what should|q:deliver|f:runout)/.test(act)) return [['What to order now', 'q:what should i order'], ['Run-out dates', 'f:runout'], ['One material…', 'mlist'], HOME];
    if (/^q:.*(plan|lot)/.test(act)) return [['Raw materials for tomorrow', 'q:raw materials for tomorrow'], ['🗓 Factory plan', 'plan'], HOME];
    if (/^q:.*(raw materials|recipe)/.test(act)) return [['📦 Raw materials', 'mat'], HOME];
    if (/^(l:|lp:)/.test(act)) return [['Gaps', 'l:gaps'], ['Out of limits', 'l:out'], ['Another product…', 'lprod'], ['🧪 Lab', 'lab'], HOME];
    return [HOME];
  }
  async function run(act) {
    await context();
    if (NODES[act]) { if (/^(lab|lprod)$/.test(act) && labAllowed()) await labLoad(); return NODES[act](); }
    var k = act.slice(0, act.indexOf(':')), v = act.slice(act.indexOf(':') + 1), t;
    if (k === 'q') t = localAnswer(v);
    else if (k === 'm') { var r = DATA.fc.results.filter(function (x) { return x.id === v; })[0]; t = r ? localAnswer(r.name.toLowerCase()) : null; }
    else if (k === 'f') t = v === 'today' ? todayForecast() : v === 'month' ? monthSummary() : v === 'stops' ? stopReasons(30) : v === 'acc' ? accuracy(21) : runOutList();
    else if (k === 'l' || k === 'lp') { if (!labAllowed()) return NODES.lab(); await labLoad(); t = k === 'lp' ? labProduct(v) : v === 'today' ? labToday() : v === 'yday' ? labToday(prevWork(DATA.today)) : v === 'gaps' ? labGaps() : v === 'out' ? labOut(14) : labWho(7); }
    else if (k === 'r') t = await research();
    return { t: t || 'Nothing to show for that yet.', o: follow(act) };
  }
  function prevWork(d) { var x = addD(d, -1); if (wd(x) === 5) x = addD(x, -1); return x; }
  async function typed(q0) {
    await context();
    var q = q0.toLowerCase().trim();
    if (/^(hi|hello|hey|salam|مرحبا|السلام|هلا)\b/.test(q)) return NODES.menu();
    if (/\blab\b|مختبر|sample|عينة|results? (for|of)|out of (spec|limit)|validat/.test(q)) {
      if (!labAllowed()) return { t: 'The lab topics are for the doctor and the admins.', o: menu() };
      await labLoad();
      var pid = (LAB.cfg.products || []).filter(function (p) { return q.indexOf(p.id.toLowerCase()) >= 0 || q.indexOf(p.name.toLowerCase()) >= 0 || (p.id === 'GM' && /grenadine|دبس/.test(q)) || (p.id === 'LS' && /lemon/.test(q)) || (p.id === 'WTR' && /water\b/.test(q) && !/rose|blossom/.test(q)); })[0];
      if (/gap|missing|pending|overdue|ناقص/.test(q)) return run('l:gaps');
      if (/out of|limit|spec|fail|bad/.test(q)) return run('l:out');
      if (/who|tested by/.test(q)) return run('l:who');
      if (pid) return run('lp:' + pid.id);
      if (/yesterday|امس/.test(q)) return run('l:yday');
      return run('l:today');
    }
    if (/research|trial|experiment|بحث/.test(q)) return run('r:list');
    if (/forecast/.test(q) && /today|اليوم/.test(q)) return run('f:today');
    if (/stop reason|top stop|why.*stop|most stop/.test(q)) return run('f:stops');
    if (/accura|how good|forecast vs/.test(q)) return run('f:acc');
    if (/month|شهر/.test(q) && /produc|carton|كرتون/.test(q)) return run('f:month');
    if (/run.?out|ينفذ|يخلص/.test(q) && !findMats(q).length) return run('f:runout');
    var a = localAnswer(q0);
    if (a) return { t: a, o: follow('q:' + q) };
    /* not matched: never a dead end, show the closest topics */
    var guess = /produc|carton|line|stop|كرتون|انتاج/.test(q) ? 'prod' : /order|stock|material|مواد|طلب/.test(q) ? 'mat' : /plan|خطة/.test(q) ? 'plan' : 'menu';
    var nd = NODES[guess]();
    return { t: 'I don\'t have an exact answer for that, but here is what I can show you. Tap one:', o: nd.o };
  }

  /* ---------- the chat window ---------- */
  var css = '.asst-btn{position:fixed;left:18px;bottom:18px;z-index:60;border:0;border-radius:999px;padding:12px 18px;font:600 15px var(--f-body);color:#fff;background:linear-gradient(135deg,#0f4c3a,#2a7a5b);box-shadow:0 10px 24px rgba(8,42,32,.35);cursor:pointer}' +
    '.asst{position:fixed;left:18px;bottom:76px;z-index:61;width:min(440px,calc(100vw - 36px));height:min(600px,calc(100vh - 110px));background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden}' +
    '.asst header{padding:12px 14px;background:linear-gradient(135deg,#0f4c3a,#2a7a5b);color:#fff;display:flex;justify-content:space-between;align-items:center}.asst header b{font:600 15px var(--f-display)}.asst header button{background:none;border:0;color:#fff;font-size:20px;cursor:pointer;margin-left:6px}' +
    '.asst .log{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}.asst .m{max-width:90%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap}.asst .u{align-self:flex-end;background:var(--brand);color:var(--brand-ink)}.asst .a{align-self:flex-start;background:var(--surface-2)}.asst .e{align-self:flex-start;background:var(--red-soft);color:var(--red)}' +
    '.asst .opts{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:96%}.asst .opts button{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:6px 11px;font-size:13px;cursor:pointer;color:var(--ink)}.asst .opts button:hover{border-color:var(--brand);color:var(--brand)}.asst .opts.old button{opacity:.55}' +
    '.asst form{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line)}.asst input{flex:1;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--ink);font:15px var(--f-body)}.asst form button{border:0;border-radius:12px;padding:0 16px;background:var(--brand);color:var(--brand-ink);font-weight:600;cursor:pointer}' +
    '@media print{.asst,.asst-btn{display:none!important}}';
  var LOG = [];
  function mount() {
    if (document.querySelector('.asst-btn')) return;
    if (onLab && !labAllowed()) return; /* the lab account does not get the assistant */
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var b = document.createElement('button'); b.className = 'asst-btn'; b.type = 'button'; b.innerHTML = '✦ Ask ATIC'; b.title = 'Ask about production, stock, the plan' + (labAllowed() ? ', the lab' : ''); document.body.appendChild(b);
    var w = null;
    b.onclick = function () {
      if (w) { w.remove(); w = null; return; }
      w = document.createElement('div'); w.className = 'asst'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', 'Ask ATIC');
      w.innerHTML = '<header><b>✦ Ask ATIC</b><span><button type="button" data-h title="Menu" aria-label="Menu">⌂</button><button type="button" data-x aria-label="Close">×</button></span></header><div class="log" id="asLog"></div><form><input id="asIn" placeholder="Type a question or tap a button…" autocomplete="off"><button>Send</button></form>';
      document.body.appendChild(w);
      var log = w.querySelector('#asLog');
      function draw() { log.innerHTML = LOG.map(function (m, i) { return m.o ? '<div class="opts' + (i < LOG.length - 1 ? ' old' : '') + '">' + m.o.map(function (o) { return '<button type="button" data-act="' + esc(o[1]) + '">' + esc(o[0]) + '</button>'; }).join('') + '</div>' : '<div class="m ' + m.c + '">' + esc(m.t) + '</div>'; }).join(''); log.scrollTop = 1e9; log.querySelectorAll('[data-act]').forEach(function (x) { x.onclick = function () { go(x.textContent, function () { return run(x.dataset.act); }); }; }); }
      async function go(label, fn) {
        if (busy) return; busy = true; LOG.push({ c: 'u', t: label }, { c: 'a', t: '…' }); draw();
        try { var r = await fn(); LOG.pop(); LOG.push({ c: 'a', t: r.t }); if (r.o && r.o.length) LOG.push({ o: r.o }); }
        catch (e) { LOG.pop(); LOG.push({ c: 'e', t: 'Something went wrong: ' + (e.message || e) }, { o: [HOME] }); }
        busy = false; draw();
      }
      if (!LOG.length) { var first = (((A.profile || {}).full_name || '').split(' ')[0]) || ''; LOG.push({ c: 'a', t: 'Hi ' + first + '! 👋 What do you want to know today?' }, { o: menu() }); }
      draw();
      w.querySelector('[data-x]').onclick = function () { w.remove(); w = null; };
      w.querySelector('[data-h]').onclick = function () { go('🏠 Menu', function () { return run('menu'); }); };
      var f = w.querySelector('form'), inp = w.querySelector('#asIn'); inp.focus();
      f.onsubmit = function (e) { e.preventDefault(); var q = inp.value.trim(); if (q) { inp.value = ''; go(q, function () { return typed(q); }); } };
    };
  }
  (function wait() { if (A.profile) mount(); else setTimeout(wait, 400); })();
})();
