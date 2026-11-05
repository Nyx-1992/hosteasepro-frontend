#!/usr/bin/env node
/**
 * Giving the property owner something to come back for.
 *
 *   "I want to work today on the access for the customer facing side (TV
 *    House owners) so they can interact with the platform to us. I want the
 *    bills uploaded for them and any report from Nina. I need the invoices
 *    and also COCs we got saved under some document file. Most importantly
 *    they should be able to raise queries through that instead of
 *    bombarding us via WhatsApp."
 *
 * THEY ALREADY HAD A LOGIN. info@vineamea.cz, created 31 July 2026, signed
 * in once on 1 August and never again. The portal showed them income,
 * occupancy, a calendar, Nina's inspections and a cleaning count — all of it
 * calculated FOR them, none of it a reason to return. There was nothing to
 * collect and nobody to ask. WhatsApp was not beating this portal; it was
 * the only channel that existed.
 *
 * TWO THINGS, AND THE SECOND IS THE ONE THAT MATTERS.
 *
 *   Documents. finance_documents already held files against a property in a
 *   private bucket. Its only client policy was uploaded_by = auth.uid() — an
 *   owner could see what they had sent US and nothing we had sent THEM.
 *
 *   Questions. A thread, both ways, with a status the owner can see. It only
 *   replaces WhatsApp if the answer comes back, so an unanswered question
 *   has to be visible from outside the app as well as in it.
 *
 * Run: node scripts/tests/test_owner_portal.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const app   = read('demo', 'index_fixed.html');
const alert = read('api', 'owner-query-alert.js');
const mig   = read('supabase', 'migrations', '936_owner_documents_and_queries.sql');

const codeOnly = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
const sqlCode = (s) => s.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
const SQL = sqlCode(mig);

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// ══ 1. DOCUMENTS WE SEND THEM ═════════════════════════════════════════════
console.log('\nDocuments the owner can collect');

ok('the kinds she asked for exist',
   ['bill', 'coc', 'report'].every(t => new RegExp(`'${t}'::text`).test(SQL)),
   'bills, COCs and reports had no doc_type at all');
ok('invoices and statements survived the rewrite',
   /'invoice'::text/.test(SQL) && /'statement'::text/.test(SQL),
   'replacing a CHECK must not drop the values already in the column');

// The bug found while adding to this CHECK.
ok("'receipt' is allowed now, which it never was",
   /'receipt'::text/.test(SQL));
ok('  and the app has been writing it all along',
   /doc_type: 'receipt'/.test(codeOnly(app)),
   'every slip attached to a logged spend failed the CHECK and was never filed');

ok('sharing is a column, not a guess',
   /ADD COLUMN IF NOT EXISTS client_visible boolean NOT NULL DEFAULT false/.test(SQL));
ok('  and it defaults to NOT shared',
   /client_visible boolean NOT NULL DEFAULT false/.test(SQL),
   'this table also holds the agency own statements and expense slips');

ok('the owner can read a shared document',
   /CREATE POLICY finance_documents_client_shared_select[\s\S]*?client_visible[\s\S]*?client_property_keys\(\)/.test(SQL));
ok('  scoped to THEIR property, by the key this table actually stores',
   /property_id = ANY \(public\.client_property_keys\(\)\)/.test(SQL),
   'property_id here is the short key, not a uuid — client_property_uuids would match nothing');
ok('the FILE is reachable too, not just the row',
   /CREATE POLICY finance_documents_storage_client_shared_select[\s\S]*?bucket_id = 'finance-documents'/.test(SQL),
   'the bucket is private: without this the document lists and the download says Object not found');
ok('  and that storage policy checks the same two things',
   /fd\.client_visible[\s\S]{0,120}?fd\.property_id = ANY \(public\.client_property_keys\(\)\)/.test(SQL));

console.log('\nSharing one, from the agency side');
ok('the upload form has a share box', /id="fd-share"/.test(app));
ok('  bills and COCs pre-tick it', /const FD_OWNER_TYPES = \['bill', 'coc'\]/.test(app));
ok('  everything else starts unticked',
   /box\.checked = FD_OWNER_TYPES\.includes/.test(app),
   'a default of shared would publish the agency books to every owner');
ok('sharing without a property is refused out loud',
   /Pick the property first/.test(app),
   'the owner is found THROUGH the property, so it would upload happily and show nobody anything');
ok('  and the saved row cannot be shared-with-nobody either',
   /client_visible: !!\(document\.getElementById\('fd-share'\)\?\.checked &&\s*\n?\s*document\.getElementById\('fd-prop'\)\.value\)/.test(app));
ok('documents already filed can be shared after the fact',
   /async function toggleDocShare\(id\)/.test(app),
   'last year COC is already in here from before there was anywhere to send it');
ok('  and unshared again', /const next = !d\.client_visible/.test(app));
ok('a shared document is marked as such in the agency list',
   /d\.client_visible \? `<span title="The property owner can see this/.test(app));

console.log('\nAnd on the owner side');
ok('there is a documents card', /id="client-documents"/.test(app));
ok('it is rendered on load', /renderClientDocuments\(\);/.test(app));
ok('  it asks only for shared ones', /\.eq\('client_visible', true\)/.test(codeOnly(app)));
ok('the download mints a signed link, because the bucket is private',
   /createSignedUrl\(row\.file_path, 300/.test(app));

// ══ 2. ASKING US SOMETHING ════════════════════════════════════════════════
console.log('\nA question, and a thread to answer it in');

ok('queries are threads, not messages',
   /CREATE TABLE IF NOT EXISTS public\.owner_queries/.test(SQL) &&
   /CREATE TABLE IF NOT EXISTS public\.owner_query_messages/.test(SQL));
ok('a thread has a status the owner can see',
   /status[\s\S]{0,120}?'open'::text,'answered'::text,'closed'::text/.test(SQL));
ok('a question can be about a document — the thing WhatsApp cannot carry',
   /about_document_id uuid REFERENCES public\.finance_documents\(id\)/.test(SQL));

console.log('\nWho is allowed to say what');
ok('both sides can read the thread, nobody else can',
   /CREATE POLICY owner_queries_select[\s\S]*?is_org_member\(org_id\)[\s\S]*?client_property_uuids\(\)/.test(SQL));
ok('a reply marked "agency" has to come from the agency',
   /\(author_side = 'agency' AND public\.is_org_member\(q\.org_id\)\)/.test(SQL),
   'author_side arrives from a browser and renders as an answer FROM US');
ok('  and one marked "client" from the property owner',
   /\(author_side = 'client' AND q\.property_id = ANY \(public\.client_property_uuids\(\)\)\)/.test(SQL));
ok('nobody can post as somebody else',
   /owner_query_messages_insert[\s\S]*?author_id = auth\.uid\(\)/.test(SQL));
ok('the query lands in the property\'s own agency, whatever the browser said',
   /CREATE OR REPLACE FUNCTION public\.owner_query_set_org[\s\S]*?SELECT p\.org_id INTO NEW\.org_id/.test(SQL) &&
   /BEFORE INSERT ON public\.owner_queries/.test(SQL),
   'otherwise a question could be filed into another agency inbox');

console.log('\nWhat posting a message does to the thread');
const touch = (SQL.match(/CREATE OR REPLACE FUNCTION public\.owner_query_touch[\s\S]*?\$\$;/) || [''])[0];
ok('there is one place that moves a thread', !!touch);
ok('  it runs as definer, so a client can reply without UPDATE on the table',
   /SECURITY DEFINER/.test(touch));
{
  // Run the CASE the trigger actually contains.
  const next = (side) => side === 'client' ? 'open' : 'answered';
  ok('  proof: the owner writing puts it back on us', next('client') === 'open');
  ok('  proof: us writing marks it answered',         next('agency') === 'answered');
  ok('  and the trigger says exactly that',
     /WHEN NEW\.author_side = 'client'\s*\n?\s*THEN 'open' ELSE 'answered'/.test(touch));
}
ok('a reply reopens a closed thread rather than vanishing into it',
   !/status = CASE[\s\S]{0,200}?'closed'/.test(touch),
   'the promise being made is that saying something gets it seen');

ok('either side can close one',
   /CREATE OR REPLACE FUNCTION public\.owner_query_set_status/.test(SQL));
ok('  and that function checks the caller is one of the two',
   /IF NOT \(public\.is_org_member\(v_org\)\s*\n?\s*OR v_prop = ANY \(public\.client_property_uuids\(\)\)\) THEN/.test(SQL));
ok('  anon cannot call it at all',
   /REVOKE ALL ON FUNCTION public\.owner_query_set_status\(uuid, text\) FROM PUBLIC, anon/.test(SQL));

console.log('\nThe two screens');
ok('the owner gets an Ask card', /id="client-queries"/.test(app) && /clientAskSend/.test(app));
ok('  with the thread inline', /async function renderClientThread\(id\)/.test(app));
ok('  and can close their own', /owner_query_set_status', \{ p_id: id, p_status: 'closed' \}/.test(app));
ok('the agency gets an inbox beside Guest Messages and Team Chat',
   /id="msg-subtab-owner-btn"/.test(app) && /Owner Questions/.test(app));
ok('  wired into the sub-tab switcher',
   /if \(tab==='owner'\) loadOwnerQueries\(\);/.test(app));
ok('  defaulting to what is waiting on us', /let _oqFilter = 'open'/.test(app));

console.log('\nIt is in five languages, because the owners are Czech');
['en','de','cs','pl','es'].forEach(loc => {
  const dict = (app.match(new RegExp('\\n  ' + loc + ":\\{.*")) || [''])[0];
  const got = ['docsTitle','queriesTitle','askBtn','qOpen','qAnswered','qClosed','qThanks']
    .filter(k => dict.includes(k + ':'));
  ok('  ' + loc + ' has the new strings', got.length === 7, got.join(','));
});
ok('  and none of them were left in English',
   /cs:\{[^\n]*docsTitle:'Dokumenty'/.test(app) && /de:\{[^\n]*queriesTitle:'Fragen'/.test(app));

// ══ 3. A QUESTION NOBODY SEES IS THE WHOLE FAILURE MODE ═══════════════════
console.log('\nSomebody finds out');

ok('the Owner Questions tab carries a count', /id="oq-badge"/.test(app));
ok('  of threads waiting on US, not of threads',
   /ownerQueries\.filter\(q => q\.status === 'open'\)\.length/.test(app),
   'a number that counts everything stops being looked at');
ok('  loaded at sign-in, not when the tab is opened',
   /applyRoleUI\(\);[\s\S]{0,200}?loadOwnerQueries\(\);/.test(app),
   'the badge is the only thing that would make anyone open that tab');

ok('an email goes out as well', /fetch\('\/api\/owner-query-alert'/.test(app));
ok('  and it is never awaited', /\s+fetch\('\/api\/owner-query-alert'/.test(app) &&
   !/await fetch\('\/api\/owner-query-alert'/.test(app),
   'the question is already saved; a bounced alert must not look like a failed question');
ok('  nor allowed to reject', /\}\)\.catch\(\(\) => \{\}\);/.test(app));

console.log('\nThe alert endpoint');
ok('it never returns a failure to the browser',
   !/res\.status\([45]\d\d\)\.json\(\{ (?!error: 'POST only')/.test(codeOnly(alert)),
   'every path is a 200 with a reason');
ok('it re-reads the question from the database',
   /owner_queries\?id=eq\.\$\{queryId\}/.test(alert),
   'a caller could otherwise post any text it liked to the agency inbox');
ok('  the id is the only input it trusts',
   /if \(!\/\^\[0-9a-f-\]\{36\}\$\/i\.test\(queryId\)\)/.test(alert));
ok('it mails the agency whose owner asked, not the platform',
   /org_settings\?org_id=eq\.\$\{q\.org_id\}&select=email/.test(alert));
ok('  with the platform inbox only as a fallback',
   /if \(!to\.length\) to = \[FALLBACK\]/.test(alert));
ok('it does not email us our own reply back',
   /if \(last\.author_side === 'agency'\)/.test(alert));
ok('it is inert without a Resend key, like the other senders',
   /if \(!RESEND_API_KEY\)/.test(alert));
ok('  and says replying to the email does not reach the owner',
   /does NOT reach them|does not reach them/.test(alert),
   'the thread lives in the app; a reply into the void is the old problem again');

// ══ 4. MAKING HEP VISIBLE, SLOWLY ═════════════════════════════════════════
console.log('\nThe front door');

const stranger = (app.match(/function strangerAtTheDoor\(\)[\s\S]*?\n\}/) || [''])[0];
ok('there is one place that decides', !!stranger);
{
  const run = (o) => new Function('location','localStorage','window','URLSearchParams',
    stranger + '\nreturn strangerAtTheDoor();')(
      { search: o.search || '', pathname: o.pathname || '/' },
      { getItem: () => o.known ? '1' : null },
      { matchMedia: () => ({ matches: !!o.standalone }), navigator: { standalone: !!o.iosApp } },
      URLSearchParams);
  ok('  a first-time visitor is sent to the sales page', run({}) === true);
  ok('  somebody who has signed in here before is not', run({ known: true }) === false);
  ok('  the installed app is not', run({ standalone: true }) === false);
  ok('  an iOS home-screen app is not', run({ iosApp: true }) === false);
  ok('  and the sales page own Sign in link never bounces back',
     run({ search: '?signin=1' }) === false);
  ok('  a password-reset link is left alone', run({ search: '?reset=abc' }) === false);
  ok('  so is an invite link', run({ search: '?invite=abc' }) === false);
  ok('  a deep path is left alone', run({ pathname: '/domestic' }) === false);
}
ok('the flag is written on every sign-in',
   /localStorage\.setItem\('hep_known_user', '1'\)/.test(app));
ok('  inside _afterLogin, so it covers a restored session too',
   /async function _afterLogin\(user\) \{[\s\S]{0,420}?hep_known_user/.test(app));
ok('the redirect only happens when there is no session',
   /if \(!session \|\| !session\.user\) \{\s*\n\s*if \(strangerAtTheDoor\(\)\) location\.replace\('\/welcome'\);/.test(app));

// A PASSWORD-RESET LINK MUST NOT BE SWALLOWED. Supabase sends recovery as
// '#type=recovery' or '?code=' — a hash and a param strangerAtTheDoor()
// does not look at. It is safe only because isRecoveryUrl() returns FIRST,
// and the owners being sent a reset link this week is exactly who would
// land on a sales page if that order ever flipped.
{
  const rs = (app.match(/async function restoreSession\(\)[\s\S]*?\n\}/) || [''])[0];
  const iRecovery = rs.indexOf('isRecoveryUrl()');
  const iStranger = rs.indexOf('strangerAtTheDoor()');
  ok('a recovery link is checked before the stranger redirect',
     iRecovery > -1 && iStranger > -1 && iRecovery < iStranger,
     `isRecoveryUrl at ${iRecovery}, strangerAtTheDoor at ${iStranger}`);
  ok('  and it returns rather than falling through',
     /if \(isRecoveryUrl\(\)\) return;/.test(rs));
  const isRec = (app.match(/function isRecoveryUrl\(\)[\s\S]*?\n\}/) || [''])[0];
  const run = (hash, search) => new Function('INITIAL_URL',
    isRec + '\nreturn isRecoveryUrl();')({ hash, search });
  ok('  proof: Supabase\'s hash form is recognised', run('#type=recovery&access_token=x', '') === true);
  ok('  proof: the PKCE form is recognised',         run('', '?code=abc123') === true);
  ok('  proof: a plain visit is not',                run('', '') === false);
}
ok('and the sales page Sign in points somewhere that will not bounce',
   /href="\/\?signin=1"/.test(read('demo', 'welcome.html')));

console.log('\nBeing findable at all');
const welcome = read('demo', 'welcome.html');
ok('a shared link renders a card instead of a bare URL',
   /og:title/.test(welcome) && /og:image/.test(welcome) && /twitter:card/.test(welcome),
   'the first customers come from somebody forwarding the link');
ok('  the image is a real screenshot, not a logo',
   /og:image" content="[^"]*tour-dashboard\.png/.test(welcome));
ok('  and it exists', fs.existsSync(path.join(ROOT, 'demo', 'img', 'tour-dashboard.png')));
ok('there is a canonical url', /rel="canonical"/.test(welcome));

const robots = read('demo', 'robots.txt');
ok('robots.txt lets the sales pages be indexed', /Allow: \/welcome/.test(robots));
ok('  and keeps the staff portals out of search',
   /Disallow: \/domestic/.test(robots) && /Disallow: \/outside-cleaner/.test(robots));
ok('  it points at the sitemap', /Sitemap: https:\/\/hosteasepro\.com\/sitemap\.xml/.test(robots));
ok('the sitemap uses the real namespace',
   /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(read('demo', 'sitemap.xml')),
   'sitemap.org without the s is a different, wrong namespace and invalidates the file');

const vercel = JSON.parse(read('vercel.json'));
const sources = vercel.rewrites.map(r => r.source);
ok('both are actually served', sources.includes('/robots.txt') && sources.includes('/sitemap.xml'));
ok('  and ahead of the catch-all that would swallow them',
   sources.indexOf('/robots.txt') < sources.indexOf('/(.*)') &&
   sources.indexOf('/sitemap.xml') < sources.indexOf('/(.*)'));

// ══ 5. THE HARDCODED STAFF LOGIN ══════════════════════════════════════════
console.log('\nThe staff login that answered for S&N');

const drop = sqlCode(read('supabase', 'migrations', '935_drop_hardcoded_staff_login.sql'));
ok('the two-argument version is dropped',
   /DROP FUNCTION IF EXISTS public\.staff_portal_login\(p_name text, p_pin text\)/.test(drop));
ok('  and the keyed one is untouched',
   !/DROP[\s\S]*p_portal_key/.test(drop));
ok('every call site passes a portal key',
   (read('demo', 'domestic.html').match(/rpc\('staff_portal_login'/g) || []).length ===
   (read('demo', 'domestic.html').match(/rpc\('staff_portal_login',\{p_portal_key:/g) || []).length,
   'nothing calls the version being dropped');

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ owner portal: all checks passed');
