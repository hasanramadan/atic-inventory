/* Production calculator (Raw Materials page, tab "Production calculator").
   Same logic as the Supply Planner: the Line Planner model learned from the actuals gives cartons per batch and
   cartons per day for each item and section (with its stops and changeovers); the Supply Planner schedule lays the
   cartons out day by day (Friday off, Saturdays as set); the Raw Materials forecast adds those batches to the factory
   plan and checks every material week by week. Only the input differs: cartons instead of trucks.
   Blossom and rose water are filtered and heated before filling, which can set the pace. */
(function () {
  var SUB = { irani: { to: 'uae', f: 1 }, citric: { to: 'citricmono', f: 210.14 / 192.12 } };
  var KG = { irani: 25, uae: 25, iraqi: 25, sugar: 50, orange: 10, rose: 10 };
  /* per batch, before filling: filtering then heating (minutes) */
  var PREP = { BW: { filter: 25, filterTxt: '20–30 min', heat: 360, heatTxt: '6 h' }, RW: { filter: 20, filterTxt: '20 min', heat: 90, heatTxt: '1.5 h' } };
  var SECN = { S1: 'Section 1', S2: 'Section 2' };
  var SP = null, M = null, ITEMS = null, ERR = '';
  S.calc = S.calc || null;

  function n1(x, d) { var p = Math.pow(10, d || 0); return fmtN(Math.round(x * p) / p); }
  function kgPer(mat) { if (KG[mat.id]) return KG[mat.id]; if (mat.recipeUnit === 'kg' && mat.recipeFactor > 0) return mat.recipeFactor; return mat.unit === 'kg' ? 1 : null; }
  function nextWork(d) { d = U.addDays(d, 1); while (new Date(d + 'T00:00:00Z').getUTCDay() === 5) d = U.addDays(d, 1); return d; }

  function load() {
    if (M || load.busy) return; load.busy = true;
    SP = window.ATICSupply;
    if (!SP || !window.ATIC_LINE_ENGINE) { ERR = 'The planner engines did not load. Refresh the page.'; return; }
    ATIC.planner.config().then(function (c) {
      if (!c || !c.params) { ERR = 'The Line Planner model is not available.'; render(); return; }
      var acts = (LP.list || []).filter(function (x) { return x && x.date && x.sec; });
      M = SP.lineModel(window.ATIC_LINE_ENGINE, c.params, acts, TODAY);
      ITEMS = SP.items(S.saved.supply);
      if (S.view === 'calc') render();
    }).catch(function (e) { ERR = 'Could not read the Line Planner model: ' + (e.message || e); render(); });
  }

  window.vCalc = function (fc) {
    load();
    var st = S.calc = S.calc || { lines: [{ item: 'GM750', cartons: '', variant: '', heat: 1 }], sections: ['S1', 'S2'], start: nextWork(TODAY), saturdays: !!((S.saved.supply || {}).saturdays) };
    var h = '<div class="panel"><h2 style="margin:0 0 4px">Production calculator</h2><p class="small muted" style="margin:0 0 12px">Type the cartons to make. Batches, days and dates use the same Line Planner model and schedule as the Supply Planner; materials are checked with the Raw Materials forecast, including the current factory plan.</p>';
    if (ERR) return h + '<p class="muted">' + esc(ERR) + '</p></div>';
    if (!M) return h + '<p class="muted">Loading the Line Planner model…</p></div>';
    var m = fc.model;
    h += '<div class="tablewrap"><table><thead><tr><th>Product & size</th><th>Recipe</th><th class="n">Cartons</th><th class="n" title="Only for products heated before filling">Batches heated at once</th><th></th></tr></thead><tbody>';
    st.lines.forEach(function (L, i) {
      var it = SP.itemById(ITEMS, L.item) || ITEMS[0], vs = (m.variants && m.variants[it.product]) || {};
      h += '<tr><td><select data-cl="item" data-i="' + i + '">' + ITEMS.map(function (x) { return '<option value="' + x.id + '"' + (x.id === it.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></td>' +
        '<td>' + (Object.keys(vs).length ? '<select data-cl="variant" data-i="' + i + '"><option value="">' + esc((S.saved.recipes && S.saved.recipes.names && S.saved.recipes.names[it.product]) || 'Standard') + '</option>' + Object.keys(vs).map(function (k) { return '<option value="' + esc(k) + '"' + (k === L.variant ? ' selected' : '') + '>' + esc(vs[k].name || k) + '</option>'; }).join('') + '</select>' : '<span class="small muted">Standard</span>') + '</td>' +
        '<td class="n"><input type="number" min="0" step="1" inputmode="numeric" data-cl="cartons" data-i="' + i + '" value="' + esc(L.cartons) + '" placeholder="e.g. 5000" style="width:120px;text-align:right"></td>' +
        '<td class="n">' + (PREP[it.product] ? '<input type="number" min="1" step="1" data-cl="heat" data-i="' + i + '" value="' + esc(L.heat || 1) + '" style="width:70px;text-align:right">' : '<span class="small muted">–</span>') + '</td>' +
        '<td>' + (st.lines.length > 1 ? '<button class="btn ghost" data-cl="del" data-i="' + i + '" aria-label="Remove line">✕</button>' : '') + '</td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div class="row" style="gap:14px;flex-wrap:wrap;align-items:flex-end;margin-top:10px">' +
      '<label class="small">Sections<br><select data-cs="sec">' + [['S1,S2', 'Both sections'], ['S1', 'Section 1'], ['S2', 'Section 2']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === st.sections.join(',') ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="small">Start<br><input type="date" data-cs="start" value="' + esc(st.start) + '"></label>' +
      '<label class="small">Saturdays<br><select data-cs="sat"><option value="0"' + (st.saturdays ? '' : ' selected') + '>Off</option><option value="1"' + (st.saturdays ? ' selected' : '') + '>Working</option></select></label>' +
      '<button class="btn" data-cl="add">+ Add product</button><button class="btn primary" data-cl="go">Calculate</button></div></div>';

    var lines = st.lines.filter(function (L) { return Number(L.cartons) > 0; });
    if (!lines.length) return h;
    var calc = SP.cartonsCalc(lines.map(function (L) { return { item: L.item, cartons: Number(L.cartons) }; }), { sections: st.sections, start: st.start, saturdays: st.saturdays, model: M, items: ITEMS });
    if (calc.errors.length) return h + '<div class="panel"><p style="color:var(--red)">' + calc.errors.map(esc).join('<br>') + '</p></div>';

    /* preparation (filter + heat) per item */
    var prepNote = {}, extraDays = 0;
    calc.rows.forEach(function (r) {
      var pr = PREP[r.item.product]; if (!pr) return;
      var L = lines.filter(function (x) { return x.item === r.item.id; })[0] || {}, heat = Math.max(1, Number(L.heat) || 1), per = pr.filter + pr.heat;
      var prepDays = Math.ceil(r.batches) * per / heat / 600, slower = prepDays - r.days;
      prepNote[r.item.id] = { pr: pr, per: per, heat: heat, prepDays: prepDays, limit: slower > 0 };
      if (slower > 0) extraDays += slower;
    });

    var secTxt = st.sections.length === 2 ? 'both sections' : SECN[st.sections[0]];
    h += '<div class="panel"><h3 style="font-size:16px;margin:0 0 8px">Batches and days</h3><div class="tablewrap"><table><thead><tr><th>Product</th><th class="n">Cartons</th><th class="n">Cartons per batch</th><th class="n">Batches</th><th class="n">Cartons per day</th><th class="n">Working days</th></tr></thead><tbody>' +
      calc.rows.map(function (r) {
        var pn = prepNote[r.item.id];
        return '<tr><td><b>' + esc(r.item.name) + '</b></td><td class="n">' + fmtN(Math.round(r.cartons)) + '</td><td class="n">' + n1(r.bpb, 1) + '</td><td class="n"><b>' + n1(r.batches, 1) + '</b></td><td class="n">' + fmtN(Math.round(r.cap.p50)) + ' <span class="small muted">(' + fmtN(Math.round(r.cap.p10)) + '–' + fmtN(Math.round(r.cap.p90)) + ')</span></td><td class="n"><b>' + n1(pn && pn.limit ? pn.prepDays : r.days, 1) + '</b> <span class="small muted">(' + n1(r.daysLo, 1) + '–' + n1(pn && pn.limit ? Math.max(pn.prepDays, r.daysHi) : r.daysHi, 1) + ')</span></td></tr>' +
          (pn ? '<tr><td colspan="6" class="small" style="background:var(--bg)">Each batch is filtered (' + pn.pr.filterTxt + ') and heated (' + pn.pr.heatTxt + ') before filling: about ' + n1(pn.per / 60, 1) + ' h per batch, ' + pn.heat + ' at a time. Preparing ' + Math.ceil(r.batches) + ' batches takes about ' + n1(pn.prepDays, 1) + ' working days against ' + n1(r.days, 1) + ' days of filling. ' + (pn.limit ? '<b>Preparation sets the pace.</b>' : 'Filling sets the pace; the first batch must be ready ' + n1(pn.per / 60, 1) + ' h before filling starts.') + '</td></tr>' : '');
      }).join('') + '</tbody></table></div>' +
      '<p style="margin:10px 0 0"><b>' + fmtN(Math.round(calc.cartons)) + ' cartons, ' + n1(calc.batches, 1) + ' batches, ' + calc.workdays + ' working day' + (calc.workdays === 1 ? '' : 's') + ' on ' + secTxt + '</b>: ' + esc(U.nice(calc.start)) + ' to ' + esc(U.nice(calc.finish)) + (extraDays > 0.05 ? ', plus about ' + n1(extraDays, 1) + ' day' + (extraDays >= 1.05 ? 's' : '') + ' because preparation is slower than filling' : '') + '. <span class="small muted">Cartons per day = Line Planner forecast for a full day of that item (usual case, with the range in brackets). Friday off; Saturdays ' + (st.saturdays ? 'working' : 'off') + '.</span></p></div>';

    /* materials: the order added to the factory plan, run through the stock forecast */
    var vars = {}; lines.forEach(function (L) { var it = SP.itemById(ITEMS, L.item); if (it && L.variant) vars[it.product] = L.variant; });
    var mi = SP.materialsImpact(window.ATICEngine, BASE, savedForEngine(), calc.days, TODAY, { variants: vars });
    if (!mi) return h;
    var mats = {}; m.materials.forEach(function (x) { mats[x.id] = x; });
    var byId = {}; mi.rows.forEach(function (r) { byId[r.id] = r; });
    var now = {}, rr = {}; fc.results.forEach(function (r) { now[r.id] = Math.max(0, Number(r.stockNow) || 0); rr[r.id] = r; });
    var need = {}; mi.rows.forEach(function (r) { need[r.id] = r.need; });
    var subIn = {};
    Object.keys(SUB).forEach(function (a) { if (!(need[a] > 0) || !mats[SUB[a].to]) return; var short = need[a] - (now[a] || 0); if (short > 1e-9) { need[a] = now[a] || 0; need[SUB[a].to] = (need[SUB[a].to] || 0) + short * SUB[a].f; subIn[SUB[a].to] = { from: a, qty: short * SUB[a].f }; } });
    var ids = Object.keys(need).filter(function (id) { return need[id] > 1e-9; }).sort(function (a, b) { return need[b] * (kgPer(mats[b] || {}) || 1) - need[a] * (kgPer(mats[a] || {}) || 1); });
    var shortToday = 0, shortPlan = 0;
    h += '<div class="panel"><h3 style="font-size:16px;margin:0 0 8px">Raw materials</h3><div class="tablewrap"><table><thead><tr><th>Material</th><th class="n">Needed</th><th class="n">kg</th><th class="n">Stock today</th><th>From today\'s stock</th><th>With the factory plan</th></tr></thead><tbody>' +
      ids.map(function (id) {
        var mt = mats[id] || { name: id, unit: '' }, q = need[id], have = now[id] || 0, left = have - q, kg = kgPer(mt), r = byId[id] || rr[id] || {};
        var okToday = left >= -1e-9; if (!okToday) shortToday++;
        var bad = r.firstShortWeek || (r.runOut && r.runOut <= calc.finish);
        var withPlan = r.firstShortWeek ? '<span class="chip order" style="padding:1px 8px">Short from week of ' + esc(U.nice(r.firstShortWeek)) + '</span>' : (r.runOut && r.runOut <= calc.finish ? '<span class="chip order" style="padding:1px 8px">Runs out ' + esc(U.nice(r.runOut)) + '</span>' : '<span class="chip ok" style="padding:1px 8px">Covered</span>');
        if (bad) shortPlan++;
        var coming = ((rr[id] || {}).openOrders || []).filter(function (o) { return o.eta >= TODAY; }).map(function (o) { return '+' + fmtN(Math.round(o.qty)) + ' on ' + U.nice(o.eta); }).join(', ');
        var sn = subIn[id] ? '<br><span class="small muted">Includes ' + n1(subIn[id].qty, 1) + ' ' + esc(mt.unit) + ' in place of ' + esc((mats[subIn[id].from] || {}).name || subIn[id].from) + ' (' + ((now[subIn[id].from] || 0) > 0 ? 'only ' + n1(now[subIn[id].from], 1) + ' left' : 'none in stock') + ')</span>' : '';
        return '<tr><td><b>' + esc(mt.name) + '</b>' + sn + '</td><td class="n">' + n1(q, q < 10 ? 2 : 1) + ' ' + esc(mt.unit) + '</td><td class="n">' + (kg ? fmtN(Math.round(q * kg)) : '') + '</td><td class="n">' + n1(have, have < 10 ? 2 : 1) + '</td><td>' + (okToday ? '<span class="chip ok" style="padding:1px 8px">Enough</span>' : '<span class="chip order" style="padding:1px 8px">Short ' + n1(-left, -left < 10 ? 2 : 1) + ' ' + esc(mt.unit) + '</span>') + '</td><td>' + withPlan + (coming ? '<br><span class="small muted">Coming: ' + esc(coming) + '</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p style="margin:10px 0 0">' + (shortToday ? '<b style="color:var(--red)">' + shortToday + ' material' + (shortToday === 1 ? ' is' : 's are') + ' short</b> from today\'s stock. ' : '<b style="color:var(--green)">Today\'s stock covers this order.</b> ') + (shortPlan ? '<b style="color:var(--red)">' + shortPlan + ' run' + (shortPlan === 1 ? 's' : '') + ' short</b> once the current factory plan is counted too.' : 'It stays covered with the current factory plan.') +
      ' <span class="small muted">Stock today = last physical count (' + esc(U.nice((S.saved.inventory || {}).asOf || '')) + ') − what the batches used since + deliveries received. "With the factory plan" adds this order to the plan on its sections and runs the stock forecast week by week, counting deliveries due.</span></p></div>';
    return h;
  };

  after.calc = function () {
    var main = document.getElementById('main'); if (!main || !S.calc) return;
    function sync() {
      main.querySelectorAll('[data-cl][data-i]').forEach(function (el) {
        var L = S.calc.lines[+el.dataset.i]; if (!L) return;
        if (el.dataset.cl === 'item') { if (L.item !== el.value) L.variant = ''; L.item = el.value; }
        else if (el.dataset.cl === 'variant') L.variant = el.value;
        else if (el.dataset.cl === 'cartons') L.cartons = el.value;
        else if (el.dataset.cl === 'heat') L.heat = Math.max(1, Math.round(Number(el.value) || 1));
      });
      var s = main.querySelector('[data-cs="sec"]'); if (s) S.calc.sections = s.value.split(',');
      var d = main.querySelector('[data-cs="start"]'); if (d && d.value) S.calc.start = d.value;
      var t = main.querySelector('[data-cs="sat"]'); if (t) S.calc.saturdays = t.value === '1';
    }
    main.querySelectorAll('select[data-cl],select[data-cs],input[data-cs]').forEach(function (el) { el.onchange = function () { sync(); render(); }; });
    main.querySelectorAll('input[data-cl]').forEach(function (el) { el.onkeydown = function (e) { if (e.key === 'Enter') { sync(); render(); } }; el.onchange = function () { sync(); render(); }; });
    var go = main.querySelector('[data-cl="go"]'); if (go) go.onclick = function () { sync(); render(); };
    var add = main.querySelector('[data-cl="add"]'); if (add) add.onclick = function () { sync(); S.calc.lines.push({ item: S.calc.lines[S.calc.lines.length - 1].item, cartons: '', variant: '', heat: 1 }); render(); };
    main.querySelectorAll('[data-cl="del"]').forEach(function (b) { b.onclick = function () { sync(); S.calc.lines.splice(+b.dataset.i, 1); render(); }; });
  };
})();
