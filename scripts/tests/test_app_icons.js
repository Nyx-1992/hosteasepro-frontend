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
for (const [file, brand] of [['manifest.json','staff'], ['hep-manifest.json','hep']]) {
  const m = JSON.parse(read('demo', file));
  ok(`${file}: icons exist on disk`, m.icons.length >= 2 && m.icons.every(i => exists(i.src)));
  ok(`${file}: uses the ${brand} mark`, m.icons.every(i => i.src.includes(`/${brand}-`)));
  // iOS truncates the label under an icon at roughly a dozen characters.
  ok(`${file}: short_name fits under an icon`, m.short_name.length > 0 && m.short_name.length <= 12);
  ok(`${file}: names no single agency`, !/S&N|snapartments/i.test(JSON.stringify(m)));
}

// The generator that made a real file impossible.
ok('no runtime canvas icon overwrites the link element', !/generateIcon/.test(read('demo', 'domestic.html')));

console.log(fail.length ? `\n${fail.length} FAILED\n` : '\nAll passed\n');
process.exit(fail.length ? 1 : 0);
