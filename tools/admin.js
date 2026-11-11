#!/usr/bin/env node
'use strict';
/**
 * Local article editor (runs ONLY on your own computer, never deployed).
 *   npm run admin   ->  http://localhost:4000
 * Write / edit Urdu articles in a form, upload a featured image, preview, and rebuild the site.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { parseFrontmatter, toFrontmatter } = require('../lib/util');
const { render } = require('../lib/markdown');

const ROOT = path.join(__dirname, '..');
const ART = path.join(ROOT, 'content/articles');
const IMG = path.join(ROOT, 'static/images/articles');
const PORT = Number(process.env.PORT) || 4000;
const TOKEN = crypto.randomBytes(16).toString('hex');
const categories = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/categories.json'), 'utf8'));
const safeFile = (f) => /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(f || '');

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((ok, no) => {
  let b = '';
  req.on('data', (c) => { b += c; if (b.length > 12e6) { no(new Error('too large')); req.destroy(); } });
  req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { no(e); } });
});

function list() {
  return fs.readdirSync(ART).filter((f) => f.endsWith('.md') && !f.startsWith('_')).map((f) => {
    const { data } = parseFrontmatter(fs.readFileSync(path.join(ART, f), 'utf8'));
    return { file: f, title: data.title || f, date: data.date || '', category: data.category || '', draft: data.draft === true };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));
}

async function api(req, res, url) {
  if (req.headers['x-token'] !== TOKEN) return json(res, 403, { error: 'bad token' });
  if (url === '/api/data') return json(res, 200, { categories, articles: list() });
  if (req.method !== 'POST' && url === '/api/article') {
    const f = new URL(req.url, 'http://x').searchParams.get('file');
    if (!safeFile(f)) return json(res, 400, { error: 'bad file' });
    const { data, body } = parseFrontmatter(fs.readFileSync(path.join(ART, f), 'utf8'));
    return json(res, 200, { data, body });
  }
  const b = await readBody(req);
  if (url === '/api/preview') return json(res, 200, { html: render(String(b.body || '')).html });
  if (url === '/api/save') {
    const d = b.data || {};
    let slug = String(d.slug || '').trim().toLowerCase();
    if (!slug) slug = 'post-' + String(d.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '') + '-' + (list().length + 1);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return json(res, 400, { error: 'Slug صرف انگریزی چھوٹے حروف، اعداد اور - پر مشتمل ہو۔' });
    if (!d.title) return json(res, 400, { error: 'عنوان لکھیں۔' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) return json(res, 400, { error: 'تاریخ منتخب کریں۔' });
    if (!categories.some((c) => c.slug === d.category)) return json(res, 400, { error: 'زمرہ منتخب کریں۔' });
    if (b.image && b.image.data) {
      const ext = (String(b.image.name).match(/\.(jpe?g|png|webp)$/i) || [])[1];
      if (!ext) return json(res, 400, { error: 'تصویر JPG، PNG یا WEBP ہو۔' });
      const buf = Buffer.from(b.image.data, 'base64');
      if (buf.length > 5e6) return json(res, 400, { error: 'تصویر 5MB سے بڑی ہے۔' });
      fs.mkdirSync(IMG, { recursive: true });
      const name = `${slug}-${Date.now().toString(36)}.${ext.toLowerCase()}`;
      fs.writeFileSync(path.join(IMG, name), buf);
      d.image = '/images/articles/' + name;
    }
    d.slug = slug;
    const file = slug + '.md';
    fs.writeFileSync(path.join(ART, file), toFrontmatter(d) + '\n' + String(b.body || '').trim() + '\n');
    if (b.oldFile && b.oldFile !== file && safeFile(b.oldFile) && fs.existsSync(path.join(ART, b.oldFile))) fs.unlinkSync(path.join(ART, b.oldFile));
    return json(res, 200, { file, image: d.image || '' });
  }
  if (url === '/api/delete') {
    if (!safeFile(b.file)) return json(res, 400, { error: 'bad file' });
    fs.unlinkSync(path.join(ART, b.file));
    return json(res, 200, { ok: true });
  }
  if (url === '/api/build') {
    try { return json(res, 200, { out: execFileSync(process.execPath, ['build.js'], { cwd: ROOT, encoding: 'utf8' }) }); }
    catch (e) { return json(res, 200, { out: String(e.stdout || '') + String(e.stderr || e.message) }); }
  }
  return json(res, 404, { error: 'not found' });
}

const PAGE = `<!doctype html><html lang="ur" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مضمون ایڈیٹر</title>
<style>
body{margin:0;font-family:"Noto Nastaliq Urdu","Jameel Noori Nastaleeq","Noto Naskh Arabic",Tahoma,serif;background:#faf6ec;color:#1b2a22;line-height:2.1}
header{background:#0f3d2e;color:#fff;padding:.4rem 1rem;display:flex;gap:1rem;align-items:center;flex-wrap:wrap}header h1{font-size:1.2rem;margin:0;flex:1}
main{display:grid;gap:1rem;padding:1rem;max-width:80rem;margin:auto}@media(min-width:60rem){main{grid-template-columns:18rem 1fr}}
.box{background:#fff;border:1px solid #e6dfca;border-radius:12px;padding:.6rem 1rem}
button,.b{font:inherit;border:0;border-radius:999px;background:#0f3d2e;color:#fff;padding:0 1.1rem;cursor:pointer;line-height:2.3}button.alt{background:#b8893a}button.red{background:#9a2b2b}button.sm{padding:0 .7rem;font-size:.85rem;background:#e6f0ea;color:#0f3d2e}
label{display:block;font-weight:700;margin-top:.5rem}input,select,textarea{width:100%;box-sizing:border-box;font:inherit;padding:.2rem .7rem;border:1px solid #cfc6ac;border-radius:8px;background:#fff}
textarea{min-height:22rem;line-height:2.2}.row{display:grid;gap:.6rem}@media(min-width:40rem){.row{grid-template-columns:1fr 1fr}}
ul{list-style:none;padding:0;margin:0}li.a{padding:.2rem 0;border-bottom:1px dashed #e6dfca;cursor:pointer}li.a:hover{color:#165a3f}small{color:#586a60}
#msg{position:sticky;top:0;background:#fff3cd;border:1px solid #e0c36a;border-radius:8px;padding:.2rem 1rem;display:none;white-space:pre-wrap;z-index:5;direction:rtl}
#pv{border:1px dashed #b8893a;padding:.5rem 1rem;display:none;font-size:1.1rem}#pv blockquote{border-inline-start:4px solid #1f7a54;margin:1rem 0;padding:.2rem 1rem;background:#fffdf8}
.tool{display:flex;gap:.3rem;flex-wrap:wrap;margin:.3rem 0}.chk{display:flex;gap:.4rem;align-items:center}.chk input{width:auto}
</style></head><body>
<header><h1>حکمت کی بات — مضمون ایڈیٹر (صرف آپ کے کمپیوٹر پر)</h1><button class="alt" onclick="newArt()">+ نیا مضمون</button><button onclick="build()">سائٹ دوبارہ بنائیں (Build)</button></header>
<main><aside class="box"><strong>موجودہ مضامین</strong><ul id="list"></ul></aside>
<section class="box"><div id="msg"></div>
<div class="row"><div><label>عنوان *</label><input id="title"></div><div><label>URL slug * (انگریزی، مثال: sabr-ki-fazilat)</label><input id="slug" dir="ltr" placeholder="خالی چھوڑیں تو خودکار بنے گا"></div></div>
<div class="row"><div><label>زمرہ *</label><select id="category"></select></div><div><label>تاریخ اشاعت *</label><input id="date" type="date" dir="ltr"></div></div>
<label>مختصر خلاصہ (کارڈ اور گوگل کے لیے، ۱۲۰–۱۶۰ حروف)</label><textarea id="excerpt" style="min-height:4.5rem"></textarea>
<div class="row"><div><label>SEO ٹائٹل (اختیاری)</label><input id="seoTitle"></div><div><label>میٹا ڈسکرپشن (اختیاری، ۱۲۰–۱۶۰ حروف)</label><input id="metaDescription"></div></div>
<div class="row"><div><label>ٹیگز (کاما سے الگ کریں)</label><input id="tags" placeholder="صبر, قرآن, حوصلہ"></div><div><label>تصویر کا متبادل متن (alt)</label><input id="imageAlt"></div></div>
<label>نمایاں تصویر (اختیاری — خالی ہو تو خودکار کور بنے گی؛ سائز 1200×675، 300KB سے کم بہتر)</label><input id="img" type="file" accept="image/jpeg,image/png,image/webp"><small id="imgcur"></small>
<div class="row"><label class="chk"><input id="featured" type="checkbox"> ہوم پیج پر "منتخب" میں دکھائیں</label><label class="chk"><input id="popular" type="checkbox"> "مقبول مضامین" میں شامل کریں</label></div>
<label class="chk"><input id="draft" type="checkbox"> مسودہ (ڈرافٹ — ویب سائٹ پر شائع نہ ہو)</label>
<label>مضمون (Markdown: ## سرخی، **بولڈ**، > اقتباس، - فہرست)</label>
<div class="tool"><button class="sm" onclick="ins('## ','')">سرخی</button><button class="sm" onclick="ins('**','**')">بولڈ</button><button class="sm" onclick="ins('> ','')">اقتباس</button><button class="sm" onclick="ins('- ','')">فہرست</button><button class="sm" onclick="ins('[',']( https:// )')">لنک</button><button class="sm" onclick="pv()">پیش نظارہ</button></div>
<textarea id="body"></textarea><div id="pv" class="prose"></div>
<p><button onclick="save()">محفوظ کریں</button> <button class="red" id="del" onclick="del()" style="display:none">حذف کریں</button></p>
<small>محفوظ کرنے کے بعد "سائٹ دوبارہ بنائیں" دبائیں، پھر تبدیلی GitHub پر اپ لوڈ کریں (گائیڈ دیکھیں)۔</small></section></main>
<script>
const T=${JSON.stringify(TOKEN)};let cur='';const $=id=>document.getElementById(id);
const api=(u,b)=>fetch(u,{method:b?'POST':'GET',headers:{'x-token':T,'content-type':'application/json'},body:b?JSON.stringify(b):undefined}).then(r=>r.json());
const msg=t=>{const m=$('msg');m.textContent=t;m.style.display='block';scrollTo(0,0)};
async function load(){const d=await api('/api/data');$('category').innerHTML='<option value="">— منتخب کریں —</option>'+d.categories.map(c=>'<option value="'+c.slug+'">'+c.name+'</option>').join('');
$('list').innerHTML=d.articles.map(a=>'<li class="a" onclick="edit(\\''+a.file+'\\')">'+(a.draft?'📝 ':'')+a.title+'<br><small>'+a.date+'</small></li>').join('')||'<li><small>ابھی کوئی مضمون نہیں</small></li>'}
function newArt(){cur='';['title','slug','excerpt','seoTitle','metaDescription','tags','imageAlt','body'].forEach(i=>$(i).value='');$('category').value='';$('date').value=new Date().toISOString().slice(0,10);['featured','popular','draft'].forEach(i=>$(i).checked=false);$('img').value='';$('imgcur').textContent='';$('del').style.display='none';$('pv').style.display='none';$('msg').style.display='none'}
async function edit(f){const r=await api('/api/article?file='+f);const d=r.data;cur=f;newArt();cur=f;for(const k of ['title','slug','date','category','excerpt','seoTitle','metaDescription','imageAlt'])$(k).value=d[k]||'';$('tags').value=Array.isArray(d.tags)?d.tags.join(', '):(d.tags||'');['featured','popular','draft'].forEach(k=>$(k).checked=d[k]===true);$('imgcur').textContent=d.image?('موجودہ تصویر: '+d.image):'';$('body').value=r.body.trim();$('del').style.display='inline-block';scrollTo(0,0)}
function ins(a,b){const t=$('body'),s=t.selectionStart,e=t.selectionEnd,v=t.value;t.value=v.slice(0,s)+a+v.slice(s,e)+b+v.slice(e);t.focus()}
async function pv(){const p=$('pv');if(p.style.display==='block'){p.style.display='none';return}const r=await api('/api/preview',{body:$('body').value});p.innerHTML=r.html;p.style.display='block'}
const b64=f=>new Promise(ok=>{const r=new FileReader();r.onload=()=>ok(r.result.split(',')[1]);r.readAsDataURL(f)});
async function save(){const d={};for(const k of ['title','slug','date','category','excerpt','seoTitle','metaDescription','imageAlt'])d[k]=$(k).value.trim();d.tags=$('tags').value.split(/[,،]/).map(s=>s.trim()).filter(Boolean);for(const k of ['featured','popular','draft'])d[k]=$(k).checked;
if(!d.image&&$('imgcur').textContent.includes('/images/')){d.image=$('imgcur').textContent.split(': ')[1]}
const f=$('img').files[0];const body={data:d,body:$('body').value,oldFile:cur};if(f){if(f.size>300000&&!confirm('تصویر '+Math.round(f.size/1000)+'KB کی ہے۔ سائٹ سست ہو سکتی ہے۔ squoosh.app سے چھوٹی کر لیں۔ پھر بھی محفوظ کریں؟'))return;body.image={name:f.name,data:await b64(f)}}
const r=await api('/api/save',body);if(r.error)return msg('✖ '+r.error);cur=r.file;msg('✔ محفوظ ہو گیا: '+r.file+'\\nاب "سائٹ دوبارہ بنائیں" دبائیں۔');load();if(r.image)$('imgcur').textContent='موجودہ تصویر: '+r.image;$('del').style.display='inline-block'}
async function del(){if(!cur||!confirm('یہ مضمون ہمیشہ کے لیے حذف ہو جائے گا۔ یقیناً؟'))return;await api('/api/delete',{file:cur});newArt();load();msg('مضمون حذف ہو گیا۔')}
async function build(){msg('بن رہا ہے…');const r=await api('/api/build',{});msg(r.out)}
newArt();load();
</script></body></html>`;

http.createServer((req, res) => {
  const host = String(req.headers.host || '');
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) { res.writeHead(403); return res.end('Forbidden'); }
  const url = req.url.split('?')[0];
  if (url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(PAGE); }
  if (url.startsWith('/api/')) return api(req, res, url).catch((e) => json(res, 500, { error: e.message }));
  res.writeHead(404); res.end('Not found');
}).listen(PORT, '127.0.0.1', () => console.log(`\nمضمون ایڈیٹر: http://localhost:${PORT}   (رکنے کے لیے Ctrl+C)\n`));
