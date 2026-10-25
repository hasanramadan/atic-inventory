/* ATIC Excel reader: one reader for every import on the site.
   - reads every sheet of .xlsx / .xls / .xlsm / .csv (needs SheetJS on the page for Excel files)
   - copies merged-cell values into every cell of the merge
   - understands numbers like "1,250", "12.5 kg", "(10)", and dates as Excel dates, serial numbers,
     26/10/2026, 26-10-26, 26/10, 2026-10-26, 26 Oct, Oct 26 2026, "Sun 26/10" (day first, Oman style)
   - finds the header row by itself and maps columns by name, then shows a preview where every
     column can be changed before anything is saved.
   Pure functions are exposed for tests: ATICExcel.parse.* */
(function (root) {
  'use strict';
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  function pad(n) { return String(n).padStart(2, '0'); }
  function isoOf(y, m, d) {
    if (!(y > 1900 && y < 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    var t = new Date(Date.UTC(y, m - 1, d)); if (t.getUTCMonth() !== m - 1) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }
  function fixYear(y) { y = +y; return y < 100 ? 2000 + y : y; }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[ \s_\-./()]+/g, ' ').trim(); }

  /* ---------- values ---------- */
  function toNumber(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'boolean') return null;
    if (v instanceof Date) return null;
    var s = String(v).trim(); if (!s || /^[-–—]+$/.test(s)) return null;
    var neg = /^\(.*\)$/.test(s); if (neg) s = s.slice(1, -1);
    s = s.replace(/[ \s]/g, '');
    var m = s.match(/[-+]?\d[\d,.']*/); if (!m) return null;
    var t = m[0].replace(/'/g, '');
    if (/,\d{1,2}$/.test(t) && t.indexOf('.') < 0) t = t.replace(/\./g, '').replace(',', '.'); // 12,5 → 12.5
    else t = t.replace(/,/g, '');
    var n = parseFloat(t); if (!isFinite(n)) return null;
    return neg ? -n : n;
  }
  /* yearHint: year to use when a date has no year (e.g. "Sun 26/10"); refIso keeps it close to that day */
  function toDate(v, opts) {
    opts = opts || {}; var yh = opts.year || new Date().getFullYear();
    if (v == null || v === '') return null;
    if (v instanceof Date) { if (isNaN(v)) return null; return isoOf(v.getFullYear(), v.getMonth() + 1, v.getDate()) || isoOf(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()); }
    if (typeof v === 'number') {
      if (v > 20000 && v < 80000) { var ms = Math.round((v - 25569) * 864e5); var d = new Date(ms); return isoOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
      return null;
    }
    var s = String(v).trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1');
    if (!s) return null;
    var m;
    if ((m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return isoOf(+m[1], +m[2], +m[3]);
    if ((m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/))) {
      var a = +m[1], b = +m[2], y = fixYear(m[3]);
      if (a > 12) return isoOf(y, b, a); if (b > 12) return isoOf(y, a, b);
      return isoOf(y, b, a); // day first
    }
    if ((m = s.match(/(\d{1,2})[\s\-.]*([a-z]{3,9})[\s\-.,]*(\d{2,4})?/)) && MONTHS[m[2]]) return isoOf(m[3] ? fixYear(m[3]) : guessYear(MONTHS[m[2]], +m[1], opts), MONTHS[m[2]], +m[1]);
    if ((m = s.match(/([a-z]{3,9})[\s\-.]*(\d{1,2})[\s,]*(\d{4})?/)) && MONTHS[m[1]]) return isoOf(m[3] ? +m[3] : guessYear(MONTHS[m[1]], +m[2], opts), MONTHS[m[1]], +m[2]);
    if ((m = s.match(/(?:^|[^\d])(\d{1,2})\s*[/.\-]\s*(\d{1,2})(?![\d/.\-])/))) {
      var dd = +m[1], mm = +m[2];
      if (mm > 12 && dd <= 12) { var t = dd; dd = mm; mm = t; }
      return isoOf(guessYear(mm, dd, opts), mm, dd);
    }
    return null;
  }
  function guessYear(m, d, opts) {
    var y = opts.year || new Date().getFullYear();
    if (opts.ref) { // pick the year that puts the date nearest the reference day
      var best = y, bd = 1e12, r = Date.parse(opts.ref + 'T00:00:00Z');
      [y - 1, y, y + 1].forEach(function (yy) { var t = Date.UTC(yy, m - 1, d); if (Math.abs(t - r) < bd) { bd = Math.abs(t - r); best = yy; } });
      return best;
    }
    return y;
  }
  function toText(v) { if (v == null) return ''; if (v instanceof Date) return toDate(v) || ''; return String(v).replace(/\s+/g, ' ').trim(); }

  /* product + size from free text: "Grenadine 750", "GM 300ML", "Rose water 0.75 L", "Lemon 1 ltr" */
  var PRODUCTS = [['GM', /grenad|molass|^\s*gm\b|\bgm\s*\d/], ['RW', /\brose\b|^\s*rw\b|\brw\s*\d/], ['BW', /blossom|orange\s*fl|^\s*bw\b|\bbw\s*\d/], ['LS', /lemon|^\s*ls\b|\bls\s*\d/], ['WV', /vinegar|^\s*wv\b|\bwv\s*\d/], ['FC', /cordial|^\s*fc\b/]];
  function productOf(v) { var s = toText(v).toLowerCase(); if (!s) return null; for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i][1].test(s)) return PRODUCTS[i][0]; return null; }
  function sizeOf(v) {
    var s = toText(v).toLowerCase().replace(/,/g, '.'); var m;
    if ((m = s.match(/(\d+(?:\.\d+)?)\s*(ml|cc)\b/))) return sizeLabel(+m[1]);
    if ((m = s.match(/(\d+(?:\.\d+)?)\s*(l|lt|ltr|litre|liter)s?\b/))) return sizeLabel(+m[1] * 1000);
    if ((m = s.match(/\b(300|500|710|750|1000)\b/))) return sizeLabel(+m[1]);
    if ((m = s.match(/\b(1)\s*$/))) return '1L';
    return null;
  }
  function sizeLabel(ml) { ml = Math.round(ml); if (ml === 1000) return '1L'; if ([300, 500, 710, 750].indexOf(ml) >= 0) return ml + 'ml'; return ml >= 1000 ? (ml / 1000) + 'L' : ml + 'ml'; }

  /* fuzzy name match against a list of {id, name, aliases?} */
  function bigrams(s) { s = ' ' + norm(s) + ' '; var o = []; for (var i = 0; i < s.length - 1; i++) o.push(s.slice(i, i + 2)); return o; }
  function similarity(a, b) {
    var A = bigrams(a), B = bigrams(b); if (!A.length || !B.length) return 0;
    var m = {}, hit = 0; B.forEach(function (x) { m[x] = (m[x] || 0) + 1; });
    A.forEach(function (x) { if (m[x]) { hit++; m[x]--; } });
    return 2 * hit / (A.length + B.length);
  }
  function matchName(text, list, min) {
    var t = norm(text); if (!t) return null; var best = null, bs = 0;
    list.forEach(function (x) {
      var names = [x.name, x.id].concat(x.aliases || []);
      names.forEach(function (n) {
        var nn = norm(n); if (!nn) return;
        var s = (t === nn) ? 1 : (t.indexOf(nn) >= 0 || nn.indexOf(t) >= 0) ? 0.9 : similarity(t, nn);
        if (s > bs) { bs = s; best = x; }
      });
    });
    return bs >= (min || 0.55) ? { item: best, score: bs } : null;
  }

  /* ---------- workbook ---------- */
  function fillMerges(ws, rows) {
    (ws['!merges'] || []).forEach(function (mg) {
      var v = rows[mg.s.r] ? rows[mg.s.r][mg.s.c] : undefined; if (v === undefined || v === '') return;
      for (var r = mg.s.r; r <= mg.e.r; r++) { rows[r] = rows[r] || []; for (var c = mg.s.c; c <= mg.e.c; c++) if (rows[r][c] === undefined || rows[r][c] === '') rows[r][c] = v; }
    });
    return rows;
  }
  function parseCsv(text) {
    var rows = [], row = [], cur = '', q = false, sep = (text.split('\n')[0].split(';').length > text.split('\n')[0].split(',').length) ? ';' : ',';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var isCsv = /\.(csv|txt)$/i.test(file.name);
      var rd = new FileReader();
      rd.onerror = function () { reject(new Error('The file could not be opened.')); };
      rd.onload = function () {
        try {
          if (isCsv) { resolve({ name: file.name, sheets: [{ name: file.name.replace(/\.\w+$/, ''), rows: parseCsv(String(rd.result)) }] }); return; }
          if (!root.XLSX) throw new Error('The Excel reader did not load. Check the internet connection and refresh.');
          var wb = root.XLSX.read(rd.result, { type: 'array', cellDates: true, cellNF: false, cellText: false });
          var sheets = wb.SheetNames.map(function (sn) {
            var ws = wb.Sheets[sn];
            var rows = root.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
            return { name: sn, rows: fillMerges(ws, rows), hidden: !!(wb.Workbook && wb.Workbook.Sheets && (wb.Workbook.Sheets.filter(function (x) { return x.name === sn; })[0] || {}).Hidden) };
          });
          resolve({ name: file.name, sheets: sheets });
        } catch (e) { reject(e); }
      };
      if (isCsv) rd.readAsText(file); else rd.readAsArrayBuffer(file);
    });
  }

  /* ---------- tables ---------- */
  /* spec.fields: [{key, label, type:'text'|'number'|'date'|'product'|'size'|'item'|'section', aliases:[regex,...], required}] */
  function headerScore(row, spec) {
    var used = {}, map = {}, score = 0;
    spec.fields.forEach(function (f) {
      for (var c = 0; c < row.length; c++) {
        if (used[c]) continue; var h = norm(row[c]); if (!h || h.length > 60) continue;
        if (f.aliases.some(function (a) { return a.test(h); })) { map[f.key] = c; used[c] = 1; score += f.required ? 2 : 1; return; }
      }
    });
    return { score: score, map: map };
  }
  function findTable(rows, spec) {
    var best = { score: 0, row: -1, map: {} };
    for (var r = 0; r < Math.min(rows.length, 40); r++) {
      var hs = headerScore(rows[r] || [], spec);
      if (hs.score > best.score) best = { score: hs.score, row: r, map: hs.map };
    }
    return best;
  }
  function parseCell(v, f, ctx) {
    switch (f.type) {
      case 'number': return toNumber(v);
      case 'date': return toDate(v, ctx);
      case 'product': return productOf(v);
      case 'size': return sizeOf(v);
      case 'section': var s = toText(v).toLowerCase(); if (/(^|[^\d])2\b|sec\w*\s*2|line\s*2|\bii\b/.test(s)) return 'S2'; if (/(^|[^\d])1\b|sec\w*\s*1|line\s*1|\bi\b/.test(s)) return 'S1'; if (/both|1\s*(&|and|\+)\s*2/.test(s)) return 'both'; return null;
      case 'item': var m = matchName(v, ctx.items || []); return m ? m.item.id : null;
      default: return toText(v);
    }
  }
  function extract(rows, spec, headerRow, map, ctx) {
    ctx = ctx || {}; var out = [], skipped = [];
    for (var r = headerRow + 1; r < rows.length; r++) {
      var row = rows[r] || []; if (!row.some(function (x) { return x !== '' && x != null; })) continue;
      var rec = { _row: r + 1 }, raw = {}, issues = [];
      spec.fields.forEach(function (f) {
        var c = map[f.key]; if (c == null || c === '') { rec[f.key] = null; return; }
        raw[f.key] = row[c]; rec[f.key] = parseCell(row[c], f, ctx);
        if (rec[f.key] == null && row[c] !== '' && row[c] != null) issues.push(f.label + ' "' + toText(row[c]) + '" not understood');
      });
      if (spec.derive) spec.derive(rec, raw, row, ctx);
      var missing = spec.fields.filter(function (f) { return f.required && (rec[f.key] == null || rec[f.key] === ''); }).map(function (f) { return f.label; });
      if (spec.skip && spec.skip(rec, raw)) continue;
      if (missing.length) { skipped.push({ row: r + 1, why: 'no ' + missing.join(', ') + (issues.length ? ' (' + issues.join('; ') + ')' : '') }); continue; }
      rec._issues = issues; rec._raw = raw; out.push(rec);
    }
    return { records: out, skipped: skipped };
  }

  /* ---------- factory plan grid (calendar layout with Section 1 / Section 2 blocks) ---------- */
  var SEC_RX = /(?:sec(?:tion)?|line|خط)\s*[-#:]?\s*([12])\b/i;
  function planGrid(book, opts) {
    opts = opts || {}; var ref = opts.ref || new Date().toISOString().slice(0, 10), year = +ref.slice(0, 4);
    var hits = {}, notes = [], datesSeen = 0, prodSeen = 0;
    book.sheets.forEach(function (sh) {
      if (sh.hidden) return;
      var rows = sh.rows, blocks = [];
      // section blocks: header cells that say Section 1 / Line 2 in the first 15 rows
      for (var r = 0; r < Math.min(rows.length, 15); r++) (rows[r] || []).forEach(function (v, c) {
        var m = SEC_RX.exec(toText(v)); if (m && !blocks.some(function (b) { return b.c === c; })) blocks.push({ c: c, sec: 'S' + m[1] });
      });
      // a merged header copies "Section 1" across its columns: keep the first column of each run
      blocks.sort(function (a, b) { return a.c - b.c; });
      var uniq = []; blocks.forEach(function (b) { if (!uniq.length || uniq[uniq.length - 1].sec !== b.sec) uniq.push(b); }); blocks = uniq;
      if (!blocks.length) { var w = 0; rows.forEach(function (r) { w = Math.max(w, r.length); }); blocks = w > 9 ? [{ c: 0, sec: 'S1' }, { c: 9, sec: 'S2' }] : [{ c: 0, sec: opts.defaultSec || 'S1' }]; notes.push(sh.name + ': no "Section 1 / Section 2" headings found, so columns were split ' + (w > 9 ? 'at column J' : 'as one section')); }
      blocks.forEach(function (b, i) { b.end = i + 1 < blocks.length ? blocks[i + 1].c : 1e9; b.start = i === 0 ? 0 : b.c; });
      var cur = {};
      rows.forEach(function (row) {
        // a date anywhere in the row (left of the first block) applies to every block
        var rowDate = null;
        for (var c = 0; c < Math.min(row.length, blocks[0] ? Math.max(blocks[0].c, 1) : 1); c++) { var d0 = cellDate(row[c], year, ref); if (d0) { rowDate = d0; break; } }
        blocks.forEach(function (b) {
          var d = null, p = null, size = null, batches = null;
          for (var c = b.start; c < Math.min(row.length, b.end); c++) {
            var v = row[c]; if (v === '' || v == null) continue;
            if (!d) { var dd = cellDate(v, year, ref); if (dd) { d = dd; continue; } }
            if (!p) { var pp = productOf(v); if (pp) { p = pp; size = sizeOf(v); continue; } }
            if (p && !size) { var ss = sizeOf(v); if (ss) { size = ss; continue; } }
            if (p && batches == null) { var n = toNumber(v); if (n != null && n > 0 && n <= 40 && typeof v !== 'object') batches = n; }
          }
          if (d || rowDate) { cur[b.sec] = d || rowDate; datesSeen++; }
          if (!p) return; prodSeen++;
          var day = cur[b.sec]; if (!day) return;
          var k = p + '|' + (size || '') + '|' + b.sec + '|' + day; var h = hits[k] || (hits[k] = { product: p, sec: b.sec, date: day, size: size || null, batches: null, sheet: sh.name }); if (batches != null) h.batches = (h.batches || 0) + batches;
        });
      });
    });
    var list = Object.keys(hits).map(function (k) { return hits[k]; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.sec < b.sec ? -1 : a.sec > b.sec ? 1 : String(a.size) < String(b.size) ? -1 : 1; });
    return { days: list, notes: notes, datesSeen: datesSeen, productsSeen: prodSeen };
  }
  function cellDate(v, year, ref) {
    if (v instanceof Date) return toDate(v);
    if (typeof v === 'number') return (v > 40000 && v < 60000) ? toDate(v) : null;
    var s = toText(v); if (!s || s.length > 40) return null;
    // plain "12" or "1/2 batch" are not dates; need a weekday, a month name or d/m
    if (!/(sun|mon|tue|wed|thu|fri|sat|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,4}\s*[-/.]\s*\d{1,2})/i.test(s)) return null;
    if (/batch|ml|ltr|\bl\b/i.test(s)) return null;
    return toDate(s, { year: year, ref: ref });
  }

  /* ---------- preview dialog ---------- */
  var CSS = '.xd-back{position:fixed;inset:0;background:rgba(10,20,16,.55);z-index:50;display:grid;place-items:center;padding:16px}' +
    '.xd{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:16px;width:min(1080px,100%);max-height:calc(100vh - 32px);display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.3)}' +
    '.xd header{padding:16px 20px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;align-items:flex-start}' +
    '.xd header h2{font-size:19px}.xd .body{padding:16px 20px;overflow:auto;display:flex;flex-direction:column;gap:14px}' +
    '.xd footer{padding:14px 20px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end;align-items:center;flex-wrap:wrap}' +
    '.xd .maps{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}' +
    '.xd .maps label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);font-weight:600}' +
    '.xd .maps select,.xd .top select{padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg);font-size:14px;color:var(--ink)}' +
    '.xd .maps label.req span::after{content:" *";color:var(--red)}.xd .maps label.auto select{border-color:var(--green)}' +
    '.xd td.bad{background:var(--red-soft);color:var(--red)}.xd .sum{font-size:14px}.xd .sum b{font-family:var(--f-mono)}' +
    '.xd .top{display:flex;gap:12px;flex-wrap:wrap;align-items:end}.xd .top label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);font-weight:600}' +
    '.xd .skips{font-size:13px;color:var(--muted);max-height:120px;overflow:auto;margin:0;padding-left:18px}';
  function ensureCss() { if (document.getElementById('xd-css')) return; var s = document.createElement('style'); s.id = 'xd-css'; s.textContent = CSS; document.head.appendChild(s); }
  function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* importTable({title, intro, spec, file, ctx, render(rec)->cells[], columns[], applyLabel, onApply(records, info)}) */
  async function importTable(o) {
    ensureCss();
    var book; if (o.book) book = o.book; else try { book = await readFile(o.file); } catch (e) { return fail(e.message); }
    var sheets = book.sheets.filter(function (s) { return s.rows.length; });
    if (!sheets.length) return fail('The file is empty.');
    // pick the sheet whose header matches best
    var scored = sheets.map(function (s) { return { s: s, t: findTable(s.rows, o.spec) }; }).sort(function (a, b) { return b.t.score - a.t.score; });
    var st = { sheet: scored[0].s, hdr: Math.max(0, scored[0].t.row), map: Object.assign({}, scored[0].t.map), auto: Object.assign({}, scored[0].t.map) };
    var back = document.createElement('div'); back.className = 'xd-back'; document.body.appendChild(back);
    function close() { back.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    function draw() {
      var rows = st.sheet.rows, hdr = rows[st.hdr] || [], width = 0; rows.slice(st.hdr, st.hdr + 60).forEach(function (r) { width = Math.max(width, r.length); });
      var res = extract(rows, o.spec, st.hdr, st.map, o.ctx);
      var colOpts = function (sel) { var h = '<option value="">— not in file —</option>'; for (var c = 0; c < width; c++) h += '<option value="' + c + '"' + (String(sel) === String(c) ? ' selected' : '') + '>' + colName(c) + (hdr[c] !== '' && hdr[c] != null ? ' · ' + esc(toText(hdr[c]).slice(0, 28)) : '') + '</option>'; return h; };
      var h = '<header><div><h2>' + esc(o.title) + '</h2><p class="small muted" style="margin:4px 0 0">' + esc(book.name) + (o.intro ? ' · ' + esc(o.intro) : '') + '</p></div><button class="btn ghost" data-x="close" aria-label="Close">✕</button></header><div class="body">';
      h += '<div class="top"><label>Sheet<select data-x="sheet">' + sheets.map(function (s, i) { return '<option value="' + i + '"' + (s === st.sheet ? ' selected' : '') + '>' + esc(s.name) + ' (' + s.rows.length + ' rows)</option>'; }).join('') + '</select></label>' +
        '<label>Header row<select data-x="hdr">' + rows.slice(0, 40).map(function (r, i) { return '<option value="' + i + '"' + (i === st.hdr ? ' selected' : '') + '>Row ' + (i + 1) + ': ' + esc(r.filter(function (x) { return x !== ''; }).slice(0, 4).map(toText).join(' · ').slice(0, 60)) + '</option>'; }).join('') + '</select></label></div>';
      h += '<div><p class="small muted" style="margin:0 0 8px">Which column holds what. Green = found by itself. Change any of them and the preview updates.</p><div class="maps">' + o.spec.fields.map(function (f) {
        return '<label class="' + (f.required ? 'req ' : '') + (st.auto[f.key] != null && String(st.auto[f.key]) === String(st.map[f.key]) ? 'auto' : '') + '"><span>' + esc(f.label) + '</span><select data-f="' + f.key + '">' + colOpts(st.map[f.key]) + '</select></label>';
      }).join('') + '</div></div>';
      h += '<p class="sum" style="margin:0"><b>' + res.records.length + '</b> row' + (res.records.length === 1 ? '' : 's') + ' ready' + (res.skipped.length ? ' · <b>' + res.skipped.length + '</b> skipped' : '') + '</p>';
      if (res.records.length) {
        var cols = o.columns || o.spec.fields.map(function (f) { return f.label; });
        h += '<div class="tablewrap" style="max-height:320px"><table><thead><tr><th>Row</th>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          res.records.slice(0, 200).map(function (r) { var cells = o.render ? o.render(r) : o.spec.fields.map(function (f) { return r[f.key]; }); return '<tr><td class="muted">' + r._row + '</td>' + cells.map(function (c) { var bad = c && c.bad; return '<td' + (bad ? ' class="bad"' : '') + '>' + esc(c && c.v !== undefined ? c.v : c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
      } else h += '<div class="callout q">Nothing could be read with these columns yet. Pick the sheet, the header row and the columns above.</div>';
      if (res.skipped.length) h += '<details><summary>Why rows were skipped</summary><ul class="skips">' + res.skipped.slice(0, 80).map(function (s) { return '<li>Row ' + s.row + ': ' + esc(s.why) + '</li>'; }).join('') + '</ul></details>';
      h += '</div><footer><span class="small muted" style="margin-right:auto">Nothing is saved until you press ' + esc(o.applyLabel || 'Use these rows') + '.</span><button class="btn" data-x="close">Cancel</button><button class="btn primary" data-x="apply"' + (res.records.length ? '' : ' disabled') + '>' + esc(o.applyLabel || 'Use these rows') + '</button></footer>';
      back.innerHTML = '<div class="xd" role="dialog" aria-modal="true" aria-label="' + esc(o.title) + '">' + h + '</div>';
      back.querySelectorAll('[data-x="close"]').forEach(function (b) { b.onclick = close; });
      back.querySelector('[data-x="sheet"]').onchange = function (e) { st.sheet = sheets[+e.target.value]; var t = findTable(st.sheet.rows, o.spec); st.hdr = Math.max(0, t.row); st.map = Object.assign({}, t.map); st.auto = Object.assign({}, t.map); draw(); };
      back.querySelector('[data-x="hdr"]').onchange = function (e) { st.hdr = +e.target.value; var hs = headerScore(st.sheet.rows[st.hdr] || [], o.spec); st.map = Object.assign({}, hs.map); st.auto = Object.assign({}, hs.map); draw(); };
      back.querySelectorAll('[data-f]').forEach(function (s) { s.onchange = function () { st.map[s.dataset.f] = s.value === '' ? null : +s.value; draw(); }; });
      var ap = back.querySelector('[data-x="apply"]'); if (ap) ap.onclick = function () { close(); o.onApply(res.records, { file: book.name, sheet: st.sheet.name, skipped: res.skipped }); };
    }
    draw();
    function fail(msg) { if (o.onError) o.onError(msg); else if (root.ATIC) root.ATIC.toast(msg); }
  }

  root.ATICExcel = { ensureCss: ensureCss, readFile: readFile, importTable: importTable, planGrid: planGrid, parse: { toNumber: toNumber, toDate: toDate, productOf: productOf, sizeOf: sizeOf, matchName: matchName, findTable: findTable, extract: extract, parseCsv: parseCsv, fillMerges: fillMerges, cellDate: cellDate, planGrid: planGrid } };
})(typeof window !== 'undefined' ? window : globalThis);
