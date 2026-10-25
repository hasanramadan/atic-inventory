/* ATIC Word reader: opens .docx files in the browser (no add-ons) and reads the daily line report (form FR01).
   readDocx(file|ArrayBuffer) → { paragraphs:[text], tables:[[[cell text]]] }
   parseFR01(doc, name) → { date, sec, runs[], fillMin, stopMin, workMin, startMin, cleanRoutineMin, cleanDeepMin, changeoverMin, prepMin, lastBox, reasons, stops[], notes, warnings[] } */
(function (root) {
  'use strict';
  /* ---------- zip ---------- */
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  async function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open Word files. Use Chrome, Edge or Safari.');
    var ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(bytes); w.close();
    var buf = await new Response(ds.readable).arrayBuffer(); return new Uint8Array(buf);
  }
  async function unzip(ab, want) {
    var b = new Uint8Array(ab), eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This is not a Word (.docx) file.');
    var n = u16(b, eocd + 10), off = u32(b, eocd + 16), out = {}, dec = new TextDecoder();
    for (var k = 0; k < n; k++) {
      if (u32(b, off) !== 0x02014b50) break;
      var method = u16(b, off + 10), csize = u32(b, off + 20), nlen = u16(b, off + 28), xlen = u16(b, off + 30), clen = u16(b, off + 32), lho = u32(b, off + 42);
      var name = dec.decode(b.subarray(off + 46, off + 46 + nlen));
      off += 46 + nlen + xlen + clen;
      if (want && !want.test(name)) continue;
      var ds = lho + 30 + u16(b, lho + 26) + u16(b, lho + 28), data = b.subarray(ds, ds + csize);
      out[name] = dec.decode(method === 8 ? await inflate(data) : data);
    }
    return out;
  }
  /* ---------- document.xml → paragraphs and tables ---------- */
  function ent(s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
  function runText(x) {
    var o = ''; x.replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>/g, function (m, t) { o += t !== undefined ? t : (m.indexOf('tab') > 0 ? '\t' : '\n'); return m; });
    return ent(o);
  }
  function paraTexts(x) { var o = []; x.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function (p) { o.push(runText(p).replace(/[  ]+/g, ' ').trim()); return ''; }); return o; }
  function tables(xml) {
    var out = [], depth = 0, start = -1, re = /<w:tbl>|<\/w:tbl>/g, m;
    while ((m = re.exec(xml))) { if (m[0] === '<w:tbl>') { if (depth === 0) start = m.index; depth++; } else { depth--; if (depth === 0) out.push(xml.slice(start, m.index + 8)); } }
    return out;
  }
  function tableRows(t) {
    var rows = [];
    t.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, function (tr) {
      var cells = [];
      tr.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, function (tc) { var span = /w:gridSpan w:val="(\d+)"/.exec(tc); var txt = paraTexts(tc).filter(Boolean).join('\n'); cells.push(txt); for (var i = 1; span && i < +span[1]; i++) cells.push(''); return ''; });
      rows.push(cells); return '';
    });
    return rows;
  }
  async function readDocx(src) {
    var ab = src instanceof ArrayBuffer ? src : await src.arrayBuffer();
    var files = await unzip(ab, /^word\/(document|header\d*|footer\d*)\.xml$/);
    var xml = files['word/document.xml']; if (!xml) throw new Error('This Word file has no document body.');
    var tbls = tables(xml), body = xml; tbls.forEach(function (t) { body = body.replace(t, '<w:p><w:r><w:t>[TABLE]</w:t></w:r></w:p>'); });
    var heads = Object.keys(files).filter(function (k) { return /header|footer/.test(k); }).map(function (k) { return paraTexts(files[k]).filter(Boolean).join(' '); });
    return { paragraphs: paraTexts(body).filter(function (p) { return p && p !== '[TABLE]'; }), tables: tbls.map(tableRows), headers: heads };
  }

  /* ---------- FR01 daily line report ---------- */
  var PROD = [['GM', /grenad|molass/i], ['RW', /rose/i], ['BW', /blossom|orange/i], ['LS', /lemon/i], ['WV', /vinegar/i], ['FC', /cordial/i]];
  function prodOf(s) { for (var i = 0; i < PROD.length; i++) if (PROD[i][1].test(s)) return PROD[i][0]; var m = /\b(GM|RW|BW|LS|WV|FC)\b/.exec(s); return m ? m[1] : null; }
  function sizeOf(s) { var m = /(\d{3,4})\s*ml/i.exec(s); if (m) return +m[1] === 1000 ? '1L' : m[1] + 'ml'; if (/\b1\s*(l|ltr|litre|liter)\b/i.test(s)) return '1L'; return null; }
  function num(s) { var m = /-?\d+(?:\.\d+)?/.exec(String(s || '').replace(/,/g, '')); return m ? +m[0] : null; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function dateOf(s) { var m = /(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/.exec(s || ''); if (!m) return null; var y = +m[3]; if (y < 100) y += 2000; return y + '-' + pad(+m[2]) + '-' + pad(+m[1]); }
  /* clock time on a 07:00–17:00 shift written without am/pm: 3:29 → 15:29 */
  function clock(s, pm) {
    var m = /(\d{1,2})[:.](\d{2})\s*(am|pm)?/i.exec(s || ''); if (!m) return null;
    var h = +m[1], mi = +m[2], ap = (m[3] || pm || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12; else if (ap === 'am' && h === 12) h = 0; else if (!ap && h < 7) h += 12;
    return h * 60 + mi;
  }
  function hhmm(t) { return pad(Math.floor(t / 60)) + ':' + pad(t % 60); }
  function range(s) { var p = String(s || '').split(/[–—\-]|to/i); if (p.length < 2) return null; var a = clock(p[0]), b = clock(p[1]); if (a == null || b == null) return null; if (b < a) b += 12 * 60; return { from: a, to: b, min: b - a }; }
  function kind(cause, from) {
    var c = cause.toLowerCase();
    if (/cip|deep clean|sanit/.test(c)) return 'deep';
    if (/clean|wash/.test(c)) return 'clean';
    if (/change ?over|size change|product change|line setup|set ?up for/.test(c)) return 'change';
    if (/prepar|heating|waiting for (the )?batch|batch not ready|filtration/.test(c)) return 'prep';
    if (/start/.test(c) || (from != null && from <= 7 * 60 + 5 && /arrang/.test(c))) return 'start';
    return 'other';
  }
  function title(s) { return s.toLowerCase().replace(/(^|[\s/–\-(])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }); }

  function parseFR01(doc, fileName) {
    var all = doc.paragraphs.concat(doc.headers || []).join('\n'), warn = [], out = { file: fileName || '', warnings: warn, stops: [] };
    // date and section
    var dm = /filling date[^\d]*(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})/i.exec(all) || /(\d{1,2}[./\-]\d{1,2}[./\-]\d{4})/.exec(all);
    out.date = dm ? dateOf(dm[1]) : null;
    if (!out.date && fileName) out.date = dateOf(fileName.replace(/[^\d.\-]+/g, ' ').replace(/(\d{1,2})-(\d{1,2})-(\d{4})/, '$1.$2.$3'));
    var sm = /section\s*[-–:#]?\s*(\d)/i.exec(all) || (fileName && /section\s*[-_ ]?\s*(\d)/i.exec(fileName));
    out.sec = sm ? 'S' + sm[1] : null;
    if (!out.date) warn.push('No date found.'); if (!out.sec) warn.push('No section found.');
    var T = doc.tables, cells = [];
    T.forEach(function (t) { t.forEach(function (r) { r.forEach(function (c) { if (c) cells.push(c); }); }); });
    var cellText = cells.join('\n');
    // production table: items in order of appearance, last box time
    var items = [], lastBox = null;
    T.forEach(function (t) {
      if (!t.length || !/item|packaging/i.test(t[0].join(' ')) || !/time/i.test(t[0].join(' '))) return;
      t.slice(1).forEach(function (r) {
        var p = prodOf(r[1] || ''), z = sizeOf(r[1] || ''); var tm = clock(r[0] || '');
        if (p && z && !items.some(function (x) { return x.product === p && x.size === z; })) items.push({ product: p, size: z });
        if (tm != null && (r[3] || '').trim()) lastBox = Math.max(lastBox || 0, tm);
      });
    });
    // per-item cartons: "Total GM 750ml: 1501 Cartons"
    var per = {}; all.replace(/total\s+([a-z ]+?)\s*(\d{3,4}\s*ml|1\s*l(?:tr)?)\s*:?\s*([\d,]+)\s*c(?:ar)?t/ig, function (m, p, z, n) { var pp = prodOf(p), zz = sizeOf(z) || (/1\s*l/i.test(z) ? '1L' : null); if (pp && zz) per[pp + '|' + zz] = num(n); return m; });
    // daily summary
    var g = function (rx) { var m = rx.exec(cellText); return m ? m[1] : null; };
    var totalCartons = num(g(/total cartons produced\s*:?\s*([\d,]+)/i));
    var prepared = g(/total batches prepared\s*:?\s*([^\n]*)/i), used = g(/total batches used\s*:?\s*([^\n]*)/i);
    var bal = []; cellText.replace(/balance batches on\s*(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})\s*:?\s*([^\n]*)/ig, function (m, d, v) { bal.push({ date: dateOf(d), text: v }); return m; });
    function byProduct(txt) { var o = {}; if (!txt) return o; String(txt).replace(/([\d.]+)\s*([A-Za-z]{2})\b|([A-Za-z]{2})\s*([\d.]+)/g, function (m, n1, p1, p2, n2) { var p = (p1 || p2).toUpperCase(), n = +(n1 || n2); if (/^(GM|RW|BW|LS|WV|FC)$/.test(p)) o[p] = (o[p] || 0) + n; return m; }); if (!Object.keys(o).length && num(txt) != null && items.length) o[items[0].product] = num(txt); return o; }
    var prep = byProduct(prepared), usedB = byProduct(used), opening = {}, closing = {};
    bal.forEach(function (b) { var v = byProduct(b.text); if (b.date === out.date) closing = v; else if (b.date && out.date && b.date < out.date) opening = v; });
    // times
    var st = g(/(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*\n?\s*(?:\|)?\s*start time/i), fin = g(/(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*\n?\s*(?:\|)?\s*finish time/i);
    T.forEach(function (t) { t.forEach(function (r) { for (var i = 0; i < r.length; i++) { if (/start time/i.test(r[i]) && i > 0 && clock(r[i - 1]) != null) st = r[i - 1]; if (/finish time/i.test(r[i]) && i > 0 && clock(r[i - 1]) != null) fin = r[i - 1]; } }); });
    // minutes
    out.fillMin = num(g(/filling minutes\s*:?\s*([\d.,]+)/i));
    out.stopMin = num(g(/stopping minutes\s*:?\s*([\d.,]+)/i));
    out.workMin = num(g(/working minutes\s*:?\s*([\d.,]+)/i)) || num(g(/total working minutes?\s*:?\s*([\d.,]+)/i)) || (st && fin ? clock(fin, 'pm') - clock(st, 'am') : null);
    if (out.fillMin == null && out.workMin != null && out.stopMin != null) out.fillMin = out.workMin - out.stopMin;
    // stops table: cause | from–to
    var sums = { start: 0, clean: 0, deep: 0, change: 0, prep: 0 }, other = {};
    T.forEach(function (t) {
      if (!t.some(function (r) { return /cause/i.test(r.join(' ')); })) return;
      t.forEach(function (r) {
        var txt = r.filter(Boolean); if (txt.length < 2) return;
        var rg = range(txt[txt.length - 1]); if (!rg) return;
        var cause = txt.slice(0, -1).join(' ').replace(/\s+/g, ' ').trim(), k = kind(cause, rg.from);
        out.stops.push({ cause: title(cause), from: hhmm(rg.from), to: hhmm(rg.to), min: rg.min, kind: k });
        if (k === 'other') other[title(cause)] = (other[title(cause)] || 0) + rg.min; else sums[k] += rg.min;
      });
    });
    out.startMin = out.stops.length ? sums.start : null; out.cleanRoutineMin = out.stops.length ? sums.clean : null; out.cleanDeepMin = sums.deep || (out.stops.length ? 0 : null);
    out.changeoverMin = sums.change; out.prepMin = sums.prep || null;
    out.reasons = Object.keys(other).map(function (c) { return c + ' ' + other[c] + ' min'; }).join('; ');
    var stopSum = out.stops.reduce(function (a, s) { return a + s.min; }, 0);
    if (out.stopMin != null && out.stops.length && Math.abs(stopSum - out.stopMin) > 2) warn.push('The stops listed add up to ' + stopSum + ' min, the report says ' + out.stopMin + ' min.');
    out.lastBox = lastBox != null ? hhmm(lastBox) : null;
    // runs: one per item; batches and balances belong to the product (first run of a product carries them)
    if (!items.length) Object.keys(prep).forEach(function (p) { items.push({ product: p, size: null }); });
    var seen = {};
    out.runs = items.map(function (it, i) {
      var first = !seen[it.product]; seen[it.product] = 1;
      var lastOfProduct = !items.slice(i + 1).some(function (x) { return x.product === it.product; });
      var boxes = per[it.product + '|' + it.size]; if (boxes == null && items.length === 1) boxes = totalCartons;
      return { product: it.product, size: it.size, batches: first ? (prep[it.product] != null ? prep[it.product] : 0) : 0, opening: first ? (opening[it.product] != null ? opening[it.product] : null) : null,
        closing: lastOfProduct ? (closing[it.product] != null ? closing[it.product] : null) : null, boxes: boxes != null ? boxes : null, fillMin: items.length === 1 ? out.fillMin : null, changeoverMin: i === 0 ? null : null };
    });
    if (items.length > 1 && out.changeoverMin) out.runs[1].changeoverMin = out.changeoverMin; else if (out.changeoverMin && out.runs[0]) out.runs[0].changeoverMin = out.changeoverMin;
    out.runs.forEach(function (r) { if (r.boxes == null) warn.push('Cartons for ' + r.product + ' ' + (r.size || '') + ' not found.'); });
    // balance check: opening + prepared − used = closing
    Object.keys(usedB).forEach(function (p) { var o = opening[p], c = closing[p], pr = prep[p] || 0; if (o != null && c != null && Math.abs(o + pr - usedB[p] - c) > 0.05) warn.push(p + ': opening ' + o + ' + prepared ' + pr + ' − used ' + usedB[p] + ' = ' + (Math.round((o + pr - usedB[p]) * 100) / 100) + ', but the closing balance says ' + c + '.'); });
    out.totalCartons = totalCartons; out.batchesUsed = usedB;
    var extra = doc.paragraphs.filter(function (p) { return /damaged|broken|unfilled|new container|sample/i.test(p); });
    out.notes = ['From ' + (fileName || 'the daily report') + '.'].concat(extra).join(' ');
    return out;
  }
  root.ATICWord = { readDocx: readDocx, parseFR01: parseFR01, _unzip: unzip };
})(typeof window !== 'undefined' ? window : globalThis);
