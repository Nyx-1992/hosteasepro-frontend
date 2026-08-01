#!/usr/bin/env node
/**
 * The roadmap loads its content from the database, not from the page.
 *
 * WHY THIS EXISTS. The owner's instruction was "roadmap is ONLY for me
 * and no one else to see." Migration 891 locked roadmap_state to the
 * owner, which protects the TICKS. The 110 notes themselves were a const
 * array inside demo/index_fixed.html — a single-file app served to every
 * browser — so anyone who opened view-source could read pricing
 * decisions, competitor analysis, a customer's email address and
 * write-ups of every security hole and its fix. No RLS policy helps with
 * text that ships in the page.
 *
 * 892 moves the content into roadmap_phases/roadmap_items behind the same
 * owner-only policy, and rmLoadContent() reads it from there. This test
 * pins the four things that would quietly undo that:
 *
 *   1. THE ARRAY MUST STAY OUT OF THE PAGE. ROADMAP_SEED exists only to
 *      carry an existing install's notes across once. If it ever fills up
 *      again the notes are public again, so that is checked first.
 *   2. Database rows must map onto the shape the renderer expects
 *      (task_key/title/note/cat -> k/t/n/c). A mismatch renders a blank
 *      roadmap rather than an error, which is easy to miss.
 *   3. The one-time seed must fire only when the database is empty, or
 *      every page load rewrites the owner's notes.
 *   4. A NON-OWNER must never trigger the seed. The policy would refuse
 *      the write anyway, but it should not be attempted.
 *
 * Like test_client_dashboard.js this EXTRACTS the real source from the
 * page rather than keeping a copy, because a drifted copy of this
 * particular function is indistinguishable from a passing test.
 *
 * Run: node scripts/tests/test_roadmap_private.js
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'demo', 'index_fixed.html');
const html = fs.readFileSync(FILE, 'utf8');

function grabFn(name) {
  const start = html.indexOf('async function ' + name + '(');
  if (start < 0) throw new Error('cannot find function ' + name + ' in index_fixed.html');
  let depth = 0;
  for (let j = html.indexOf('{', start); j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}' && --depth === 0) return html.slice(start, j + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}

const fail = [];
const ok = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fail.push(name); };

// ── 1. The page is no longer the source of truth ──────────────────
console.log('\n── The page is no longer the source ──');

const seedMatch = html.match(/const ROADMAP_SEED = \[([\s\S]*?)\n\];/);
ok('ROADMAP_SEED exists as the one-time carrier', !!seedMatch);
ok('ROADMAP is a let, filled from the database at load time', /\blet ROADMAP = \[\];/.test(html));
ok('nothing renders from the seed directly — only ROADMAP is read',
   !/ROADMAP_SEED\s*\.\s*(map|filter|forEach)/.test(html.replace(grabFn('rmLoadContent'), '')));

// The end state, asserted. All 112 notes were copied into roadmap_items
// on 2026-08-01 — verified by comparing an md5 of the keys and an md5 of
// the concatenated title+note of every row against the array they came
// from, both identical — and the array was then emptied. From here the
// database is the only copy, and these two checks are what stop the
// notes quietly reappearing in a page anyone can view-source.
ok('ROADMAP_SEED is empty — no notes ship in the page source',
   !!seedMatch && seedMatch[1].trim() === '');

// Identifiers that appeared only inside roadmap notes. Finding one means
// note text is back in the page. Deliberately the identifiers themselves
// and not words like "Nedbank" — that appears in an ordinary code comment
// explaining the white-label fix, and a bank's name is not a secret. A
// check that fires on innocent prose gets deleted by the next person.
['info@vineamea.cz', '1292867345', '2024/643198/07'].forEach(s =>
  ok('no roadmap note text left in the page: ' + JSON.stringify(s), !html.includes(s)));

// ── 2..4. rmLoadContent, run against a stub ───────────────────────
console.log('\n── rmLoadContent ──');

const src = [
  'let ROADMAP_SEED = [];',
  'let currentUser = null;',
  'let db = null;',
  grabFn('rmLoadContent'),
  'module.exports = { run: (u, d, s) => { currentUser = u; db = d; ROADMAP_SEED = s; return rmLoadContent(); } };',
].join('\n\n');

const mod = { exports: {} };
new Function('module', 'exports', 'console', src)(mod, mod.exports, console);

// A stub shaped like the supabase-js builder: a select()/order() chain,
// plus then() so `await db.from(x).select(y)` resolves.
function stubDb(store, log) {
  return { from: (t) => {
    const q = {
      select: () => q,
      order:  () => q,
      upsert: (rows) => {
        log.push({ table: t, n: rows.length });
        store[t] = rows.map(r => ({ ...r }));
        return Promise.resolve({ data: rows, error: null });
      },
      then: (res) => res({ data: store[t] || [], error: null }),
    };
    return q;
  }};
}

const OWNER = { id: 'u1', role: 'owner', org_id: 'org-1' };
const ADMIN = { id: 'u2', role: 'admin', org_id: 'org-1' };

const FULL = {
  roadmap_phases: [
    { phase_id: 'now', lbl: 'Immediate',                       meta: 'This week', col: '#E24B4A', sort: 0 },
    { phase_id: 'p0',  lbl: 'Phase 0 — Foundation',        meta: 'Weeks 1–6', col: '#D97706', sort: 1 },
  ],
  roadmap_items: [
    { task_key: 'now-1', phase_id: 'now', title: 'First immediate task', note: 'note one', cat: 'HEP',      sort: 0 },
    { task_key: 'now-2', phase_id: 'now', title: 'Second immediate',     note: null,       cat: 'Website',  sort: 1 },
    { task_key: 'p0-1',  phase_id: 'p0',  title: 'A foundation task',    note: 'note two', cat: 'Security', sort: 0 },
  ],
};

const LEGACY = [{ id: 'x', lbl: 'Legacy phase', meta: 'm', col: '#000',
                  tasks: [{ k: 'x-1', t: 'Legacy task', n: 'legacy note', c: 'HEP' }] }];
const legacy = () => JSON.parse(JSON.stringify(LEGACY));

(async () => {
  // Content already in the database: read it, write nothing.
  let log = [];
  let out = await mod.exports.run(OWNER, stubDb(JSON.parse(JSON.stringify(FULL)), log), []);
  ok('both phases load from the database', out.length === 2);
  ok('phase order is preserved', out.map(p => p.id).join(',') === 'now,p0');
  ok('items group under their own phase', out.map(p => p.tasks.length).join(',') === '2,1');
  ok('task_key/title/note/cat map to k/t/n/c',
     out[0].tasks[0].k === 'now-1' && out[0].tasks[0].t === 'First immediate task' &&
     out[0].tasks[0].n === 'note one' && out[0].tasks[0].c === 'HEP');
  ok('a null note stays null rather than becoming the string "null"', out[0].tasks[1].n === null);
  ok('nothing is written when the database already has content', log.length === 0);

  // Empty database, install still carrying the array: seed exactly once.
  log = [];
  const store = { roadmap_phases: [], roadmap_items: [] };
  out = await mod.exports.run(OWNER, stubDb(store, log), legacy());
  ok('an empty database seeds phases then items, once each',
     log.length === 2 && log[0].table === 'roadmap_phases' && log[1].table === 'roadmap_items');
  ok('the seed writes every item', log[1].n === 1);
  ok('content is read back from the database after seeding',
     out.length === 1 && out[0].tasks[0].t === 'Legacy task');
  ok('seeded rows carry org_id, which the owner-only policy requires',
     store.roadmap_items.every(r => r.org_id === 'org-1') &&
     store.roadmap_phases.every(r => r.org_id === 'org-1'));

  // A non-owner must not attempt the write.
  log = [];
  await mod.exports.run(ADMIN, stubDb({ roadmap_phases: [], roadmap_items: [] }, log), legacy());
  ok('an admin never writes the owner-only roadmap', log.length === 0);

  log = [];
  await mod.exports.run(null, stubDb({ roadmap_phases: [], roadmap_items: [] }, log), legacy());
  ok('a signed-out session never writes the roadmap', log.length === 0);

  const total = 6 + 12;
  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll ' + total + ' checks passed\n');
  process.exit(fail.length ? 1 : 0);
})();
