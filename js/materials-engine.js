/* ATIC Oman raw material forecast engine. Shared by the web app and the weekly email job. */
(function (root) {
  var DAY = 86400000;
  function iso(d) { return new Date(d).toISOString().slice(0, 10); }
  function parse(s) { return new Date(s + 'T00:00:00Z').getTime(); }
  function addDays(s, n) { return iso(parse(s) + n * DAY); }
  function dow(s) { return new Date(parse(s)).getUTCDay(); } // 0 = Sunday
  function weekStart(s) { return addDays(s, -dow(s)); }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / DAY); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function round(x, n) { var p = Math.pow(10, n || 0); return Math.round(x * p) / p; }

  /* Merge saved edits (db) over the baseline built from the Jan–Sep sheets. */
  function buildModel(base, saved) {
    saved = saved || {};
    var m = clone(base);
    var mat = (saved.materials && saved.materials.items) || {};
    m.materials.forEach(function (x) { if (mat[x.id]) Object.assign(x, mat[x.id]); });
    if (saved.recipes && saved.recipes.recipes) {
      var r = saved.recipes.recipes;
      Object.keys(r).forEach(function (p) {
        m.recipes[p] = m.recipes[p] || {};
        Object.keys(r[p]).forEach(function (s) { m.recipes[p][s] = r[p][s]; });
      });
    }
    var st = (saved.stock && saved.stock.items) || {};
    Object.keys(st).forEach(function (k) { m.stock[k] = st[k]; });
    m.plan = (saved.plan && saved.plan.days) ? saved.plan : { days: {}, weeks: [] };
    m.orders = (saved.orders || []).filter(function (o) { return o && o.status !== 'received' && o.status !== 'cancelled'; });
    m.settings = Object.assign({ basisWeeks: 8 }, saved.settings || {});
    m.actualDays = saved.actualDays || {};
    m.actualSections = saved.actualSections || {}; /* sections with an actual entered that day (even 0 batches) */ /* batches really prepared, from the Line Planner actuals: { date: { 'GM|SEC-2': 13 } } */
    return m;
  }

  /* Average batches per week for each product and section, from full weeks of history. */
  function avgWeekly(m) {
    var weeks = m.weeks, n = weeks.length;
    var full = [];
    for (var i = 0; i < n; i++) {
      var ws = weeks[i], we = addDays(ws, 6);
      if (ws >= m.history.from && we <= m.history.to) full.push(i);
    }
    var basis = m.settings.basisWeeks === 'all' ? full : full.slice(-Number(m.settings.basisWeeks || 8));
    var out = {};
    m.products.forEach(function (p) {
      var arr = m.weeklyBatches[p.id] || [];
      var sum = 0; basis.forEach(function (i) { sum += arr[i] || 0; });
      var avg = basis.length ? sum / basis.length : 0;
      var vals = basis.map(function (i) { return arr[i] || 0; });
      out[p.id] = { total: avg, weeks: basis.length, values: vals, sections: {} };
      if (p.id === 'GM') {
        out[p.id].sections['SEC-1'] = avg * m.gmSectionShare['SEC-1'];
        out[p.id].sections['SEC-2'] = avg * m.gmSectionShare['SEC-2'];
      } else out[p.id].sections[p.sections[0]] = avg;
    });
    return out;
  }

  /* Batches expected on one day: the factory plan when that week is planned, otherwise the average pace. */
  function batchesOn(m, day, avg, sc) {
    var wk = weekStart(day);
    if (m.actualDays && m.actualDays[day]) {
      var ad = m.actualDays[day], out = [];
      Object.keys(ad).forEach(function (k) { var b = Number(ad[k]) || 0; if (b > 0) { var q = k.split('|'); out.push({ product: q[0], section: q[1], batches: b, source: 'actual' }); } });
      // a section with no actual that day keeps the plan / average for that section
      var have = {}; out.forEach(function (x) { have[x.section] = 1; });
      var rest = batchesOn(Object.assign({}, m, { actualDays: null }), day, avg, sc).filter(function (x) { return !have[x.section] && !(m.actualSections && m.actualSections[day] && m.actualSections[day][x.section]); });
      return out.concat(rest);
    }
    var planned = (m.plan.from && day >= m.plan.from && day <= m.plan.to) || (m.plan.weeks || []).indexOf(wk) >= 0;
    var res = [];
    if (planned) {
      var d = m.plan.days[day] || {};
      Object.keys(d).forEach(function (k) {
        var b = Number(d[k]) || 0; if (!b) return;
        var parts = k.split('|'); res.push({ product: parts[0], section: parts[1], batches: b, source: 'plan' });
      });
    } else {
      var share = m.weekdayShare[dow(day)] || 0;
      Object.keys(avg).forEach(function (p) {
        Object.keys(avg[p].sections).forEach(function (s) {
          var b = avg[p].sections[s] * share * (sc.demandPct / 100);
          if (p === 'GM' && sc.extraGM) b += sc.extraGM * share * m.gmSectionShare[s];
          if (b > 0) res.push({ product: p, section: s, batches: b, source: 'average' });
        });
      });
    }
    return res;
  }

  function useOn(m, matId, items) {
    var total = 0, by = {};
    items.forEach(function (it) {
      var r = (m.recipes[it.product] || {})[it.section] || {};
      var q = Number(r[matId]) || 0;
      if (!q) return;
      var u = q * it.batches;
      total += u; by[it.product] = (by[it.product] || 0) + u;
    });
    return { total: total, by: by };
  }

  function forecast(base, saved, today, scenario) {
    var sc = Object.assign({ demandPct: 100, leadDays: null, extraGM: 0 }, scenario || {});
    var m = buildModel(base, saved);
    today = today || iso(Date.now());
    var avg = avgWeekly(m);
    var HORIZON = 26 * 7;
    var start = weekStart(today);
    var dayCache = {};
    function items(day) { return dayCache[day] || (dayCache[day] = batchesOn(m, day, avg, sc)); }
    var results = m.materials.map(function (mat) {
      var st = m.stock[mat.id] || { qty: 0, asOf: today, source: 'none' };
      var lead = { min: sc.leadDays || mat.leadMinDays, max: sc.leadDays || mat.leadMaxDays };
      // roll stock forward from count date to the start of this week
      var qty = Number(st.qty) || 0, gap = 0;
      var d = addDays(st.asOf, 1);
      var rollFrom = d;
      var actualSince = 0;
      while (d < start) {
        if (m.actualDays[d]) actualSince++;
        var u0 = useOn(m, mat.id, items(d)).total; qty -= u0; gap += u0;
        m.orders.forEach(function (o) { if (o.material === mat.id && o.eta === d) qty += Number(o.qty) || 0; });
        d = addDays(d, 1);
      }
      var opening = qty;
      // weekly average use for this material at normal pace
      var weekly = 0, byProd = {};
      for (var k = 0; k < 7; k++) {
        var dd = addDays(addDays(start, 7 * 6), k); // a week outside any plan, for the normal pace
        var avgItems = [];
        Object.keys(avg).forEach(function (p) { Object.keys(avg[p].sections).forEach(function (s) {
          var b = avg[p].sections[s] * (m.weekdayShare[k] || 0) * (sc.demandPct / 100);
          if (p === 'GM' && sc.extraGM) b += sc.extraGM * (m.weekdayShare[k] || 0) * m.gmSectionShare[s];
          if (b > 0) avgItems.push({ product: p, section: s, batches: b });
        }); });
        var uu = useOn(m, mat.id, avgItems); weekly += uu.total;
        Object.keys(uu.by).forEach(function (p) { byProd[p] = (byProd[p] || 0) + uu.by[p]; });
      }
      var safety = weekly * mat.safetyWeeks;
      var daily = [], weeks = [], cur = opening, runOut = null, belowSafety = null, firstWeekPlan = null;
      for (var w = 0; w < HORIZON / 7; w++) {
        var ws = addDays(start, w * 7), open = cur, use = 0, rec = 0, fromPlan = (m.plan.weeks || []).indexOf(ws) >= 0, planUse = 0;
        for (var j = 0; j < 7; j++) {
          var day = addDays(ws, j);
          var r = useOn(m, mat.id, items(day));
          m.orders.forEach(function (o) { if (o.material === mat.id && o.eta === day) { cur += Number(o.qty) || 0; rec += Number(o.qty) || 0; } });
          cur -= r.total; use += r.total;
          var recD = 0; m.orders.forEach(function (o) { if (o.material === mat.id && o.eta === day) recD += Number(o.qty) || 0; });
          daily.push({ date: day, use: r.total, received: recD, closing: cur, planned: (m.plan.from && day >= m.plan.from && day <= m.plan.to) || fromPlan });
          if (fromPlan) planUse += r.total;
          if (day >= today && runOut === null && cur <= 0 && weekly > 0) runOut = day;
          if (day >= today && belowSafety === null && cur < safety && weekly > 0) belowSafety = day;
        }
        if (fromPlan && firstWeekPlan === null) firstWeekPlan = { week: ws, use: planUse };
        weeks.push({ start: ws, opening: open, use: use, received: rec, closing: cur, fromPlan: fromPlan });
      }
      var active = weekly > 0 || weeks.some(function (x) { return x.use > 0; });
      var orderBy = belowSafety ? addDays(belowSafety, -lead.max) : null;
      if (orderBy && orderBy < today) orderBy = orderBy; // keep overdue date for "days late"
      var daysToOrder = orderBy ? diffDays(today, orderBy) : null;
      var status = !active ? 'idle' : (daysToOrder === null ? 'ok' : daysToOrder <= 0 ? 'order' : daysToOrder <= 21 ? 'soon' : 'ok');
      var stockNow = opening;
      var weeksCover = weekly > 0 ? Math.max(0, opening) / weekly : null;
      var arrival = addDays(today, lead.max);
      var projAtArrival = (function () {
        var wi = Math.floor(diffDays(start, arrival) / 7); var x = weeks[Math.min(wi, weeks.length - 1)]; return x ? x.closing : 0;
      })();
      var suggested = weekly > 0 ? Math.max(0, safety + weekly * mat.orderCoverWeeks - Math.max(0, projAtArrival)) : 0;
      suggested = Math.ceil(suggested / 10) * 10;
      var openOrders = m.orders.filter(function (o) { return o.material === mat.id; });
      var top = Object.keys(byProd).sort(function (a, b) { return byProd[b] - byProd[a]; });
      var res = {
        id: mat.id, name: mat.name, unit: mat.unit, note: mat.note, active: active, status: status,
        stockCounted: Number(st.qty) || 0, countedOn: st.asOf, actualSince: actualSince, countSource: st.source, usedSinceCount: gap, rollFrom: rollFrom,
        stockNow: stockNow, weekly: weekly, byProduct: byProd, safety: safety, weeksCover: weeksCover,
        runOut: runOut, belowSafety: belowSafety, orderBy: orderBy, daysToOrder: daysToOrder,
        lead: lead, arrivalIfOrderedToday: { earliest: addDays(today, lead.min), latest: arrival },
        suggestedQty: suggested, openOrders: openOrders, weeks: weeks, daily: daily, firstWeekPlan: firstWeekPlan, topProducts: top
      };
      res.why = explain(res, m, today);
      return res;
    });
    var rank = { order: 0, soon: 1, ok: 2, idle: 3 };
    results.sort(function (a, b) { return (rank[a.status] - rank[b.status]) || ((a.daysToOrder == null ? 1e9 : a.daysToOrder) - (b.daysToOrder == null ? 1e9 : b.daysToOrder)); });
    return { today: today, weekStart: start, avg: avg, model: m, scenario: sc, results: results };
  }

  var PNAME = { GM: 'Grenadine Molasses', BW: 'Blossom Water', RW: 'Rose Water', LS: 'Lemon Substitute', WV: 'White Vinegar' };
  function fmt(x, unit) {
    var n = Math.abs(x) >= 100 ? Math.round(x).toLocaleString('en-US') : (Math.round(x * 10) / 10).toLocaleString('en-US');
    return unit ? n + ' ' + unit + (Math.abs(x) === 1 || /kg|gal/.test(unit) ? '' : 's') : n;
  }
  function nice(s) { var d = new Date(parse(s)); return d.getUTCDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]; }

  function explain(r, m, today) {
    if (!r.active) return ['None of the current recipes use this material, so nothing is being consumed.'];
    var out = [];
    var counted = r.countedOn === today ? 'today' : 'on ' + nice(r.countedOn);
    if (r.usedSinceCount > 0.5) out.push('Counted ' + fmt(r.stockCounted, r.unit) + ' ' + counted + '. About ' + fmt(r.usedSinceCount, r.unit) + ' has been used since' + (r.actualSince ? ' (' + r.actualSince + ' day' + (r.actualSince === 1 ? '' : 's') + ' from the batches really prepared in the Line Planner)' : '') + ', so this week starts at roughly ' + fmt(Math.max(0, r.stockNow), r.unit) + '.');
    else out.push('Stock is ' + fmt(r.stockCounted, r.unit) + ', counted ' + counted + '.');
    var age = diffDays(r.countedOn, today);
    if (age > 14) out.push('This count is ' + age + ' days old. Update it on the Stock page for a sharper forecast.');
    if (r.stockNow < 0) out.push('The estimate is below zero, which usually means stock arrived that is not recorded yet, or the material is no longer used. Please recount.');
    var parts = r.topProducts.slice(0, 2).map(function (p) { return PNAME[p] + ' ' + Math.round(100 * r.byProduct[p] / r.weekly) + '%'; });
    out.push('Normal use is about ' + fmt(r.weekly, r.unit) + ' a week (' + parts.join(', ') + '), based on the last ' + (m.settings.basisWeeks === 'all' ? 'Jan–Sep' : m.settings.basisWeeks + ' full weeks') + ' of production.');
    if (r.firstWeekPlan) out.push('The factory plan for the week of ' + nice(r.firstWeekPlan.week) + ' needs ' + fmt(r.firstWeekPlan.use, r.unit) + '.');
    if (r.runOut) out.push('At this pace it runs out around ' + nice(r.runOut) + (r.weeksCover != null ? ' (about ' + round(r.weeksCover, 1) + ' weeks of cover).' : '.'));
    else out.push('Stock lasts beyond the 26-week horizon.');
    out.push('Lead time is ' + Math.round(r.lead.min / 30 * 10) / 10 + '–' + Math.round(r.lead.max / 30 * 10) / 10 + ' months: an order placed today arrives between ' + nice(r.arrivalIfOrderedToday.earliest) + ' and ' + nice(r.arrivalIfOrderedToday.latest) + '.');
    if (r.openOrders.length) out.push('Open orders counted: ' + r.openOrders.map(function (o) { return fmt(o.qty, r.unit) + ' due ' + nice(o.eta); }).join(', ') + '.');
    if (r.status === 'order') {
      if (r.runOut && r.runOut < r.arrivalIfOrderedToday.earliest) out.push('Even if ordered today, the earliest delivery (' + nice(r.arrivalIfOrderedToday.earliest) + ') comes ' + diffDays(r.runOut, r.arrivalIfOrderedToday.earliest) + ' days after stock runs out. Order about ' + fmt(r.suggestedQty, r.unit) + ' now and arrange an urgent or local supply to cover the gap.');
      else out.push('Order about ' + fmt(r.suggestedQty, r.unit) + ' now. Waiting longer means the delivery lands after stock drops below the ' + m.materials.filter(function (x) { return x.id === r.id; })[0].safetyWeeks + '-week safety level.');
    }
    else if (r.status === 'soon') out.push('Place the order by ' + nice(r.orderBy) + ' (in ' + r.daysToOrder + ' days). Suggested quantity about ' + fmt(r.suggestedQty, r.unit) + '.');
    else if (r.orderBy) out.push('No action yet. Next order due by ' + nice(r.orderBy) + '.');
    return out;
  }

  function emailHTML(fc, appUrl) {
    var rows = fc.results.filter(function (r) { return r.active; });
    var col = { order: '#B42318', soon: '#B54708', ok: '#067647' };
    var lab = { order: 'Order now', soon: 'Order soon', ok: 'OK' };
    var red = rows.filter(function (r) { return r.status === 'order'; }).length, amb = rows.filter(function (r) { return r.status === 'soon'; }).length;
    var h = '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:680px;color:#1d2a26">';
    h += '<h2 style="margin:0 0 4px;color:#0f4c3a">ATIC Oman · Raw material outlook</h2>';
    h += '<p style="margin:0 0 16px;color:#5b6b66">Week starting ' + nice(fc.weekStart) + ' · ' + red + ' to order now · ' + amb + ' to order soon</p>';
    h += '<table style="border-collapse:collapse;width:100%;font-size:14px"><tr style="text-align:left;color:#5b6b66"><th style="padding:6px">Material</th><th>Status</th><th>Stock</th><th>Weeks cover</th><th>Order by</th></tr>';
    rows.forEach(function (r) {
      h += '<tr style="border-top:1px solid #e3e8e6"><td style="padding:6px">' + r.name + '</td><td style="color:' + col[r.status] + ';font-weight:600">' + lab[r.status] + '</td><td>' + fmt(Math.max(0, r.stockNow), r.unit) + '</td><td>' + (r.weeksCover == null ? '–' : round(r.weeksCover, 1)) + '</td><td>' + (r.orderBy ? nice(r.orderBy) : '–') + '</td></tr>';
    });
    h += '</table>';
    rows.filter(function (r) { return r.status !== 'ok'; }).forEach(function (r) {
      h += '<h3 style="margin:20px 0 6px;color:' + col[r.status] + '">' + r.name + '</h3><ul style="margin:0;padding-left:18px">' + r.why.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>';
    });
    if (appUrl) h += '<p style="margin-top:20px"><a href="' + appUrl + '">Open the forecast app</a></p>';
    h += '<p style="color:#8a9893;font-size:12px">History used: Jan–Sep 2026. Stock counts and recipes as saved in the app.</p></div>';
    return h;
  }

  var api = { forecast: forecast, buildModel: buildModel, avgWeekly: avgWeekly, emailHTML: emailHTML, util: { iso: iso, addDays: addDays, weekStart: weekStart, nice: nice, fmt: fmt, diffDays: diffDays } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ATICEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
