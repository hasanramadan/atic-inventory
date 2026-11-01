/* ATIC inventory reader: understands the standard weekly and monthly inventory workbooks
   ("Inventory 24.10.2026.xlsx", "Inventory 31.10.2026.xlsx"):
   - sheet "Raw Material": RAW MATERIAL | UNIT (pack, e.g. "25 Kg/bag") | QTY PER UNIT | UNIT (counted in) | notes
   - sheet "Packaging Material": ITEM | Packing (e.g. "2000/roll") | QTY | Unit | notes, with group rows (Cartoon, Label, Caps …)
   - optional sheet "CRITICAL STOCK": the items to watch, with "ENOUGH FOR" and "IN USE" notes
   - a monthly sheet with Opening / Received / Used / Closing columns is read too (Closing is the count)
   Quantities like "13CAN + 3.25 KG", "4 ROLLS + 300 STICKER", "6720 + 111 SIZE ISSUE" are read: parts in the
   pack's units are converted, parts with other words are kept as a note, the original text is always kept.
   Pure functions, also used in tests: ATICInventory.parseBook(book, opts), .merge(saved, parsed), .parseQty, .parsePack */
(function (root) {
  'use strict';
  var X = function () { return root.ATICExcel && root.ATICExcel.parse; };
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[\s_\-./()]+/g, ' ').trim(); }
  function txt(v) { if (v == null) return ''; if (v instanceof Date) return X().toDate(v) || ''; return String(v).replace(/\s+/g, ' ').trim(); }
  function slug(s) { return norm(s).replace(/[^a-z0-9 ]/g, '').replace(/ +/g, '-').slice(0, 70); }
  var UNIT = { bag: 'bag', bags: 'bag', can: 'can', cans: 'can', bucket: 'bucket', buckets: 'bucket', drum: 'drum', drums: 'drum', box: 'box', boxes: 'box', tank: 'tank', tanks: 'tank',
    kg: 'kg', kgs: 'kg', kilo: 'kg', g: 'g', gr: 'g', l: 'l', lt: 'l', ltr: 'l', litre: 'l', liter: 'l', litres: 'l', liters: 'l', ml: 'ml', gal: 'gal', gallon: 'gal', galon: 'gal', galoon: 'gal', galons: 'gal', gallons: 'gal',
    pcs: 'pcs', pc: 'pcs', piece: 'pcs', pieces: 'pcs', roll: 'roll', rolls: 'roll', sticker: 'sticker', stickers: 'sticker', carton: 'carton', cartons: 'carton', set: 'set', sets: 'set',
    bottle: 'bottle', bottles: 'bottle', btl: 'bottle', btls: 'bottle', pallet: 'pallet', pallets: 'pallet', sleeve: 'sleeve', sleeves: 'sleeve', tape: 'tape', tapes: 'tape', filter: 'filter', filters: 'filter', cartidge: 'cartridge', cartridge: 'cartridge' };
  function unitWord(s) { s = String(s || '').toLowerCase().replace(/[^a-z]/g, ''); return UNIT[s] || s.replace(/s$/, ''); }
  var SMALL = { kg: 1, g: 1, l: 1, ml: 1 };
  var PIECES = { sticker: 1, pcs: 1, bottle: 1, sleeve: 1 };

  /* "25 Kg/bag" → {size:25, of:'kg', per:'bag'}; "2000/roll" → {size:2000, of:'pcs', per:'roll'}; "1000&1300/Pallet" → null (two sizes) */
  function parsePack(t) {
    var s = String(t == null ? '' : t).toLowerCase().replace(/,/g, '.').trim(); if (!s || /&/.test(s)) return null;
    var m = s.match(/([\d.]+)\s*(kg|kgs|g|l|ltr|litre|liter|ml)\s*\/\s*([a-z]+)/) || s.match(/([\d.]+)\s*(kg|kgs|g|l|ltr|litre|liter|ml)\s+([a-z]+)$/);
    if (m) return { size: +m[1], of: unitWord(m[2]), per: unitWord(m[3]) };
    m = s.match(/^([\d.]+)\s*([a-z]*)\s*\/\s*([a-z]+)/);
    if (m && +m[1] > 0) return { size: +m[1], of: m[2] ? unitWord(m[2]) : 'pcs', per: unitWord(m[3]) };
    return null;
  }
  /* quantity cell → {qty, unit, exact, note}; qty is in the counted unit (unitCol, or the pack's container) */
  function parseQty(v, pack, unitCol) {
    var cu = unitWord(unitCol);
    if (typeof v === 'number') return isFinite(v) ? { qty: v, unit: cu || (pack && pack.per) || '', exact: true, note: '' } : null;
    var s = txt(v); if (!s) return null;
    var low = s.toLowerCase().replace(/,/g, '');
    if (!/\d/.test(low)) return { qty: null, unit: cu, exact: false, note: s };
    var main = cu || (pack && pack.per) || '', qty = 0, any = false, notes = [], small = 0, smallU = null;
    low.split('+').forEach(function (part) {
      var p = part.trim(); if (!p) return;
      var m = p.match(/^\(?\s*([\d.]+)\s*([a-z]*)\s*\)?\s*(.*)$/);
      if (!m) { notes.push(part.trim()); return; }
      var n = +m[1], u = unitWord(m[2]), rest = m[3].trim();
      if (rest) { notes.push(part.trim()); return; }           // "111 SIZE ISSUE", "BALANCE IN CAPS CONTAINER"
      if (!u || u === main || (pack && u === pack.per)) { qty += n; any = true; if (!main && u) main = u; return; }
      if (SMALL[u] || PIECES[u]) {
        var f = (pack && pack.size && (pack.of === u || (PIECES[u] && pack.of === 'pcs') || (u === 'g' && pack.of === 'kg') || (u === 'ml' && pack.of === 'l'))) ? pack.size * (u === 'g' || u === 'ml' ? 1000 : 1) : null;
        if (f) { qty += n / f; any = true; return; }
        if (!main || main === u) { qty += n; any = true; main = u; return; }
        small += n; smallU = u; return;
      }
      if (!main) { main = u; qty += n; any = true; return; }
      notes.push(part.trim());
    });
    if (!any && small) return { qty: small, unit: smallU, exact: true, note: notes.join(' + ') };
    if (!any) return { qty: null, unit: main, exact: false, note: s };
    return { qty: Math.round(qty * 10000) / 10000, unit: main, exact: !notes.length && !small, note: notes.concat(small ? [small + ' ' + smallU + ' (not converted)'] : []).join(' + ') };
  }

  var HDR = {
    name: [/^(raw material|packaging material|material|item|items|description|item name|product)$/, /raw material|packaging|material|item/],
    pack: [/^(packing|pack|pack size|packaging)$/],
    qty: [/^(closing|closing stock|closing balance|balance|stock|on hand)$/, /^(qty|quantity|qty per unit|quantity per unit|count|counted)$/, /closing|qty|quantity/],
    unit: [/^(unit|uom|units)$/],
    opening: [/^opening/], received: [/^(received|receipts?|in)$/], used: [/^(used|consumed|consumption|issued|out)$/],
    enough: [/enough for|cover|days left/]
  };
  function findHeader(rows) {
    var best = null;
    for (var r = 0; r < Math.min(rows.length, 15); r++) {
      var row = rows[r] || [], cells = row.map(function (c) { return typeof c === 'string' ? norm(c) : ''; });
      var name = -1, qty = -1, qtyRank = 9;
      cells.forEach(function (c, i) {
        if (!c) return;
        if (name < 0 && HDR.name.some(function (re) { return re.test(c); }) && !/qty|quantity/.test(c)) name = i;
        HDR.qty.forEach(function (re, k) { if (re.test(c) && k < qtyRank && i !== name) { qty = i; qtyRank = k; } });
      });
      if (name >= 0 && qty >= 0) { var sc = 3 - qtyRank; if (!best || sc > best.sc) best = { row: r, name: name, qty: qty, sc: sc }; }
    }
    if (!best) return null;
    var row = rows[best.row].map(function (c) { return typeof c === 'string' ? norm(c) : ''; }), map = { name: best.name, qty: best.qty, notes: [] };
    // "UNIT" before the quantity = pack size; "UNIT" after it = what was counted in
    row.forEach(function (c, i) {
      if (!c || i === best.name || i === best.qty) return;
      if (HDR.pack[0].test(c)) map.pack = i;
      else if (HDR.unit[0].test(c)) { if (i < best.qty && map.pack == null) map.pack = i; else if (i > best.qty && map.unit == null) map.unit = i; }
      else if (HDR.opening[0].test(c)) map.opening = i; else if (HDR.received[0].test(c)) map.received = i; else if (HDR.used[0].test(c)) map.used = i;
      else if (HDR.enough[0].test(c)) map.enough = i;
    });
    map.row = best.row; return map;
  }
  function sheetDate(rows, upTo, year, ref) {
    for (var r = 0; r <= Math.min(upTo, 5); r++) for (var c = 0; c < (rows[r] || []).length; c++) { var d = X().cellDate(rows[r][c], year, ref); if (d) return d; }
    return null;
  }
  function isGroupRow(row, map) {
    var vals = row.map(txt).filter(Boolean); if (!vals.length) return false;
    var first = txt(row[map.name]); if (!first) return false;
    var allSame = vals.every(function (v) { return v === first; });
    var qtyEmpty = row[map.qty] === '' || row[map.qty] == null || txt(row[map.qty]) === first;
    return qtyEmpty && (allSame || vals.length === 1);
  }
  var SKIP_NAME = /^(item|items|raw material|packaging material|total|sub ?total|grand total)$/i;

  function readStockSheet(sh, cat, opts) {
    var rows = sh.rows, map = findHeader(rows); if (!map) return null;
    var items = [], group = cat === 'raw' ? 'Raw material' : '', width = 0;
    rows.forEach(function (r) { width = Math.max(width, (r || []).length); });
    var used = [map.name, map.qty, map.pack, map.unit, map.opening, map.received, map.used, map.enough].filter(function (x) { return x != null; });
    for (var r = map.row + 1; r < rows.length; r++) {
      var row = rows[r] || [], name = txt(row[map.name]);
      if (!name || SKIP_NAME.test(name)) continue;
      if (isGroupRow(row, map)) { group = name; continue; }
      var packTxt = map.pack != null ? txt(row[map.pack]) : '', pack = parsePack(packTxt);
      var unitTxt = map.unit != null ? txt(row[map.unit]) : '';
      var q = parseQty(row[map.qty], pack, unitTxt);
      var notes = [];
      for (var c = 0; c < width; c++) if (used.indexOf(c) < 0 && row[c] !== '' && row[c] != null) { var t = txt(row[c]); if (t && t !== name) notes.push(t); }
      var noteTxt = notes.join(' · ');
      var unit = unitWord(unitTxt) ? txt(unitTxt).toUpperCase() : (q && q.unit ? q.unit.toUpperCase() : (pack && pack.per ? pack.per.toUpperCase() : ''));
      items.push({
        id: slug(cat + ' ' + name + ' ' + (packTxt && packTxt !== '..' ? packTxt : '')),
        cat: cat, group: group || 'Other', name: name, packTxt: packTxt === '..' ? '' : packTxt, pack: pack,
        qty: q ? q.qty : null, qtyText: typeof row[map.qty] === 'number' ? '' : txt(row[map.qty]), unit: unit,
        qtyNote: q && q.note ? q.note : '', note: noteTxt,
        critical: /cr[i]?t[i]?cal/i.test(noteTxt), needOrder: /need(s)? to order|order now/i.test(noteTxt),
        monthly: map.opening != null ? { opening: X().toNumber(row[map.opening]), received: map.received != null ? X().toNumber(row[map.received]) : null, used: map.used != null ? X().toNumber(row[map.used]) : null } : null,
        row: r + 1, sheet: sh.name
      });
    }
    var date = sheetDate(rows, map.row, opts.year, opts.ref);
    // same id twice (e.g. two identical lines) → keep both, number the second
    var seen = {}; items.forEach(function (it) { if (seen[it.id]) it.id += '-' + (++seen[it.id]); else seen[it.id] = 1; });
    return { items: items, date: date, map: map };
  }
  /* "CRITICAL STOCK" sheet: names with qty, "ENOUGH FOR" and an in-use note */
  function readCriticalSheet(sh) {
    var out = [], rows = sh.rows, cat = 'pack', enoughCol = -1, noteCols = [];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r] || [], a = txt(row[0]), lo = norm(a);
      if (!a) continue;
      row.forEach(function (c, i) { if (typeof c === 'string' && /enough for/i.test(c)) enoughCol = i; });
      if (/^raw material/.test(lo)) { cat = 'raw'; continue; }
      if (/^packaging material|^item$/.test(lo)) { cat = 'pack'; continue; }
      var vals = row.map(txt).filter(Boolean);
      if (vals.every(function (v) { return v === a; })) continue; // group row
      var qty = X().toNumber(row[1]); if (qty == null && txt(row[1]) === '') continue;
      var extra = []; for (var c = 3; c < row.length; c++) if (c !== enoughCol && txt(row[c])) extra.push(txt(row[c]));
      out.push({ name: a, cat: cat, qty: qty, unit: txt(row[2]), enough: enoughCol >= 0 ? txt(row[enoughCol]) : '', use: extra.join(' · '), row: r + 1 });
    }
    return out;
  }
  function parseBook(book, opts) {
    opts = opts || {}; var ref = opts.ref, year = ref ? +ref.slice(0, 4) : new Date().getFullYear();
    var items = [], dates = [], crit = [], notes = [], sheetsRead = [];
    book.sheets.forEach(function (sh) {
      if (sh.hidden || !sh.rows.length) return;
      if (/critical/i.test(sh.name)) { crit = crit.concat(readCriticalSheet(sh)); sheetsRead.push(sh.name + ' (critical list)'); return; }
      var cat = /pack/i.test(sh.name) ? 'pack' : /raw/i.test(sh.name) ? 'raw' : null;
      var res = readStockSheet(sh, cat || 'raw', { year: year, ref: ref });
      if (!res || !res.items.length) { notes.push('Sheet "' + sh.name + '": no item list with quantities found.'); return; }
      if (!cat) { // unknown sheet name: guess from the items
        var packy = res.items.filter(function (i) { return /carton|label|caps?|bottle|preform|tape|film|partition|sticker/i.test(i.name); }).length;
        if (packy > res.items.length / 3) res.items.forEach(function (i) { i.cat = 'pack'; i.id = i.id.replace(/^raw-/, 'pack-'); });
      }
      items = items.concat(res.items); if (res.date) dates.push(res.date); sheetsRead.push(sh.name);
    });
    // critical sheet → mark the matching items (same category, closest name; qty breaks ties)
    var unmatched = [];
    crit.forEach(function (c) {
      var pool = items.filter(function (i) { return i.cat === c.cat; }); if (!pool.length) pool = items;
      var best = null, bs = 0;
      pool.forEach(function (i) {
        var s = norm(i.name) === norm(c.name) ? 1 : (X().matchName(c.name, [{ name: i.name, id: '' }], 0) || { score: 0 }).score;
        if (c.qty != null && i.qty != null && Math.abs(c.qty - i.qty) < 0.01) s += 0.05;
        if (s > bs) { bs = s; best = i; }
      });
      if (best && bs >= 0.8) { best.critical = true; best.critSheet = true; if (c.enough) best.enough = c.enough; if (c.use) best.use = c.use; }
      else unmatched.push(c.name);
    });
    if (unmatched.length) notes.push('On the critical list but not found in the item sheets: ' + unmatched.join(', ') + '.');
    var date = dates.sort()[dates.length - 1] || null;
    if (!date) { var fm = String(book.name || '').match(/(\d{1,2})[._\-](\d{1,2})[._\-](\d{2,4})/); if (fm) date = X().toDate(fm[1] + '/' + fm[2] + '/' + fm[3]); }
    var monthly = items.some(function (i) { return i.monthly; });
    return { date: date, items: items, critical: crit, notes: notes, sheets: sheetsRead, kind: monthly ? 'monthly' : (crit.length ? 'weekly + critical list' : 'weekly') };
  }
  /* new count over the saved inventory. Critical stays critical until someone clears it by hand
     (and the file marks it again → critical again). Items missing from the file are kept. */
  function merge(saved, parsed, info) {
    var old = {}; ((saved && saved.items) || []).forEach(function (i) { old[i.id] = i; });
    // ids can shift when a pack text changes: fall back to category + name
    var byName = {}; ((saved && saved.items) || []).forEach(function (i) { var k = i.cat + '|' + norm(i.name); (byName[k] = byName[k] || []).push(i); });
    var used = {}, out = [], changes = [];
    parsed.items.forEach(function (n) {
      var o = old[n.id];
      if (!o) { var cand = (byName[n.cat + '|' + norm(n.name)] || []).filter(function (x) { return !used[x.id]; }); if (cand.length === 1) o = cand[0]; }
      if (o) used[o.id] = 1;
      var it = {
        id: o ? o.id : n.id, cat: n.cat, group: n.group, name: n.name, packTxt: n.packTxt, unit: n.unit || (o && o.unit) || '',
        qty: n.qty, qtyText: n.qtyText, qtyNote: n.qtyNote, note: n.note,
        critical: !!(n.critical || (o && o.critical)), critFrom: n.critical ? (n.critSheet ? 'critical list ' + (info.date || '') : 'marked in file ' + (info.date || '')) : (o && o.critical ? o.critFrom || 'kept from before' : ''),
        enough: n.enough || '', use: n.use || '', needOrder: !!n.needOrder,
        mat: o && o.mat != null ? o.mat : n.mat, toApp: o && o.toApp != null ? o.toApp : n.toApp,
        asOf: info.date, source: info.source, min: o ? o.min : null
      };
      out.push(it);
      changes.push({ id: it.id, name: it.name, cat: it.cat, before: o ? o.qty : null, after: it.qty, isNew: !o, critical: it.critical, critNew: it.critical && !(o && o.critical) });
    });
    ((saved && saved.items) || []).forEach(function (o) { if (!used[o.id] && !parsed.items.some(function (n) { return n.id === o.id; })) { out.push(Object.assign({}, o, { missing: info.date })); changes.push({ id: o.id, name: o.name, cat: o.cat, before: o.qty, after: o.qty, missing: true, critical: o.critical }); } });
    return { items: out, changes: changes };
  }
  root.ATICInventory = { parseBook: parseBook, merge: merge, parseQty: parseQty, parsePack: parsePack, unitWord: unitWord, slug: slug, norm: norm };
})(typeof window !== 'undefined' ? window : globalThis);
