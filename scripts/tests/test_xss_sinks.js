#!/usr/bin/env node
/**
 * Names that come from outside must not reach the page as HTML.
 *
 * WHY THIS EXISTS. 25 November, production. The owner was shown what
 * looked like a Booking.com Extranet sign-in — "Your session has expired.
 * You have 1 new prepaid reservation (Virtual Card) to review for
 * Speranta Flat" — with her own email filled in and a Confirm password
 * field. It was not a website. It was her own admin page.
 *
 * Three bookings had been created on Speranta Flat whose guest_name was
 *
 *     "><img src=x onerror="...">
 *
 * The booking list wrote `${b.guest_name}` straight into innerHTML, so
 * opening the page ran the attacker's script. It drew a full-screen
 * overlay styled as Booking.com, read the Supabase session out of
 * localStorage, and on submit PATCHed the typed password into a booking's
 * notes and the user's own profile name — exfiltration through her own
 * database, using her own token. Then it removed itself after 2.2s so it
 * looked like a glitch.
 *
 * THE DANGEROUS PART IS THAT GUEST NAMES ARE NOT OURS. They arrive from
 * Booking.com, Airbnb and LekkeSlaap iCal feeds and are written by
 * whoever makes the reservation. A booking is not a trusted document.
 * Neither is a property name, a contact name, or an organisation name on
 * a platform anybody can sign up to.
 *
 * Run: node scripts/tests/test_xss_sinks.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'demo', 'index_fixed.html'), 'utf8');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// Comments describe the attack and quote the payload, so they must not be
// scanned as if they were code.
const code = html
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/^[ \t]*\/\/.*$/gm, '');

const lines = code.split('\n');

// A line is a template interpolation into markup if it carries ${...} and
// sits in a string that also builds a tag. Checking the interpolation
// itself is enough: a bare field with no escaper around it is the bug.
// A dialog renders text, not markup — including the multi-line form where
// the call opens a line or two above the interpolation.
const DIALOG = /\b(confirm|confirmAction|alert|prompt)\s*\(/;
const nearDialog = (n) => lines.slice(Math.max(0, n - 4), n).some(l => DIALOG.test(l));

// The real question is whether the surrounding string builds markup. A
// WhatsApp template is emoji and asterisks and never opens a tag, so the
// same interpolation there is harmless. Look at the line and its
// neighbours rather than guessing from the field name.
const TAG = /<[a-zA-Z/]/;
const inMarkup = (n) => lines.slice(Math.max(0, n - 4), n + 3).some(l => TAG.test(l));

const unguarded = (re) => lines
  .map((l, i) => ({ n: i + 1, l }))
  .filter(({ l }) => re.test(l))
  .filter(({ l }) => !/escHtml|escAttr|textContent|encodeURIComponent/.test(l))
  .filter(({ n }) => !nearDialog(n))
  .filter(({ n }) => inMarkup(n));

console.log('\nOutside names must be escaped before they reach innerHTML\n');

const checks = [
  ['guest name',        /\$\{[^}]*\bguest_name\b[^}]*\}/],
  ['display name',      /\$\{[^}]*\bdisplay_name\b[^}]*\}/],
  ['property name',     /\$\{\s*(prop|p)\.name[^}]*\}/],
  ['PROPS[..].name',    /\$\{[^}]*\bPROPS\[[^\]]+\]\.(name|short)[^}]*\}/],
  ['contact name',      /\$\{\s*c\.name[^}]*\}/],
  ['contact role',      /\$\{\s*c\.role[^}]*\}/],
  ['property address',  /\$\{\s*(prop|p)\.address[^}]*\}/],
];

for (const [label, re] of checks) {
  const hits = unguarded(re);
  ok(`${label} is never interpolated raw`,
     hits.length === 0,
     hits.slice(0, 4).map(h => `line ${h.n}: ${h.l.trim().slice(0, 100)}`).join('\n      '));
}

console.log('\nThe escapers themselves\n');

ok('escHtml neutralises angle brackets',
   /function\s+escHtml[\s\S]{0,200}?replace\(\/</.test(code),
   'escHtml must replace < (and &) or it does nothing useful');

ok('escAttr neutralises the quote that breaks out of an attribute',
   /function\s+escAttr[\s\S]{0,200}?replace\(\/"/.test(code),
   'escAttr must replace " or a value="" interpolation can escape its attribute');

console.log('');
if (fail.length) {
  console.log(`${fail.length} failing:`);
  fail.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('All XSS sink checks passed.\n');
