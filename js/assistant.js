/* ATIC assistant: a chat on every page. The question goes with today's numbers (from the same calculations the pages use)
   to the Supabase function "ask", which asks Claude and answers in seconds. */
(function () {
  var A = window.ATIC; if (!A) return;
  var H = [], busy = false, ctxCache = null, ctxAt = 0;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function n(x) { return x == null || isNaN(x) ? '–' : (Math.round(x * 1000) / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 }); }
  function iso(d) { return new Date(d).toISOString().slice(0, 10); }
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }

  /* ---------- the numbers sent with each question ---------- */
  async function context() {
    if (ctxCache && Date.now() - ctxAt < 60000) return ctxCache;
    if (!window.ATICEngine) await loadScript('js/materials-engine.js');
    var E = window.ATICEngine, today = iso(Date.now()), fc, docs, acts = [];
    var r0 = await Promise.all([A.docs.loadAll(), A.planner.list('actuals').catch(function () { return []; })]);
    docs = r0[0].data; acts = r0[1].map(function (x) { return x.data; }).filter(Boolean);
    if (typeof window.run === 'function' && window.run.cache) fc = window.run(); /* on Raw Materials: exactly what the page shows */
    else {
      var days = {}, secs = {};
      acts.forEach(function (a) { if (!a.date || !a.sec) return; var sc = a.sec === 'S1' ? 'SEC-1' : 'SEC-2'; (secs[a.date] = secs[a.date] || {})[sc] = 1; ((a.runs && a.runs.length) ? a.runs : [{ product: a.product, batches: a.batches }]).forEach(function (q) { var b = Number(q.batches) || 0; if (b > 0 && q.product) { var k = q.product + '|' + sc; (days[a.date] = days[a.date] || {})[k] = (days[a.date][k] || 0) + b; } }); });
      fc = E.forecast(docs.baseline, { materials: docs.materials, recipes: docs.recipes, stock: docs.stock, plan: docs.plan, orders: (docs.orders && docs.orders.items) || [], settings: docs.settings, actualDays: days, actualSections: secs }, today);
    }
    var m = fc.model, L = [];
    L.push('Today: ' + today + ' · lot ' + (A.lot ? A.lot(today) : ''));
    L.push('\nMATERIALS (unit · counted (date) · est. now · use per working day · runs out without deliveries / with deliveries · order by · status · open deliveries):');
    fc.results.filter(function (r) { return r.active || r.stockNow; }).forEach(function (r) {
      var cum = 0, act = null; (r.daily || []).forEach(function (x) { if (x.date < today) return; cum += Number(x.received) || 0; if (act === null && r.weekly > 0 && x.closing - cum <= 0) act = x.date; });
      var y = r.stockNow; (r.daily || []).forEach(function (x) { if (x.date < today && r.weeks && x.date >= r.weeks[0].start) y = x.closing; });
      var mat = m.materials.filter(function (q) { return q.id === r.id; })[0] || {};
      L.push('- ' + r.name + ' [' + r.unit + (mat.recipeFactor > 1 ? ', 1 ' + r.unit + ' = ' + mat.recipeFactor + ' ' + mat.recipeUnit : '') + '] counted ' + n(r.stockCounted) + ' (' + (m.stock[r.id] || {}).asOf + ') · now ≈ ' + n(y) + ' · ' + n(r.perDay) + '/day · runs out ' + (act || 'not in 26 wk') + ' / ' + (r.runOut || 'not in 26 wk') + ' · order by ' + (r.orderBy || '–') + ' · ' + r.status +
        (r.openOrders && r.openOrders.length ? ' · coming: ' + r.openOrders.map(function (o) { return '+' + n(o.qty) + ' on ' + o.eta; }).join(', ') : ''));
    });
    var pl = docs.plan || {};
    if (pl.runs && pl.runs.length) {
      L.push('\nFACTORY PLAN ' + (pl.from || '') + ' → ' + (pl.to || '') + ' (product size · dates · line · batches/day or cartons):');
      pl.runs.forEach(function (r) { L.push('- ' + r.product + ' ' + (r.size || '') + ' · ' + r.from + ' → ' + r.to + ' · ' + (r.lines === 'both' ? 'both lines' : r.lines === 'SEC-1' ? 'Line 1' : 'Line 2') + ' · ' + (r.batches > 0 ? r.batches + ' bt/day' : 'estimate') + (r.cartons ? ' · ' + r.cartons + ' ctn' : '') + (r.dayCartons ? ' · ctn per day ' + JSON.stringify(r.dayCartons) : '')); });
      if (pl.lineDays) { var dk = Object.keys(pl.lineDays).sort().filter(function (d) { return d >= today; }).slice(0, 21); L.push('Batches per day (next 3 weeks): ' + dk.map(function (d) { return d.slice(5) + ' ' + ['SEC-1', 'SEC-2'].map(function (s) { return ((pl.lineDays[d] || {})[s] || []).map(function (x) { return (s === 'SEC-1' ? 'L1 ' : 'L2 ') + x.product + ' ' + (x.size || '') + '×' + x.batches; }).join('+'); }).filter(Boolean).join(', '); }).join(' | ')); }
    } else L.push('\nFACTORY PLAN: none saved.');
    L.push('\nRECIPES per batch (material: Section 1 / Section 2, in the material\'s unit):');
    Object.keys(m.recipes || {}).forEach(function (p) { var r = m.recipes[p] || {}, ks = {}; ['SEC-1', 'SEC-2'].forEach(function (s) { Object.keys(r[s] || {}).forEach(function (k) { if (Number(r[s][k]) > 0) ks[k] = 1; }); }); var t = Object.keys(ks).map(function (k) { var mm = m.materials.filter(function (q) { return q.id === k; })[0]; return (mm ? mm.name : k) + ' ' + n((r['SEC-1'] || {})[k]) + '/' + n((r['SEC-2'] || {})[k]); }); if (t.length) L.push('- ' + p + ': ' + t.join(', ')); });
    var recent = acts.filter(function (a) { return a.date && a.date >= iso(Date.now() - 21 * 864e5); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (recent.length) { L.push('\nLINE PLANNER ACTUALS (last 3 weeks: date · line · runs product size batches boxes):'); recent.forEach(function (a) { L.push('- ' + a.date + ' ' + a.sec + ': ' + ((a.runs && a.runs.length) ? a.runs : [a]).map(function (q) { return q.product + ' ' + (q.size || '') + ' ×' + (q.batches == null ? '?' : q.batches) + (q.boxes ? ' (' + q.boxes + ' boxes)' : ''); }).join(' + ') + (a.lot ? ' · lot ' + a.lot : '')); }); }
    var ord = ((docs.orders && docs.orders.items) || []).filter(function (o) { return o.status === 'open' || o.status === 'partial'; });
    if (ord.length) { L.push('\nOPEN PURCHASE ORDERS:'); ord.forEach(function (o) { L.push('- ' + o.material + ' ' + n(o.qty) + ' ' + (o.unit || '') + ' due ' + o.eta + ' · ' + (o.ref || '') + ((o.receipts || []).length ? ' · received ' + n(o.receipts.reduce(function (s, x) { return s + (+x.qty || 0); }, 0)) : '')); }); }
    ctxCache = L.join('\n'); ctxAt = Date.now(); return ctxCache;
  }

  /* ---------- the chat window ---------- */
  var css = '.asst-btn{position:fixed;left:18px;bottom:18px;z-index:60;border:0;border-radius:999px;padding:12px 18px;font:600 15px var(--f-body);color:#fff;background:linear-gradient(135deg,#0f4c3a,#2a7a5b);box-shadow:0 10px 24px rgba(8,42,32,.35);cursor:pointer}' +
    '.asst{position:fixed;left:18px;bottom:76px;z-index:61;width:min(420px,calc(100vw - 36px));height:min(560px,calc(100vh - 110px));background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden}' +
    '.asst header{padding:12px 14px;background:linear-gradient(135deg,#0f4c3a,#2a7a5b);color:#fff;display:flex;justify-content:space-between;align-items:center}.asst header b{font:600 15px var(--f-display)}.asst header button{background:none;border:0;color:#fff;font-size:20px;cursor:pointer}' +
    '.asst .log{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px}.asst .m{max-width:88%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap}.asst .u{align-self:flex-end;background:var(--brand);color:var(--brand-ink)}.asst .a{align-self:flex-start;background:var(--surface-2)}.asst .e{align-self:flex-start;background:var(--red-soft);color:var(--red)}' +
    '.asst .sug{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px}.asst .sug button{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:5px 10px;font-size:12.5px;cursor:pointer;color:var(--ink)}' +
    '.asst form{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line)}.asst input{flex:1;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--ink);font:15px var(--f-body)}.asst form button{border:0;border-radius:12px;padding:0 16px;background:var(--brand);color:var(--brand-ink);font-weight:600;cursor:pointer}' +
    '@media print{.asst,.asst-btn{display:none!important}}';
  var SUG = ['What should I order now?', 'When does salt run out?', 'How much sugar do we have now?', 'What runs on Line 2 next week?', 'Raw materials for tomorrow?'];
  function mount() {
    if (document.querySelector('.asst-btn')) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var b = document.createElement('button'); b.className = 'asst-btn'; b.type = 'button'; b.innerHTML = '✦ Ask ATIC'; b.title = 'Ask about stock, forecast, plan, recipes'; document.body.appendChild(b);
    var w = null;
    b.onclick = function () {
      if (w) { w.remove(); w = null; return; }
      w = document.createElement('div'); w.className = 'asst'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', 'Ask ATIC');
      w.innerHTML = '<header><b>✦ Ask ATIC</b><button type="button" aria-label="Close">×</button></header><div class="log" id="asLog"></div>' +
        (H.length ? '' : '<div class="sug">' + SUG.map(function (q) { return '<button type="button">' + esc(q) + '</button>'; }).join('') + '</div>') +
        '<form><input id="asIn" placeholder="Ask about stock, forecast, plan…" autocomplete="off"><button>Send</button></form>';
      document.body.appendChild(w);
      var log = w.querySelector('#asLog');
      if (!H.length) log.innerHTML = '<div class="m a">Hi ' + esc(((A.profile || {}).full_name || '').split(' ')[0]) + '! Ask me anything about the stock, run-out dates, orders, the factory plan, recipes or the batches made. I answer from today\'s numbers.</div>';
      H.forEach(function (m) { log.insertAdjacentHTML('beforeend', '<div class="m ' + (m.role === 'user' ? 'u' : 'a') + '">' + esc(m.content) + '</div>'); });
      log.scrollTop = 1e9;
      w.querySelector('header button').onclick = function () { w.remove(); w = null; };
      w.querySelectorAll('.sug button').forEach(function (s) { s.onclick = function () { ask(s.textContent); }; });
      var f = w.querySelector('form'), inp = w.querySelector('#asIn'); inp.focus();
      f.onsubmit = function (e) { e.preventDefault(); var q = inp.value.trim(); if (q) { inp.value = ''; ask(q); } };
      async function ask(q) {
        if (busy) return; busy = true; var sg = w.querySelector('.sug'); if (sg) sg.remove();
        log.insertAdjacentHTML('beforeend', '<div class="m u">' + esc(q) + '</div><div class="m a" id="asWait">…</div>'); log.scrollTop = 1e9;
        try {
          var ctx = await context();
          var r = await A.sb.functions.invoke('ask', { body: { question: q, context: ctx, history: H.slice(-6) } });
          var wt = w.querySelector('#asWait'); if (wt) wt.remove();
          var err = r.error ? ((r.error.context && r.error.context.status === 404) || /Failed to send/i.test(r.error.message || '') ? 'The assistant is not switched on yet (the "ask" function is not set up in Supabase).' : (r.data && r.data.error) || r.error.message) : (r.data && r.data.error);
          if (err) { log.insertAdjacentHTML('beforeend', '<div class="m e">' + esc(err) + '</div>'); }
          else { var ans = (r.data && r.data.answer) || '(no answer)'; H.push({ role: 'user', content: q }, { role: 'assistant', content: ans }); log.insertAdjacentHTML('beforeend', '<div class="m a">' + esc(ans) + '</div>'); }
        } catch (e) { var wt2 = w.querySelector('#asWait'); if (wt2) wt2.remove(); log.insertAdjacentHTML('beforeend', '<div class="m e">' + esc(e.message || String(e)) + '</div>'); }
        busy = false; log.scrollTop = 1e9;
      }
    };
  }
  (function wait() { if (A.profile) mount(); else setTimeout(wait, 400); })();
})();
