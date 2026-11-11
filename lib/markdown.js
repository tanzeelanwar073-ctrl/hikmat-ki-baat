'use strict';
// A small, safe Markdown renderer (headings, paragraphs, lists, quotes, links, images, bold/italic).
// Raw HTML in the source is always escaped, so article files cannot inject scripts.

const { escapeHtml } = require('./util');

const safeUrl = (u) => (/^(https?:\/\/|mailto:|\/|#)/i.test(u) ? u : '#');

function inline(src) {
  let s = escapeHtml(src);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, u) => `<img src="${safeUrl(u)}" alt="${alt}" loading="lazy" decoding="async">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
    const ext = /^https?:\/\//i.test(u);
    return `<a href="${safeUrl(u)}"${ext ? ' rel="noopener noreferrer" target="_blank"' : ''}>${t}</a>`;
  });
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codes[i]}</code>`);
  return s;
}

const stripInline = (t) =>
  t
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*`]/g, '')
    .trim();

function render(md) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const headings = [];
  let i = 0;
  const blank = (l) => !l.trim();
  const STOP = /^(#{1,4}\s|>|\s*[-*]\s+|\s*\d+[.)]\s+|-{3,}\s*$)/;

  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }

    let m = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (m) {
      const level = Math.max(2, m[1].length); // the page title is the only <h1>
      const text = m[2].trim();
      const id = 's' + (headings.length + 1);
      headings.push({ level, text: stripInline(text), id });
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      const paras = buf.join('\n').split(/\n\s*\n/).filter((p) => p.trim()).map((p) => `<p>${inline(p.trim().replace(/\n/g, '<br>'))}</p>`);
      out.push(`<blockquote>${paras.join('')}</blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++; }
      out.push(`<ol>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ol>`);
      continue;
    }

    const buf = [];
    while (i < lines.length && !blank(lines[i]) && (buf.length === 0 || !STOP.test(lines[i]))) { buf.push(lines[i].trim()); i++; }
    const text = buf.join(' ');
    const im = text.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (im) {
      out.push(`<figure><img src="${safeUrl(im[2])}" alt="${escapeHtml(im[1])}" loading="lazy" decoding="async">${im[1] ? `<figcaption>${escapeHtml(im[1])}</figcaption>` : ''}</figure>`);
    } else {
      out.push(`<p>${inline(text)}</p>`);
    }
  }
  return { html: out.join('\n'), headings };
}

module.exports = { render, inline };
