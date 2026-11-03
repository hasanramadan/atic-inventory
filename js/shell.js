/* ATIC Oman website shell: sign-in check, left rail, page access, shared data helpers. Every page loads this after config.js. */
(function () {
  var PAGES = [
    { key: 'results', href: 'results.html', label: 'Forecast Results' },
    { key: 'line', href: 'line.html', label: 'Line Planner' },
    { key: 'model', href: 'model.html', label: 'ATIC BETA 2.0', tag: '3D' },
    { key: 'materials', href: 'materials.html', label: 'Raw Materials' },
    { key: 'supply', href: 'supply.html', label: 'Supply Planner' },
    { key: 'team', href: 'team.html', label: 'Team', icon: 'msg' },
    { key: 'admin', href: 'admin.html', label: 'Admin' }
  ];
  var ROLE = { admin: 'Admin', editor: 'Can edit', viewer: 'View only' };
  /* areas: Production (this site), Lab and Preparation. The owner has all of them. */
  var AREAS = [{ key: 'production', label: 'Production', href: null }, { key: 'lab', label: 'Lab', href: 'lab.html' }, { key: 'preparation', label: 'Preparation', href: 'prep.html' }];
  function areasOf(p) { if (!p) return []; if (p.is_owner) return AREAS.map(function (a) { return a.key; }); var a = (p.areas && p.areas.length) ? p.areas : ['production']; return AREAS.map(function (x) { return x.key; }).filter(function (k) { return a.indexOf(k) >= 0; }); }
  function areaHome(p) { var a = areasOf(p); if (a.length > 1) return 'start.html'; if (a[0] === 'lab') return 'lab.html'; if (a[0] === 'preparation') return 'prep.html'; return firstPageOf(p); }
  var ICON_MSG = '<svg class="ico" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style="vertical-align:-3px;margin-right:7px"><path fill="currentColor" d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm3 6v2h2V9H7zm4 0v2h2V9h-2zm4 0v2h2V9h-2z"/></svg>';
  var CFG = window.ATIC_CONFIG || {};
  var sb = (window.supabase && CFG.url) ? window.supabase.createClient(CFG.url, CFG.key) : null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(s, r) { return (r || document).querySelector(s); }

  function allowed(profile, key) {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    if (key === 'admin') return false;
    if (key === 'team' && profile.role === 'viewer') return false; // Team: admins and editors only
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
  function firstPageOf(profile) { var p = ordered(profile)[0]; return p ? p.href : null; }
  function firstPage(profile) { return firstPageOf(profile); }

  var A = { sb: sb, PAGES: PAGES, ROLE: ROLE, AREAS: AREAS, areasOf: areasOf, areaHome: areaHome, esc: esc, allowed: allowed, ordered: ordered, firstPage: firstPage, profile: null, canWrite: false, page: null, area: 'production', subs: [] };

  function toast(t) {
    var el = $('#toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2800);
  }
  A.toast = toast;

  function curSub() { var h = location.hash.slice(1); return h || (A.subs[0] && A.subs[0].id) || ''; }
  function railHTML() {
    var p = A.profile, cur = curSub();
    var h = '<div class="logo"><div class="mark">AT</div><div><b>ATIC OMAN</b><small>' + (A.area === 'production' ? 'Planning &amp; forecasting' : esc((AREAS.filter(function (a) { return a.key === A.area; })[0] || {}).label || '')) + '</small></div></div><nav id="shellNav" aria-label="Sections">';
    (A.area === 'production' ? ordered(p) : []).forEach(function (x) {
      var on = x.key === A.page;
      h += '<div class="part"><a class="p' + (x.icon ? ' ic' : '') + '" href="' + x.href + '"' + (on ? ' aria-current="page"' : '') + '>' + (x.icon === 'msg' ? ICON_MSG : '') + esc(x.label) + (x.tag ? ' <span class="tagx">' + x.tag + '</span>' : '') + (x.key === 'team' ? ' <span class="badge" id="teamBadge" hidden></span>' : '') + '</a>' + (on && A.subs.length ? '<button type="button" class="chev" id="railChev" aria-label="' + (subsClosed() ? 'Show' : 'Hide') + ' the sections of ' + esc(x.label) + '" aria-expanded="' + !subsClosed() + '">' + (subsClosed() ? '▸' : '▾') + '</button>' : '');
      if (on && A.subs.length) h += '<div class="subs"' + (subsClosed() ? ' hidden' : '') + '>' + A.subs.map(function (s) { return '<a href="#' + s.id + '" data-sub="' + s.id + '"' + (s.id === cur ? ' aria-current="page"' : '') + '>' + esc(s.label) + (s.badge ? ' <span class="badge" id="sb_' + s.id + '"' + (s.badgeHidden ? ' hidden' : '') + '>' + esc(s.badge) + '</span>' : '') + '</a>'; }).join('') + '</div>';
      h += '</div>';
    });
    if (A.area !== 'production') h += '<div class="part"><a class="p" aria-current="page" href="' + location.pathname.split('/').pop() + '">' + esc((AREAS.filter(function (a) { return a.key === A.area; })[0] || {}).label || '') + '</a></div>';
    h += '</nav><div class="userchip"><b>' + esc(p.full_name || p.username) + '</b><span style="opacity:.75;font-size:12px">' + (p.is_owner ? 'Creator' : ROLE[p.role]) + '</span>' + (areasOf(p).length > 1 ? '<a class="switch" href="start.html">⇄ Switch area</a>' : '') + '<button id="signOut" type="button">Sign out</button></div>';
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
  /* clicking the page you are on folds / unfolds its sub-tabs (remembered per page) */
  function subsClosed() { try { return localStorage.getItem('aticRailClosed_' + A.page) === '1'; } catch (e) { return false; } }
  function setSubsClosed(v) { try { localStorage.setItem('aticRailClosed_' + A.page, v ? '1' : '0'); } catch (e) {} }
  function drawRail() {
    var rail = $('#rail'); if (!rail) return;
    rail.innerHTML = railHTML();
    $('#signOut').onclick = A.signOut;
    var cur = rail.querySelector('a.p[aria-current="page"]'), subs = cur && cur.parentNode.querySelector('.subs');
    var chev = document.getElementById('railChev');
    if (chev && subs) chev.onclick = function (e) { e.preventDefault(); e.stopPropagation(); subs.hidden = !subs.hidden; setSubsClosed(subs.hidden); chev.setAttribute('aria-expanded', !subs.hidden); chev.textContent = subs.hidden ? '▸' : '▾'; };
    // the page name always takes you to the page's main view (its first section), and shows the sections again
    if (cur && A.subs.length) cur.onclick = function (e) { e.preventDefault(); if (subs && subs.hidden) { subs.hidden = false; setSubsClosed(false); if (chev) { chev.textContent = '▾'; chev.setAttribute('aria-expanded', true); } } var first = '#' + A.subs[0].id; if (location.hash !== first) location.hash = first; else window.scrollTo(0, 0); };
    var bar = $('#subbar'); if (bar) { bar.innerHTML = subbarHTML(); bar.hidden = !A.subs.length; }
    teamBadge();
  }
  async function teamBadge() {
    var b = document.getElementById('teamBadge'); if (!b || A.page === 'team' || !A.profile) return;
    try {
      var seen = ''; try { seen = localStorage.getItem('aticTeamSeen_' + A.profile.id) || ''; } catch (e) {}
      var r = await sb.from('planner_docs').select('id,data').eq('coll', 'team'); if (r.error) return;
      var me = A.profile.id, n = r.data.filter(function (x) { var d = x.data || {}; return d.at > seen && d.by !== me && (d.ch === 'group' || (d.ch || '').split('|').indexOf(me) >= 0 || (d.ch || '').indexOf(me) >= 0); }).length;
      b.textContent = n > 99 ? '99+' : String(n); b.hidden = !n;
    } catch (e) {}
  }
  A.teamBadge = teamBadge;
  /* the site posts its own events to Team → Site activity (never blocks the page if it fails) */
  A.teamPost = function (icon, text, share) {
    try {
      if (!A.profile || !A.canWrite) return;
      var id = 'ev' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      A.planner.set('team', id, { kind: 'event', ch: 'feed', icon: icon, text: text, share: share || null, by: A.profile.id, byName: A.profile.full_name || A.profile.username, at: new Date().toISOString() }).catch(function () {});
    } catch (e) {}
  };
  window.addEventListener('hashchange', function () { A.setSub(curSub()); });

  A.signOut = async function () { try { localStorage.removeItem('aticProfileCache'); } catch (e) {} try { await sb.auth.signOut(); } catch (e) {} location.replace('index.html'); };

  /* boot({page, subs}) → resolves with A when the person may see this page, or null after showing a message. */
  A.boot = async function (opts) {
    A.page = opts.page; A.subs = opts.subs || []; A.area = opts.area || 'production';
    var main = $('#main');
    if (!sb) { if (main) main.innerHTML = '<div class="panel noacc"><h2>Could not load</h2><p class="muted">Check the internet connection and refresh the page.</p></div>'; return null; }
    try { var cp = JSON.parse(localStorage.getItem('aticProfileCache') || 'null'); if (cp && !A.profile) { A.profile = cp; drawRail(); A.profile = null; } } catch (e) {}
    var s = await sb.auth.getSession();
    if (!s.data || !s.data.session) { location.replace('index.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.hash)); return null; }
    var pr = await sb.from('profiles').select('*').eq('id', s.data.session.user.id).single();
    if (pr.error || !pr.data) { await sb.auth.signOut(); location.replace('index.html?err=noaccess'); return null; }
    A.profile = pr.data; A.session = s.data.session;
    try { localStorage.setItem('aticProfileCache', JSON.stringify(pr.data)); } catch (e) {}
    A.canWrite = pr.data.role === 'admin' || pr.data.role === 'editor';
    if (A.area !== 'start' && areasOf(A.profile).indexOf(A.area) < 0) { location.replace(areaHome(A.profile)); return null; }
    if (A.area === 'start') return A;
    drawRail();
    if (A.area !== 'production') return A;
    if (!allowed(A.profile, A.page)) {
      var where = firstPage(A.profile);
      if (main) main.innerHTML = '<div class="panel noacc"><h2 style="font-size:20px;margin-bottom:6px">No access to this page</h2><p class="muted" style="margin:0 0 14px">Your admin decides which pages each account can open. Ask them if you need this one.</p>' + (where ? '<a class="btn primary" href="' + where + '" style="text-decoration:none;display:inline-block">Go to my pages</a>' : '') + '</div>';
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
  /* ATIC lot number: 2-digit year + day of the year (3 digits). 2 Nov 2026 = 26306, 1 Jan 2027 = 27001 */
  A.lot = function (iso) {
    if (!iso) return ''; var t = new Date(iso.slice(0, 10) + 'T00:00:00Z'), y = t.getUTCFullYear(), d = Math.round((t - Date.UTC(y, 0, 1)) / 864e5) + 1;
    return String(y).slice(-2) + String(d).padStart(3, '0');
  };
  A.whenShown = function (fn) { if (document.prerendering) document.addEventListener('prerenderingchange', function () { fn(); }, { once: true }); else fn(); };
  /* load pages ahead: hovering a menu item loads that page in the background (Chrome / Edge), so the click is instant */
  (function () {
    try {
      if (!HTMLScriptElement.supports || !HTMLScriptElement.supports('speculationrules')) return;
      var sr = document.createElement('script'); sr.type = 'speculationrules';
      sr.textContent = JSON.stringify({ prerender: [{ source: 'document', where: { and: [{ selector_matches: '.rail a.p' }, { not: { selector_matches: '[aria-current="page"]' } }] }, eagerness: 'moderate' }],
        prefetch: [{ source: 'document', where: { selector_matches: '.rail a.p' }, eagerness: 'eager' }] });
      document.head.appendChild(sr);
    } catch (e) {}
  })();
  window.ATIC = A;
})();
