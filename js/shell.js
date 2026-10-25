/* ATIC Oman website shell: sign-in check, left rail, page access, shared data helpers. Every page loads this after config.js. */
(function () {
  var PAGES = [
    { key: 'results', href: 'results.html', label: 'Forecast Results' },
    { key: 'line', href: 'line.html', label: 'Line Planner' },
    { key: 'model', href: 'model.html', label: 'ATIC BETA 2.0', tag: '3D' },
    { key: 'materials', href: 'materials.html', label: 'Raw Materials' },
    { key: 'supply', href: 'supply.html', label: 'Supply Planner' },
    { key: 'admin', href: 'admin.html', label: 'Admin' }
  ];
  var ROLE = { admin: 'Admin', editor: 'Can edit', viewer: 'View only' };
  var CFG = window.ATIC_CONFIG || {};
  var sb = (window.supabase && CFG.url) ? window.supabase.createClient(CFG.url, CFG.key) : null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(s, r) { return (r || document).querySelector(s); }

  function allowed(profile, key) {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    if (key === 'admin') return false;
    if (!profile.tabs) return true;
    return profile.tabs.indexOf(key) >= 0;
  }
  /* pages in the person's own order (Admin chooses it per person); admins also see the pages left out, then Admin */
  function ordered(profile) {
    if (!profile) return [];
    var byKey = {}; PAGES.forEach(function (x) { byKey[x.key] = x; });
    var list = (profile.tabs || []).map(function (k) { return byKey[k]; }).filter(Boolean);
    if (!profile.tabs || profile.role === 'admin') PAGES.forEach(function (x) { if (list.indexOf(x) < 0 && x.key !== 'admin') list.push(x); });
    if (profile.role === 'admin') { list = list.filter(function (x) { return x.key !== 'admin'; }); list.push(byKey.admin); }
    return list.filter(function (x) { return allowed(profile, x.key); });
  }
  function firstPage(profile) { var p = ordered(profile)[0]; return p ? p.href : null; }

  var A = { sb: sb, PAGES: PAGES, ROLE: ROLE, esc: esc, allowed: allowed, ordered: ordered, firstPage: firstPage, profile: null, canWrite: false, page: null, subs: [] };

  function toast(t) {
    var el = $('#toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2800);
  }
  A.toast = toast;

  function curSub() { var h = location.hash.slice(1); return h || (A.subs[0] && A.subs[0].id) || ''; }
  function railHTML() {
    var p = A.profile, cur = curSub();
    var h = '<div class="logo"><div class="mark">AT</div><div><b>ATIC OMAN</b><small>Planning &amp; forecasting</small></div></div><nav id="shellNav" aria-label="Sections">';
    ordered(p).forEach(function (x) {
      var on = x.key === A.page;
      h += '<div class="part"><a class="p" href="' + x.href + '"' + (on ? ' aria-current="page"' : '') + '>' + esc(x.label) + (x.tag ? ' <span class="tagx">' + x.tag + '</span>' : '') + '</a>';
      if (on && A.subs.length) h += '<div class="subs">' + A.subs.map(function (s) { return '<a href="#' + s.id + '" data-sub="' + s.id + '"' + (s.id === cur ? ' aria-current="page"' : '') + '>' + esc(s.label) + (s.badge ? ' <span class="badge" id="sb_' + s.id + '"' + (s.badgeHidden ? ' hidden' : '') + '>' + esc(s.badge) + '</span>' : '') + '</a>'; }).join('') + '</div>';
      h += '</div>';
    });
    h += '</nav><div class="userchip"><b>' + esc(p.full_name || p.username) + '</b><span style="opacity:.75;font-size:12px">' + ROLE[p.role] + '</span><button id="signOut" type="button">Sign out</button></div>';
    return h;
  }
  function subbarHTML() {
    var cur = curSub();
    return A.subs.map(function (s) { return '<a href="#' + s.id + '" data-sub="' + s.id + '"' + (s.id === cur ? ' aria-current="page"' : '') + '>' + esc(s.label) + '</a>'; }).join('');
  }
  A.setSub = function (id) {
    document.querySelectorAll('[data-sub]').forEach(function (a) { a.setAttribute('aria-current', a.dataset.sub === id ? 'page' : 'false'); });
  };
  A.badge = function (id, text) { var b = document.getElementById('sb_' + id); if (b) { b.textContent = text || ''; b.hidden = !text; } };
  function drawRail() {
    var rail = $('#rail'); if (!rail) return;
    rail.innerHTML = railHTML();
    $('#signOut').onclick = A.signOut;
    var bar = $('#subbar'); if (bar) { bar.innerHTML = subbarHTML(); bar.hidden = !A.subs.length; }
  }
  window.addEventListener('hashchange', function () { A.setSub(curSub()); });

  A.signOut = async function () { try { await sb.auth.signOut(); } catch (e) {} location.replace('index.html'); };

  /* boot({page, subs}) → resolves with A when the person may see this page, or null after showing a message. */
  A.boot = async function (opts) {
    A.page = opts.page; A.subs = opts.subs || [];
    var main = $('#main');
    if (!sb) { if (main) main.innerHTML = '<div class="panel noacc"><h2>Could not load</h2><p class="muted">Check the internet connection and refresh the page.</p></div>'; return null; }
    var s = await sb.auth.getSession();
    if (!s.data || !s.data.session) { location.replace('index.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.hash)); return null; }
    var pr = await sb.from('profiles').select('*').eq('id', s.data.session.user.id).single();
    if (pr.error || !pr.data) { await sb.auth.signOut(); location.replace('index.html?err=noaccess'); return null; }
    A.profile = pr.data; A.session = s.data.session;
    A.canWrite = pr.data.role === 'admin' || pr.data.role === 'editor';
    drawRail();
    if (!allowed(A.profile, A.page)) {
      var where = firstPage(A.profile);
      if (main) main.innerHTML = '<div class="panel noacc"><h2 style="font-size:20px;margin-bottom:6px">No access to this page</h2><p class="muted" style="margin:0 0 14px">Hasan decides which pages each account can open. Ask him if you need this one.</p>' + (where ? '<a class="btn primary" href="' + where + '" style="text-decoration:none;display:inline-block">Go to my pages</a>' : '') + '</div>';
      return null;
    }
    return A;
  };

  /* ---------- shared data ---------- */
  A.docs = {
    loadAll: async function () { var r = await sb.from('app_docs').select('*'); if (r.error) throw r.error; var o = { data: {}, meta: {} }; r.data.forEach(function (d) { o.data[d.name] = d.data; o.meta[d.name] = d; }); return o; },
    save: async function (name, data) { var r = await sb.from('app_docs').upsert({ name: name, data: data }).select().single(); if (r.error) throw r.error; return r.data; },
    subscribe: function (cb) { return sb.channel('docs-' + Math.random().toString(36).slice(2)).on('postgres_changes', { event: '*', schema: 'public', table: 'app_docs' }, function () { cb(); }).subscribe(); }
  };
  A.planner = {
    list: async function (coll) { var r = await sb.from('planner_docs').select('id,data,saved_at,saved_by_name').eq('coll', coll); if (r.error) throw r.error; return r.data; },
    config: async function () {
      var r = await sb.from('planner_docs').select('id,data').eq('coll', 'config'); if (r.error) throw r.error;
      var o = {}; r.data.forEach(function (d) { o[d.id] = d.data; }); return o;
    },
    set: async function (coll, id, data) { var r = await sb.from('planner_docs').upsert({ coll: coll, id: id, data: data }); if (r.error) throw r.error; },
    del: async function (coll, id) { var r = await sb.from('planner_docs').delete().eq('coll', coll).eq('id', id); if (r.error) throw r.error; },
    subscribe: function (cb) { return sb.channel('pl-' + Math.random().toString(36).slice(2)).on('postgres_changes', { event: '*', schema: 'public', table: 'planner_docs' }, function (p) { cb(p); }).subscribe(); },
    /* The same small interface the Line Planner used inside Claude: collection(..).onSnapshot and doc('coll/id').set/delete */
    makeDb: function () {
      function wrapErr(e) { var x = new Error(e.message || String(e)); x.code = (e.code === '42501' || /row-level security/i.test(e.message || '')) ? 'permission_denied' : e.code; return x; }
      var subs = {}, chan = null;
      async function snap(coll) {
        var rows = await A.planner.list(coll);
        var docs = rows.map(function (r) { return { exists: true, id: r.id, data: function () { return r.data; } }; })
          .sort(function (a, b) { return (b.data().date || '').localeCompare(a.data().date || ''); });
        return { docs: docs, size: docs.length, empty: !docs.length };
      }
      async function fire(coll, onErr) { try { var s = await snap(coll); (subs[coll] || []).forEach(function (f) { f(s); }); } catch (e) { if (onErr) onErr(e); } }
      function q(coll) {
        var o = { orderBy: function () { return o; }, limit: function () { return o; }, where: function () { return o; }, get: function () { return snap(coll); },
          onSnapshot: function (next, onErr) {
            (subs[coll] = subs[coll] || []).push(next); fire(coll, onErr);
            if (!chan) chan = A.planner.subscribe(function (p) { var c = (p && (p.new && p.new.coll || p.old && p.old.coll)) || null; Object.keys(subs).forEach(function (k) { if (!c || c === k) fire(k); }); });
            return function () { subs[coll] = (subs[coll] || []).filter(function (f) { return f !== next; }); };
          } };
        return o;
      }
      return {
        collection: q,
        doc: function (path) { var parts = path.split('/'), coll = parts[0], id = parts[1]; return {
          set: async function (data) { try { await A.planner.set(coll, id, data); } catch (e) { throw wrapErr(e); } fire(coll); },
          delete: async function () { try { await A.planner.del(coll, id); } catch (e) { throw wrapErr(e); } fire(coll); }
        }; }
      };
    }
  };
  A.download = function (filename, data, type) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: type || 'text/csv' })); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  window.ATIC = A;
})();
