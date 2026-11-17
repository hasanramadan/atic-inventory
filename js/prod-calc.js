/* Production calculator (Raw Materials page, tab "Production calculator").
   Same figures as the Supply Planner: cartons per batch and cartons per day per item and section come from the
   Line Planner model learned from the actuals (normal stops included). Each product runs on the section chosen for
   it; the two sections run side by side, each in the order the products are listed. Line changes use the typical
   times from history. Raw materials: the job is added to the factory plan and the stock forecast checks it.
   Blossom and rose water: batches are prepared outside filling time, so only the FIRST batch of each product is
   waited for (rest, filter, heat); after that the batches are ready as the line needs them. */
(function () {
  var SUB = { irani: { to: 'uae', f: 1 }, citric: { to: 'citricmono', f: 210.14 / 192.12 } };
  var KG = { irani: 25, uae: 25, iraqi: 25, sugar: 50, orange: 10, rose: 10 };
  /* first batch of a product, before filling can start: rest, then filter, then heat (minutes) */
  var PREP = { BW: { rest: 360, filter: 25, heat: 60, txt: 'rest 6 h, filter 20–30 min, heat 1 h' }, RW: { rest: 60, filter: 20, heat: 60, txt: 'rest 1 h, filter 20 min, heat 1 h' } };
  var SECN = { S1: 'Section 1', S2: 'Section 2' }, W = 600;
  var LAST = '', SP = null, M = null, ITEMS = null, ERR = '', PCFG = null, OPENED = false;

  function n1(x, d) { var p = Math.pow(10, d || 0); return fmtN(Math.round(x * p) / p); }
  function kgPer(mat) { if (KG[mat.id]) return KG[mat.id]; if (mat.recipeUnit === 'kg' && mat.recipeFactor > 0) return mat.recipeFactor; return mat.unit === 'kg' ? 1 : null; }
  function nextWork(d) { d = U.addDays(d, 1); while (new Date(d + 'T00:00:00Z').getUTCDay() === 5) d = U.addDays(d, 1); return d; }
  function hm(min) { var h = Math.floor(min / 60), m = Math.round(min % 60); return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min'; }
  function blank() { return { item: 'GM750', cartons: '', variant: '', sec: 'auto' }; }

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
  /* the section an item usually runs on: the one with more learned days */
  function usual(id) { var sp = M.speed[id] || {}, a = (sp.S1 || {}).n || 0, b = (sp.S2 || {}).n || 0; return M.cap[id] && M.cap[id].S1 && (a > b || !M.cap[id].S2) ? 'S1' : 'S2'; }
  function changeMin(a, b) {
    var t = a.product === b.product ? 'size' : a.size === b.size ? 'product' : 'both', c = ((PCFG && PCFG.changeover) || {})[t] || {};
    return { type: t, min: Math.round((c.changeoverMin || 0) + (c.cipMin || 0) + (c.extraStopMin || 0) + (c.afterChangeLossMin || 0)) || (t === 'size' ? 36 : t === 'product' ? 104 : 228) };
  }

  window.vCalc = function (fc) {
    load();
    if (!OPENED && S.saved) { OPENED = true; var oid = (/[?&]open=([^&#]+)/.exec(location.search) || [])[1], sv = oid && ((S.saved.supply || {}).saved || []).filter(function (x) { return x.id === decodeURIComponent(oid) && x.kind === 'cartons'; })[0]; if (sv) S.calc = JSON.parse(JSON.stringify(sv.input)); }
    var st = S.calc = S.calc || { lines: [blank()], start: nextWork(TODAY), saturdays: !!((S.saved.supply || {}).saturdays), name: '' };
    st.lines.forEach(function (L) { if (!L.sec) L.sec = 'auto'; });
    var h = '<div class="panel"><h2 style="margin:0 0 4px">Production calculator</h2><p class="small muted" style="margin:0 0 12px">Type the cartons to make and the section for each product. Each section works through its products in the order listed; the two sections run at the same time. Figures come from the Line Planner model learned from the actuals, the same one the Supply Planner uses.</p>';
    if (ERR) return h + '<p class="muted">' + esc(ERR) + '</p></div>';
    if (!M) return h + '<p class="muted">Loading the Line Planner model…</p></div>';
    var m = fc.model;
    h += '<div class="tablewrap"><table><thead><tr><th>#</th><th>Product & size</th><th>Section</th><th>Recipe</th><th class="n">Cartons</th><th></th></tr></thead><tbody>';
    st.lines.forEach(function (L, i) {
      var it = SP.itemById(ITEMS, L.item) || ITEMS[0], vs = (m.variants && m.variants[it.product]) || {};
      h += '<tr><td>' + (i + 1) + '</td><td><select data-cl="item" data-i="' + i + '">' + ITEMS.map(function (x) { return '<option value="' + x.id + '"' + (x.id === it.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></td>' +
        '<td><select data-cl="sec" data-i="' + i + '">' + [['auto', 'Usual (' + SECN[usual(it.id)] + ')'], ['S1', 'Section 1'], ['S2', 'Section 2'], ['both', 'Both sections']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === L.sec ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></td>' +
        '<td>' + (Object.keys(vs).length ? '<select data-cl="variant" data-i="' + i + '"><option value="">' + esc((S.saved.recipes && S.saved.recipes.names && S.saved.recipes.names[it.product]) || 'Standard') + '</option>' + Object.keys(vs).map(function (k) { return '<option value="' + esc(k) + '"' + (k === L.variant ? ' selected' : '') + '>' + esc(vs[k].name || k) + '</option>'; }).join('') + '</select>' : '<span class="small muted">Standard</span>') + '</td>' +
        '<td class="n"><input type="number" min="0" step="1" inputmode="numeric" data-cl="cartons" data-i="' + i + '" value="' + esc(L.cartons) + '" placeholder="e.g. 5000" style="width:120px;text-align:right"></td>' +
        '<td><button class="btn ghost" data-cl="del" data-i="' + i + '" title="Remove">✕ Remove</button></td></tr>';
    });
    h += '</tbody></table></div><div class="row" style="gap:14px;flex-wrap:wrap;align-items:flex-end;margin-top:10px">' +
      '<label class="small">Start<br><input type="date" data-cs="start" value="' + esc(st.start) + '"></label>' +
      '<label class="small">Saturdays<br><select data-cs="sat"><option value="0"' + (st.saturdays ? '' : ' selected') + '>Off</option><option value="1"' + (st.saturdays ? ' selected' : '') + '>Working</option></select></label>' +
      '<button class="btn" data-cl="add">+ Add product</button><button class="btn primary" data-cl="go">Calculate</button><button class="btn ghost" data-cl="clear">Clear all</button>' +
      '<span style="flex:1"></span><label class="small">Name<br><input type="text" data-cs="name" value="' + esc(st.name || '') + '" placeholder="e.g. Rose water order Dec" style="width:200px"></label><button class="btn" data-cl="save"' + (S.canWrite ? '' : ' disabled title="View only"') + '>Save to saved forecasts</button></div></div>';

    var lines = st.lines.filter(function (L) { return Number(L.cartons) > 0 && SP.itemById(ITEMS, L.item); });
    if (!lines.length) { LAST = ''; return h; }

    /* ---- jobs per section, in the order listed ---- */
    var Q = { S1: [], S2: [] }, errs = [];
    lines.forEach(function (L) {
      var it = SP.itemById(ITEMS, L.item), secs = L.sec === 'both' ? ['S1', 'S2'] : [L.sec === 'auto' ? usual(it.id) : L.sec];
      var caps = secs.map(function (s) { return M.cap[it.id] && M.cap[it.id][s] ? M.cap[it.id][s].p50 : 0; }), tot = caps.reduce(function (a, b) { return a + b; }, 0);
      if (!M.bpb[it.id]) { errs.push(it.name + ': no cartons-per-batch figure in the Line Planner.'); return; }
      if (!(tot > 0)) { errs.push(it.name + ': no learned speed on ' + secs.map(function (s) { return SECN[s]; }).join(' + ') + '.'); return; }
      secs.forEach(function (s, k) { if (caps[k] > 0) Q[s].push({ item: it, L: L, cartons: Number(L.cartons) * caps[k] / tot, cap: M.cap[it.id][s], bpb: M.bpb[it.id] }); });
    });
    if (errs.length) return h + '<div class="panel"><p style="color:var(--red)">' + errs.map(esc).join('<br>') + '</p></div>';

    /* ---- timeline per section, in working minutes from the start ---- */
    var ev = { S1: [], S2: [] }, end = { S1: 0, S2: 0 }, notes = [];
    ['S1', 'S2'].forEach(function (s) {
      var F = 0, prevStart = 0;
      Q[s].forEach(function (j, k) {
        var co = null;
        if (k > 0 && Q[s][k - 1].item.id !== j.item.id) { co = changeMin(Q[s][k - 1].item, j.item); ev[s].push({ kind: 'change', j: j, from: F, to: F + co.min, co: co }); F += co.min; }
        var pr = PREP[j.item.product], lead = 0, wait = 0;
        if (pr && (k === 0 || Q[s][k - 1].item.product !== j.item.product)) { /* first batch of this product: the line waits for it unless it was prepared while the previous item ran */
          lead = pr.rest + pr.filter + pr.heat; var ready = (k === 0 ? 0 : prevStart) + lead; wait = Math.max(0, ready - F);
          if (wait > 0) { ev[s].push({ kind: 'prep', j: j, from: F, to: F + wait }); F += wait; }
        }
        var dur = W * j.cartons / j.cap.p50; j.start = F; j.end = F + dur; j.lead = lead; j.wait = wait; j.co = co; j.days = dur / W; j.batches = j.cartons / j.bpb;
        ev[s].push({ kind: 'fill', j: j, from: F, to: F + dur }); prevStart = F; F += dur;
      });
      end[s] = F;
    });
    var totalMin = Math.max(end.S1, end.S2), nDays = Math.max(1, Math.ceil(totalMin / W - 1e-9));
    function work(x) { var w = new Date(x + 'T00:00:00Z').getUTCDay(); return w !== 5 && (w !== 6 || st.saturdays); }
    var dates = [], dd = st.start; while (!work(dd)) dd = U.addDays(dd, 1);
    for (var k = 0; k < nDays; k++) { dates.push(dd); dd = U.addDays(dd, 1); while (!work(dd)) dd = U.addDays(dd, 1); }
    function dayOf(min) { return dates[Math.min(dates.length - 1, Math.floor(Math.max(0, min - 1e-6) / W))]; }
    /* per day and section */
    var cal = dates.map(function (d) { return { date: d, S1: [], S2: [], cartons: 0 }; }), sched = dates.map(function (d) { return { date: d, items: [] }; });
    ['S1', 'S2'].forEach(function (s) {
      ev[s].forEach(function (e) {
        for (var k = 0; k < nDays; k++) {
          var lo = k * W, hi = lo + W, ov = Math.min(hi, e.to) - Math.max(lo, e.from); if (ov <= 0 && !(e.from === e.to && e.from >= lo && e.from < hi)) continue;
          if (e.kind === 'fill') {
            var c = e.j.cartons * ov / (e.to - e.from), b = c / e.j.bpb;
            cal[k][s].push({ t: 'fill', name: e.j.item.name, cartons: c, batches: b }); cal[k].cartons += c;
            var per = {}; per[s] = c; sched[k].items.push({ item: e.j.item.id, product: e.j.item.product, size: e.j.item.size, cartons: c, batches: b, perSec: per, bpb: e.j.bpb });
          } else if (e.kind === 'change') cal[k][s].push({ t: 'change', name: e.j.item.name, min: Math.round(ov), co: e.co });
          else cal[k][s].push({ t: 'prep', name: e.j.item.name, min: Math.round(ov) });
        }
      });
    });
    var used = ['S1', 'S2'].filter(function (s) { return Q[s].length; });
    var jobs = Q.S1.concat(Q.S2), totC = jobs.reduce(function (a, j) { return a + j.cartons; }, 0), totB = jobs.reduce(function (a, j) { return a + j.batches; }, 0);
    var lastDay = { S1: end.S1 ? dayOf(end.S1) : null, S2: end.S2 ? dayOf(end.S2) : null };
    LAST = lines.map(function (L) { return fmtN(Number(L.cartons)) + ' ' + SP.itemById(ITEMS, L.item).name; }).join(' + ') + ' · ' + n1(totB, 1) + ' batches · ' + used.map(function (s) { return SECN[s] + ' ' + n1(end[s] / W, 1) + ' days'; }).join(', ') + ' (' + U.nice(dates[0]) + ' → ' + U.nice(dates[dates.length - 1]) + ')';

    /* ---- batches and days ---- */
    h += '<div class="panel"><h3 style="font-size:16px;margin:0 0 8px">Batches and days</h3><div class="tablewrap"><table><thead><tr><th>Section</th><th>Product</th><th class="n">Cartons</th><th class="n">Cartons per batch</th><th class="n">Batches</th><th class="n">Cartons per day</th><th class="n">Filling days</th><th>Before filling</th></tr></thead><tbody>' +
      used.map(function (s) {
        return Q[s].map(function (j, k) {
          var pre = [];
          if (j.co) pre.push('Line change ' + (j.co.type === 'size' ? '(size)' : j.co.type === 'product' ? '(product)' : '(product and size)') + ' ~' + hm(j.co.min));
          if (j.lead) pre.push('First batch: ' + PREP[j.item.product].txt + ' = ' + hm(j.lead) + (j.wait > 0.5 ? (j.wait < j.lead - 0.5 ? ', line waits ' + hm(j.wait) + ' (rest done during the previous item)' : ', line waits for it') : ', ready while the previous item runs'));
          return '<tr><td>' + (k === 0 ? '<b>' + SECN[s] + '</b>' : '') + '</td><td><b>' + esc(j.item.name) + '</b>' + (j.L.sec === 'both' ? ' <span class="small muted">(share of ' + fmtN(Number(j.L.cartons)) + ')</span>' : '') + '</td><td class="n">' + fmtN(Math.round(j.cartons)) + '</td><td class="n">' + n1(j.bpb, 1) + '</td><td class="n"><b>' + n1(j.batches, 1) + '</b></td><td class="n">' + fmtN(Math.round(j.cap.p50)) + ' <span class="small muted">(' + fmtN(Math.round(j.cap.p10)) + '–' + fmtN(Math.round(j.cap.p90)) + ')</span></td><td class="n"><b>' + n1(j.days, 1) + '</b></td><td class="small">' + (pre.length ? esc(pre.join(' · ')) : '<span class="muted">–</span>') + '</td></tr>';
        }).join('');
      }).join('') + '</tbody></table></div>' +
      '<p style="margin:10px 0 0"><b>' + fmtN(Math.round(totC)) + ' cartons, ' + n1(totB, 1) + ' batches.</b> ' + used.map(function (s) { return '<b>' + SECN[s] + '</b>: about ' + n1(end[s] / W, 1) + ' working days, ' + esc(U.nice(dates[0])) + ' to ' + esc(U.nice(lastDay[s])); }).join('; ') + '. ' + (used.length > 1 ? 'All done by <b>' + esc(U.nice(dates[dates.length - 1])) + '</b>. ' : '') +
      '<span class="small muted">This is the time with no delays: batches are prepared outside filling time, so only the first batch of blossom or rose water is waited for. If a batch is not ready in time, or a breakdown runs long, add that time. Cartons per day include the normal stops (range in brackets: slow to fast day). Friday off; Saturdays ' + (st.saturdays ? 'working' : 'off') + '.</span></p></div>';

    /* ---- calendar ---- */
    function cell(list) {
      if (!list.length) return '<span class="muted">–</span>';
      return list.map(function (x) {
        if (x.t === 'fill') return '<b>' + esc(x.name) + '</b>: ' + fmtN(Math.round(x.cartons)) + ' cartons <span class="small muted">(' + n1(x.batches, 1) + ' batches)</span>';
        if (x.t === 'change') return '<span class="small">↺ Line change to ' + esc(x.name) + ' ~' + hm(x.min) + '</span>';
        return '<span class="small">⏳ Waiting for first batch of ' + esc(x.name) + ' ~' + hm(x.min) + '</span>';
      }).join('<br>');
    }
    var cum = 0;
    h += '<div class="panel"><h3 style="font-size:16px;margin:0 0 8px">Calendar (approximate)</h3><div class="tablewrap"><table><thead><tr><th>Day</th><th>Date</th>' + used.map(function (s) { return '<th>' + SECN[s] + '</th>'; }).join('') + '<th class="n">Cartons so far</th></tr></thead><tbody>' +
      cal.map(function (c, i) { cum += c.cartons; return '<tr><td>' + (i + 1) + '</td><td style="white-space:nowrap">' + esc(new Date(c.date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })) + ' ' + esc(U.nice(c.date)) + '</td>' + used.map(function (s) { return '<td>' + cell(c[s]) + '</td>'; }).join('') + '<td class="n"><b>' + fmtN(Math.round(cum)) + '</b></td></tr>'; }).join('') +
      '</tbody></table></div></div>';

    /* ---- stoppages from history on the sections used ---- */
    var CAT = [['Capping', /cap/i], ['Labels & stickers', /label|sticker/i], ['Filling (nozzle, sensor, pump)', /nozzle|filling|sensor|pump|leak/i], ['Washer, conveyor & bottles', /washer|conveyor|bottle stuck|gearbox|bearing|motor/i], ['Waiting (material, cartons, batch)', /wait/i]];
    h += '<div class="panel"><h3 style="font-size:16px;margin:0 0 4px">Stoppages to expect</h3><p class="small muted" style="margin:0 0 8px">From the recorded shifts. Normal stops are already inside the cartons per day; this shows where the time usually goes.</p><div class="tablewrap"><table><thead><tr><th>Section</th><th class="n">Stops per shift</th><th class="n">Over this job</th><th class="n">Start-up</th><th class="n">Cleaning</th><th class="n">Changeovers</th><th class="n">Breakdowns & waiting</th><th>Most common breakdowns</th></tr></thead><tbody>' +
      used.map(function (s) {
        var hs = { days: 0, stop: 0, start: 0, clean: 0, change: 0, cat: {} };
        (LP.list || []).forEach(function (a) {
          if (!a || a.sec !== s || !(Number(a.workMin) > 0)) return;
          hs.days++; hs.stop += Number(a.stopMin) || 0; hs.start += Number(a.startMin) || 0; hs.clean += (Number(a.cleanRoutineMin) || 0) + (Number(a.cleanDeepMin) || 0); hs.change += (a.changeover && Number(a.changeover.min)) || 0;
          String(a.reasons || '').split(';').forEach(function (cl) { var mm = /(\d+(?:\.\d+)?)\s*min/i.exec(cl); if (!mm || /clean|startup|start-up|arrangement|changeover|circulation/i.test(cl)) return; for (var q = 0; q < CAT.length; q++) if (CAT[q][1].test(cl)) { hs.cat[CAT[q][0]] = (hs.cat[CAT[q][0]] || 0) + Number(mm[1]); break; } });
        });
        if (!hs.days) return '<tr><td>' + SECN[s] + '</td><td colspan="7" class="muted">No recorded shifts yet.</td></tr>';
        var pd = hs.stop / hs.days, other = Math.max(0, hs.stop - hs.start - hs.clean - hs.change), cats = Object.keys(hs.cat).sort(function (a, b) { return hs.cat[b] - hs.cat[a]; }).slice(0, 3);
        return '<tr><td><b>' + SECN[s] + '</b> <span class="small muted">(' + hs.days + ' shifts)</span></td><td class="n">' + Math.round(pd) + ' min <span class="small muted">(' + Math.round(pd / 6) + '%)</span></td><td class="n">~' + n1(pd * end[s] / W / 60, 1) + ' h</td><td class="n">' + Math.round(hs.start / hs.days) + ' min</td><td class="n">' + Math.round(hs.clean / hs.days) + ' min</td><td class="n">' + Math.round(hs.change / hs.days) + ' min</td><td class="n">' + Math.round(other / hs.days) + ' min</td><td class="small">' + cats.map(function (k) { return esc(k) + ' ~' + Math.round(hs.cat[k] / hs.days) + ' min'; }).join(', ') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';

    /* ---- raw materials: the job added to the factory plan, run through the stock forecast ---- */
    var vars = {}; lines.forEach(function (L) { var it = SP.itemById(ITEMS, L.item); if (it && L.variant) vars[it.product] = L.variant; });
    var mi = SP.materialsImpact(window.ATICEngine, BASE, savedForEngine(), sched.filter(function (d) { return d.items.length; }), TODAY, { variants: vars });
    if (!mi) return h;
    var mats = {}; m.materials.forEach(function (x) { mats[x.id] = x; });
    var byId = {}; mi.rows.forEach(function (r) { byId[r.id] = r; });
    var now = {}, rr = {}; fc.results.forEach(function (r) { now[r.id] = Math.max(0, Number(r.stockNow) || 0); rr[r.id] = r; });
    var need = {}; mi.rows.forEach(function (r) { need[r.id] = r.need; });
    var subIn = {};
    Object.keys(SUB).forEach(function (a) { if (!(need[a] > 0) || !mats[SUB[a].to]) return; var short = need[a] - (now[a] || 0); if (short > 1e-9) { need[a] = now[a] || 0; need[SUB[a].to] = (need[SUB[a].to] || 0) + short * SUB[a].f; subIn[SUB[a].to] = { from: a, qty: short * SUB[a].f }; } });
    var ids = Object.keys(need).filter(function (id) { return need[id] > 1e-9; }).sort(function (a, b) { return need[b] * (kgPer(mats[b] || {}) || 1) - need[a] * (kgPer(mats[a] || {}) || 1); });
    var shortToday = 0, shortPlan = 0, fin = dates[dates.length - 1];
    h += '<div class="panel"><h3 style="font-size:16px;margin:0 0 8px">Raw materials</h3><div class="tablewrap"><table><thead><tr><th>Material</th><th class="n">Needed</th><th class="n">kg</th><th class="n">Stock today</th><th>From today\'s stock</th><th>With the factory plan</th></tr></thead><tbody>' +
      ids.map(function (id) {
        var mt = mats[id] || { name: id, unit: '' }, q = need[id], have = now[id] || 0, left = have - q, kg = kgPer(mt), r = byId[id] || rr[id] || {};
        var okToday = left >= -1e-9; if (!okToday) shortToday++;
        var bad = r.firstShortWeek || (r.runOut && r.runOut <= fin); if (bad) shortPlan++;
        var withPlan = r.firstShortWeek ? '<span class="chip order" style="padding:1px 8px">Short from week of ' + esc(U.nice(r.firstShortWeek)) + '</span>' : (r.runOut && r.runOut <= fin ? '<span class="chip order" style="padding:1px 8px">Runs out ' + esc(U.nice(r.runOut)) + '</span>' : '<span class="chip ok" style="padding:1px 8px">Covered</span>');
        var coming = ((rr[id] || {}).openOrders || []).filter(function (o) { return o.eta >= TODAY; }).map(function (o) { return '+' + fmtN(Math.round(o.qty)) + ' on ' + U.nice(o.eta); }).join(', ');
        var sn = subIn[id] ? '<br><span class="small muted">Includes ' + n1(subIn[id].qty, 1) + ' ' + esc(mt.unit) + ' in place of ' + esc((mats[subIn[id].from] || {}).name || subIn[id].from) + ' (' + ((now[subIn[id].from] || 0) > 0 ? 'only ' + n1(now[subIn[id].from], 1) + ' left' : 'none in stock') + ')</span>' : '';
        return '<tr><td><b>' + esc(mt.name) + '</b>' + sn + '</td><td class="n">' + n1(q, q < 10 ? 2 : 1) + ' ' + esc(mt.unit) + '</td><td class="n">' + (kg ? fmtN(Math.round(q * kg)) : '') + '</td><td class="n">' + n1(have, have < 10 ? 2 : 1) + '</td><td>' + (okToday ? '<span class="chip ok" style="padding:1px 8px">Enough</span>' : '<span class="chip order" style="padding:1px 8px">Short ' + n1(-left, -left < 10 ? 2 : 1) + ' ' + esc(mt.unit) + '</span>') + '</td><td>' + withPlan + (coming ? '<br><span class="small muted">Coming: ' + esc(coming) + '</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p style="margin:10px 0 0">' + (shortToday ? '<b style="color:var(--red)">' + shortToday + ' material' + (shortToday === 1 ? ' is' : 's are') + ' short</b> from today\'s stock. ' : '<b style="color:var(--green)">Today\'s stock covers this job.</b> ') + (shortPlan ? '<b style="color:var(--red)">' + shortPlan + ' material' + (shortPlan === 1 ? ' runs' : 's run') + ' short</b> once the current factory plan is counted too.' : 'It stays covered with the current factory plan.') +
      ' <span class="small muted">Stock today = last physical count (' + esc(U.nice((S.saved.inventory || {}).asOf || '')) + ') − what the batches used since + deliveries received. "With the factory plan" adds this job to the plan on its sections and runs the stock forecast week by week, counting deliveries due.</span></p></div>';
    return h;
  };

  function saveCalc() {
    if (!S.canWrite) { toast('View only: ask your admin for edit access.'); return; }
    if (!LAST) { toast('Type the cartons and calculate first.'); return; }
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
        else if (el.dataset.cl === 'sec') L.sec = el.value;
        else if (el.dataset.cl === 'cartons') L.cartons = el.value;
      });
      var d = main.querySelector('[data-cs="start"]'); if (d && d.value) S.calc.start = d.value;
      var t = main.querySelector('[data-cs="sat"]'); if (t) S.calc.saturdays = t.value === '1';
      var nm = main.querySelector('[data-cs="name"]'); if (nm) S.calc.name = nm.value;
    }
    main.querySelectorAll('select[data-cl],select[data-cs],input[data-cs="start"]').forEach(function (el) { el.onchange = function () { sync(); render(); }; });
    main.querySelectorAll('input[data-cl]').forEach(function (el) { el.onkeydown = function (e) { if (e.key === 'Enter') { sync(); render(); } }; el.onchange = function () { sync(); render(); }; });
    var nm = main.querySelector('[data-cs="name"]'); if (nm) nm.oninput = function () { S.calc.name = nm.value; };
    var go = main.querySelector('[data-cl="go"]'); if (go) go.onclick = function () { sync(); render(); };
    var add = main.querySelector('[data-cl="add"]'); if (add) add.onclick = function () { sync(); var l = S.calc.lines[S.calc.lines.length - 1] || blank(); S.calc.lines.push({ item: l.item, cartons: '', variant: '', sec: l.sec || 'auto' }); render(); };
    main.querySelectorAll('[data-cl="del"]').forEach(function (b) { b.onclick = function () { sync(); S.calc.lines.splice(+b.dataset.i, 1); if (!S.calc.lines.length) S.calc.lines.push(blank()); render(); }; });
    var clr = main.querySelector('[data-cl="clear"]'); if (clr) clr.onclick = function () { S.calc.lines = [blank()]; S.calc.name = ''; render(); };
    var sv = main.querySelector('[data-cl="save"]'); if (sv) sv.onclick = function () { sync(); saveCalc(); };
  };
})();
