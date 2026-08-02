#!/usr/bin/env node
/**
 * The staff portal speaks more than English.
 *
 * WHY THIS EXISTS. This is the one screen in HEP that is not used by the
 * person who bought it. Cleaners use it, and a job instruction that has to
 * be read in somebody's third language is an instruction that gets missed.
 *
 * WHAT THIS FILE IS REALLY GUARDING. Not the translations — a test cannot
 * tell you whether the isiXhosa is any good, and this file makes no claim
 * about that. It guards the three ways this specific job breaks SILENTLY,
 * all three of which happened while it was being written:
 *
 *   1. A t() call put inside the wrong kind of string. `${t('x')}` inside a
 *      single-quoted concatenation, or '+t('x')+' inside a template
 *      literal, does not throw — it renders the source text verbatim onto
 *      the screen of somebody trying to work. Three of these shipped into
 *      the file before being caught by eye.
 *
 *   2. A key that does not exist. t('tapInvenotry') renders the key, on a
 *      live screen, forever, and no error is ever logged.
 *
 *   3. The dictionary eating itself. A find-and-replace across the file
 *      rewrote the ENGLISH dictionary values into t() calls referring to
 *      themselves, because the English source strings appear both in the
 *      dictionary and at the call sites. Silent, and it takes the fallback
 *      language with it — which is the one thing every other language
 *      depends on.
 *
 * Run: node scripts/tests/test_staff_portal_languages.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const portal = read('demo', 'domestic.html');
const sw = read('demo', 'sw.js');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// The script layer, which is where every silent failure lives.
const scriptStart = portal.indexOf('<script>');
const script = portal.slice(scriptStart);
const markup = portal.slice(0, scriptStart);

// ══ THE DICTIONARY ════════════════════════════════════════════════
console.log('\n── The dictionary ──');

// Pull each locale block out by name. Parsing rather than eval: this file
// must never execute page source to check it.
function localeBlock(code) {
  const m = script.match(new RegExp('\\n  ' + code + ': \\{([\\s\\S]*?)\\n  \\},'));
  return m ? m[1] : null;
}
const LOCALES = ['en', 'af', 'sn', 'xh'];
const blocks = {};
LOCALES.forEach(c => { blocks[c] = localeBlock(c); });
ok('all four locale blocks are present', LOCALES.every(c => blocks[c]),
   'missing: ' + LOCALES.filter(c => !blocks[c]).join(', '));

// Keys only, never text that merely looks like one. Values such as
// 'All time total:' and 'Totaal tot dusver:' end in a colon, and a plain
// regex happily reports "total" and "dusver" as keys — which then shows up
// as every language being simultaneously short of a key and carrying an
// extra one. Blank the string literals first, so only real keys survive.
const keysOf = (block) => {
  const bare = block.replace(/'(\\.|[^'\\])*'/g, "''").replace(/"(\\.|[^"\\])*"/g, '""');
  const out = new Set();
  const re = /(?:^|[\s,{])([a-zA-Z][a-zA-Z0-9_]*)\s*:/gm;
  let m;
  while ((m = re.exec(bare))) out.add(m[1]);
  return out;
};
const enKeys = blocks.en ? keysOf(blocks.en) : new Set();
ok('English carries a substantial dictionary', enKeys.size > 120, enKeys.size + ' keys');

// Failure 3. A dictionary value that calls t() is self-referential; when it
// is the English one it takes every other language's fallback down with it.
LOCALES.forEach(c => {
  if (!blocks[c]) return;
  const selfRef = (blocks[c].match(/:\s*t\(/g) || []).length;
  ok(`${c} dictionary holds literal strings, not t() calls`, selfRef === 0,
     selfRef + ' self-referential value(s)');
});

// Every language is measured against English, because English is the
// fallback: a key missing from af degrades to English, but a key missing
// from EN degrades to the raw key on screen.
LOCALES.filter(c => c !== 'en').forEach(c => {
  if (!blocks[c]) return;
  const k = keysOf(blocks[c]);
  const missing = [...enKeys].filter(x => !k.has(x));
  const extra = [...k].filter(x => !enKeys.has(x));
  ok(`${c} covers every English key`, missing.length === 0,
     'missing: ' + missing.slice(0, 8).join(', ') + (missing.length > 8 ? ` (+${missing.length - 8})` : ''));
  // An extra key is dead weight, but more usefully it is almost always a
  // typo of a real one — which means the real one is falling back silently.
  ok(`${c} has no key English does not`, extra.length === 0, 'extra: ' + extra.join(', '));
});

// Calendars. A short month array throws nothing and prints "undefined".
LOCALES.forEach(c => {
  if (!blocks[c]) return;
  const months = (blocks[c].match(/months:\s*\[([^\]]*)\]/) || [])[1];
  const short = (blocks[c].match(/monthsShort:\s*\[([^\]]*)\]/) || [])[1];
  const days = (blocks[c].match(/weekdaysMin:\s*\[([^\]]*)\]/) || [])[1];
  const n = (s) => (s ? s.split(',').length : 0);
  ok(`${c} has 12 months, 12 short months and 7 weekday heads`,
     n(months) === 12 && n(short) === 12 && n(days) === 7,
     `${n(months)}/${n(short)}/${n(days)}`);
});

// ══ STRING CONTEXT ════════════════════════════════════════════════
//
// Failure 1, and the reason this file exists at all. Walks the script
// tracking which kind of quote we are inside, so each call site can be
// judged against the syntax actually used to reach it.
console.log('\n── Every t() call is in the right kind of string ──');

// The subtlety that makes a naive version of this useless: inside a
// template literal, `"` and `'` are ordinary characters — the portal is
// full of `<button onclick="f('${id}')">` — but inside a ${…} hole they
// are real quotes again. So this keeps a stack rather than a single flag,
// and `${` pushes back into code.
// Three subtleties, each of which produced a wrong answer before being
// handled, and all three of which occur in this page:
//
//   `<button onclick="f('${id}')">`  — inside a template literal, " and '
//                                      are ordinary characters
//   ${t('x')}                        — but inside a ${…} hole they are
//                                      real quotes again, and the hole is
//                                      code, not string
//   ${t('daysLate',{n:days})}        — a hole can contain braces of its
//                                      own, so the first } does not
//                                      necessarily close it
//
// So: a stack, with '$' marking a hole, and a brace depth per hole.
function contextAt(src) {
  // index -> null (plain code) | "'" | '"' | '`' | '$' (code inside a hole)
  const ctx = new Array(src.length).fill(null);
  const stack = [];
  const top = () => (stack.length ? stack[stack.length - 1] : null);
  const q = () => (top() ? top().q : null);
  const inCode = () => { const k = q(); return k === null || k === '$'; };
  let i = 0, lineComment = false, blockComment = false;
  while (i < src.length) {
    const c = src[i], n = src[i + 1], k = q();
    if (lineComment) { if (c === '\n') lineComment = false; i++; continue; }
    if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i += 2; continue; } i++; continue; }
    if (inCode() && c === '/' && n === '/') { lineComment = true; i += 2; continue; }
    if (inCode() && c === '/' && n === '*') { blockComment = true; i += 2; continue; }
    // Regex literals. .replace(/'/g, "\\'") is real code in this page, and
    // without this the lone quote inside the pattern opens a string that
    // never closes — after which every later verdict is noise. Told apart
    // from division by what precedes it: you cannot divide by a regex.
    if (inCode() && c === '/') {
      const prev = src.slice(0, i).replace(/\s+$/, '').slice(-1);
      if (prev === '' || '(,=:[!&|?{};+-*%~^<>'.includes(prev)) {
        let j = i + 1, inClass = false;
        while (j < src.length) {
          const d = src[j];
          if (d === '\\') { j += 2; continue; }
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) break;
          else if (d === '\n') { j = -1; break; }   // not a regex after all
          j++;
        }
        if (j > 0) { for (let x = i; x <= j; x++) ctx[x] = k; i = j + 1; continue; }
      }
    }
    if (!inCode() && c === '\\') { ctx[i] = k; ctx[i + 1] = k; i += 2; continue; }
    if (k === '`' && c === '$' && n === '{') { ctx[i] = k; ctx[i + 1] = k; stack.push({ q: '$', depth: 0 }); i += 2; continue; }
    if (k === '$' && c === '{') { top().depth++; ctx[i] = k; i++; continue; }
    if (k === '$' && c === '}') { if (top().depth === 0) stack.pop(); else top().depth--; ctx[i] = k; i++; continue; }
    if (inCode() && (c === "'" || c === '"' || c === '`')) { stack.push({ q: c, depth: 0 }); ctx[i] = c; i++; continue; }
    if (!inCode() && c === k) { ctx[i] = k; stack.pop(); i++; continue; }
    ctx[i] = k;
    i++;
  }
  return ctx;
}
const ctx = contextAt(script);

const wrong = [];
const lineAt = (idx) => script.slice(0, idx).split('\n').length;
// Offset of the script block within the file, so reported lines match the editor.
const lineOffset = portal.slice(0, scriptStart).split('\n').length - 1;

let m;
const re = /\btp?\(/g;
const named = (k) => k === null ? 'plain code' : k === '$' ? 'a ${} hole' : k === '`' ? 'a template literal' : `a ${k}-quoted string`;
while ((m = re.exec(script))) {
  const at = m.index;
  const kind = ctx[at];
  const before = script.slice(Math.max(0, at - 3), at);
  const line = lineAt(at) + lineOffset;

  // One rule, two shapes. A call reached through ${…} must be in a real
  // hole; every other call must be in code. Anything else means the
  // characters t ( ' … ' ) are being printed rather than run.
  //
  // Note what is NOT a fault: '+t('x')+' lands in PLAIN CODE, because the
  // quote before the + closed the string. That is the correct way to reach
  // it from a concatenation, and an earlier version of this check called
  // it a bug — the check was wrong, not the page.
  if (/\$\{\s*$/.test(before)) {
    if (kind !== '$') wrong.push(`line ${line}: \${t(...)} written inside ${named(kind)} — renders as literal source text`);
  } else if (kind !== null && kind !== '$') {
    wrong.push(`line ${line}: t(...) written inside ${named(kind)} — renders as literal source text`);
  }
}
ok('no t() call sits in the wrong kind of string', wrong.length === 0, wrong.slice(0, 6).join('\n      '));

// ══ EVERY KEY EXISTS ══════════════════════════════════════════════
//
// Failure 2. t() falls back to the key itself rather than throwing, which
// is right at runtime and useless at review time.
console.log('\n── Every key referenced actually exists ──');

const referenced = new Set();
const refRe = /\btp?\(\s*'([a-zA-Z][a-zA-Z0-9_]*)'/g;
while ((m = refRe.exec(script))) referenced.add(m[1]);

// tp('submittedFlagged', n) resolves to submittedFlagged_one / _other, so
// the bare stem is never itself a key.
const pluralStems = new Set();
const pRe = /\btp\(\s*'([a-zA-Z][a-zA-Z0-9_]*)'/g;
while ((m = pRe.exec(script))) pluralStems.add(m[1]);

const unknown = [...referenced].filter(k => {
  if (enKeys.has(k)) return false;
  if (pluralStems.has(k)) return !(enKeys.has(k + '_one') && enKeys.has(k + '_other'));
  return true;
});
ok('every t() key is defined in English', unknown.length === 0, 'unknown: ' + unknown.join(', '));

const dataT = new Set();
const dRe = /data-t="([a-zA-Z][a-zA-Z0-9_]*)"/g;
while ((m = dRe.exec(markup))) dataT.add(m[1]);
const dataTPh = new Set();
const dpRe = /data-t-ph="([a-zA-Z][a-zA-Z0-9_]*)"/g;
while ((m = dpRe.exec(markup))) dataTPh.add(m[1]);

ok('the markup is tagged for translation', dataT.size >= 60, dataT.size + ' data-t attributes');
const unknownAttr = [...dataT, ...dataTPh].filter(k => !enKeys.has(k));
ok('every data-t key is defined in English', unknownAttr.length === 0, 'unknown: ' + unknownAttr.join(', '));

// ══ THE TRAPS A STRING COUNT DOES NOT SHOW ════════════════════════
console.log('\n── The traps ──');

const codeOnly = script.split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

// English forms plurals by adding s. isiXhosa and chiShona do not, so a
// suffix is not a translation — it is an English sentence wearing a
// translated word.
ok('no English "+s" pluralisation is left in a rendered string',
   !/!==\s*1\s*\?\s*'s'\s*:/.test(codeOnly) && !/>\s*1\s*\?\s*'s'\s*:/.test(codeOnly));

// Month names must come from the dictionary. The browser's own data for
// chiShona and isiXhosa is patchy enough that Intl would hand back English
// on some phones and not others — worse than either outcome alone.
ok('month names come from the dictionary, not a const array',
   !/const MONTHS\s*=/.test(codeOnly) && /function mon\(/.test(codeOnly));
ok('no hardcoded en-ZA date formatting', !/toLocaleDateString\(\s*'en-ZA'/.test(codeOnly));
ok('weekday heads come from the dictionary',
   !/\['S','M','T','W','T','F','S'\]\.map/.test(codeOnly) && /weekdayHeads\(\)/.test(codeOnly));

// ══ REACHING THE PICKER ═══════════════════════════════════════════
console.log('\n── Somebody who cannot read English can still switch ──');

// The picker has to be on the sign-in screen. A picker that only appears
// after sign-in is useless to the person who needs it, because signing in
// means reading "Select your name to sign in" first.
const authBlock = markup.slice(markup.indexOf('<div id="auth">'), markup.indexOf('<!-- CLEANER APP -->'));
ok('the language picker is on the sign-in screen, before any PIN',
   /class="lang-select"/.test(authBlock));
ok('the picker also appears inside the app and the coordinator view',
   (markup.match(/class="lang-select"/g) || []).length >= 3);

// Option labels are each language's own name for itself — "Afrikaans",
// "isiXhosa" — so the list is readable no matter which one you already
// speak. A list labelled in English defeats the purpose.
ok('languages are listed under their own names',
   /af:\s*'Afrikaans'/.test(script) && /sn:\s*'chiShona'/.test(script) && /xh:\s*'isiXhosa'/.test(script));

// The chosen language must be applied before the network round trip, or
// the sign-in screen sits in English while bootstrap resolves.
const boot = script.slice(script.indexOf('async function boot()'));
ok('language is applied before the portal bootstrap call',
   boot.indexOf('applyStaticT()') < boot.indexOf('await bootstrapPortal()'));

ok('the choice survives a restart', /localStorage\.setItem\('hep_staff_lang'/.test(script));
ok('changing language re-renders instead of demanding a reload',
   /function setStaffLang/.test(script) && /renderHome\(\)/.test(script.slice(script.indexOf('function setStaffLang'), script.indexOf('function setStaffLang') + 1400)));

// Cleaners have this installed on their home screens. Without a new cache
// name a phone can keep serving the English-only shell, and the picker
// looks like it simply failed to arrive.
ok('the service worker cache name was bumped', /staff-portal-v4/.test(sw));

// ══ FALLBACK ══════════════════════════════════════════════════════
console.log('\n── A missing translation degrades, it does not break ──');
const tFn = script.slice(script.indexOf('function t(key'), script.indexOf('function tp('));
ok('t() falls back to English, then to the key itself',
   /STAFF_T\.en\[key\]/.test(tFn) && /return key/.test(tFn));
ok('English text stays in the markup as the no-JS fallback',
   /data-t="greet">Good day/.test(markup));

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ staff portal languages: all checks passed');
