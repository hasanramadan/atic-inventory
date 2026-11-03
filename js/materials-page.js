/* Raw Materials page: start-up inside the shared site, the Excel imports (factory plan, stock count, open orders, recipes),
   and the link with the Line Planner (batches really prepared → material used; count vs production check).
   Runs after the page's main script, so it can use S, BASE, saveDoc, render, go, U, fmtN, esc, toast, TODAY, deriveDays. */
var LP = { days: {}, secs: {}, list: [] };
var X = window.ATICExcel;
var MAT_ALIASES = {
  irani: ['Irani molasses', 'Irani molasess', 'Irani dates'], uae: ['UAE molasses', 'UAE molasess', 'UAE dates'], iraqi: ['Iraqi molasses', 'Iraqi molasess', 'Iraqi dates'],
  citric: ['Citric acid anhydrous', 'Citric'], sugar: ['Sugar'], salt: ['Salt'], pomegranate: ['Pomegranate concentrate', 'Pomegrante concentrate', 'Pomegranate'],
  caramel: ['Caramel', 'Caramel colour'], orange: ['Orange aroma', 'Orange blossom flavour', 'Orange flavor'], rose: ['Rose aroma', 'Rose flavor'],
  lemonoil: ['Lemon flavor', 'Lemon flavour', 'Lemon oil', 'Lemon essential oil'], sorbate: ['Potassium sorbate', 'Sorbate'], turbid: ['Turbidifying agent', 'Turbid', 'Turbidity agent'],
  acetic: ['Glacial acetic acid', 'Glacial acetic acidic', 'Acetic acid']
};
function matList() { return (run.cache ? run.cache.model.materials : BASE.materials).map(function (m) { return { id: m.id, name: m.name, aliases: MAT_ALIASES[m.id] || [], unit: m.unit, m: m }; }); }
function subbar() { if (!A) return ''; var cur = S.view === 'material' ? 'overview' : S.view; return '<nav class="subbar">' + A.subs.map(function (s) { return '<a href="#' + s.id + '" data-sub="' + s.id + '"' + (s.id === cur ? ' aria-current="page"' : '') + '>' + esc(s.label) + '</a>'; }).join('') + '</nav>'; }

/* ---------- Line Planner actuals → batches prepared per day and section ---------- */
function buildLP(acts) {
  var days = {}, secs = {};
  acts.forEach(function (a) {
    if (!a || !a.date || !a.sec) return;
    var sec = a.sec === 'S1' ? 'SEC-1' : 'SEC-2';
    (secs[a.date] = secs[a.date] || {})[sec] = 1;
    var runs = (a.runs && a.runs.length) ? a.runs : [{ product: a.product, batches: a.batches }];
    runs.forEach(function (r) { var b = Number(r.batches) || 0; if (b > 0 && r.product) { var k = r.product + '|' + sec; days[a.date] = days[a.date] || {}; days[a.date][k] = (days[a.date][k] || 0) + b; } });
  });
  LP.days = days; LP.secs = secs; LP.list = acts;
}

/* ---------- factory plan import (calendar layout or a plain table) ---------- */
/* A workbook with many sheets (one per month, trucks, pending orders…): read ONE sheet. The default is the sheet named
   for this month (or the next one), visible sheets first; the import window lets you pick another. */
