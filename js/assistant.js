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
    if (/yesterday|امس|أمس/.test(q)) { var yd = addD(t, -1); return new Date(yd + 'T00:00:00Z').getUTCDay() === 5 ? addD(yd, -1) : yd; }
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
    var SUBN = { irani: 'UAE dates', citric: 'Citric acid monohydrate' };
    return 'Run-out dates (soonest first):\n' + rs.map(function (x) { if (SUBN[x.r.id] && nowOf(x.r) <= 0.5) return '⚪ ' + x.r.name + ': finished, ' + SUBN[x.r.id] + ' used instead'; var st = x.r.status === 'order' ? '🔴' : x.r.status === 'soon' ? '🟠' : '🟢'; return st + ' ' + x.r.name + ': ' + (x.ro.act ? nice(x.ro.act) : 'not in 26 weeks') + (x.ro.exp && x.ro.exp !== x.ro.act ? ' (' + nice(x.ro.exp) + ' with deliveries)' : ''); }).join('\n') + '\n\n🔴 order now · 🟠 order soon · 🟢 fine';
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
      sm.forEach(function (x) { (p.tests || []).forEach(function (t) { var o = sampleOuts(t, (x.results || {})[t.id]); if (!o) { if (t.kind !== 'micro' && !t.optional && !x.pairOf) miss++; return; } o.forEach(function (q) { if (q.bad) bad++; if (q.txt) { (rng[q.label] = rng[q.label] || { txt: {} }).txt[q.v] = 1; return; } var r = rng[q.label] = rng[q.label] || { lo: q.v, hi: q.v, unit: q.unit, dp: q.dp }; r.lo = Math.min(r.lo, q.v); r.hi = Math.max(r.hi, q.v); }); }); });
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
      var missT = {}; sm.forEach(function (x) { (p.tests || []).forEach(function (t) { if (t.optional || x.pairOf) return; var r = (x.results || {})[t.id], has = r && (r.value != null || (r.in && Object.keys(r.in).some(function (k) { return r.in[k] !== '' && r.in[k] != null; }))); if (has) return; if (t.kind === 'micro') { if (addD(s.date, t.incubDays || 0) >= DATA.today) return; missT[t.name + ' (overdue)'] = (missT[t.name + ' (overdue)'] || 0) + 1; } else missT[t.name] = (missT[t.name] || 0) + 1; }); });
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
    if (onLab) return [['Today in the lab', 'l:today'], ['Yesterday in the lab', 'l:yday'], ['Records for a product…', 'lprod'], ['Gaps and missing results', 'l:gaps'], ['Out of limits (14 days)', 'l:out'], ['Who tested what (7 days)', 'l:who'], ['❓ What can I ask?', 'help']];
    o.push(['🏭 Production', 'prod'], ['📦 Raw materials', 'mat'], ['🗓 Factory plan', 'plan']);
    if (!onLab && lab) o.push(['🧪 Lab', 'lab']);
    o.push(['🔬 Research', 'res'], ['❓ What can I ask?', 'help']);
    return o;
  }
  var HOME = ['🏠 Menu', 'menu'];
  var NODES = {
    menu: function () { return { t: 'What do you want to know?', o: menu() }; },
    help: function () { if (onLab) return { t: 'Here in the lab you can ask, for example:\n• Lab today / yesterday\n• LS results (or GM, BW, RW, water…)\n• Lab gaps / missing results\n• Out of limits\n• Who tested what\n\nI work it out from the lab records, for free.', o: menu() }; return { t: 'Tap a topic, or type a question like:\n• What did we produce yesterday?\n• Line 2 yesterday stoppages\n• When does salt run out?\n• What should I order?\n• Deliveries coming\n• Raw materials for tomorrow\n• Plan next week\n• GM recipe\n• Lot for tomorrow' + (labAllowed() ? '\n• Lab LS results\n• Lab gaps\n• Out of limits' : '') + '\n\nEverything is worked out from the website\'s own numbers, for free.', o: menu() }; },
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
  /* ---------- rich answers: cards, tables and coloured chips instead of long text ---------- */
  var PCOL = { GM: '#b42318', LS: '#c99a06', BW: '#e07b39', RW: '#d6578a', WV: '#6b7a73', FC: '#7c5cd6' };
  function chip(p, size, b, extra) { var c = PCOL[p] || '#5c6e66'; return '<span class="rc-chip" style="--c:' + c + '"><b>' + esc(p) + '</b>' + (size ? ' ' + esc(String(size).replace('ml', ' ml')) : '') + (b != null ? '<i>' + (b === 0 ? 'from tank' : '×' + n(b)) + '</i>' : '') + (extra ? '<i>' + esc(extra) + '</i>' : '') + '</span>'; }
  function head(t, sub) { return '<div class="rc-h">' + t + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; }
  function stat(label, val, cls) { return '<div class="rc-st' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><b>' + val + '</b></div>'; }
  function badge(t, cls) { return '<span class="rc-b ' + (cls || '') + '">' + t + '</span>'; }
  function more(label, inner) { return inner ? '<details class="rc-more"><summary>' + label + '</summary>' + inner + '</details>' : ''; }
  function dayLbl(d) { var t = new Date(d + 'T12:00:00Z'); return '<b>' + t.toLocaleDateString('en-GB', { weekday: 'short' }) + '</b> ' + t.getUTCDate() + ' ' + t.toLocaleDateString('en-GB', { month: 'short' }); }
  function pctBadge(a, f) { if (!f) return ''; var p = Math.round((a - f) / f * 100); return badge((p >= 0 ? '+' : '') + p + '% vs forecast', Math.abs(p) <= 10 ? 'ok' : p > 0 ? 'ok' : 'bad'); }
  /* plan */
  function planDays(q) { var d2 = dayOf(q), week = /week|اسبوع|أسبوع/.test(q), days = []; var start = week ? (/next/.test(q) ? addD(d2, 7 - wd(d2)) : d2) : d2; for (var i = 0; i < (week ? 7 : 1); i++) days.push(addD(start, i)); return days; }
  function planHTML(q) {
    var days = planDays(q), L = lineOf(q), secs = L ? [L] : ['SEC-1', 'SEC-2'];
    var h = head('🗓 Factory plan', days.length > 1 ? nice(days[0]) + ' – ' + nice(days[days.length - 1]) : nice(days[0])) + '<table class="rc-t"><thead><tr><th>Day</th>' + secs.map(function (s) { return '<th>' + secName(s) + '</th>'; }).join('') + '</tr></thead><tbody>';
    days.forEach(function (d) {
      var ld = planDay(d), cls = d === DATA.today ? ' class="today"' : '';
      if (wd(d) === 5) { h += '<tr class="off"><td>' + dayLbl(d) + '</td><td colspan="' + secs.length + '">Day off</td></tr>'; return; }
      h += '<tr' + cls + '><td>' + dayLbl(d) + '</td>' + secs.map(function (s) { var it = ld[s] || []; return '<td>' + (it.length ? it.map(function (x) { return chip(x.product, x.size, x.batches); }).join('') : '<span class="rc-mut">—</span>') + '</td>'; }).join('') + '</tr>';
    });
    return h + '</tbody></table><div class="rc-note">×N = batches to prepare that day · "from tank" = filled from batches already prepared</div>';
  }
  /* production of a day */
  function prodDayHTML(q) {
    var L3 = lineOf(q), dates = DATA.acts.map(function (a) { return a.date; }).filter(Boolean).sort(), dd;
    if (/yesterday|امس|أمس|today|اليوم|\d{1,2}\s*[\/.-]\s*\d{1,2}|\d{1,2}\s*(nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct)|sun|mon|tue|wed|thu|sat/.test(q)) dd = dayOf(q); else dd = dates.filter(function (d) { return d <= DATA.today; }).pop();
    var list = DATA.acts.filter(function (a) { return a.date === dd && (!L3 || (a.sec === 'S1' ? 'SEC-1' : 'SEC-2') === L3); }).sort(function (a, b) { return a.sec < b.sec ? -1 : 1; });
    if (!list.length) return head('🏭 Production · ' + nice(dd)) + '<div class="rc-empty">Nothing entered in the Line Planner for this day' + (L3 ? ' on ' + secName(L3) : '') + '.' + (dates.length ? ' Last day entered: <b>' + nice(dates[dates.length - 1]) + '</b>.' : '') + '</div>';
    var tot = list.reduce(function (s, a) { return s + (+a.boxes || 0); }, 0);
    var h = head('🏭 Production · ' + nice(dd), (list[0].lot ? 'Lot ' + list[0].lot + ' · ' : '') + n(tot) + ' cartons in total');
    list.forEach(function (a) {
      var pl = (DATA.plans || []).filter(function (x) { return x.date === dd && x.sec === a.sec; })[0], po = pl && pl.out, runs = (a.runs && a.runs.length) ? a.runs : [a];
      h += '<div class="rc-card"><div class="rc-ch">' + secName(a.sec) + '<span>' + runs.map(function (r) { return chip(r.product, r.size, null, r.prepOnly ? 'prep only' : null); }).join('') + '</span></div>';
      h += '<div class="rc-big">' + n(a.boxes) + '<small> cartons</small></div>' + (po ? pctBadge(a.boxes, po.boxesP50) : '');
      h += '<div class="rc-sts">' + stat('Filling', n(a.fillMin) + ' min') + stat('Stops', n(a.stopMin) + ' min' + (a.workMin ? ' · ' + Math.round(a.stopMin / a.workMin * 100) + '%' : ''), a.workMin && a.stopMin / a.workMin > 0.2 ? 'bad' : '') + stat('Last carton', a.lastBox || '–') + '</div>';
      var rr = runs.map(function (r) { return '<li>' + chip(r.product, r.size) + ' ' + (r.prepOnly ? n(r.batches) + ' batches prepared, not filled' : n(r.boxes) + ' cartons · ' + n(r.batches) + ' batches prepared' + (r.opening != null ? ' · tank ' + n(r.opening) + ' → ' + n(r.closing) : '')) + '</li>'; }).join('');
      var rs = a.reasons ? String(a.reasons).split(/;\s*/).filter(Boolean).map(function (x) { return '<li>' + esc(x.replace(/\.$/, '')) + '</li>'; }).join('') : '';
      h += more('Runs, stops and notes', '<ul class="rc-ul">' + rr + '</ul>' + (rs ? '<div class="rc-sub">Stop reasons</div><ul class="rc-ul">' + rs + '</ul>' : '') + (a.notes ? '<div class="rc-sub">Notes</div><p class="rc-p">' + esc(a.notes) + '</p>' : '')) + '</div>';
    });
    return h;
  }
  function prodWeekHTML(q) {
    var ws = /last week|الاسبوع الماضي|الأسبوع الماضي/.test(q) ? addD(DATA.today, -7 - wd(DATA.today)) : addD(DATA.today, -wd(DATA.today)), we = addD(ws, 6), L3 = lineOf(q), tot = {}, nd = {}, st = 0, wk = 0;
    DATA.acts.filter(function (a) { return a.date >= ws && a.date <= we && (!L3 || (a.sec === 'S1' ? 'SEC-1' : 'SEC-2') === L3); }).forEach(function (a) { nd[a.date] = 1; st += +a.stopMin || 0; wk += +a.workMin || 0; ((a.runs && a.runs.length) ? a.runs : [a]).forEach(function (r) { if (r.prepOnly) return; var k = r.product + '|' + (r.size || ''); tot[k] = tot[k] || { c: 0, b: 0 }; tot[k].c += +r.boxes || 0; tot[k].b += +r.batches || 0; }); });
    var ks = Object.keys(tot).sort(function (a, b) { return tot[b].c - tot[a].c; });
    if (!ks.length) return head('🏭 Week of ' + nice(ws)) + '<div class="rc-empty">No actuals entered for this week yet.</div>';
    var all = ks.reduce(function (s, k) { return s + tot[k].c; }, 0);
    return head('🏭 Week of ' + nice(ws), Object.keys(nd).length + ' working days entered' + (L3 ? ' · ' + secName(L3) : '')) + '<div class="rc-big">' + n(all) + '<small> cartons</small></div><table class="rc-t"><thead><tr><th>Product</th><th class="r">Cartons</th><th class="r">Batches</th></tr></thead><tbody>' + ks.map(function (k) { var a = k.split('|'); return '<tr><td>' + chip(a[0], a[1]) + '</td><td class="r">' + n(tot[k].c) + '</td><td class="r">' + n(tot[k].b) + '</td></tr>'; }).join('') + '</tbody></table><div class="rc-sts">' + stat('Stops', n(st) + ' min', wk && st / wk > 0.2 ? 'bad' : '') + stat('Of working time', wk ? Math.round(st / wk * 100) + '%' : '–') + '</div>';
  }
  function monthHTML() { var q = 'month'; void q; var m0 = DATA.today.slice(0, 7) + '-01', tot = {}, nd = {}, st = 0, wk = 0, best = null;
    DATA.acts.filter(function (a) { return a.date >= m0 && a.date <= DATA.today; }).forEach(function (a) { nd[a.date] = 1; st += +a.stopMin || 0; wk += +a.workMin || 0; ((a.runs && a.runs.length) ? a.runs : [a]).forEach(function (r) { if (r.prepOnly) return; var k = r.product + '|' + (r.size || ''); tot[k] = tot[k] || { c: 0, b: 0 }; tot[k].c += +r.boxes || 0; tot[k].b += +r.batches || 0; }); if (!best || a.boxes > best.boxes) best = a; });
    var ks = Object.keys(tot).sort(function (a, b) { return tot[b].c - tot[a].c; }); if (!ks.length) return head('🏭 This month') + '<div class="rc-empty">No actuals entered this month yet.</div>';
    var all = ks.reduce(function (s, k) { return s + tot[k].c; }, 0), mx = tot[ks[0]].c;
    return head('🏭 This month so far', Object.keys(nd).length + ' working days') + '<div class="rc-big">' + n(all) + '<small> cartons</small></div>' + ks.map(function (k) { var a = k.split('|'); return '<div class="rc-bar"><span>' + chip(a[0], a[1]) + '</span><i style="width:' + Math.max(4, tot[k].c / mx * 100) + '%;background:' + (PCOL[a[0]] || '#5c6e66') + '"></i><b>' + n(tot[k].c) + '</b></div>'; }).join('') + '<div class="rc-sts">' + stat('Stops', Math.round(wk ? st / wk * 100 : 0) + '% of time', wk && st / wk > 0.2 ? 'bad' : '') + (best ? stat('Best day', nice(best.date) + ' ' + secName(best.sec) + ' · ' + n(best.boxes)) : '') + '</div>';
  }
  function forecastHTML(day) {
    var d = day || DATA.today, ps = (DATA.plans || []).filter(function (x) { return x.date === d; }).sort(function (a, b) { return a.sec < b.sec ? -1 : 1; });
    if (!ps.length) return head('🔮 Forecast · ' + nice(d)) + '<div class="rc-empty">No forecast saved for this day yet. Open the Line Planner and press <b>Save forecast</b>.</div>';
    var h = head('🔮 Forecast · ' + nice(d));
    ps.forEach(function (p) { var o = p.out || {}, ins = (p.inputs && p.inputs.runs) || [], act = DATA.acts.filter(function (a) { return a.date === d && a.sec === p.sec; })[0];
      h += '<div class="rc-card"><div class="rc-ch">' + secName(p.sec) + '<span>' + ins.map(function (r) { return chip(r.product, r.size); }).join('') + '</span></div><div class="rc-big">≈ ' + n(o.boxesP50) + '<small> cartons</small></div><div class="rc-note">likely between ' + n(o.boxesP10) + ' and ' + n(o.boxesP90) + '</div>' +
        '<div class="rc-sts">' + stat('Tank + new', ins.map(function (r) { return n(r.openingResolved != null ? r.openingResolved : r.opening) + ' + ' + n(r.batches || 0); }).join(', ')) + stat('Last carton', o.finish || '–') + stat('Left in tank', n(o.closingBatches) + ' bt') + '</div>' + (act ? '<div class="rc-note">Actual: <b>' + n(act.boxes) + '</b> cartons</div>' : '') + '</div>'; });
    return h;
  }
  /* materials */
  function stCls(r) { return r.status === 'order' ? 'bad' : r.status === 'soon' ? 'warn' : 'ok'; }
  function matHTML(r) {
    var ro = runOuts(r), x = DATA.fc.model.materials.filter(function (y) { return y.id === r.id; })[0] || {}, k = x.recipeFactor > 1 ? x.recipeFactor : null, now = nowOf(r);
    var SUBN = { irani: 'UAE dates', citric: 'Citric acid monohydrate' }, done = SUBN[r.id] && now <= 0.5;
    var dl = (r.openOrders || []).filter(function (o) { return o.eta >= DATA.today; });
    return '<div class="rc-card"><div class="rc-ch">📦 ' + esc(r.name) + '<span class="rc-mut">' + esc(r.unit) + (k ? ' · 1 = ' + k + ' ' + esc(x.recipeUnit) : '') + '</span></div>' +
      (done ? '<div class="rc-big">0<small> ' + esc(r.unit) + '</small></div>' + badge('Finished · ' + SUBN[r.id] + ' used instead', 'warn') :
      '<div class="rc-big">' + n(now) + '<small> ' + esc(r.unit) + ' now</small></div>' + badge(r.status === 'order' ? 'Order now' : r.orderBy ? 'Order by ' + nice(r.orderBy) : 'Enough stock', stCls(r)) +
      '<div class="rc-sts">' + stat('Runs out', ro.act ? nice(ro.act) : '26 wk +', stCls(r)) + stat('Use / working day', n(r.perDay)) + stat('Lead time', (x.leadMinDays || '–') + ' days') + '</div>') +
      (dl.length ? '<div class="rc-sub">Deliveries coming</div><ul class="rc-ul">' + dl.map(function (o) { return '<li><b>' + nice(o.eta) + '</b> · +' + n(o.qty) + ' ' + esc(r.unit) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="rc-note">Counted ' + n(r.stockCounted) + ' on ' + nice((DATA.fc.model.stock[r.id] || {}).asOf) + (ro.exp && ro.exp !== ro.act ? ' · runs out ' + nice(ro.exp) + ' if deliveries arrive' : '') + (x.orderVia ? ' · ordered via ' + esc(x.orderVia) : '') + '</div></div>';
  }
  function rowList(title, sub, rows) { return head(title, sub) + '<div class="rc-list">' + rows.join('') + '</div>'; }
  function orderHTML() {
    var lst = DATA.fc.results.filter(function (r) { return r.status === 'order' || r.status === 'soon'; }).sort(function (a, b) { return (a.orderBy || '0') < (b.orderBy || '0') ? -1 : 1; });
    var SUBN = { irani: 1, citric: 1 }; lst = lst.filter(function (r) { return !(SUBN[r.id] && nowOf(r) <= 0.5); });
    if (!lst.length) return head('🛒 What to order') + '<div class="rc-empty">Nothing needs ordering right now. ✔</div>';
    return rowList('🛒 What to order', lst.length + ' materials', lst.map(function (r) { var ro = runOuts(r); return '<div class="rc-row"><i class="dot ' + stCls(r) + '"></i><div><b>' + esc(r.name) + '</b><small>runs out ' + (ro.act ? nice(ro.act) : '–') + (r.suggestedQty ? ' · order ≈ ' + n(r.suggestedQty) + ' ' + esc(r.unit) : '') + '</small></div>' + badge(r.status === 'order' ? 'Now' : 'By ' + nice(r.orderBy), stCls(r)) + '</div>'; }));
  }
  function runoutHTML() {
    var SUBN = { irani: 'UAE dates', citric: 'monohydrate' };
    var rs = DATA.fc.results.filter(function (r) { return r.active; }).map(function (r) { return { r: r, ro: runOuts(r) }; }).sort(function (a, b) { return (a.ro.act || '9') < (b.ro.act || '9') ? -1 : 1; });
    return rowList('⏳ Run-out dates', 'soonest first', rs.map(function (x) { var done = SUBN[x.r.id] && nowOf(x.r) <= 0.5; return '<div class="rc-row"><i class="dot ' + (done ? 'idle' : stCls(x.r)) + '"></i><div><b>' + esc(x.r.name) + '</b>' + (done ? '<small>finished · ' + SUBN[x.r.id] + ' used instead</small>' : x.ro.exp && x.ro.exp !== x.ro.act ? '<small>' + nice(x.ro.exp) + ' if deliveries arrive</small>' : '') + '</div>' + (done ? badge('Finished', 'idle') : badge(x.ro.act ? nice(x.ro.act) : '26 wk +', stCls(x.r))) + '</div>'; })) + '<div class="rc-note"><i class="dot bad"></i> order now <i class="dot warn"></i> order soon <i class="dot ok"></i> fine</div>';
  }
  function delivHTML(mats) {
    var oo = []; DATA.fc.results.forEach(function (r) { if (mats && mats.length && mats.indexOf(r) < 0) return; (r.openOrders || []).forEach(function (o) { if (o.eta >= DATA.today) oo.push({ r: r, o: o }); }); });
    oo.sort(function (a, b) { return a.o.eta < b.o.eta ? -1 : 1; });
    if (!oo.length) return head('🚚 Deliveries coming') + '<div class="rc-empty">No open deliveries with a date.</div>';
    return rowList('🚚 Deliveries coming', oo.length + ' expected', oo.map(function (x) { return '<div class="rc-row"><i class="dot ok"></i><div><b>' + esc(x.r.name) + '</b><small>+' + n(x.o.qty) + ' ' + esc(x.r.unit) + '</small></div>' + badge(nice(x.o.eta), '') + '</div>'; }));
  }
  function rawDayHTML(q) {
    var d1 = dayOf(q), ld = planDay(d1), L = lineOf(q), need = {}, runs = [], m = DATA.fc.model;
    ['SEC-1', 'SEC-2'].filter(function (s) { return !L || s === L; }).forEach(function (s) { (ld[s] || []).forEach(function (x) { runs.push([s, x]); var r = (m.recipes[x.product] || {})[s] || {}; Object.keys(r).forEach(function (k) { need[k] = (need[k] || 0) + (Number(r[k]) || 0) * x.batches; }); }); });
    if (!runs.length) return head('🧺 Raw materials · ' + nice(d1)) + '<div class="rc-empty">Nothing in the factory plan for this day.</div>';
    var ks = Object.keys(need).filter(function (k) { return need[k] > 0; });
    return head('🧺 Raw materials · ' + nice(d1), 'from the factory plan') + '<div class="rc-chips">' + runs.map(function (x) { return '<span class="rc-mut">' + (x[0] === 'SEC-1' ? 'L1' : 'L2') + '</span>' + chip(x[1].product, x[1].size, x[1].batches); }).join(' ') + '</div><table class="rc-t"><thead><tr><th>Material</th><th class="r">Amount</th></tr></thead><tbody>' + ks.map(function (k) { var x = m.materials.filter(function (y) { return y.id === k; })[0] || { name: k, unit: '' }, f = x.recipeFactor || 1; return '<tr><td>' + esc(x.name) + '</td><td class="r"><b>' + n(need[k] * f) + '</b> ' + esc(x.recipeUnit || x.unit) + (f !== 1 ? '<br><small class="rc-mut">' + n(need[k]) + ' ' + esc(x.unit) + '</small>' : '') + '</td></tr>'; }).join('') + '</tbody></table>';
  }
  function recipeHTML(q) {
    var m = DATA.fc.model, ps = Object.keys(PNAME).filter(function (p) { return q.indexOf(p.toLowerCase()) >= 0 || q.indexOf(PNAME[p].toLowerCase()) >= 0 || (p === 'GM' && /grenadine|دبس/.test(q)) || (p === 'LS' && /lemon/.test(q)) || (p === 'BW' && /blossom/.test(q)) || (p === 'RW' && /rose/.test(q)) || (p === 'WV' && /vinegar/.test(q)); });
    return (ps.length ? ps : ['GM']).map(function (p) { var r = m.recipes[p] || {}, ks = {}; ['SEC-1', 'SEC-2'].forEach(function (s) { Object.keys(r[s] || {}).forEach(function (k) { if (r[s][k] > 0) ks[k] = 1; }); });
      return head('📋 ' + chip(p) + ' ' + esc(PNAME[p]) + ' recipe', 'per batch') + '<table class="rc-t"><thead><tr><th>Material</th><th class="r">Line 1</th><th class="r">Line 2</th></tr></thead><tbody>' + Object.keys(ks).map(function (k) { var x = m.materials.filter(function (y) { return y.id === k; })[0] || { name: k, unit: '', recipeFactor: 1 }, f = x.recipeFactor || 1, u = esc(x.recipeUnit || x.unit); return '<tr><td>' + esc(x.name) + '</td><td class="r">' + n(((r['SEC-1'] || {})[k] || 0) * f) + ' ' + u + '</td><td class="r">' + n(((r['SEC-2'] || {})[k] || 0) * f) + ' ' + u + '</td></tr>'; }).join('') + '</tbody></table>'; }).join('');
  }
  function stopsHTML(days) {
    var from = addD(DATA.today, -days), agg = {}, tot = 0;
    DATA.acts.filter(function (a) { return a.date >= from && a.reasons; }).forEach(function (a) { String(a.reasons).split(/;\s*/).forEach(function (part) { var m = part.match(/^\s*(.+?)\s+(\d+)\s*min/i); if (!m) return; var k = m[1].trim(); k = k.charAt(0).toUpperCase() + k.slice(1); var planned = /arrangement|start-?up|cleaning|cip|changeover/i.test(k); if (planned) k = /clean|cip/i.test(k) ? 'Cleaning / CIP' : /changeover/i.test(k) ? 'Changeover' : 'Start-up & arrangement'; agg[k] = agg[k] || { min: 0, n: 0, pl: planned }; agg[k].min += +m[2]; agg[k].n++; tot += +m[2]; }); });
    var mach = Object.keys(agg).filter(function (k) { return !agg[k].pl; }).sort(function (a, b) { return agg[b].min - agg[a].min; }).slice(0, 8), pl = Object.keys(agg).filter(function (k) { return agg[k].pl; });
    if (!mach.length && !pl.length) return head('⛔ Stop reasons') + '<div class="rc-empty">No stop reasons written in the last ' + days + ' days.</div>';
    var mx = mach.length ? agg[mach[0]].min : 1, mt = mach.reduce(function (s, k) { return s + agg[k].min; }, 0);
    return head('⛔ Machine stops to fix first', 'last ' + days + ' days') + mach.map(function (k) { return '<div class="rc-bar"><span>' + esc(k) + '</span><i style="width:' + Math.max(4, agg[k].min / mx * 100) + '%"></i><b>' + n(agg[k].min) + ' min</b></div>'; }).join('') +
      '<div class="rc-sts">' + stat('Machine stops', n(mt) + ' min', 'bad') + pl.map(function (k) { return stat(k, n(agg[k].min) + ' min'); }).join('') + '</div>';
  }
  function accHTML(days) {
    var from = addD(DATA.today, -days), rows = [];
    DATA.acts.filter(function (a) { return a.date >= from && a.date < DATA.today && a.boxes > 0; }).forEach(function (a) { var p = (DATA.plans || []).filter(function (x) { return x.date === a.date && x.sec === a.sec; })[0]; if (p && p.out && p.out.boxesP50) rows.push({ d: a.date, s: a.sec, act: a.boxes, fc: p.out.boxesP50, lo: p.out.boxesP10, hi: p.out.boxesP90 }); });
    if (!rows.length) return head('🎯 Forecast accuracy') + '<div class="rc-empty">No days with both a saved forecast and an actual yet.</div>';
    var err = rows.reduce(function (s, r) { return s + Math.abs(r.act - r.fc) / r.act; }, 0) / rows.length, inR = rows.filter(function (r) { return r.act >= r.lo && r.act <= r.hi; }).length;
    rows.sort(function (a, b) { return a.d < b.d ? 1 : -1; });
    return head('🎯 Forecast accuracy', 'last ' + days + ' days · ' + rows.length + ' line-days') + '<div class="rc-big">' + Math.round((1 - err) * 100) + '%<small> accurate</small></div><div class="rc-note">' + inR + ' of ' + rows.length + ' days landed inside the forecast range</div>' +
      more('Day by day', '<table class="rc-t"><thead><tr><th>Day</th><th class="r">Actual</th><th class="r">Forecast</th><th class="r">Diff</th></tr></thead><tbody>' + rows.slice(0, 12).map(function (r) { var p = Math.round((r.act - r.fc) / r.fc * 100); return '<tr><td>' + nice(r.d) + ' · ' + (r.s === 'S1' ? 'L1' : 'L2') + '</td><td class="r">' + n(r.act) + '</td><td class="r">' + n(Math.round(r.fc)) + '</td><td class="r ' + (Math.abs(p) > 15 ? 'neg' : 'pos') + '">' + (p >= 0 ? '+' : '') + p + '%</td></tr>'; }).join('') + '</tbody></table>');
  }
  /* lab */
  function labTodayHTML(day) {
    var d = day || DATA.today, ss = LAB.ses.filter(function (s) { return s.date === d; }), sent = LAB.db[d] || {};
    var h = head('🧪 Lab · ' + nice(d)) + (Object.keys(sent).length ? '<div class="rc-chips"><span class="rc-mut">Batches sent:</span> ' + Object.keys(sent).map(function (k) { var a = k.split('|'); return chip(a[0], a[1] === 'SEC-1' ? 'L1' : a[1] === 'SEC-2' ? 'L2' : '', sent[k]); }).join(' ') + '</div>' : '');
    if (!ss.length) return h + '<div class="rc-empty">No lab sessions opened yet.</div>';
    return h + '<table class="rc-t"><thead><tr><th>Product</th><th class="r">Samples</th><th class="r">Tested</th><th>Status</th></tr></thead><tbody>' + ss.map(function (s) { var p = LAB.prod[s.productId] || { name: s.productId, tests: [] }, sm = LAB.sam.filter(function (x) { return x.sessionId === s.id; }), done = sm.filter(function (x) { return x.testedAt; }).length, bad = 0; sm.forEach(function (x) { (p.tests || []).forEach(function (t) { (sampleOuts(t, (x.results || {})[t.id]) || []).forEach(function (o) { if (o.bad) bad++; }); }); });
      return '<tr><td>' + chip(s.productId, s.section === 'SEC-1' ? 'L1' : s.section === 'SEC-2' ? 'L2' : 'lab') + '</td><td class="r">' + sm.length + '/' + (s.batches || 0) + '</td><td class="r">' + done + '</td><td>' + (bad ? badge('⚠ ' + bad + ' out', 'bad') : '') + badge(s.validated ? '✔ validated' : 'open', s.validated ? 'ok' : 'warn') + '</td></tr>'; }).join('') + '</tbody></table>';
  }
  function labProdHTML(pid) {
    var p = LAB.prod[pid]; if (!p) return '<div class="rc-empty">Unknown product.</div>';
    var ss = LAB.ses.filter(function (s) { return s.productId === pid && LAB.sam.some(function (x) { return x.sessionId === s.id; }); }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 5);
    if (!ss.length) return head('🧪 ' + esc(p.name)) + '<div class="rc-empty">No lab records yet.</div>';
    var labels = [], data = ss.map(function (s) { var rng = {}, bad = 0, miss = 0; LAB.sam.filter(function (x) { return x.sessionId === s.id; }).forEach(function (x) { (p.tests || []).forEach(function (t) { var o = sampleOuts(t, (x.results || {})[t.id]); if (!o) { if (t.kind !== 'micro' && !t.optional && !x.pairOf) miss++; return; } o.forEach(function (q) { if (q.bad) bad++; if (labels.indexOf(q.label) < 0) labels.push(q.label); if (q.txt) { (rng[q.label] = rng[q.label] || { txt: {} }).txt[q.v] = 1; return; } var r = rng[q.label] = rng[q.label] || { lo: q.v, hi: q.v, dp: q.dp, bad: false }; r.lo = Math.min(r.lo, q.v); r.hi = Math.max(r.hi, q.v); if (q.bad) r.bad = true; }); }); }); return { s: s, rng: rng, bad: bad, miss: miss }; });
    labels = labels.filter(function (l) { return !/^Acidity (mono|anh)/i.test(l) || !labels.some(function (x) { return /^Corrected/.test(x); }); }).slice(0, 6);
    var f = function (r) { if (!r) return '<span class="rc-mut">–</span>'; if (r.txt) return Object.keys(r.txt).map(function (t) { return /accept/i.test(t) ? '✔' : esc(t); }).join(' '); var o = function (v) { return Number(v).toLocaleString('en-US', { maximumFractionDigits: r.dp }); }; return '<span' + (r.bad ? ' class="neg"' : '') + '>' + (r.lo === r.hi ? o(r.lo) : o(r.lo) + '–' + o(r.hi)) + '</span>'; };
    return head('🧪 ' + esc(p.name), 'last ' + ss.length + ' sessions · ranges across the batches') + '<div class="rc-scroll"><table class="rc-t"><thead><tr><th>Day</th>' + labels.map(function (l) { return '<th class="r">' + esc(l.replace('Corrected ', 'Corr. ').replace('Taste, smell, appearance', 'Sensory')) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' + data.map(function (x) { return '<tr><td>' + nice(x.s.date) + '<br><small class="rc-mut">' + (x.s.section === 'SEC-1' ? 'L1' : x.s.section === 'SEC-2' ? 'L2' : 'lab') + '</small></td>' + labels.map(function (l) { return '<td class="r">' + f(x.rng[l]) + '</td>'; }).join('') + '<td>' + (x.bad ? badge('⚠', 'bad') : '') + (x.miss ? badge('⏳ ' + x.miss, 'warn') : '') + (x.s.validated ? badge('✔', 'ok') : '') + '</td></tr>'; }).join('') + '</tbody></table></div><div class="rc-note">✔ validated · ⏳ results missing · ⚠ out of limits (shown in red)</div>';
  }
  function labGapsHTML() {
    var txt = labGaps(), lines = txt.split('\n').filter(function (l) { return /^•/.test(l); }), last = (txt.match(/Last checks: (.*)/) || [])[1];
    var h = head('🔎 Lab gaps', 'last 14 days');
    if (!lines.length) h += '<div class="rc-empty">No gaps. ✔</div>';
    else h += '<div class="rc-list">' + lines.map(function (l) { var m = l.replace(/^•\s*/, '').match(/^(\d+ \w+) (.+?): (.*)$/) || [0, '', l, '']; return '<div class="rc-row top"><i class="dot warn"></i><div><b>' + esc(m[1]) + ' · ' + esc(m[2]) + '</b><small>' + m[3].split(/, /).map(function (x) { return '<span class="rc-tag">' + esc(x) + '</span>'; }).join(' ') + '</small></div></div>'; }).join('') + '</div>';
    return h + (last ? '<div class="rc-note">Last checks · ' + esc(last) + '</div>' : '');
  }
  function labOutHTML(days) {
    var from = addD(DATA.today, -days), rows = [];
    LAB.sam.filter(function (x) { return (x.date || '') >= from; }).forEach(function (x) { var p = LAB.prod[x.productId]; if (!p) return; (p.tests || []).forEach(function (t) { (sampleOuts(t, (x.results || {})[t.id]) || []).forEach(function (o) { if (o.bad) rows.push({ d: x.date, p: x.productId, c: x.code, o: o }); }); }); });
    if (!rows.length) return head('⚠ Out of limits', 'last ' + days + ' days') + '<div class="rc-empty">Nothing out of limits. ✔</div>';
    return head('⚠ Out of limits', rows.length + ' results · last ' + days + ' days') + '<table class="rc-t"><thead><tr><th>Day</th><th>Sample</th><th>Result</th><th class="r">Value</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td>' + nice(r.d) + '</td><td>' + chip(r.p) + ' ' + esc(r.c || '') + '</td><td>' + esc(r.o.label) + '</td><td class="r neg">' + esc(fmtV(r.o)) + '<br><small class="rc-mut">limit ' + esc(r.o.lim.trim()) + '</small></td></tr>'; }).join('') + '</tbody></table>';
  }
  function labWhoHTML(days) { var t = labWho(days), rows = t.split('\n').filter(function (l) { return /^•/.test(l); }); if (!rows.length) return head('👩‍🔬 Who tested') + '<div class="rc-empty">' + esc(t) + '</div>'; var c = rows.map(function (l) { var m = l.match(/^• (.+): (\d+)$/); return [m[1], +m[2]]; }), mx = c[0][1]; return head('👩‍🔬 Samples tested', 'last ' + days + ' days') + c.map(function (x) { return '<div class="rc-bar"><span>' + esc(x[0]) + '</span><i style="width:' + Math.max(4, x[1] / mx * 100) + '%"></i><b>' + x[1] + '</b></div>'; }).join(''); }
  /* route a typed or tapped question to a rich card (or null) */
  function rich(q0) {
    var q = q0.toLowerCase(), mats = findMats(q), has = function (re) { return re.test(q); };
    if (has(/\blot\b|لوت/)) return null;
    if (has(/produc|made|carton|ctn|boxes|box\b|stop|stoppage|downtime|filled|what happened|انتجنا|أنتجنا|كراتين|كرتون|توقف|عملنا/) && !has(/plan|will|next|tomorrow|going to|خطة|بكرا|غدا/)) return has(/week|اسبوع|أسبوع/) ? prodWeekHTML(q) : prodDayHTML(q);
    if (has(/recipe|وصفة|وصفه/)) return recipeHTML(q);
    if (has(/prepare|preparation|raw material.*(for|on|today|tomorrow)|materials? (for|on)|نحضر|تحضير/) && !mats.length) return rawDayHTML(q);
    if (has(/plan|line\s*[12]|running|run on|what.*(make|made)|خطة|ننتج|خط/) && !mats.length) return planHTML(q);
    if (has(/deliver|arriv|coming|incoming|شحن|وصول|طلبية/) && !has(/should|need to|what to order|نطلب/)) return delivHTML(mats);
    if (has(/what.*order|should.*order|need to order|order now|buy|نطلب|اطلب/) && !mats.length) return orderHTML();
    if (mats.length) return mats.map(matHTML).join('');
    return null;
  }
  async function run(act) {
    await context();
    if (onLab && !/^(l:|lp:|lab$|lprod$|menu$|help$)/.test(act)) return { t: 'Here in the lab I can help with lab records. Production and stock are on the production pages.', o: menu() };
    if (NODES[act]) { if (/^(lab|lprod)$/.test(act) && labAllowed()) await labLoad(); return NODES[act](); }
    var k = act.slice(0, act.indexOf(':')), v = act.slice(act.indexOf(':') + 1), t = null, h = null;
    if (k === 'q') { h = rich(v); if (!h) t = localAnswer(v); }
    else if (k === 'm') { var r = DATA.fc.results.filter(function (x) { return x.id === v; })[0]; h = r ? matHTML(r) : null; }
    else if (k === 'f') h = v === 'today' ? forecastHTML() : v === 'month' ? monthHTML() : v === 'stops' ? stopsHTML(30) : v === 'acc' ? accHTML(21) : runoutHTML();
    else if (k === 'l' || k === 'lp') { if (!labAllowed()) return NODES.lab(); await labLoad(); h = k === 'lp' ? labProdHTML(v) : v === 'today' ? labTodayHTML() : v === 'yday' ? labTodayHTML(prevWork(DATA.today)) : v === 'gaps' ? labGapsHTML() : v === 'out' ? labOutHTML(14) : labWhoHTML(7); }
    else if (k === 'r') t = await research();
    return { t: t || (h ? '' : 'Nothing to show for that yet.'), h: h, o: follow(act) };
  }
  function prevWork(d) { var x = addD(d, -1); if (wd(x) === 5) x = addD(x, -1); return x; }
  /* ---------- conversation: small talk, typos, follow-ups ---------- */
  var MEM = { last: null };
  var VOCAB = ['produce', 'produced', 'production', 'yesterday', 'tomorrow', 'today', 'order', 'deliveries', 'delivery', 'coming', 'sugar', 'salt', 'citric', 'iraqi', 'irani', 'caramel', 'pomegranate', 'sorbate', 'acetic', 'turbid', 'recipe', 'plan', 'lab', 'stoppage', 'stoppages', 'cartons', 'materials', 'material', 'section', 'line', 'week', 'month', 'forecast', 'results', 'missing', 'grenadine', 'lemon', 'blossom', 'vinegar', 'water', 'research', 'stock', 'runs', 'when', 'what', 'should', 'prepare', 'raw', 'accuracy', 'reasons'];
  function lev(a, b) { var m = a.length, n2 = b.length, d = []; for (var i = 0; i <= m; i++) { d[i] = [i]; } for (var j = 1; j <= n2; j++) d[0][j] = j; for (i = 1; i <= m; i++) for (j = 1; j <= n2; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n2]; }
  function fixTypos(q) { return q.replace(/[a-z]{4,}/g, function (w) { if (VOCAB.indexOf(w) >= 0) return w; var best = null, bd = 9; VOCAB.forEach(function (v) { if (Math.abs(v.length - w.length) > 2) return; var dd = lev(w, v); if (dd < bd) { bd = dd; best = v; } }); return best && bd <= (w.length >= 7 ? 2 : 1) ? best : w; }); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function first() { return (((A.profile || {}).full_name || '').split(' ')[0]) || ''; }
  function smalltalk(q, ar) {
    var nm = first(), h = new Date().getHours(), tod = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    if (/^(hi|hello|hey|hii+|yo|salam|salaam|good (morning|afternoon|evening)|morning)\b|^(مرحبا|السلام|هلا|اهلا|أهلا|صباح|مساء)/.test(q)) return { t: ar ? 'أهلا ' + nm + '! 👋 كيف فيني ساعدك اليوم؟' : pick([tod + ', ' + nm + '! 👋 What do you want to know today?', 'Hello ' + nm + '! 😊 What can I check for you?', 'Hi ' + nm + '! Ready when you are. Pick a topic or just ask.']), o: menu() };
    if (/how are you|how r u|how's it going|كيفك|كيف حالك|شو الاخبار/.test(q)) return { t: ar ? 'تمام الحمدلله! وانت؟ شو بدك تعرف اليوم؟' : pick(['All good, thanks for asking! 😊 How about you? What shall we look at?', 'Doing great, the numbers are fresh. What do you need?']), o: menu() };
    if (/^(thanks|thank you|thx|ty|great|perfect|nice|good job|bravo|awesome|cool|ok(ay)?|شكرا|يسلمو|تسلم|ممتاز)\b/.test(q)) return { t: ar ? 'العفو! 🙏 بدك شي تاني؟' : pick(['You\'re welcome! 🙌 Anything else?', 'Anytime! Want to check something else?', 'Glad it helps. What next?']), o: [HOME] };
    if (/who are you|what are you|your name|شو اسمك|مين انت/.test(q)) return { t: 'I\'m Ask ATIC, the website\'s own assistant. I read the same numbers as the pages (' + (onLab ? 'the lab records' : 'stock, forecast, factory plan, Line Planner, recipes' + (labAllowed() ? ', the lab' : '')) + ') and answer instantly, for free, without sending anything outside.', o: menu() };
    if (/what can you do|help|what can i ask|options|ساعدني|شو بتعرف/.test(q)) return NODES.help();
    if (/^(bye|goodbye|see you|later|باي|مع السلامة)/.test(q)) return { t: pick(['Bye ' + nm + '! 👋', 'See you, ' + nm + '!', 'Take care! I\'m here whenever you need me.']), o: null };
    return null;
  }
  function followUp(q) {
    if (!MEM.last || q.split(/\s+/).length > 6 || !/^(and|what about|how about|same for|also|و|وال|طيب)/.test(q) && !/^(line|section|tomorrow|yesterday|today|next week|this week)\b/.test(q)) return null;
    var last = MEM.last, rest = q.replace(/^(and|what about|how about|same for|also|طيب|و)\s*/, '');
    if (DATA && findMats(rest).length && /run|stock|order|use|now|have|deliver|much/.test(last)) return rest + ' stock';
    var out = last;
    var ln = rest.match(/(line|section|sec)\s*[12]/); if (ln) out = out.replace(/(line|section|sec)\s*[12]/g, '').trim() + ' ' + ln[0];
    var dy = rest.match(/today|tomorrow|yesterday|next week|this week|last week|\d{1,2}\s*[\/.-]\s*\d{1,2}/); if (dy) out = out.replace(/today|tomorrow|yesterday|next week|this week|last week|\d{1,2}\s*[\/.-]\s*\d{1,2}/g, '').trim() + ' ' + dy[0];
    if (LAB && /lab|results/.test(last)) { var pp = (LAB.cfg.products || []).filter(function (p) { return rest.indexOf(p.id.toLowerCase()) >= 0 || rest.indexOf(p.name.toLowerCase().split(' ')[0]) >= 0; })[0]; if (pp) out = 'lab ' + pp.id.toLowerCase() + ' results'; }
    return out !== last || ln || dy ? out : null;
  }
  async function typed(q0) {
    await context();
    var raw = q0.toLowerCase().trim().replace(/[?!.،]+$/, ''), ar = /[؀-ۿ]/.test(q0);
    var greet = /^(hi|hello|hey|salam|good (morning|afternoon|evening)|مرحبا|هلا|اهلا)[\s,!]+/;
    if (raw.split(/\s+/).length > 3 && greet.test(raw)) raw = raw.replace(greet, '').replace(/^(claude|atic|ask atic)[\s,]*/, '');
    var st = raw.split(/\s+/).length <= 5 ? smalltalk(raw, ar) : null; if (st) return st;
    var q = fixTypos(raw), fu = followUp(q); if (fu) q = fu;
    if (q !== raw) q0 = q;
    MEM.last = q;
    if (onLab) { if (!labAllowed()) return { t: 'Not available here.', o: null }; if (!/\blab\b|مختبر/.test(q)) q = 'lab ' + q; }
    if (/\blab\b|مختبر|sample|عينة|results?\b|out of (spec|limit)|validat/.test(q)) {
      if (!labAllowed()) return { t: 'The lab topics are for the doctor and the admins.', o: menu() };
      await labLoad();
      var pid = (LAB.cfg.products || []).filter(function (p) { return q.indexOf(p.id.toLowerCase()) >= 0 || q.indexOf(p.name.toLowerCase()) >= 0 || (p.id === 'GM' && /grenadine|دبس/.test(q)) || (p.id === 'LS' && /lemon/.test(q)) || (p.id === 'WTR' && /water\b/.test(q) && !/rose|blossom/.test(q)); })[0];
      if (/gap|missing|pending|overdue|ناقص/.test(q)) return run('l:gaps');
      if (/out of|limit|spec|fail|bad/.test(q)) return run('l:out');
      if (/who|tested by/.test(q)) return run('l:who');
      if (pid) return run('lp:' + pid.id);
      if (/yesterday|امس/.test(q)) return run('l:yday');
      if (/today|now|اليوم/.test(q) || q === 'lab') return run('l:today');
      return { t: onLab ? 'I didn\'t catch that. Here is what I can show you in the lab:' : 'Here is what I can show you about the lab:', o: NODES.lab().o };
    }
    if (/research|trial|experiment|بحث/.test(q)) return run('r:list');
    if (/forecast/.test(q) && /today|اليوم/.test(q)) return run('f:today');
    if (/stop reason|top stop|why.*stop|most stop/.test(q)) return run('f:stops');
    if (/accura|how good|forecast vs/.test(q)) return run('f:acc');
    if (/month|شهر/.test(q) && /produc|carton|كرتون/.test(q)) return run('f:month');
    if (/run.?out|ينفذ|يخلص/.test(q) && !findMats(q).length) return run('f:runout');
    var rh = rich(q0); if (rh) return { h: rh, o: follow('q:' + q) };
    var a = localAnswer(q0);
    if (a) return { t: a, o: follow('q:' + q) };
    /* not matched: never a dead end, show the closest topics */
    var guess = /produc|carton|line|stop|كرتون|انتاج/.test(q) ? 'prod' : /order|stock|material|مواد|طلب/.test(q) ? 'mat' : /plan|خطة/.test(q) ? 'plan' : 'menu';
    var nd = NODES[guess]();
    return { t: 'I don\'t have an exact answer for that, but here is what I can show you. Tap one:', o: nd.o };
  }

  /* ---------- the chat window ---------- */
  var css = '.asst-btn{position:fixed;left:18px;bottom:18px;z-index:60;border:0;border-radius:999px;padding:12px 18px;font:600 15px var(--f-body);color:#fff;background:linear-gradient(135deg,#0f4c3a,#2a7a5b);box-shadow:0 10px 24px rgba(8,42,32,.35);cursor:pointer}' +
    '.asst{position:fixed;left:18px;bottom:76px;z-index:61;width:min(480px,calc(100vw - 36px));height:min(640px,calc(100vh - 110px));background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden}' +
    '.asst header{padding:12px 14px;background:linear-gradient(135deg,#0f4c3a,#2a7a5b);color:#fff;display:flex;justify-content:space-between;align-items:center}.asst header b{font:600 15px var(--f-display)}.asst header button{background:none;border:0;color:#fff;font-size:20px;cursor:pointer;margin-left:6px}' +
    '.asst .log{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}.asst .m{max-width:90%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap}.asst .u{align-self:flex-end;background:var(--brand);color:var(--brand-ink)}.asst .a{align-self:flex-start;background:var(--surface-2)}.asst .e{align-self:flex-start;background:var(--red-soft);color:var(--red)}' +
    '.asst .opts{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:96%}.asst .opts button{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:6px 11px;font-size:13px;cursor:pointer;color:var(--ink)}.asst .opts button:hover{border-color:var(--brand);color:var(--brand)}.asst .opts.old button{opacity:.55}' +
    '.asst form{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line)}.asst input{flex:1;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--ink);font:15px var(--f-body)}.asst form button{border:0;border-radius:12px;padding:0 16px;background:var(--brand);color:var(--brand-ink);font-weight:600;cursor:pointer}' +
    '.asst .m.rc{max-width:100%;width:100%;white-space:normal;background:var(--surface);border:1px solid var(--line);padding:10px 12px}' +
    '.rc-h{font:600 15px var(--f-display);margin-bottom:6px;display:flex;flex-direction:column}.rc-h small{font:400 12px var(--f-body);color:var(--muted);margin-top:1px}' +
    '.rc-chip{display:inline-flex;align-items:center;gap:4px;border-radius:8px;padding:2px 7px;margin:2px 3px 2px 0;font-size:12.5px;background:color-mix(in srgb,var(--c) 12%,transparent);color:var(--c);border:1px solid color-mix(in srgb,var(--c) 30%,transparent);white-space:nowrap}.rc-chip i{font-style:normal;font-weight:600;color:var(--ink);opacity:.85}' +
    '.rc-t{width:100%;border-collapse:collapse;font-size:13px;margin:4px 0}.rc-t th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);text-align:left;padding:4px 6px;border-bottom:1px solid var(--line)}.rc-t td{padding:6px;border-bottom:1px solid var(--line);vertical-align:top}.rc-t tr:last-child td{border-bottom:0}.rc-t .r{text-align:right;white-space:nowrap}.rc-t tr.today td{background:var(--gold-soft)}.rc-t tr.off td{color:var(--muted);background:var(--surface-2);font-size:12px}' +
    '.rc-card{border:1px solid var(--line);border-radius:12px;padding:10px;margin:8px 0;background:var(--bg)}.rc-ch{display:flex;justify-content:space-between;align-items:center;gap:6px;font-weight:600;font-size:13.5px;flex-wrap:wrap}' +
    '.rc-big{font:600 26px var(--f-display);margin:4px 0 2px;line-height:1.1}.rc-big small{font:500 13px var(--f-body);color:var(--muted)}' +
    '.rc-sts{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:6px;margin-top:8px}.rc-st{background:var(--surface-2);border-radius:9px;padding:6px 8px}.rc-st span{display:block;font-size:11px;color:var(--muted)}.rc-st b{font-size:13.5px}.rc-st.bad b{color:var(--red)}.rc-st.warn b{color:var(--amber)}.rc-st.ok b{color:var(--green)}' +
    '.rc-b{display:inline-block;font-size:11.5px;font-weight:600;border-radius:999px;padding:2px 9px;margin:2px 4px 2px 0;background:var(--surface-2);color:var(--ink)}.rc-b.ok{background:var(--green-soft);color:var(--green)}.rc-b.bad{background:var(--red-soft);color:var(--red)}.rc-b.warn{background:var(--amber-soft);color:var(--amber)}.rc-b.idle{background:var(--idle-soft);color:var(--idle)}' +
    '.rc-list{display:flex;flex-direction:column}.rc-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line)}.rc-row:last-child{border-bottom:0}.rc-row.top{align-items:flex-start}.rc-row>div{flex:1;min-width:0}.rc-row b{font-size:13.5px}.rc-row small{display:block;color:var(--muted);font-size:12px}' +
    '.dot{display:inline-block;width:9px;height:9px;border-radius:50%;flex:none;margin-right:3px}.dot.bad{background:var(--red)}.dot.warn{background:var(--amber)}.dot.ok{background:var(--green)}.dot.idle{background:var(--idle)}' +
    '.rc-bar{display:grid;grid-template-columns:minmax(90px,40%) 1fr auto;gap:8px;align-items:center;font-size:12.5px;margin:5px 0}.rc-bar i{height:9px;border-radius:5px;background:var(--brand);display:block}.rc-bar b{font-size:12.5px;white-space:nowrap}' +
    '.rc-note{font-size:11.5px;color:var(--muted);margin-top:6px}.rc-mut{color:var(--muted);font-size:12px}.rc-empty{color:var(--muted);font-size:13.5px;padding:6px 0}.rc-chips{margin:4px 0 6px}.rc-sub{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:8px 0 2px}' +
    '.rc-more{margin-top:8px;font-size:13px}.rc-more summary{cursor:pointer;color:var(--brand);font-weight:600;font-size:12.5px}.rc-ul{margin:4px 0;padding-left:18px}.rc-ul li{margin:2px 0}.rc-p{margin:4px 0;font-size:12.5px;line-height:1.45}.rc-tag{display:inline-block;background:var(--amber-soft);color:var(--amber);border-radius:6px;padding:0 6px;margin:2px 2px 0 0;font-size:11.5px}' +
    '.rc-t td .rc-chip{display:flex;width:max-content;margin:2px 0}.rc-t td{min-width:0}.asst .m.rc{overflow-x:auto}.rc-t{table-layout:auto}' +
    '.rc .neg{color:var(--red);font-weight:600}.rc .pos{color:var(--green)}.rc-scroll{overflow-x:auto}' +
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
      function draw() { log.innerHTML = LOG.map(function (m, i) { return m.o ? '<div class="opts' + (i < LOG.length - 1 ? ' old' : '') + '">' + m.o.map(function (o) { return '<button type="button" data-act="' + esc(o[1]) + '">' + esc(o[0]) + '</button>'; }).join('') + '</div>' : (m.h ? '<div class="m a rc">' + m.h + '</div>' : '<div class="m ' + m.c + '">' + esc(m.t) + '</div>'); }).join(''); log.scrollTop = 1e9; log.querySelectorAll('[data-act]').forEach(function (x) { x.onclick = function () { go(x.textContent, function () { return run(x.dataset.act); }); }; }); }
      async function go(label, fn) {
        if (busy) return; busy = true; LOG.push({ c: 'u', t: label }, { c: 'a', t: '…' }); draw();
        try { var r = await fn(); LOG.pop(); LOG.push({ c: 'a', t: r.t, h: r.h }); if (r.o && r.o.length) LOG.push({ o: r.o }); }
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
