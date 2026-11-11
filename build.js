#!/usr/bin/env node
'use strict';
/**
 * حکمت کی بات — static site generator (zero dependencies, Node 18+).
 *
 *   node build.js            -> builds the whole site into ./dist
 *
 * Content lives in:  content/articles/*.md   content/pages/*.md   content/categories.json
 * Settings live in:  site.config.json   (or the SITE_URL environment variable for the public address)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { toUrduDigits: ud, formatDate, escapeHtml: h, escapeXml: x, htmlToText, parseFrontmatter } = require('./lib/util');
const { render: renderMd } = require('./lib/markdown');
const { coverSVG } = require('./lib/covers');
const { ogCard, iconPng } = require('./lib/png');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const warnings = [];
const warn = (m) => warnings.push(m);

// ------------------------------------------------------------------ config
let SITE = String(process.env.SITE_URL || cfg.url || '').trim().replace(/\/+$/, '');
if (!SITE) {
  SITE = 'http://localhost:8080';
  warn('ویب سائٹ کا پتہ (url) سیٹ نہیں۔ ڈیپلائے کرنے سے پہلے site.config.json میں "url" لکھیں یا SITE_URL سیٹ کریں، ورنہ sitemap اور canonical لنک غلط ہوں گے۔');
}
const abs = (p) => (/^https?:\/\//i.test(p) ? p : SITE + p);
const AD = cfg.adsense || {};
const PUB = /^ca-pub-\d{8,20}$/.test(AD.publisherId || '') ? AD.publisherId : '';
const GA = /^G-[A-Z0-9]{4,20}$/.test(cfg.googleAnalyticsId || '') ? cfg.googleAnalyticsId : '';
const GSC = /^[\w-]{10,100}$/.test(cfg.searchConsoleVerification || '') ? cfg.searchConsoleVerification : '';
if (AD.publisherId && !PUB) warn('adsense.publisherId کا فارمیٹ غلط ہے (مثال: ca-pub-1234567890123456)۔');
if (cfg.googleAnalyticsId && !GA) warn('googleAnalyticsId کا فارمیٹ غلط ہے (مثال: G-XXXXXXXXXX)۔');
if (/example\.com/.test(cfg.email || '')) warn('site.config.json میں "email" ابھی نمونے کا ہے۔ اپنا اصل ای میل لکھیں۔');
const AUTHOR = cfg.author || { name: cfg.name, type: 'Organization' };

// ------------------------------------------------------------------ helpers
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
function write(rel, content) {
  const file = rel.endsWith('/') ? path.join(DIST, rel, 'index.html') : path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
const ldTag = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const trunc = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
function fill(text) {
  return text
    .replace(/\{\{siteName\}\}/g, cfg.name)
    .replace(/\{\{siteUrl\}\}/g, SITE)
    .replace(/\{\{email\}\}/g, cfg.email || '')
    .replace(/\{\{author\}\}/g, AUTHOR.name);
}

// ------------------------------------------------------------------ content
const categories = readJSON('content/categories.json');
const catBySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));
const today = new Date().toISOString().slice(0, 10);

function loadArticles() {
  const dir = path.join(ROOT, 'content/articles');
  const list = [];
  const seen = new Set();
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort()) {
    const { data, body } = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (data.draft === true) { console.log(`  (draft skipped) ${f}`); continue; }
    const slug = String(data.slug || f.replace(/\.md$/, '')).trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`${f}: slug صرف انگریزی چھوٹے حروف، اعداد اور "-" پر مشتمل ہو (ملا: "${slug}")`);
    if (seen.has(slug)) throw new Error(`${f}: slug "${slug}" پہلے سے استعمال ہو چکا ہے`);
    seen.add(slug);
    if (!data.title) throw new Error(`${f}: title موجود نہیں`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.date || ''))) throw new Error(`${f}: date کا فارمیٹ YYYY-MM-DD ہونا چاہیے`);
    const cat = catBySlug[data.category];
    if (!cat) throw new Error(`${f}: نامعلوم category "${data.category}"۔ درست: ${categories.map((c) => c.slug).join(', ')}`);
    if (data.date > today) { console.log(`  (scheduled for ${data.date}, skipped) ${f}`); continue; }

    const { html, headings } = renderMd(body);
    const text = htmlToText(html);
    const words = text.split(/\s+/).filter(Boolean).length;
    const firstP = (html.match(/<p>([\s\S]*?)<\/p>/) || [, ''])[1];
    const excerpt = String(data.excerpt || trunc(htmlToText(firstP), 170));
    let tags = data.tags || [];
    if (typeof tags === 'string') tags = tags.split(/[,،]/).map((t) => t.trim()).filter(Boolean);
    const image = data.image ? String(data.image) : '';
    if (image.startsWith('/') && !fs.existsSync(path.join(ROOT, 'static', image))) warn(`${f}: تصویر نہیں ملی: static${image}`);
    if (!data.excerpt) warn(`${f}: excerpt (خلاصہ) نہیں لکھا — خودکار بنایا گیا۔`);
    if (!data.metaDescription && !data.excerpt) warn(`${f}: metaDescription نہیں لکھی۔`);
    if (words < 350) warn(`${f}: مضمون صرف ${words} الفاظ کا ہے۔ ایڈسینس کے لیے مفصل، مفید مضامین بہتر رہتے ہیں۔`);

    list.push({
      file: f, slug, title: String(data.title), date: String(data.date), updated: data.updated ? String(data.updated) : '',
      cat, excerpt, seoTitle: data.seoTitle ? String(data.seoTitle) : '', metaDescription: String(data.metaDescription || excerpt),
      tags, image, imageAlt: String(data.imageAlt || data.title), featured: data.featured === true, popular: data.popular === true,
      html, headings, text, words, readMin: Math.max(1, Math.round(words / 160)), url: `/articles/${slug}/`,
      cardImage: image || `/images/covers/${slug}.svg`,
    });
  }
  list.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date < b.date ? 1 : -1));
  return list;
}

function loadPages() {
  const dir = path.join(ROOT, 'content/pages');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const { data, body } = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    const { html, headings } = renderMd(fill(body));
    return { slug: data.slug || f.replace(/\.md$/, ''), title: data.title, description: data.description || '', template: data.template || '', order: Number(data.order || 99), html, headings };
  }).sort((a, b) => a.order - b.order);
}

// ------------------------------------------------------------------ assets (hashed file names => safe long caching)
function minCss(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').replace(/:\s+/g, ':').replace(/;}/g, '}').trim();
}
function hashed(name, ext, transform) {
  const src = fs.readFileSync(path.join(ROOT, 'src', name), 'utf8');
  const out = transform ? transform(src) : src;
  const hash = crypto.createHash('md5').update(out).digest('hex').slice(0, 8);
  const rel = `/assets/${name.replace(/\.[^.]+$/, '')}.${hash}.${ext}`;
  write(rel, out);
  return rel;
}

// ------------------------------------------------------------------ HTML building blocks
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap';
let CSS_URL = '', JS_URL = '';

function ad(kind) {
  const slot = AD.slots && AD.slots[kind];
  if (!PUB || !slot || !/^\d{6,20}$/.test(String(slot))) return '';
  return `<aside class="ad ad-${kind}" aria-label="اشتہار"><span class="ad-label">اشتہار</span><ins class="adsbygoogle" style="display:block" data-ad-client="${PUB}" data-ad-slot="${h(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></aside>`;
}

function head(o) {
  const title = o.title;
  const canonical = abs(o.path);
  const robots = o.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large';
  const ogImage = o.ogImage || abs('/images/og/default.png');
  const ogDims = o.ogImage && !/\/images\/og\//.test(o.ogImage) ? '' : '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">';
  const art = o.article;
  return `<!doctype html>
<html lang="ur" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${h(title)}</title>
<meta name="description" content="${h(o.description)}">
<link rel="canonical" href="${h(canonical)}">
<meta name="robots" content="${robots}">
<meta name="theme-color" content="#0f3d2e">
${GSC ? `<meta name="google-site-verification" content="${GSC}">` : ''}
<meta property="og:locale" content="ur_PK">
<meta property="og:type" content="${art ? 'article' : 'website'}">
<meta property="og:site_name" content="${h(cfg.name)}">
<meta property="og:title" content="${h(o.ogTitle || title)}">
<meta property="og:description" content="${h(o.description)}">
<meta property="og:url" content="${h(canonical)}">
<meta property="og:image" content="${h(ogImage)}">${ogDims}
<meta property="og:image:alt" content="${h(o.ogAlt || cfg.name)}">
<meta name="twitter:card" content="summary_large_image">
${art ? `<meta property="article:published_time" content="${art.date}"><meta property="article:modified_time" content="${art.updated || art.date}"><meta property="article:section" content="${h(art.cat.name)}">${art.tags.map((t) => `<meta property="article:tag" content="${h(t)}">`).join('')}` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="${h(cfg.name)}" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONT_URL}">
<link rel="stylesheet" href="${CSS_URL}">
<script>document.documentElement.className+=' js'</script>
${PUB ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUB}" crossorigin="anonymous"></script>` : ''}
${GA ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA}');</script>` : ''}
${(o.ld || []).map(ldTag).join('\n')}
</head>`;
}

const NAV = [['/', 'ہوم'], ['/categories/', 'زمرہ جات'], ['/articles/', 'تمام مضامین'], ['/about/', 'ہمارے بارے میں'], ['/contact/', 'رابطہ']];

function header(current, currentCat) {
  return `<body>
<a class="skip" href="#main">مواد پر جائیں</a>
<header class="site-header">
<div class="wrap bar">
<a class="brand" href="/" aria-label="${h(cfg.name)} — ہوم"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 64 64" width="44" height="44"><circle cx="32" cy="32" r="31" fill="#0f3d2e"/><circle cx="32" cy="32" r="26" fill="none" stroke="#faf6ec" stroke-width="2"/><g transform="translate(32 32)" fill="#d8b45f"><rect x="-9" y="-9" width="18" height="18"/><rect x="-9" y="-9" width="18" height="18" transform="rotate(45)"/></g></svg></span><span class="brand-text"><strong>${h(cfg.name)}</strong><small>${h(cfg.tagline)}</small></span></a>
<button class="nav-toggle" id="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav"><span class="sr">مینو کھولیں</span><span class="bars" aria-hidden="true"></span></button>
<nav id="site-nav" class="site-nav" aria-label="مرکزی مینو">
<ul>${NAV.map(([u, t]) => `<li><a href="${u}"${u === current ? ' aria-current="page"' : ''}>${t}</a></li>`).join('')}</ul>
<form class="search-form" action="/search/" method="get" role="search"><label class="sr" for="q-h">تلاش</label><input id="q-h" type="search" name="q" placeholder="مضامین تلاش کریں…" autocomplete="off"><button type="submit">تلاش</button></form>
</nav>
</div>
<div class="cat-strip"><div class="wrap"><ul>${categories.map((c) => `<li><a href="/category/${c.slug}/"${currentCat === c.slug ? ' aria-current="page"' : ''}>${h(c.name)}</a></li>`).join('')}</ul></div></div>
</header>
<main id="main">`;
}

function footer(pages) {
  const legal = pages.filter((p) => ['privacy-policy', 'disclaimer', 'terms-and-conditions'].includes(p.slug));
  return `</main>
<footer class="site-footer">
<div class="wrap foot-grid">
<div><h2>${h(cfg.name)}</h2><p>${h(cfg.description)}</p>${cfg.facebookPage ? `<p><a href="${h(cfg.facebookPage)}" rel="noopener noreferrer" target="_blank">فیس بک پر ہمیں فالو کریں</a></p>` : ''}</div>
<nav aria-label="زمرہ جات"><h2>زمرہ جات</h2><ul>${categories.map((c) => `<li><a href="/category/${c.slug}/">${h(c.name)}</a></li>`).join('')}</ul></nav>
<nav aria-label="اہم صفحات"><h2>اہم صفحات</h2><ul>
<li><a href="/about/">ہمارے بارے میں</a></li><li><a href="/contact/">رابطہ کریں</a></li>
${legal.map((p) => `<li><a href="/${p.slug}/">${h(p.title)}</a></li>`).join('')}
<li><a href="/articles/">تمام مضامین</a></li><li><a href="/feed.xml">RSS فیڈ</a></li></ul></nav>
</div>
<div class="wrap copy">© ${ud(new Date().getFullYear())} ${h(cfg.name)} — تمام حقوق محفوظ ہیں۔</div>
</footer>
<script src="${JS_URL}" defer></script>
</body>
</html>`;
}

const crumbs = (items) => `<nav class="crumbs" aria-label="راستہ"><ol>${items.map(([t, u]) => `<li>${u ? `<a href="${u}">${h(t)}</a>` : `<span aria-current="page">${h(t)}</span>`}</li>`).join('')}</ol></nav>`;
const crumbLD = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([t, u], i) => ({ '@type': 'ListItem', position: i + 1, name: t, item: abs(u || '') })) });

function card(a, opts = {}) {
  const eager = opts.eager ? 'eager' : 'lazy';
  return `<article class="card${opts.big ? ' card-big' : ''}">
<a class="card-img" href="${a.url}" tabindex="-1" aria-hidden="true"><img src="${a.cardImage}" alt="${h(a.imageAlt)}" width="1200" height="675" loading="${eager}" decoding="async"></a>
<div class="card-body"><a class="badge" style="--c:${a.cat.color}" href="/category/${a.cat.slug}/">${h(a.cat.name)}</a>
<h3><a href="${a.url}">${h(a.title)}</a></h3>
<p>${h(a.excerpt)}</p>
<p class="meta"><time datetime="${a.date}">${formatDate(a.date)}</time><span>${ud(a.readMin)} منٹ کا مطالعہ</span></p></div>
</article>`;
}

const section = (title, body, link) => `<section class="section"><div class="wrap"><div class="section-head"><h2>${h(title)}</h2>${link ? `<a href="${link[0]}">${link[1]}</a>` : ''}</div>${body}</div></section>`;

function popularList(list) {
  return `<ol class="popular">${list.map((a) => `<li><div><a href="${a.url}">${h(a.title)}</a><small>${h(a.cat.name)}</small></div></li>`).join('')}</ol>`;
}

function pager(base, page, total) {
  if (total <= 1) return '';
  const href = (n) => (n === 1 ? base : `${base}page/${n}/`);
  const items = [];
  if (page > 1) items.push(`<li><a href="${href(page - 1)}" rel="prev">« پچھلا</a></li>`);
  for (let n = 1; n <= total; n++) items.push(`<li>${n === page ? `<span aria-current="page">${ud(n)}</span>` : `<a href="${href(n)}">${ud(n)}</a>`}</li>`);
  if (page < total) items.push(`<li><a href="${href(page + 1)}" rel="next">اگلا »</a></li>`);
  return `<nav aria-label="صفحات"><ul class="pager">${items.join('')}</ul></nav>`;
}

function related(a, all) {
  return all
    .filter((b) => b.slug !== a.slug)
    .map((b) => ({ b, s: (b.cat.slug === a.cat.slug ? 5 : 0) + b.tags.filter((t) => a.tags.includes(t)).length * 2 + (b.date < a.date ? 0.1 : 0) }))
    .sort((p, q) => q.s - p.s)
    .slice(0, 3)
    .map((r) => r.b);
}

function tocHtml(headings) {
  const hs = headings.filter((x) => x.level === 2);
  if (hs.length < 3) return '';
  return `<details class="toc" open><summary>فہرستِ مضمون</summary><ol>${hs.map((x) => `<li><a href="#${x.id}">${h(x.text)}</a></li>`).join('')}</ol></details>`;
}

function injectAd(html) {
  const unit = ad('inArticle');
  if (!unit) return html;
  const total = (html.match(/<\/p>/g) || []).length;
  if (total < 6) return html; // short articles get no in-article ad
  const re = /<\/p>/g;
  let m, count = 0;
  while ((m = re.exec(html))) {
    count++;
    const upTo = html.slice(0, m.index + 4);
    const balanced = (upTo.match(/<blockquote>/g) || []).length === (upTo.match(/<\/blockquote>/g) || []).length;
    if (count >= 3 && balanced) return upTo + unit + html.slice(m.index + 4);
  }
  return html;
}

function sidebar(all, pop) {
  return `<aside class="sidebar" aria-label="سائیڈ بار">
<div class="box"><h2>زمرہ جات</h2><ul class="plain">${categories.map((c) => `<li><a href="/category/${c.slug}/">${h(c.name)}</a> <span>(${ud(all.filter((a) => a.cat.slug === c.slug).length)})</span></li>`).join('')}</ul></div>
${pop.length ? `<div class="box"><h2>مقبول مضامین</h2>${popularList(pop.slice(0, 5))}</div>` : ''}
${ad('sidebar')}
</aside>`;
}

// ------------------------------------------------------------------ build
function build() {
  console.log('\nحکمت کی بات — building…');
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  copyDir(path.join(ROOT, 'static'), DIST);
  CSS_URL = hashed('style.css', 'css', minCss);
  JS_URL = hashed('app.js', 'js');

  const articles = loadArticles();
  const pages = loadPages();
  const pop = articles.filter((a) => a.popular);
  const sitemap = [];
  const newest = articles[0] ? (articles[0].updated || articles[0].date) : today;
  const add = (u, lastmod) => sitemap.push({ u, lastmod: lastmod || newest });

  // --- generated images
  fs.mkdirSync(path.join(DIST, 'images/og'), { recursive: true });
  fs.mkdirSync(path.join(DIST, 'images/covers'), { recursive: true });
  write('/images/og/default.png', ogCard('#1f6f4a'));
  for (const c of categories) write(`/images/og/${c.slug}.png`, ogCard(c.color));
  for (const a of articles) if (!a.image) write(a.cardImage, coverSVG(a.slug, a.cat.color));
  write('/apple-touch-icon.png', iconPng(180));
  write('/icon-512.png', iconPng(512));
  write('/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="31" fill="#0f3d2e"/><circle cx="32" cy="32" r="25" fill="none" stroke="#faf6ec" stroke-width="2"/><g transform="translate(32 32)" fill="#d8b45f"><rect x="-9" y="-9" width="18" height="18"/><rect x="-9" y="-9" width="18" height="18" transform="rotate(45)"/></g></svg>`);

  const ogFor = (a) => (a.image ? abs(a.image) : abs(`/images/og/${a.cat.slug}.png`));
  const wrapPage = (o, inner, ctx = {}) => head(o) + header(ctx.current, ctx.cat) + inner + footer(pages);

  // --- home
  {
    const featured = (articles.filter((a) => a.featured).length ? articles.filter((a) => a.featured) : articles).slice(0, 3);
    let latest = articles.filter((a) => !featured.includes(a));
    if (latest.length < 3) latest = articles;
    latest = latest.slice(0, 6);
    const hero = `<section class="hero"><div class="wrap">
<p class="eyebrow">اردو مضامین کا مجموعہ</p>
<h1>وہ باتیں جو دل میں اتریں اور زندگی کا رخ بدل دیں</h1>
<p class="lead">زندگی کے سبق، اسلامی حکمت، فلسفہ، رشتوں، کامیابی اور نفسیات پر سادہ اردو میں سوچ سمجھ کر لکھے گئے مضامین۔ ہر تحریر کا مقصد قاری کو کچھ نیا سمجھانا اور ایک عملی قدم دینا ہے۔</p>
<form class="hero-search" action="/search/" method="get" role="search"><label class="sr" for="q-hero">تلاش</label><input id="q-hero" type="search" name="q" placeholder="مثلاً: صبر، محنت، والدین…" autocomplete="off"><button type="submit">تلاش</button></form>
<div class="hero-actions"><a class="btn" href="/articles/">تازہ مضامین پڑھیں</a><a class="btn btn-ghost" href="/categories/">زمرہ جات دیکھیں</a></div>
</div></section>`;
    const featHtml = featured.length ? section('منتخب حکمت', `<div class="feature-grid">${featured.map((a, i) => card(a, { big: i === 0, eager: i === 0 })).join('')}</div>`) : '';
    const latestHtml = section('تازہ ترین مضامین', `<div class="grid">${latest.map((a) => card(a)).join('')}</div>`, ['/articles/', 'تمام مضامین دیکھیں ‹']);
    const popHtml = pop.length ? `<section class="section"><div class="wrap two-col"><div><div class="section-head"><h2>مقبول مضامین</h2></div>${popularList(pop.slice(0, 6))}</div>${ad('home') || ''}</div></section>` : (ad('home') ? `<div class="wrap">${ad('home')}</div>` : '');
    const catHtml = section('موضوعات کے مطابق پڑھیے', `<div class="cat-grid">${categories.map((c) => {
      const items = articles.filter((a) => a.cat.slug === c.slug);
      return `<div class="cat-card" style="--c:${c.color}"><h3><a href="/category/${c.slug}/">${h(c.name)}</a></h3><p>${h(c.description)}</p>${items.length ? `<ul>${items.slice(0, 2).map((a) => `<li><a href="${a.url}">${h(a.title)}</a></li>`).join('')}</ul>` : ''}<span class="count">${ud(items.length)} مضامین</span></div>`;
    }).join('')}</div>`, ['/categories/', 'تمام زمرہ جات ‹']);
    const ld = [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: cfg.name, alternateName: cfg.nameLatin, url: SITE + '/', inLanguage: 'ur', description: cfg.description, potentialAction: { '@type': 'SearchAction', target: `${SITE}/search/?q={search_term_string}`, 'query-input': 'required name=search_term_string' } },
      { '@context': 'https://schema.org', '@type': 'Organization', name: cfg.name, url: SITE + '/', logo: abs('/icon-512.png') },
    ];
    write('/', wrapPage({ title: `${cfg.name} — ${cfg.tagline}`, description: cfg.description, path: '/', ld }, hero + featHtml + latestHtml + popHtml + catHtml, { current: '/' }));
    add('/');
  }

  // --- paginated archive helper
  function archive({ base, title, heading, intro, list, bc, desc, catSlug, ogImage, current }) {
    const per = Number(cfg.articlesPerPage) || 12;
    const total = Math.max(1, Math.ceil(list.length / per));
    for (let p = 1; p <= total; p++) {
      const slice = list.slice((p - 1) * per, p * per);
      const urlPath = p === 1 ? base : `${base}page/${p}/`;
      const body = `<div class="wrap">${crumbs(bc)}<div class="page-head"><h1>${h(heading)}</h1>${intro ? `<p>${h(intro)}</p>` : ''}</div>
${slice.length ? `<div class="grid" style="margin-top:1rem">${slice.map((a, i) => card(a, { eager: i < 1 })).join('')}</div>` : '<p class="empty">اس زمرے میں فی الحال کوئی مضمون شائع نہیں ہوا۔ جلد نئے مضامین آئیں گے۔</p>'}
${pager(base, p, total)}${ad('bottom')}</div>`;
      write(urlPath, wrapPage({ title: p === 1 ? title : `${title} — صفحہ ${ud(p)}`, description: desc, path: urlPath, ogImage, ld: [crumbLD(bc)] }, body, { current, cat: catSlug }));
    }
    add(base);
  }

  archive({ base: '/articles/', title: `تمام مضامین | ${cfg.name}`, heading: 'تمام مضامین', intro: 'ہمارے تمام شائع شدہ مضامین، تازہ ترین سب سے اوپر۔', list: articles, bc: [['ہوم', '/'], ['تمام مضامین', null]], desc: `${cfg.name} کے تمام اردو مضامین: زندگی کے سبق، اسلامی حکمت، فلسفہ، رشتے، کامیابی، نفسیات اور مثبت سوچ۔`, current: '/articles/' });

  for (const c of categories) {
    archive({ base: `/category/${c.slug}/`, title: `${c.name} | ${cfg.name}`, heading: c.name, intro: c.description, list: articles.filter((a) => a.cat.slug === c.slug), bc: [['ہوم', '/'], ['زمرہ جات', '/categories/'], [c.name, null]], desc: c.description, catSlug: c.slug, ogImage: abs(`/images/og/${c.slug}.png`) });
  }

  // --- categories index
  {
    const bc = [['ہوم', '/'], ['زمرہ جات', null]];
    const body = `<div class="wrap">${crumbs(bc)}<div class="page-head"><h1>زمرہ جات</h1><p>اپنی دلچسپی کے موضوع کا انتخاب کیجیے۔</p></div>
<div class="cat-grid" style="margin-top:1rem">${categories.map((c) => {
      const items = articles.filter((a) => a.cat.slug === c.slug);
      return `<div class="cat-card" style="--c:${c.color}"><h2 style="font-size:1.2rem;margin:0"><a href="/category/${c.slug}/" style="text-decoration:none">${h(c.name)}</a></h2><p>${h(c.description)}</p>${items.length ? `<ul>${items.slice(0, 3).map((a) => `<li><a href="${a.url}">${h(a.title)}</a></li>`).join('')}</ul>` : ''}<span class="count">${ud(items.length)} مضامین</span></div>`;
    }).join('')}</div></div>`;
    write('/categories/', wrapPage({ title: `زمرہ جات | ${cfg.name}`, description: `${cfg.name} کے تمام موضوعات اور زمرہ جات کی فہرست۔`, path: '/categories/', ld: [crumbLD(bc)] }, body, { current: '/categories/' }));
    add('/categories/');
  }

  // --- articles
  for (const a of articles) {
    const bc = [['ہوم', '/'], [a.cat.name, `/category/${a.cat.slug}/`], [a.title, null]];
    const url = abs(a.url);
    const rel = related(a, articles);
    const share = `<div class="share"><strong>شیئر کریں:</strong>
<a class="fb" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener noreferrer">فیس بک</a>
<a class="wa" href="https://wa.me/?text=${encodeURIComponent(a.title + '\n' + url)}" target="_blank" rel="noopener noreferrer">واٹس ایپ</a>
<button class="cp" type="button" data-copy="${h(url)}">لنک کاپی کریں</button></div>`;
    const body = `<div class="wrap layout">
<article class="article">
${crumbs(bc)}
<header class="article-head">
<a class="badge" style="--c:${a.cat.color}" href="/category/${a.cat.slug}/">${h(a.cat.name)}</a>
<h1>${h(a.title)}</h1>
<p class="meta"><time datetime="${a.date}">${formatDate(a.date)}</time><span>${ud(a.readMin)} منٹ کا مطالعہ</span>${a.updated ? `<span>تازہ کاری: <time datetime="${a.updated}">${formatDate(a.updated)}</time></span>` : ''}</p>
</header>
<figure class="hero-img"><img src="${a.cardImage}" alt="${h(a.imageAlt)}" width="1200" height="675" fetchpriority="high" decoding="async"></figure>
${ad('top')}
${tocHtml(a.headings)}
<div class="prose">
${injectAd(a.html)}
</div>
${a.tags.length ? `<ul class="tags" aria-label="ٹیگز">${a.tags.map((t) => `<li><a href="/search/?q=${encodeURIComponent(t)}" rel="nofollow">#${h(t)}</a></li>`).join('')}</ul>` : ''}
${share}
<div class="author"><p><strong>تحریر:</strong> ${h(AUTHOR.name)} — <a href="/about/">ہمارے ادارتی اصول</a></p></div>
${ad('bottom')}
</article>
${sidebar(articles, pop)}
</div>
${rel.length ? section('مزید پڑھیے', `<div class="grid">${rel.map((r) => card(r)).join('')}</div>`).replace('class="section"', 'class="section related"') : ''}`;
    const ld = [
      {
        '@context': 'https://schema.org', '@type': 'Article', headline: trunc(a.title, 110), description: a.metaDescription,
        image: [a.image ? abs(a.image) : abs(`/images/og/${a.cat.slug}.png`)], datePublished: a.date, dateModified: a.updated || a.date,
        author: { '@type': AUTHOR.type === 'Person' ? 'Person' : 'Organization', name: AUTHOR.name },
        publisher: { '@type': 'Organization', name: cfg.name, logo: { '@type': 'ImageObject', url: abs('/icon-512.png') } },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url }, inLanguage: 'ur', articleSection: a.cat.name, keywords: a.tags.join(', '), wordCount: a.words,
      },
      crumbLD(bc),
    ];
    write(a.url, wrapPage({ title: a.seoTitle || `${a.title} | ${cfg.name}`, ogTitle: a.title, description: a.metaDescription, path: a.url, article: a, ogImage: ogFor(a), ogAlt: a.imageAlt, ld }, body, { cat: a.cat.slug }));
    add(a.url, a.updated || a.date);
  }

  // --- static pages
  for (const p of pages) {
    const bc = [['ہوم', '/'], [p.title, null]];
    let extra = '';
    if (p.template === 'contact') {
      const id = /^[\w-]{4,40}$/.test(cfg.formspreeId || '') ? cfg.formspreeId : '';
      extra = id
        ? `<form class="form" action="https://formspree.io/f/${id}" method="POST"><label for="c-name">آپ کا نام</label><input id="c-name" name="name" required autocomplete="name"><label for="c-email">آپ کا ای میل</label><input id="c-email" type="email" name="email" dir="ltr" required autocomplete="email"><label for="c-msg">پیغام</label><textarea id="c-msg" name="message" required></textarea><input type="hidden" name="_subject" value="${h(cfg.name)} — نیا پیغام"><div class="hp" aria-hidden="true"><label>اسے خالی چھوڑیں <input name="_gotcha" tabindex="-1" autocomplete="off"></label></div><div><button class="btn" type="submit">پیغام بھیجیں</button></div></form>`
        : `<p><a class="btn" href="mailto:${h(cfg.email)}">ای میل بھیجیں</a></p>`;
    }
    const body = `<div class="wrap">${crumbs(bc)}<div class="page-head"><h1>${h(p.title)}</h1></div><div class="prose" style="padding-bottom:1rem">${p.html}${extra}</div></div>`;
    write(`/${p.slug}/`, wrapPage({ title: `${p.title} | ${cfg.name}`, description: p.description || cfg.description, path: `/${p.slug}/`, ld: [crumbLD(bc)] }, body, { current: `/${p.slug}/` }));
    add(`/${p.slug}/`);
  }

  // --- search (noindex) & 404
  write('/search/', wrapPage({ title: `تلاش | ${cfg.name}`, description: `${cfg.name} میں مضامین تلاش کریں۔`, path: '/search/', noindex: true },
    `<div class="wrap">${crumbs([['ہوم', '/'], ['تلاش', null]])}<div class="page-head"><h1>مضامین تلاش کریں</h1></div>
<form class="search-big" action="/search/" method="get" role="search"><label class="sr" for="q">تلاش</label><input id="q" type="search" name="q" placeholder="کوئی لفظ لکھیے…" autocomplete="off"><button type="submit">تلاش</button></form>
<div id="search-results" aria-live="polite"><noscript><p class="notice">تلاش کے لیے براؤزر میں JavaScript چالو ہونا ضروری ہے۔ آپ <a href="/articles/">تمام مضامین</a> کی فہرست دیکھ سکتے ہیں۔</p></noscript></div></div>`, { current: '' }));

  write('/404.html', wrapPage({ title: `صفحہ نہیں ملا | ${cfg.name}`, description: 'یہ صفحہ موجود نہیں۔', path: '/404.html', noindex: true },
    `<div class="wrap"><div class="page-head" style="text-align:center;padding-block:2.5rem"><h1>یہ صفحہ نہیں ملا</h1><p style="margin-inline:auto">شاید لنک پرانا ہو گیا ہے یا صفحہ ہٹا دیا گیا ہے۔ آپ تلاش کر سکتے ہیں یا ہوم پیج پر واپس جا سکتے ہیں۔</p><p style="margin-top:1rem"><a class="btn" href="/">ہوم پیج</a> <a class="btn" href="/search/">تلاش</a></p></div>
${articles.length ? section('تازہ مضامین', `<div class="grid">${articles.slice(0, 3).map((a) => card(a)).join('')}</div>`) : ''}</div>`, { current: '' }));

  // --- search index
  write('/search-index.json', JSON.stringify(articles.map((a) => ({ t: a.title, u: a.url, c: a.cat.name, d: formatDate(a.date), e: a.excerpt, g: a.tags, b: a.text.slice(0, 1500) }))));

  // --- sitemap, robots, feed, ads.txt
  write('/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map((s) => `  <url><loc>${x(abs(s.u))}</loc><lastmod>${s.lastmod}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  write('/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
  write('/feed.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${x(cfg.name)}</title><link>${x(SITE)}/</link><description>${x(cfg.description)}</description><language>ur</language>\n${articles.slice(0, 20).map((a) => `<item><title>${x(a.title)}</title><link>${x(abs(a.url))}</link><guid>${x(abs(a.url))}</guid><pubDate>${new Date(a.date + 'T00:00:00Z').toUTCString()}</pubDate><category>${x(a.cat.name)}</category><description>${x(a.excerpt)}</description></item>`).join('\n')}\n</channel></rss>\n`);
  if (PUB) write('/ads.txt', `google.com, ${PUB.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);

  // --- report
  console.log(`\n✔ ${articles.length} مضامین، ${pages.length} صفحات، ${categories.length} زمرے بنائے گئے`);
  console.log(`  سائٹ کا پتہ: ${SITE}`);
  console.log(`  آؤٹ پٹ فولڈر: dist/  (${sitemap.length} sitemap لنک)`);
  if (warnings.length) { console.log('\n⚠ انتباہات:'); warnings.forEach((w) => console.log('  - ' + w)); }
  console.log('');
}

try {
  build();
} catch (e) {
  console.error('\n✖ بلڈ ناکام: ' + e.message + '\n');
  process.exit(1);
}
