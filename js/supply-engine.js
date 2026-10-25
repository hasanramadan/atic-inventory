/* ATIC Supply Planner engine: trucks → pallets → cartons → batches → line days → raw materials.
   No page code here, so it can be tested on its own. Uses the Line Planner engine (learned speeds and boxes per batch)
   and the Raw Materials engine (stock, open orders, recipes, lead times). */
(function (root) {
  'use strict';
  var DAY = 864e5;
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function addDays(s, n) { return iso(Date.parse(s + 'T00:00:00Z') + n * DAY); }
  function dow(s) { return new Date(s + 'T00:00:00Z').getUTCDay(); } // 0 Sun … 5 Fri, 6 Sat
  function weekStart(s) { return addDays(s, -dow(s)); }
  function sum(a, f) { return a.reduce(function (x, y) { return x + (f ? f(y) : y) || 0; }, 0); }
  var SECMAP = { S1: 'SEC-1', S2: 'SEC-2' };

  /* Items the company ships. Pallet rules from Hasan, 25 Oct 2026. null = not given yet. */
  var ITEMS = [
    { id: 'GM750', product: 'GM', size: '750ml', name: 'Grenadine Molasses 750ml', cpp: 70, ppt: 22, pptAlt: 23 },
    { id: 'GM300', product: 'GM', size: '300ml', name: 'Grenadine Molasses 300ml', cpp: 72, ppt: 24, pptAlt: null },
    { id: 'BW750', product: 'BW', size: '750ml', name: 'Blossom Water 750ml', cpp: 70, ppt: 22, pptAlt: 23 },
    { id: 'BW300', product: 'BW', size: '300ml', name: 'Blossom Water 300ml', cpp: 84, ppt: 24, pptAlt: null },
    { id: 'RW750', product: 'RW', size: '750ml', name: 'Rose Water 750ml', cpp: 70, ppt: 22, pptAlt: 23 },
    { id: 'RW300', product: 'RW', size: '300ml', name: 'Rose Water 300ml', cpp: 84, ppt: 24, pptAlt: null },
    { id: 'GM500', product: 'GM', size: '500ml', name: 'Grenadine Molasses 500ml', cpp: null, ppt: null, pptAlt: null },
    { id: 'LS1L', product: 'LS', size: '1L', name: 'Lemon Substitute 1L', cpp: null, ppt: null, pptAlt: null },
    { id: 'WV1L', product: 'WV', size: '1L', name: 'White Vinegar 1L', cpp: null, ppt: null, pptAlt: null }
  ];
  function items(settings) {
    var ov = (settings && settings.items) || {};
    return ITEMS.map(function (x) {
      var o = Object.assign({}, x, ov[x.id] || {});
      o.ready = o.cpp > 0 && o.ppt > 0;
      o.aliases = [o.product + ' ' + o.size, o.id, o.name.replace(/ \d.*$/, '') + ' ' + o.size.replace('ml', '')];
      return o;
    });
  }
  function itemById(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }

  /* ---------- what the Line Planner has learned ---------- */
  function nextWorkday(today) { var d = addDays(today, 1); while (dow(d) === 5 || dow(d) === 6) d = addDays(d, 1); return d; }
  function lineModel(ENGINE, P0, actuals, today) {
    var L = ENGINE.learn(P0, actuals || [], { today: today });
    var P = L.P, out = { learnedFrom: L.n, version: P.version, bpb: {}, cap: {}, speed: {}, bpc: P.bpc, missing: [] };
    var d = nextWorkday(today);
    ITEMS.forEach(function (it) {
      var k = it.product + '|' + it.size;
      out.bpb[it.id] = P.boxesPerBatch[k] ? P.boxesPerBatch[k].boxes : null;
      out.cap[it.id] = {}; out.speed[it.id] = {};
      ['S1', 'S2'].forEach(function (sec) {
        var sp = P.speed[k + '|' + sec]; if (!sp) { out.missing.push(it.id + ' ' + sec); return; }
        out.speed[it.id][sec] = { p50: sp.p50, n: sp.n, level: sp.level };
        try {
          var f = ENGINE.forecast(P, { date: d, sec: sec, prev: { product: it.product, size: it.size }, runs: [{ product: it.product, size: it.size, batches: null, opening: null, start: null, target: null }] });
          out.cap[it.id][sec] = { p10: f.boxes.p10, p50: f.boxes.p50, p90: f.boxes.p90, fillMin: f.fillMin };
        } catch (e) { out.missing.push(it.id + ' ' + sec); }
      });
    });
    return out;
  }

  /* ---------- calendar ---------- */
  function isWorkday(d, saturdays) { var w = dow(d); return w !== 5 && (w !== 6 || !!saturdays); }
  function firstWorkday(d, saturdays) { while (!isWorkday(d, saturdays)) d = addDays(d, 1); return d; }
  function dailyCap(model, itemId, sections) {
    var c = model.cap[itemId] || {}, o = { p10: 0, p50: 0, p90: 0 }, ok = true;
    sections.forEach(function (s) { if (!c[s]) { ok = false; return; } o.p10 += c[s].p10; o.p50 += c[s].p50; o.p90 += c[s].p90; });
    return ok && o.p50 > 0 ? o : null;
  }
  /* Fill cartons day by day from a start date. Returns the days used with cartons and batches per section. */
  function schedule(jobs, opts) {
    var d = firstWorkday(opts.start, opts.saturdays), days = [], guard = 0;
    jobs.forEach(function (j) {
      var left = j.cartons, first = null;
      while (left > 0.5 && guard++ < 2000) {
        var cap = j.cap.p50, used = days.length && days[days.length - 1].date === d ? days[days.length - 1].frac : 0;
        var room = cap * (1 - used); if (room <= 0.5) { d = firstWorkday(addDays(d, 1), opts.saturdays); continue; }
        var take = Math.min(left, room);
        var share = take / cap;
        var day = days.length && days[days.length - 1].date === d ? days[days.length - 1] : (days.push({ date: d, frac: 0, items: [] }), days[days.length - 1]);
        var perSec = {}; j.sections.forEach(function (s) { var cs = (opts.model.cap[j.item.id] || {})[s]; perSec[s] = cs ? take * cs.p50 / cap : 0; });
        day.items.push({ item: j.item.id, product: j.item.product, size: j.item.size, cartons: take, batches: take / j.bpb, perSec: perSec, bpb: j.bpb });
        day.frac += share; left -= take; if (!first) first = d;
        if (day.frac >= 0.999) d = firstWorkday(addDays(d, 1), opts.saturdays);
      }
      j.firstDay = first; j.lastDay = days.length ? days[days.length - 1].date : null;
    });
    return days;
  }

  /* ---------- order forecast by trucks ---------- */
  /* lines: [{kind:'full', item, trucks, ppt}] or [{kind:'mixed', parts:[{item, pallets}]}]
     opts: {samples: true|false|null, sections:['S1','S2'], start, saturdays, model, items} */
  function orderCalc(lines, opts) {
    var list = opts.items, errors = [], warnings = [], agg = {}, trucks = 0, samplesNeeded = 0, mixedTrucks = 0;
    function add(it, pallets, samples) {
      var a = agg[it.id] || (agg[it.id] = { item: it, pallets: 0, cartons: 0, samples: 0 });
      a.pallets += pallets; a.cartons += pallets * it.cpp; a.samples += samples;
    }
    lines.forEach(function (ln, i) {
      if (ln.kind === 'mixed') {
        var parts = (ln.parts || []).filter(function (p) { return p.item && p.pallets > 0; }); if (!parts.length) return;
        var its = parts.map(function (p) { return itemById(list, p.item); });
        if (its.some(function (x) { return !x || !x.ready; })) { errors.push('Mixed truck ' + (i + 1) + ': pallet details missing for ' + its.filter(function (x) { return !x || !x.ready; }).map(function (x) { return x ? x.name : '?'; }).join(', ') + '.'); return; }
        var capP = Math.min.apply(null, its.map(function (x) { return (ln.alt && x.pptAlt) || x.ppt; }));
        var tot = sum(parts, function (p) { return p.pallets; });
        if (tot > capP) warnings.push('Mixed truck ' + (i + 1) + ' has ' + tot + ' pallets; a truck takes ' + capP + '.');
        trucks += 1; mixedTrucks += 1;
        var distinct = {}; parts.forEach(function (p, k) { var it = its[k]; var s = (opts.samples && !distinct[it.id]) ? 1 : 0; distinct[it.id] = 1; samplesNeeded += 1; add(it, p.pallets, s); });
      } else {
        var it = itemById(list, ln.item); if (!it || !(ln.trucks > 0)) return;
        if (!it.ready) { errors.push(it.name + ': cartons per pallet or pallets per truck not set yet.'); return; }
        var ppt = ln.ppt || it.ppt; trucks += ln.trucks; samplesNeeded += ln.trucks;
        add(it, ln.trucks * ppt, opts.samples ? ln.trucks : 0);
      }
    });
    var rows = Object.keys(agg).map(function (k) {
      var a = agg[k], it = a.item, bpb = opts.model.bpb[it.id], cap = dailyCap(opts.model, it.id, opts.sections);
      var cartons = a.cartons + a.samples, bpc = (opts.model.bpc || {})[it.size] || null;
      if (!bpb) errors.push(it.name + ': the Line Planner has no boxes-per-batch figure.');
      if (!cap) errors.push(it.name + ': no learned speed for ' + opts.sections.join(' + ') + '.');
      return { item: it, pallets: a.pallets, cartonsNoSample: a.cartons, samples: a.samples, cartons: cartons, bottles: bpc ? cartons * bpc : null,
        bpb: bpb, batches: bpb ? cartons / bpb : null, cap: cap, days: cap ? cartons / cap.p50 : null, daysLo: cap ? cartons / cap.p90 : null, daysHi: cap ? cartons / Math.max(cap.p10, 1) : null };
    });
    var ok = rows.length && rows.every(function (r) { return r.bpb && r.cap; });
    var days = ok ? schedule(rows.map(function (r) { return { item: r.item, cartons: r.cartons, cap: r.cap, bpb: r.bpb, sections: opts.sections }; }), { start: opts.start, saturdays: opts.saturdays, model: opts.model }) : [];
    return { rows: rows, trucks: trucks, mixedTrucks: mixedTrucks, pallets: sum(rows, function (r) { return r.pallets; }), cartons: sum(rows, function (r) { return r.cartons; }),
      samples: sum(rows, function (r) { return r.samples; }), samplesIfYes: samplesNeeded, batches: sum(rows, function (r) { return r.batches || 0; }),
      lineDays: sum(rows, function (r) { return r.days || 0; }), days: days, start: days.length ? days[0].date : null, finish: days.length ? days[days.length - 1].date : null,
      workdays: days.length, errors: errors, warnings: warnings };
  }

  /* ---------- campaign: one item for N weeks ---------- */
  function campaignCalc(o) {
    var it = itemById(o.items, o.item), model = o.model, errors = [];
    if (!it) return { errors: ['Pick a product.'] };
    var cap = dailyCap(model, it.id, o.sections), bpb = model.bpb[it.id];
    if (!cap) errors.push('No learned speed for ' + it.name + ' on ' + o.sections.join(' + ') + '.');
    if (!bpb) errors.push('No boxes-per-batch figure for ' + it.name + '.');
    if (errors.length) return { errors: errors, item: it };
    var start = weekStart(o.start), weeks = [], days = [], cum = 0, cumBatches = 0;
    var perTruck = it.ready ? it.cpp * ((o.alt && it.pptAlt) || it.ppt) : null;
    for (var w = 0; w < o.weeks; w++) {
      var ws = addDays(start, 7 * w), wk = { start: ws, end: addDays(ws, 6), days: 0, cartons: 0, batches: 0, lo: 0, hi: 0 };
      for (var k = 0; k < 7; k++) {
        var d = addDays(ws, k); if (d < o.start || !isWorkday(d, o.saturdays)) continue;
        var perSec = {}; o.sections.forEach(function (s) { perSec[s] = model.cap[it.id][s].p50; });
        days.push({ date: d, items: [{ item: it.id, product: it.product, size: it.size, cartons: cap.p50, batches: cap.p50 / bpb, perSec: perSec, bpb: bpb }] });
        wk.days++; wk.cartons += cap.p50; wk.lo += cap.p10; wk.hi += cap.p90;
      }
      wk.batches = wk.cartons / bpb; cum += wk.cartons; cumBatches += wk.batches;
      wk.pallets = it.cpp ? wk.cartons / it.cpp : null; wk.trucks = perTruck ? wk.cartons / perTruck : null;
      wk.cumCartons = cum; wk.cumTrucks = perTruck ? Math.floor(cum / perTruck) : null; wk.bottles = model.bpc && model.bpc[it.size] ? wk.cartons * model.bpc[it.size] : null;
      weeks.push(wk);
    }
    var tot = { days: sum(weeks, function (w) { return w.days; }), cartons: cum, batches: cumBatches, lo: sum(weeks, function (w) { return w.lo; }), hi: sum(weeks, function (w) { return w.hi; }) };
    tot.pallets = it.cpp ? tot.cartons / it.cpp : null; tot.trucks = perTruck ? tot.cartons / perTruck : null; tot.fullTrucks = perTruck ? Math.floor(tot.cartons / perTruck) : null;
    tot.bottles = model.bpc && model.bpc[it.size] ? tot.cartons * model.bpc[it.size] : null;
    return { item: it, cap: cap, bpb: bpb, perTruck: perTruck, weeks: weeks, days: days, total: tot, errors: [], start: days.length ? days[0].date : null, finish: days.length ? days[days.length - 1].date : null };
  }

  /* ---------- raw materials ---------- */
  /* Turn scheduled days into the Raw Materials plan, keep everything else at normal pace, and run the stock forecast. */
  function materialsImpact(ME, BASE, saved, sched, today) {
    var m = ME.buildModel(BASE, saved), avg = ME.avgWeekly(m), fp = (saved.plan && saved.plan.days) ? saved.plan : null;
    if (!sched.length) return null;
    var weeksSet = {}; sched.forEach(function (d) { weeksSet[weekStart(d.date)] = 1; });
    var weeks = Object.keys(weeksSet).sort(), days = {}, byDate = {}, secsUsed = {};
    sched.forEach(function (d) { byDate[d.date] = d; d.items.forEach(function (x) { Object.keys(x.perSec).forEach(function (s) { if (x.perSec[s] > 0) secsUsed[SECMAP[s]] = 1; }); }); });
    function normalDay(day) {
      var o = {};
      if (fp && fp.from && day >= fp.from && day <= fp.to) { var f = fp.days[day] || {}; Object.keys(f).forEach(function (k) { o[k] = f[k]; }); return o; }
      var share = m.weekdayShare[dow(day)] || 0;
      Object.keys(avg).forEach(function (p) { Object.keys(avg[p].sections).forEach(function (s) { var b = avg[p].sections[s] * share; if (b > 0) o[p + '|' + s] = b; }); });
      return o;
    }
    weeks.forEach(function (ws) {
      for (var k = 0; k < 7; k++) {
        var day = addDays(ws, k), o = normalDay(day), sd = byDate[day];
        if (sd) {
          // sections that run the order/campaign that day make only that; the other section keeps its normal plan
          Object.keys(o).forEach(function (key) { if (secsUsed[key.split('|')[1]]) delete o[key]; });
          sd.items.forEach(function (x) { Object.keys(x.perSec).forEach(function (s) { var b = x.perSec[s] / x.bpb; if (b > 0) { var key = x.product + '|' + SECMAP[s]; o[key] = (o[key] || 0) + b; } }); });
        } else if (day >= sched[0].date && day <= sched[sched.length - 1].date) {
          // a non-working day inside the run (Friday, Saturday off): nothing on the order's sections
          Object.keys(o).forEach(function (key) { if (secsUsed[key.split('|')[1]]) delete o[key]; });
        }
        days[day] = o;
      }
    });
    var plan = { days: Object.assign({}, fp ? fp.days : {}, days), from: fp && fp.from, to: fp && fp.to, weeks: weeks, source: 'Supply Planner' };
    var s2 = Object.assign({}, saved, { plan: plan });
    var withRun = ME.forecast(BASE, s2, today), base = ME.forecast(BASE, saved, today);
    // what the order/campaign alone uses, per material and week
    var need = {};
    m.materials.forEach(function (mat) { need[mat.id] = { total: 0, weeks: {} }; });
    sched.forEach(function (d) {
      d.items.forEach(function (x) {
        Object.keys(x.perSec).forEach(function (s) {
          var b = x.perSec[s] / x.bpb, rec = (m.recipes[x.product] || {})[SECMAP[s]] || {};
          Object.keys(rec).forEach(function (mid) { if (!need[mid]) return; var q = rec[mid] * b; need[mid].total += q; var w = weekStart(d.date); need[mid].weeks[w] = (need[mid].weeks[w] || 0) + q; });
        });
      });
    });
    var baseBy = {}; base.results.forEach(function (r) { baseBy[r.id] = r; });
    var rows = withRun.results.filter(function (r) { return need[r.id] && need[r.id].total > 1e-9; }).map(function (r) {
      var b = baseBy[r.id], wk = weeks.map(function (ws) { var x = r.weeks.filter(function (y) { return y.start === ws; })[0]; return { start: ws, need: need[r.id].weeks[ws] || 0, closing: x ? x.closing : null, safety: r.safety }; });
      var short = wk.filter(function (x) { return x.closing != null && x.closing < 0; })[0];
      return { id: r.id, name: r.name, unit: r.unit, need: need[r.id].total, stockNow: r.stockNow, weeks: wk, status: r.status, orderBy: r.orderBy, runOut: r.runOut, suggestedQty: r.suggestedQty,
        lead: r.lead, baseRunOut: b ? b.runOut : null, baseOrderBy: b ? b.orderBy : null, firstShortWeek: short ? short.start : null, why: r.why };
    });
    var missingRecipes = [];
    sched[0].items.concat.apply([], sched.map(function (d) { return d.items; })).forEach(function (x) {
      Object.keys(x.perSec).forEach(function (s) { var rec = (m.recipes[x.product] || {})[SECMAP[s]]; if ((!rec || !Object.keys(rec).length) && missingRecipes.indexOf(x.product + ' ' + s) < 0) missingRecipes.push(x.product + ' ' + s); });
    });
    rows.sort(function (a, b) { var r = { order: 0, soon: 1, ok: 2, idle: 3 }; return (r[a.status] - r[b.status]) || ((a.orderBy || '9') < (b.orderBy || '9') ? -1 : 1); });
    return { rows: rows, weeks: weeks, missingRecipes: missingRecipes, today: today };
  }

  root.ATICSupply = { ITEMS: ITEMS, items: items, itemById: itemById, lineModel: lineModel, orderCalc: orderCalc, campaignCalc: campaignCalc, materialsImpact: materialsImpact,
    util: { addDays: addDays, dow: dow, weekStart: weekStart, isWorkday: isWorkday, firstWorkday: firstWorkday, nextWorkday: nextWorkday } };
})(typeof window !== 'undefined' ? window : globalThis);
