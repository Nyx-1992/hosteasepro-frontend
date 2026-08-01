#!/usr/bin/env node
/**
 * Every page HEP serves has a real, installable icon.
 *
 * WHY THIS EXISTS. The owner added all four sites to her phone's home screen
 * and got three grey tiles with a letter in them — iOS's fallback when a page
 * offers no apple-touch-icon it can use. HEP declared none at all; the staff
 * portal drew one in canvas at runtime and assigned it over the link element,
 * which meant a real icon file could never have won even if one existed; and
 * manifest.json pointed at /icons/icon-192.png, a path that 404'd.
 *
 * That last one is the trap this file mainly guards. vercel.json ends with
 * `/(.*) -> /demo/index_fixed.html`, so ANY path not explicitly rewritten
 * returns the app's HTML with a 200. A missing icon therefore does not fail
 * loudly — the browser gets a page of HTML labelled as a PNG, shrugs, and
 * draws the grey letter. Every icon path is checked to exist on disk AND to
 * be rewritten ahead of that catch-all.
 *
 * Run: node scripts/tests/test_app_icons.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const exists = (webPath) => fs.existsSync(path.join(ROOT, 'demo', webPath.replace(/^\//, '')));

const fail = [];
const ok = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fail.push(name); };

// ── Routing ───────────────────────────────────────────────────────
console.log('\n── Routing ──');
const vercel = JSON.parse(read('vercel.json'));
const srcs = vercel.rewrites.map(r => r.source);
const catchAll = srcs.indexOf('/(.*)');
ok('/icons/ resolves before the catch-all', srcs.indexOf('/icons/(.*)') >= 0 && srcs.indexOf('/icons/(.*)') < catchAll);
ok('both manifests resolve before the catch-all',
   srcs.indexOf('/manifest.json') >= 0 && srcs.indexOf('/manifest.json') < catchAll &&
   srcs.indexOf('/hep-manifest.json') >= 0 && srcs.indexOf('/hep-manifest.json') < catchAll);

// ── Every page ────────────────────────────────────────────────────
console.log('\n── Every page ──');
for (const [page, brand] of [['index_fixed.html','hep'], ['welcome.html','hep'], ['domestic.html','staff']]) {
  const src = read('demo', page);
  const apple = (src.match(/rel="apple-touch-icon"[^>]*href="([^"]+)"/) || [])[1];
  ok(`${page} offers an apple-touch-icon`, !!apple);
  // .svg and emoji-data-URI favicons are silently ignored by iOS for the
  // home screen; only a raster file is installable.
  ok(`${page}'s home-screen icon is a PNG`, /\.png$/.test(apple || ''));
  ok(`${page} uses the ${brand} mark`, (apple || '').includes(`/${brand}-`));
  const refs = [...src.matchAll(/href="(\/icons\/[^"]+)"/g)].map(m => m[1]);
  ok(`${page}: all ${refs.length} icon paths exist on disk`, refs.length > 0 && refs.every(exists));
}

// ── Manifests ─────────────────────────────────────────────────────
console.log('\n── Manifests ──');
// The labels are the owner's, chosen deliberately (2026-08-01). They are
// pinned exactly rather than checked against a length rule: an earlier
// version of this file capped short_name at 12 characters because iOS
// truncates there, which is true but is not a reason to overrule what the
// brand is called. "HEP Staff Portal" will show clipped on a home screen
// and that is the accepted trade.
const LABELS = {
  'hep-manifest.json': 'HostEase Pro',
  'manifest.json':     'HEP Staff Portal',
};
for (const [file, brand] of [['manifest.json','staff'], ['hep-manifest.json','hep']]) {
  const m = JSON.parse(read('demo', file));
  ok(`${file}: icons exist on disk`, m.icons.length >= 2 && m.icons.every(i => exists(i.src)));
  ok(`${file}: uses the ${brand} mark`, m.icons.every(i => i.src.includes(`/${brand}-`)));
  ok(`${file}: reads "${LABELS[file]}"`, m.name === LABELS[file] && m.short_name === LABELS[file]);
  ok(`${file}: names no single agency`, !/S&N|snapartments/i.test(JSON.stringify(m)));
}

// ── The label a phone puts under the icon ─────────────────────────
// apple-mobile-web-app-title, not <title> — iOS only falls back to the
// title when this is absent, and the marketing page's title is a full
// sentence about property management software for small agencies.
console.log('\n── Home-screen labels ──');
const APPLE = {
  'index_fixed.html': 'HostEase Pro',
  'welcome.html':     'HostEase Pro',
  'domestic.html':    'HEP Staff Portal',
};
for (const [page, want] of Object.entries(APPLE)) {
  const got = (read('demo', page).match(/apple-mobile-web-app-title"\s+content="([^"]*)"/) || [])[1];
  ok(`${page} installs as "${want}"`, got === want);
}

// The generator that made a real file impossible.
ok('no runtime canvas icon overwrites the link element', !/generateIcon/.test(read('demo', 'domestic.html')));

console.log(fail.length ? `\n${fail.length} FAILED\n` : '\nAll passed\n');
process.exit(fail.length ? 1 : 0);
