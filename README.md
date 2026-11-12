# حکمت کی بات — Urdu Wisdom Website

A complete, free, fast Urdu (RTL) article website. No database, no paid service, no `npm install`.

## Why this stack (short)

**Static site generator in plain Node.js + Markdown files + Cloudflare Pages (or GitHub Pages / Netlify).**

- Pages are pre-built HTML, so they load fast and Google can crawl them easily.
- Hosting is free and there is no server to hack or maintain.
- Articles are simple text files. You write them in a local editor (`npm run admin`) that works like a mini CMS.
- Zero dependencies means nothing breaks when packages change .

### What works immediately vs. what needs setup

| Feature | Status |
|---|---|
| All pages, 7 categories, article pages, search, TOC, related articles, Facebook/WhatsApp share | Works now |
| Sitemap, robots.txt, canonical, Open Graph, Schema.org, RSS | Works now (set your real URL first) |
| Local article editor (add/edit, image upload, SEO fields, tags, dates, drafts) | Works now on your computer |
| Free `*.pages.dev` address | After you deploy (step 3) |
| Contact form | Shows your email button now; add free [Formspree](https://formspree.io) ID in `site.config.json` for a real form |
| Google Analytics / Search Console | Paste IDs in `site.config.json` |
| AdSense ads | **Not shown** until you are approved and add IDs. No fake ads are included |
| Newsletter | **Not included** on purpose: no working subscription system is free and setup-free. Add one later (e.g. Buttondown/MailerLite free tier) |

## 1. Run it on your computer

Install [Node.js](https://nodejs.org) (LTS, version 18 or newer). Then in this folder:

```
npm run dev      # builds the site and opens a preview at http://localhost:8080
npm run admin    # opens the article editor at http://localhost:4000
```

# 2. First settings (`site.config.json`)

- `url`: your public address, e.g. `https://hikmat-ki-baat.pages.dev` (no trailing slash). **Required** for a correct sitemap and canonical links.
- `email`: your real contact email (shown on About, Contact and policy pages).
- `author.name`: the name shown as the author.
- Leave `googleAnalyticsId`, `searchConsoleVerification`, `adsense` empty for now.

Also read the policy pages in `content/pages/` once and edit anything that does not match you. They are good starting templates, not legal advice.

## 3. Deploy for free (Cloudflare Pages, recommended)

Cloudflare's free plan allows 500 builds/month, 20,000 files per site and 100 custom domains per project ([limits](https://developers.cloudflare.com/pages/platform/limits/)).

1. Create a free account at github.com and a new repository (e.g. `hikmat-ki-baat`).
2. Upload this folder's contents to it (GitHub web page: **Add file → Upload files**, drag everything, including the hidden `.gitignore`). Do not upload `dist/`.
3. Create a free account at dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git** and pick the repo.
4. Build settings:
   - Framework preset: **None**
   - Build command: `node build.js`
   - Build output directory: `dist`
   - Environment variable `NODE_VERSION` = `20`
5. Click **Save and Deploy**. You get a free address like `https://your-project.pages.dev`.
6. Put that address in `site.config.json` → `url`, commit, and it redeploys automatically.

Alternatives: **Netlify** (build `node build.js`, publish `dist`) or **GitHub Pages** (needs a small GitHub Actions workflow; use Cloudflare or Netlify if unsure).

### Updating the site later

Every time you change a file on GitHub, Cloudflare rebuilds and republishes in about a minute.

## 4. Publishing articles

1. `npm run admin`, then click **+ نیا مضمون**.
2. Fill in title, category, date, summary, SEO title and meta description, tags, and optionally a featured image (JPG/PNG/WEBP, ideally 1200×675 and under 300 KB; compress free at squoosh.app). With no image, a neat abstract cover is generated automatically.
3. Write the article (toolbar buttons help with headings, bold, quotes, lists). Use `##` headings; with 3 or more, a table of contents appears automatically.
4. **Save**, then **سائٹ دوبارہ بنائیں** and check the preview at `npm run dev`.
5. Upload the new files to GitHub (`content/articles/…` and `static/images/articles/…`). The site updates itself.

Tips:
- A date in the future keeps the article hidden until that day's build. Tick **مسودہ** to keep a draft unpublished.
- You can also edit the `.md` files in `content/articles/` by hand, or directly on GitHub's web editor.
- Rebuild warns you about short articles, missing summaries and missing images.
- To mark an article "popular", tick the box; to feature it on the home page, tick "منتخب".

## 5. Custom domain (later, about $10/year, the only cost)

1. Buy a domain (Cloudflare Registrar sells at cost; Namecheap etc. also work).
2. In Cloudflare Pages: project → **Custom domains → Set up a domain**, and follow the DNS steps.
3. Change `url` in `site.config.json` to the new address (e.g. `https://hikmatkibaat.com`). Redeploy.
4. Re-add the site in Search Console under the new address.

## 6. Google Search Console

1. Go to search.google.com/search-console → **Add property**.
2. Choose **URL prefix** and enter your exact site address.
3. Pick **HTML tag** verification. Copy only the `content="…"` value into `searchConsoleVerification` in `site.config.json`, redeploy, then click **Verify**. (A custom domain can instead use DNS verification, which covers all versions of it.)
4. **Sitemaps** → enter `sitemap.xml` → Submit.
5. To check indexing: **URL Inspection** → paste an article URL → *Request indexing*. Also use **Pages** to see what is indexed and why anything is not.
6. Indexing can take days or weeks, and Google decides what to index. Nothing here can guarantee ranking.

## 7. Google Analytics (optional)

Create a Google Analytics 4 property, copy the Measurement ID (`G-XXXXXXXXXX`) into `googleAnalyticsId`, redeploy. Mention of analytics is already in the privacy policy.

## 8. Preparing for Google AdSense

The site is built to meet the basics: original content layout, clear navigation, About, Contact, Privacy Policy, Disclaimer, Terms, responsive ad slots, no popups, and no fake ads.

**Checklist before applying**

- [ ] Own domain. AdSense requires you to control the site, and free `*.pages.dev` subdomains are widely reported to be rejected (this is community experience, not a published rule). Plan the ~$10 domain.
- [ ] You are 18 or older (otherwise a parent or guardian must apply).
- [ ] Your own original, helpful articles. A common community guideline is 20–30 solid articles before applying; Google publishes no fixed number. Do not copy newspapers, books or AI text published unedited.
- [ ] Real contact email set; policy pages reviewed.
- [ ] Site verified in Search Console, and your articles are getting indexed.
- [ ] Never click your own ads or ask others to; no misleading placement.

**After applying and approval**

1. In AdSense, add your site and place their verification code if asked. You can paste it into `head()` in `build.js`, or just use the `publisherId` below once approved.
2. Create ad units (display, in-article) and copy the numeric slot IDs.
3. In `site.config.json`:

```json
"adsense": {
  "publisherId": "ca-pub-1234567890123456",
  "slots": { "top": "", "inArticle": "1111111111", "sidebar": "2222222222", "bottom": "3333333333", "home": "" }
}
```

4. Redeploy. The script, labelled "اشتہار" containers and `ads.txt` are generated automatically. Leave a slot empty to leave that position adless.
5. If a EEA/UK/Swiss audience is possible, Google requires a consent message; set it up in the AdSense "Privacy & messaging" section.

Approval is never guaranteed and depends on Google's review.

## Project map

```
site.config.json      settings (URL, email, analytics, AdSense)
content/articles/     your articles (.md)       content/pages/   About, Contact, policies
content/categories.json   the 7 categories
static/               files copied as-is (images, _headers)
src/                  style.css, app.js
lib/, build.js        the generator            tools/  local editor + preview server
dist/                 generated site (deployed, not edited)
```
