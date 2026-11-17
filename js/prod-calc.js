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
  var LAST = '', SP = null, M = null, ITEMS = null, ERR = '', PCFG = null, OPENED = false;
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
      PCFG = c.params; M = SP.lineModel(window.ATIC_LINE_ENGINE, c.params, acts, TODAY);
      ITEMS = SP.items(S.saved.supply);
      if (S.view === 'calc') render();
    }).catch(function (e) { ERR = 'Could not read the Line Planner model: ' + (e.message || e); render(); });
  }

  window.vCalc = function (fc) {
    load();
    if (!OPENED) { OPENED = true; var oid = (/[?&]open=([^&#]+)/.exec(location.search) || [])[1], sv = oid && ((S.saved.supply || {}).saved || []).filter(function (x) { return x.id === decodeURIComponent(oid) && x.kind === 'cartons'; })[0]; if (sv) S.calc = JSON.parse(JSON.stringify(sv.input)); }
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
        '<td><button class="btn ghost" data-cl="del" data-i="' + i + '" aria-label="Remove this product" title="Remove">✕ Remove</button></td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div class="row" style="gap:14px;flex-wrap:wrap;align-items:flex-end;margin-top:10px">' +
      '<label class="small">Sections<br><select data-cs="sec">' + [['S1,S2', 'Both sections'], ['S1', 'Section 1'], ['S2', 'Section 2']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === st.sections.join(',') ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="small">Start<br><input type="date" data-cs="start" value="' + esc(st.start) + '"></label>' +
      '<label class="small">Saturdays<br><select data-cs="sat"><option value="0"' + (st.saturdays ? '' : ' selected') + '>Off</option><option value="1"' + (st.saturdays ? ' selected' : '') + '>Working</option></select></label>' +
      '<button class="btn" data-cl="add">+ Add product</button><button class="btn primary" data-cl="go">Calculate</button><button class="btn ghost" data-cl="clear">Clear all</button>' +
      '<span style="flex:1"></span><label class="small">Name<br><input type="text" data-cs="name" value="' + esc(st.name || '') + '" placeholder="e.g. Rose water order Dec" style="width:200px"></label><button class="btn" data-cl="save"' + (S.canWrite ? '' : ' disabled title="View only"') + '>Save to saved forecasts</button></div></div>';

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

    /* ---- day by day: line changes between items, preparation (filter + heat) on its own heaters, which may start while
       the line is still filling the previous item; a batch is filled once it is ready and the line is free ---- */
    var W = 600, CO = (PCFG && PCFG.changeover) || {}, ev = [], F = 0, lanes = [], changes = [];
    function coMin(a, b) {
      var t = a.product === b.product ? 'size' : a.size === b.size ? 'product' : 'both', c = CO[t] || {};
      return { type: t, min: Math.round((c.changeoverMin || 0) + (c.cipMin || 0) + (c.extraStopMin || 0) + (c.afterChangeLossMin || 0)) || (t === 'size' ? 36 : t === 'product' ? 104 : 228) };
    }
    calc.rows.forEach(function (r, k) {
      if (k > 0) { var c = coMin(calc.rows[k - 1].item, r.item); changes.push({ at: F, from: calc.rows[k - 1].item, to: r.item, type: c.type, min: c.min }); ev.push({ kind: 'change', item: r.item, from: F, to: F + c.min, text: c.type }); F += c.min; }
      var pn = prepNote[r.item.id], nb = Math.ceil(r.batches - 1e-9), fillPer = W * r.bpb / r.cap.p50, last = r.batches - (nb - 1);
      if (!pn) { ev.push({ kind: 'fill', item: r.item, from: F, to: F + r.days * W, batches: r.batches, cartons: r.cartons }); F += r.days * W; return; }
      while (lanes.length < pn.heat) lanes.push(0);
      for (var i = 0; i < nb; i++) {
        var li = 0; lanes.forEach(function (t, x) { if (t < lanes[li]) li = x; });
        var start = lanes[li], ready = start + pn.per, bb = i === nb - 1 ? last : 1; lanes[li] = ready;
        ev.push({ kind: 'prep', item: r.item, from: start, to: ready, batches: bb });
        var fs = Math.max(ready, F), fe = fs + fillPer * bb; ev.push({ kind: 'fill', item: r.item, from: fs, to: fe, batches: bb, cartons: bb * r.bpb }); F = fe;
      }
    });
    var nDays = Math.max(1, Math.ceil(F / W - 1e-9)), cal = [], dd = st.start;
    function work(x) { var w = new Date(x + 'T00:00:00Z').getUTCDay(); return w !== 5 && (w !== 6 || st.saturdays); }
    while (!work(dd)) dd = U.addDays(dd, 1);
    for (var kd = 0; kd < nDays; kd++) {
      var lo = kd * W, hi = lo + W, row = { date: dd, prep: {}, fill: {}, cartons: {}, change: [] };
      ev.forEach(function (e) {
        var ov = Math.min(hi, e.to) - Math.max(lo, e.from), nm = e.item.name;
        if (e.kind === 'prep') { if (e.to > lo && e.to <= hi) row.prep[nm] = (row.prep[nm] || 0) + e.batches; return; }
        if (e.kind === 'change') { if (e.from >= lo && e.from < hi) row.change.push(e); return; }
        if (ov <= 0) return; var f = ov / (e.to - e.from || 1);
        row.fill[nm] = (row.fill[nm] || 0) + e.batches * f; row.cartons[nm] = (row.cartons[nm] || 0) + e.cartons * f;
      });
      cal.push(row); dd = U.addDays(dd, 1); while (!work(dd)) dd = U.addDays(dd, 1);
    }
    var finish = cal[cal.length - 1].date;

    /* ---- stoppages from history on the sections used ---- */
    var CAT = [['Capping', /cap/i], ['Labels & stickers', /label|sticker/i], ['Filling (nozzle, sensor, pump)', /nozzle|filling|sensor|pump|leak/i], ['Washer, conveyor & bottles', /washer|conveyor|bottle stuck|gearbox|bearing|motor/i], ['Waiting (material, cartons, batch)', /wait/i]];
    var secsUsed = st.sections.map(function (x) { return x; }), hs = { days: 0, stop: 0, start: 0, clean: 0, change: 0, cat: {} };
    (LP.list || []).forEach(function (a) {
      if (!a || !a.sec || secsUsed.indexOf(a.sec) < 0 || !(Number(a.workMin) > 0)) return;
      hs.days++; hs.stop += Number(a.stopMin) || 0; hs.start += Number(a.startMin) || 0; hs.clean += (Number(a.cleanRoutineMin) || 0) + (Number(a.cleanDeepMin) || 0); hs.change += (a.changeover && Number(a.changeover.min)) || 0;
      String(a.reasons || '').split(';').forEach(function (cl) { var mm = /(\d+(?:\.\d+)?)\s*min/i.exec(cl); if (!mm) return; for (var q = 0; q < CAT.length; q++) if (CAT[q][1].test(cl) && !/clean|startup|start-up|arrangement|changeover|circulation/i.test(cl)) { hs.cat[CAT[q][0]] = (hs.cat[CAT[q][0]] || 0) + Number(mm[1]); break; } });
    });

    var secTxt = st.sections.length === 2 ? 'both sections' : SECN[st.sections[0]];
    LAST = calc.rows.map(function (r) { return fmtN(Math.round(r.cartons)) + ' ' + r.item.name; }).join(' + ') + ' · ' + n1(calc.batches, 1) + ' batches · about ' + n1(F / W, 1) + ' working days on ' + secTxt + ' (' + U.nice(cal[0].date) + ' → ' + U.nice(finish) + ')';
    h += '<div class="panel"><h3 style="font-size:16px;margin:0 0 8px">Batches and days</h3><div class="tablewrap"><table><thead><tr><th>Product</th><th class="n">Cartons</th><th class="n">Cartons per batch</th><th class="n">Batches</th><th class="n">Cartons per day</th><th class="n">Working days</th></tr></thead><tbody>' +
      calc.rows.map(function (r) {
        var pn = prepNote[r.item.id];
        return '<tr><td><b>' + esc(r.item.name) + '</b></td><td class="n">' + fmtN(Math.round(r.cartons)) + '</td><td class="n">' + n1(r.bpb, 1) + '</td><td class="n"><b>' + n1(r.batches, 1) + '</b></td><td class="n">' + fmtN(Math.round(r.cap.p50)) + ' <span class="small muted">(' + fmtN(Math.round(r.cap.p10)) + '–' + fmtN(Math.round(r.cap.p90)) + ')</span></td><td class="n"><b>' + n1(pn && pn.limit ? pn.prepDays : r.days, 1) + '</b>' + (pn && pn.limit ? '' : ' <span class="small muted">(' + n1(r.daysLo, 1) + '–' + n1(r.daysHi, 1) + ')</span>') + '</td></tr>' +
          (pn ? '<tr><td colspan="6" class="small" style="background:var(--bg)">Each batch is filtered (' + pn.pr.filterTxt + ') and heated (' + pn.pr.heatTxt + ') before filling: about ' + n1(pn.per / 60, 1) + ' h per batch, ' + pn.heat + ' at a time. Preparing ' + Math.ceil(r.batches) + ' batches takes about ' + n1(pn.prepDays, 1) + ' working days against ' + n1(r.days, 1) + ' days of filling. ' + (pn.limit ? '<b>Preparation sets the pace.</b>' : 'Filling sets the pace; the first batch must be ready ' + n1(pn.per / 60, 1) + ' h before filling starts.') + '</td></tr>' : '');
      }).join('') + '</tbody></table></div>' +
      '<p style="margin:10px 0 0"><b>' + fmtN(Math.round(calc.cartons)) + ' cartons, ' + n1(calc.batches, 1) + ' batches, about ' + n1(F / W, 1) + ' working days on ' + secTxt + '</b>: ' + esc(U.nice(cal[0].date)) + ' to ' + esc(U.nice(finish)) + '.' + (changes.length ? ' Includes ' + changes.length + ' line change' + (changes.length === 1 ? '' : 's') + ' (' + changes.map(function (c) { return esc(c.from.name) + ' → ' + esc(c.to.name) + ': ' + (c.type === 'size' ? 'size change' : c.type === 'product' ? 'product change' : 'product and size change') + ' about ' + c.min + ' min'; }).join('; ') + ').' : '') + ' <span class="small muted">Cartons per batch and cartons per day come from the Line Planner model learned from the actuals (usual case, range in brackets); line-change times are the typical ones from history. Friday off; Saturdays ' + (st.saturdays ? 'working' : 'off') + '.</span></p></div>';

    (function () {
      function fmtObj(o, dec) { var k = Object.keys(o).filter(function (x) { return o[x] > 0.05; }); return k.length ? k.map(function (x) { return n1(o[x], dec) + (calc.rows.length > 1 ? ' <span class="small muted">' + esc(x) + '</span>' : ''); }).join('<br>') : '<span class="muted">–</span>'; }
      var anyPrep = Object.keys(prepNote).length, cum = 0;
      h += '<div class="panel"><h3 style="font-size:16px;margin:0 0 4px">Day by day (approximate)</h3><p class="small muted" style="margin:0 0 8px">' + (anyPrep ? 'Ready = batches filtered and heated by the end of the day. Heating starts on day 1 and carries on while the line fills, also while it is still on the previous item. ' : '') + 'Each day is a 600-minute shift' + (st.sections.length === 2 ? ' on both sections together' : '') + '.</p><div class="tablewrap"><table><thead><tr><th>Day</th><th>Date</th>' + (anyPrep ? '<th class="n">Batches ready</th>' : '') + '<th class="n">Batches filled</th><th class="n">Cartons</th><th class="n">Cartons so far</th><th>Line</th></tr></thead><tbody>' +
        cal.map(function (c, i) {
          var dayC = Object.keys(c.cartons).reduce(function (a, x) { return a + c.cartons[x]; }, 0); cum += dayC;
          return '<tr><td>' + (i + 1) + '</td><td>' + esc(new Date(c.date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })) + ' ' + esc(U.nice(c.date)) + '</td>' + (anyPrep ? '<td class="n">' + fmtObj(c.prep, 1) + '</td>' : '') + '<td class="n">' + fmtObj(c.fill, 1) + '</td><td class="n">' + fmtObj(c.cartons, 0) + '</td><td class="n"><b>' + fmtN(Math.round(cum)) + '</b></td><td class="small">' + c.change.map(function (e) { return 'Change to ' + esc(e.item.name) + ' (~' + Math.round(e.to - e.from) + ' min)'; }).join('<br>') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
      if (hs.days) {
        var perDay = hs.stop / hs.days, other = Math.max(0, hs.stop - hs.start - hs.clean - hs.change), jobDays = F / W;
        var cats = Object.keys(hs.cat).sort(function (a, b) { return hs.cat[b] - hs.cat[a]; }).slice(0, 4);
        h += '<div class="panel"><h3 style="font-size:16px;margin:0 0 4px">Stoppages to expect</h3><p class="small muted" style="margin:0 0 8px">From ' + hs.days + ' recorded shifts on ' + secTxt + '. These are already inside the cartons per day above; they show where the time usually goes.</p>' +
          '<p style="margin:0 0 8px">About <b>' + Math.round(perDay) + ' min of stops per shift</b> (' + n1(perDay / 6, 0) + '% of the shift), so roughly <b>' + n1(perDay * jobDays / 60, 1) + ' hours</b> over this job.</p>' +
          '<div class="tablewrap"><table><thead><tr><th>Where the stop time goes</th><th class="n">Avg min per shift</th><th class="n">Share</th></tr></thead><tbody>' +
          [['Start-up & water circulation', hs.start], ['Cleaning', hs.clean], ['Changeovers', hs.change], ['Breakdowns & waiting', other]].map(function (x) { return '<tr><td>' + x[0] + '</td><td class="n">' + Math.round(x[1] / hs.days) + '</td><td class="n">' + Math.round(x[1] / (hs.stop || 1) * 100) + '%</td></tr>'; }).join('') + '</tbody></table></div>' +
          (cats.length ? '<p class="small" style="margin:8px 0 0">Most common breakdowns on these sections: ' + cats.map(function (k) { return esc(k) + ' (about ' + Math.round(hs.cat[k] / hs.days) + ' min per shift)'; }).join(', ') + '.</p>' : '') + '</div>';
      }
    })();

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
      '<p style="margin:10px 0 0">' + (shortToday ? '<b style="color:var(--red)">' + shortToday + ' material' + (shortToday === 1 ? ' is' : 's are') + ' short</b> from today\'s stock. ' : '<b style="color:var(--green)">Today\'s stock covers this order.</b> ') + (shortPlan ? '<b style="color:var(--red)">' + shortPlan + ' material' + (shortPlan === 1 ? ' runs' : 's run') + ' short</b> once the current factory plan is counted too.' : 'It stays covered with the current factory plan.') +
      ' <span class="small muted">Stock today = last physical count (' + esc(U.nice((S.saved.inventory || {}).asOf || '')) + ') − what the batches used since + deliveries received. "With the factory plan" adds this order to the plan on its sections and runs the stock forecast week by week, counting deliveries due.</span></p></div>';
    return h;
  };

  function saveCalc() {
    if (!S.canWrite) { toast('View only: ask your admin for edit access.'); return; }
    if (!S.calc.lines.some(function (L) { return Number(L.cartons) > 0; }) || !LAST) { toast('Type the cartons and calculate first.'); return; }
    var name = (S.calc.name || '').trim() || 'Production calculator ' + U.nice(TODAY);
    var sup = JSON.parse(JSON.stringify(S.saved.supply || {}));
    sup.saved = (sup.saved || []).concat([{ id: 'cartons-' + Date.now(), kind: 'cartons', name: name, summary: LAST, input: JSON.parse(JSON.stringify(S.calc)), savedAt: new Date().toISOString(), by: (S.profile && (S.profile.full_name || S.profile.username)) || '' }]);
    Promise.resolve(saveDoc('supply', sup)).then(function () { toast('Saved: ' + name + ' (Supply Planner › Saved forecasts)'); }).catch(function (e) { toast('Not saved: ' + (e.message || e)); });
  }

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
      var nm = main.querySelector('[data-cs="name"]'); if (nm) S.calc.name = nm.value;
    }
    main.querySelectorAll('select[data-cl],select[data-cs],input[data-cs]').forEach(function (el) { el.onchange = function () { sync(); render(); }; });
    main.querySelectorAll('input[data-cl]').forEach(function (el) { el.onkeydown = function (e) { if (e.key === 'Enter') { sync(); render(); } }; el.onchange = function () { sync(); render(); }; });
    var go = main.querySelector('[data-cl="go"]'); if (go) go.onclick = function () { sync(); render(); };
    var add = main.querySelector('[data-cl="add"]'); if (add) add.onclick = function () { sync(); S.calc.lines.push({ item: S.calc.lines[S.calc.lines.length - 1].item, cartons: '', variant: '', heat: 1 }); render(); };
    main.querySelectorAll('[data-cl="del"]').forEach(function (b) { b.onclick = function () { sync(); S.calc.lines.splice(+b.dataset.i, 1); if (!S.calc.lines.length) S.calc.lines.push({ item: 'GM750', cartons: '', variant: '', heat: 1 }); render(); }; });
    var clr = main.querySelector('[data-cl="clear"]'); if (clr) clr.onclick = function () { S.calc.lines = [{ item: 'GM750', cartons: '', variant: '', heat: 1 }]; S.calc.name = ''; render(); };
    var sv = main.querySelector('[data-cl="save"]'); if (sv) sv.onclick = function () { sync(); saveCalc(); };
  };
})();
