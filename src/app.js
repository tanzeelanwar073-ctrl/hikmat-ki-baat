/* حکمت کی بات — tiny vanilla JS: mobile menu, copy-link, and client-side search. No frameworks. */
(function () {
  'use strict';

  // ---- mobile menu ----
  var t = document.getElementById('nav-toggle');
  var n = document.getElementById('site-nav');
  if (t && n) {
    t.addEventListener('click', function () {
      var open = n.classList.toggle('open');
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // ---- copy link buttons ----
  var copies = document.querySelectorAll('[data-copy]');
  for (var i = 0; i < copies.length; i++) {
    copies[i].addEventListener('click', function (e) {
      var btn = e.currentTarget;
      var url = btn.getAttribute('data-copy');
      var done = function () {
        var old = btn.textContent;
        btn.textContent = 'لنک کاپی ہو گیا ✓';
        setTimeout(function () { btn.textContent = old; }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { window.prompt('لنک کاپی کریں:', url); });
      } else {
        window.prompt('لنک کاپی کریں:', url);
      }
    });
  }

  // ---- search page ----
  var box = document.getElementById('search-results');
  var input = document.getElementById('q');
  if (!box || !input) return;

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[ً-ٰٟۖ-ۭـ‌‍]/g, '')
      .replace(/[يىئ]/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/[ۂۃة]/g, 'ہ')
      .replace(/[٠-٩۰-۹]/g, function (d) { return String(d.charCodeAt(0) & 15); })
      .replace(/[^؀-ۿa-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  var docs = null;
  function load() {
    if (docs) return Promise.resolve(docs);
    return fetch('/search-index.json')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        d.forEach(function (x) {
          x._t = norm(x.t); x._g = norm((x.g || []).join(' ')); x._e = norm(x.e); x._b = norm(x.b); x._c = norm(x.c);
        });
        docs = d;
        return d;
      });
  }

  function search(q) {
    var words = norm(q).split(' ').filter(Boolean);
    if (!words.length) return [];
    var res = [];
    docs.forEach(function (d) {
      var score = 0, ok = true;
      words.forEach(function (w) {
        var s = 0;
        if (d._t.indexOf(w) > -1) s += 10;
        if (d._g.indexOf(w) > -1) s += 6;
        if (d._c.indexOf(w) > -1) s += 4;
        if (d._e.indexOf(w) > -1) s += 3;
        if (d._b.indexOf(w) > -1) s += 1;
        if (!s) ok = false;
        score += s;
      });
      if (ok) res.push({ d: d, s: score });
    });
    res.sort(function (a, b) { return b.s - a.s; });
    return res.map(function (r) { return r.d; });
  }

  function show(q) {
    if (!norm(q)) { box.innerHTML = '<p class="empty">اوپر خانے میں کوئی لفظ لکھ کر تلاش کریں۔</p>'; return; }
    load().then(function () {
      var r = search(q);
      if (!r.length) { box.innerHTML = '<p class="empty">«' + esc(q) + '» کے لیے کوئی مضمون نہیں ملا۔ کسی اور لفظ سے کوشش کیجیے۔</p>'; return; }
      box.innerHTML = '<p class="meta">' + r.length.toLocaleString('ur-PK') + ' نتیجے ملے</p>' + r.map(function (d) {
        return '<article class="result"><h2><a href="' + esc(d.u) + '">' + esc(d.t) + '</a></h2><p class="meta"><span>' + esc(d.c) + '</span><span>' + esc(d.d) + '</span></p><p>' + esc(d.e) + '</p></article>';
      }).join('');
    }).catch(function () { box.innerHTML = '<p class="empty">تلاش کا ڈیٹا لوڈ نہیں ہو سکا۔ صفحہ دوبارہ کھولیں۔</p>'; });
  }

  var qs = new URLSearchParams(location.search).get('q') || '';
  input.value = qs;
  show(qs);
  input.addEventListener('input', function () {
    var v = input.value;
    if (history.replaceState) history.replaceState(null, '', v ? '?q=' + encodeURIComponent(v) : location.pathname);
    show(v);
  });
})();
