/* ATIC Line Planner engine (forecast, learning, compare). Shared by Line Planner, ATIC BETA 2.0, Supply Planner and Forecast Results. */
// ==ENGINE START==
// Pure planning engine: no DOM, no three.js. Shared by the page and by test_engine.js.
const ENGINE = (() => {
  const SHIFT = 600;
  const MACH_CATS = ['Capping', 'Labeling', 'Filling', 'Packaging', 'Conveyor & Washer'];
  const C = { MS: 'Morning Start', CO: 'Changeover & Line Setup', CIP: 'Deep Cleaning / CIP', PREP: 'Batch Preparation',
    RC: 'Routine Cleaning', DEEP: 'Deep Cleaning / CIP', UNPL: 'Unplanned allowance', AFTER: 'Start-up after change', RUN: 'Line running', IDLE: 'Line idle' };
  const GROUP = cat => MACH_CATS.includes(cat) || cat === C.AFTER ? 'mach'
    : (cat === C.RC || cat === C.CIP) ? 'clean'
    : (cat === C.MS || cat === C.CO || cat === C.PREP) ? 'plan'
    : cat === C.RUN ? 'run' : cat === C.IDLE ? 'idle' : 'unpl';
  const LOG_WEIGHT = 3;          // one logged day counts like 3 history days
  const LOG_HALF_LIFE = 60;      // days; recent logged days count more
  const BAL_EPS = 0.05;          // batches; less than this counts as "no balance"
  const clone = o => JSON.parse(JSON.stringify(o));
  const round = (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; };
  const num = x => x == null || x === '' || !isFinite(+x) ? null : +x;
  const sum = (a, f = x => x) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const mean = a => a.length ? sum(a) / a.length : null;

  function hhmm(m) { const t = 7 * 60 + Math.round(m); return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
  function parseHHMM(s) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? (+m[1] * 60 + +m[2]) - 420 : null; } // minutes after 07:00
  function itemKey(product, size) { return product + '|' + size; }
  function changeType(prev, cur) {
    if (!prev || !prev.product || !prev.size) return 'none';
    if (prev.product === cur.product && prev.size === cur.size) return 'none';
    if (prev.product === cur.product) return 'size';
    if (prev.size === cur.size) return 'product';
    return 'both';
  }
  const CHG_LABEL = { none: 'No change', size: 'Size change', product: 'Product change', both: 'Product + size change' };
  function weekdayIdx(date) { const d = new Date(date + 'T00:00:00Z').getUTCDay(); return (d + 6) % 7; } // Mon=0..Sun=6
  const WD = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  function daysBetween(a, b) { return (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5; }
  function addDays(d, n) { const t = new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5); return t.toISOString().slice(0, 10); }
  function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // integer split of `total` into parts proportional to w (largest remainder), each >= 1
  function intSplit(total, w) {
    const n = w.length; if (!n || total <= 0) return [];
    const k = Math.min(n, total); const ww = w.slice(0, k); const s = ww.reduce((a, b) => a + b, 0) || 1;
    const raw = ww.map(x => 1 + (total - k) * x / s); const out = raw.map(Math.floor);
    let rem = total - out.reduce((a, b) => a + b, 0);
    const ord = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
    for (let j = 0; rem > 0; j++, rem--) out[ord[j % k][1]]++;
    return out;
  }
  // batch <-> kg / litres / boxes
  function batchInfo(P, product, size, batches) {
    const b = P.batch && P.batch[product] ? P.batch[product] : { kgPerBatch: 1000, density: 1, yield: 1 };
    const bpb = P.boxesPerBatch[itemKey(product, size)] ? P.boxesPerBatch[itemKey(product, size)].boxes : null;
    const x = +batches || 0;
    return { batches: x, kg: x * b.kgPerBatch, litres: x * b.kgPerBatch / b.density, boxes: bpb ? x * bpb : null };
  }

  // ---------------------------------------------------------------- shapes
  // A forecast input or an actual can be single-item (old docs) or have runs[]. These return runs[].
  function inputRuns(inp) {
    if (Array.isArray(inp.runs) && inp.runs.length) return inp.runs.map(r => ({ product: r.product, size: r.size, batches: num(r.batches), opening: num(r.opening), start: num(r.start), target: num(r.target) }));
    return [{ product: inp.product, size: inp.size, batches: num(inp.batches), opening: num(inp.opening) ?? 0, start: null, target: num(inp.targetBoxes) }];
  }
  function actualRuns(a) {
    if (Array.isArray(a.runs) && a.runs.length) return a.runs.map(r => ({ product: r.product, size: r.size, batches: num(r.batches), opening: num(r.opening), closing: num(r.closing),
      boxes: r.prepOnly ? 0 : (num(r.boxes) ?? 0), fillMin: r.prepOnly ? 0 : num(r.fillMin), changeoverMin: r.prepOnly ? null : num(r.changeoverMin), prepOnly: !!r.prepOnly }));
    const co = a.changeover && a.changeover.done ? (num(a.changeover.min) ?? 0) : (a.changeover ? 0 : null);
    return [{ product: a.product, size: a.size, batches: num(a.batches), opening: num(a.openingBalance), closing: num(a.closingBalance), boxes: num(a.boxes) ?? 0, fillMin: num(a.fillMin), changeoverMin: co }];
  }
  function filledRuns(a) { const rr = actualRuns(a).filter(r => !r.prepOnly); return rr.length ? rr : actualRuns(a); }
  function actualPrev(a) { return a.prevProduct ? { product: a.prevProduct, size: a.prevSize } : null; }
  function actualTotals(a) {
    const runs = actualRuns(a);
    const coMin = runs.some(r => r.changeoverMin != null) ? sum(runs, r => r.changeoverMin) : null;
    const closings = runs.filter((r, i) => r.closing != null && !runs.slice(i + 1).some(q => q.product === r.product));
    return { runs, boxes: num(a.boxes) ?? sum(runs, r => r.boxes), changeoverMin: coMin, closingBatches: closings.length ? sum(closings, r => r.closing) : null,
      openingBatches: runs.some(r => r.opening != null) ? sum(runs.filter((r, i) => !runs.slice(0, i).some(q => q.product === r.product)), r => r.opening) : null };
  }

  // ---------------------------------------------------------------- learning
  // Blend history parameters with logged actuals. Each actual counts like LOG_WEIGHT history days,
  // discounted by age (half-life LOG_HALF_LIFE days). History weight = its own sample size, capped.
  function learn(P, actuals, opts = {}) {
    const before = opts.before || null, ref = opts.ref || before || opts.today || null;
    const E = clone(P);
    const changes = [];
    const list = (actuals || []).filter(a => a && a.date && !a.noRun && !a.excludeFromLearning && (!before || a.date < before))
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.sec < b.sec ? -1 : 1));
    const wOf = a => LOG_WEIGHT * (ref ? 0.5 ** (Math.max(0, daysBetween(a.date, ref)) / LOG_HALF_LIFE) : 1);
    const acc = {};
    const push = (k, obs, w) => { if (!isFinite(obs) || obs < 0 || !(w > 0)) return; (acc[k] = acc[k] || []).push([obs, w]); };
    const lastBySec = {};
    for (const a of list) {
      const sec = a.sec, w = wOf(a), pl = E.planned[sec]; if (!pl || a.noRun) continue;
      const runs = filledRuns(a);
      let prev = actualPrev(a) || lastBySec[sec] || null;
      const dayFill = num(a.fillMin), stop = num(a.stopMin);
      // a short partial window (one crew moved between lines, under 4 h) is not a normal run: skip speed and machine-stop learning
      const partial = num(a.workMin) != null && num(a.workMin) < 240;
      // fill minutes per run: entered, else the day's filling split by expected filling time
      const expT = runs.map(r => { const s = E.speed[itemKey(r.product, r.size) + '|' + sec]; return s && r.boxes > 0 ? r.boxes / s.p50 : 0; });
      const known = sum(runs, r => r.fillMin);
      const unknownIdx = runs.map((r, i) => r.fillMin == null ? i : -1).filter(i => i >= 0);
      const rest = dayFill != null ? Math.max(0, dayFill - known) : null;
      const expU = sum(unknownIdx, i => expT[i]);
      const fills = runs.map((r, i) => r.fillMin != null ? r.fillMin : (rest != null ? (runs.length === 1 ? rest : (expU > 0 ? rest * expT[i] / expU : rest / unknownIdx.length)) : null));
      const coDay = runs.some(r => r.changeoverMin != null) ? sum(runs, r => r.changeoverMin) : 0;
      const rc = num(a.cleanRoutineMin), dp = num(a.cleanDeepMin), pr = num(a.prepMin), ms = num(a.startMin);
      const mach = stop != null ? Math.max(0, stop - coDay - (rc ?? pl.routineCleaning) - (dp ?? 0) - (pr ?? 0) - (ms ?? pl.morningStart)) : null;
      const fillTot = sum(fills.filter(x => x != null));
      const prodPrepared = [...new Set(runs.filter(r => (r.batches || 0) > 0).map(r => r.product))];
      let anyProdChange = false, cipDone = false;
      runs.forEach((r, i) => {
        const key = itemKey(r.product, r.size), sk = key + '|' + sec, f = fills[i];
        const ct = changeType(prev, r); if (ct === 'product' || ct === 'both') anyProdChange = true;
        if (!partial && f >= 30 && r.boxes > 0 && E.speed[sk]) push('speed|' + sk, r.boxes / f, w);
        // boxes per batch from what was actually USED: opening + prepared - closing (never biased by balance)
        if (r.opening != null && r.closing != null && E.boxesPerBatch[key]) {
          const used = r.opening + (r.batches || 0) - r.closing;
          if (used > 0.2 && r.boxes > 0) push('bpb|' + key, r.boxes / used, w);
        }
        if (!partial && mach != null && f >= 60 && fillTot > 0 && E.machineRate[sk]) push('mrate|' + sk, (mach * f / fillTot) / (f / 60), w * f / fillTot);
        if (ct !== 'none' && r.changeoverMin > 0) push('co|' + ct, r.changeoverMin, w);
        if ((ct === 'product' || ct === 'both') && dp != null && !cipDone) { push('cip|' + ct, dp, w); cipDone = true; }
        prev = r;
      });
      // prep: only learnable when one product had batches prepared that day
      if (pr != null && prodPrepared.length === 1 && E.prep[prodPrepared[0]]) {
        const p = prodPrepared[0], r0 = runs.find(r => r.product === p);
        push('prepP|' + p, pr > 0 ? 1 : 0, w); if (pr > 0) push('prepM|' + p, pr, w);
        if (r0.opening != null) push((r0.opening >= 0.5 ? 'waitB|' : 'waitN|') + p, pr > 0 ? 1 : 0, w);
      }
      if (rc != null) push('rc|' + sec, rc, w);
      if (ms != null) push('ms|' + sec, ms, w);
      if (!anyProdChange && dp != null) { push('deepP|' + sec, dp > 0 ? 1 : 0, w); if (dp > 0) push('deepM|' + sec, dp, w); }
      lastBySec[sec] = runs[runs.length - 1];
    }
    const blend = (hist, histW, k, label, d = 2, apply) => {
      const obs = acc[k]; if (!obs || hist == null) return;
      const sw = sum(obs, o => o[1]), so = sum(obs, o => o[0] * o[1]);
      const v = (histW * hist + so) / (histW + sw);
      apply(v);
      changes.push({ key: k, label, from: round(hist, d), to: round(v, d), n: obs.length, weight: round(sw / (histW + sw), 2) });
    };
    const SN = s => s === 'S1' ? 'Section 1' : 'Section 2';
    for (const sk in E.speed) {
      const s = E.speed[sk]; const [p, z, sec] = sk.split('|');
      blend(s.p50, Math.max(3, Math.min(s.n, 20)), 'speed|' + sk, `Speed ${P.products[p]} ${z}, ${SN(sec)} (boxes per filling min)`, 3, v => { const f = v / s.p50; s.p10 *= f; s.p90 *= f; s.p50 = v; });
    }
    for (const k in E.boxesPerBatch) { const b = E.boxesPerBatch[k]; const [p, z] = k.split('|');
      blend(b.boxes, 10, 'bpb|' + k, `Boxes per batch ${P.products[p]} ${z}`, 1, v => { b.boxes = v; }); }
    for (const sk in E.machineRate) { const m = E.machineRate[sk]; const [p, z, sec] = sk.split('|');
      blend(m.minPerFillHr, Math.max(5, Math.min(m.n, 20)), 'mrate|' + sk, `Machine stops ${P.products[p]} ${z}, ${SN(sec)} (min per filling hour)`, 2, v => { m.minPerFillHr = v; }); }
    for (const t of ['size', 'product', 'both']) { const c = E.changeover[t];
      blend(c.changeoverMin, Math.max(3, Math.min(c.n, 10)), 'co|' + t, `Changeover minutes, ${CHG_LABEL[t].toLowerCase()}`, 0, v => { c.changeoverMin = v; });
      if (t !== 'size') blend(c.cipMin, 5, 'cip|' + t, `CIP minutes on a ${CHG_LABEL[t].toLowerCase()}`, 0, v => { c.cipMin = v; }); }
    for (const p in E.prep) { const q = E.prep[p];
      blend(q.prob, Math.max(3, Math.min(q.nDays, 15)), 'prepP|' + p, `Chance ${P.products[p]} needs batch prep on a day`, 2, v => { q.prob = v; });
      blend(q.minWhenDone, Math.max(3, Math.min(q.nPrepDays, 15)), 'prepM|' + p, `Batch prep minutes ${P.products[p]}`, 0, v => { q.minWhenDone = v; });
      if (q.waitShareWithBalance != null || acc['waitB|' + p]) blend(q.waitShareWithBalance ?? 0.5, Math.max(2, Math.min(q.nWithBalance || 0, 15)), 'waitB|' + p, `Share of ${P.products[p]} days with balance where filling waited for prep`, 2, v => { q.waitShareWithBalance = v; q.waitsWithBalance = v >= 0.5; });
      if (q.waitShareNoBalance != null || acc['waitN|' + p]) blend(q.waitShareNoBalance ?? 0.8, Math.max(2, Math.min(q.nNoBalance || 0, 15)), 'waitN|' + p, `Share of ${P.products[p]} days without balance where filling waited for prep`, 2, v => { q.waitShareNoBalance = v; q.waitsNoBalance = v >= 0.3; });
    }
    for (const s of ['S1', 'S2']) { const q = E.planned[s];
      blend(q.routineCleaning, 15, 'rc|' + s, `Routine cleaning minutes, ${SN(s)}`, 0, v => { q.routineCleaning = v; });
      blend(q.morningStart, 15, 'ms|' + s, `Start-up minutes, ${SN(s)}`, 0, v => { q.morningStart = v; });
      blend(q.deepProb, 15, 'deepP|' + s, `Chance of deep cleaning / CIP on a no-change day, ${SN(s)}`, 2, v => { q.deepProb = v; });
      blend(q.deepMin, 8, 'deepM|' + s, `Deep cleaning / CIP minutes, ${SN(s)}`, 0, v => { q.deepMin = v; }); }
    E.learnedFrom = list.length;
    E.version = (P.version || 'h') + '+' + list.length;
    return { P: E, changes: changes.filter(c => Math.abs(c.to - c.from) > Math.max(Math.abs(c.from) * 0.005, 1e-9)), n: list.length };
  }

  // ---------------------------------------------------------------- forecast
  // inp: {date, sec, prev:{product,size}|null, runs:[{product,size,batches,opening,start,target}]}
  //   batches = batches prepared today for this run; opening = balance of that product in the tank (batches);
  //   start = minutes after 07:00 (null = when the previous run finishes); target = optional box target.
  //   Old single-item inputs {product,size,batches,targetBoxes} are still accepted.
  function forecast(P, inp) {
    const sec = inp.sec;
    const runs = inputRuns(inp);
    for (const r of runs) { const sk = itemKey(r.product, r.size) + '|' + sec; if (!P.speed[sk] || !P.machineRate[sk] || !P.boxesPerBatch[itemKey(r.product, r.size)]) throw new Error('Unknown item ' + sk); }
    const pl = P.planned[sec], ev = P.machineEvents[sec];
    const why = [];
    const wdi = weekdayIdx(inp.date), wdP = P.weekday[String(wdi)] || { pts: 0, n: 0 };
    const opt = P.engine || {};
    const multi = runs.length > 1;
    const RN = i => multi ? `Run ${i + 1}: ` : '';
    const tl = [];
    let t = 0;
    let LIM = SHIFT; // run blocks may not run into the end-of-day cleaning
    const push = (cat, d, desc, run) => { d = Math.round(d); const dd = Math.min(d, LIM - t); if (dd > 0) { tl.push({ s: t, d: dd, cat, desc, run }); t += dd; } return dd > 0 ? dd : 0; };
    // ---- day-level planned blocks
    const ms = Math.round(pl.morningStart);
    push(C.MS, ms, 'Water circulation, machine start, crew briefing', 0);
    const items = [inp.prev || null].concat(runs);
    const anyProdChange = runs.some((r, i) => { const ct = changeType(items[i], r); return ct === 'product' || ct === 'both'; });
    let deep = 0;
    if (!anyProdChange) { const d = pl.deepProb * pl.deepMin; if (d >= 5) deep = Math.round(pl.deepProb >= 0.5 ? pl.deepMin : d); }
    if (deep) why.push({ t: `Deep cleaning / CIP happens on ${Math.round(pl.deepProb * 100)}% of normal days: ${deep} min expected.`, min: deep });
    const rc = Math.round(pl.routineCleaning);
    const tailB = deep + rc;
    const unpl = Math.round((opt.includeUnplanned ? (pl.unplannedMean || 0) : 0) + (opt.extraStopMin || 0));
    if (unpl) { push(C.UNPL, unpl, 'Allowance: quality checks, utilities, people', 0); why.push({ t: `Allowance for unplanned stops: ${unpl} min.`, min: unpl }); }
    const wdMin = Math.round((wdP.pts || 0) / 100 * SHIFT * (opt.weekdayScale ?? 1));
    if (Math.abs(wdMin) >= 3) why.push({ t: `${WD[wdi]}: historically ${wdP.pts > 0 ? '+' : ''}${wdP.pts} pts stoppage vs an average day (${wdMin > 0 ? '+' : ''}${wdMin} min of machine stops over a full day).`, min: wdMin });
    const seed = hashStr(JSON.stringify([inp.date, sec, runs, inp.prev || null, P.version]));
    const R = rng(seed);
    const meanEv = ev.medianMin * Math.exp(ev.logSd * ev.logSd / 2);
    const shares = ev.catShare; const mcats = MACH_CATS.filter(c => (shares[c] || 0) > 0);
    const pickCat = () => { let x = R() * sum(mcats, c => shares[c]); for (const c of mcats) { x -= shares[c]; if (x <= 0) return c; } return mcats[0]; };
    const hp = P.hourProfile;
    const lastClosing = {}; // product -> {batches, run}
    const out = [];
    let cutWarned = false;
    LIM = SHIFT - tailB;
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i], key = itemKey(r.product, r.size), sk = key + '|' + sec;
      const sp = P.speed[sk], mr = P.machineRate[sk], bpb = P.boxesPerBatch[key].boxes;
      const pname = P.products[r.product];
      const prevItem = items[i];
      // fixed start: wait idle until then (a start earlier than now is ignored)
      if (r.start != null && r.start > t && r.start < LIM) push(C.IDLE, r.start - t, `Waiting for the planned start of run ${i + 1}`, i);
      const runStart = t;
      // changeover from the previous item
      const ct = changeType(prevItem, r);
      let co = 0, cip = 0, after = 0;
      if (ct !== 'none') {
        const c = P.changeover[ct]; co = Math.round(c.changeoverMin); cip = ct === 'size' ? 0 : Math.round(c.cipMin || 0); after = Math.round(c.afterChangeLossMin || 0);
        const from = prevItem.product === r.product ? prevItem.size : `${P.products[prevItem.product] || prevItem.product} ${prevItem.size}`;
        why.push({ t: `${RN(i)}${CHG_LABEL[ct]} from ${from} to ${ct === 'size' ? r.size : pname + ' ' + r.size}${i > 0 ? ` at about ${hhmm(t)}` : ''}: +${co} min changeover${cip ? ` and ${cip} min CIP` : ''}${after ? `, plus ${after} min of extra stops while the line settles` : ''}.`, min: co + cip + after });
        push(C.CO, co, i > 0 ? `Mid-day line change to ${pname} ${r.size}` : `Line change to ${pname} ${r.size}`, i);
        if (cip) push(C.CIP, cip, 'CIP / hot-water circulation for the new product', i);
      }
      // product available: opening balance (or carried from an earlier run of the same product) + batches prepared today
      let opening = r.opening, chained = false;
      if (opening == null) { if (lastClosing[r.product]) { opening = lastClosing[r.product].batches; chained = true; } else opening = 0; }
      if (lastClosing[r.product] && chained) lastClosing[r.product].moved = true;
      const prepared = r.batches;
      const unlimited = prepared == null && !(opening > 0) && !(r.target > 0);
      const avail = unlimited ? Infinity : opening + (prepared || 0);
      const availBoxes = avail * bpb;
      let tgt = r.target > 0 ? Math.min(r.target, availBoxes) : availBoxes;
      if (r.target > 0 && r.target > availBoxes + 0.5) why.push({ t: `${RN(i)}target ${Math.round(r.target)} boxes is more than the product available (${round(avail, 1)} batches ≈ ${Math.round(availBoxes)} boxes); the plan stops when the tank is empty.`, min: 0 });
      // machine stop rate per filling minute (weekday adjusts it)
      const m0 = mr.minPerFillHr / 60, m = Math.max(0.3 * m0, m0 + wdMin / 480);
      // batch preparation: does filling wait for it?
      const pr = P.prep[r.product];
      let prepMin = 0, wait = 0, waitPos = 0, prepMode = 'none';
      const balF = opening * bpb / sp.p50;
      const offline = !(P.heatedProducts || ['RW', 'BW']).includes(r.product);
      if ((prepared || 0) > 0 && offline) { prepMode = 'offline'; }
      else if ((prepared || 0) > 0) {
        prepMin = Math.round(pr.minWhenDone);
        if (opening >= BAL_EPS) {
          if (pr.waitsWithBalance) { wait = prepMin; waitPos = 0; prepMode = 'always-before'; }
          else { wait = Math.max(0, Math.round(prepMin - balF * (1 + m))); waitPos = balF; prepMode = wait > 0 ? 'balance-runs-out' : 'parallel'; }
        } else if (pr.waitsNoBalance) { wait = prepMin; waitPos = 0; prepMode = 'before'; }
        else prepMode = 'parallel';
      }
      // window: until the next fixed start or the end-of-day cleaning
      let wEnd = SHIFT - tailB;
      for (let j = i + 1; j < runs.length; j++) if (runs[j].start != null && runs[j].start > t) { wEnd = Math.min(wEnd, runs[j].start); break; }
      const W = Math.max(0, wEnd - t);
      const capOf = wt => Math.max(0, (W - after - wt) / (1 + m));
      let capF = capOf(wait);
      if (wait > 0 && waitPos >= capF) { wait = 0; capF = capOf(0); if (prepMode === 'balance-runs-out') prepMode = 'parallel'; }
      const needF = tgt / sp.p50;
      const early = needF <= capF;
      const F = Math.max(0, early ? needF : capF);
      const Fi = Math.round(F);
      if (Fi === 0) { wait = 0; }
      const machTot = Math.round(m * F);
      const afterEff = Fi > 0 ? after : 0;
      // prep reasoning
      const ws = q => q == null ? 'no history' : Math.round(q * 100) + '%';
      if (Fi === 0 && !unlimited) why.push({ t: `${RN(i)}no filling time is left in the shift for ${pname} ${r.size}; its ${round(avail, 1)} batches stay in the tank.`, min: 0 });
      else if ((prepared || 0) > 0) {
        if (prepMode === 'always-before') why.push({ t: `${RN(i)}${pname} is heated / filtered before filling even when there is balance (history: line waited on ${ws(pr.waitShareWithBalance)} of days with balance): ${wait} min before filling.`, min: wait });
        else if (prepMode === 'before') why.push({ t: `${RN(i)}no ${pname} balance in the tank, so filling waits for today's batch preparation: ${wait} min.`, min: wait });
        else if (prepMode === 'balance-runs-out') why.push({ t: `${RN(i)}starts on ${round(opening, 1)} batches of balance (about ${Math.round(balF)} min of filling) while today's prep (${prepMin} min) runs in parallel; the balance runs out first, so the line waits ${wait} min.`, min: wait });
        else if (prepMode === 'offline') why.push({ t: `${RN(i)}${pname} batches are prepared off the line in the preparation tanks, so preparation costs no line time.`, min: 0 });
        else if (prepMode === 'parallel') why.push({ t: `${RN(i)}starts on ${round(opening, 1)} batch${round(opening, 1) === 1 ? '' : 'es'} of ${pname} balance; today's prep (${prepMin} min) runs in parallel and costs no line time (history: line waited on ${ws(pr.waitShareWithBalance)} of days with balance).`, min: 0 });
      } else if (opening > 0) why.push({ t: `${RN(i)}no new batches today: fills from ${round(opening, 1)} batches of balance only.`, min: 0 });
      // ---- events in filling-time coordinates
      const events = [];
      if (wait > 0) events.push({ f: Math.min(Fi, Math.round(waitPos)), d: wait, cat: C.PREP, desc: prepMode === 'balance-runs-out' ? 'Balance finished: waiting for the new batch' : `${pname} batch preparation (heating / filtration / mixing)`, fixed: 1 });
      if (afterEff > 0) events.push({ f: Math.min(Fi, wait > 0 && waitPos < 1 ? 0 : 15), d: afterEff, cat: C.AFTER, desc: 'Adjusting the line after the change (caps, labels, filler settings)', fixed: 2 });
      let nEv = machTot > 0 ? Math.max(1, Math.round(machTot / meanEv)) : 0; nEv = Math.min(nEv, machTot);
      const durW = []; for (let k = 0; k < nEv; k++) { const z = Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(2 * Math.PI * R()); durW.push(Math.exp(z * ev.logSd)); }
      const durs = intSplit(machTot, durW);
      const windowLen = Math.max(1, Fi + machTot + afterEff + wait);
      const dens = []; for (let c = 0; c < windowLen; c++) { const h = Math.floor((t + c) / 60) + 7; dens.push(hp[String(h)] ?? 1); }
      const cum = [0]; for (const d of dens) cum.push(cum[cum.length - 1] + d);
      const inv = q => { const x = q * cum[cum.length - 1]; let lo2 = 0, hi2 = dens.length; while (lo2 < hi2) { const mid = (lo2 + hi2) >> 1; if (cum[mid + 1] < x) lo2 = mid + 1; else hi2 = mid; } return lo2; };
      durs.forEach((d, k) => {
        const q = Math.min(0.999, Math.max(0, (k + 0.15 + 0.7 * R()) / Math.max(1, durs.length)));
        const cat = pickCat(); const ex = (ev.examples || {})[cat] || [];
        events.push({ f: Math.min(Fi, Math.max(0, Math.round(inv(q) * Fi / windowLen))), d, cat, desc: ex.length ? ex[Math.floor(R() * ex.length)] : cat + ' stop' });
      });
      events.sort((a, b) => a.f - b.f || (a.fixed || 9) - (b.fixed || 9));
      let fDone = 0;
      const runSegStart = tl.length;
      for (const e of events) {
        const run = Math.max(0, e.f - fDone);
        if (run > 0) { fDone += push(C.RUN, run, 'Filling, capping, labeling, packing', i); }
        push(e.cat, e.d, e.desc, i);
      }
      if (Fi - fDone > 0) push(C.RUN, Fi - fDone, 'Filling, capping, labeling, packing', i);
      // boxes from what was really laid out
      const segs = tl.slice(runSegStart);
      const fillMin = sum(segs.filter(x => x.cat === C.RUN), x => x.d);
      const boxes = early && fillMin >= Fi ? tgt : Math.min(tgt, fillMin * sp.p50);
      const used = boxes / bpb;
      const closing = unlimited ? null : Math.max(0, avail - used);
      lastClosing[r.product] = { batches: closing, run: i, size: r.size };
      const lastBox = segs.filter(x => x.cat === C.RUN).reduce((mx, x) => Math.max(mx, x.s + x.d), runStart);
      const timeLimited = !early && !unlimited;
      if (timeLimited && i < runs.length - 1 && !cutWarned && runs[i + 1].start == null) { cutWarned = true; }
      if (unlimited && i < runs.length - 1 && runs[i + 1].start == null) why.push({ t: `${RN(i)}has no batch limit, so it fills until the end of the shift and the next run cannot start. Enter batches or set a start time for the next run.`, min: 0 });
      out.push({
        i, product: r.product, size: r.size, key, start: runStart, end: t, lastBoxMin: lastBox, finish: hhmm(lastBox), changeType: ct, changeMin: co, cipMin: cip, afterMin: afterEff,
        prepMin, prepWait: wait, prepMode, opening: round(opening, 2), openingChained: chained, prepared, available: unlimited ? null : round(avail, 2), unlimited, target: r.target || null,
        boxesRaw: boxes, fillMin, machineMin: machTot, speedBpm: sp.p50, ratePerHr: round(sp.p50 * 60, 0), machineRate: mr.minPerFillHr, bpb: round(bpb, 1),
        used: round(used, 2), closing: closing == null ? null : round(closing, 2), early, timeLimited, availBoxes: unlimited ? null : availBoxes, tgt,
        speedLevel: sp.level, speedN: sp.n, rateLevel: mr.level,
      });
    }
    // ---- end of day: cleaning right after the last box if the product ran out, else at the end of the shift
    LIM = SHIFT;
    const lastRun = out[out.length - 1];
    if (!(lastRun && lastRun.early) && t < SHIFT - tailB) push(C.IDLE, SHIFT - tailB - t, 'No more product or time planned', runs.length - 1);
    if (deep) push(C.CIP, deep, 'Deep cleaning of the machine area', runs.length - 1);
    push(C.RC, rc, 'Machine and floor cleaning', runs.length - 1);
    if (t < SHIFT) push(C.IDLE, SHIFT - t, lastRun && lastRun.early ? 'All product filled: line idle' : 'Line idle', runs.length - 1);
    const timeline = tl.filter(x => x.d > 0).map(x => ({ ...x, g: GROUP(x.cat) }));
    // ---- totals from the drawn timeline
    const fillMin = sum(timeline.filter(x => x.g === 'run'), x => x.d);
    const idleMin = sum(timeline.filter(x => x.g === 'idle'), x => x.d);
    const stopByCat = {};
    for (const x of timeline) if (x.g !== 'run' && x.g !== 'idle') stopByCat[x.cat] = (stopByCat[x.cat] || 0) + x.d;
    const stopMin = sum(Object.values(stopByCat));
    const workMin = SHIFT - idleMin;
    // ---- ranges per run (calibrated band, capped by the product available / target)
    const lo = P.range ? P.range.lo : 0.75, hi = P.range ? P.range.hi : 1.2;
    for (const o of out) {
      o.boxes = { p10: Math.round(o.boxesRaw * lo), p50: Math.round(o.boxesRaw), p90: Math.round(Math.max(o.boxesRaw, Math.min(o.boxesRaw * hi, o.tgt))) };
      o.closingInfo = o.closing == null ? null : batchInfo(P, o.product, o.size, o.closing);
    }
    // closing balance at the end of the day, per product (last run of each product)
    const closingList = [];
    for (const p of Object.keys(lastClosing)) { const c = lastClosing[p]; if (c.batches == null) continue; const inf = batchInfo(P, p, c.size, c.batches); closingList.push({ product: p, size: c.size, ...inf, batches: round(c.batches, 2) }); }
    const closingBatches = closingList.length || out.every(o => o.closing != null) ? round(sum(closingList, c => c.batches), 2) : null;
    for (const c of closingList) if (c.batches >= 0.05) why.push({ t: `Closing balance ${P.products[c.product]}: ${round(c.batches, 1)} batches ≈ ${Math.round(c.kg).toLocaleString('en-US')} kg (${Math.round(c.litres).toLocaleString('en-US')} L, about ${Math.round(c.boxes)} boxes of ${c.size}) stays in the tank for tomorrow.`, min: 0 });
    const lastBoxAt = out.reduce((mx, o) => Math.max(mx, o.lastBoxMin), 0);
    if (lastRun && lastRun.early && idleMin > 0) why.push({ t: `All product is filled by ${hhmm(lastBoxAt)}; the line has ${idleMin} min spare after cleaning.`, min: 0 });
    for (const o of out) why.push({ t: `${RN(o.i)}${P.products[o.product]} ${o.size}: ${o.ratePerHr} boxes per filling hour (${o.speedLevel}, ${o.speedN} runs), machine stops ${round(o.machineRate, 1)} min per filling hour (${o.rateLevel}).`, min: 0 });
    const boxes = { p10: sum(out, o => o.boxes.p10), p50: sum(out, o => o.boxes.p50), p90: sum(out, o => o.boxes.p90) };
    const first = out[0];
    const prepared = out.some(o => o.prepared != null) ? sum(out, o => o.prepared) : null;
    return {
      date: inp.date, sec, runs: out, prev: inp.prev || null,
      product: first.product, size: first.size, key: first.key,
      changeType: first.changeType, changeLabel: CHG_LABEL[first.changeType], changes: out.filter(o => o.changeType !== 'none').length,
      changeMin: sum(out, o => o.changeMin), cipMin: sum(out, o => o.cipMin), afterMin: sum(out, o => o.afterMin),
      prepMin: sum(out, o => o.prepWait), prepBefore: out.some(o => o.prepWait > 0), prepParallelMin: sum(out, o => o.prepWait ? 0 : o.prepMin),
      morningMin: ms, routineMin: rc, deepMin: deep, unplMin: unpl, weekdayMin: wdMin,
      machineMin: sum(MACH_CATS.concat([C.AFTER]), c => stopByCat[c] || 0),
      stopByCat, stopMin, workMin, idleMin, fillMin, stopPct: workMin > 0 ? stopMin / workMin : 0,
      boxes, target: out.some(o => o.target) ? sum(out, o => o.target) : null,
      bpb: first.bpb, batches: prepared, openingBatches: round(sum(out.filter(o => !o.openingChained), o => o.opening), 2),
      batchesDone: round(sum(out, o => o.used), 2), closingBatches, closing: closingList, batchesLeft: closingBatches ?? 0,
      lastBoxMin: lastBoxAt, finish: hhmm(lastBoxAt), speedBpm: fillMin > 0 ? boxes.p50 / fillMin : first.speedBpm, ratePerHr: round((fillMin > 0 ? boxes.p50 / fillMin : first.speedBpm) * 60, 0),
      machineRate: first.machineRate, timeline, why, modelVersion: P.version, learnedFrom: P.learnedFrom || 0,
    };
  }

  // ---------------------------------------------------------------- compare
  function planSummary(f) {
    return { boxesP10: f.boxes.p10, boxesP50: f.boxes.p50, boxesP90: f.boxes.p90, fillMin: f.fillMin, stopMin: f.stopMin, stopPct: round(f.stopPct, 4),
      workMin: f.workMin, changeType: f.changeType, changes: f.changes, changeMin: f.changeMin, cipMin: f.cipMin, prepMin: f.prepMin, prepBefore: f.prepBefore,
      routineMin: f.routineMin, deepMin: f.deepMin, machineMin: f.machineMin, finish: f.finish, batchesDone: f.batchesDone,
      batchesLeft: f.closingBatches ?? 0, closingBatches: f.closingBatches, openingBatches: f.openingBatches, closing: f.closing,
      stopByCat: f.stopByCat, speedBpm: round(f.speedBpm, 3),
      runs: f.runs.map(o => ({ product: o.product, size: o.size, opening: o.opening, prepared: o.prepared, boxesP10: o.boxes.p10, boxesP50: o.boxes.p50, boxesP90: o.boxes.p90,
        closing: o.closing, start: hhmm(o.start), end: hhmm(o.end), finish: o.finish, changeType: o.changeType, changeMin: o.changeMin + o.cipMin, prepWait: o.prepWait, prepMode: o.prepMode, fillMin: o.fillMin })) };
  }
  function actualMachine(a, P) {
    const pl = P.planned[a.sec]; const tot = actualTotals(a);
    return Math.max(0, (num(a.stopMin) || 0) - (tot.changeoverMin || 0) - (num(a.cleanRoutineMin) ?? pl.routineCleaning) - (num(a.cleanDeepMin) ?? 0) - (num(a.prepMin) ?? 0) - (num(a.startMin) ?? pl.morningStart));
  }
  function prevActual(actuals, a) {
    let best = null;
    for (const x of actuals || []) if (x && x.sec === a.sec && x.date < a.date && (!best || x.date > best.date)) best = x;
    if (!best) return null; const rr = filledRuns(best); const l = rr[rr.length - 1]; return { product: l.product, size: l.size };
  }
  function reforecastInput(P, actuals, a) {
    const prev = actualPrev(a) || prevActual(actuals, a) || (P.lastState && P.lastState[a.sec] ? { product: P.lastState[a.sec].product, size: P.lastState[a.sec].size } : null);
    return { date: a.date, sec: a.sec, prev, runs: filledRuns(a).map(r => ({ product: r.product, size: r.size, batches: r.batches, opening: r.opening ?? (actualRuns(a).findIndex(q => q.product === r.product) === actualRuns(a).indexOf(r) ? 0 : null) })) };
  }
  // one comparable record per day+section
  function rowMetrics(P, plan, a) {
    const pm = plan ? {
      boxes: plan.boxesP50, p10: plan.boxesP10, p90: plan.boxesP90, closing: plan.closingBatches ?? null, opening: plan.openingBatches ?? null, stopMin: plan.stopMin, workMin: plan.workMin,
      stopPct: plan.stopPct, changeMin: (plan.changeMin || 0) + (plan.cipMin || 0), changes: plan.changes ?? (plan.changeType && plan.changeType !== 'none' ? 1 : 0), prepMin: plan.prepMin || 0,
      cleanMin: (plan.routineMin || 0) + (plan.deepMin || 0), machineMin: plan.machineMin || 0, fillMin: plan.fillMin, bph: plan.speedBpm ? plan.speedBpm * 60 : (plan.fillMin ? plan.boxesP50 / plan.fillMin * 60 : null),
      runs: plan.runs || null } : null;
    let am = null;
    if (a) {
      const tot = actualTotals(a), fill = num(a.fillMin), work = num(a.workMin) ?? 600, stop = num(a.stopMin) ?? (fill != null ? Math.max(0, work - fill) : null);
      am = { boxes: tot.boxes, closing: tot.closingBatches, opening: tot.openingBatches, stopMin: stop, workMin: work, stopPct: stop != null && work ? stop / work : null,
        changeMin: tot.changeoverMin, changes: tot.runs.filter((r, i) => changeType(i ? tot.runs[i - 1] : actualPrev(a), r) !== 'none').length,
        prepMin: num(a.prepMin), cleanMin: num(a.cleanRoutineMin) != null || num(a.cleanDeepMin) != null ? (num(a.cleanRoutineMin) || 0) + (num(a.cleanDeepMin) || 0) : null,
        machineMin: stop != null ? actualMachine({ ...a, stopMin: stop }, P) : null, fillMin: fill, bph: fill > 0 ? tot.boxes / fill * 60 : null, runs: tot.runs };
    }
    return { pm, am };
  }
  const COMPONENTS = [
    ['boxes', 'Boxes', ''], ['closing', 'Closing balance', 'batches'], ['stopPct', 'Stoppage', '%'], ['changeMin', 'Changeover & CIP', 'min'], ['prepMin', 'Batch prep wait', 'min'],
    ['cleanMin', 'Cleaning', 'min'], ['machineMin', 'Machine stops', 'min'], ['fillMin', 'Filling time', 'min'], ['bph', 'Filling speed', 'boxes/hr'],
  ];
  function driverOf(pm, am, P) {
    // rank the gaps by their effect in boxes
    const bpm = pm.fillMin > 0 ? pm.boxes / pm.fillMin : 0;
    const c = [];
    const add = (name, pv, av, unit, effBoxes) => { if (pv == null || av == null) return; c.push({ name, plan: round(pv, unit === 'batches' ? 1 : 0), actual: round(av, unit === 'batches' ? 1 : 0), diff: round(pv - av, 1), unit, effect: Math.abs(effBoxes) }); };
    add('Changeover & CIP', pm.changeMin, am.changeMin, 'min', (pm.changeMin - am.changeMin) * bpm);
    add('Batch prep wait', pm.prepMin, am.prepMin, 'min', (pm.prepMin - am.prepMin) * bpm);
    add('Cleaning', pm.cleanMin, am.cleanMin, 'min', (pm.cleanMin - am.cleanMin) * bpm);
    add('Machine stops', pm.machineMin, am.machineMin, 'min', (pm.machineMin - am.machineMin) * bpm);
    if (am.bph != null && pm.bph != null && am.fillMin) add('Filling speed', pm.bph, am.bph, 'boxes/hr', (pm.bph - am.bph) / 60 * am.fillMin);
    if (pm.opening != null && am.opening != null) {
      const bpb0 = pm.runs && pm.runs[0] && P.boxesPerBatch[itemKey(pm.runs[0].product, pm.runs[0].size)] ? P.boxesPerBatch[itemKey(pm.runs[0].product, pm.runs[0].size)].boxes : 100;
      add('Opening balance', pm.opening, am.opening, 'batches', (pm.opening - am.opening) * bpb0);
    }
    if (pm.runs && am.runs) {
      const ps = pm.runs.map(r => r.product + ' ' + r.size).join(' + '), as = am.runs.map(r => r.product + ' ' + r.size).join(' + ');
      if (ps !== as) c.push({ name: 'Run plan changed', plan: ps, actual: as, diff: null, unit: '', effect: Math.abs(pm.boxes - am.boxes) * 0.5 });
    }
    c.sort((x, y) => y.effect - x.effect);
    return { components: c, main: c[0] || null };
  }
  // plans/actuals: arrays of stored docs. Returns rows for dates in [from, to], plus per-section and combined summaries.
  function compare(P, plans, actuals, opts = {}) {
    actuals = (actuals || []).filter(a => a && !a.noRun && !a.excludeFromLearning); // unusual days stay on record but are left out of comparisons
    const from = opts.from || '0000', to = opts.to || '9999';
    const pmap = {}, amap = {};
    for (const p of plans || []) if (p && p.date >= from && p.date <= to) pmap[p.date + '_' + p.sec] = p;
    for (const a of actuals || []) if (a && a.date >= from && a.date <= to) amap[a.date + '_' + a.sec] = a;
    const keys = [...new Set([...Object.keys(pmap), ...Object.keys(amap)])].sort();
    const rows = [];
    for (const k of keys) {
      const p = pmap[k], a = amap[k];
      let plan = p ? p.out : null, source = p ? 'saved' : null, inputs = p ? p.inputs : null;
      if (!plan && a) {
        // no saved plan: re-forecast what was actually run, using only what the model knew before that day
        const L = learn(P, actuals, { before: a.date });
        try { const inp = reforecastInput(P, actuals, a); plan = planSummary(forecast(L.P, inp)); source = 'reforecast'; inputs = inp; } catch (e) { plan = null; }
      }
      const { pm, am } = rowMetrics(P, plan, a);
      const row = { date: k.slice(0, 10), sec: k.slice(11), plan, actual: a || null, source, inputs, pm, am, notes: a ? [a.reasons, a.notes].filter(Boolean).join(' · ') : '' };
      row.items = am ? am.runs.map(r => `${r.product} ${r.size}`).join(' + ') : (pm && pm.runs ? pm.runs.map(r => `${r.product} ${r.size}`).join(' + ') : (inputs ? `${inputs.product} ${inputs.size}` : ''));
      if (pm && am && am.boxes > 0) {
        row.boxesErr = (pm.boxes - am.boxes) / am.boxes;
        row.stopErr = am.stopMin != null ? pm.stopMin - am.stopMin : null;
        row.actStopPct = am.stopPct;
        row.inRange = am.boxes >= pm.p10 && am.boxes <= pm.p90;
        const d = driverOf(pm, am, P); row.components = d.components; row.mainDriver = d.main;
      }
      rows.push(row);
    }
    const summarize = rs => {
      const sc = rs.filter(r => r.boxesErr != null), st = rs.filter(r => r.stopErr != null);
      const comp = {};
      for (const [k] of COMPONENTS) {
        const v = sc.filter(r => r.pm[k] != null && r.am[k] != null);
        comp[k] = v.length ? { n: v.length, plan: mean(v.map(r => r.pm[k])), actual: mean(v.map(r => r.am[k])), bias: mean(v.map(r => r.pm[k] - r.am[k])), mae: mean(v.map(r => Math.abs(r.pm[k] - r.am[k]))) } : null;
      }
      return { days: rs.length, scored: sc.length, mape: sc.length ? mean(sc.map(r => Math.abs(r.boxesErr))) : null, bias: sc.length ? mean(sc.map(r => r.boxesErr)) : null,
        stopMae: st.length ? mean(st.map(r => Math.abs(r.stopErr))) : null, stopBias: st.length ? mean(st.map(r => r.stopErr)) : null,
        inRange: sc.length ? sc.filter(r => r.inRange).length / sc.length : null, plannedBoxes: sum(sc, r => r.pm.boxes), actualBoxes: sum(sc, r => r.am.boxes), components: comp };
    };
    // both sections combined, per day
    const combined = [];
    for (const d of [...new Set(rows.map(r => r.date))].sort()) {
      const rs = rows.filter(r => r.date === d && r.boxesErr != null);
      if (!rs.length) continue;
      const pb = sum(rs, r => r.pm.boxes), ab = sum(rs, r => r.am.boxes);
      combined.push({ date: d, sections: rs.map(r => r.sec), planBoxes: pb, actualBoxes: ab, boxesErr: ab > 0 ? (pb - ab) / ab : null,
        planStopPct: sum(rs, r => r.pm.stopMin) / Math.max(1, sum(rs, r => r.pm.workMin)), actStopPct: rs.every(r => r.am.stopMin != null) ? sum(rs, r => r.am.stopMin) / Math.max(1, sum(rs, r => r.am.workMin)) : null });
    }
    const summary = summarize(rows);
    const bySection = { S1: summarize(rows.filter(r => r.sec === 'S1')), S2: summarize(rows.filter(r => r.sec === 'S2')) };
    const misses = rows.filter(r => r.boxesErr != null).sort((a, b) => Math.abs(b.boxesErr) - Math.abs(a.boxesErr)).slice(0, 3);
    return { rows, summary, bySection, combined, misses };
  }

  // ---------------------------------------------------------------- week vs week
  function topReasons(actuals, n = 5) {
    const agg = {};
    for (const a of actuals) {
      const txt = String(a.reasons || '');
      for (let part of txt.split(/[,;\n·]+|\s+\+\s+/)) {
        part = part.trim(); if (!part) continue;
        const mm = /(\d+(?:\.\d+)?)\s*(?:min|mins|minutes|m)\b/i.exec(part) || /(\d+(?:\.\d+)?)\s*$/.exec(part);
        const mins = mm ? +mm[1] : 0;
        const label = part.replace(/\(?\d+(?:\.\d+)?\s*(?:min|mins|minutes|m)?\)?/gi, '').replace(/[-–:]+\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (label.length < 3) continue;
        const k = label; agg[k] = agg[k] || { reason: label, count: 0, minutes: 0 }; agg[k].count++; agg[k].minutes += mins;
      }
    }
    return Object.values(agg).sort((a, b) => b.minutes - a.minutes || b.count - a.count).slice(0, n);
  }
  function weekAgg(P, actuals, from, to, sec) {
    const list = actuals.filter(a => a.date >= from && a.date <= to && (!sec || a.sec === sec));
    if (!list.length) return null;
    const ms = list.map(a => rowMetrics(P, null, a).am);
    const fill = sum(ms, m => m.fillMin), work = sum(ms, m => m.workMin), stop = sum(ms, m => m.stopMin);
    // balance carried out of the week: closing balance on the last day of each section
    let closing = 0, closingKnown = false;
    for (const s of sec ? [sec] : ['S1', 'S2']) {
      const l = list.filter(a => a.sec === s).sort((a, b) => a.date < b.date ? 1 : -1)[0];
      if (l) { const c = actualTotals(l).closingBatches; if (c != null) { closing += c; closingKnown = true; } }
    }
    return { from, to, days: new Set(list.map(a => a.date)).size, sectionDays: list.length, boxes: sum(ms, m => m.boxes), fillMin: fill, stopMin: stop, workMin: work,
      stopPct: work ? stop / work : null, bph: fill > 0 ? sum(ms, m => m.boxes) / fill * 60 : null, boxesPerDay: sum(ms, m => m.boxes) / list.length,
      changes: sum(ms, m => m.changes), changeMin: ms.some(m => m.changeMin != null) ? sum(ms, m => m.changeMin) : null,
      prepMin: ms.some(m => m.prepMin != null) ? sum(ms, m => m.prepMin) : null, cleanMin: ms.some(m => m.cleanMin != null) ? sum(ms, m => m.cleanMin) : null,
      machineMin: sum(ms, m => m.machineMin), closingBalance: closingKnown ? round(closing, 2) : null, reasons: topReasons(list) };
  }
  function weekly(P, plans, actuals, end, opts = {}) {
    actuals = (actuals || []).filter(a => a && !a.noRun && !a.excludeFromLearning); // unusual days stay on record but are left out of comparisons
    const nWeeks = opts.weeks || 6;
    const weeks = [];
    for (let k = 0; k < nWeeks; k++) {
      const to = addDays(end, -7 * k), from = addDays(to, -6);
      const cmp = compare(P, plans, actuals, { from, to });
      weeks.push({ from, to, S1: weekAgg(P, actuals, from, to, 'S1'), S2: weekAgg(P, actuals, from, to, 'S2'), all: weekAgg(P, actuals, from, to, null),
        accuracy: { all: cmp.summary, S1: cmp.bySection.S1, S2: cmp.bySection.S2 } });
    }
    const avgOf = (scope, key, ws) => { const v = ws.map(w => w[scope] && w[scope][key]).filter(x => x != null && isFinite(x)); return v.length ? mean(v) : null; };
    const metrics = ['boxes', 'boxesPerDay', 'stopPct', 'bph', 'changes', 'changeMin', 'prepMin', 'machineMin', 'closingBalance', 'sectionDays'];
    const table = {};
    for (const scope of ['S1', 'S2', 'all']) {
      table[scope] = {};
      for (const k of metrics) table[scope][k] = { thisWeek: weeks[0][scope] ? weeks[0][scope][k] : null, lastWeek: weeks[1] && weeks[1][scope] ? weeks[1][scope][k] : null, avg4: avgOf(scope, k, weeks.slice(1, 5)) };
    }
    const acc = weeks.map(w => ({ from: w.from, to: w.to, mape: w.accuracy.all.mape, bias: w.accuracy.all.bias, stopMae: w.accuracy.all.stopMae, n: w.accuracy.all.scored,
      changeBias: w.accuracy.all.components.changeMin ? w.accuracy.all.components.changeMin.bias : null, inRange: w.accuracy.all.inRange }));
    return { end, weeks, table, accuracy: acc, summary: weeklySummary(weeks, table, acc) };
  }
  function pctTxt(x) { return Math.round(x * 100) + '%'; }
  function weeklySummary(weeks, table, acc) {
    const s = [];
    const w0 = weeks[0], w1 = weeks[1];
    if (!w0.all) { s.push(`No actuals were entered for ${w0.from} to ${w0.to}.`); return s; }
    for (const [scope, name] of [['S1', 'Section 1'], ['S2', 'Section 2']]) {
      const a = w0[scope], b = w1 && w1[scope];
      if (!a) { s.push(`${name}: no actuals this week.`); continue; }
      let t = `${name} made ${Math.round(a.boxes).toLocaleString('en-US')} boxes in ${a.sectionDays} day${a.sectionDays === 1 ? '' : 's'}`;
      if (b && b.boxesPerDay > 0) { const ch = a.boxesPerDay / b.boxesPerDay - 1; t += `, ${Math.abs(ch) < 0.005 ? 'the same per day as' : `${pctTxt(Math.abs(ch))} ${ch > 0 ? 'more' : 'fewer'} boxes per day than`} last week`; }
      if (a.stopPct != null) t += b && b.stopPct != null ? `; stoppage ${a.stopPct < b.stopPct - 0.005 ? 'fell' : a.stopPct > b.stopPct + 0.005 ? 'rose' : 'held'} ${a.stopPct < b.stopPct - 0.005 || a.stopPct > b.stopPct + 0.005 ? `from ${pctTxt(b.stopPct)} to ${pctTxt(a.stopPct)}` : `at ${pctTxt(a.stopPct)}`}` : `; stoppage ${pctTxt(a.stopPct)}`;
      if (a.bph != null) t += `; ${Math.round(a.bph)} boxes per filling hour`;
      s.push(t + '.');
    }
    const all = table.all;
    if (all.changes.thisWeek != null) s.push(`There ${all.changes.thisWeek === 1 ? 'was 1 changeover' : `were ${all.changes.thisWeek} changeovers`} this week${all.changeMin.thisWeek != null ? ` (${Math.round(all.changeMin.thisWeek)} min)` : ''}${all.changes.lastWeek != null ? ` vs ${all.changes.lastWeek} last week` : ''}.`);
    if (all.closingBalance.thisWeek != null) s.push(`Balance carried out of the week: ${round(all.closingBalance.thisWeek, 1)} batches in the tanks.`);
    const a0 = acc[0], prevAcc = acc.slice(1, 5).filter(x => x.mape != null);
    if (a0.mape != null) {
      let t = `The forecast missed boxes by ${pctTxt(a0.mape)} on average (${a0.bias > 0 ? 'too high' : 'too low'} by ${pctTxt(Math.abs(a0.bias))})`;
      if (prevAcc.length) { const pm = mean(prevAcc.map(x => x.mape)); t += a0.mape < pm - 0.01 ? `, better than the ${pctTxt(pm)} of the previous weeks` : a0.mape > pm + 0.01 ? `, worse than the ${pctTxt(pm)} of the previous weeks` : ', about the same as the previous weeks'; }
      s.push(t + '.');
      if (a0.changeBias != null && Math.abs(a0.changeBias) >= 5) s.push(`The model ${a0.changeBias > 0 ? 'over' : 'under'}-forecast changeovers by ${Math.round(Math.abs(a0.changeBias))} min per day on average.`);
    } else s.push('No day this week has both a forecast and an actual yet, so forecast accuracy cannot be scored.');
    const r = w0.all.reasons;
    if (r.length) s.push(`Top stop reasons entered: ${r.slice(0, 3).map(x => x.reason + (x.minutes ? ` (${Math.round(x.minutes)} min)` : '')).join(', ')}.`);
    return s;
  }

  // ---------------------------------------------------------------- CSV
  const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const line = a => a.map(esc).join(',');
  function csv(rows) {
    const head = ['date', 'section', 'items', 'forecast_source', 'forecast_boxes_p50', 'forecast_boxes_p10', 'forecast_boxes_p90', 'actual_boxes', 'boxes_error_pct',
      'forecast_closing_batches', 'actual_closing_batches', 'forecast_stop_min', 'actual_stop_min', 'forecast_stop_pct', 'actual_stop_pct', 'forecast_changeover_min', 'actual_changeover_min',
      'forecast_prep_min', 'actual_prep_min', 'forecast_clean_min', 'actual_clean_min', 'forecast_machine_min', 'actual_machine_min', 'forecast_boxes_per_hr', 'actual_boxes_per_hr',
      'forecast_last_box', 'actual_last_box', 'main_driver', 'notes'];
    const out = [line(head)];
    for (const r of rows) {
      const p = r.pm || {}, a = r.am || {}, act = r.actual || {};
      const f1 = x => x == null ? '' : round(x, 1);
      out.push(line([r.date, r.sec, r.items, r.source, p.boxes, p.p10, p.p90, a.boxes, r.boxesErr != null ? round(r.boxesErr * 100, 1) : '',
        f1(p.closing), f1(a.closing), p.stopMin, a.stopMin, p.stopPct != null ? round(p.stopPct * 100, 1) : '', a.stopPct != null ? round(a.stopPct * 100, 1) : '',
        p.changeMin, a.changeMin, p.prepMin, a.prepMin, p.cleanMin, a.cleanMin, p.machineMin != null ? Math.round(p.machineMin) : '', a.machineMin != null ? Math.round(a.machineMin) : '',
        p.bph != null ? Math.round(p.bph) : '', a.bph != null ? Math.round(a.bph) : '', r.plan ? r.plan.finish : '', act.lastBox || '', r.mainDriver ? r.mainDriver.name : '', r.notes]));
    }
    return out.join('\n');
  }
  function reportCsv(cmp, wk) {
    const out = [];
    out.push(line(['ATIC Line Planner weekly report', `${wk ? wk.weeks[0].from + ' to ' + wk.weeks[0].to : ''}`]));
    if (wk) { out.push(''); out.push(line(['Summary'])); for (const s of wk.summary) out.push(line([s])); }
    out.push(''); out.push(line(['Plan vs actual by day and section']));
    out.push(csv(cmp.rows));
    out.push(''); out.push(line(['Plan vs actual summary', 'scope', 'days_scored', 'boxes_mape_pct', 'boxes_bias_pct', 'stop_mae_min', 'in_range_pct', 'forecast_boxes', 'actual_boxes']));
    for (const [n, s] of [['Section 1', cmp.bySection.S1], ['Section 2', cmp.bySection.S2], ['Both sections', cmp.summary]])
      out.push(line(['', n, s.scored, s.mape != null ? round(s.mape * 100, 1) : '', s.bias != null ? round(s.bias * 100, 1) : '', s.stopMae != null ? round(s.stopMae, 1) : '', s.inRange != null ? round(s.inRange * 100, 0) : '', s.plannedBoxes, s.actualBoxes]));
    if (wk) {
      out.push(''); out.push(line(['Week vs week (actuals)', 'scope', 'metric', 'this_week', 'last_week', 'avg_previous_4_weeks']));
      const lab = { boxes: 'boxes', boxesPerDay: 'boxes per section-day', stopPct: 'stoppage %', bph: 'boxes per filling hour', changes: 'changeovers', changeMin: 'changeover min', prepMin: 'prep wait min', machineMin: 'machine stop min', closingBalance: 'closing balance (batches)', sectionDays: 'section-days logged' };
      for (const scope of ['S1', 'S2', 'all']) for (const k in wk.table[scope]) {
        const v = wk.table[scope][k], f = x => x == null ? '' : k === 'stopPct' ? round(x * 100, 1) : round(x, 1);
        out.push(line(['', scope === 'all' ? 'Both sections' : scope === 'S1' ? 'Section 1' : 'Section 2', lab[k] || k, f(v.thisWeek), f(v.lastWeek), f(v.avg4)]));
      }
      out.push(''); out.push(line(['Forecast accuracy by week', 'from', 'to', 'days_scored', 'boxes_mape_pct', 'boxes_bias_pct', 'stop_mae_min', 'changeover_bias_min']));
      for (const a of wk.accuracy) out.push(line(['', a.from, a.to, a.n, a.mape != null ? round(a.mape * 100, 1) : '', a.bias != null ? round(a.bias * 100, 1) : '', a.stopMae != null ? round(a.stopMae, 1) : '', a.changeBias != null ? round(a.changeBias, 1) : '']));
      out.push(''); out.push(line(['Top stop reasons this week', 'reason', 'times', 'minutes']));
      for (const r of (wk.weeks[0].all ? wk.weeks[0].all.reasons : [])) out.push(line(['', r.reason, r.count, r.minutes]));
    }
    return out.join('\n');
  }
  return { filledRuns, SHIFT, C, GROUP, MACH_CATS, CHG_LABEL, WD, COMPONENTS, hhmm, parseHHMM, itemKey, changeType, weekdayIdx, addDays, hashStr, rng, intSplit, batchInfo,
    inputRuns, actualRuns, actualTotals, learn, forecast, planSummary, compare, weekly, topReasons, csv, reportCsv, actualMachine, reforecastInput };
})();
// ==ENGINE END==
window.ATIC_LINE_ENGINE = ENGINE;
