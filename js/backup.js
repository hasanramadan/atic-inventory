/* Daily backup of ALL the website's data.
   - Once a day (first visit by someone who can edit) a full copy is saved in the database (planner_docs, coll "backup", id = date).
     The last KEEP days are kept; older copies are deleted.
   - The creator's computer downloads one zip a day: a folder per day (the last KEEP days), each with every page's data.
   - "⬇ Backup" (under your name in the menu) downloads the same zip any time. */
(function () {
  var A = window.ATIC; if (!A) return;
  var KEEP = 7, today = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  function addDays(d, n) { var t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

  async function snapshot() {
    var a = await A.sb.from('app_docs').select('name,data,saved_at,saved_by_name'); if (a.error) throw a.error;
    var p = await A.sb.from('planner_docs').select('coll,id,data,saved_at').neq('coll', 'backup'); if (p.error) throw p.error;
    var s = { date: today, at: new Date().toISOString(), by: (A.profile && (A.profile.full_name || A.profile.username)) || '', app: {}, planner: {} };
    (a.data || []).forEach(function (d) { s.app[d.name] = { data: d.data, saved_at: d.saved_at, saved_by: d.saved_by_name }; });
    (p.data || []).forEach(function (d) { (s.planner[d.coll] = s.planner[d.coll] || {})[d.id] = d.data; });
    return s;
  }
  async function daily() {
    if (!A.canWrite) return false;
    var have = await A.sb.from('planner_docs').select('id').eq('coll', 'backup'); if (have.error) return false;
    var ids = (have.data || []).map(function (x) { return x.id; });
    if (ids.indexOf(today) < 0) { var s = await snapshot(); await A.planner.set('backup', today, s); ids.push(today); }
    var cut = addDays(today, -(KEEP - 1));
    for (var i = 0; i < ids.length; i++) if (ids[i] < cut) { try { await A.planner.del('backup', ids[i]); } catch (e) {} }
    return true;
  }
  async function download() {
    if (!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    var r = await A.sb.from('planner_docs').select('id,data').eq('coll', 'backup'); if (r.error) throw r.error;
    var list = (r.data || []).filter(function (x) { return x.data && x.data.app; }).sort(function (a, b) { return a.id < b.id ? 1 : -1; });
    if (!list.length) list = [{ id: today, data: await snapshot() }];
    var zip = new JSZip();
    zip.file('README.txt', 'ATIC Oman · data backup made ' + new Date().toLocaleString('en-GB') + '\r\n\r\nOne folder per day (the last ' + KEEP + ' days). In each day:\r\n  pages/   the data of every page (inventory, stock, orders, plan, recipes, materials, settings, ...)\r\n  line-planner/   forecasts (plans), actuals and model, one file per day and section\r\n  team/   messages and tasks\r\nFiles are JSON: they open in any text editor, and the website can be restored from them.\r\n');
    list.forEach(function (b) {
      var f = zip.folder(b.id), s = b.data;
      Object.keys(s.app || {}).forEach(function (k) { f.file('pages/' + k + '.json', JSON.stringify(s.app[k], null, 1)); });
      Object.keys(s.planner || {}).forEach(function (c) { var dir = c === 'team' ? 'team/' : 'line-planner/' + c + '/'; Object.keys(s.planner[c]).forEach(function (id) { f.file(dir + String(id).replace(/[\\/:*?"<>|]/g, '_') + '.json', JSON.stringify(s.planner[c][id], null, 1)); }); });
      f.file('saved.txt', 'Saved ' + (s.at || '') + (s.by ? ' (opened by ' + s.by + ')' : ''));
    });
    var blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ATIC backup ' + today + '.zip'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return list.length;
  }
  A.backup = { daily: daily, download: download, snapshot: snapshot };

  function mount() {
    var chip = document.querySelector('.userchip'); if (!chip || chip.querySelector('.bk')) return;
    if (!(A.profile.is_owner || A.profile.role === 'admin')) return;
    var b = document.createElement('a'); b.href = '#'; b.className = 'switch bk'; b.textContent = '⬇ Backup (zip)'; b.title = 'Download all the data: a folder per day, last ' + KEEP + ' days';
    b.onclick = function (e) { e.preventDefault(); b.textContent = 'Preparing…'; download().then(function (n) { b.textContent = '⬇ Backup (zip) ✓ ' + n + ' day' + (n === 1 ? '' : 's'); }, function (er) { b.textContent = '⬇ Backup (zip)'; alert('Backup failed: ' + (er.message || er)); }); };
    var so = chip.querySelector('#signOut'); chip.insertBefore(b, so || null);
  }
  (function wait() {
    if (!A.profile) { setTimeout(wait, 500); return; }
    mount();
    setTimeout(function () {
      daily().then(function () {
        var key = 'aticBackupDl'; var last = ''; try { last = localStorage.getItem(key) || ''; } catch (e) {}
        if (A.profile.is_owner && last !== today) download().then(function () { try { localStorage.setItem(key, today); } catch (e) {} }, function () {});
      }, function () {});
    }, 4000); /* after the page has loaded */
  })();
})();
