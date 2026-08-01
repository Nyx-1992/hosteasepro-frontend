#!/usr/bin/env node
/**
 * Properties are whatever the org has — not Speranta and TV House.
 *
 * WHY THIS EXISTS. The app was written when S&N had exactly two
 * properties, so "the other one" was a meaningful idea and it spread
 * everywhere: calendar colours were `pid==='speranta' ? pink : teal`,
 * dense lists were tagged `[SP]` or `[TV]`, forms defaulted to
 * `'speranta'`, and the Reports tab computed revenue for Speranta and
 * labelled the card "Speranta Revenue" whatever was selected.
 *
 * None of that survives a third property, let alone another agency's
 * first. Three specific ways it failed:
 *
 *   1. The short key was derived in JavaScript as
 *        name.includes('speranta') ? 'speranta'
 *      : name.includes('tv')       ? 'tvhouse'
 *      : (code || id).toLowerCase()
 *      so someone else's "TV Lounge" took S&N's key and filed its cleans
 *      against a stranger's property. It did not error — it put the
 *      record in the wrong place, which is worse.
 *   2. Anything the matcher missed fell through to 'speranta' twice
 *      over, so unrecognised bookings silently became Speranta bookings.
 *   3. Every colour and tag assumed exactly two properties, so a third
 *      was indistinguishable from the second.
 *
 * 894 makes properties.short_key the single source of the key, unique
 * per org and stable across renames — it has to be stable, because
 * domestics.property_id stores it. These helpers read it.
 *
 * Run: node scripts/tests/test_property_keys.js
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'demo', 'index_fixed.html');
const html = fs.readFileSync(FILE, 'utf8');

function grabFn(name) {
  const start = html.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('cannot find function ' + name + ' in index_fixed.html');
  let depth = 0;
  for (let j = html.indexOf('{', start); j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}' && --depth === 0) return html.slice(start, j + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}

const src = [
  'let PROPS = {}, UUID_MAP = {};',
  html.match(/^const PROP_PALETTE = .*$/m)[0],
  grabFn('propKeys'), grabFn('propKeyOf'), grabFn('defaultPropKey'),
  grabFn('propFullName'), grabFn('propShortName'), grabFn('propTagOf'),
  grabFn('propColor'), grabFn('propCleaningFee'),
  'module.exports = { set: (p, u) => { PROPS = p; UUID_MAP = u; },',
  '  propKeys, propKeyOf, defaultPropKey, propFullName, propShortName,',
  '  propTagOf, propColor, propCleaningFee, PROP_PALETTE };',
].join('\n\n');

const mod = { exports: {} };
new Function('module', 'exports', src)(mod, mod.exports);
const M = mod.exports;

const fail = [];
const ok = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fail.push(name); };

// ── S&N, unchanged ────────────────────────────────────────────────
console.log('\n── S&N: two properties, nothing may move ──');

const SN_PROPS = {
  speranta: { name: 'Speranta Flat', short: 'Speranta Flat', uuid: 'e9737638-d83a-4947-940a-8746789e4d9f', cleaningFee: 400 },
  tvhouse:  { name: 'TV House',      short: 'TV House',      uuid: '83b2a84a-5451-4be5-a84f-2efc0d2602d5', cleaningFee: 550 },
};
const SN_UUIDS = { 'e9737638-d83a-4947-940a-8746789e4d9f': 'speranta',
                   '83b2a84a-5451-4be5-a84f-2efc0d2602d5': 'tvhouse' };
M.set(SN_PROPS, SN_UUIDS);

ok('a uuid resolves to its short key',   M.propKeyOf('e9737638-d83a-4947-940a-8746789e4d9f') === 'speranta');
ok('a short key resolves to itself',     M.propKeyOf('tvhouse') === 'tvhouse');
ok('a property name resolves too',       M.propKeyOf('TV House') === 'tvhouse');
ok('an unknown id resolves to nothing',  M.propKeyOf('not-a-property') === '');
ok('an empty id resolves to nothing',    M.propKeyOf('') === '' && M.propKeyOf(null) === '');
ok('tags are the initials, [SP] and [TV]',
   M.propTagOf('speranta') === 'SF' && M.propTagOf('tvhouse') === 'TH');
ok('cleaning fees come from the property', M.propCleaningFee('tvhouse') === 550);
ok('an unpriced property is zero, not one of S&N\'s two rates',
   M.propCleaningFee('nothing-here') === 0);

// The calendar must look exactly as it did: Airbnb pink then teal.
ok('the first property keeps the old pink',  M.propColor('speranta') === '#FF385C');
ok('the second keeps the old teal',          M.propColor('tvhouse')  === '#4ABBA5');

// ── A third property ──────────────────────────────────────────────
console.log('\n── A third property ──');

const THREE = {
  ...SN_PROPS,
  seaview: { name: 'Sea View Cottage', short: 'Sea View Cottage', uuid: 'u-3', cleaningFee: 500 },
};
M.set(THREE, { ...SN_UUIDS, 'u-3': 'seaview' });
ok('it gets its own colour, not a repeat', M.propColor('seaview') === '#5B8EF0');
ok('all three colours differ',
   new Set(['speranta','tvhouse','seaview'].map(M.propColor)).size === 3);
ok('all three tags differ',
   new Set(['speranta','tvhouse','seaview'].map(M.propTagOf)).size === 3);

// ── Another agency entirely ───────────────────────────────────────
console.log('\n── Another agency ──');

const CC = {
  dunecottage:  { name: 'Dune Cottage',  short: 'Dune Cottage',  uuid: 'c-1', cleaningFee: 400 },
  harbourloft:  { name: 'Harbour Loft',  short: 'Harbour Loft',  uuid: 'c-2', cleaningFee: 500 },
  tvlounge:     { name: 'TV Lounge',     short: 'TV Lounge',     uuid: 'c-3', cleaningFee: 350 },
};
M.set(CC, { 'c-1': 'dunecottage', 'c-2': 'harbourloft', 'c-3': 'tvlounge' });

// The one that used to file a stranger's clean against S&N's property:
// under the old derivation "TV Lounge" matched includes('tv').
ok('a property called "TV Lounge" is NOT S&N\'s tvhouse',
   M.propKeyOf('TV Lounge') === 'tvlounge');
ok('S&N\'s keys mean nothing to another agency',
   M.propKeyOf('speranta') === '' && M.propKeyOf('tvhouse') === '');
ok('the default property is their own first one',
   M.defaultPropKey() === 'dunecottage');
ok('names come from their properties', M.propFullName('c-2') === 'Harbour Loft');
ok('tags are derived from their names',
   M.propTagOf('c-1') === 'DC' && M.propTagOf('c-2') === 'HL');

// ── One property, and none ────────────────────────────────────────
console.log('\n── Edge cases ──');

M.set({ only: { name: 'The Cabin', short: 'The Cabin', uuid: 'o-1', cleaningFee: 0 } }, { 'o-1': 'only' });
ok('a single-property org has a default', M.defaultPropKey() === 'only');
ok('a two-word name tags as its initials', M.propTagOf('only') === 'TC');

M.set({}, {});
ok('no properties: the default is empty, not "speranta"', M.defaultPropKey() === '');
ok('no properties: nothing resolves',      M.propKeyOf('speranta') === '');
ok('no properties: colour still returns something renderable',
   typeof M.propColor('anything') === 'string' && M.propColor('anything').startsWith('#'));
ok('no properties: an unknown name falls back to the id, not a crash',
   M.propFullName('whatever') === 'whatever');
ok('no properties: "all" still reads as All Properties',
   M.propFullName('all') === 'All Properties');

// Two properties whose initials collide must not share a tag.
M.set({ a: { name: 'Beach House', short: 'Beach House', uuid: 'a' },
        b: { name: 'Blue Horizon', short: 'Blue Horizon', uuid: 'b' } }, { a: 'a', b: 'b' });
ok('colliding initials are made unique', M.propTagOf('a') !== M.propTagOf('b'));

// ── The page itself ───────────────────────────────────────────────
console.log('\n── The page itself ──');

const seedless = html.replace(/const ROADMAP_SEED = \[[\s\S]*?\n\];/, '');
const code = seedless.split('\n')
  .filter(l => !/^\s*(\/\/|\*|<!--)/.test(l.trim()))
  .join('\n');
ok('no "speranta" literal left in code or markup', !/['"]speranta['"]/.test(code));
ok('no "tvhouse" literal left in code or markup',  !/['"]tvhouse['"]/.test(code));
ok('PROPS no longer ships S&N\'s two properties',  /let PROPS = \{\};/.test(html));
ok('UUID_MAP no longer ships S&N\'s two uuids',    /let UUID_MAP = \{\};/.test(html));
ok('every property picker is rebuilt from the org',
   /const PROP_SELECTS = \{/.test(html) && (html.match(/'[a-z-]+-?prop[a-z-]*':\s+\[/g) || []).length >= 8);

console.log(fail.length ? `\n${fail.length} FAILED\n` : '\nAll checks passed\n');
process.exit(fail.length ? 1 : 0);
