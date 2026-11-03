/* More than one recipe per product (e.g. two GM recipes).
   Saved in the "recipes" doc as  variants: { GM: { v1: { name: 'GM recipe 2', 'SEC-1': {...}, 'SEC-2': {...} } } }  and  names: { GM: 'Standard' }.
   The Recipes page shows a chooser on each product: pick which recipe to see and edit, add a new one (a copy of the one shown),
   rename or delete it. The factory plan and the Preparation page let you choose which recipe a run uses. */
(function () {
  S.recVar = S.recVar || {};
  function recDoc() { return S.saved.recipes || {}; }
  function variants() { return JSON.parse(JSON.stringify(recDoc().variants || {})); }
  function names() { return Object.assign({}, recDoc().names || {}); }

  /* every save of the recipes doc keeps the extra recipes and names (imports included) */
  var _save = saveDoc;
  saveDoc = function (name, data) {
    if (name === 'recipes' && data) {
      data = Object.assign({}, data);
      if (!('variants' in data)) data.variants = variants();
      if (!('names' in data)) data.names = names();
    }
    return _save(name, data);
  };

  /* show the chosen recipe in the editor by swapping it in while the page is drawn */
  function swapIn(fc) {
    var m = fc.model, V = m.variants || {}, raw = (S.saved.recipes = S.saved.recipes || {}), rr = (raw.recipes = raw.recipes || {}), back = [];
    Object.keys(S.recVar).forEach(function (p) {
      var id = S.recVar[p], v = id && V[p] && V[p][id], given = id && (recDoc().variants || {})[p] && recDoc().variants[p][id];
      if (!v) { delete S.recVar[p]; return; }
      back.push({ p: p, m: m.recipes[p], r: rr[p], had: p in rr });
      m.recipes[p] = { 'SEC-1': Object.assign({}, v['SEC-1']), 'SEC-2': Object.assign({}, v['SEC-2']) };
      rr[p] = { 'SEC-1': Object.assign({}, (given || {})['SEC-1']), 'SEC-2': Object.assign({}, (given || {})['SEC-2']) };
    });
    return function () { back.forEach(function (b) { m.recipes[b.p] = b.m; if (b.had) rr[b.p] = b.r; else delete rr[b.p]; }); };
  }
  function chips(p) {
    var list = recipeList(p), cur = S.recVar[p] || '';
    return '<div class="recv" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:-2px 0 10px">' +
      list.map(function (x) { return '<button type="button" class="btn' + (x.id === cur ? ' primary' : '') + '" data-rv="' + p + '" data-id="' + esc(x.id) + '" style="padding:5px 12px;font-size:13px">' + esc(x.name) + '</button>'; }).join('') +
      '<button type="button" class="btn ghost" data-rnew="' + p + '" style="padding:5px 12px;font-size:13px">+ New recipe</button>' +
      '<button type="button" class="btn ghost" data-rren="' + p + '" style="padding:5px 10px;font-size:13px" title="Rename the recipe shown">Rename</button>' +
      (cur ? '<button type="button" class="btn ghost" data-rdel="' + p + '" style="padding:5px 10px;font-size:13px;color:var(--red)">Delete</button>' : '') + '</div>';
  }

  var _v = vRecipes;
  vRecipes = function (fc) {
    var undo = swapIn(fc), h;
    try { h = _v(fc); } finally { undo(); }
    fc.model.products.forEach(function (p) {
      var t = '<h3 style="font-size:17px">' + PN[p.id] + '</h3>', i = h.indexOf(t); if (i < 0) return;
      var end = h.indexOf('</div>', i) + 6; /* after the panel's title row */
      var cur = S.recVar[p.id] || '';
      h = h.slice(0, i) + '<h3 style="font-size:17px">' + PN[p.id] + (recipeList(p.id).length > 1 ? ' <span class="small muted" style="font-weight:500">· ' + esc(recipeName(p.id, cur)) + '</span>' : '') + '</h3>' + h.slice(i + t.length, end) + chips(p.id) + h.slice(end);
    });
    return h;
  };

  var _a = after.recipes;
  after.recipes = function (fc) {
    _a(fc);
    var keep = function () { return { recipes: (recDoc().recipes) || {}, variants: variants(), names: names(), updatedAt: new Date().toISOString() }; };
    document.querySelectorAll('[data-rv]').forEach(function (b) { b.onclick = function () { S.recVar[b.dataset.rv] = b.dataset.id || ''; if (!S.recVar[b.dataset.rv]) delete S.recVar[b.dataset.rv]; S.recAdd = {}; render(); }; });
    document.querySelectorAll('[data-rnew]').forEach(function (b) { b.onclick = function () {
      var p = b.dataset.rnew, n = recipeList(p).length + 1, name = window.prompt('Name of the new ' + PN[p] + ' recipe (it starts as a copy of the one shown):', p + ' recipe ' + n);
      if (!name || !name.trim()) return;
      var src = fc.model.recipes[p] || {}, cur = S.recVar[p], V0 = fc.model.variants || {};
      if (cur && V0[p] && V0[p][cur]) src = V0[p][cur];
      var id = 'v' + Date.now().toString(36), d = keep();
      (d.variants[p] = d.variants[p] || {})[id] = { name: name.trim(), 'SEC-1': Object.assign({}, src['SEC-1']), 'SEC-2': Object.assign({}, src['SEC-2']), created: TODAY };
      S.recVar[p] = id; saveDoc('recipes', d);
    }; });
    document.querySelectorAll('[data-rren]').forEach(function (b) { b.onclick = function () {
      var p = b.dataset.rren, cur = S.recVar[p] || '', name = window.prompt('New name for this recipe:', recipeName(p, cur));
      if (!name || !name.trim()) return; var d = keep();
      if (cur) d.variants[p][cur].name = name.trim(); else d.names[p] = name.trim();
      saveDoc('recipes', d);
    }; });
    document.querySelectorAll('[data-rdel]').forEach(function (b) { b.onclick = function () {
      var p = b.dataset.rdel, cur = S.recVar[p]; if (!cur) return;
      if (!window.confirm('Delete the recipe "' + recipeName(p, cur) + '"? Runs that use it go back to ' + recipeName(p, '') + '.')) return;
      var d = keep(); delete d.variants[p][cur]; delete S.recVar[p]; saveDoc('recipes', d);
    }; });
    /* Save recipes: the products showing an extra recipe save into that recipe, the rest into the main recipes */
    var sv = $('#saveRec');
    if (sv) sv.onclick = function () {
      var undo = swapIn(fc), rec;
      var orig = JSON.parse(JSON.stringify(fc.model.recipes));
      try { rec = collectRec(fc); } finally { undo(); }
      var d = keep(); d.recipes = rec;
      Object.keys(S.recVar).forEach(function (p) {
        var id = S.recVar[p]; if (!id || !d.variants[p] || !d.variants[p][id]) return;
        d.variants[p][id]['SEC-1'] = rec[p]['SEC-1']; d.variants[p][id]['SEC-2'] = rec[p]['SEC-2'];
        d.recipes[p] = JSON.parse(JSON.stringify(fc.model.recipes[p])); /* the main recipe stays as it was */
      });
      void orig; S.recAdd = {}; saveDoc('recipes', d);
    };
  };
})();

