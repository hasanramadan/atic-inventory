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
  A = await ATIC.boot({ page: 'materials', subs: [{ id: 'overview', label: 'Overview', badge: ' ', badgeHidden: true }, { id: 'forecast', label: 'Forecast & plan' }, { id: 'recipes', label: 'Recipes' }, { id: 'inventory', label: 'Inventory', badge: ' ', badgeHidden: true }, { id: 'stock', label: 'Stock & lead times' }, { id: 'orders', label: 'Orders & receiving' }, { id: 'alerts', label: 'Email alerts' }, { id: 'history', label: 'History' }] });
  if (!A) return;
  S.profile = A.profile; S.canWrite = A.canWrite;
  try { var acts = await A.planner.list('actuals'); buildLP(acts.map(function (x) { return x.data; })); } catch (e) { /* no Line Planner access: forecast uses plan / average pace */ }
  var h = location.hash.slice(1); if (['overview', 'forecast', 'recipes', 'inventory', 'stock', 'orders', 'alerts', 'history'].indexOf(h) >= 0) S.view = h;
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
function invLink(it) {
  if (it.cat !== 'raw') return { mat: null, toApp: null };
  var mm = X.parse.matchName(it.name, matList(), 0.62); if (!mm) return { mat: null, toApp: null };
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
  var list = invFiltered(), groups = [];
  list.forEach(function (i) { var g = (i.cat === 'raw' ? 'Raw materials' : 'Packaging') + ' · ' + i.group; if (groups.indexOf(g) < 0) groups.push(g); });
  var est = {}; (fc.results || []).forEach(function (r) { est[r.id] = r; });
  h += '<div class="tablewrap"><table class="inv"><thead><tr><th>Item</th><th>Packing</th><th class="n">Quantity</th><th>Unit</th><th>Critical</th><th>Cover / use</th><th>Forecast</th><th class="n">On order</th><th>Last change</th></tr></thead><tbody>';
  groups.forEach(function (g) {
    h += '<tr class="grp"><td colspan="9">' + esc(g) + '</td></tr>';
    list.filter(function (i) { return (i.cat === 'raw' ? 'Raw materials' : 'Packaging') + ' · ' + i.group === g; }).forEach(function (i) {
      var dv = S.inv.dirty[i.id] || {}, q = dv.qty !== undefined ? dv.qty : i.qty, cr = dv.critical !== undefined ? dv.critical : i.critical;
      var r = i.mat && est[i.mat], estTxt = r && i.toApp ? '<br><span class="small muted" title="Forecast estimate for today from the batches prepared">≈ ' + fmtN(Math.max(0, r.stockNow) / i.toApp) + ' now</span>' : '';
      var oo = openOnItem(i.id);
      h += '<tr class="' + (cr ? 'crit' : '') + (i.missing ? ' gone' : '') + '"><td><b>' + esc(i.name) + '</b>' + (i.note ? '<br><span class="small muted">' + esc(i.note) + '</span>' : '') + (i.qtyText ? '<br><span class="small muted">In the file: "' + esc(i.qtyText) + '"' + (i.qtyNote ? ' · ' + esc(i.qtyNote) : '') + '</span>' : '') + (i.missing ? '<br><span class="small" style="color:var(--amber)">Not in the count of ' + U.nice(i.missing) + ', kept as it was</span>' : '') + '</td>' +
        '<td class="small">' + esc(i.packTxt || '') + '</td>' +
        '<td class="n">' + (S.canWrite ? '<input type="number" step="any" data-invq="' + esc(i.id) + '" value="' + (q == null ? '' : q) + '" style="width:110px">' : fmtN(q)) + estTxt + '</td>' +
        '<td class="small">' + esc(i.unit || '') + '</td>' +
        '<td><label class="dd small"><input type="checkbox" data-invc="' + esc(i.id) + '"' + (cr ? ' checked' : '') + (S.canWrite ? '' : ' disabled') + '>' + (cr ? '<span class="chip order" style="padding:1px 8px">Critical</span>' : '') + '</label>' + (cr && i.critFrom ? '<span class="small muted" style="display:block">' + esc(i.critFrom) + '</span>' : '') + '</td>' +
        '<td class="small">' + esc([i.enough, i.use].filter(Boolean).join(' · ')) + (i.needOrder ? ' <span class="chip soon" style="padding:1px 8px">Need to order</span>' : '') + '</td>' +
        '<td class="small">' + invFcCell(i) + '</td>' +
        '<td class="n">' + (oo ? fmtN(oo) : '') + '</td>' +
        '<td class="small muted">' + (i.asOf ? U.nice(i.asOf) : '') + (i.source ? '<br>' + esc(i.source) : '') + '</td></tr>';
    });
  });
  if (!list.length) h += '<tr><td colspan="9" class="muted">No item matches.</td></tr>';
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
  document.querySelectorAll('[data-invf]').forEach(function (b) { b.onclick = function () { S.inv.filter = b.dataset.invf; render(); }; });
  var q = $('#invQ'); if (q) q.oninput = function () { S.inv.q = q.value; var y = window.scrollY; render(); window.scrollTo(0, y); var n = $('#invQ'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } };
  document.querySelectorAll('[data-invq]').forEach(function (el) { el.onchange = function () { var id = el.dataset.invq, it = invById(id), v = el.value === '' ? null : +el.value; var dv = S.inv.dirty[id] = S.inv.dirty[id] || {}; if (v === it.qty) delete dv.qty; else dv.qty = v; if (!Object.keys(dv).length) delete S.inv.dirty[id]; var y = window.scrollY; render(); window.scrollTo(0, y); }; });
  document.querySelectorAll('[data-invc]').forEach(function (el) { el.onchange = function () { var id = el.dataset.invc, it = invById(id); var dv = S.inv.dirty[id] = S.inv.dirty[id] || {}; if (el.checked === !!it.critical) delete dv.critical; else dv.critical = el.checked; if (!Object.keys(dv).length) delete S.inv.dirty[id]; var y = window.scrollY; render(); window.scrollTo(0, y); }; });
  document.querySelectorAll('[data-invf2]').forEach(function (el) { el.onchange = function () { var id = el.dataset.invf2, v = +el.value || null; var dv = S.inv.dirty[id] = S.inv.dirty[id] || {}; if (v) dv.toApp = v; else delete dv.toApp; if (!Object.keys(dv).length) delete S.inv.dirty[id]; var y = window.scrollY; render(); window.scrollTo(0, y); }; });
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
function invSaveEdits() {
  var d = JSON.parse(JSON.stringify(invDoc())), by = (S.profile && (S.profile.full_name || S.profile.username)) || '';
  d.moves = d.moves || [];
  d.items.forEach(function (i) {
    var dv = S.inv.dirty[i.id]; if (!dv) return;
    if (dv.qty !== undefined) { i.qty = dv.qty; i.asOf = TODAY; i.countAsOf = TODAY; i.source = 'Changed by hand'; i.qtyText = ''; i.qtyNote = ''; d.moves.push({ at: new Date().toISOString(), date: TODAY, id: i.id, qty: dv.qty, kind: 'edit', by: by }); }
    if (dv.critical !== undefined) { i.critical = dv.critical; i.critFrom = dv.critical ? 'marked by hand ' + U.nice(TODAY) : ''; }
    if (dv.toApp !== undefined) i.toApp = dv.toApp;
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
        toast(pl.missing.length ? 'Saved. Overview updated; ' + pl.missing.length + ' line(s) need a conversion (see the Forecast column).' : 'Saved. The Overview now uses this count.');
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
      return '<tr><td><b>' + esc(it.name) + '</b>' + (o.inv ? '' : '<br><span class="small muted">forecast only, no inventory line</span>') + '</td><td class="n">' + fmtN(o.qty) + ' <span class="small muted">' + esc(it.unit) + '</span></td><td class="n">' + (got ? fmtN(got) : '') + (rc ? '<br><span class="small muted">' + rc + '</span>' : '') + '</td><td class="n">' + (isOpen && rest ? fmtN(rest) : '') + '</td><td>' + (o.eta ? U.nice(o.eta) : '') + '</td><td class="small">' + esc(o.ref || '') + '</td>' +
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
      o.receipts = (o.receipts || []).concat([{ date: st.date, qty: recv2, note: st.note, at: new Date().toISOString(), full: !!st.full }]);
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
        p = Promise.resolve(saveDoc('inventory', d));
      }
      p.then(function () { return saveDoc('orders', { items: list }); }).then(function () {
        toast(st.full || left2 <= 1e-9 ? 'Received in full and added to the inventory.' : 'Received ' + fmtN(recv2) + ' of ' + fmtN(rest) + (o.status === 'partial' ? '; the rest stays open.' : '; order closed short.'));
      });
    };
  }
  draw();
}

/* ---------- Overview cards: what the inventory says ---------- */
(function () {
  var _card = card;
  card = function (r) {
    var h = _card(r), lines = invItems().filter(function (i) { return i.mat === r.id && !i.missing; });
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
