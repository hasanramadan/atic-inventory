/* Production calculator (Raw Materials page, tab "Production calculator").
   Type what you want to make (product, size, cartons, section); from the Line Planner actuals it works out
   batches (cartons per batch really achieved on that section), days (cartons per filling minute × the share of a
   shift that is filling), and the raw materials (batches × recipe), then checks them against the stock today.
   A material that is out is replaced the same way the forecast does it (Irani → UAE, citric anhydrous → monohydrate). */
(function () {
  var PN = { GM: 'Grenadine Molasses', LS: 'Lemon Substitute', WV: 'White Vinegar', BW: 'Blossom Water', RW: 'Rose Water' };
  var SUB = { irani: { to: 'uae', f: 1 }, citric: { to: 'citricmono', f: 210.14 / 192.12 } };
  var KG = { irani: 25, uae: 25, iraqi: 25, sugar: 50, orange: 10, rose: 10 };
  var SECN = { 'SEC-1': 'Section 1', 'SEC-2': 'Section 2' };
  /* batch preparation before filling, per batch: filtering then heating (minutes). Blossom water: filter 20–30 min,
     heat 6 h. Rose water: filter about 20 min, heat 1.5 h. */
  var PREP = { BW: { filter: 25, filterTxt: '20–30 min', heat: 360, heatTxt: '6 h' }, RW: { filter: 20, filterTxt: '20 min', heat: 90, heatTxt: '1.5 h' } };
  var LPM = null; /* Line Planner model (cartons per batch and filling speed) for items with no actuals yet */
  function loadLPM() { if (LPM || loadLPM.busy || !window.ATIC || !ATIC.planner || !ATIC.planner.config) return; loadLPM.busy = true; ATIC.planner.config().then(function (c) { LPM = (c && c.params) || {}; if (S.view === 'calc') render(); }).catch(function () { LPM = {}; }); }
  S.calc = S.calc || { lines: [{ product: 'GM', size: '750ml', sec: 'auto', cartons: '', variant: '' }] };

  function n1(x, d) { return fmtN(Math.round(x * Math.pow(10, d || 0)) / Math.pow(10, d || 0)); }
  function kgPer(mat) { if (KG[mat.id]) return KG[mat.id]; if (mat.recipeUnit === 'kg' && mat.recipeFactor > 0) return mat.recipeFactor; return mat.unit === 'kg' ? 1 : null; }

  /* what the Line Planner actuals say, per product | size | section */
  function history() {
    var st = {}, sec = {};
    (LP.list || []).forEach(function (a) {
      if (!a || !a.sec || a.kind === 'plan') return;
      var s = a.sec === 'S1' ? 'SEC-1' : 'SEC-2';
      if (Number(a.workMin) > 0 && Number(a.fillMin) >= 0) { var q = sec[s] = sec[s] || { work: 0, fill: 0, days: 0 }; q.work += Number(a.workMin); q.fill += Number(a.fillMin); q.days++; }
      var runs = (a.runs && a.runs.length) ? a.runs : [{ product: a.product, size: a.size, boxes: a.boxes, batches: a.batches, opening: a.openingBalance, closing: a.closingBalance, fillMin: a.fillMin }];
      runs.forEach(function (r) {
        if (!r.product || !r.size || r.prepOnly || !(Number(r.boxes) > 0)) return;
        var k = r.product + '|' + r.size + '|' + s, x = st[k] = st[k] || { boxes: 0, fill: 0, bBoxes: 0, used: 0, days: {} };
        x.days[a.date] = 1;
        if (Number(r.fillMin) > 0) { x.boxes += Number(r.boxes); x.fill += Number(r.fillMin); }
        var o = r.opening != null ? r.opening : (runs.length === 1 ? a.openingBalance : null), c = r.closing != null ? r.closing : (runs.length === 1 ? a.closingBalance : null), b = r.batches != null ? r.batches : (runs.length === 1 ? a.batches : null);
        if (o != null && c != null && b != null) { var used = Number(o) + Number(b) - Number(c); if (used > 0.2) { x.bBoxes += Number(r.boxes); x.used += used; } }
      });
    });
    return { items: st, secs: sec };
  }
  function itemsList(H) {
    var seen = {}, out = [];
    Object.keys(H.items).forEach(function (k) { var p = k.split('|'), id = p[0] + '|' + p[1]; if (!seen[id]) { seen[id] = 1; out.push({ product: p[0], size: p[1] }); } });
    Object.keys((LPM && LPM.boxesPerBatch) || {}).forEach(function (id) { var p = id.split('|'); if (!seen[id] && run.cache && run.cache.model.recipes[p[0]]) { seen[id] = 1; out.push({ product: p[0], size: p[1] }); } });
    var order = ['GM', 'LS', 'WV', 'BW', 'RW'], sz = function (s) { return /l$/i.test(s) && !/ml$/i.test(s) ? parseFloat(s) * 1000 : parseFloat(s); };
    return out.sort(function (a, b) { return (order.indexOf(a.product) - order.indexOf(b.product)) || (sz(a.size) - sz(b.size)); });
  }
  /* figures for one item on one section; falls back to the other section when this one has no history */
  function figures(H, product, size, sec) {
    function on(s) {
      var x = H.items[product + '|' + size + '|' + s], q = H.secs[s];
      if (!x || !(x.used > 0) || !(x.fill > 0) || !q) return null;
      var share = q.fill / q.work, perMin = x.boxes / x.fill;
      return { sec: s, bpb: x.bBoxes / x.used, perMin: perMin, perDay: perMin * share * 600, share: share, days: Object.keys(x.days).length };
    }
    function model(s) {
      var key = product + '|' + size, bp = LPM && LPM.boxesPerBatch && LPM.boxesPerBatch[key], sp = LPM && LPM.speed && LPM.speed[key + '|' + (s === 'SEC-1' ? 'S1' : 'S2')], q = H.secs[s];
      if (!bp || !sp || !q) return null;
      var share = q.fill / q.work;
      return { sec: s, bpb: bp.boxes, perMin: sp.p50, perDay: sp.p50 * share * 600, share: share, days: 0, model: true };
    }
    if (sec !== 'auto') { var f = on(sec); if (f) return f; var o = on(sec === 'SEC-1' ? 'SEC-2' : 'SEC-1'); if (o) { o.fallback = true; o.asked = sec; return o; } return model(sec); }
    var a = on('SEC-1'), b = on('SEC-2');
    if (a && b) return a.days >= b.days ? a : b;
    return a || b || model('SEC-2') || model('SEC-1');
  }

  window.vCalc = function (fc) {
    loadLPM();
    var H = history(), items = itemsList(H), m = fc.model, mats = {}, lines = S.calc.lines;
    m.materials.forEach(function (x) { mats[x.id] = x; });
    var stock = {}; fc.results.forEach(function (r) { stock[r.id] = { now: Math.max(0, Number(r.stockNow) || 0), orders: (r.openOrders || []).filter(function (o) { return o.eta >= TODAY && o.qty > 0; }) }; });

    var h = '<div class="panel"><h2 style="margin:0 0 4px">Production calculator</h2><p class="small muted" style="margin:0 0 12px">Type the cartons you want to make. Batches and days come from what each section really achieved in the Line Planner actuals; materials are batches × recipe, checked against the stock today.</p>';
    h += '<div class="tablewrap"><table><thead><tr><th>Product & size</th><th>Section</th><th>Recipe</th><th class="n">Cartons</th><th class="n" title="Only for products heated before filling">Batches heated at once</th><th></th></tr></thead><tbody>';
    lines.forEach(function (L, i) {
      var vs = (m.variants && m.variants[L.product]) || {};
      h += '<tr><td><select data-cl="item" data-i="' + i + '">' + items.map(function (it) { var v = it.product + '|' + it.size; return '<option value="' + esc(v) + '"' + (v === L.product + '|' + L.size ? ' selected' : '') + '>' + esc((PN[it.product] || it.product) + ' ' + it.size) + '</option>'; }).join('') + '</select></td>' +
        '<td><select data-cl="sec" data-i="' + i + '">' + [['auto', 'Usual section'], ['SEC-1', 'Section 1'], ['SEC-2', 'Section 2']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === L.sec ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></td>' +
        '<td>' + (Object.keys(vs).length ? '<select data-cl="variant" data-i="' + i + '"><option value="">' + esc((S.saved.recipes && S.saved.recipes.names && S.saved.recipes.names[L.product]) || 'Standard') + '</option>' + Object.keys(vs).map(function (k) { return '<option value="' + esc(k) + '"' + (k === L.variant ? ' selected' : '') + '>' + esc(vs[k].name || k) + '</option>'; }).join('') + '</select>' : '<span class="small muted">Standard</span>') + '</td>' +
        '<td class="n"><input type="number" min="0" step="1" inputmode="numeric" data-cl="cartons" data-i="' + i + '" value="' + esc(L.cartons) + '" placeholder="e.g. 5000" style="width:120px;text-align:right"></td>' +
        '<td class="n">' + (PREP[L.product] ? '<input type="number" min="1" step="1" data-cl="heat" data-i="' + i + '" value="' + esc(L.heat || 1) + '" style="width:70px;text-align:right">' : '<span class="small muted">–</span>') + '</td>' +
        '<td>' + (lines.length > 1 ? '<button class="btn ghost" data-cl="del" data-i="' + i + '" aria-label="Remove line">✕</button>' : '') + '</td></tr>';
    });
    h += '</tbody></table></div><div class="row" style="gap:8px;margin-top:10px"><button class="btn" data-cl="add">+ Add product</button><button class="btn primary" data-cl="go">Calculate</button></div></div>';

    var todo = lines.filter(function (L) { return Number(L.cartons) > 0; });
    if (!todo.length) return subbarSafe(h);

    /* per line: batches, days, materials */
    var need = {}, rows = [], bySec = {};
    todo.forEach(function (L) {
      var f = figures(H, L.product, L.size, L.sec), c = Number(L.cartons);
      if (!f) { rows.push({ L: L, none: true }); return; }
      var batches = c / f.bpb, fillDays = c / f.perDay, days = fillDays, pr = PREP[L.product], prep = null;
      if (pr) {
        var per = pr.filter + pr.heat, heat = Math.max(1, Number(L.heat) || 1), prepDays = Math.ceil(batches) * per / heat / 600, lead = per / 600;
        days = Math.max(fillDays + lead, prepDays);
        prep = { per: per, heat: heat, lead: lead, prepDays: prepDays, fillDays: fillDays, limit: prepDays > fillDays + lead ? 'prep' : 'fill', pr: pr };
      }
      bySec[f.sec] = (bySec[f.sec] || 0) + days;
      var vr = L.variant && m.variants && m.variants[L.product] && m.variants[L.product][L.variant];
      var r = (vr ? vr[f.sec] : (m.recipes[L.product] || {})[f.sec]) || {};
      Object.keys(r).forEach(function (id) { var q = Number(r[id]) || 0; if (q) need[id] = (need[id] || 0) + q * batches; });
      rows.push({ L: L, f: f, batches: batches, days: days, prep: prep });
    });
    /* a material that runs short is replaced by its substitute */
    var subNote = {};
    Object.keys(SUB).forEach(function (a) {
      if (!need[a] || !mats[SUB[a].to]) return;
      var have = (stock[a] || {}).now || 0, short = need[a] - have;
      if (short > 1e-9) { need[a] = have; need[SUB[a].to] = (need[SUB[a].to] || 0) + short * SUB[a].f; subNote[a] = { to: SUB[a].to, qty: short, as: short * SUB[a].f }; }
    });

    var totalDays = Math.max.apply(null, Object.keys(bySec).map(function (s) { return bySec[s]; }).concat([0]));
    h += '<div class="panel"><h3 style="font-size:16px;margin:0 0 8px">Batches and days</h3><div class="tablewrap"><table><thead><tr><th>Product</th><th class="n">Cartons</th><th>Section</th><th class="n">Cartons per batch</th><th class="n">Batches</th><th class="n">Cartons per day</th><th class="n">Working days</th></tr></thead><tbody>' +
      rows.map(function (x) {
        var nm = esc((PN[x.L.product] || x.L.product) + ' ' + x.L.size);
        if (x.none) return '<tr><td><b>' + nm + '</b></td><td class="n">' + fmtN(Number(x.L.cartons)) + '</td><td colspan="5" class="muted">No production history for this item yet.</td></tr>';
        return '<tr><td><b>' + nm + '</b></td><td class="n">' + fmtN(Number(x.L.cartons)) + '</td><td>' + SECN[x.f.sec] + (x.f.fallback ? ' <span class="small muted">(no history on ' + SECN[x.f.asked] + ')</span>' : '') + '</td><td class="n">' + n1(x.f.bpb, 1) + '</td><td class="n"><b>' + n1(x.batches, 1) + '</b></td><td class="n">' + fmtN(Math.round(x.f.perDay)) + '</td><td class="n"><b>' + n1(x.days, 1) + '</b></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p style="margin:10px 0 0"><b>About ' + n1(totalDays, 1) + ' working day' + (Math.abs(totalDays - 1) < 0.05 ? '' : 's') + '</b>' + (Object.keys(bySec).length > 1 ? ' (the two sections run at the same time: ' + Object.keys(bySec).sort().map(function (s) { return SECN[s] + ' ' + n1(bySec[s], 1); }).join(', ') + ')' : '') + '. <span class="small muted">A working day is a 600-minute shift at the usual share of filling time for that section; changeovers between products add to this.</span></p></div>';

    var ids = Object.keys(need).filter(function (id) { return need[id] > 1e-9; }).sort(function (a, b) { return (need[b] * (kgPer(mats[b] || {}) || 1)) - (need[a] * (kgPer(mats[a] || {}) || 1)); });
    var short = 0;
    h += '<div class="panel"><h3 style="font-size:16px;margin:0 0 8px">Raw materials needed</h3><div class="tablewrap"><table><thead><tr><th>Material</th><th class="n">Needed</th><th class="n">Needed (kg)</th><th class="n">In stock today</th><th class="n">Left after</th><th>Enough?</th></tr></thead><tbody>' +
      ids.map(function (id) {
        var mt = mats[id] || { name: id, unit: '' }, q = need[id], have = (stock[id] || {}).now || 0, left = have - q, kg = kgPer(mt), ok = left >= -1e-9;
        if (!ok) short++;
        var coming = ((stock[id] || {}).orders || []).map(function (o) { return '+' + fmtN(Math.round(o.qty)) + ' on ' + U.nice(o.eta); }).join(', ');
        var sn = subNote[id] ? '<br><span class="small muted">Stock ' + fmtN(Math.round(have * 10) / 10) + ' used first; the rest is made with ' + esc((mats[subNote[id].to] || {}).name || subNote[id].to) + '</span>' : '';
        return '<tr><td><b>' + esc(mt.name) + '</b>' + sn + '</td><td class="n">' + n1(q, q < 10 ? 2 : 1) + ' ' + esc(mt.unit) + '</td><td class="n">' + (kg ? fmtN(Math.round(q * kg)) : '') + '</td><td class="n">' + n1(have, have < 10 ? 2 : 1) + '</td><td class="n">' + n1(left, Math.abs(left) < 10 ? 2 : 1) + '</td><td>' + (ok ? '<span class="chip ok" style="padding:1px 8px">Enough</span>' : '<span class="chip order" style="padding:1px 8px">Short ' + n1(-left, -left < 10 ? 2 : 1) + ' ' + esc(mt.unit) + '</span>' + (coming ? '<br><span class="small muted">Coming: ' + esc(coming) + '</span>' : '')) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p style="margin:10px 0 0">' + (short ? '<b style="color:var(--red)">' + short + ' material' + (short === 1 ? ' is' : 's are') + ' short</b> for this order with today\'s stock.' : '<b style="color:var(--green)">Stock today covers this order.</b>') + ' <span class="small muted">Stock today = last physical count (' + esc(U.nice((S.saved.inventory || {}).asOf || '')) + ') − what the batches used since + deliveries received. It does not hold back what the current factory plan will use.</span></p></div>';
    return subbarSafe(h);
  };
  function subbarSafe(h) { return h; }

  after.calc = function () {
    var main = document.getElementById('main'); if (!main) return;
    function sync() {
      main.querySelectorAll('[data-cl][data-i]').forEach(function (el) {
        var L = S.calc.lines[+el.dataset.i]; if (!L) return;
        if (el.dataset.cl === 'item') { var p = el.value.split('|'); if (L.product !== p[0]) L.variant = ''; L.product = p[0]; L.size = p[1]; }
        else if (el.dataset.cl === 'sec') L.sec = el.value;
        else if (el.dataset.cl === 'variant') L.variant = el.value;
        else if (el.dataset.cl === 'cartons') L.cartons = el.value;
        else if (el.dataset.cl === 'heat') L.heat = Math.max(1, Math.round(Number(el.value) || 1));
      });
    }
    main.querySelectorAll('select[data-cl]').forEach(function (el) { el.onchange = function () { sync(); render(); }; });
    main.querySelectorAll('input[data-cl="cartons"],input[data-cl="heat"]').forEach(function (el) { el.onkeydown = function (e) { if (e.key === 'Enter') { sync(); render(); } }; el.onchange = function () { sync(); render(); }; });
    var go = main.querySelector('[data-cl="go"]'); if (go) go.onclick = function () { sync(); render(); };
    var add = main.querySelector('[data-cl="add"]'); if (add) add.onclick = function () { sync(); var l = S.calc.lines[S.calc.lines.length - 1]; S.calc.lines.push({ product: l.product, size: l.size, sec: 'auto', cartons: '', variant: '' }); render(); };
    main.querySelectorAll('[data-cl="del"]').forEach(function (b) { b.onclick = function () { sync(); S.calc.lines.splice(+b.dataset.i, 1); render(); }; });
  };
})();