/* an opening stock (set as "Opening <day>") is saved as the count at the end of the day before: show it as the opening */
(function () {
  var _c = card;
  card = function (r) {
    var h = _c(r), st = (S.saved.stock && S.saved.stock.items && S.saved.stock.items[r.id]) || null;
    if (st && /^Opening/i.test(st.source || '') && st.asOf) h = h.replace('>Counted ' + U.nice(st.asOf) + '<', '>Opening ' + U.nice(U.addDays(st.asOf, 1)) + '<').replace('Inventory ' + U.nice(st.asOf) + ':', 'Opening ' + U.nice(U.addDays(st.asOf, 1)) + ':');
    return h;
  };
})();

/* ---------- run-out: the ACTUAL date (no deliveries counted) and, in brackets, the EXPECTED date with the deliveries still to come ---------- */
function runOutBoth(r) {
  var cum = 0, act = null;
  (r.daily || []).forEach(function (x) { if (x.date < TODAY) return; cum += Number(x.received) || 0; if (act === null && r.weekly > 0 && x.closing - cum <= 0) act = x.date; });
  var due = (r.openOrders || []).filter(function (o) { return o.eta >= TODAY && o.qty > 0; }).sort(function (a, b) { return a.eta < b.eta ? -1 : 1; });
  return { actual: act, expected: r.runOut, orders: due };
}
function runOutParts(r) {
  var b = runOutBoth(r), unit = r.unit || '', many = b.orders.length > 1;
  var a = b.actual ? U.nice(b.actual) : 'not in 26 weeks', e = b.expected ? U.nice(b.expected) : 'not in 26 weeks';
  var extra = [];
  if (b.orders.length && a !== e) extra.push('<span class="ro2">(' + e + ' if the deliver' + (many ? 'ies arrive' : 'y arrives') + ')</span>');
  b.orders.forEach(function (o) { extra.push('<span class="ro3">Delivery: +' + fmtN(o.qty) + ' ' + esc(unit) + ' on ' + U.nice(o.eta) + '</span>'); });
  return { date: a, extra: extra.join('') };
}
function runOutHTML(r) { var p = runOutParts(r); return '<span class="ro"><b class="ro1">' + p.date + '</b>' + p.extra + '</span>'; }
(function () { /* same look everywhere: normal text, one line each */
  var st = document.createElement('style');
  st.textContent = '.stat dd.rofull{grid-column:1/-1;margin-top:-4px;text-align:right;font-family:var(--f-body)}.stat dd.rofull span{display:block;white-space:normal}' + '.ro{display:block;font-family:var(--f-body);white-space:normal;line-height:1.35;letter-spacing:0}.ro .ro1{display:block;font-size:inherit}.ro .ro2,.ro .ro3,.wd2{display:block;font-family:var(--f-body);font-weight:400;font-size:12.5px;color:var(--muted);white-space:normal;letter-spacing:0}.ro .ro2{color:var(--ink)}';
  document.head.appendChild(st);
})();
(function () {
  var _c = card;
  card = function (r) {
    var h = _c(r);
    var p = runOutParts(r);
    return h.replace(/<dt>Runs out<\/dt><dd>[^<]*<\/dd>/, '<dt title="Without deliveries; below: with the deliveries still to come">Runs out</dt><dd><b>' + p.date + '</b></dd>' + (p.extra ? '<dd class="rofull">' + p.extra + '</dd>' : ''));
  };
  if (typeof vMaterial === 'function') {
    var _vm = vMaterial;
    vMaterial = function (fc) {
      var h = _vm(fc), r = fc.results.filter(function (x) { return x.id === S.mat; })[0]; if (!r) return h;
      return h.replace(/(<span class="l">Runs out<\/span><span class="v" style="font-size:22px">)[^<]*(<\/span>)/, '$1' + runOutHTML(r) + '$2');
    };
  }
})();