var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function sheetMonth(n) { n = String(n || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' '); for (var i = 0; i < 12; i++) if (new RegExp('\\b' + MONTHS[i]).test(n)) { var y = /\b(20)?(\d{2})\b/.exec(n.replace(/\b\d{1,2}\s*(st|nd|rd|th)?\b(?=\s*[a-z])/, '')); return { m: i + 1, y: y ? 2000 + +y[2] : null }; } return null; }
function bestSheet(book) {
  if (book.sheets.length < 2) return null;
  var y = +TODAY.slice(0, 4), m = +TODAY.slice(5, 7), best = null, score = -1e9;
  book.sheets.forEach(function (sh, i) {
    var sm = sheetMonth(sh.name); if (!sm) return;
    var yy = sm.y || y, diff = (yy - y) * 12 + (sm.m - m), sc = (diff === 0 ? 100 : diff === 1 ? 80 : diff > 0 ? 60 - diff : 40 + diff * 5) + (sh.hidden ? -60 : 0) + (sm.y ? 10 : 0);
    if (sc > score) { score = sc; best = i; }
  });
  return best;
}
function importPlan(file, stage, pick) {
  X.readFile(file).then(function (book) {
    var idx = pick != null ? pick : bestSheet(book);
    var one = idx == null ? book : { name: book.name, sheets: [Object.assign({}, book.sheets[idx], { hidden: false })] };
    var g = X.planGrid(one, { ref: TODAY });
    var from = U.weekStart(TODAY);
    var days = g.days.filter(function (d) { return d.date >= from && d.date <= U.addDays(TODAY, 120); });
    planDialog(book, g, days, stage, { file: file, idx: idx });
  }).catch(function (e) { toast(e.message || String(e)); });
}
function planDialog(book, g, days, stage, ctx) {
  var back = document.createElement('div'); back.className = 'xd-back'; document.body.appendChild(back);
  var dates = []; days.forEach(function (d) { if (dates.indexOf(d.date) < 0) dates.push(d.date); }); dates.sort();
  var cell = function (date, sec) { return days.filter(function (d) { return d.date === date && d.sec === sec; }).map(function (d) { return '<span class="pc pc-' + d.product + '">' + d.product + '</span>' + (d.size ? ' <span class="small">' + esc(d.size) + '</span>' : '') + (d.batches ? ' <span class="small muted">' + fmtN(d.batches) + ' bt</span>' : ''); }).join('<br>') || '<span class="muted">·</span>'; };
  var h = '<div class="xd" role="dialog" aria-modal="true" aria-label="Factory plan"><header><div><h2>Factory plan from Excel</h2><p class="small muted" style="margin:4px 0 0">' + esc(book.name) + ' · ' + book.sheets.length + ' sheet' + (book.sheets.length === 1 ? '' : 's') + '</p></div><button class="btn ghost" data-x="close" aria-label="Close">✕</button></header><div class="body">';
  if (days.length) {
    h += '<p class="sum" style="margin:0">Found <b>' + days.length + '</b> line-days from <b>' + U.nice(dates[0]) + '</b> to <b>' + U.nice(dates[dates.length - 1]) + '</b>. Check them, then use them. Days before this week are left out.</p>';
    h += '<div class="tablewrap" style="max-height:380px"><table><thead><tr><th>Day</th><th>Section 1</th><th>Section 2</th></tr></thead><tbody>' + dates.map(function (d) { return '<tr><td>' + DAYS[new Date(d + 'T00:00:00Z').getUTCDay()] + ' ' + U.nice(d) + '</td><td>' + cell(d, 'S1') + '</td><td>' + cell(d, 'S2') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  } else {
    h += '<div class="callout" style="flex-direction:column;align-items:flex-start"><b>No production days from this week on were found.</b><span>Dates seen: ' + g.datesSeen + ' · product cells seen: ' + g.productsSeen + '. ' + (g.days.length ? g.days.length + ' days were found, but all before this week (latest ' + U.nice(g.days[g.days.length - 1].date) + ').' : '') + '</span><span class="muted">If the file is a list (one row per day), use "Read as a table" below.</span></div>';
  }
  if (g.notes.length) h += '<ul class="skips">' + g.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
  h += '</div><footer><button class="btn ghost" data-x="table" style="margin-right:auto">Read as a table instead</button><button class="btn" data-x="close">Cancel</button><button class="btn primary" data-x="apply"' + (days.length ? '' : ' disabled') + '>Use this plan</button></footer></div>';
  if (ctx && book.sheets.length > 1) h = h.replace('<div class="body">', '<div class="body"><label class="small" style="display:flex;gap:8px;align-items:center">Sheet <select id="pgSheet">' + book.sheets.map(function (sh, i) { return '<option value="' + i + '"' + (i === ctx.idx ? ' selected' : '') + '>' + esc(sh.name) + (sh.hidden ? ' (hidden)' : '') + '</option>'; }).join('') + '<option value="all"' + (ctx.idx == null ? ' selected' : '') + '>All sheets</option></select><span class="muted">' + book.sheets.length + ' sheets in this file</span></label>');
  back.innerHTML = h;
  var pgs = back.querySelector('#pgSheet'); if (pgs) pgs.onchange = function () { back.remove(); importPlan(ctx.file, stage, pgs.value === 'all' ? null : +pgs.value); };
  back.querySelectorAll('[data-x="close"]').forEach(function (b) { b.onclick = function () { back.remove(); }; });
  back.querySelector('[data-x="table"]').onclick = function () { back.remove(); planAsTable(book, stage); };
  var ap = back.querySelector('[data-x="apply"]'); if (ap) ap.onclick = function () { back.remove(); stage(daysToRuns(days), book.name); toast('Read ' + days.length + ' line-days from ' + book.name + '. Check them, then press Save plan.'); };
}
function planAsTable(book, stage) {
  var spec = { fields: [
    { key: 'date', label: 'Date', type: 'date', aliases: [/date|day/], required: true },
    { key: 'sec', label: 'Section / line', type: 'section', aliases: [/sec|line/] },
    { key: 'product', label: 'Product', type: 'product', aliases: [/product|item|description/], required: true },
    { key: 'size', label: 'Size', type: 'size', aliases: [/size|ml|pack/] },
    { key: 'batches', label: 'Batches', type: 'number', aliases: [/batch/] }] };
  X.importTable({ title: 'Factory plan as a table', intro: 'one row per day and line', book: book, spec: spec, ctx: { ref: TODAY, year: +TODAY.slice(0, 4) },
    applyLabel: 'Use this plan',
    onApply: function (recs) {
      var days = []; recs.forEach(function (r) { var secs = r.sec === 'both' ? ['S1', 'S2'] : [r.sec || 'S2']; secs.forEach(function (s) { days.push({ date: r.date, sec: s, product: r.product, size: r.size, batches: r.batches }); }); });
      stage(daysToRuns(days.filter(function (d) { return d.date >= U.weekStart(TODAY); })), book.name); toast('Read ' + days.length + ' line-days. Check them, then press Save plan.');
    } });
}
/* consecutive days of the same product, line and batches become one run (Friday gaps allowed) */
function daysToRuns(days) {
  var by = {}; days.forEach(function (d) { var k = d.product + '|' + (d.sec === 'S1' ? 'SEC-1' : 'SEC-2') + '|' + (d.batches || '') + '|' + (d.size || ''); (by[k] = by[k] || []).push(d.date); });
  var runs = [];
  Object.keys(by).forEach(function (k) {
    var p = k.split('|'), ds = by[k].filter(function (x, i, a) { return a.indexOf(x) === i; }).sort(), start = ds[0], prev = ds[0], sat = 'none';
    function close(end) {
      var cs = days.filter(function (x) { return x.product === p[0] && (x.sec === 'S1' ? 'SEC-1' : 'SEC-2') === p[1] && (x.size || '') === (p[3] || '') && x.date >= start && x.date <= end && x.cartons > 0; }).map(function (x) { return x.cartons; });
      var same = cs.length && cs.every(function (v) { return v === cs[0]; }), dcm = null;
      if (cs.length && !same) { dcm = {}; days.forEach(function (x) { if (x.product === p[0] && (x.sec === 'S1' ? 'SEC-1' : 'SEC-2') === p[1] && (x.size || '') === (p[3] || '') && x.date >= start && x.date <= end && x.cartons > 0) dcm[x.date] = x.cartons; }); }
      runs.push({ product: p[0], size: p[3] || '', from: start, to: end, lines: p[1], sat: sat, batches: p[2] ? +p[2] : null, cartons: same ? cs[0] : null, dayCartons: dcm }); }
    ds.forEach(function (d, i) {
      if (i && U.diffDays(prev, d) > 2) { close(prev); start = d; sat = 'none'; }
      if (new Date(d + 'T00:00:00Z').getUTCDay() === 6) sat = p[1];
      prev = d;
    });
    close(prev);
  });
  var merged = [];
  runs.forEach(function (r) {
    var twin = merged.filter(function (m) { return !m.cartons && !r.cartons && m.product === r.product && m.size === r.size && m.from === r.from && m.to === r.to && m.batches === r.batches && m.lines !== r.lines && m.lines !== 'both'; })[0];
    if (twin) { twin.lines = 'both'; twin.sat = twin.sat !== 'none' && r.sat !== 'none' ? 'both' : (twin.sat !== 'none' ? twin.sat : r.sat); } else merged.push(r);
  });
  return merged.sort(function (a, b) { return a.from < b.from ? -1 : 1; });
}

/* ---------- stock count import (e.g. "Inventory 24.10.2026.xlsx") ---------- */
var UNIT_WORDS = { bag: 'bag', bags: 'bag', can: 'can', cans: 'can', bucket: 'bucket', buckets: 'bucket', drum: 'drum', drums: 'drum', box: 'box', boxes: 'box', tank: 'tank', tanks: 'tank', kg: 'kg', kgs: 'kg', kilo: 'kg', g: 'g', l: 'l', ltr: 'l', litre: 'l', liter: 'l', litres: 'l', gal: 'gal', gallon: 'gal', galon: 'gal', galoon: 'gal', pcs: 'pcs', roll: 'roll', rolls: 'roll' };
function unitWord(s) { s = String(s || '').toLowerCase().trim().replace(/[^a-z]/g, ''); return UNIT_WORDS[s] || (s.replace(/s$/, '') || ''); }
/* "25 Kg/bag", "265 kg/drum", "1000L/Tank", "10Kg/can" → {size:25, of:'kg', per:'bag'} */
function parsePack(t) {
  var m = String(t || '').toLowerCase().replace(/,/g, '.').match(/([\d.]+)\s*(kg|kgs|g|l|ltr|litre|liter)\s*\/?\s*([a-z]+)?/);
  return m ? { size: +m[1], of: unitWord(m[2]), per: m[3] ? unitWord(m[3]) : null } : null;
}
/* "13CAN + 3.25 KG", "1.7 CAN", "54 cans +  5.2 kg", "47.45 KG", 700 → quantity in containers (or in kg when only kg is given) */
function parseQty(v, pack, unitCol) {
  if (typeof v === 'number') return { qty: v, unit: unitWord(unitCol) || (pack && pack.per) || '', given: !!unitWord(unitCol), exact: true };
  var s = String(v || '').toLowerCase().replace(/,/g, ''); if (!s.trim()) return null;
  var parts = s.split('+'), cont = 0, small = 0, cu = null, any = false;
  parts.forEach(function (p) {
    var m = p.match(/([\d.]+)\s*([a-z]*)/); if (!m) return; any = true;
    var n = +m[1], u = unitWord(m[2]);
    if (u === 'kg' || u === 'g' || u === 'l') { small += u === 'g' ? n / 1000 : n; if (!cu && !m[2]) cu = null; }
    else { cont += n; if (u) cu = u; }
  });
  if (!any) return null;
  var unit = cu || unitWord(unitCol) || (pack && pack.per) || '', given = !!(cu || unitWord(unitCol));
  if (cont === 0 && small > 0 && !cu) return { qty: small, unit: pack ? pack.of : 'kg', given: true, exact: true };
  var add = small && pack && pack.size ? small / pack.size : 0;
  return { qty: cont + add, unit: unit, given: given, exact: !small || !!(pack && pack.size), note: small ? fmtN(cont) + ' ' + unit + ' + ' + fmtN(small) + ' ' + (pack ? pack.of : 'kg') : '' };
}
function stockImport(file) {
  X.readFile(file).then(function (book) { stockFromBook(book); }).catch(function (e) { toast(e.message || String(e)); });
}
function stockFromBook(book, knownDate) {
  (function () {
    var spec = { fields: [
      { key: 'name', label: 'Material', aliases: [/raw material|material|item|description|name/], required: true },
      { key: 'pack', label: 'Pack size', aliases: [/^unit$|pack|packing|size/] },
      { key: 'qty', label: 'Quantity', aliases: [/qty|quantity|stock|closing|balance|on hand|count/], required: true },
      { key: 'unit', label: 'Counted in', aliases: [/^unit$|^uom$|count unit/] }] };
    var best = null; book.sheets.forEach(function (sh) { var t = X.parse.findTable(sh.rows, spec); var sc = t.score + (/raw/i.test(sh.name) ? 2 : 0) - (/pack/i.test(sh.name) ? 2 : 0); if (!best || sc > best.sc) best = { sh: sh, t: t, sc: sc }; });
    if (!best || best.t.row < 0) { toast('No table with materials and quantities was found in that file.'); return; }
    // count date: a date in the first rows, else in the file name
    var date = null;
    for (var r = 0; r < Math.min(best.t.row + 1, 6) && !date; r++) (best.sh.rows[r] || []).forEach(function (c) { if (!date) date = X.parse.cellDate(c, +TODAY.slice(0, 4), TODAY); });
    if (!date) { var fm = book.name.match(/(\d{1,2})[._\-](\d{1,2})[._\-](\d{2,4})/); if (fm) date = X.parse.toDate(fm[1] + '/' + fm[2] + '/' + fm[3]); }
    stockDialog(book, best.sh, best.t, knownDate || date || TODAY);
  })();
}
function stockDialog(book, sh, t, date) {
  var mats = matList(), fc = run.cache, saved = (S.saved.materials && S.saved.materials.items) || {};
  var rows = [];
  for (var r = t.row + 1; r < sh.rows.length; r++) {
    var row = sh.rows[r] || [], name = String(row[t.map.name] == null ? '' : row[t.map.name]).trim();
    if (!name || /^(total|sub ?total)/i.test(name)) continue;
    var pack = parsePack(t.map.pack != null ? row[t.map.pack] : ''), q = parseQty(row[t.map.qty], pack, t.map.unit != null ? row[t.map.unit] : '');
    var mm = X.parse.matchName(name, mats, 0.62);
    rows.push({ r: r + 1, name: name, raw: row[t.map.qty], pack: pack, q: q, mat: mm ? mm.item.id : '', factor: null, guess: false });
  }
  function estimate(id) { var x = fc.results.filter(function (y) { return y.id === id; })[0]; return x ? x.stockNow : null; }
  function factorFor(x) {
    var m = mats.filter(function (y) { return y.id === x.mat; })[0]; if (!m || !x.q) return { f: null };
    var au = unitWord(m.unit), cu = unitWord(x.q.unit), sv = saved[x.mat] || {};
    if (sv.countUnit && unitWord(sv.countUnit) === cu && sv.countFactor > 0) return { f: sv.countFactor, how: 'saved: 1 ' + cu + ' = ' + sv.countFactor + ' ' + au };
    if (!x.q.given && au === 'kg' && x.pack && x.pack.of === 'kg' && x.pack.size) { var e0 = estimate(x.mat), b1 = x.q.qty, b2 = x.q.qty * x.pack.size; if (e0 != null) return Math.abs(b1 - e0) <= Math.abs(b2 - e0) ? { f: 1, how: 'no unit in the file: read as kg (closest to the app estimate)', guess: true } : { f: x.pack.size, how: 'no unit in the file: read as ' + (x.pack.per || 'containers') + ' of ' + x.pack.size + ' kg', guess: true }; }
    if (!cu || cu === au) {
      // unit missing or same: if a pack size exists and the app counts in kg, it could be containers or kg; pick what fits the current estimate
      if (false) { var e = estimate(x.mat), a1 = x.q.qty, a2 = x.q.qty * x.pack.size; if (e != null) return Math.abs(a1 - e) <= Math.abs(a2 - e) ? { f: 1, how: 'unit missing: read as kg (closest to the app estimate)', guess: true } : { f: x.pack.size, how: 'unit missing: read as ' + (x.pack.per || 'containers') + ' of ' + x.pack.size + ' kg', guess: true }; }
      return { f: 1, how: '' };
    }
    if (au === 'kg' && x.pack && x.pack.of === 'kg' && x.pack.size) return { f: x.pack.size, how: '1 ' + cu + ' = ' + x.pack.size + ' kg' };
    if (cu === 'kg' && x.pack && x.pack.size && (unitWord(x.pack.per) === au)) return { f: 1 / x.pack.size, how: x.pack.size + ' kg = 1 ' + au };
    if (au === 'l' && x.pack && x.pack.of === 'l' && x.pack.size) return { f: x.pack.size, how: '1 ' + cu + ' = ' + x.pack.size + ' L' };
    if (au === 'kg' && cu === 'g') return { f: 0.001, how: 'grams' };
    return { f: null, how: 'How many ' + au + ' in 1 ' + cu + '?' };
  }
  rows.forEach(function (x) { var f = factorFor(x); x.factor = f.f; x.how = f.how; x.guess = !!f.guess; });
  var back = document.createElement('div'); back.className = 'xd-back'; document.body.appendChild(back);
  function draw() {
    var totals = {}; rows.forEach(function (x) { if (!x.mat || !x.q || !(x.factor > 0)) return; totals[x.mat] = (totals[x.mat] || 0) + x.q.qty * x.factor; });
    var ok = Object.keys(totals).length, need = rows.filter(function (x) { return x.mat && x.q && !(x.factor > 0); }).length;
    var h = '<div class="xd" role="dialog" aria-modal="true" aria-label="Stock count"><header><div><h2>Stock count from Excel</h2><p class="small muted" style="margin:4px 0 0">' + esc(book.name) + ' · sheet "' + esc(sh.name) + '"</p></div><button class="btn ghost" data-x="close" aria-label="Close">✕</button></header><div class="body">';
    h += '<div class="top" style="align-items:center"><label>Count date<input type="date" id="scDate" value="' + esc(date) + '" style="padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg)"></label><span class="small muted">Read from the sheet. Change it if needed. Rows not used by the app (e.g. tahini, chickpeas) are left out.</span></div>';
    h += '<div class="tablewrap" style="max-height:420px"><table class="imp-g"><thead><tr><th>Row</th><th>In the file</th><th>Quantity read</th><th>Goes to</th><th>Conversion</th><th class="n">In app units</th><th class="n">App estimate today</th></tr></thead><tbody>' + rows.map(function (x, i) {
      var m = mats.filter(function (y) { return y.id === x.mat; })[0], val = x.q && x.factor > 0 ? x.q.qty * x.factor : null, e = x.mat ? estimate(x.mat) : null;
      var conv = !x.mat ? '' : !x.q ? '<span style="color:var(--red)">quantity not understood</span>' : (x.factor > 0 && !/How many/.test(x.how || '')) ? '<span class="small ' + (x.guess ? '' : 'muted') + '" style="' + (x.guess ? 'color:var(--amber)' : '') + '">' + esc(x.how || 'same unit') + '</span>' : '<span class="dd small">1 ' + esc(unitWord(x.q.unit)) + ' =<input type="number" step="any" min="0" data-fac="' + i + '" value="' + (x.factor || '') + '" style="width:80px;padding:5px 7px;border:1px solid var(--amber);border-radius:7px;background:var(--bg)">' + esc(m.unit) + '</span>';
      return '<tr' + (x.mat ? '' : ' style="opacity:.55"') + '><td class="muted">' + x.r + '</td><td><b>' + esc(x.name) + '</b>' + (x.pack ? '<br><span class="small muted">' + x.pack.size + ' ' + x.pack.of + (x.pack.per ? ' / ' + x.pack.per : '') + '</span>' : '') + '</td><td class="num">' + esc(String(x.raw == null ? '' : x.raw)) + (x.q ? '<br><span class="small muted">= ' + fmtN(x.q.qty) + ' ' + esc(x.q.unit) + '</span>' : '') + '</td>' +
        '<td><select data-mat="' + i + '" style="padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg)"><option value="">— not tracked —</option>' + mats.map(function (y) { return '<option value="' + y.id + '"' + (y.id === x.mat ? ' selected' : '') + '>' + esc(y.name) + ' (' + esc(y.unit) + ')</option>'; }).join('') + '</select></td><td>' + conv + '</td><td class="n"><b>' + (val == null ? '–' : fmtN(val)) + '</b>' + (val != null && e != null && Math.max(val, e) > 3 * Math.max(Math.min(val, e), 0.5) && Math.max(val, e) > 2 ? '<br><span class="small" style="color:var(--amber)">far from the estimate: check the unit</span>' : '') + '</td><td class="n muted">' + (e == null ? '' : fmtN(Math.max(0, e))) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
    h += '<p class="sum" style="margin:0"><b>' + ok + '</b> material' + (ok === 1 ? '' : 's') + ' will get a new count' + (need ? ' · <b style="color:var(--amber)">' + need + '</b> need a conversion' : '') + '. Two rows for the same material (e.g. salt in 25 kg and 35 kg bags) are added together. Conversions you type are remembered for next time.</p>';
    h += '</div><footer><span class="small muted" style="margin-right:auto">Nothing is saved until you press Save count.</span><button class="btn" data-x="close">Cancel</button><button class="btn primary" data-x="apply"' + (ok && S.canWrite ? '' : ' disabled') + '>Save count</button></footer></div>';
    back.innerHTML = h;
    back.querySelectorAll('[data-x="close"]').forEach(function (b) { b.onclick = function () { back.remove(); }; });
    back.querySelector('#scDate').onchange = function () { date = this.value || date; };
    back.querySelectorAll('[data-mat]').forEach(function (s) { s.onchange = function () { var x = rows[+s.dataset.mat]; x.mat = s.value; var f = factorFor(x); x.factor = f.f; x.how = f.how; x.guess = !!f.guess; draw(); }; });
    back.querySelectorAll('[data-fac]').forEach(function (s) { s.onchange = function () { var x = rows[+s.dataset.fac]; x.factor = +s.value || null; x.how = x.factor ? '1 ' + unitWord(x.q.unit) + ' = ' + x.factor + ' (typed)' : 'How many?'; x.typed = true; setTimeout(draw, 0); }; });
    var ap = back.querySelector('[data-x="apply"]'); if (ap) ap.onclick = function () { back.remove(); saveCount(totals, rows, date, book.name); };
  }
  draw();
}
function saveCount(totals, rows, date, fname) {
  var st = Object.assign({}, (S.saved.stock && S.saved.stock.items) || {}), prev = {};
  Object.keys(totals).forEach(function (id) { prev[id] = st[id] || BASE.stock[id] || null; st[id] = { qty: Math.round(totals[id] * 1000) / 1000, asOf: date, source: 'Count file ' + fname }; });
  var hist = ((S.saved.stock && S.saved.stock.history) || []).slice();
  var items = {}; Object.keys(totals).forEach(function (id) { items[id] = st[id]; });
  hist.push({ at: new Date().toISOString(), date: date, items: items, prev: prev, source: fname });
  var mats = JSON.parse(JSON.stringify((S.saved.materials && S.saved.materials.items) || {}));
  rows.forEach(function (x) { if (x.typed && x.mat && x.factor > 0) { mats[x.mat] = Object.assign({}, mats[x.mat] || {}, { countUnit: unitWord(x.q.unit), countFactor: x.factor }); } });
  S.recon = { date: date, prev: prev, items: items, source: fname };
  saveDoc('stock', { items: st, history: hist.slice(-80), updatedAt: new Date().toISOString() }).then(function () { return saveDoc('materials', { items: mats }); }).then(function () { var v = S.afterCount || 'stock'; S.afterCount = null; go(v); });
}

/* ---------- count vs production: what was really used between two counts ---------- */
function reconcile(prevItems, newItems) {
  var m = run.cache.model, out = [], orders = (S.saved.orders && S.saved.orders.items) || [];
  Object.keys(newItems).forEach(function (id) {
    var a = prevItems[id], b = newItems[id]; if (!a || !b || !a.asOf || a.asOf >= b.asOf) return;
    var mat = m.materials.filter(function (x) { return x.id === id; })[0]; if (!mat) return;
    var rec = 0; E.orderEvents(orders).forEach(function (o) { if (o.material === id && o.received && o.eta > a.asOf && o.eta <= b.asOf) rec += Number(o.qty) || 0; });
    var exp = 0, daysAct = 0, daysOther = 0;
    for (var d = U.addDays(a.asOf, 1); d <= b.asOf; d = U.addDays(d, 1)) {
      var w = new Date(d + 'T00:00:00Z').getUTCDay(), ad = LP.days[d];
      if (ad) { daysAct++; Object.keys(ad).forEach(function (k) { var p = k.split('|'); var q = ((m.recipes[p[0]] || {})[p[1]] || {})[id] || 0; exp += q * ad[k]; }); }
      else if (w !== 5 && !(LP.secs[d])) daysOther++;
    }
    var used = (Number(a.qty) || 0) + rec - (Number(b.qty) || 0), diff = used - exp;
    out.push({ id: id, name: mat.name, unit: mat.unit, from: a.asOf, to: b.asOf, prev: a.qty, now: b.qty, received: rec, used: used, expected: exp, diff: diff, pct: exp > 0 ? diff / exp : null, daysAct: daysAct, daysOther: daysOther });
  });
  return out;
}
function reconHTML() {
  var hist = (S.saved.stock && S.saved.stock.history) || [], last = S.recon || hist[hist.length - 1];
  if (!last || !last.prev) return '<div class="panel"><h3 style="font-size:16px;margin-bottom:6px">Count vs production</h3><p class="hint" style="margin:0">After you import or save a new count, this compares what the stock really went down by with what the batches prepared in the Line Planner should have used. Big gaps point to an unrecorded delivery, a recipe that is off, or waste.</p></div>';
  var rows = reconcile(last.prev, last.items);
  var h = '<div class="panel rec"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="font-size:16px">Count vs production</h3><span class="small muted">Last count ' + U.nice(last.date || (last.at || '').slice(0, 10)) + (last.source ? ' · ' + esc(last.source) : '') + '</span></div>';
  if (!rows.length) return h + '<p class="hint" style="margin:0">No earlier count to compare with for these materials.</p></div>';
  h += '<div class="tablewrap"><table><thead><tr><th>Material</th><th>Between</th><th class="n">Before</th><th class="n">Received</th><th class="n">Now</th><th class="n">Really used</th><th class="n">Batches say</th><th class="n">Gap</th><th>Days from Line Planner</th></tr></thead><tbody>' + rows.map(function (r) {
    var cls = r.pct == null ? '' : Math.abs(r.pct) > 0.25 ? 'bad' : Math.abs(r.pct) > 0.1 ? 'warn' : '';
    return '<tr><td><b>' + esc(r.name) + '</b> <span class="small muted">' + esc(r.unit) + '</span></td><td>' + U.nice(r.from) + ' → ' + U.nice(r.to) + '</td><td class="n">' + fmtN(r.prev) + '</td><td class="n">' + (r.received ? '+' + fmtN(r.received) : '') + '</td><td class="n">' + fmtN(r.now) + '</td><td class="n"><b>' + fmtN(r.used) + '</b></td><td class="n">' + fmtN(r.expected) + '</td><td class="n ' + cls + '">' + (r.diff > 0 ? '+' : '') + fmtN(r.diff) + (r.pct != null ? ' (' + (r.pct > 0 ? '+' : '') + Math.round(r.pct * 100) + '%)' : '') + '</td><td class="small">' + r.daysAct + ' day' + (r.daysAct === 1 ? '' : 's') + (r.daysOther ? ' · <span style="color:var(--amber)">' + r.daysOther + ' working day' + (r.daysOther === 1 ? '' : 's') + ' with no actual</span>' : '') + '</td></tr>';
  }).join('') + '</tbody></table></div><p class="hint" style="margin:10px 0 0">Really used = before + received − now. Batches say = batches prepared (Line Planner actuals) × recipe. A positive gap means more went out than the batches explain. Days with no actual entered are not in "Batches say", so enter every day for a fair check.</p></div>';
  return h;
}

/* ---------- open orders and recipes from Excel ---------- */
function ordersImport(file) {
  var spec = { fields: [
    { key: 'mat', label: 'Material', type: 'item', aliases: [/material|item|product|description/], required: true },
    { key: 'qty', label: 'Quantity', type: 'number', aliases: [/qty|quantity|ordered|amount/], required: true },
    { key: 'eta', label: 'Arrives', type: 'date', aliases: [/eta|arriv|expected|receipt|delivery|due/], required: true },
    { key: 'ref', label: 'PO / reference', type: 'text', aliases: [/po|order|ref|number/] },
    { key: 'sup', label: 'Supplier', type: 'text', aliases: [/supplier|vendor|partner/] }] };
  X.importTable({ title: 'Open orders from Excel', intro: 'one row per order line', file: file, spec: spec, ctx: { items: matList(), ref: TODAY },
    render: function (r) { var m = matList().filter(function (x) { return x.id === r.mat; })[0]; return [m ? m.name : '?', fmtN(r.qty) + ' ' + (m ? m.unit : ''), U.nice(r.eta), r.ref || '', r.sup || '']; },
    applyLabel: 'Add these orders',
    onApply: function (recs) {
      var items = ((S.saved.orders && S.saved.orders.items) || []).slice();
      recs.forEach(function (r) { items.push({ material: r.mat, qty: r.qty, eta: r.eta, ref: [r.ref, r.sup].filter(Boolean).join(' · '), status: 'open', added: TODAY }); });
      saveDoc('orders', { items: items });
    } });
}
function recipesImport(file) {
  var spec = { fields: [
    { key: 'product', label: 'Product', type: 'product', aliases: [/product|item|recipe/], required: true },
    { key: 'sec', label: 'Section', type: 'section', aliases: [/sec|line/] },
    { key: 'mat', label: 'Material', type: 'item', aliases: [/material|ingredient|raw/], required: true },
    { key: 'qty', label: 'Per batch', type: 'number', aliases: [/per batch|qty|quantity|amount|kg/], required: true }] };
  X.importTable({ title: 'Recipes from Excel', intro: 'one row per product, section and material', file: file, spec: spec, ctx: { items: matList() },
    render: function (r) { var m = matList().filter(function (x) { return x.id === r.mat; })[0]; return [PN[r.product] || r.product, r.sec === 'both' || !r.sec ? 'Both' : r.sec === 'S1' ? 'Section 1' : 'Section 2', m ? m.name : '?', fmtN(r.qty) + ' ' + (m ? m.m.recipeUnit : '')]; },
    applyLabel: 'Use these recipes',
    onApply: function (recs) {
      var rec = JSON.parse(JSON.stringify(run.cache.model.recipes));
      recs.forEach(function (r) { var m = matList().filter(function (x) { return x.id === r.mat; })[0].m; var secs = !r.sec || r.sec === 'both' ? ['SEC-1', 'SEC-2'] : [r.sec === 'S1' ? 'SEC-1' : 'SEC-2'];
        secs.forEach(function (s) { rec[r.product] = rec[r.product] || {}; rec[r.product][s] = rec[r.product][s] || {}; rec[r.product][s][r.mat] = r.qty / (m.recipeFactor || 1); }); });
      saveDoc('recipes', { recipes: rec, updatedAt: new Date().toISOString() });
    } });
}

/* ---------- add the import buttons to the existing pages ---------- */
function fileBtn(id, label) { return '<label class="btn" for="' + id + '" style="display:inline-flex;cursor:pointer">' + label + '</label><input type="file" id="' + id + '" accept=".xlsx,.xls,.xlsm,.csv" hidden>'; }
(function () {
  var _vStock = vStock, _aStock = after.stock, _vOrders = vOrders, _aOrders = after.orders, _vRec = vRecipes, _aRec = after.recipes;
  vStock = function (fc) { var h = _vStock(fc); h = h.replace('<div class="row"></div></div>', '<div class="row">' + fileBtn('xlStock', 'Import stock count (Excel)') + '</div></div>'); var i = h.indexOf('<div class="panel">'); return h.slice(0, i) + reconHTML() + h.slice(i); };
  after.stock = function (fc) { _aStock(fc); var f = $('#xlStock'); if (f) f.onchange = function () { if (this.files[0]) stockImport(this.files[0]); this.value = ''; }; };
  vOrders = function (fc) { return _vOrders(fc).replace('<div class="row"></div></div>', '<div class="row">' + fileBtn('xlOrd', 'Import orders (Excel)') + '</div></div>'); };
  after.orders = function (fc) { _aOrders(fc); var f = $('#xlOrd'); if (f) f.onchange = function () { if (this.files[0]) ordersImport(this.files[0]); this.value = ''; }; };
  vRecipes = function (fc) { return _vRec(fc).replace('<div class="row"></div></div>', '<div class="row">' + fileBtn('xlRec', 'Import recipes (Excel)') + '</div></div>'); };
  after.recipes = function (fc) { _aRec(fc); var f = $('#xlRec'); if (f) f.onchange = function () { if (this.files[0]) recipesImport(this.files[0]); this.value = ''; }; };
})();

/* ---------- start ---------- */
(async function () {
  A = await ATIC.boot({ page: 'materials', subs: [{ id: 'overview', label: 'Overview', badge: ' ', badgeHidden: true }, { id: 'forecast', label: 'Forecast & plan' }, { id: 'recipes', label: 'Recipes' }, { id: 'inventory', label: 'Inventory', badge: ' ', badgeHidden: true }, { id: 'daily', label: 'Daily consumption' }, { id: 'stock', label: 'Stock & lead times' }, { id: 'orders', label: 'Orders & receiving' }, { id: 'alerts', label: 'Email alerts' }, { id: 'history', label: 'History' }] });
  if (!A) return;
  S.profile = A.profile; S.canWrite = A.canWrite;
  try { var acts = await A.planner.list('actuals'); buildLP(acts.map(function (x) { return x.data; })); } catch (e) { /* no Line Planner access: forecast uses plan / average pace */ }
  var h = location.hash.slice(1); if (['overview', 'forecast', 'recipes', 'inventory', 'daily', 'stock', 'orders', 'alerts', 'history'].indexOf(h) >= 0) S.view = h;
  await loadDocs();
  if (!S.channel) S.channel = A.docs.subscribe(function () { loadDocs(); });
})();

/* =====================================================================================================
   INVENTORY: every raw material and packaging item as counted (weekly / monthly Excel, or typed by hand),
   with critical items that stay critical, receipts from purchase orders added on the day they arrive.
   Saved in app_docs "inventory": { items:[…], asOf, source, kind, history:[counts], moves:[receipts & edits] }
   ===================================================================================================== */
var INV = window.ATICInventory;
var INV_ONLY = 'raw'; /* raw materials only for now; set to null to bring packaging back (reader, page, orders and reports) */
S.inv = { filter: 'all', q: '', dirty: {} };
function invDoc() { return S.saved.inventory || { items: [], history: [], moves: [] }; }
function invItems() { return (invDoc().items || []).filter(function (i) { return !INV_ONLY || i.cat === INV_ONLY; }); }
function invById(id) { return invItems().filter(function (i) { return i.id === id; })[0]; }
/* link a raw inventory line to a tracked forecast material, and how many app units one counted unit holds */
/* aroma = flavour = flavor = essence at ATIC: "Orange Aroma" on the sheet is the orange blossom flavour of the forecast,
   "Rose Aroma" is the rose flavour. Match on the fruit/flower word when the name says aroma/flavour. */
var FLAV = /aroma|flavou?r|essence|essential/i, NOT_FLAV_WORD = /^(aroma|flavou?r|flavor|essence|essential|oil|natural|liquid|new|old|stock|the|of)$/i;
function flavourMatch(name, mats) {
  if (!FLAV.test(name)) return null;
  var word = String(name).toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2 && !NOT_FLAV_WORD.test(w); })[0];
  if (!word) return null;
  var c = mats.filter(function (m) { var all = [m.name].concat(m.aliases || []).join(' | ').toLowerCase(); return all.indexOf(word) >= 0 && /aroma|flavou?r|essence|oil/.test(all) && !/water/.test(m.name.toLowerCase()); });
  return c.length === 1 ? { item: c[0], score: 0.95 } : null;
}
function invLink(it) {
  if (it.cat !== 'raw') return { mat: null, toApp: null };
  var ml = matList(), mm = X.parse.matchName(it.name, ml, 0.62);
  if (!mm || mm.score < 0.8) { var fm = flavourMatch(it.name, ml); if (fm) mm = fm; }
  if (!mm) return { mat: null, toApp: null };
  var m = mm.item, au = unitWord(m.unit), iu = INV.unitWord(it.unit), pack = it.pack || INV.parsePack(it.packTxt);
  var f = null;
  if (!iu || iu === au) f = 1;
  else if (pack && pack.size && INV.unitWord(pack.of) === au) f = pack.size;
  else if (au === 'kg' && iu === 'g') f = 0.001;
  if (f == null) { var sv = ((S.saved.materials && S.saved.materials.items) || {})[m.id] || {}; if (sv.countUnit && unitWord(sv.countUnit) === iu && sv.countFactor > 0) f = sv.countFactor; }
  return { mat: m.id, toApp: f };
}
/* ---------- the forecast reads the inventory: one source for stock counts ----------
   Every tracked raw material = sum of its inventory lines × conversion, dated with the count.
   Receipts are NOT copied here (the forecast adds them on the day they arrive), so nothing is counted twice. */
function invForecastPlan(items) {
  var by = {}, missing = [];
  (items || []).forEach(function (i) {
    if (i.cat !== 'raw' || !i.mat || i.missing) return;
    var b = by[i.mat] = by[i.mat] || { qty: 0, asOf: null, lines: [], ok: true };
    b.lines.push(i);
    if (!(i.toApp > 0)) { if (Number(i.qty)) { b.ok = false; missing.push(i); } return; }
    b.qty += (Number(i.qty) || 0) * i.toApp;
    var d = i.countAsOf || i.asOf; if (d && (!b.asOf || d > b.asOf)) b.asOf = d;
  });
  return { by: by, missing: missing };
}
function syncForecastFromInventory(items, why) {
  var pl = invForecastPlan(items), st = Object.assign({}, (S.saved.stock && S.saved.stock.items) || {}), prev = {}, changed = {};
  Object.keys(pl.by).forEach(function (id) {
    var b = pl.by[id]; if (!b.ok || !b.asOf) return;
    var q = Math.round(b.qty * 1000) / 1000, o = st[id] || {};
    if (o.qty === q && o.asOf === b.asOf) return;
    prev[id] = o.qty != null ? o : (BASE.stock[id] || null);
    st[id] = changed[id] = { qty: q, asOf: b.asOf, source: 'Inventory: ' + b.lines.map(function (l) { return fmtN(l.qty) + ' ' + l.unit + ' ' + l.name; }).join(' + ') };
  });
  if (!Object.keys(changed).length) return Promise.resolve(pl);
  var hist = ((S.saved.stock && S.saved.stock.history) || []).slice();
  hist.push({ at: new Date().toISOString(), date: Object.keys(changed).map(function (k) { return changed[k].asOf; }).sort().pop(), items: changed, prev: prev, source: why || 'Inventory' });
  S.recon = { date: hist[hist.length - 1].date, prev: prev, items: changed, source: why || 'Inventory' };
  return Promise.resolve(saveDoc('stock', { items: st, history: hist.slice(-80), updatedAt: new Date().toISOString() })).then(function () { return pl; });
}
function openOnItem(id) {
  var o = (S.saved.orders && S.saved.orders.items) || [], t = 0;
  o.forEach(function (x) { if (x.inv === id && x.status !== 'received' && x.status !== 'closed' && x.status !== 'cancelled') t += Math.max(0, (Number(x.qty) || 0) - orderGot(x)) * (x.toInv || 1); });
  return t;
}
function invFiltered() {
  var q = INV.norm(S.inv.q || ''), f = S.inv.filter;
  return invItems().filter(function (i) {
    if (f === 'raw' && i.cat !== 'raw') return false; if (f === 'pack' && i.cat !== 'pack') return false;
    if (f === 'critical' && !i.critical) return false; if (f === 'low' && !(i.needOrder || (i.min != null && i.qty != null && i.qty <= i.min))) return false;
    return !q || INV.norm(i.name + ' ' + i.group + ' ' + (i.note || '')).indexOf(q) >= 0;
  });
}
function vInventory(fc) {
  var d = invDoc(), items = invItems();
  var h = head('Inventory', (INV_ONLY ? 'Raw materials as counted (packaging comes later)' : 'Raw materials and packaging as counted') + (d.asOf ? ' · last count <b>' + U.nice(d.asOf) + '</b>' + (INV.monthEnd(d.asOf) ? ' = closing of ' + INV.monthEnd(d.asOf).close + ', opening of ' + INV.monthEnd(d.asOf).open : '') + (d.source ? ' (' + esc(d.source) + ')' : '') : ' · no count yet'),
    fileBtn('xlInv', 'Import inventory (Excel)') + (S.canWrite ? '<button class="btn" id="invAdd">Add item</button>' : ''));
  h += accessNote(); h += lastSaved('inventory');
  if (!items.length) return h + '<div class="panel empty"><h3 style="font-size:17px;margin-bottom:6px">No inventory yet</h3><p class="hint" style="margin:0">Press <b>Import inventory (Excel)</b> and pick the weekly inventory file or the month-end one (closing of the month = opening of the next). The "Raw Material" sheet and the raw part of "CRITICAL STOCK" are read; packaging is left out for now. You check every line before saving.</p></div>';
  var crit = items.filter(function (i) { return i.critical; }).length, need = items.filter(function (i) { return i.needOrder || (i.min != null && i.qty != null && i.qty <= i.min); }).length;
  var since = (d.moves || []).filter(function (m) { return m.kind === 'receipt' && (!d.asOf || m.date > d.asOf); });
  h += '<div class="kpis"><div class="kpi"><span class="l">Items</span><span class="v num">' + items.length + '</span><span class="small muted">' + (INV_ONLY ? 'raw materials' : items.filter(function (i) { return i.cat === 'raw'; }).length + ' raw · ' + items.filter(function (i) { return i.cat === 'pack'; }).length + ' packaging') + '</span></div>' +
    '<div class="kpi order"><span class="l">Critical</span><span class="v num">' + crit + '</span><span class="small muted">stay critical until you clear them</span></div>' +
    '<div class="kpi soon"><span class="l">Need to order / low</span><span class="v num">' + need + '</span><span class="small muted">from the file or your minimums</span></div>' +
    '<div class="kpi ok"><span class="l">Received since count</span><span class="v num">' + since.length + '</span><span class="small muted">deliveries added</span></div></div>';
  h += '<div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap"><div class="tabs">' + (INV_ONLY ? [['all', 'All']] : [['all', 'All'], ['raw', 'Raw materials'], ['pack', 'Packaging']]).concat([['critical', 'Critical (' + crit + ')'], ['low', 'Need to order (' + need + ')']]).map(function (t) { return '<button data-invf="' + t[0] + '" aria-pressed="' + (S.inv.filter === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
    '<input id="invQ" type="search" placeholder="Search items" value="' + esc(S.inv.q) + '" style="padding:8px 12px;border:1px solid var(--line);border-radius:9px;background:var(--bg);min-width:220px"></div>';
  var list = invItems(), groups = [];
  list.forEach(function (i) { var g = (i.cat === 'raw' ? 'Raw materials' : 'Packaging') + ' · ' + i.group; if (groups.indexOf(g) < 0) groups.push(g); });
  var est = {}; (fc.results || []).forEach(function (r) { est[r.id] = r; });
  h += '<div class="tablewrap"><table class="inv"><thead><tr><th>Item</th><th>Packing</th><th class="n">Counted</th><th>Unit</th><th class="n">Estimated now</th><th>Critical</th><th>Cover / use</th><th>Forecast</th><th class="n">On order</th><th>Last change</th></tr></thead><tbody>';
  groups.forEach(function (g) {
    h += '<tr class="grp" data-grp="' + esc(g) + '"><td colspan="10">' + esc(g) + '</td></tr>';
    list.filter(function (i) { return (i.cat === 'raw' ? 'Raw materials' : 'Packaging') + ' · ' + i.group === g; }).forEach(function (i) {
      var dv = S.inv.dirty[i.id] || {}, q = dv.qty !== undefined ? dv.qty : i.qty, cr = dv.critical !== undefined ? dv.critical : i.critical;
      var ev = invEstimate(fc, i), estTxt = '';
      var estCell = !ev ? '<td class="n muted small">–</td>' : ev.shared ? '<td class="n muted small">with the line above</td>' : '<td class="n" title="Count − daily consumption since the count + deliveries received"><b>' + fmtN(Math.max(0, ev.v)) + '</b>' + (ev.multi ? '<br><span class="small muted">all ' + ev.multi + ' lines: ' + fmtN(Math.max(0, ev.app)) + ' ' + esc(ev.unit) + '</span>' : '') + '</td>';
      var oo = openOnItem(i.id);
      h += '<tr data-iid="' + esc(i.id) + '" data-g="' + esc(g) + '" class="' + (cr ? 'crit' : '') + (i.missing ? ' gone' : '') + '"><td><b>' + esc(i.name) + '</b>' + (i.note ? '<br><span class="small muted">' + esc(i.note) + '</span>' : '') + (i.qtyText ? '<br><span class="small muted">In the file: "' + esc(i.qtyText) + '"' + (i.qtyNote ? ' · ' + esc(i.qtyNote) : '') + '</span>' : '') + (i.missing ? '<br><span class="small" style="color:var(--amber)">Not in the count of ' + U.nice(i.missing) + ', kept as it was</span>' : '') + '</td>' +
        '<td class="small">' + esc(i.packTxt || '') + '</td>' +
        '<td class="n">' + (S.canWrite ? '<input type="number" step="any" data-invq="' + esc(i.id) + '" value="' + (q == null ? '' : q) + '" style="width:110px">' : fmtN(q)) + estTxt + '</td>' +
        '<td class="small">' + esc(i.unit || '') + '</td>' + estCell +
        '<td><label class="dd small"><input type="checkbox" data-invc="' + esc(i.id) + '"' + (cr ? ' checked' : '') + (S.canWrite ? '' : ' disabled') + '>' + (cr ? '<span class="chip order" style="padding:1px 8px">Critical</span>' : 'Critical') + '</label>' + (cr && i.critFrom ? '<span class="small muted" style="display:block">' + esc(i.critFrom) + '</span>' : '') +
          (i.cat === 'raw' && i.mat ? '<label class="dd small" style="display:flex;margin-top:4px" title="Only you set this: the Overview shows Not in use only when it is ticked"><input type="checkbox" data-invu="' + esc(i.id) + '"' + ((dv.notInUse !== undefined ? dv.notInUse : i.notInUse) ? ' checked' : '') + (S.canWrite ? '' : ' disabled') + '>Not in use</label>' : '') + '</td>' +
        '<td class="small">' + esc([i.enough, i.use].filter(Boolean).join(' · ')) + (i.needOrder ? ' <span class="chip soon" style="padding:1px 8px">Need to order</span>' : '') + '</td>' +
        '<td class="small">' + invFcCell(i) + '</td>' +
        '<td class="n">' + (oo ? fmtN(oo) : '') + '</td>' +
        '<td class="small muted">' + (i.asOf ? U.nice(i.asOf) : '') + (i.source ? '<br>' + esc(i.source) : '') + '</td></tr>';
    });
  });
  h += '<tr id="invNone" hidden><td colspan="10" class="muted">No item matches.</td></tr>';
  h += '</tbody></table></div>';
  var nd = Object.keys(S.inv.dirty).length;
  if (S.canWrite) h += '<div class="row"><button class="btn primary" id="invSave"' + (nd ? '' : ' disabled') + '>Save changes' + (nd ? ' (' + nd + ')' : '') + '</button>' + (nd ? '<button class="btn ghost" id="invUndo">Undo changes</button>' : '') + '<span class="small muted">Change a quantity or the critical tick, then save. Every change is kept in the history below.</span></div>';
  // history
  var hist = (d.history || []).slice(-8).reverse(), moves = (d.moves || []).slice(-15).reverse();
  h += '<div class="grid2" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px"><div class="panel"><h3 style="font-size:16px;margin-bottom:8px">Counts</h3>' + (hist.length ? '<ul class="why">' + hist.map(function (x) { return '<li><b>' + U.nice(x.date) + '</b> · ' + esc(x.source || '') + ' <span class="muted small">' + esc(x.kind || '') + ' · ' + Object.keys(x.qty || {}).length + ' items</span></li>'; }).join('') + '</ul>' : '<p class="hint" style="margin:0">No counts yet.</p>') + '</div>' +
    '<div class="panel"><h3 style="font-size:16px;margin-bottom:8px">Received &amp; changed by hand</h3>' + (moves.length ? '<ul class="why">' + moves.map(function (x) { var it = invById(x.id); return '<li><b>' + U.nice(x.date) + '</b> ' + (x.kind === 'receipt' ? 'received <b>+' + fmtN(x.qty) + '</b> ' : 'set to <b>' + fmtN(x.qty) + '</b> ') + esc(it ? it.unit + ' ' + it.name : x.id) + (x.ref ? ' <span class="muted small">' + esc(x.ref) + '</span>' : '') + (x.by ? ' <span class="muted small">by ' + esc(x.by) + '</span>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="hint" style="margin:0">Deliveries marked received on Open orders appear here and are added to the quantity.</p>') + '</div></div>';
  return h;
}
after.inventory = function () {
  var f = $('#xlInv'); if (f) f.onchange = function () { if (this.files[0]) invImport(this.files[0]); this.value = ''; };
  document.querySelectorAll('[data-invf]').forEach(function (b) { b.onclick = function () { S.inv.filter = b.dataset.invf; invApply(); }; });
  var q = $('#invQ'); if (q) q.oninput = function () { S.inv.q = q.value; invApply(); };
  invApply();
  document.querySelectorAll('[data-invq]').forEach(function (el) { el.onchange = function () { var id = el.dataset.invq, it = invById(id), v = el.value === '' ? null : +el.value; var dv = S.inv.dirty[id] = S.inv.dirty[id] || {}; if (v === it.qty) delete dv.qty; else dv.qty = v; if (!Object.keys(dv).length) delete S.inv.dirty[id]; var y = window.scrollY; render(); window.scrollTo(0, y); }; });
  document.querySelectorAll('[data-invc]').forEach(function (el) { el.onchange = function () { var id = el.dataset.invc, it = invById(id); var dv = S.inv.dirty[id] = S.inv.dirty[id] || {}; if (el.checked === !!it.critical) delete dv.critical; else dv.critical = el.checked; if (!Object.keys(dv).length) delete S.inv.dirty[id]; var y = window.scrollY; render(); window.scrollTo(0, y); }; });
  document.querySelectorAll('[data-invf2]').forEach(function (el) { el.onchange = function () { var id = el.dataset.invf2, v = +el.value || null; var dv = S.inv.dirty[id] = S.inv.dirty[id] || {}; if (v) dv.toApp = v; else delete dv.toApp; if (!Object.keys(dv).length) delete S.inv.dirty[id]; var y = window.scrollY; render(); window.scrollTo(0, y); }; });
  document.querySelectorAll('[data-invu]').forEach(function (el) { el.onchange = function () { var id = el.dataset.invu, it = invById(id); var dv = S.inv.dirty[id] = S.inv.dirty[id] || {}; if (el.checked === !!it.notInUse) delete dv.notInUse; else dv.notInUse = el.checked; if (!Object.keys(dv).length) delete S.inv.dirty[id]; var y = window.scrollY; render(); window.scrollTo(0, y); }; });
  var sv = $('#invSave'); if (sv) sv.onclick = invSaveEdits;
  var un = $('#invUndo'); if (un) un.onclick = function () { S.inv.dirty = {}; render(); };
  var ad = $('#invAdd'); if (ad) ad.onclick = invAddDialog;
};
function invFcCell(i) {
  if (i.cat !== 'raw') return '';
  var m = i.mat && mat(i.mat); if (!m) return '<span class="muted">not tracked</span>';
  var dv = S.inv.dirty[i.id] || {}, f = dv.toApp !== undefined ? dv.toApp : i.toApp;
  if (f > 0 && dv.toApp === undefined) return esc(m.name) + (f !== 1 ? '<br><span class="muted">1 ' + esc(i.unit.toLowerCase()) + ' = ' + fmtN(f) + ' ' + esc(m.unit) + '</span>' : '');
  return esc(m.name) + '<br><span class="dd" title="Needed so the forecast can use this count">1 ' + esc(i.unit.toLowerCase()) + ' =<input type="number" step="any" min="0" data-invf2="' + esc(i.id) + '" value="' + (f > 0 ? f : '') + '" style="width:70px;padding:4px 6px;border:1px solid var(--amber);border-radius:7px;background:var(--bg)">' + esc(m.unit) + '</span>';
}
/* Inventory filters and search: show / hide rows in place, no rebuild */
function invApply() {
  var ok = {}; invFiltered().forEach(function (i) { ok[i.id] = 1; });
  var vis = {}, n = 0;
  document.querySelectorAll('tr[data-iid]').forEach(function (tr) { var on = !!ok[tr.dataset.iid]; tr.hidden = !on; if (on) { vis[tr.dataset.g] = 1; n++; } });
  document.querySelectorAll('tr[data-grp]').forEach(function (tr) { tr.hidden = !vis[tr.dataset.grp]; });
  var e = $('#invNone'); if (e) e.hidden = n > 0;
  document.querySelectorAll('[data-invf]').forEach(function (b) { b.setAttribute('aria-pressed', S.inv.filter === b.dataset.invf); });
}
function invSaveEdits() {
  var d = JSON.parse(JSON.stringify(invDoc())), by = (S.profile && (S.profile.full_name || S.profile.username)) || '';
  d.moves = d.moves || [];
  d.items.forEach(function (i) {
    var dv = S.inv.dirty[i.id]; if (!dv) return;
    if (dv.qty !== undefined) { i.qty = dv.qty; i.asOf = TODAY; i.countAsOf = TODAY; i.source = 'Changed by hand'; i.qtyText = ''; i.qtyNote = ''; d.moves.push({ at: new Date().toISOString(), date: TODAY, id: i.id, qty: dv.qty, kind: 'edit', by: by }); }
    if (dv.critical !== undefined) { i.critical = dv.critical; i.critFrom = dv.critical ? 'marked by hand ' + U.nice(TODAY) : ''; }
    if (dv.toApp !== undefined) i.toApp = dv.toApp;
    if (dv.notInUse !== undefined) { i.notInUse = dv.notInUse; i.useFrom = dv.notInUse ? 'set by hand ' + U.nice(TODAY) : ''; }
  });
  d.moves = d.moves.slice(-300); d.updatedAt = new Date().toISOString();
  var conv = {}; d.items.forEach(function (i) { var dv = S.inv.dirty[i.id]; if (dv && dv.toApp > 0 && i.mat) conv[i.mat] = { countUnit: INV.unitWord(i.unit), countFactor: dv.toApp }; });
  S.inv.dirty = {};
  Promise.resolve(saveDoc('inventory', d)).then(function () {
    if (!Object.keys(conv).length) return;
    var mats = JSON.parse(JSON.stringify((S.saved.materials && S.saved.materials.items) || {})); Object.keys(conv).forEach(function (k) { mats[k] = Object.assign({}, mats[k] || {}, conv[k]); });
    return saveDoc('materials', { items: mats });
  }).then(function () { return syncForecastFromInventory(d.items, 'Inventory changed by hand ' + U.nice(TODAY)); }).then(function (pl) { if (pl && pl.missing.length) toast(pl.missing.length + ' line(s) still need a conversion before the forecast can use them.'); });
}
function invAddDialog() {
  var back = document.createElement('div'); back.className = 'xd-back'; X.ensureCss(); document.body.appendChild(back);
  var groups = []; invItems().forEach(function (i) { if (groups.indexOf(i.group) < 0) groups.push(i.group); });
  back.innerHTML = '<div class="xd" role="dialog" aria-modal="true" aria-label="Add item" style="width:min(560px,100%)"><header><h2>Add an inventory item</h2><button class="btn ghost" data-x="close" aria-label="Close">✕</button></header><div class="body"><div class="top">' +
    '<label>Kind<select id="iaCat"><option value="raw">Raw material</option>' + (INV_ONLY ? '' : '<option value="pack">Packaging</option>') + '</select></label>' +
    '<label>Group<input id="iaGrp" list="iaGrps" placeholder="e.g. Caps"><datalist id="iaGrps">' + groups.map(function (g) { return '<option value="' + esc(g) + '">'; }).join('') + '</datalist></label></div>' +
    '<div class="top"><label style="flex:1">Name<input id="iaName" style="padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg)"></label><label>Packing<input id="iaPack" placeholder="25 Kg/bag" style="padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg);width:120px"></label></div>' +
    '<div class="top"><label>Quantity<input id="iaQty" type="number" step="any" style="padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg);width:120px"></label><label>Unit<input id="iaUnit" placeholder="BAG" style="padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg);width:100px"></label><label class="dd" style="flex-direction:row;align-items:center"><input type="checkbox" id="iaCrit"> Critical</label></div>' +
    '</div><footer><button class="btn" data-x="close">Cancel</button><button class="btn primary" id="iaOk">Add item</button></footer></div>';
  back.querySelectorAll('[data-x="close"]').forEach(function (b) { b.onclick = function () { back.remove(); }; });
  back.querySelector('#iaOk').onclick = function () {
    var name = back.querySelector('#iaName').value.trim(); if (!name) { toast('Type the item name.'); return; }
    var cat = back.querySelector('#iaCat').value, pack = back.querySelector('#iaPack').value.trim();
    var it = { id: INV.slug(cat + ' ' + name + ' ' + pack) + '-' + Date.now().toString(36).slice(-4), cat: cat, group: back.querySelector('#iaGrp').value.trim() || (cat === 'raw' ? 'Raw material' : 'Other'), name: name, packTxt: pack, pack: INV.parsePack(pack),
      qty: back.querySelector('#iaQty').value === '' ? null : +back.querySelector('#iaQty').value, unit: back.querySelector('#iaUnit').value.trim().toUpperCase(), critical: back.querySelector('#iaCrit').checked, asOf: TODAY, source: 'Added by hand' };
    if (it.critical) it.critFrom = 'marked by hand ' + U.nice(TODAY);
    var l = invLink(it); it.mat = l.mat; it.toApp = l.toApp;
    var d = JSON.parse(JSON.stringify(invDoc())); d.items = (d.items || []).concat([it]); back.remove(); saveDoc('inventory', d);
  };
}
/* ---------- import: weekly or monthly inventory workbook ---------- */
function invImport(file) {
  X.readFile(file).then(function (book) {
    var p = INV.parseBook(book, { ref: TODAY, only: INV_ONLY });
    if (!p.items.length) { toast('No inventory lines were found in ' + book.name + '.'); return; }
    p.items.forEach(function (it) { var l = invLink(it); it.mat = l.mat; it.toApp = l.toApp; });
    invImportDialog(book, p);
  }).catch(function (e) { toast(e.message || String(e)); });
}
function invImportDialog(book, p) {
  X.ensureCss();
  var date = p.date || TODAY, back = document.createElement('div'); back.className = 'xd-back'; document.body.appendChild(back);
  function draw() {
    var all = invDoc().items || [], hiddenItems = all.filter(function (i) { return INV_ONLY && i.cat !== INV_ONLY; });
    var mg = INV.merge({ items: all.filter(function (i) { return !INV_ONLY || i.cat === INV_ONLY; }) }, p, { date: date, source: book.name }), ch = mg.changes;
    var nNew = ch.filter(function (c) { return c.isNew; }).length, nMiss = ch.filter(function (c) { return c.missing; }).length, nCrit = mg.items.filter(function (i) { return i.critical; }).length, nCritNew = ch.filter(function (c) { return c.critNew; }).length;
    var nChg = ch.filter(function (c) { return !c.isNew && !c.missing && c.before !== c.after; }).length;
    var h = '<div class="xd" role="dialog" aria-modal="true" aria-label="Inventory count"><header><div><h2>Inventory count from Excel</h2><p class="small muted" style="margin:4px 0 0">' + esc(book.name) + ' · read as <b>' + esc(INV.monthEnd(date) ? 'closing of ' + INV.monthEnd(date).close + ' = opening of ' + INV.monthEnd(date).open + (p.critical.length ? ' + critical list' : '') : (p.critical.length ? 'weekly + critical list' : 'weekly')) + '</b> · sheets: ' + esc(p.sheets.join(', ')) + '</p></div><button class="btn ghost" data-x="close" aria-label="Close">✕</button></header><div class="body">';
    h += '<div class="top" style="align-items:center"><label>Count date<input type="date" id="icDate" value="' + esc(date) + '" style="padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg)"></label><span class="small muted">Read from the sheet. Change it if needed.</span></div>';
    h += '<p class="sum" style="margin:0"><b>' + p.items.length + '</b> lines read · <b>' + nChg + '</b> quantities changed' + (nNew ? ' · <b>' + nNew + '</b> new items' : '') + (nMiss ? ' · <b>' + nMiss + '</b> saved items not in this file (kept as they were)' : '') + ' · <b style="color:var(--red)">' + nCrit + '</b> critical' + (nCritNew ? ' (' + nCritNew + ' newly critical)' : '') + '.</p>';
    if (p.notes.length) h += '<ul class="skips">' + p.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
    h += '<div class="tablewrap" style="max-height:420px"><table><thead><tr><th>Item</th><th>Packing</th><th class="n">Before</th><th class="n">This count</th><th>Unit</th><th>Critical</th><th>Read from</th></tr></thead><tbody>' + mg.items.map(function (it) {
      var c = ch.filter(function (x) { return x.id === it.id; })[0] || {}, src = p.items.filter(function (x) { return x.id === it.id || (x.cat === it.cat && INV.norm(x.name) === INV.norm(it.name)); })[0];
      var diff = c.before != null && c.after != null && c.before !== c.after;
      return '<tr' + (c.missing ? ' style="opacity:.55"' : '') + '><td><b>' + esc(it.name) + '</b> <span class="small muted">' + esc(it.group) + '</span>' + (c.isNew ? ' <span class="chip info" style="padding:1px 8px">new</span>' : '') + '</td><td class="small">' + esc(it.packTxt || '') + '</td>' +
        '<td class="n muted">' + (c.before == null ? '' : fmtN(c.before)) + '</td><td class="n"><b>' + (it.qty == null ? '–' : fmtN(it.qty)) + '</b>' + (diff ? '<br><span class="small" style="color:' + (c.after < c.before ? 'var(--amber)' : 'var(--green)') + '">' + (c.after > c.before ? '+' : '') + fmtN(c.after - c.before) + '</span>' : '') + '</td><td class="small">' + esc(it.unit) + '</td>' +
        '<td>' + (it.critical ? '<span class="chip order" style="padding:1px 8px">Critical</span>' + (c.critNew ? '' : ' <span class="small muted">' + esc(it.critFrom || '') + '</span>') : '') + '</td>' +
        '<td class="small muted">' + (c.missing ? 'not in file' : src ? esc(src.sheet.trim()) + ' row ' + src.row + (src.qtyText ? ': "' + esc(src.qtyText) + '"' : '') : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
    var fp = invForecastPlan(mg.items), okN = Object.keys(fp.by).filter(function (k) { return fp.by[k].ok; }).length;
    h += '<p class="small" style="margin:0">The Overview and forecast take their counts from this inventory: <b>' + okN + '</b> materials update when you save' + (fp.missing.length ? ', <b style="color:var(--amber)">' + fp.missing.length + '</b> line(s) need a conversion first (' + esc(fp.missing.map(function (i) { return i.name + ' ' + i.unit; }).join(', ')) + '): set it in the Forecast column after saving.' : '.') + '</p>';
    h += '</div><footer><span class="small muted" style="margin-right:auto">Nothing is saved until you press Save inventory. Critical items stay critical until you clear them.</span><button class="btn" data-x="close">Cancel</button><button class="btn primary" data-x="apply"' + (S.canWrite ? '' : ' disabled') + '>Save inventory</button></footer></div>';
    back.innerHTML = h;
    back.querySelectorAll('[data-x="close"]').forEach(function (b) { b.onclick = function () { back.remove(); }; });
    back.querySelector('#icDate').onchange = function () { date = this.value || date; draw(); };
    back.querySelector('[data-x="apply"]').onclick = function () {
      back.remove();
      var d = JSON.parse(JSON.stringify(invDoc())); d.items = mg.items.concat(hiddenItems); d.asOf = date; d.source = book.name; d.updatedAt = new Date().toISOString();
      var snap = {}; mg.items.forEach(function (i) { if (!i.missing || i.missing !== date) snap[i.id] = i.qty; });
      var me = INV.monthEnd(date), kind = me ? 'Closing of ' + me.close + ' = opening of ' + me.open : p.kind.replace(/^month-end count: [^+]*/, 'weekly ');
      d.history = (d.history || []).concat([{ at: d.updatedAt, date: date, source: book.name, kind: kind, monthEnd: !!me, qty: snap }]).slice(-60);
      if (me) { d.months = d.months || {}; d.months[me.closeKey] = Object.assign({}, d.months[me.closeKey], { closing: snap, closingDate: date, source: book.name }); d.months[me.openKey] = Object.assign({}, d.months[me.openKey], { opening: snap, openingDate: date, source: book.name }); }
      d.kind = kind;
      d.items.forEach(function (i) { if (!i.missing) i.countAsOf = date; });
      S.inv.dirty = {};
      Promise.resolve(saveDoc('inventory', d)).then(function () { return syncForecastFromInventory(d.items, 'Inventory count ' + book.name); }).then(function (pl) {
        if (pl.missing.length) setTimeout(unitsToSheet, 200); else toast('Saved. The Overview now uses this count.');
        if (ATIC.teamPost) { var cr = mg.items.filter(function (i) { return i.critical && !i.missing; }), nw = mg.changes.filter(function (c) { return c.critNew; }).map(function (c) { return c.name; });
          ATIC.teamPost('📦', 'New inventory count ' + U.nice(date) + (INV.monthEnd(date) ? ' (closing of ' + INV.monthEnd(date).close + ')' : '') + ': ' + mg.items.filter(function (i) { return !i.missing; }).length + ' raw materials, ' + cr.length + ' critical' + (nw.length ? '. Newly critical: ' + nw.join(', ') : '') + '.', { href: 'materials.html#inventory', title: 'Inventory' }); }
      });
    };
  }
  draw();
}

/* =====================================================================================================
   RECEIVING: open orders for tracked raw materials or any inventory item; mark received in full or in part
   ===================================================================================================== */
function orderGot(o) { return (o.receipts || []).reduce(function (s, r) { return s + (Number(r.qty) || 0); }, 0); }
function orderItem(o) {
  if (o.inv) { var it = invById(o.inv); if (it) return { name: it.name + (it.packTxt ? ' (' + it.packTxt + ')' : ''), unit: o.unit || it.unit }; }
  if (o.material && typeof invItems === 'function') { var li = invItems().filter(function (i) { return i.mat === o.material && !i.missing && i.toApp > 0; })[0]; if (li) { var m0 = (run.cache ? run.cache.model.materials : BASE.materials).filter(function (x) { return x.id === o.material; })[0]; return { name: (m0 ? m0.name : li.name), unit: o.unit || (m0 ? m0.unit : li.unit), linked: li }; } }
  var m = (run.cache ? run.cache.model.materials : BASE.materials).filter(function (x) { return x.id === o.material; })[0];
  return { name: m ? m.name : (o.material || '?'), unit: o.unit || (m ? m.unit : '') };
}
function orderStatus(o) {
  var got = orderGot(o), q = Number(o.qty) || 0;
  if (o.status === 'cancelled') return { k: 'idle', t: 'Cancelled' };
  if (o.status === 'received' || o.status === 'closed') return got >= q - 1e-9 || !(o.receipts || []).length ? { k: 'ok', t: (o.receipts || []).length ? 'Received in full' : 'Received' } : { k: 'soon', t: 'Closed short: ' + fmtN(got) + ' of ' + fmtN(q) };
  if (got > 0) return { k: 'soon', t: 'Part received: ' + fmtN(got) + ' of ' + fmtN(q) };
  return o.eta && o.eta < TODAY ? { k: 'order', t: 'Late (due ' + U.nice(o.eta) + ')' } : { k: 'info', t: 'On the way' };
}
function orderPicker(fc) {
  var linked = {}; invItems().forEach(function (i) { if (i.mat) linked[i.mat] = 1; });
  var h = '<optgroup label="Raw materials in the forecast">' + fc.model.materials.map(function (x) { return '<option value="m:' + x.id + '">' + esc(x.name) + ' (' + esc(x.unit) + ')</option>'; }).join('') + '</optgroup>';
  var g = {}; invItems().forEach(function (i) { var k = (i.cat === 'raw' ? 'Inventory · raw' : 'Inventory · ') + (i.cat === 'raw' ? '' : i.group); (g[k] = g[k] || []).push(i); });
  Object.keys(g).forEach(function (k) { h += '<optgroup label="' + esc(k) + '">' + g[k].map(function (i) { return '<option value="i:' + esc(i.id) + '">' + esc(i.name) + (i.packTxt ? ' · ' + esc(i.packTxt) : '') + ' (' + esc(i.unit || '') + ')</option>'; }).join('') + '</optgroup>'; });
  return h;
}
function newOrder(sel, qty, eta, ref) {
  var o = { qty: qty, eta: eta, ref: ref, status: 'open', added: TODAY, receipts: [] };
  if (sel.indexOf('i:') === 0) {
    var it = invById(sel.slice(2)); o.inv = it.id; o.unit = it.unit; o.toInv = 1;
    if (it.mat && it.toApp) { o.material = it.mat; o.toApp = it.toApp; }
  } else {
    o.material = sel.slice(2); var m = run.cache.model.materials.filter(function (x) { return x.id === o.material; })[0]; o.unit = m ? m.unit : ''; o.toApp = 1;
    var li = invItems().filter(function (i) { return i.mat === o.material && i.toApp; })[0]; if (li) { o.inv = li.id; o.toInv = 1 / li.toApp; }
  }
  return o;
}
vOrders = function (fc) {
  var items = (S.saved.orders && S.saved.orders.items) || [];
  var open = [], done = []; items.forEach(function (o, i) { (o.status === 'received' || o.status === 'closed' || o.status === 'cancelled' ? done : open).push({ o: o, i: i }); });
  var h = head('Open orders & receiving', 'Orders already placed. What is still to come counts on its expected date; what arrives is added to the inventory the day you mark it received.', fileBtn('xlOrd', 'Import orders (Excel)'));
  h += accessNote(); h += lastSaved('orders');
  if (S.canWrite) h += '<div class="panel"><h3 style="font-size:16px;margin-bottom:8px">New order</h3><div class="row"><select id="oMat" style="max-width:340px;padding:8px;border:1px solid var(--line);border-radius:9px;background:var(--bg)">' + orderPicker(fc) + '</select>' +
    '<input id="oQty" type="number" step="any" placeholder="Quantity" style="width:120px;padding:8px;border:1px solid var(--line);border-radius:9px;background:var(--bg)"><span class="small muted" id="oUnit"></span>' +
    '<input id="oEta" type="date" title="Expected arrival" style="padding:8px;border:1px solid var(--line);border-radius:9px;background:var(--bg)">' +
    '<input id="oRef" placeholder="PO / supplier" style="padding:8px;border:1px solid var(--line);border-radius:9px;background:var(--bg)">' +
    '<button class="btn primary" id="oAdd">Add order</button></div>' + '' + '</div>';
  function rows(list, isOpen) {
    return '<div class="tablewrap"><table><thead><tr><th>Item</th><th class="n">Ordered</th><th class="n">Received</th><th class="n">Still to come</th><th>Expected</th><th>Reference</th><th>Status</th><th></th></tr></thead><tbody>' + list.map(function (x) {
      var o = x.o, it = orderItem(o), got = orderGot(o), st = orderStatus(o), rest = Math.max(0, (Number(o.qty) || 0) - got);
      var rc = (o.receipts || []).map(function (r) { return U.nice(r.date) + ': ' + fmtN(r.qty) + (r.note ? ' (' + esc(r.note) + ')' : ''); }).join('<br>');
      return '<tr><td><b>' + esc(it.name) + '</b>' + (o.inv ? '' : it.linked ? '<br><span class="small muted">received into: ' + esc(it.linked.name) + '</span>' : '<br><span class="small muted">no inventory line: receiving adds to the forecast stock</span>') + '</td><td class="n">' + fmtN(o.qty) + ' <span class="small muted">' + esc(it.unit) + '</span></td><td class="n">' + (got ? fmtN(got) : '') + (rc ? '<br><span class="small muted">' + rc + '</span>' : '') + '</td><td class="n">' + (isOpen && rest ? fmtN(rest) : '') + '</td><td>' + (o.eta ? U.nice(o.eta) : '') + '</td><td class="small">' + esc(o.ref || '') + '</td>' +
        '<td><span class="chip ' + st.k + '">' + esc(st.t) + '</span></td><td style="white-space:nowrap">' + (S.canWrite ? (isOpen ? '<button class="btn primary" data-recv="' + x.i + '">Mark received</button> ' : '') + '<button class="btn ghost" data-del="' + x.i + '">Remove</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  if (!open.length) h += '<div class="panel empty">No open orders. Add one above when a purchase order is placed.</div>';
  else h += rows(open, true);
  if (done.length) h += '<details class="panel"><summary><b>Received and closed orders (' + done.length + ')</b></summary><div style="margin-top:10px">' + rows(done.slice().reverse(), false) + '</div></details>';
  return h;
};
after.orders = function (fc) {
  var items = ((S.saved.orders && S.saved.orders.items) || []).slice();
  var f = $('#xlOrd'); if (f) f.onchange = function () { if (this.files[0]) ordersImport(this.files[0]); this.value = ''; };
  var sel = $('#oMat');
  function unitHint() { if (!sel) return; var v = sel.value, u = ''; if (v.indexOf('i:') === 0) { var it = invById(v.slice(2)); u = it ? it.unit : ''; } else { var m = fc.model.materials.filter(function (x) { return 'm:' + x.id === v; })[0]; u = m ? m.unit : ''; } $('#oUnit').textContent = u; }
  if (sel) { sel.onchange = unitHint; unitHint(); }
  var add = $('#oAdd'); if (add) add.onclick = function () {
    var q = +$('#oQty').value, eta = $('#oEta').value; if (!q || !eta) { toast('Enter a quantity and an expected arrival date.'); return; }
    items.push(newOrder(sel.value, q, eta, $('#oRef').value.trim())); saveDoc('orders', { items: items });
  };
  document.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { if (!b.dataset.arm) { b.dataset.arm = 1; b.textContent = 'Click again to remove'; setTimeout(function () { b.textContent = 'Remove'; delete b.dataset.arm; }, 4000); return; } items.splice(+b.dataset.del, 1); saveDoc('orders', { items: items }); }; });
  document.querySelectorAll('[data-recv]').forEach(function (b) { b.onclick = function () { receiveDialog(items, +b.dataset.recv); }; });
};
function receiveDialog(items, idx) {
  X.ensureCss();
  var o = JSON.parse(JSON.stringify(items[idx])), it = orderItem(o), got = orderGot(o), q = Number(o.qty) || 0, rest = Math.max(0, q - got);
  var inv = o.inv ? invById(o.inv) : null;
  /* orders made on a forecast material (e.g. imported from Odoo) go to that material's inventory line too */
  if (!inv && o.material) { var cand = invItems().filter(function (i) { return i.mat === o.material && !i.missing && i.toApp > 0; }); if (cand.length) { inv = cand[0]; o.toInv = (Number(o.toApp) || 1) / inv.toApp; } }
  var back = document.createElement('div'); back.className = 'xd-back'; document.body.appendChild(back);
  var st = { full: true, qty: rest, date: TODAY, keep: true, eta: o.eta && o.eta > TODAY ? o.eta : U.addDays(TODAY, 7), note: '' };
  function draw() {
    var recv = st.full ? rest : (+st.qty || 0), left = Math.max(0, rest - recv);
    var h = '<div class="xd" role="dialog" aria-modal="true" aria-label="Mark received" style="width:min(620px,100%)"><header><div><h2>Mark received</h2><p class="small muted" style="margin:4px 0 0">' + esc(it.name) + (o.ref ? ' · ' + esc(o.ref) : '') + '</p></div><button class="btn ghost" data-x="close" aria-label="Close">✕</button></header><div class="body">';
    h += '<p class="sum" style="margin:0">Ordered <b>' + fmtN(q) + ' ' + esc(it.unit) + '</b>' + (got ? ' · already received <b>' + fmtN(got) + '</b>' : '') + ' · still to come <b>' + fmtN(rest) + '</b></p>';
    h += '<div style="display:flex;flex-direction:column;gap:8px"><label class="dd"><input type="radio" name="rf" value="full"' + (st.full ? ' checked' : '') + '> <span><b>Full quantity</b> arrived: ' + fmtN(rest) + ' ' + esc(it.unit) + '</span></label>' +
      '<label class="dd"><input type="radio" name="rf" value="part"' + (st.full ? '' : ' checked') + '> <span><b>Part of it</b>, quantity received:</span> <input type="number" step="any" min="0" id="rQty" value="' + (st.full ? '' : st.qty) + '" ' + (st.full ? 'disabled' : '') + ' style="width:110px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg)"> ' + esc(it.unit) + '</label></div>';
    if (!st.full && recv > rest + 1e-9) h += '<div class="callout">More than ordered (' + fmtN(recv - rest) + ' extra). That is fine if the supplier sent extra; the order will close as received.</div>';
    if (!st.full && left > 0) h += '<div style="display:flex;flex-direction:column;gap:6px;padding-left:22px"><label class="dd small"><input type="radio" name="rk" value="keep"' + (st.keep ? ' checked' : '') + '> The rest (' + fmtN(left) + ') is still coming, expected <input type="date" id="rEta" value="' + esc(st.eta) + '" style="padding:5px 7px;border:1px solid var(--line);border-radius:7px;background:var(--bg)"></label><label class="dd small"><input type="radio" name="rk" value="close"' + (st.keep ? '' : ' checked') + '> Nothing more is coming: close the order short</label></div>';
    h += '<div class="top"><label>Date received<input type="date" id="rDate" value="' + esc(st.date) + '" max="' + U.addDays(TODAY, 1) + '" style="padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg)"></label><label style="flex:1">Note (GRN / Odoo receipt)<input id="rNote" value="' + esc(st.note) + '" style="padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg)"></label></div>';
    var eff = [];
    if (inv && o.toInv) eff.push('Inventory: <b>' + esc(inv.name) + '</b> ' + fmtN(inv.qty) + ' → <b>' + fmtN((Number(inv.qty) || 0) + recv * o.toInv) + '</b> ' + esc(inv.unit));
    else eff.push('<span style="color:var(--amber)">No inventory line is linked to this order, so only the forecast changes.</span>');
    if (o.material) eff.push('Raw material forecast: +' + fmtN(recv * (Number(o.toApp) || 1)) + ' ' + esc(mat(o.material) ? mat(o.material).unit : '') + ' on ' + U.nice(st.date) + ((S.saved.stock && S.saved.stock.items && S.saved.stock.items[o.material] && S.saved.stock.items[o.material].asOf >= st.date) ? ' <span class="muted">(already inside the count of ' + U.nice(S.saved.stock.items[o.material].asOf) + ', so not added again)</span>' : ''));
    h += '<ul class="why" style="margin:0">' + eff.map(function (e) { return '<li>' + e + '</li>'; }).join('') + '</ul>';
    h += '</div><footer><button class="btn" data-x="close">Cancel</button><button class="btn primary" data-x="ok"' + (recv > 0 && st.date ? '' : ' disabled') + '>Confirm received</button></footer></div>';
    back.innerHTML = h;
    back.querySelectorAll('[data-x="close"]').forEach(function (b) { b.onclick = function () { back.remove(); }; });
    back.querySelectorAll('[name="rf"]').forEach(function (r) { r.onchange = function () { st.full = r.value === 'full'; if (!st.full && !st.qty) st.qty = ''; draw(); var e = back.querySelector('#rQty'); if (e && !st.full) e.focus(); }; });
    var rq = back.querySelector('#rQty'); if (rq) rq.oninput = function () { st.qty = rq.value; clearTimeout(draw.t); draw.t = setTimeout(function () { draw(); var e = back.querySelector('#rQty'); if (e) { e.focus(); e.setSelectionRange && e.type === 'text' && e.setSelectionRange(e.value.length, e.value.length); } }, 450); };
    back.querySelectorAll('[name="rk"]').forEach(function (r) { r.onchange = function () { st.keep = r.value === 'keep'; draw(); }; });
    var re = back.querySelector('#rEta'); if (re) re.onchange = function () { st.eta = re.value; };
    back.querySelector('#rDate').onchange = function () { st.date = this.value; draw(); };
    back.querySelector('#rNote').oninput = function () { st.note = this.value; };
    back.querySelector('[data-x="ok"]').onclick = function () {
      var recv2 = st.full ? rest : (+back.querySelector('#rQty').value || 0); if (!(recv2 > 0)) return;
      /* inCount: this receipt is added straight to the count (inventory line and forecast stock), so the forecast does not add it again */
      o.receipts = (o.receipts || []).concat([{ date: st.date, qty: recv2, note: st.note, at: new Date().toISOString(), full: !!st.full, inCount: true }]);
      var left2 = Math.max(0, rest - recv2);
      if (st.full || left2 <= 1e-9) o.status = 'received';
      else if (st.keep) { o.status = 'partial'; if (st.eta) o.eta = st.eta; }
      else o.status = 'closed';
      var list = items.slice(); list[idx] = o; back.remove();
      var by = (S.profile && (S.profile.full_name || S.profile.username)) || '';
      var p = Promise.resolve();
      if (inv && o.toInv) {
        var d = JSON.parse(JSON.stringify(invDoc())), x = d.items.filter(function (i) { return i.id === inv.id; })[0];
        x.qty = Math.round(((Number(x.qty) || 0) + recv2 * o.toInv) * 1000) / 1000; x.source = 'Received ' + U.nice(st.date) + (o.ref ? ' · ' + o.ref : '');
        d.moves = (d.moves || []).concat([{ at: new Date().toISOString(), date: st.date, id: x.id, qty: recv2 * o.toInv, kind: 'receipt', ref: [o.ref, st.note, st.full ? 'full quantity' : 'part: ' + fmtN(recv2) + ' of ' + fmtN(q)].filter(Boolean).join(' · '), by: by }]).slice(-300);
        p = Promise.resolve(saveDoc('inventory', d)).then(function () { return syncForecastFromInventory(d.items, 'Received ' + it.name); });
      }
      if (!(inv && o.toInv) && o.material) { /* no inventory line: the forecast stock goes up directly */
        var stk = JSON.parse(JSON.stringify((S.saved.stock && S.saved.stock.items) || {})), cur = stk[o.material] || BASE.stock[o.material] || { qty: 0, asOf: TODAY };
        stk[o.material] = { qty: Math.round(((Number(cur.qty) || 0) + recv2 * (Number(o.toApp) || 1)) * 1000) / 1000, asOf: cur.asOf || TODAY, source: 'Received ' + U.nice(st.date) + (o.ref ? ' · ' + o.ref : '') + ' (on top of the count of ' + (cur.asOf ? U.nice(cur.asOf) : '–') + ')' };
        p = Promise.resolve(saveDoc('stock', Object.assign({}, S.saved.stock || {}, { items: stk, updatedAt: new Date().toISOString() })));
      }
      p.then(function () { return saveDoc('orders', { items: list }); }).then(function () {
        if (ATIC.teamPost) ATIC.teamPost('🚚', 'Received ' + (st.full || left2 <= 1e-9 ? 'in full: ' : 'part: ') + fmtN(recv2) + ' ' + it.unit + ' ' + it.name + (o.ref ? ' (' + o.ref + ')' : '') + (o.status === 'partial' ? '; ' + fmtN(left2) + ' still to come' : o.status === 'closed' ? '; order closed short' : '') + '.', { href: 'materials.html#orders', title: 'Orders & receiving' });
        toast(st.full || left2 <= 1e-9 ? 'Received in full and added to the inventory.' : 'Received ' + fmtN(recv2) + ' of ' + fmtN(rest) + (o.status === 'partial' ? '; the rest stays open.' : '; order closed short.'));
      });
    };
  }
  draw();
}

/* ---------- one unit with the sheet: a tracked material whose sheet unit cannot be converted (e.g. orange flavour:
   sheet in 10 kg cans, forecast in gal) is switched to the sheet's unit, so every count fills it directly.
   The recipe per batch follows: from kg it is exact (kg ÷ kg per can); from the old unit it keeps the same number
   (a "galon" at ATIC is the container), shown on the Recipes page to check. Runs once per material, for editors. */
function unitsToSheet() {
  if (!S.canWrite || unitsToSheet.busy || !BASE || !run.cache) return;
  var inv = invDoc(), items = inv.items || [], model = run.cache.model, todo = {}, relinked = [];
  items.forEach(function (i) {
    if (i.cat !== 'raw' || i.missing) return;
    var fm = FLAV.test(i.name) ? flavourMatch(i.name, matList()) : null;
    if ((!i.mat || (fm && fm.item.id !== i.mat)) && (fm || !i.mat)) { var l = invLink(i); if (l.mat && l.mat !== i.mat) { i.mat = l.mat; i.toApp = l.toApp; relinked.push(i.name + ' → ' + mat(l.mat).name); } }
  });
  items.forEach(function (i) { if (i.cat === 'raw' && i.mat && !i.missing && !(i.toApp > 0) && i.unit) todo[i.mat] = todo[i.mat] || i; });
  var ids = Object.keys(todo);
  if (!ids.length) {
    if (!relinked.length) return;
    unitsToSheet.busy = true;
    var d0 = JSON.parse(JSON.stringify(inv)); d0.items = items;
    Promise.resolve(saveDoc('inventory', d0)).then(function () { return syncForecastFromInventory(d0.items, 'Inventory lines linked: ' + relinked.join(', ')); })
      .then(function () { unitsToSheet.busy = false; toast('Linked ' + relinked.join(', ')); render(); }).catch(function () { unitsToSheet.busy = false; });
    return;
  }
  unitsToSheet.busy = true;
  var mats = JSON.parse(JSON.stringify((S.saved.materials && S.saved.materials.items) || {})), rec = JSON.parse(JSON.stringify(model.recipes)), notes = [];
  ids.forEach(function (id) {
    var m = mat(id); if (!m) return;
    var line = todo[id], nu = String(line.unit).toLowerCase(), pack = line.pack || INV.parsePack(line.packTxt);
    var ru = unitWord(m.recipeUnit || m.unit), rf = Number(m.recipeFactor) || 1, k, how;
    if (pack && pack.size && (ru === 'kg' || ru === 'l') && INV.unitWord(pack.of) === ru) { k = rf / pack.size; how = 'recipe in ' + ru + ' ÷ ' + pack.size + ' ' + ru + ' per ' + nu; }
    else { k = 1; how = 'recipe kept at the same number per batch (1 ' + m.unit + ' read as 1 ' + nu + ')'; }
    Object.keys(rec).forEach(function (p) { Object.keys(rec[p] || {}).forEach(function (sec) { var r = rec[p][sec]; if (r && r[id] != null) r[id] = Math.round(r[id] * k * 10000) / 10000; }); });
    mats[id] = Object.assign({}, mats[id] || {}, { unit: nu, recipeUnit: nu, recipeFactor: 1, countUnit: INV.unitWord(nu), countFactor: 1, unitFrom: m.unit, unitChanged: TODAY, unitHow: how });
    items.forEach(function (i) { if (i.mat === id && INV.unitWord(i.unit) === INV.unitWord(nu)) i.toApp = 1; });
    notes.push(m.name + ': now counted in ' + nu + 's like the sheet (' + how + ')');
  });
  var d = JSON.parse(JSON.stringify(inv)); d.items = items;
  // stock already saved in the old unit for these materials is replaced by the inventory count below
  Promise.resolve(saveDoc('materials', { items: mats }))
    .then(function () { return saveDoc('recipes', { recipes: rec, updatedAt: new Date().toISOString() }); })
    .then(function () { return saveDoc('inventory', d); })
    .then(function () { return syncForecastFromInventory(d.items, 'Unit set to the sheet\'s unit'); })
    .then(function () { S.unitNotes = notes; unitsToSheet.busy = false; render(); toast((relinked.length ? 'Linked ' + relinked.join(', ') + '. ' : '') + notes.length + ' material' + (notes.length === 1 ? '' : 's') + ' now filled from the sheet.'); })
    .catch(function () { unitsToSheet.busy = false; });
}
(function waitUnits() { if (window.ATIC && ATIC.profile && BASE && run.cache && S.saved) { ATIC.whenShown(function () { setTimeout(unitsToSheet, 300); }); } else setTimeout(waitUnits, 300); })();
(function () {
  var _vRec2 = vRecipes;
  vRecipes = function (fc) {
    var h = _vRec2(fc), ch = fc.model.materials.filter(function (m) { return m.unitChanged; });
    if (!ch.length) return h;
    var note = '<div class="callout"><span><b>Counted like the inventory sheet:</b> ' + ch.map(function (m) { return esc(m.name) + ' in ' + esc(m.unit) + 's since ' + U.nice(m.unitChanged) + ' (was ' + esc(m.unitFrom) + '; ' + esc(m.unitHow) + ')'; }).join(' · ') + '. Check the per-batch amounts below are in that unit.</span></div>';
    var i = h.indexOf('<div class="panel'); return i < 0 ? h + note : h.slice(0, i) + note + h.slice(i);
  };
})();

/* ---------- statuses stay as you set them: "Not in use" only when ticked on the Inventory page ---------- */
var STATUS_RANK = { order: 0, soon: 1, ok: 2, idle: 3 };
function unusedByHand(id) { var l = invItems().filter(function (i) { return i.mat === id && !i.missing; }); return l.length > 0 && l.every(function (i) { return i.notInUse; }); }
(function () {
  var _run = run;
  run = function () {
    var fc = _run();
    fc.results.forEach(function (r) {
      if (unusedByHand(r.id)) { r.status = 'idle'; r.byHand = true; r.why = ['Marked "Not in use" on the Inventory page. Untick it there to forecast it again.'].concat(r.why || []); }
      else if (r.status === 'idle') { r.status = 'ok'; r.why = ['No production that uses it is planned or in the history pace right now, so nothing is being used up. It stays "Enough stock" until production uses it or you mark it Not in use.'].concat((r.why || []).filter(function (w) { return !/None of the current recipes/.test(w); })); }
    });
    fc.results.sort(function (a, b) { return (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || ((a.daysToOrder == null ? 1e9 : a.daysToOrder) - (b.daysToOrder == null ? 1e9 : b.daysToOrder)); });
    return fc;
  };
})();
/* the name ATIC uses: Orange Blossom Flavour (saved once, so every page shows it) */
function fixNames() {
  if (!S.canWrite || fixNames.done || !BASE) return; fixNames.done = true;
  var mats = JSON.parse(JSON.stringify((S.saved.materials && S.saved.materials.items) || {})), ch = false;
  BASE.materials.forEach(function (m) {
    var cur = (mats[m.id] && mats[m.id].name) || m.name;
    if (/orange/i.test(cur) && /flavou?r|aroma/i.test(cur) && !/water/i.test(cur) && cur !== 'Orange Blossom Flavour') { mats[m.id] = Object.assign({}, mats[m.id] || {}, { name: 'Orange Blossom Flavour' }); ch = true; }
  });
  if (ch) saveDoc('materials', { items: mats });
}
(function waitNames() { if (window.ATIC && ATIC.profile && BASE && S.saved) ATIC.whenShown(function () { setTimeout(fixNames, 200); }); else setTimeout(waitNames, 300); })();

/* the two numbers: exactly what was counted, and the estimate since (used by the batches made, received, left now).
   "Now" = every finished day up to yesterday, plus today when today's actual is already in the Line Planner. */
function stockNumbers(r) {
  var st = (run.cache && run.cache.model.stock[r.id]) || null; if (!st || st.qty == null || !st.asOf) return null;
  var cut = (LP.days[TODAY] || (S.saved.daily && S.saved.daily.days && S.saved.daily.days[TODAY])) ? TODAY : U.addDays(TODAY, -1);
  var used = r.usedSinceCount || 0, ws = r.weeks && r.weeks[0] ? r.weeks[0].start : null;
  (r.daily || []).forEach(function (x) { if (x.date > st.asOf && x.date <= cut && (!ws || x.date >= ws)) used += x.use; });
  var rec = 0; E.orderEvents((S.saved.orders && S.saved.orders.items) || []).forEach(function (o) { if (o.material === r.id && o.received && o.eta > st.asOf && o.eta <= cut) rec += Number(o.qty) || 0; });
  return { counted: Number(st.qty) || 0, asOf: st.asOf, used: used, received: rec, left: (Number(st.qty) || 0) + rec - used, until: cut };
}

/* ---------- Overview cards: what the inventory says ---------- */
(function () {
  var _card = card;
  card = function (r) {
    var h = _card(r), lines = invItems().filter(function (i) { return i.mat === r.id && !i.missing; });
    var n = stockNumbers(r);
    if (n) h = h.replace(/<dt>Stock now<\/dt><dd>[^<]*<\/dd>/, '<dt title="Exactly what was submitted in the count">Counted ' + U.nice(n.asOf) + '</dt><dd><b>' + fmtN(n.counted) + '</b></dd>' +
      (n.received ? '<dt>Received since</dt><dd>+' + fmtN(n.received) + '</dd>' : '') +
      '<dt title="Batches made since the count × recipe (Daily consumption)">Est. used since</dt><dd>' + fmtN(n.used) + '</dd><dt title="Counted + received − used">Est. left now</dt><dd><b>' + fmtN(Math.max(0, n.left)) + '</b></dd>');
    if (!lines.length) return h;
    var crit = lines.some(function (i) { return i.critical; }), need = lines.filter(function (i) { return !(i.toApp > 0) && Number(i.qty); }).length;
    var txt = lines.map(function (i) { return fmtN(i.qty) + ' ' + esc(String(i.unit).toLowerCase()); }).join(' + ');
    var add = '<div class="invline small"><span>Inventory ' + (lines[0].countAsOf || lines[0].asOf ? U.nice(lines[0].countAsOf || lines[0].asOf) : '') + ': <b>' + txt + '</b></span>' + (crit ? '<span class="chip order" style="padding:1px 8px">Critical</span>' : '') + (need ? '<span style="color:var(--amber)">needs a unit conversion</span>' : '') + '</div>';
    return h.replace(/<\/button>$/, add + '</button>');
  };
})();

/* ---------- Import / Export button: what this page can read and write ---------- */
function invReport(onlyCrit) {
  var d = invDoc(), its = invItems().filter(function (i) { return !onlyCrit || i.critical; }), secs = [];
  (INV_ONLY ? [INV_ONLY] : ['raw', 'pack']).forEach(function (c) {
    var rows = its.filter(function (i) { return i.cat === c; }).map(function (i) { return [i.group, i.name, i.packTxt || '', i.qty == null ? '' : i.qty, i.unit || '', i.critical ? 'CRITICAL' : '', [i.enough, i.use].filter(Boolean).join(' · '), i.needOrder ? 'Need to order' : '', openOnItem(i.id) || '', [i.qtyText ? 'File: ' + i.qtyText : '', i.note].filter(Boolean).join(' · '), i.asOf || '']; });
    if (rows.length) secs.push({ title: c === 'raw' ? 'Raw materials' : 'Packaging', columns: ['Group', 'Item', 'Packing', 'Quantity', 'Unit', 'Critical', 'Cover / use', 'Order', 'On order', 'Notes', 'As of'], rows: rows });
  });
  return { title: onlyCrit ? 'Critical stock' : 'Inventory', subtitle: 'Count of ' + (d.asOf ? U.nice(d.asOf) : '–') + (d.source ? ' (' + d.source + ')' : '') + ' plus deliveries received since · exported ' + new Date().toLocaleString('en-GB'), sections: secs };
}
function ordersReport() {
  var items = (S.saved.orders && S.saved.orders.items) || [];
  return { title: 'Orders and receiving', subtitle: 'Exported ' + new Date().toLocaleString('en-GB'), sections: [{ title: 'Orders', columns: ['Item', 'Ordered', 'Unit', 'Received', 'Still to come', 'Expected', 'Reference', 'Status', 'Receipts'],
    rows: items.map(function (o) { var it = orderItem(o), got = orderGot(o), open = !(o.status === 'received' || o.status === 'closed' || o.status === 'cancelled'); return [it.name, Number(o.qty) || 0, it.unit, got, open ? Math.max(0, (Number(o.qty) || 0) - got) : 0, o.eta || '', o.ref || '', orderStatus(o).t, (o.receipts || []).map(function (r) { return r.date + ': ' + r.qty + (r.note ? ' (' + r.note + ')' : ''); }).join('; ')]; }) }] };
}
function outlookReport() {
  var fc = run.cache || run();
  return { title: 'Raw material outlook', subtitle: 'Today ' + U.nice(TODAY) + ' · exported ' + new Date().toLocaleString('en-GB'), sections: [{ title: 'Outlook', columns: ['Material', 'Unit', 'Status', 'Stock now', 'Use per week', 'Weeks of cover', 'Runs out', 'Order by', 'Suggested order', 'Why'],
    rows: fc.results.map(function (r) { return [r.name, r.unit, STATUS[r.status], Math.round(Math.max(0, r.stockNow) * 10) / 10, Math.round(r.weekly * 10) / 10, r.weeksCover == null ? '' : Math.round(r.weeksCover * 10) / 10, r.runOut || '', r.status === 'order' ? 'Now' : (r.orderBy || ''), r.suggestedQty || '', (r.why || []).join(' ')]; }) }] };
}
function registerIO() {
  if (!window.ATIC || !ATIC.io || registerIO.done) return; registerIO.done = true;
  ATIC.io.register({
    exports: [
      { label: 'Inventory', hint: 'Raw materials, critical marked', build: function () { return invReport(false); } },
      { label: 'Critical stock', hint: 'Only the critical items', build: function () { return invReport(true); } },
      { label: 'Orders & receiving', hint: 'Ordered, received, still to come', build: ordersReport },
      { label: 'Raw material outlook', hint: 'Status, cover, run-out and order dates', build: outlookReport }
    ],
    imports: [
      { label: 'Inventory count (weekly or monthly)', hint: 'Weekly or month-end file: Raw Material and CRITICAL STOCK sheets', run: function (f) { go('inventory'); invImport(f); } },
      { label: 'Factory plan', hint: 'The weekly production plan', run: function (f) { go('forecast'); importPlan(f, function (rs, source) { var dv = deriveDays(rs); S.saved.plan = { runs: rs, days: dv.days, from: dv.from, to: dv.to, weeks: [], source: source, updatedAt: new Date().toISOString(), unsaved: true }; render(); }); } },
      { label: 'Open orders', hint: 'One row per order line', run: function (f) { go('orders'); ordersImport(f); } },
      { label: 'Recipes', hint: 'Per batch, per product and section', run: function (f) { go('recipes'); recipesImport(f); } }
    ]
  });
}
(function waitIO() { if (window.ATIC && ATIC.profile && BASE) registerIO(); else setTimeout(waitIO, 200); })();

/* ---------- Overview filters: one "Filters" button with a menu, active filters as removable chips ---------- */
S.of = { status: null, crit: false, fin: false, prod: null, within: null, order: null }; S.ofOpen = false;
function ofCrit(r) { return invItems().some(function (i) { return i.mat === r.id && i.critical && !i.missing; }); }
/* finished = nothing left: the inventory lines are all 0 (e.g. caramel), or the forecast says none is left today */
function ofFinished(r) { var l = invItems().filter(function (i) { return i.mat === r.id && !i.missing; }); return l.length ? l.every(function (i) { return !(Number(i.qty) > 0); }) : r.stockNow <= 0.0001; }
function ofUses(fc, r, p) { var rp = fc.model.recipes[p] || {}; return Object.keys(rp).some(function (s) { return Number((rp[s] || {})[r.id]) > 0; }); }
function ofMatch(r, fc) {
  var f = S.of;
  if (f.status && r.status !== f.status) return false;
  if (f.crit && !ofCrit(r)) return false;
  if (f.fin && !ofFinished(r)) return false;
  if (f.prod && !ofUses(fc, r, f.prod)) return false;
  if (f.within && !(r.runOut && U.diffDays(TODAY, r.runOut) <= f.within)) return false;
  if (f.order === 'onway' && !(r.openOrders && r.openOrders.length)) return false;
  if (f.order === 'none' && (!r.active || (r.openOrders && r.openOrders.length))) return false;
  return true;
}
var OF_LAB = { status: { order: 'Order now', soon: 'Order within 3 weeks', ok: 'Enough stock', idle: 'Not in use (set by you)' }, within: { 7: 'Runs out in 7 days', 14: 'Runs out in 14 days', 30: 'Runs out in 30 days' }, order: { onway: 'Order on the way', none: 'Nothing ordered yet' } };
function ofBar(fc) {
  var f = S.of, R = fc.results;
  var prods = fc.model.products.map(function (p) { return p.id; }).filter(function (p) { return R.some(function (r) { return ofUses(fc, r, p); }); });
  var n = function (fn) { return R.filter(fn).length; };
  var opt = function (k, v, label, cnt) { var on = f[k] === v; return '<button type="button" class="ofo" data-of="' + k + '" data-v="' + v + '" aria-pressed="' + on + '"><span class="ck" aria-hidden="true"></span><span>' + label + '</span><span class="ofn">' + cnt + '</span></button>'; };
  var tog = function (k, label, cnt) { return '<button type="button" class="ofo" data-oft="' + k + '" aria-pressed="' + !!f[k] + '"><span class="ck" aria-hidden="true"></span><span>' + label + '</span><span class="ofn">' + cnt + '</span></button>'; };
  var chips = [];
  if (f.status) chips.push(['status', OF_LAB.status[f.status]]);
  if (f.crit) chips.push(['crit', 'Critical']);
  if (f.fin) chips.push(['fin', 'Finished']);
  if (f.within) chips.push(['within', OF_LAB.within[f.within]]);
  if (f.order) chips.push(['order', OF_LAB.order[f.order]]);
  if (f.prod) chips.push(['prod', 'Used by ' + (PN[f.prod] || f.prod)]);
  var h = '<div class="oftool"><div class="ofwrap"><button type="button" class="btn ofbtn' + (chips.length ? ' on' : '') + '" id="ofBtn" aria-expanded="' + S.ofOpen + '" aria-haspopup="true"><svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 5h18l-7 8v6l-4 2v-8z"/></svg> Filters' + (chips.length ? ' <span class="ofc">' + chips.length + '</span>' : '') + ' <span aria-hidden="true">▾</span></button>';
  if (S.ofOpen) {
    h += '<div class="ofmenu" role="dialog" aria-label="Filters">' +
      '<div class="ofg"><h4>Status</h4>' + ['order', 'soon', 'ok', 'idle'].map(function (k) { return opt('status', k, OF_LAB.status[k], n(function (r) { return r.status === k; })); }).join('') + '</div>' +
      '<div class="ofg"><h4>Stock</h4>' + tog('crit', 'Critical (inventory sheet)', n(ofCrit)) + tog('fin', 'Finished: nothing left', n(ofFinished)) +
        [7, 14, 30].map(function (d) { return opt('within', d, OF_LAB.within[d], n(function (r) { return r.runOut && U.diffDays(TODAY, r.runOut) <= d; })); }).join('') + '</div>' +
      '<div class="ofg"><h4>Orders</h4>' + opt('order', 'onway', OF_LAB.order.onway, n(function (r) { return r.openOrders && r.openOrders.length; })) + opt('order', 'none', OF_LAB.order.none, n(function (r) { return r.active && !(r.openOrders && r.openOrders.length); })) + '</div>' +
      '<div class="ofg"><h4>Used by</h4>' + prods.map(function (p) { return opt('prod', p, esc(PN[p] || p), n(function (r) { return ofUses(fc, r, p); })); }).join('') + '</div>' +
      '<div class="offoot"><button type="button" class="btn ghost" data-ofx="clear">Clear all</button><button type="button" class="btn primary" data-ofx="done">Done</button></div></div>';
  }
  h += '</div>' + chips.map(function (c) { return '<span class="ofchip">' + esc(c[1]) + '<button type="button" data-ofrm="' + c[0] + '" aria-label="Remove ' + esc(c[1]) + '">×</button></span>'; }).join('') +
    '<span class="small muted" id="ofCount" style="margin-left:auto"></span></div>';
  return h;
}
(function () {
  var _vOv = vOverview, _aOv = after.overview;
  vOverview = function (fc) {
    var h = _vOv(fc), i = h.indexOf('<div class="legend">');
    return i < 0 ? h + ofBar(fc) : h.slice(0, i) + ofBar(fc) + h.slice(i);
  };
  after.overview = function (fc) {
    _aOv(fc);
    ofRefresh(fc, true);
  };
  /* filters change the page in place: no rebuild, no reload, the menu stays where it is */
  function ofRefresh(fc, first) {
    var keep = function () { ofRefresh(fc); };
    var tool = document.querySelector('#main .oftool');
    if (!first && tool) { var tmp = document.createElement('div'); tmp.innerHTML = ofBar(fc); tool.replaceWith(tmp.firstChild); }
    var shown = 0;
    document.querySelectorAll('.card[data-m]').forEach(function (el) { var r = fc.results.filter(function (x) { return x.id === el.dataset.m; })[0]; var ok = !r || ofMatch(r, fc); el.hidden = !ok; if (ok) shown++; });
    var c = $('#ofCount'); if (c) c.textContent = 'Showing ' + shown + ' of ' + fc.results.length;
    var none = $('#ofNone'); if (none) none.remove();
    var grid = document.querySelector('#main .grid'); if (grid && !shown) grid.insertAdjacentHTML('afterend', '<div class="panel empty" id="ofNone">No material matches these filters. <button class="btn ghost" data-ofx="clear">Clear filters</button></div>');
    document.querySelectorAll('#main .kpis .kpi').forEach(function (k) {
      var st = ['order', 'soon', 'ok'].filter(function (x) { return k.classList.contains(x); })[0]; if (!st) return;
      k.classList.add('ofk'); k.setAttribute('role', 'button'); k.tabIndex = 0; k.setAttribute('aria-pressed', S.of.status === st); k.title = 'Show only these';
      k.classList.toggle('on', S.of.status === st);
      k.onclick = k.onkeydown = function (e) { if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return; S.of.status = S.of.status === st ? null : st; keep(); };
    });
    var b = $('#ofBtn'); if (b) b.onclick = function (e) { e.stopPropagation(); S.ofOpen = !S.ofOpen; keep(); };
    document.querySelectorAll('[data-of]').forEach(function (x) { x.onclick = function (e) { e.stopPropagation(); var k = x.dataset.of, v = k === 'within' ? +x.dataset.v : x.dataset.v; S.of[k] = S.of[k] === v ? null : v; keep(); }; });
    document.querySelectorAll('[data-oft]').forEach(function (x) { x.onclick = function (e) { e.stopPropagation(); S.of[x.dataset.oft] = !S.of[x.dataset.oft]; keep(); }; });
    document.querySelectorAll('[data-ofrm]').forEach(function (x) { x.onclick = function (e) { e.stopPropagation(); var k = x.dataset.ofrm; S.of[k] = (k === 'crit' || k === 'fin') ? false : null; keep(); }; });
    document.querySelectorAll('[data-ofx]').forEach(function (x) { x.onclick = function (e) { e.stopPropagation(); if (x.dataset.ofx === 'clear') S.of = { status: null, crit: false, fin: false, prod: null, within: null, order: null }; else S.ofOpen = false; keep(); }; });
    var menu = document.querySelector('.ofmenu'); if (menu) menu.onclick = function (e) { e.stopPropagation(); };
    if (!ofRefresh.bound) { ofRefresh.bound = true;
      document.addEventListener('click', function () { if (S.ofOpen && document.querySelector('.ofmenu')) { S.ofOpen = false; ofRefresh(run.cache); } });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.ofOpen) { S.ofOpen = false; if (document.querySelector('.ofmenu')) ofRefresh(run.cache); } });
    }
  }
})();


/* =====================================================================================================
   USAGE: REAL VS PLAN. Every saved inventory count (weekly or month-end) is compared with the one before:
   really used = before + received − after (inventory units × conversion = forecast units)
   batches say = batches prepared in the Line Planner actuals × recipe. Plus this month: what the plan expects.
   ===================================================================================================== */
S.us = { period: null, month: null };
function usCounts() {
  var h = (invDoc().history || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.at < b.at ? -1 : 1); });
  var by = {}; h.forEach(function (x) { if (x.date) by[x.date] = x; }); // the last save of a day wins
  return Object.keys(by).sort().map(function (d) { return by[d]; });
}
/* inventory snapshot {itemId: qty} → {materialId: qty in forecast units}; lines with no conversion are listed */
function usToMat(snap) {
  var out = {}, miss = {};
  invItems().forEach(function (i) {
    if (!i.mat || snap[i.id] == null) return;
    if (!(i.toApp > 0)) { miss[i.mat] = 1; return; }
    out[i.mat] = (out[i.mat] || 0) + (Number(snap[i.id]) || 0) * i.toApp;
  });
  return { qty: out, miss: miss };
}
function usReceived(from, to) { // receipts after `from`, up to and including `to`
  var out = {};
  E.orderEvents((S.saved.orders && S.saved.orders.items) || []).forEach(function (o) { if (o.received && o.eta > from && o.eta <= to) out[o.material] = (out[o.material] || 0) + (Number(o.qty) || 0); });
  return out;
}
function usExpected(model, from, to) { // days after `from` up to `to`: batches prepared × recipe
  var out = {}, days = 0, missing = [];
  for (var d = U.addDays(from, 1); d <= to; d = U.addDays(d, 1)) {
    if (new Date(d + 'T00:00:00Z').getUTCDay() === 5) continue; // Friday off
    var ad = LP.days[d];
    if (!ad && !LP.secs[d]) { missing.push(d); continue; }
    days++;
    Object.keys(ad || {}).forEach(function (k) { var p = k.split('|'), r = (model.recipes[p[0]] || {})[p[1]] || {}; Object.keys(r).forEach(function (m) { out[m] = (out[m] || 0) + (Number(r[m]) || 0) * ad[k]; }); });
  }
  return { qty: out, days: days, missing: missing };
}
function usPeriod(model, a, b) {
  var A0 = usToMat(a.qty || {}), B0 = usToMat(b.qty || {}), rec = usReceived(a.date, b.date), ex = usExpected(model, a.date, b.date);
  var rows = model.materials.filter(function (m) { return A0.qty[m.id] != null && B0.qty[m.id] != null; }).map(function (m) {
    var before = A0.qty[m.id], after = B0.qty[m.id], got = rec[m.id] || 0, used = before + got - after, exp = ex.qty[m.id] || 0, gap = used - exp;
    return { id: m.id, name: m.name, unit: m.unit, before: before, received: got, after: after, used: used, expected: exp, gap: gap, pct: exp > 0 ? gap / exp : null };
  });
  var skipped = model.materials.filter(function (m) { return (A0.miss[m.id] || B0.miss[m.id]); }).map(function (m) { return m.name; });
  return { from: a.date, to: b.date, fromSrc: a.source, toSrc: b.source, rows: rows, missing: ex.missing, days: ex.days, skipped: skipped };
}
function usGapCls(r) { return r.pct == null ? (Math.abs(r.gap) > 0.5 && r.used > 0 ? 'warn' : '') : Math.abs(r.pct) > 0.25 ? 'bad' : Math.abs(r.pct) > 0.1 ? 'warn' : 'good'; }
function usTable(per) {
  return '<div class="tablewrap"><table class="rec"><thead><tr><th>Material</th><th class="n">Count ' + U.nice(per.from) + '</th><th class="n">Received</th><th class="n">Count ' + U.nice(per.to) + '</th><th class="n">Really used</th><th class="n">Batches say</th><th class="n">Gap</th></tr></thead><tbody>' +
    per.rows.map(function (r) { var c = usGapCls(r); return '<tr><td><b>' + esc(r.name) + '</b> <span class="small muted">' + esc(r.unit) + '</span></td><td class="n">' + fmtN(r.before) + '</td><td class="n">' + (r.received ? '+' + fmtN(r.received) : '') + '</td><td class="n">' + fmtN(r.after) + '</td><td class="n"><b>' + fmtN(r.used) + '</b>' + (r.used < -0.05 ? '<br><span class="small" style="color:var(--amber)">went up: a delivery not marked received?</span>' : '') + '</td><td class="n">' + fmtN(r.expected) + '</td><td class="n ' + c + '">' + (Math.abs(r.gap) < 0.05 ? '0' : (r.gap > 0 ? '+' : '') + fmtN(r.gap)) + (r.pct != null ? ' <span class="small">(' + (r.pct > 0 ? '+' : '') + Math.round(r.pct * 100) + '%)</span>' : '') + '</td></tr>'; }).join('') +
    (per.rows.length ? '' : '<tr><td colspan="7" class="muted">No material has both counts.</td></tr>') + '</tbody></table></div>';
}
function usMonthKey(d) { return d.slice(0, 7); }
function usMonthName(k) { var t = new Date(k + '-01T00:00:00Z'); return t.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); }
function vUsage(fc) {
  var model = fc.model, counts = usCounts(), d = invDoc();
  var h = head('Usage: real vs plan', 'What really left the store between two counts, against what the batches in the Line Planner say, and what this month\'s plan will use.');
  if (counts.length < 1) return h + '<div class="panel empty"><h3 style="font-size:17px;margin-bottom:6px">No inventory count yet</h3><p class="hint" style="margin:0">Import a count on the <a href="#inventory">Inventory</a> page. Every count you save comes here by itself and is compared with the one before.</p></div>';
  // ---- this month
  var mk = usMonthKey(TODAY), mStart = mk + '-01', mEnd = U.addDays(usMonthKey(U.addDays(mStart, 32)) + '-01', -1);
  var mo = (d.months || {})[mk] || {}, open = mo.opening ? usToMat(mo.opening).qty : null;
  var last = counts[counts.length - 1], lastIn = last.date >= mStart ? last : null;
  var res = {}; fc.results.forEach(function (r) { res[r.id] = r; });
  var pastEx = usExpected(model, U.addDays(mStart, -1), U.addDays(TODAY, -1));
  var rows = model.materials.map(function (m) {
    var r = res[m.id]; if (!r) return null;
    var futureUse = 0, closing = null;
    (r.daily || []).forEach(function (x) { if (x.date >= TODAY && x.date <= mEnd) { futureUse += x.use; } if (x.date === mEnd) closing = x.closing; });
    var planUse = (pastEx.qty[m.id] || 0) + futureUse, o = open ? open[m.id] : null;
    var recM = usReceived(U.addDays(mStart, -1), mEnd)[m.id] || 0;
    var real = lastIn && o != null ? (function () { var nowQ = usToMat(lastIn.qty || {}).qty[m.id]; return nowQ == null ? null : o + (usReceived(U.addDays(mStart, -1), lastIn.date)[m.id] || 0) - nowQ; })() : null;
    if (o == null && !planUse && !r.active) return null;
    return { m: m, open: o, received: recM, plan: planUse, closing: closing, real: real, crit: invItems().some(function (i) { return i.mat === m.id && i.critical; }) };
  }).filter(Boolean);
  var periods = []; for (var i = 1; i < counts.length; i++) periods.push(usPeriod(model, counts[i - 1], counts[i]));
  var sel = periods.filter(function (p) { return p.to === S.us.period; })[0] || periods[periods.length - 1];
  var big = sel ? sel.rows.filter(function (r) { return usGapCls(r) === 'bad'; }).length : 0;
  h += '<div class="kpis"><div class="kpi"><span class="l">Counts saved</span><span class="v num">' + counts.length + '</span><span class="small muted">last ' + U.nice(last.date) + '</span></div>' +
    '<div class="kpi ' + (big ? 'order' : 'ok') + '"><span class="l">Big gaps (over 25%)</span><span class="v num">' + (sel ? big : '–') + '</span><span class="small muted">' + (sel ? U.nice(sel.from) + ' → ' + U.nice(sel.to) : 'needs two counts') + '</span></div>' +
    '<div class="kpi ' + (sel && sel.missing.length ? 'soon' : '') + '"><span class="l">Working days with no actual</span><span class="v num">' + (sel ? sel.missing.length : '–') + '</span><span class="small muted">in the Line Planner, same period</span></div>' +
    '<div class="kpi"><span class="l">' + esc(usMonthName(mk)) + ' plan uses</span><span class="v" style="font-size:20px">' + rows.filter(function (x) { return x.plan > 0; }).length + ' materials</span><span class="small muted">from the line plan and factory plan</span></div></div>';
  // this month
  h += '<div class="panel"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="font-size:16px">' + esc(usMonthName(mk)) + ': plan</h3><span class="small muted">' + (mo.openingDate ? 'Opening = closing count of ' + U.nice(mo.openingDate) : 'No month-end count opens this month yet') + '</span></div>' +
    '<div class="tablewrap"><table class="rec"><thead><tr><th>Material</th><th class="n">Opening</th><th class="n">Received</th><th class="n">Plan will use</th><th class="n">Expected closing ' + U.nice(mEnd) + '</th>' + (lastIn ? '<th class="n">Really used so far</th>' : '') + '</tr></thead><tbody>' +
    rows.map(function (x) { return '<tr><td><b>' + esc(x.m.name) + '</b> <span class="small muted">' + esc(x.m.unit) + '</span>' + (x.crit ? ' <span class="chip order" style="padding:1px 8px">Critical</span>' : '') + '</td><td class="n">' + (x.open == null ? '–' : fmtN(x.open)) + '</td><td class="n">' + (x.received ? '+' + fmtN(x.received) : '') + '</td><td class="n"><b>' + fmtN(x.plan) + '</b></td><td class="n ' + (x.closing != null && x.closing <= 0 ? 'bad' : '') + '">' + (x.closing == null ? '–' : fmtN(Math.max(0, x.closing)) + (x.closing <= 0 ? ' <span class="small">runs out</span>' : '')) + '</td>' + (lastIn ? '<td class="n">' + (x.real == null ? '–' : fmtN(x.real)) + '</td>' : '') + '</tr>'; }).join('') +
    '</tbody></table></div><p class="hint" style="margin:10px 0 0">Plan will use = batches already entered in the Line Planner this month × recipe, plus the factory plan (or the normal pace) for the days left. At the month-end count you see real use next to it.</p></div>';
  // between counts
  h += '<div class="panel"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="font-size:16px">Between two counts</h3>' + (periods.length > 1 ? '<select id="usPer" style="padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg)">' + periods.slice().reverse().map(function (p) { return '<option value="' + p.to + '"' + (p === sel ? ' selected' : '') + '>' + U.nice(p.from) + ' → ' + U.nice(p.to) + '</option>'; }).join('') + '</select>' : '') + '</div>';
  if (!sel) h += '<p class="hint" style="margin:0">One count so far (' + U.nice(last.date) + '). The comparison starts with the next count you save.</p>';
  else {
    if (sel.missing.length) h += '<div class="callout" style="margin-bottom:10px"><span><b>' + sel.missing.length + ' working day' + (sel.missing.length === 1 ? '' : 's') + ' with no actual in the Line Planner</b> (' + sel.missing.map(function (x) { return U.nice(x); }).join(', ') + '). Batches from those days are missing from "Batches say", so gaps look bigger than they are. <a href="line.html#actual">Enter them</a>.</span></div>';
    h += usTable(sel);
    if (sel.skipped.length) h += '<p class="small muted" style="margin:8px 0 0">Left out (no unit conversion): ' + esc(sel.skipped.join(', ')) + '.</p>';
    h += '<p class="hint" style="margin:10px 0 0">Really used = count before + received − count after. Batches say = batches prepared in the Line Planner (' + sel.days + ' day' + (sel.days === 1 ? '' : 's') + ') × recipe. A positive gap means more left the store than the batches explain: a recipe that is too low, waste, or a delivery not marked received.</p>';
  }
  h += '</div>';
  // months
  var mks = Object.keys(d.months || {}).filter(function (k) { return d.months[k].opening && d.months[k].closing; }).sort().reverse();
  h += '<div class="panel"><h3 style="font-size:16px;margin-bottom:8px">Month to month</h3>';
  if (!mks.length) h += '<p class="hint" style="margin:0">A month shows here once it has both an opening and a closing count. ' + esc(usMonthName(mk)) + ' opens with your ' + (mo.openingDate ? U.nice(mo.openingDate) : 'month-end') + ' count; the first full month appears after its month-end count.</p>';
  else mks.forEach(function (k) { var x = d.months[k]; h += '<h4 style="font-size:14px;margin:6px 0">' + esc(usMonthName(k)) + '</h4>' + usTable(usPeriod(model, { date: x.openingDate, qty: x.opening, source: x.source }, { date: x.closingDate, qty: x.closing, source: x.source })); });
  h += '</div>';
  return h;
}
after.usage = function () { var p = $('#usPer'); if (p) p.onchange = function () { S.us.period = p.value; render(); }; };
/* the small Count vs production panel on the Stock page now points here */
var SHOW_USAGE = false; /* the Usage: real vs plan tab is built but hidden for now; set true to bring it back (also add it to the tabs list at start-up) */
if (SHOW_USAGE) reconHTML = function () { return '<div class="panel"><h3 style="font-size:16px;margin-bottom:6px">Count vs production</h3><p class="hint" style="margin:0">The full comparison (real use between counts, against the batches, and this month\'s plan) is on the <a href="#usage">Usage: real vs plan</a> tab.</p></div>'; };

/* =====================================================================================================
   DAILY CONSUMPTION: by day, the batches really made (Line Planner actuals, never the forecast) and the raw
   materials they used (batches × recipe). A day can be corrected by hand (batches, or extra / less of a material)
   and saved in app_docs "daily": { days: { date: { batches:{'GM|SEC-2':13}, adj:{salt:+5}, note, by, at } } }.
   Saved days are what the forecast and the "Estimated now" use.
   ===================================================================================================== */
S.dc = { month: null };
function dcDoc() { return (S.saved.daily && S.saved.daily.days) || {}; }
function dcDay(date) { // effective batches + adjustments for one day
  var o = dcDoc()[date], lp = LP.days[date] || {};
  return { batches: o && o.batches ? o.batches : lp, adj: (o && o.adj) || {}, edited: !!o, note: o ? o.note : '', by: o ? o.by : '', at: o ? o.at : '', fromLP: !!LP.days[date] || !!LP.secs[date] };
}
function dcUse(model, d, by) { // { matId: qty in app units }; by (optional) gets { matId: { GM: qty, LS: qty, hand: qty } }
  var out = {};
  Object.keys(d.batches || {}).forEach(function (k) { var p = k.split('|'), r = (model.recipes[p[0]] || {})[p[1]] || {}, b = Number(d.batches[k]) || 0; Object.keys(r).forEach(function (m) { var q = (Number(r[m]) || 0) * b; if (q) { out[m] = (out[m] || 0) + q; if (by) { by[m] = by[m] || {}; by[m][p[0]] = (by[m][p[0]] || 0) + q; } } }); });
  Object.keys(d.adj || {}).forEach(function (m) { var a = Number(d.adj[m]) || 0; out[m] = (out[m] || 0) + a; if (by && a) { by[m] = by[m] || {}; by[m].hand = (by[m].hand || 0) + a; } });
  return out;
}
function dcSplit(b) { // "GM 520 · LS 20" when more than one product used it
  var k = Object.keys(b || {}).filter(function (x) { return x !== 'hand' && Math.abs(b[x]) > 1e-9; });
  return k.length > 1 ? k.map(function (x) { return '<span class="sp">' + esc(x) + ' ' + fmtN(b[x]) + '</span>'; }).join('') : '';
}
/* the engine gets the corrected days */
(function () {
  var _sfe = savedForEngine;
  savedForEngine = function () {
    var s = _sfe(), days = Object.assign({}, s.actualDays || {}), secs = Object.assign({}, s.actualSections || {}), adj = {};
    Object.keys(dcDoc()).forEach(function (d) { var o = dcDoc()[d]; if (o.batches) { days[d] = o.batches; secs[d] = Object.assign({}, secs[d] || {}); Object.keys(o.batches).forEach(function (k) { secs[d][k.split('|')[1]] = 1; }); } if (o.adj && Object.keys(o.adj).length) adj[d] = o.adj; });
    s.actualDays = days; s.actualSections = secs; s.dailyAdj = adj; return s;
  };
})();
function dcLot(date) { var a = LP.list.filter(function (x) { return x.date === date && x.lot; })[0]; return a ? a.lot : ATIC.lot(date); }
function vDaily(fc) {
  var model = fc.model, mk = S.dc.month || TODAY.slice(0, 7);
  var months = {}; months[TODAY.slice(0, 7)] = 1; Object.keys(LP.days).concat(Object.keys(LP.secs), Object.keys(dcDoc())).forEach(function (d) { months[d.slice(0, 7)] = 1; });
  var mStart = mk + '-01', mEnd = U.addDays(U.addDays(mStart, 32).slice(0, 7) + '-01', -1), last = mEnd < TODAY ? mEnd : TODAY;
  var rows = [], totals = {}, used = {};
  for (var d = mStart; d <= last; d = U.addDays(d, 1)) {
    var fri = new Date(d + 'T00:00:00Z').getUTCDay() === 5, x = dcDay(d), by = {}, u = dcUse(model, x, by);
    Object.keys(u).forEach(function (m) { if (Math.abs(u[m]) > 1e-9) { used[m] = 1; totals[m] = (totals[m] || 0) + u[m]; } });
    rows.push({ d: d, fri: fri, x: x, u: u, by: by });
  }
  var mats = model.materials.filter(function (m) { return used[m.id]; });
  var nameOfMonth = function (k) { return new Date(k + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
  var h = head('Daily consumption', 'Raw materials used each day: the batches really made (Line Planner actuals) × the recipe. Open a day to correct it.',
    '<select id="dcMonth" style="padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--bg)">' + Object.keys(months).sort().reverse().map(function (k) { return '<option value="' + k + '"' + (k === mk ? ' selected' : '') + '>' + nameOfMonth(k) + '</option>'; }).join('') + '</select>');
  h += accessNote();
  var missing = rows.filter(function (r) { return !r.fri && !r.x.fromLP && !r.x.edited && r.d < TODAY; }).length, edited = rows.filter(function (r) { return r.x.edited; }).length;
  var nb = 0; rows.forEach(function (r) { Object.keys(r.x.batches || {}).forEach(function (k) { nb += Number(r.x.batches[k]) || 0; }); });
  h += '<div class="kpis"><div class="kpi"><span class="l">Batches made</span><span class="v num">' + fmtN(nb) + '</span><span class="small muted">' + esc(nameOfMonth(mk)) + '</span></div>' +
    '<div class="kpi ' + (missing ? 'soon' : 'ok') + '"><span class="l">Working days with no actual</span><span class="v num">' + missing + '</span><span class="small muted">enter them in the Line Planner</span></div>' +
    '<div class="kpi"><span class="l">Days corrected by hand</span><span class="v num">' + edited + '</span><span class="small muted">saved as real use</span></div>' +
    '<div class="kpi"><span class="l">Materials used</span><span class="v num">' + mats.length + '</span><span class="small muted">this month</span></div></div>';
  h += '<div class="tablewrap"><table class="dc"><thead><tr><th>Day</th><th>Lot</th><th>Batches made</th>' + mats.map(function (m) { return '<th class="n">' + esc(m.name) + '<br><span class="small muted">' + esc(m.unit) + '</span></th>'; }).join('') + '<th></th></tr></thead><tbody>';
  rows.slice().reverse().forEach(function (r) {
    var b = Object.keys(r.x.batches || {}).filter(function (k) { return Number(r.x.batches[k]); }).map(function (k) { var p = k.split('|'); return '<span class="bt">' + esc(p[0]) + ' <b>' + fmtN(r.x.batches[k]) + '</b> <small>' + (p[1] === 'SEC-1' ? 'S1' : 'S2') + '</small></span>'; }).join(' ');
    var dn = DAYS[new Date(r.d + 'T00:00:00Z').getUTCDay()] + ' ' + U.nice(r.d);
    if (r.fri) { h += '<tr class="off"><td>' + dn + '</td><td></td><td colspan="' + (mats.length + 2) + '" class="muted">Day off</td></tr>'; return; }
    var st = r.x.edited ? '<span class="chip info" style="padding:1px 8px" title="' + esc((r.x.by ? 'by ' + r.x.by : '') + (r.x.note ? ' · ' + r.x.note : '')) + '">Corrected</span>' : r.x.fromLP ? '' : (r.d < TODAY ? '<span class="chip soon" style="padding:1px 8px">No actual</span>' : '');
    h += '<tr data-dc="' + r.d + '"><td><b>' + dn + '</b></td><td class="mono">' + esc(dcLot(r.d)) + '</td><td>' + (b || '<span class="muted">–</span>') + ' ' + st + '</td>' +
      mats.map(function (m) { var v = r.u[m.id], a = (r.x.adj || {})[m.id]; return '<td class="n">' + (v ? fmtN(v) : '') + dcSplit(r.by[m.id]) + (a ? '<br><span class="small" style="color:var(--amber)">' + (a > 0 ? '+' : '') + fmtN(a) + ' by hand</span>' : '') + '</td>'; }).join('') +
      '<td>' + (S.canWrite ? '<button class="btn ghost" data-dce="' + r.d + '">Open</button>' : '') + '</td></tr>';
  });
  h += '</tbody><tfoot><tr><td colspan="3"><b>Total ' + esc(nameOfMonth(mk)) + '</b></td>' + mats.map(function (m) { return '<td class="n"><b>' + fmtN(totals[m.id]) + '</b></td>'; }).join('') + '<td></td></tr></tfoot></table></div>';
  h += '<p class="hint">Batches come from the actuals saved in the Line Planner (batches prepared, also prep-only). Every product made that day uses its own recipe, so two products with salt both use salt. A corrected day replaces the Line Planner numbers for raw materials only; the Line Planner itself is not changed.</p>';
  return h;
}
after.daily = function (fc) {
  var mo = $('#dcMonth'); if (mo) mo.onchange = function () { S.dc.month = mo.value; render(); };
  document.querySelectorAll('[data-dce]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); dcEdit(fc, b.dataset.dce); }; });
};
function dcEdit(fc, date) {
  X.ensureCss();
  var model = fc.model, x = dcDay(date), st = { batches: JSON.parse(JSON.stringify(x.batches || {})), adj: JSON.parse(JSON.stringify(x.adj || {})), note: x.note || '' };
  var back = document.createElement('div'); back.className = 'xd-back'; document.body.appendChild(back);
  var prods = model.products.map(function (p) { return p.id; });
  function draw() {
    var by = {}, u = dcUse(model, { batches: st.batches, adj: {} }, by), all = dcUse(model, st);
    var mats = model.materials.filter(function (m) { return u[m.id] || st.adj[m.id]; });
    var h = '<div class="xd" role="dialog" aria-modal="true" aria-label="Daily consumption" style="width:min(760px,100%)"><header><div><h2>' + DAYS[new Date(date + 'T00:00:00Z').getUTCDay()] + ' ' + U.nice(date) + ' · lot ' + esc(dcLot(date)) + '</h2><p class="small muted" style="margin:4px 0 0">' + (x.edited ? 'Corrected' + (x.by ? ' by ' + esc(x.by) : '') : x.fromLP ? 'From the Line Planner actuals' : 'No actual in the Line Planner for this day') + '</p></div><button class="btn ghost" data-x="close" aria-label="Close">✕</button></header><div class="body">';
    h += '<div><h3 style="font-size:14px;margin:0 0 6px">Batches made</h3><div class="tablewrap"><table><thead><tr><th>Product</th><th class="n">Section 1</th><th class="n">Section 2</th></tr></thead><tbody>' + prods.map(function (p) {
      return '<tr><td>' + esc(PN[p] || p) + '</td>' + ['SEC-1', 'SEC-2'].map(function (s) { var k = p + '|' + s; return '<td class="n"><input type="number" step="any" min="0" data-db="' + k + '" value="' + (st.batches[k] != null && Number(st.batches[k]) ? st.batches[k] : '') + '" placeholder="0" style="width:80px;padding:5px 7px;border:1px solid var(--line);border-radius:7px;background:var(--bg)"></td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table></div></div>';
    h += '<div><h3 style="font-size:14px;margin:0 0 6px">Raw materials used</h3><div class="tablewrap"><table><thead><tr><th>Material</th><th class="n">Batches × recipe</th><th>By product</th><th class="n">Extra (+) or less (−)</th><th class="n">Total used</th></tr></thead><tbody>' + mats.map(function (m) {
      return '<tr><td>' + esc(m.name) + ' <span class="small muted">' + esc(m.unit) + '</span></td><td class="n">' + fmtN(u[m.id] || 0) + '</td><td class="small">' + Object.keys(by[m.id] || {}).map(function (p) { return esc(PN[p] || p) + ' ' + fmtN(by[m.id][p]); }).join(' · ') + '</td><td class="n"><input type="number" step="any" data-da="' + m.id + '" value="' + (st.adj[m.id] || '') + '" placeholder="0" style="width:90px;padding:5px 7px;border:1px solid var(--line);border-radius:7px;background:var(--bg)"></td><td class="n"><b>' + fmtN(all[m.id] || 0) + '</b></td></tr>';
    }).join('') + (mats.length ? '' : '<tr><td colspan="5" class="muted">No batches on this day.</td></tr>') + '</tbody></table></div>' +
      '<div class="top" style="margin-top:8px"><label>Add another material<select id="daAdd"><option value="">Choose…</option>' + model.materials.filter(function (m) { return mats.indexOf(m) < 0; }).map(function (m) { return '<option value="' + m.id + '">' + esc(m.name) + '</option>'; }).join('') + '</select></label></div></div>';
    h += '<label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);font-weight:600">Note (why it was corrected)<input id="daNote" value="' + esc(st.note) + '" placeholder="e.g. one GM batch took 5 kg more salt" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font-weight:400"></label>';
    h += '</div><footer>' + (x.edited ? '<button class="btn ghost" data-x="reset" style="margin-right:auto">Back to the Line Planner numbers</button>' : '<span class="small muted" style="margin-right:auto">Saved days count as real use in the forecast.</span>') + '<button class="btn" data-x="close">Cancel</button><button class="btn primary" data-x="save">Save day</button></footer></div>';
    back.innerHTML = h;
    back.querySelectorAll('[data-x="close"]').forEach(function (b) { b.onclick = function () { back.remove(); }; });
    back.querySelectorAll('[data-db]').forEach(function (i) { i.onchange = function () { var v = +i.value || 0; if (v) st.batches[i.dataset.db] = v; else delete st.batches[i.dataset.db]; draw(); }; });
    back.querySelectorAll('[data-da]').forEach(function (i) { i.onchange = function () { var v = +i.value || 0; if (v) st.adj[i.dataset.da] = v; else delete st.adj[i.dataset.da]; draw(); }; });
    back.querySelector('#daAdd').onchange = function () { if (this.value) { st.adj[this.value] = st.adj[this.value] || 0.0001; draw(); var i = back.querySelector('[data-da="' + this.value + '"]'); if (i) { i.value = ''; i.focus(); } } };
    back.querySelector('#daNote').oninput = function () { st.note = this.value; };
    back.querySelector('[data-x="save"]').onclick = function () {
      Object.keys(st.adj).forEach(function (k) { if (Math.abs(st.adj[k]) < 0.001) delete st.adj[k]; });
      var days = JSON.parse(JSON.stringify(dcDoc()));
      days[date] = { batches: st.batches, adj: st.adj, note: st.note, lot: dcLot(date), by: (S.profile && (S.profile.full_name || S.profile.username)) || '', at: new Date().toISOString() };
      back.remove(); saveDoc('daily', { days: days });
    };
    var rs = back.querySelector('[data-x="reset"]'); if (rs) rs.onclick = function () { var days = JSON.parse(JSON.stringify(dcDoc())); delete days[date]; back.remove(); saveDoc('daily', { days: days }); };
  }
  draw();
}
/* Inventory: "Estimated now" next to the counted quantity (count − daily use + received, from the forecast) */
function invEstimate(fc, it) {
  if (!it.mat || !(it.toApp > 0)) return null;
  var r = (fc.results || []).filter(function (x) { return x.id === it.mat; })[0]; if (!r) return null;
  var lines = invItems().filter(function (i) { return i.mat === it.mat && !i.missing; });
  var y = U.addDays(TODAY, -1), v = r.stockNow;
  (r.daily || []).forEach(function (x) { if (x.date <= y && x.date >= r.weeks[0].start) v = x.closing; });
  if (lines.length > 1) { if (lines[0].id !== it.id) return { shared: true }; return { v: v / it.toApp, shared: false, multi: lines.length, unit: r.unit, app: v }; }
  return { v: v / it.toApp };
}

/* ---------- any raw inventory line can become a recipe ingredient (a new forecast material) ---------- */
function addInvMaterial(itemId) {
  var it = invById(itemId); if (!it) return Promise.resolve(null);
  if (!S.canWrite) { toast('You have view access. Ask your admin for edit access.'); return Promise.resolve(null); }
  var id = 'inv-' + INV.slug(it.name).slice(0, 40), unit = INV.unitWord(it.unit) || 'kg', pack = it.pack || INV.parsePack(it.packTxt);
  var all = (run.cache ? run.cache.model.materials : BASE.materials); if (all.some(function (m) { return m.id === id; })) id += '-' + Date.now().toString(36).slice(-3);
  // recipe in kg (or L) when the pack says so (e.g. 25 kg/bag): the stock stays in the counted unit
  var x = { id: id, name: it.name.replace(/\s+/g, ' ').trim(), unit: unit, recipeUnit: unit, recipeFactor: 1, fromInventory: it.id, added: TODAY };
  if (pack && pack.size && (pack.of === 'kg' || pack.of === 'l') && unit !== pack.of) { x.recipeUnit = pack.of; x.recipeFactor = pack.size; }
  var mats = JSON.parse(JSON.stringify(S.saved.materials || { items: {} })); mats.items = mats.items || {}; mats.extra = (mats.extra || []).concat([x]);
  var d = JSON.parse(JSON.stringify(invDoc())); d.items.forEach(function (i) { if (i.id === it.id || (i.cat === 'raw' && !i.mat && INV.norm(i.name) === INV.norm(it.name))) { i.mat = id; i.toApp = INV.unitWord(i.unit) === unit ? 1 : null; } });
  return Promise.resolve(saveDoc('materials', mats)).then(function () { return saveDoc('inventory', d); }).then(function () { return syncForecastFromInventory(d.items, 'Added from the inventory: ' + x.name); }).then(function () { return id; });
}
/* every save of the materials list keeps the materials added from the inventory */
(function () {
  var _sd = saveDoc;
  saveDoc = function (name, data) {
    if (name === 'materials' && data && data.extra === undefined && S.saved.materials && S.saved.materials.extra) data = Object.assign({}, data, { extra: S.saved.materials.extra });
    return _sd(name, data);
  };
})();


/* ---------- which product each material is used for: Forecast table, Overview cards, material page ---------- */
function bySplit(by, total, opts) { // "GM 400 · LS 68" (or percentages)
  var k = Object.keys(by || {}).filter(function (p) { return Math.abs(by[p]) > 1e-9; }).sort(function (a, b) { return by[b] - by[a]; });
  if (!k.length) return '';
  return '<span class="bysplit">' + k.map(function (p) { return '<span>' + esc(p) + ' ' + (opts && opts.pct && total > 0 ? Math.round(by[p] / total * 100) + '%' : fmtN(by[p])) + '</span>'; }).join('') + '</span>';
}
(function () {
  // Forecast page: "Will use" split by product for the chosen period
  var _vF = vForecast;
  vForecast = function (fc) {
    var h = _vF(fc), until = horizonDate();
    fc.results.forEach(function (r) {
      var by = {}; (r.daily || []).forEach(function (x) { if (x.date >= TODAY && x.date <= until) Object.keys(x.by || {}).forEach(function (p) { by[p] = (by[p] || 0) + x.by[p]; }); });
      var sp = bySplit(by); if (!sp) return;
      var re = new RegExp('(<tr class="pick[^"]*" data-fm="' + r.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '">(?:<td[^>]*>.*?</td>){2}<td class="n">[^<]*)(</td>)');
      h = h.replace(re, '$1' + sp + '$2');
    });
    return h;
  };
  // Overview card: "Use per week" with each product's share
  var _card2 = card;
  card = function (r) {
    var h = _card2(r), sp = bySplit(r.byProduct, r.weekly, { pct: Object.keys(r.byProduct || {}).length > 1 });
    if (sp && Object.keys(r.byProduct || {}).filter(function (p) { return r.byProduct[p] > 1e-9; }).length > 1) h = h.replace(/(<dt>Use per week<\/dt><dd>[^<]*)(<\/dd>)/, '$1' + sp + '$2');
    return h;
  };
  // material page: weekly table use split
  var _vM = vMaterial;
  vMaterial = function (fc) {
    var h = _vM(fc), r = fc.results.filter(function (x) { return x.id === S.mat; })[0]; if (!r) return h;
    var sp = bySplit(r.byProduct, r.weekly); if (sp) h = h.replace(/(<span class="l">Use per week<\/span><span class="v num">[^<]*<\/span>)/, '$1' + sp);
    (r.weeks || []).slice(0, 16).forEach(function (w) {
      var s2 = Object.keys(w.by || {}).filter(function (p) { return w.by[p] > 1e-9; }).length > 1 ? bySplit(w.by) : ''; if (!s2) return;
      h = h.replace('<td>' + U.nice(w.start) + ' – ' + U.nice(U.addDays(w.start, 6)) + '</td><td class="n">' + fmtN(w.opening) + '</td><td class="n">' + fmtN(w.use), '<td>' + U.nice(w.start) + ' – ' + U.nice(U.addDays(w.start, 6)) + '</td><td class="n">' + fmtN(w.opening) + '</td><td class="n">' + fmtN(w.use) + s2);
    });
    return h;
  };
})();

/* ---------- the pace from the Line Planner: batches per working day over ALL saved actuals (Fridays off) ---------- */
function recentPace() {
  var eff = Object.assign({}, LP.days), secs = Object.assign({}, LP.secs), dd = dcDoc();
  Object.keys(dd).forEach(function (d) { if (dd[d].batches) { eff[d] = dd[d].batches; secs[d] = secs[d] || {}; } });
  var all = Object.keys(eff).concat(Object.keys(secs)).sort(), wk = {}, sat = {}, nW = 0, nS = 0, from = all[0] || TODAY, list = [];
  for (var d = from; d < TODAY; d = U.addDays(d, 1)) {
    var w = new Date(d + 'T00:00:00Z').getUTCDay(); if (w === 5 || !(secs[d] || eff[d])) continue;
    var tgt = w === 6 ? sat : wk; if (w === 6) nS++; else nW++; list.push(d);
    Object.keys(eff[d] || {}).forEach(function (k) { tgt[k] = (tgt[k] || 0) + (Number(eff[d][k]) || 0); });
  }
  var perDay = {}, satPer = {};
  Object.keys(wk).forEach(function (k) { perDay[k] = wk[k] / Math.max(1, nW); });
  Object.keys(sat).forEach(function (k) { satPer[k] = sat[k] / Math.max(1, nS); });
  return { days: nW + nS, weekdays: nW, satDays: nS, perDay: perDay, sat: satPer, from: list[0] || null, to: list[list.length - 1] || null };
}
(function () {
  var _sfe2 = savedForEngine;
  savedForEngine = function () { var s = _sfe2(); s.recentPace = recentPace(); return s; };
})();
function planCover() { var pl = S.saved.plan || {}; return pl.from && pl.to && pl.to >= TODAY ? { from: pl.from < TODAY ? TODAY : pl.from, to: pl.to } : null; }
function paceNote(fc) {
  var rp = fc.recentPace, use = fc.pace === 'recent', pc = planCover();
  var fmtK = function (o) { return Object.keys(o || {}).filter(function (k) { return Math.round(o[k]) > 0; }).sort().map(function (k) { var q = k.split('|'); return q[0] + ' ' + Math.round(o[k]) + ' ' + (q[1] === 'SEC-1' ? 'S1' : 'S2'); }).join(' · '); };
  var t = use ? 'Line Planner actuals (' + rp.days + ' days): ' + (fmtK(rp.perDay) || '–') + (rp.satDays ? ' · Sat: ' + (fmtK(rp.sat) || '–') : '') : 'Jan–Sep history average';
  return '<p class="small pace1" style="margin:0 0 12px">' + (pc ? '<b>Plan ' + U.nice(pc.from) + '–' + U.nice(pc.to) + '</b> · ' : '') + '<b>Batches/day without a plan:</b> ' + t + ' · Fri off</p>';
}
(function () {
  var _vF2 = vForecast;
  vForecast = function (fc) { var h = _vF2(fc), i = h.indexOf('<div class="panel"><div class="row" style="justify-content:space-between"><h3 style="font-size:17px">2 · Forecast until'); return i < 0 ? h : h.slice(0, i) + paceNote(fc) + h.slice(i); };
  // Stock page: choose the pace
  var _vS = vStock, _aS = after.stock;
  vStock = function (fc) {
    var h = _vS(fc), on = fc.pace === 'recent', rp = fc.recentPace || { days: 0 };
    var blk = '<div class="panel"><h3 style="font-size:16px;margin-bottom:6px">Pace for days with no factory plan</h3><div class="tabs"><button data-pace="recent" aria-pressed="' + on + '"' + (rp.days < 3 ? ' disabled title="Needs 3 recent days in the Line Planner"' : '') + '>Line Planner actuals (' + rp.days + ' days)</button><button data-pace="history" aria-pressed="' + !on + '">Jan–Sep history average</button></div><p class="small muted" style="margin:8px 0 0">Line Planner = batches really prepared per working day, all saved actuals. History = the weeks chosen below.</p></div>';
    var i = h.indexOf('<div class="panel"><h3 style="font-size:16px;margin-bottom:6px">Normal production pace'); return i < 0 ? h + blk : h.slice(0, i) + blk + h.slice(i);
  };
  after.stock = function (fc) { _aS(fc); document.querySelectorAll('[data-pace]').forEach(function (b) { b.onclick = function () { var v = Object.assign({}, S.saved.settings || {}, { pace: b.dataset.pace }); S.saved.settings = v; saveDoc('settings', v); }; }); };
})();

/* ---------- per day + approximate batches, everywhere the forecast shows use ---------- */
function btTxt(o, digits) { return Object.keys(o || {}).filter(function (p) { return o[p] > 0.05; }).sort(function (a, b) { return o[b] - o[a]; }).map(function (p) { return p + ' ≈ ' + Math.round(o[p]); }).join(' · '); }
function periodBatches(fc, from, to) { var o = {}; Object.keys(fc.dayBatches || {}).forEach(function (d) { if (d >= from && d <= to) Object.keys(fc.dayBatches[d]).forEach(function (p) { o[p] = (o[p] || 0) + fc.dayBatches[d][p]; }); }); return o; }
function perBatchOf(fc, matId, p) { // average amount of this material per batch of product p over the period's batches (both sections)
  var r = fc.model.recipes[p] || {}, a = Number((r['SEC-1'] || {})[matId]) || 0, b = Number((r['SEC-2'] || {})[matId]) || 0; return a && b ? (a + b) / 2 : (a || b);
}
(function () {
  // Forecast: header line with the batches behind the period, and "≈ N batches" next to each product's share
  var _vF3 = vForecast;
  vForecast = function (fc) {
    var h = _vF3(fc), until = horizonDate(), pb = periodBatches(fc, TODAY, until), nd = 0;
    for (var d = TODAY; d <= until; d = U.addDays(d, 1)) if (new Date(d + 'T00:00:00Z').getUTCDay() !== 5) nd++;
    var pl = S.saved.plan || {}, planDays = 0, actDays = 0;
    for (var d2 = TODAY; d2 <= until; d2 = U.addDays(d2, 1)) { if (new Date(d2 + 'T00:00:00Z').getUTCDay() === 5) continue; if (LP.days[d2]) actDays++; else if (pl.days && pl.days[d2] && pl.from && d2 >= pl.from && d2 <= pl.to) planDays++; }
    var perDay = {}; Object.keys(pb).forEach(function (p) { perDay[p] = nd ? pb[p] / nd : 0; });
    var src = planDays === nd ? 'all from your factory plan' : planDays ? planDays + ' day' + (planDays === 1 ? '' : 's') + ' from your factory plan, the rest from the pace above' : actDays === nd ? 'all from Line Planner actuals' : 'from the pace above';
    var line = '<p class="small" style="margin:0 0 10px"><b>Batches behind this forecast, ' + U.nice(TODAY) + ' – ' + U.nice(until) + '</b> (' + nd + ' working days, ' + src + '): ' + (btTxt(pb) || 'none') + ' · ≈ ' + (btTxt(perDay) || '–').replace(/ ≈ /g, ' ') + ' a day.</p>';
    h = h.replace(/(Click a material to see it day by day\.<\/p>)/, '$1' + line);
    // "GM 572" → "GM 572 (≈ 44 bt)"
    fc.results.forEach(function (r) {
      Object.keys(pb).forEach(function (p) {
        var per = perBatchOf(fc, r.id, p); if (!per) return;
        var re = new RegExp('(data-fm="' + r.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[\\s\\S]*?<span class="bysplit">[\\s\\S]*?<span>' + p + ' [^<]*)(</span>)');
        h = h.replace(re, '$1 <i>(≈ ' + Math.round(pb[p]) + ' bt)</i>$2');
      });
    });
    return h;
  };
  // Overview card: "Use per day" with the batches per day behind it
  var _card3 = card;
  card = function (r) {
    var h = _card3(r), fc = run.cache; if (!fc) return h;
    var bt = {}; Object.keys(r.perDayBy || {}).forEach(function (p) { if (r.perDayBy[p] > 0) bt[p] = (fc.paceBatchesDay || {})[p] || 0; });
    var sub = Object.keys(bt).length ? '<span class="bysplit">' + Object.keys(bt).sort(function (a, b) { return r.perDayBy[b] - r.perDayBy[a]; }).map(function (p) { return '<span>' + p + ' ' + fmtN(r.perDayBy[p]) + ' · ≈ ' + fmtN(bt[p]) + ' batches/day</span>'; }).join('') + '</span>' : '';
    return h.replace(/<dt>Use per week<\/dt><dd>[\s\S]*?<\/dd>/, '<dt title="A normal working day (Sun–Thu). Per week: ' + fmtN(r.weekly) + '">Use per day</dt><dd>' + fmtN(r.perDay || 0) + sub + '</dd>');
  };
  // material page: per day next to per week
  var _vM2 = vMaterial;
  vMaterial = function (fc) {
    var h = _vM2(fc), r = fc.results.filter(function (x) { return x.id === S.mat; })[0]; if (!r) return h;
    var bt = Object.keys(r.perDayBy || {}).filter(function (p) { return r.perDayBy[p] > 0; }).map(function (p) { return p + ' ≈ ' + fmtN((fc.paceBatchesDay || {})[p] || 0) + ' batches'; }).join(' · ');
    return h.replace(/(<div class="kpi"><span class="l">Use per week<\/span>)/, '<div class="kpi"><span class="l">Use per day</span><span class="v num">' + fmtN(r.perDay || 0) + '</span><span class="small muted">' + esc(bt || 'normal working day') + '</span></div>$1');
  };
})();
/* material page: "Stock now" = estimated left now, with the exact count under it (same numbers as the Overview card) */
(function () {
  var _vM3 = vMaterial;
  vMaterial = function (fc) {
    var h = _vM3(fc), r = fc.results.filter(function (x) { return x.id === S.mat; })[0], n = r && stockNumbers(r); if (!n) return h;
    return h.replace(/<span class="l">Stock now<\/span><span class="v num">[^<]*<\/span><span class="small muted">[^<]*<\/span>/, '<span class="l">Est. left now</span><span class="v num">' + fmtN(Math.max(0, n.left)) + '</span><span class="small muted">counted ' + fmtN(n.counted) + ' on ' + U.nice(n.asOf) + ' · used ' + fmtN(n.used) + (n.received ? ' · received ' + fmtN(n.received) : '') + '</span>');
  };
})();

/* ---------- pace "Set by me": batches per day per product and section, typed by hand ---------- */
(function () {
  var _sfe3 = savedForEngine;
  savedForEngine = function () {
    var s = _sfe3(), st = S.saved.settings || {};
    if (st.pace === 'manual' && st.manualPace) { var rnd = function (o) { var r = {}; Object.keys(o || {}).forEach(function (k) { var v = Math.round(o[k]); if (v > 0) r[k] = v; }); return r; }; s.recentPace = { days: 99, weekdays: 5, satDays: 1, perDay: rnd(st.manualPace.perDay), sat: rnd(st.manualPace.sat), manual: true, from: null, to: null }; }
    return s;
  };
})();
function paceBox(fc) {
  var st = S.saved.settings || {}, mode = st.pace === 'manual' ? 'manual' : st.pace === 'history' ? 'history' : 'recent', rp = recentPace();
  var h = '<div class="panel pacebox"><div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap"><h3 style="font-size:16px">Batches per day for days with no factory plan</h3><div class="tabs">' +
    [['recent', 'Line Planner actuals (' + rp.days + ' days)'], ['manual', 'Set by me'], ['history', 'Jan–Sep history']].map(function (o) { return '<button data-pm="' + o[0] + '" aria-pressed="' + (mode === o[0]) + '"' + (o[0] === 'recent' && rp.days < 3 ? ' disabled title="Needs 3 recent days in the Line Planner"' : '') + '>' + o[1] + '</button>'; }).join('') + '</div></div>';
  if (mode === 'manual' || S.paceEdit) {
    var mp = st.manualPace || { perDay: {}, sat: {} }, prods = fc.model.products.map(function (p) { return p.id; });
    var val = function (o, k) { var v = (o || {})[k]; return v != null ? Math.round(v) : ''; };
    var seed = function (k, sat) { var src = sat ? (rp.satDays ? rp.sat : null) : rp.perDay; return src && src[k] ? Math.round(src[k]) || '' : ''; };
    var have = Object.keys(mp.perDay || {}).length || Object.keys(mp.sat || {}).length;
    h += '<div class="tablewrap" style="margin-top:10px"><table><thead><tr><th>Product</th><th class="n">Section 1<br><small>Sun–Thu</small></th><th class="n">Section 2<br><small>Sun–Thu</small></th><th class="n">Section 1<br><small>Saturday</small></th><th class="n">Section 2<br><small>Saturday</small></th></tr></thead><tbody>' +
      prods.map(function (p) { return '<tr><td><b>' + esc(PN[p] || p) + '</b></td>' + [['perDay', 'SEC-1'], ['perDay', 'SEC-2'], ['sat', 'SEC-1'], ['sat', 'SEC-2']].map(function (c) { var k = p + '|' + c[1], v = have ? val(mp[c[0]], k) : seed(k, c[0] === 'sat'); return '<td class="n"><input type="number" step="1" min="0" data-mp="' + c[0] + '|' + k + '" value="' + v + '" placeholder="0" style="width:80px"' + (S.canWrite ? '' : ' disabled') + '></td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div><div class="row" style="margin-top:8px"><button class="btn primary" id="mpSave"' + (S.canWrite ? '' : ' disabled') + '>Use these batches per day</button><span class="small muted">Approximate batches prepared per day (whole numbers). Friday is always off. ' + (have ? '' : 'Filled in from your recent Line Planner actuals; change what you need.') + '</span></div>';
  }
  return h + '</div>';
}
function paceBoxWire() {
  document.querySelectorAll('[data-pm]').forEach(function (b) { b.onclick = function () {
    var m = b.dataset.pm, st = Object.assign({}, S.saved.settings || {});
    if (m === 'manual' && !st.manualPace) { S.paceEdit = true; render(); return; } // show the table first; it switches on Save
    st.pace = m; S.paceEdit = false; S.saved.settings = st; saveDoc('settings', st);
  }; });
  var sv = $('#mpSave'); if (sv) sv.onclick = function () {
    var mp = { perDay: {}, sat: {} };
    document.querySelectorAll('[data-mp]').forEach(function (i) { var q = i.dataset.mp.split('|'), v = Math.round(+i.value); if (v > 0) mp[q[0]][q[1] + '|' + q[2]] = v; });
    var st = Object.assign({}, S.saved.settings || {}, { pace: 'manual', manualPace: mp, manualPaceAt: new Date().toISOString() });
    S.paceEdit = false; S.saved.settings = st; saveDoc('settings', st);
  };
}
(function () {
  // Forecast page: the choice sits right above "Forecast until"; the explanation box says what is used
  var _vF4 = vForecast, _aF = after.forecast;
  vForecast = function (fc) { var h = _vF4(fc), i = h.indexOf('<p class="small pace1"'); return i < 0 ? h : h.slice(0, i) + paceBox(fc) + h.slice(i); };
  after.forecast = function (fc) { if (_aF) _aF(fc); paceBoxWire(); };
  var _pn = paceNote;
  paceNote = function (fc) {
    var st = S.saved.settings || {};
    if (st.pace === 'manual' && fc.pace === 'recent') {
      var pc2 = planCover(), fmtK = function (o) { return Object.keys(o || {}).filter(function (k) { return Math.round(o[k]) > 0; }).sort().map(function (k) { var q = k.split('|'); return q[0] + ' ' + Math.round(o[k]) + ' ' + (q[1] === 'SEC-1' ? 'S1' : 'S2'); }).join(' · '); };
      return '<p class="small pace1" style="margin:0 0 12px">' + (pc2 ? '<b>Plan ' + U.nice(pc2.from) + '–' + U.nice(pc2.to) + '</b> · ' : '') + '<b>Batches/day without a plan (set by you):</b> ' + (fmtK(st.manualPace.perDay) || '–') + ' · Sat: ' + (fmtK(st.manualPace.sat) || '–') + ' · Fri off</p>';
    }
    return _pn(fc);
  };
  // Stock page tabs: same three choices
  var _aS2 = after.stock;
  after.stock = function (fc) { _aS2(fc); document.querySelectorAll('[data-pace]').forEach(function (b) { b.onclick = function () { var v = Object.assign({}, S.saved.settings || {}, { pace: b.dataset.pace }); S.saved.settings = v; saveDoc('settings', v); }; }); };
  var _vS2 = vStock;
  vStock = function (fc) { return _vS2(fc).replace('<button data-pace="history"', '<button data-pace="manual" aria-pressed="' + ((S.saved.settings || {}).pace === 'manual') + '"' + ((S.saved.settings || {}).manualPace ? '' : ' disabled title="Set them first on the Forecast page"') + '>Set by me</button><button data-pace="history"').replace('aria-pressed="true">Recent Line Planner', 'aria-pressed="' + ((S.saved.settings || {}).pace !== 'manual' && (S.saved.settings || {}).pace !== 'history') + '">Recent Line Planner'); };
})();

/* ---------- Overview card, simple: Counted · Est. used since · Est. left now · Used on <last day with an actual> ---------- */
function lastActualDay() {
  var dd = dcDoc(), best = null;
  Object.keys(LP.days).concat(Object.keys(dd)).forEach(function (d) { if (d <= TODAY && (!best || d > best)) best = d; });
  return best;
}
(function () {
  var _card4 = card;
  card = function (r) {
    var h = _card4(r), fc = run.cache; if (!fc) return h;
    var d = lastActualDay(), by = {}, used = d ? (dcUse(fc.model, dcDay(d), by)[r.id] || 0) : null;
    var parts = d ? Object.keys(by[r.id] || {}).filter(function (p) { return Math.abs(by[r.id][p]) > 1e-9; }) : [];
    var split = parts.length > 1 ? '<span class="bysplit">' + parts.sort(function (a, b) { return by[r.id][b] - by[r.id][a]; }).map(function (p) { return '<span>' + (p === 'hand' ? 'by hand' : esc(PN[p] || p)) + ' ' + fmtN(by[r.id][p]) + '</span>'; }).join('') + '</span>' : '';
    var row = '<dt title="Real use that day: batches made (Line Planner) × recipe, with any corrections from Daily consumption">' + (d ? 'Used on ' + U.nice(d) : 'Used on last day') + '</dt><dd>' + (d ? fmtN(used) : '–') + split + '</dd>';
    return h.replace(/<dt[^>]*>Use per day<\/dt><dd>[\s\S]*?<\/dd>/, row).replace(/<dt[^>]*>Use per week<\/dt><dd>[\s\S]*?<\/dd>/, row);
  };
  var _vM4 = vMaterial;
  vMaterial = function (fc) {
    var h = _vM4(fc), d = lastActualDay(); if (!d) return h;
    var by = {}, used = dcUse(fc.model, dcDay(d), by)[S.mat] || 0, b = by[S.mat] || {};
    var sp = Object.keys(b).filter(function (p) { return Math.abs(b[p]) > 1e-9; }).map(function (p) { return (p === 'hand' ? 'by hand' : (PN[p] || p)) + ' ' + fmtN(b[p]); }).join(' · ');
    return h.replace(/<div class="kpi"><span class="l">Use per day<\/span>[\s\S]*?<\/div>/, '<div class="kpi"><span class="l">Used on ' + U.nice(d) + '</span><span class="v num">' + fmtN(used) + '</span><span class="small muted">' + esc(sp || 'batches made × recipe') + '</span></div>');
  };
})();
/* the pace you asked for: GM 13 batches a day on Section 2 only (set once; Section 1 keeps its other products from the recent Line Planner pace). Change it on Forecast & plan → "Set by me". */
function seedManualPace() {
  if (!S.canWrite || seedManualPace.done || !BASE) return; var st = S.saved.settings || {}; if (st.manualPaceSeeded) return; seedManualPace.done = true;
  var rp = recentPace(), mp = { perDay: { 'GM|SEC-2': 13 }, sat: { 'GM|SEC-2': 13 } };
  // Section 1 keeps its other products (vinegar, lemon …) from the recent Line Planner pace; GM is only the 13 on Section 2
  Object.keys(rp.perDay || {}).forEach(function (k) { var q = k.split('|'); if (q[1] === 'SEC-1' && q[0] !== 'GM' && rp.perDay[k] >= 0.25) mp.perDay[k] = Math.max(1, Math.round(rp.perDay[k])); });
  Object.keys(rp.sat || {}).forEach(function (k) { var q = k.split('|'); if (q[1] === 'SEC-1' && q[0] !== 'GM' && rp.sat[k] >= 0.25) mp.sat[k] = Math.max(1, Math.round(rp.sat[k])); });
  var v = Object.assign({}, st, { pace: 'manual', manualPace: mp, manualPaceAt: new Date().toISOString(), manualPaceSeeded: true });
  S.saved.settings = v; saveDoc('settings', v);
}
(function waitPace() { if (window.ATIC && ATIC.profile && BASE && S.saved && run.cache) ATIC.whenShown(function () { setTimeout(seedManualPace, 500); }); else setTimeout(waitPace, 300); })();
/* "Used on <day>": always list what is behind the number: product · section · batches → amount (and any correction by hand) */
function usedLines(model, d, matId) {
  var x = dcDay(d), out = [];
  Object.keys(x.batches || {}).forEach(function (k) {
    var q = k.split('|'), b = Number(x.batches[k]) || 0, per = Number((((model.recipes[q[0]] || {})[q[1]]) || {})[matId]) || 0;
    if (b && per) out.push({ p: q[0], s: q[1] === 'SEC-1' ? 'S1' : 'S2', b: b, q: b * per });
  });
  var a = Number((x.adj || {})[matId]) || 0; if (a) out.push({ hand: true, q: a });
  return out.sort(function (u, v) { return v.q - u.q; });
}
(function () {
  var _card5 = card;
  card = function (r) {
    var h = _card5(r), fc = run.cache, d = lastActualDay(); if (!fc || !d) return h;
    var ls = usedLines(fc.model, d, r.id); if (!ls.length) return h;
    var sp = '<span class="bysplit">' + ls.map(function (l) { return '<span>' + (l.hand ? 'by hand ' + (l.q > 0 ? '+' : '') + fmtN(l.q) : esc(l.p) + ' ' + l.s + ' · ' + fmtN(l.b) + ' batches → ' + fmtN(l.q)) + '</span>'; }).join('') + '</span>';
    // replace whatever split was there with the full lines
    return h.replace(/(<dt[^>]*>Used on [^<]*<\/dt><dd>[^<]*)(?:<span class="bysplit">[\s\S]*?<\/span><\/span>)?(<\/dd>)/, '$1' + sp + '$2');
  };
})();
