#!/usr/bin/env node
/**
 * Invoices and owner statements carry the ORG's identity, not S&N's.
 *
 * WHY THIS EXISTS. 870 moved the business name, address, registration and
 * banking onto org_settings because the fallbacks were S&N's real values,
 * and a second agency would otherwise have invoiced its customers into
 * S&N's bank account. That fixed where the money goes.
 *
 * It did not fix what the document says. Everything around the numbers
 * was still hardcoded in the two renderers — "S&N APARTMENTS®" at the
 * top, "Beyond the booking" under it, signature blocks reading "Nicole
 * Babczyk" and "Silja Faltin", and a footer with S&N's email address. A
 * second agency billing their own customer sent them a document with
 * another company's name and two strangers' signatures on it, and
 * because 870 had made the bank details correct, it looked deliberate
 * rather than broken.
 *
 * 893 adds tagline, strapline and signatories to org_settings, and the
 * three helpers here read them. The rule they encode: MISSING PRINTS
 * NOTHING. A plain invoice is fine. An invoice wearing someone else's
 * identity is not — the same reasoning that made 870 leave the bank
 * account blank rather than inherit one.
 *
 * The check that matters most is the last one: for a fresh org, no part
 * of the document may contain any S&N string at all.
 *
 * Run: node scripts/tests/test_document_branding.js
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
  'let INV_COMPANY = {}; let CLIENT_BRAND = {};',
  grabFn('escHtml'),
  grabFn('invDocName'),
  grabFn('invLetterheadHtml'),
  grabFn('invSignatureHtml'),
  grabFn('invFooterHtml'),
  grabFn('signatoriesToText'),
  grabFn('textToSignatories'),
  'module.exports = { set: (i, b) => { INV_COMPANY = i; CLIENT_BRAND = b; },',
  '  letterhead: () => invLetterheadHtml(), signature: () => invSignatureHtml(),',
  '  footer: () => invFooterHtml(), doc: () => invLetterheadHtml() + invSignatureHtml() + invFooterHtml(),',
  '  signatoriesToText, textToSignatories };',
].join('\n\n');

const mod = { exports: {} };
new Function('module', 'exports', src)(mod, mod.exports);
const M = mod.exports;

const fail = [];
const ok = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fail.push(name); };

// ── S&N: the document must come out exactly as before ─────────────
console.log('\n── S&N, backfilled by 893 ──');

M.set(
  { name: 'S&N Apt Management', email: 'SN_Apt_Management@outlook.com' },
  { name: 'S&N Apt Management', tagline: 'Beyond the booking',
    strapline: 'CURATED STAYS · PERSONAL SERVICE',
    signatories: [{ name: 'Nicole Babczyk', title: 'DIRECTOR' },
                  { name: 'Silja Faltin',  title: 'DIRECTOR' }] });

const sn = M.doc();
ok('name still heads the document',      sn.includes('S&amp;N APT MANAGEMENT'));
ok('tagline still prints',               sn.includes('Beyond the booking'));
ok('strapline still prints',             sn.includes('CURATED STAYS'));
ok('both directors still sign',          sn.includes('Nicole Babczyk') && sn.includes('Silja Faltin'));
ok('their titles carry the org name',    sn.includes('DIRECTOR · S&amp;N APT MANAGEMENT'));
ok('the footer still carries the email', sn.includes('SN_APT_MANAGEMENT@OUTLOOK.COM'));

// ── A fresh org: nothing of S&N's may survive ─────────────────────
console.log('\n── A fresh agency ──');

M.set(
  { name: 'Cape Coast Property Co', email: 'hello@capecoast.co.za' },
  { name: 'Cape Coast Property Co', tagline: '', strapline: '', signatories: [] });

const fresh = M.doc();
ok('their own name heads the document', fresh.includes('CAPE COAST PROPERTY CO'));
ok('their own email is in the footer',  fresh.includes('HELLO@CAPECOAST.CO.ZA'));
ok('no tagline is invented',            !fresh.includes('Beyond the booking'));
ok('no strapline is invented',          !fresh.includes('CURATED STAYS'));
ok('no signature block at all',         !fresh.includes('Kind regards'));

// The one that would have shipped someone else's identity to a paying
// customer. Checked as a sweep, not field by field, so a new hardcoded
// string added later fails here too.
const traces = ['S&N', 'S&amp;N', 'SN_Apt', 'Nicole', 'Silja', 'Beyond the booking',
                'CURATED STAYS', 'APT MANAGEMENT', 'outlook.com'];
const found = traces.filter(t => fresh.toLowerCase().includes(t.toLowerCase()));
ok('NO trace of S&N anywhere in a fresh org\'s document' +
   (found.length ? ' — found ' + found.join(', ') : ''), found.length === 0);

// ── Partly configured ─────────────────────────────────────────────
console.log('\n── Partly filled in ──');

M.set({ name: 'Solo Host', email: '' },
      { name: 'Solo Host', tagline: 'Small and careful', strapline: '', signatories: [] });
const solo = M.doc();
ok('a tagline without a strapline prints on its own',
   solo.includes('Small and careful') && !solo.includes('letter-spacing:.06em;margin-top:2px'));
ok('the footer omits a missing email rather than printing a separator',
   !solo.includes('· ·') && !/>\s*·/.test(solo));

M.set({ name: '', email: '' }, { name: '', tagline: '', strapline: '', signatories: [] });
const bare = M.doc();
ok('a completely unconfigured org still renders without throwing', typeof bare === 'string');
ok('and prints no name rather than the word undefined', !/undefined|null/.test(bare));

M.set({ name: 'One Person Co', email: '' },
      { name: 'One Person Co', tagline: '', strapline: '', signatories: [{ name: 'Jane Smith', title: '' }] });
ok('a signatory with no title still signs, with just the org name',
   M.signature().includes('Jane Smith') && M.signature().includes('ONE PERSON CO'));

// ── The editor round-trip ─────────────────────────────────────────
console.log('\n── Editing signatories as plain lines ──');

const rows = [{ name: 'Nicole Babczyk', title: 'DIRECTOR' }, { name: 'Silja Faltin', title: 'DIRECTOR' }];
ok('rows render as one "Name, Title" per line',
   M.signatoriesToText(rows) === 'Nicole Babczyk, DIRECTOR\nSilja Faltin, DIRECTOR');
ok('and parse back to exactly the same rows',
   JSON.stringify(M.textToSignatories(M.signatoriesToText(rows))) === JSON.stringify(rows));
ok('a name with no comma becomes a name with no title',
   JSON.stringify(M.textToSignatories('Jane Smith')) === JSON.stringify([{ name: 'Jane Smith', title: '' }]));
ok('a title containing a comma survives',
   M.textToSignatories('Jane Smith, Director, Operations')[0].title === 'Director, Operations');
ok('blank lines and stray whitespace are dropped',
   M.textToSignatories('\n  \nJane Smith, Director\n\n').length === 1);
ok('an empty box means no signatories', M.textToSignatories('').length === 0);
ok('a non-array from the database does not throw', M.signatoriesToText(null) === '');

// ── The strings are really gone from the page ─────────────────────
console.log('\n── The page itself ──');
const renderers = html.slice(html.indexOf('function invRender()'));
ok('no hardcoded letterhead left in the renderers', !renderers.includes('S&N APARTMENTS®'));
ok('no hardcoded signatures left in the renderers',
   !renderers.includes('>Nicole Babczyk<') && !renderers.includes('>Silja Faltin<'));
ok('no hardcoded footer email left in the renderers',
   !renderers.includes('SN_Apt_Management@outlook.com'));

console.log(fail.length ? `\n${fail.length} FAILED\n` : '\nAll checks passed\n');
process.exit(fail.length ? 1 : 0);
