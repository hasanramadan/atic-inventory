/* ATIC Lab inside the website: gives the lab app its records from the website's database (Supabase, table planner_docs,
   collections "lab_<name>"), live for everyone, plus uploads (photos kept small) and downloads.
   The lab runs in a frame of lab.html, so it uses the website's sign-in (parent.ATIC). */
(function () {
  var P = window.parent && window.parent !== window ? window.parent : null;
  if (!P || !P.ATIC) { location.replace('lab.html'); return; }
  var A = P.ATIC, sb = A.sb, PRE = 'lab_';
  window.ATIC_PARENT = A;

  /* ---------- records: a small Firestore-like layer over planner_docs ---------- */
  var cache = {}, subs = {}, chan = null;
  function snapOf(coll) { var m = cache[coll] || {}; var docs = Object.keys(m).map(function (id) { return { id: id, exists: true, data: function () { return JSON.parse(JSON.stringify(m[id])); } }; }); return { docs: docs, size: docs.length, empty: !docs.length }; }
  async function load(coll) {
    var r = await sb.from('planner_docs').select('id,data').eq('coll', PRE + coll);
    if (r.error) throw r.error;
    var m = {}; (r.data || []).forEach(function (d) { m[d.id] = d.data || {}; }); cache[coll] = m; return m;
  }
  function fire(coll) { (subs[coll] || []).forEach(function (s) { try { s(); } catch (e) { console.error(e); } }); }
  /* safety net: realtime can miss events, so every 8 s re-read what is open and update only if it changed */
  setInterval(function () { if (document.hidden) return; Object.keys(subs).forEach(function (c) { if (c === 'plan' || !(subs[c] || []).length) return; var before = JSON.stringify(cache[c] || {}); load(c).then(function () { if (JSON.stringify(cache[c] || {}) !== before) fire(c); }, function () {}); }); }, 8000);
  function live() {
    if (chan) return;
    chan = sb.channel('lab-' + Math.random().toString(36).slice(2)).on('postgres_changes', { event: '*', schema: 'public', table: 'planner_docs' }, function (p) {
      var c = (p.new && p.new.coll) || (p.old && p.old.coll) || ''; if (c.indexOf(PRE) !== 0) return; c = c.slice(PRE.length);
      if (subs[c]) load(c).then(function () { fire(c); }, function () {});
    }).subscribe();
  }
  function err(e) { var x = new Error(e.message || String(e)); x.code = /row-level|42501|permission/i.test(e.message || '') ? 'no edit access' : (e.code || 'error'); return x; }
  function query(coll) {
    var q = { orderBy: function () { return q; }, limit: function () { return q; }, where: function () { return q; },
      get: function () { return load(coll).then(function () { return snapOf(coll); }); },
      onSnapshot: function (next, onErr) {
        var f = function () { next(snapOf(coll)); }; (subs[coll] = subs[coll] || []).push(f); live();
        if (coll === 'plan') factoryPlan().then(f, function () { f(); });
        else load(coll).then(f, function (e) { if (onErr) onErr(err(e)); });
        return function () { subs[coll] = (subs[coll] || []).filter(function (x) { return x !== f; }); };
      } };
    return q;
  }
  function docRef(path) {
    var p = path.split('/'), coll = p[0], id = p.slice(1).join('/');
    return {
      onSnapshot: function (next, onErr) {
        var f = function () { var d = (cache[coll] || {})[id]; next({ exists: d != null, id: id, data: function () { return d == null ? undefined : JSON.parse(JSON.stringify(d)); } }); };
        (subs[coll] = subs[coll] || []).push(f); live();
        load(coll).then(function () { if (coll === 'config' && !(cache.config || {}).main && window.ATIC_LAB_SEED) return docRef('config/main').set(window.ATIC_LAB_SEED).then(f, f); f(); }, function (e) { if (onErr) onErr(err(e)); });
        return function () { subs[coll] = (subs[coll] || []).filter(function (x) { return x !== f; }); };
      },
      get: function () { return load(coll).then(function () { var d = (cache[coll] || {})[id]; return { exists: d != null, id: id, data: function () { return d; } }; }); },
      set: async function (data) { var r = await sb.from('planner_docs').upsert({ coll: PRE + coll, id: id, data: data }); if (r.error) throw err(r.error); (cache[coll] = cache[coll] || {})[id] = data; fire(coll); },
      update: async function (data) { var cur = ((cache[coll] || {})[id]) || {}; return this.set(Object.assign({}, cur, data)); },
      delete: async function () { var r = await sb.from('planner_docs').delete().eq('coll', PRE + coll).eq('id', id); if (r.error) throw err(r.error); if (cache[coll]) delete cache[coll][id]; fire(coll); }
    };
  }
  /* the lab's "plan" = the factory plan of the website: batches per product and section for each day */
  async function factoryPlan() {
    var r = await sb.from('app_docs').select('data').eq('name', 'plan').maybeSingle(), pl = (r.data && r.data.data) || {}, out = {};
    Object.keys(pl.days || {}).forEach(function (d) { var m = d.slice(0, 7); (out[m] = out[m] || { days: {} }).days[d] = Object.assign({}, pl.days[d]); });
    cache.plan = out; return out;
  }
  var db = { doc: docRef, collection: query };

  /* ---------- uploads: photos are made small and kept with the record ---------- */
  function shrink(file) {
    return new Promise(function (res, rej) {
      if (!/^image\//.test(file.type)) { if (file.size > 900000) return rej(new Error('only photos, or files under 0.9 MB')); var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(file); return; }
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () { var k = Math.min(1, 1200 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', 0.72)); };
      img.onerror = function () { rej(new Error('could not read the photo')); }; img.src = u;
    });
  }
  var assets = { upload: function (file) { return shrink(file).then(function (url) { return { id: 'f' + Date.now().toString(36), url: url, contentType: /^data:([^;]+)/.exec(url)[1] }; }); } };
  var downloads = { save: function (o) { var a = document.createElement('a'); a.href = URL.createObjectURL(o.data); a.download = o.filename; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); return Promise.resolve(); } };

  window.claude = { use: function (n) { return Promise.resolve(n === 'db' ? db : n === 'assets' ? assets : n === 'downloads' ? downloads : null); } };

  /* ---------- who is signed in: the website account; lab role from Lab → People ---------- */
  window.LAB_ME = A.profile;
  window.LAB_ACCOUNTS = [];
  sb.from('profiles').select('id,full_name,username,role,areas,is_owner').then(function (r) { if (!r.error) window.LAB_ACCOUNTS = r.data || []; });
})();
