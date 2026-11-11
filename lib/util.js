'use strict';
// Small shared helpers (no external dependencies)

const URDU_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const toUrduDigits = (n) => String(n).replace(/\d/g, (d) => URDU_DIGITS[d]);

const MONTHS = ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];

function formatDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${toUrduDigits(d)} ${MONTHS[m - 1]} ${toUrduDigits(y)}`;
}

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const escapeXml = (s) => escapeHtml(s).replace(/'/g, '&apos;');

function htmlToText(html) {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse a tiny YAML-like front matter block (key: value). */
function parseFrontmatter(raw) {
  raw = String(raw).replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\"/g, '"');
    else if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    else if (v.startsWith('[') && v.endsWith(']'))
      v = v
        .slice(1, -1)
        .split(/[,،]/)
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    else if (v === 'true') v = true;
    else if (v === 'false') v = false;
    data[key] = v;
  }
  return { data, body: m[2] };
}

const FM_ORDER = ['title', 'slug', 'date', 'updated', 'category', 'excerpt', 'seoTitle', 'metaDescription', 'tags', 'image', 'imageAlt', 'featured', 'popular', 'draft'];

function toFrontmatter(data) {
  const lines = ['---'];
  for (const k of FM_ORDER) {
    let v = data[k];
    if (v === undefined || v === null || v === '' || v === false) continue;
    if (Array.isArray(v)) {
      if (!v.length) continue;
      lines.push(`${k}: [${v.map((t) => String(t).replace(/[,،\n]/g, ' ').trim()).join(', ')}]`);
    } else if (v === true) {
      lines.push(`${k}: true`);
    } else {
      lines.push(`${k}: "${String(v).replace(/\n/g, ' ').replace(/"/g, '\\"').trim()}"`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

module.exports = { toUrduDigits, formatDate, escapeHtml, escapeXml, htmlToText, parseFrontmatter, toFrontmatter, MONTHS };
