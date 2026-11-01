/* ATIC Import / Export: one button on every page.
   Export: the tables on the screen, or a report a page registers, as Excel (.xlsx), PDF or Word (.doc).
   Import: the files a page knows how to read (inventory, factory plan, orders, daily Word reports …).
   Pages register with ATIC.io.register({ exports:[{label, build()}], imports:[{label, hint, accept, run(file)}] }).
   A report is { title, subtitle, sections:[{ title, note, columns:[…], rows:[[…]] }] }. */
(function () {
  var A = window.ATIC; if (!A) return;
  var REG = { exports: [], imports: [] };
  var CDN = {
    xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
  };
  function load(src) {
    return new Promise(function (ok, bad) {
      if (document.querySelector('script[src="' + src + '"]')) { var t = 0, i = setInterval(function () { if ((src === CDN.xlsx && window.XLSX) || (src === CDN.jspdf && window.jspdf) || (src === CDN.autotable && window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable) || ++t > 100) { clearInterval(i); ok(); } }, 50); return; }
      var s = document.createElement('script'); s.src = src; s.onload = function () { ok(); }; s.onerror = function () { bad(new Error('Could not load the export tool. Check the internet connection.')); }; document.head.appendChild(s);
    });
  }
  var esc = A.esc;
  function stamp() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fname(title, ext) { return ('ATIC ' + title).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() + ' ' + stamp() + '.' + ext; }
  function cellVal(v) { if (v == null) return ''; if (typeof v === 'number') return v; var s = String(v).trim(); if (/^-?[\d,]+(\.\d+)?$/.test(s) && s.length < 16) { var n = +s.replace(/,/g, ''); if (isFinite(n)) return n; } return s; }

  /* ---------- read what is on the screen ---------- */
  function cellText(td) {
    var c = td.cloneNode(true);
    c.querySelectorAll('input,select,textarea').forEach(function (el, i) {
      var orig = td.querySelectorAll('input,select,textarea')[i], v = '';
      if (orig.type === 'checkbox' || orig.type === 'radio') v = orig.checked ? '✓' : '';
      else if (orig.tagName === 'SELECT') v = orig.options[orig.selectedIndex] ? orig.options[orig.selectedIndex].text : '';
      else v = orig.value;
      el.replaceWith(document.createTextNode(v));
    });
    c.querySelectorAll('button,script,style').forEach(function (b) { b.remove(); });
    c.querySelectorAll('br').forEach(function (b) { b.replaceWith(document.createTextNode(' · ')); });
    return c.textContent.replace(/\s+/g, ' ').replace(/^ · | · $/g, '').trim();
  }
  function pageReport() {
    var main = document.getElementById('main') || document.body, secs = [];
    var h1 = main.querySelector('h1'), title = h1 ? h1.textContent.trim() : document.title;
    main.querySelectorAll('table').forEach(function (t, k) {
      if (t.closest('[hidden]') || t.closest('.xd-back') || t.offsetParent === null) return;
      var head = [], rows = [];
      var hr = t.querySelector('thead tr'); if (hr) head = [].map.call(hr.children, function (th) { return th.textContent.replace(/\s+/g, ' ').trim(); });
      t.querySelectorAll('tbody tr').forEach(function (tr) { var r = [].map.call(tr.children, cellText); if (r.some(function (x) { return x !== ''; })) rows.push(r); });
      if (!head.length && rows.length) head = rows.shift();
      // drop empty trailing action columns
      while (head.length && head[head.length - 1] === '' && rows.every(function (r) { return !r[head.length - 1]; })) { head.pop(); rows.forEach(function (r) { r.length = Math.min(r.length, head.length); }); }
      var cap = null, p = t.closest('.panel,.tablewrap'); var prev = p ? p.previousElementSibling : null;
      var hh = (p && p.querySelector('h2,h3')) || (prev && /^H[1-4]$/.test(prev.tagName) ? prev : null) || (prev && prev.querySelector && prev.querySelector('h2,h3'));
      cap = hh ? hh.textContent.trim() : 'Table ' + (k + 1);
      if (rows.length) secs.push({ title: cap, columns: head, rows: rows.map(function (r) { return r.map(cellVal); }) });
    });
    var sub = main.querySelector('.top .sub');
    return { title: title, subtitle: (sub ? sub.textContent.trim() + ' · ' : '') + 'exported ' + new Date().toLocaleString('en-GB'), sections: secs };
  }

  /* ---------- writers ---------- */
  async function toExcel(rep) {
    await load(CDN.xlsx); var X = window.XLSX, wb = X.utils.book_new(), used = {};
    if (!rep.sections.length) throw new Error('There is no table to export on this view.');
    rep.sections.forEach(function (s, i) {
      var aoa = [[rep.title + (rep.sections.length > 1 ? ' · ' + s.title : '')], [rep.subtitle || '']];
      if (s.note) aoa.push([s.note]); aoa.push([]); aoa.push(s.columns); s.rows.forEach(function (r) { aoa.push(r); });
      var ws = X.utils.aoa_to_sheet(aoa);
      ws['!cols'] = s.columns.map(function (c, j) { var w = String(c || '').length; s.rows.forEach(function (r) { w = Math.max(w, String(r[j] == null ? '' : r[j]).length); }); return { wch: Math.min(60, Math.max(8, w + 2)) }; });
      var n = String(s.title || 'Sheet ' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || 'Sheet'; var base = n, k = 2; while (used[n.toLowerCase()]) n = base.slice(0, 25) + ' ' + (k++); used[n.toLowerCase()] = 1;
      X.utils.book_append_sheet(wb, ws, n);
    });
    X.writeFile(wb, fname(rep.title, 'xlsx'));
  }
  async function toPdf(rep) {
    await load(CDN.jspdf); await load(CDN.autotable);
    if (!rep.sections.length) throw new Error('There is no table to export on this view.');
    var wide = rep.sections.some(function (s) { return s.columns.length > 6; });
    var doc = new window.jspdf.jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' }), W = doc.internal.pageSize.getWidth();
    doc.setFillColor(20, 83, 45); doc.rect(0, 0, W, 54, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('ATIC OMAN · ' + rep.title, 36, 34);
    doc.setTextColor(90); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(doc.splitTextToSize(rep.subtitle || '', W - 72), 36, 72);
    var y = 90;
    rep.sections.forEach(function (s) {
      if (y > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); y = 40; }
      doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(String(s.title || ''), 36, y); y += 6;
      if (s.note) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100); var nl = doc.splitTextToSize(s.note, W - 72); doc.text(nl, 36, y + 10); y += 10 * nl.length + 4; }
      doc.autoTable({ startY: y + 4, head: [s.columns], body: s.rows.map(function (r) { return r.map(function (v) { return typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v == null ? '' : v).replace(/[^\x00-\xFF·–—’]/g, ''); }); }),
        styles: { fontSize: 7.5, cellPadding: 3, overflow: 'linebreak' }, headStyles: { fillColor: [20, 83, 45], textColor: 255 }, alternateRowStyles: { fillColor: [244, 247, 245] }, margin: { left: 36, right: 36 },
        didDrawPage: function () { doc.setFontSize(8); doc.setTextColor(150); doc.text('ATIC Oman · ' + stamp() + ' · page ' + doc.internal.getNumberOfPages(), 36, doc.internal.pageSize.getHeight() - 16); } });
      y = doc.lastAutoTable.finalY + 26;
    });
    doc.save(fname(rep.title, 'pdf'));
  }
  function toWord(rep) {
    if (!rep.sections.length) throw new Error('There is no table to export on this view.');
    var h = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + esc(rep.title) + '</title>' +
      '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->' +
      '<style>@page{size:' + (rep.sections.some(function (s) { return s.columns.length > 6; }) ? '29.7cm 21cm;mso-page-orientation:landscape' : '21cm 29.7cm') + ';margin:1.6cm}body{font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#1b2a22}h1{font-size:18pt;color:#14532d;margin:0}h2{font-size:12.5pt;color:#14532d;margin:16pt 0 4pt}p.s{color:#667;margin:2pt 0 10pt}table{border-collapse:collapse;width:100%}th{background:#14532d;color:#fff;text-align:left;padding:4pt;font-size:9pt}td{border:1px solid #d5ddd8;padding:3.5pt;font-size:9pt;vertical-align:top}td.n{text-align:right}</style></head><body>' +
      '<h1>ATIC Oman · ' + esc(rep.title) + '</h1><p class="s">' + esc(rep.subtitle || '') + '</p>';
    rep.sections.forEach(function (s) {
      h += '<h2>' + esc(s.title || '') + '</h2>' + (s.note ? '<p class="s">' + esc(s.note) + '</p>' : '') + '<table><thead><tr>' + s.columns.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        s.rows.map(function (r) { return '<tr>' + r.map(function (v) { return '<td' + (typeof v === 'number' ? ' class="n"' : '') + '>' + esc(typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    });
    h += '</body></html>';
    A.download(fname(rep.title, 'doc'), '﻿' + h, 'application/msword');
  }
  async function exportReport(rep, fmt) {
    try { if (fmt === 'xlsx') await toExcel(rep); else if (fmt === 'pdf') await toPdf(rep); else toWord(rep); A.toast('Exported ' + rep.title); }
    catch (e) { A.toast(e.message || String(e)); }
  }

  /* ---------- the button and its panel ---------- */
  var CSS = '.io-fab{position:fixed;right:18px;bottom:18px;z-index:40;display:inline-flex;gap:8px;align-items:center;background:var(--brand);color:var(--brand-ink);border:0;border-radius:999px;padding:11px 18px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.22);cursor:pointer}' +
    '.io-fab:hover{filter:brightness(1.08)}.io-back{position:fixed;inset:0;background:rgba(10,20,16,.5);z-index:60;display:flex;justify-content:flex-end}' +
    '.io-pan{background:var(--surface);color:var(--ink);width:min(440px,100%);height:100%;overflow:auto;padding:20px 22px;display:flex;flex-direction:column;gap:16px;box-shadow:-10px 0 40px rgba(0,0,0,.25)}' +
    '.io-pan h2{font-size:19px;margin:0}.io-pan h3{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin:0 0 8px}.io-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line)}' +
    '.io-row b{font-size:14px}.io-row small{display:block;color:var(--muted);font-size:12px;margin-top:2px}.io-fmt{display:flex;gap:6px;flex-shrink:0}.io-fmt button,.io-fmt label{border:1px solid var(--line);background:var(--surface);border-radius:8px;padding:6px 10px;font-size:12.5px;font-weight:600;cursor:pointer}' +
    '.io-ptbar{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:70;background:var(--brand);color:var(--brand-ink);border-radius:999px;padding:9px 10px 9px 18px;display:flex;gap:12px;align-items:center;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.25)}.io-ptbar button{border:0;border-radius:999px;padding:5px 12px;background:rgba(255,255,255,.18);color:inherit;cursor:pointer;font-weight:600}' +
    '.io-pthover{outline:3px solid var(--gold)!important;outline-offset:3px;cursor:crosshair!important;border-radius:12px}' +
    '.io-ptsel{outline:3px solid var(--brand)!important;outline-offset:3px;border-radius:12px;position:relative}' +
    '.io-ptsel,.io-pt,[data-ptn]{overflow:visible!important}[data-ptn]{position:relative}[data-ptn]::after{content:attr(data-ptn);position:absolute;top:-10px;left:-10px;width:24px;height:24px;border-radius:50%;background:var(--gold);color:#1b1306;font:700 12px/24px var(--f-mono);text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.25);z-index:5}' +
    'tr[data-ptn]::after{left:4px;top:4px}.io-ptbar button.go{background:var(--gold);color:#1b1306}' +
    '@keyframes ioPt{0%,100%{box-shadow:0 0 0 0 rgba(212,160,23,.0)}50%{box-shadow:0 0 0 8px rgba(212,160,23,.45)}}.io-pt{outline:3px solid var(--gold)!important;outline-offset:3px;animation:ioPt 1.2s ease 3;border-radius:12px}' +
    '.io-fmt button:hover,.io-fmt label:hover{border-color:var(--brand)}.io-fmt label.pri{background:var(--brand);color:var(--brand-ink);border-color:var(--brand)}@media print{.io-fab{display:none}}';
  function fmtBtns(key) { return '<div class="io-fmt"><button data-io="' + key + '" data-f="xlsx">Excel</button><button data-io="' + key + '" data-f="pdf">PDF</button><button data-io="' + key + '" data-f="doc">Word</button></div>'; }
  /* pages that register nothing still get their own file buttons listed (e.g. the daily Word report on the Line Planner) */
  function pageImports() {
    if (REG.imports.length) return REG.imports;
    var out = [], main = document.getElementById('main') || document.body;
    main.querySelectorAll('input[type=file]').forEach(function (inp) {
      var lab = inp.id ? document.querySelector('label[for="' + inp.id + '"]') : null, t = (lab ? lab.textContent : inp.getAttribute('aria-label') || inp.title || 'File').replace(/\s+/g, ' ').trim();
      out.push({ label: t, accept: inp.accept, multiple: inp.multiple, run: function (files) { var dt = new DataTransfer(); [].concat(files).forEach(function (f) { dt.items.add(f); }); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); } });
    });
    return out;
  }
  function open() {
    var IMPS = pageImports();
    var back = document.createElement('div'); back.className = 'io-back'; document.body.appendChild(back);
    var h = '<div class="io-pan" role="dialog" aria-modal="true" aria-label="Import and export"><div style="display:flex;justify-content:space-between;align-items:center"><h2>Import / Export</h2><button class="btn ghost" data-x="close" aria-label="Close">✕</button></div>';
    if (A.allowed(A.profile, 'team') && A.page !== 'team') { var cur = location.pathname.split('/').pop() + location.hash, h1 = (document.querySelector('#main h1') || {}).textContent || document.title; h += '<div><h3>Share to Team</h3><div class="io-row"><div><b>📍 Point at something</b><small>Click the card, row or tile you mean; the team sees it with its numbers and lands right on it</small></div><div class="io-fmt"><button data-x="point" class="pri" style="background:var(--brand);color:var(--brand-ink);border-color:var(--brand)">Point</button></div></div><div class="io-row"><div><b>This whole page</b><small>A card that opens this view</small></div><div class="io-fmt"><a class="btn" style="text-decoration:none;font-size:12.5px;padding:6px 10px" href="team.html?share=' + encodeURIComponent(cur) + '&title=' + encodeURIComponent(String(h1).trim()) + '">Share</a></div></div></div>'; }
    h += '<div><h3>Export</h3><div class="io-row"><div><b>This view</b><small>Every table on the screen right now</small></div>' + fmtBtns('page') + '</div>' +
      REG.exports.map(function (e, i) { return '<div class="io-row"><div><b>' + esc(e.label) + '</b>' + (e.hint ? '<small>' + esc(e.hint) + '</small>' : '') + '</div>' + fmtBtns(i) + '</div>'; }).join('') + '</div>';
    if (IMPS.length) h += '<div><h3>Import</h3>' + IMPS.map(function (m, i) { return '<div class="io-row"><div><b>' + esc(m.label) + '</b>' + (m.hint ? '<small>' + esc(m.hint) + '</small>' : '') + '</div><div class="io-fmt"><label class="pri" for="ioIn' + i + '">Choose file</label><input type="file" id="ioIn' + i + '" data-imp="' + i + '" accept="' + esc(m.accept || '.xlsx,.xls,.xlsm,.csv') + '"' + (m.multiple ? ' multiple' : '') + ' hidden></div></div>'; }).join('') + '</div>';
    else h += '<p class="small muted" style="margin:0">Nothing to import on this page.</p>';
    if (!A.canWrite && IMPS.length) h += '<p class="small muted" style="margin:0">You have view access: imports show a preview but cannot be saved.</p>';
    h += '<p class="small muted" style="margin:auto 0 0">Excel opens in Excel or Google Sheets. Word files open in Word. PDFs are ready to print or send.</p></div>';
    back.innerHTML = h;
    function close() { back.remove(); }
    back.onclick = function (e) { if (e.target === back) close(); };
    back.querySelector('[data-x="close"]').onclick = close;
    var pb = back.querySelector('[data-x="point"]'); if (pb) pb.onclick = function () { close(); pointMode(); };
    back.querySelectorAll('[data-io]').forEach(function (b) { b.onclick = function () { var k = b.dataset.io, rep; try { rep = k === 'page' ? pageReport() : REG.exports[+k].build(); } catch (e) { A.toast(e.message || String(e)); return; } close(); exportReport(rep, b.dataset.f); }; });
    back.querySelectorAll('[data-imp]').forEach(function (inp) { inp.onchange = function () { var files = [].slice.call(inp.files); if (!files.length) return; close(); var m = IMPS[+inp.dataset.imp]; m.run(m.multiple ? files : files[0]); }; });
  }
  /* ---------- 📍 point at something ---------- */
  var PT_SEL = '.card[data-m], tr[data-iid], .kpi, tbody tr, .fc, .panel, .cards .card';
  function ptTarget(el) { if (!el || !el.closest) return null; var m = el.closest('#main') ? el.closest(PT_SEL) : null; return m && m.closest('#main') ? m : null; }
  function clean(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }
  function ptCapture(el) {
    var label = '', detail = [], anchor = '';
    if (el.dataset.m) anchor = 'm:' + el.dataset.m; else if (el.dataset.iid) anchor = 'i:' + el.dataset.iid;
    var hh = el.querySelector('h2,h3,.l,td b,b,strong');
    label = clean(hh ? hh.textContent : el.textContent).slice(0, 60);
    var dts = el.querySelectorAll('dl dt'); if (dts.length) dts.forEach(function (dt) { var dd = dt.nextElementSibling; if (dd) detail.push(clean(dt.textContent) + ' ' + clean(dd.textContent)); });
    var chip = el.querySelector('.chip'); if (chip) detail.unshift(clean(chip.textContent));
    if (el.classList.contains('kpi')) detail = [clean(el.textContent).replace(label, '').trim()];
    if (el.tagName === 'TR') { var cells = [].map.call(el.children, function (td) { return clean(td.textContent); }).filter(Boolean); label = cells[0].slice(0, 60); var head = el.closest('table') ? [].map.call(el.closest('table').querySelectorAll('thead th'), function (th) { return clean(th.textContent); }) : []; detail = cells.slice(1, 6).map(function (c, k) { return (head[k + 1] ? head[k + 1] + ' ' : '') + c; }); }
    if (!detail.length) detail = [clean(el.textContent).replace(label, '').slice(0, 140)];
    if (!anchor) anchor = 't:' + label;
    var il = el.querySelector('.invline'); if (il) detail.push([].map.call(il.children, function (c) { return clean(c.textContent); }).filter(Boolean).join(' · '));
    return { anchor: anchor, label: label, detail: detail.filter(Boolean).join(' · ').slice(0, 220) };
  }
  function pointMode() {
    var picked = [];
    var bar = document.createElement('div'); bar.className = 'io-ptbar'; document.body.appendChild(bar);
    function drawBar() {
      bar.innerHTML = '<span>📍 ' + (picked.length ? '<b>' + picked.length + '</b> selected · click more, or click one again to remove' : 'Click everything you want to point at') + '</span>' +
        (picked.length ? '<button type="button" data-pt="share" class="go">Share ' + picked.length + ' to Team</button>' : '') + '<button type="button" data-pt="cancel">Cancel</button>';
      picked.forEach(function (p, k) { p.el.setAttribute('data-ptn', k + 1); });
    }
    var last = null;
    function over(e) { var t = ptTarget(e.target); if (t === last) return; if (last) last.classList.remove('io-pthover'); last = t; if (t) t.classList.add('io-pthover'); }
    function stop() { document.removeEventListener('mouseover', over, true); document.removeEventListener('click', pick, true); document.removeEventListener('keydown', key, true); if (last) last.classList.remove('io-pthover'); picked.forEach(function (p) { p.el.classList.remove('io-ptsel'); p.el.removeAttribute('data-ptn'); }); bar.remove(); }
    function key(e) { if (e.key === 'Escape') stop(); if (e.key === 'Enter' && picked.length) { e.preventDefault(); share(); } }
    function share() {
      var page = location.pathname.split('/').pop() || 'index.html', hash = location.hash, h1 = clean((document.querySelector('#main h1') || {}).textContent || document.title);
      var items = picked.map(function (p) { return p.c; });
      var href = page + '?pt=' + items.map(function (c) { return encodeURIComponent(c.anchor); }).join(',') + hash;
      try { sessionStorage.setItem('aticPts', JSON.stringify({ href: href, title: h1, items: items.map(function (c) { return { label: c.label, detail: c.detail }; }) })); } catch (e) {}
      stop();
      location.href = 'team.html?share=' + encodeURIComponent(href) + '&title=' + encodeURIComponent(h1) + '&pts=1' + (items.length === 1 ? '&ptl=' + encodeURIComponent(items[0].label) + '&ptd=' + encodeURIComponent(items[0].detail) : '');
    }
    function pick(e) {
      var b = e.target.closest && e.target.closest('.io-ptbar button');
      if (b) { e.preventDefault(); e.stopPropagation(); if (b.dataset.pt === 'share') share(); else stop(); return; }
      if (bar.contains(e.target)) return;
      var t = ptTarget(e.target); if (!t) return; e.preventDefault(); e.stopPropagation();
      var k = picked.map(function (p) { return p.el; }).indexOf(t);
      if (k >= 0) { picked.splice(k, 1); t.classList.remove('io-ptsel'); t.removeAttribute('data-ptn'); }
      else if (picked.length < 12) { picked.push({ el: t, c: ptCapture(t) }); t.classList.add('io-ptsel'); }
      drawBar();
    }
    drawBar();
    document.addEventListener('mouseover', over, true); document.addEventListener('click', pick, true); document.addEventListener('keydown', key, true);
  }
  /* arriving from a pointer: find it, scroll to it, highlight it */
  function ptArrive() {
    var q = new URLSearchParams(location.search), raw = q.get('pt'); if (!raw) return;
    var list = raw.split(',').map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } }).filter(Boolean);
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
    function find(a) {
      var kind = a.slice(0, 2), v = a.slice(2);
      if (kind === 'm:') return document.querySelector('.card[data-m="' + window.CSS.escape(v) + '"]');
      if (kind === 'i:') return document.querySelector('tr[data-iid="' + window.CSS.escape(v) + '"]');
      return [].filter.call(document.querySelectorAll('#main ' + PT_SEL.split(', ').join(', #main ')), function (x) { return clean(x.textContent).indexOf(v) === 0 || clean((x.querySelector('h2,h3,.l,td b,b,strong') || {}).textContent) === v; }).pop();
    }
    var tries = 0, t = setInterval(function () {
      var els = list.map(find), got = els.filter(Boolean);
      if (got.length === list.length || (++tries > 60 && got.length)) {
        clearInterval(t);
        got.forEach(function (el, k) { el.hidden = false; el.classList.add('io-pt'); if (got.length > 1) el.setAttribute('data-ptn', k + 1); });
        got[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function () { got.forEach(function (el) { el.classList.remove('io-pt'); el.removeAttribute('data-ptn'); }); }, 8000);
      } else if (tries > 60) clearInterval(t);
    }, 150);
  }
  function mount() {
    if (document.getElementById('ioFab') || !document.getElementById('rail')) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var b = document.createElement('button'); b.className = 'io-fab'; b.id = 'ioFab'; b.type = 'button'; b.innerHTML = '<span aria-hidden="true">⇅</span> Import / Export'; b.onclick = open; document.body.appendChild(b);
  }
  A.io = {
    register: function (o) { (o.exports || []).forEach(function (e) { REG.exports.push(e); }); (o.imports || []).forEach(function (e) { REG.imports.push(e); }); mount(); },
    exportReport: exportReport, pageReport: pageReport, mount: mount, open: open
  };
  // show the button once the page is signed in (the rail is drawn by ATIC.boot)
  var tries = 0, t = setInterval(function () { if (A.profile && document.getElementById('rail') && document.getElementById('rail').innerHTML) { mount(); ptArrive(); clearInterval(t); } else if (++tries > 600) clearInterval(t); }, 100);
})();
