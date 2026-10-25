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
function importPlan(file, stage) {
  X.readFile(file).then(function (book) {
    var g = X.planGrid(book, { ref: TODAY });
    var from = U.weekStart(TODAY);
    var days = g.days.filter(function (d) { return d.date >= from && d.date <= U.addDays(TODAY, 120); });
    planDialog(book, g, days, stage);
  }).catch(function (e) { toast(e.message || String(e)); });
}
function planDialog(book, g, days, stage) {
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
  back.innerHTML = h;
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
  var by = {}; days.forEach(function (d) { var k = d.product + '|' + (d.sec === 'S1' ? 'SEC-1' : 'SEC-2') + '|' + (d.batches || ''); (by[k] = by[k] || []).push(d.date); });
  var runs = [];
  Object.keys(by).forEach(function (k) {
    var p = k.split('|'), ds = by[k].filter(function (x, i, a) { return a.indexOf(x) === i; }).sort(), start = ds[0], prev = ds[0], sat = 'none';
    function close(end) { runs.push({ product: p[0], from: start, to: end, lines: p[1], sat: sat, batches: p[2] ? +p[2] : null }); }
    ds.forEach(function (d, i) {
      if (i && U.diffDays(prev, d) > 2) { close(prev); start = d; sat = 'none'; }
      if (new Date(d + 'T00:00:00Z').getUTCDay() === 6) sat = p[1];
      prev = d;
    });
    close(prev);
  });
  var merged = [];
  runs.forEach(function (r) {
    var twin = merged.filter(function (m) { return m.product === r.product && m.from === r.from && m.to === r.to && m.batches === r.batches && m.lines !== r.lines && m.lines !== 'both'; })[0];
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
  X.readFile(file).then(function (book) {
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
    stockDialog(book, best.sh, best.t, date || TODAY);
  }).catch(function (e) { toast(e.message || String(e)); });
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
  saveDoc('stock', { items: st, history: hist.slice(-80), updatedAt: new Date().toISOString() }).then(function () { return saveDoc('materials', { items: mats }); }).then(function () { go('stock'); });
}

/* ---------- count vs production: what was really used between two counts ---------- */
function reconcile(prevItems, newItems) {
  var m = run.cache.model, out = [], orders = (S.saved.orders && S.saved.orders.items) || [];
  Object.keys(newItems).forEach(function (id) {
    var a = prevItems[id], b = newItems[id]; if (!a || !b || !a.asOf || a.asOf >= b.asOf) return;
    var mat = m.materials.filter(function (x) { return x.id === id; })[0]; if (!mat) return;
    var rec = 0; orders.forEach(function (o) { if (o.material === id && o.eta > a.asOf && o.eta <= b.asOf) rec += Number(o.qty) || 0; });
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
  A = await ATIC.boot({ page: 'materials', subs: [{ id: 'overview', label: 'Overview', badge: ' ', badgeHidden: true }, { id: 'forecast', label: 'Forecast & plan' }, { id: 'recipes', label: 'Recipes' }, { id: 'stock', label: 'Stock & lead times' }, { id: 'orders', label: 'Open orders' }, { id: 'alerts', label: 'Email alerts' }, { id: 'history', label: 'History' }] });
  if (!A) return;
  S.profile = A.profile; S.canWrite = A.canWrite;
  try { var acts = await A.planner.list('actuals'); buildLP(acts.map(function (x) { return x.data; })); } catch (e) { /* no Line Planner access: forecast uses plan / average pace */ }
  var h = location.hash.slice(1); if (['overview', 'forecast', 'recipes', 'stock', 'orders', 'alerts', 'history'].indexOf(h) >= 0) S.view = h;
  await loadDocs();
  if (!S.channel) S.channel = A.docs.subscribe(function () { loadDocs(); });
})();
