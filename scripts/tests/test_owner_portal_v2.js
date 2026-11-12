#!/usr/bin/env node
/**
 * What the owners' first real visit to the portal turned up.
 *
 * Four things, from one message:
 *
 *   "I changed it to german for me, when refreshing the page it got back to
 *    czech."
 *   "The bookings don't seem right though? we didn't have so many night
 *    occupied as it displays."
 *   "We need to ensure to differentiate guest bookings and maybe somehow
 *    display availability too (since the owners stay in the house too)."
 *   "You will see the booked nights average on the bottom and the bar graph
 *    are not aligning."
 *   "we would like to give them the opportunity to log some kind of
 *    requests, which can be for some specific category and we then get it
 *    flagged on our end too."
 *
 * THE LANGUAGE NEVER SAVED, FOR ANYBODY. profiles carries exactly one
 * policy — profiles_select_own, SELECT. No UPDATE policy, so the write
 * matched zero rows, and PostgREST calls that success. No error, no save.
 *
 * THE CHART COUNTED 17 NIGHTS THAT WERE NOT GUESTS. Two rows imported from
 * Trello — Clare Lang 13–22 Apr, Heinrich Winkler 1–9 May — carry
 * status 'blocked' AND a real name. clientNormalise reads a named blocked
 * row as a misclassified booking (right for the feed quirk it was written
 * for) and counts it as a let. April read 24 against 15 real guest nights,
 * and May read 8 against none at all.
 *
 * AND THE OWNERS WERE INVISIBLE. November 2026 drew a bar of zero while
 * Mirka and Antonio were in the house for twenty nights of it.
 *
 * Run: node scripts/tests/test_owner_portal_v2.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const app   = read('demo', 'index_fixed.html');
const alert = read('api', 'owner-query-alert.js');
const mig   = read('supabase', 'migrations', '937_owner_locale_and_request_categories.sql');

const codeOnly = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
const SQL = mig.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

const CT = (() => {
  const m = app.match(/const CLIENT_T = \{[\s\S]*?\n\};/)[0];
  return eval('(' + m.replace('const CLIENT_T = ', '').replace(/;$/, '') + ')');
})();

// ══ 1. THE LANGUAGE PICKER ════════════════════════════════════════════════
console.log('\nThe language sticks now');

ok('it no longer writes profiles directly',
   !/from\('profiles'\)\.update\(\{ locale/.test(codeOnly(app)),
   'profiles has no UPDATE policy, so that write matched zero rows and reported success');
ok('it goes through a function that writes one column',
   /rpc\('set_my_locale', \{ p_locale: loc \}\)/.test(app));
ok('the function exists', /CREATE OR REPLACE FUNCTION public\.set_my_locale\(p_locale text\)/.test(SQL));
ok('  and only ever touches the caller\'s own row',
   /UPDATE public\.profiles SET locale = p_locale WHERE id = auth\.uid\(\)/.test(SQL));
ok('  it writes nothing but locale',
   (SQL.match(/UPDATE public\.profiles SET/g) || []).length === 1 &&
   !/SET\s+(role|org_id)/.test(SQL),
   'a blanket UPDATE policy on profiles would let a client set their own role and org_id');
ok('  an unknown locale is refused', /RAISE EXCEPTION 'unknown locale %'/.test(SQL));
ok('  and anon cannot call it',
   /REVOKE ALL ON FUNCTION public\.set_my_locale\(text\) FROM PUBLIC, anon/.test(SQL));
ok('a failed save is shown, not just logged',
   /Could not save the language/.test(app),
   'a silent no-op is exactly what hid this since the picker shipped');
ok('  and the picker snaps back to what is really stored',
   /clientLocale = previous;/.test(app));

// ══ 2. GUESTS, OWNERS AND FREE NIGHTS ═════════════════════════════════════
console.log('\nA night says what it was spent on');

ok('each day records its kind', /_clientDays\[iso\] = \{ p: clientPlat\(b\.platform\), kind,/.test(app));
ok('  while still carrying the plain not-a-let flag the other panels read',
   /const blocked = kind !== 'guest';/.test(app),
   'occupancy, the platform mix and the calendar must keep working unchanged');
ok('guests are painted first, then owners, then blocks',
   /lettable\.forEach\(b => paint\(b, 'guest'\)\);[\s\S]{0,200}?blocks\.filter\(isOwnerStay\)\.forEach\(b => paint\(b, 'owner'\)\);[\s\S]{0,200}?blocks\.filter\(b => !isOwnerStay\(b\)\)\.forEach\(b => paint\(b, 'block'\)\)/.test(app),
   'LekkeSlaap mirrors the owners\' own closure back as an anonymous block');

ok('a month counts all three kinds and its own length',
   /byMonth\[k\] = \{ guest: 0, owner: 0, block: 0, days: daysInMonth\(k\) \}/.test(app));
{
  const src = (app.match(/const daysInMonth = k => \{[\s\S]*?\n    \};/) || [''])[0];
  const run = new Function('k', src + '\nreturn daysInMonth(k);');
  ok('  proof: February 2026 is 28 nights', run('2026-02') === 28, String(run('2026-02')));
  ok('  proof: November is 30', run('2026-11') === 30, String(run('2026-11')));
  ok('  proof: a leap February is 29', run('2028-02') === 29, String(run('2028-02')));
}
ok('"booked" still means let to a guest',
   /const monthTotal = k => byMonth\[k\]\.guest;/.test(app),
   'the bar grows taller than the number because it also draws what was not sold');
ok('the free part of a month is drawn',
   /const freeNights = Math\.max\(0, m\.days - m\.guest - m\.owner - m\.block\);/.test(app));
ok('the bar is the whole month, not a share of the busiest one',
   /height:100%;display:flex;flex-direction:column;justify-content:flex-end/.test(app),
   'scaling to the peak month made a full month and a quiet one look equally full');
ok('  and nothing still refers to the old peak scaling',
   !/peakMonth/.test(codeOnly(app)));
ok('guests sit at the bottom of the column',
   /seg\(m\.block[\s\S]{0,120}?seg\(m\.owner[\s\S]{0,120}?seg\(m\.guest/.test(app),
   'the column packs to the bottom, so guests must be written last');
ok('there is a legend', /CLIENT_OCC_COLORS\[k\]/.test(app) && /occGuests/.test(app));
ok('  in its own palette, not the platform one',
   /const CLIENT_OCC_COLORS = \{ guest:/.test(app),
   'reusing Booking.com blue for "guest" invites reading the colour as a channel');

// ══ 3. THE FOOTER AND THE BARS ════════════════════════════════════════════
console.log('\nThe average and the bars measure the same thing');

ok('the footer reads off the chart\'s own span',
   /const guestNightsInChart = monthKeys\.reduce\(\(s, k\) => s \+ byMonth\[k\]\.guest, 0\)/.test(app));
ok('  and counts the stays inside it',
   /const staysInChart = lettable\.filter\(b =>\s*\n?\s*\(b\.check_out_date \|\| ''\) > chartFrom && \(b\.check_in_date \|\| ''\) <= chartTo\)/.test(app));
ok('  avgStay divides one by the other',
   /const avgStay = staysInChart\.length \? \(guestNightsInChart \/ staysInChart\.length\) : 0;/.test(app));
ok('it no longer mixes the trailing window into the chart footer',
   !/avgStay = staysInWindow/.test(codeOnly(app)),
   'nightsBooked runs from today minus 12 months; the bars are 12 calendar months — three weeks apart');
ok('occupancy keeps the trailing window, which is what occupancy is',
   /const bookedNights = Object\.keys\(_clientDays\)\.filter\(iso => inWindow\(iso\) && !_clientDays\[iso\]\.blocked\)/.test(app));

// ══ 4. REQUESTS, BY CATEGORY ══════════════════════════════════════════════
console.log('\nRequests have a topic');

ok('the column exists', /ADD COLUMN IF NOT EXISTS category text/.test(SQL));
ok('  nullable, with no default',
   !/category text NOT NULL/.test(SQL) && !/category[^\n]*DEFAULT/.test(SQL),
   'a forced guess would make the filter lie');
ok('  and is indexed for the filter',
   /CREATE INDEX IF NOT EXISTS owner_queries_category_idx/.test(SQL));

const KEYS = [...(app.match(/const OWNER_REQUEST_CATEGORIES = \[[\s\S]*?\n\];/) || [''])[0]
  .matchAll(/key: '([a-z]+)'/g)].map(m => m[1]);
ok('there is a category list', KEYS.length >= 8, KEYS.join(', '));

// The real test of a category list: does the email they actually sent fit?
console.log('\n  Every heading of the 6 November email lands somewhere');
[['Pool running all day, broken control box', 'pool'],
 ['Irrigation spraying the walls and terrace', 'garden'],
 ['Bathroom, floors, lights, stove knobs',     'maintenance'],
 ['Garage clutter and the missing towels',     'cleaning'],
 ['Guests with garage keys, door left unlocked','access'],
 ['Paying Eskom for pool hours not agreed',    'utilities'],
 ['The 2,354 ZAR line on INVOICE-2026-018',    'invoice'],
 ['Please tell us when you can meet',          'meeting'],
].forEach(([topic, key]) =>
  ok('    ' + topic + ' → ' + key, KEYS.includes(key)));

ok('the migration documents the same list it will receive',
   KEYS.every(k => mig.includes(k)));

console.log('\n  On both screens');
ok('the owner gets chips', /function clientCatChips\(\)/.test(app) && /id="cq-cats"/.test(app));
ok('  picking one is optional', /category: _askCategory \|\| null/.test(codeOnly(app)));
ok('  tapping it again clears it', /_askCategory = \(_askCategory === key\) \? null : key;/.test(app));
ok('  and it resets after sending', /_askCategory = null;\s*\n\s*say\(ct\('qThanks'\)\)/.test(app));
ok('the owner sees the topic on their own list', /\$\{q\.category \? catIcon\(q\.category\) \+ ' ' : ''\}/.test(app));
ok('  in their language', /const ctCat    = k =>/.test(app) && /reqCats/.test(app));
ok('the agency sees it as a tag', /catIcon\(q\.category\)\} \$\{escHtml\(catLabel\(q\.category\)\)\}/.test(app));
ok('  in English, because that screen is not translated',
   /const catLabel = k => k \? \(CLIENT_T\.en\.reqCats\[k\] \|\| k\) : 'Uncategorised'/.test(app));
ok('the agency can filter by topic', /function setOqCategory\(c\)/.test(app) && /id="oq-cat-filters"/.test(app));
ok('  showing only topics that actually appear',
   /\.filter\(\(\[, n\]\) => n > 0\)/.test(app),
   'ten chips all reading zero is noise on a phone');
ok('  and the empty state names the topic', /Nothing here under/.test(app));

ok('the email subject carries the topic',
   /\$\{propName\}\$\{cat \? ' · ' \+ cat : ''\}: \$\{q\.subject\}/.test(alert),
   'the subject line is the part read on a phone before anything is opened');
ok('  and the alert actually fetches the category',
   /select=id,subject,status,category,org_id/.test(alert));

// ══ 5. THE MONTH IN ONE DOCUMENT ══════════════════════════════════════════
console.log('\nThe monthly report');

const rep = (app.match(/async function renderOwnerReport\(\)[\s\S]*?\n\}/) || [''])[0];
ok('there is one', !!rep);
ok('  it is one month and ONE property',
   /String\(q\.created_at\)\.slice\(0,7\) === ym && String\(q\.property_id\) === String\(prop\)/.test(rep),
   'this goes to an owner, and an owner has no business reading another owner\'s complaints');
ok('  split into category sections', /const groups = OWNER_REQUEST_CATEGORIES/.test(rep));
ok('  in a fixed order, so two months put a topic in the same place',
   /OWNER_REQUEST_CATEGORIES\s*\n?\s*\.map\(c => \[c, rows\.filter/.test(rep));
ok('  each section standing on its own', /class="oq-rep-section"[^>]*break-inside:avoid/.test(rep),
   '"so it is easy to break off"');
ok('  uncategorised requests are not dropped', /const uncategorised = rows\.filter\(q => !q\.category\)/.test(rep));
ok('  every request shows what was asked and what we answered',
   /<th[^>]*>Their request<\/th>/.test(rep) && /<th[^>]*>Our answer<\/th>/.test(rep) &&
   /m\.author_side === 'client'/.test(rep));
ok('  an unanswered one says so rather than showing blank',
   /Not answered yet\./.test(rep));
ok('  the answer shown is the LAST one we sent',
   /\[\.\.\.msgs\]\.reverse\(\)\.find\(m => m\.author_side === 'agency'\)/.test(rep));
ok('  the cell contents are escaped',
   /escHtml\(asked\.body\)/.test(rep) && /escHtml\(q\.request_summary\)/.test(rep) && /escHtml\(short\)/.test(rep));
ok('  and it is one query for the month, not one per thread',
   /\.in\('query_id', rows\.map\(r => r\.id\)\)/.test(rep));

const pick = (app.match(/function buildOwnerReportPickers\(\)[\s\S]*?\n\}/) || [''])[0];
ok('only months that have something are offered', /\[\.\.\.new Set\(ownerQueries\.map\(q => String\(q\.created_at\)\.slice\(0,7\)\)\)\]/.test(pick),
   'twelve empty months is worse than the three that are real');
ok('  and the chosen month survives a rebuild', /if \(months\.includes\(keep\)\) mSel\.value = keep;/.test(pick));

const dl = (app.match(/async function downloadOwnerReport\(\)[\s\S]*?\n\}/) || [''])[0];
ok('the PDF is multi-page', /while \(y < canvas\.height\)/.test(dl) && /pdf\.addPage\(\)/.test(dl),
   'the invoice PDF scales one page to fit; a month of requests would be unreadable that way');
ok('  sliced, not squashed', /part\.getContext\('2d'\)\.drawImage\(canvas, 0, y/.test(dl));
ok('  the file is named for the property and month',
   /owner-requests-\$\{pn\}-\$\{ym\}\.pdf/.test(dl));
ok('  and a failure is reported', /Could not build the PDF/.test(dl));

ok('the report hides the list while it is open',
   /\['oq-filters','oq-cat-filters','oq-list'\]\.forEach/.test(app));

// ══ 6. WHAT WE SAID WE WOULD DO ═══════════════════════════════════════════
console.log('\nAction points');

const mig938 = read('supabase', 'migrations', '938_action_points_on_requests.sql')
  .split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
ok('a task can point back at the request it came from',
   /ADD COLUMN IF NOT EXISTS owner_query_id uuid/.test(mig938));
ok('  deleting the question does NOT delete the work',
   /REFERENCES public\.owner_queries\(id\) ON DELETE SET NULL/.test(mig938),
   'the pool company still has to look at that box');
ok('  it reuses tasks rather than inventing a second to-do list',
   /ALTER TABLE public\.tasks/.test(mig938));

const addA = (app.match(/async function addQueryAction\(queryId\)[\s\S]*?\n\}/) || [''])[0];
ok('one can be added from the thread', !!addA && /id="oq-act-\$\{queryId\}"/.test(app));
ok('  it inherits the request\'s property and org',
   /org_id: q\.org_id, property_id: q\.property_id, owner_query_id: q\.id/.test(addA));
ok('  shown to the owner by default', /id="oq-act-vis-\$\{queryId\}" checked/.test(app),
   'seeing a question turn into a job with a status is most of the reason to use the portal');
ok('  but it can be kept internal', /const visible = !!\(document\.getElementById\('oq-act-vis-' \+ queryId\)/.test(addA));
ok('  and an empty one is refused', /if \(!title\) \{ input\.focus\(\); return; \}/.test(addA));

const tog = (app.match(/async function toggleQueryAction\(queryId, taskId, done\)[\s\S]*?\n\}/) || [''])[0];
ok('ticking one writes BOTH status columns',
   /status: done \? 'completed' : 'pending',\s*\n\s*kanban_status: done \? 'done' : 'todo'/.test(tog),
   'the Task board reads kanban_status and everything else reads status');

ok('the thread loads its action points and any draft before drawing them',
   /await Promise\.all\(\[loadQueryActions\(id\), loadQueryDraft\(id\)\]\);\s*\n\s*const \{ data, error \} = await db\.from\('owner_query_messages'\)/.test(app));

console.log('\n  And they reach the report');
ok('the report fetches them for the month',
   /\.in\('owner_query_id', rows\.map\(r => r\.id\)\)/.test(app));
ok('  showing only the ones the owner may see',
   /\(acts\[q\.id\] \|\| \[\]\)\.filter\(t => t\.client_visible\)/.test(app),
   'an internal note to chase a supplier does not belong in a document we send them');
ok('  with done ones struck through, not hidden',
   /text-decoration:line-through/.test(app) && /done\s*\?\s*'✓'\s*:\s*'○'/.test(app),
   'an owner should see what was closed, not only what is left');
ok('  and the titles escaped', /escHtml\(t\.title\)/.test(app));

// ══ 7. DRAFTS, AND THE THREE-COLUMN TABLE ═════════════════════════════════
console.log('\nAn answer written but not sent');

const m939 = read('supabase', 'migrations', '939_draft_answers.sql')
  .split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
ok('drafts live in their OWN table',
   /CREATE TABLE IF NOT EXISTS public\.owner_query_drafts/.test(m939));
ok('  never as a column on owner_queries',
   !/ALTER TABLE public\.owner_queries[\s\S]{0,120}draft/i.test(m939),
   "the owner's own select policy returns every column, and their portal asks for '*'");
ok('  org members only', /public\.is_org_member\(org_id\)/.test(m939));
ok('  with RLS on and anon revoked',
   /ENABLE ROW LEVEL SECURITY/.test(m939) && /REVOKE ALL ON TABLE public\.owner_query_drafts FROM anon/.test(m939));
// The owner's screens must have no route to an unsent answer at all —
// not a route they decline to take. owner_query_drafts is org-members
// only in the database; this checks the client code never even asks.
{
  const clientFns = ['renderClientQueries','renderClientThread','clientAskSend','clientReplySend','clientCloseQuery']
    .map(fn => (app.match(new RegExp('(?:async )?function ' + fn + '\\([^)]*\\)[\\s\\S]*?\\n\\}')) || [''])[0]).join('\n');
  // Comments explaining WHY it must not read that table contain its name.
  // Strip them, or the prose describing the rule fails the rule.
  ok('the owner portal never reads the drafts table', !/owner_query_drafts/.test(codeOnly(clientFns)));
  ok('  and its answer column shows only SENT agency messages',
     /m\.author_side === 'agency'/.test(clientFns) && /_clientThreadCache/.test(clientFns));
}

const send = (app.match(/async function sendQueryDraft\(queryId\)[\s\S]*?\n\}/) || [''])[0];
ok('sending asks first', /confirm\('Send this answer to the owner\?/.test(send),
   'it is the one moment the owner sees any of this');
ok('  the body is cleared only AFTER the message is in',
   send.indexOf("owner_query_messages'") < send.indexOf("owner_query_drafts').update"),
   'a failed post must leave the words where they were');
ok('  and sending keeps the short form',
   /update\(\{ body: null \}\)/.test(send) && !/owner_query_drafts'\)\.delete/.test(send),
   'deleting the row would drop the summary and the report would print the whole reply again');

console.log('\n  The three columns');
// She asked for three columns: category, their request, our answer. The
// first version made category a SECTION HEADING and the three columns
// something else — "I don't see the category column I told you about".
ok('CATEGORY IS A COLUMN, not a heading', /<th[^>]*>Category<\/th>/.test(app));
ok('  their request', /<th[^>]*>Their request<\/th>/.test(app));
ok('  and our answer', /<th[^>]*>Our answer<\/th>/.test(app));
ok('  one table, not one per category',
   (rep.match(/<th[^>]*>Category<\/th>/g) || []).length === 1,
   'scoped to the report — the expenses screen has a Category header too');
ok('  the name is written once per group, so it still reads as blocks',
   /const firstOfGroup = i === 0;/.test(app));
ok('the answer column prefers a sent reply over an unsent draft',
   app.indexOf('if (sent)  return') < app.indexOf('if (draft) return'));
ok('  a draft is labelled as unsent', /DRAFT — NOT SENT/.test(app));
ok('  and nothing at all says so plainly', /Not answered yet\./.test(app));

const dl2 = (app.match(/async function downloadOwnerReport\(\)[\s\S]*?\n\}/) || [''])[0];
ok('A DRAFT NEVER REACHES THE PDF',
   /clone\.querySelectorAll\('\.oq-draft-cell'\)\.forEach/.test(dl2),
   'a PDF gets forwarded, and a draft inside one is an answer given');
ok('  stripped from the copy, not from the screen',
   dl2.indexOf('clone.querySelectorAll') > dl2.indexOf('clone = page.cloneNode'));
ok('  and the toast says how many were held back', /unsent draft/.test(dl2));

console.log('\n  A report is a digest, not a transcript');

const m940 = read('supabase', 'migrations', '940_report_summaries.sql')
  .split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
ok('the request has a short form', /ALTER TABLE public\.owner_queries[\s\S]{0,120}request_summary text/.test(m940));
ok('  and so does the answer', /ALTER TABLE public\.owner_query_drafts[\s\S]{0,80}summary text/.test(m940));
ok('  the ANSWER summary sits on the org-only table',
   /ALTER TABLE public\.owner_query_drafts\s*\n\s*ADD COLUMN IF NOT EXISTS summary text/.test(m940) &&
   !/ALTER TABLE public\.owner_queries[\s\S]{0,160}\bsummary text/.test(m940),
   'a summary of an answer is an answer — the owner must not read it before it is sent');

ok('the report prefers the short form', /const short = draft && draft\.summary;/.test(app));
ok('  falling back to the full message when there is none',
   /q\.request_summary \? escHtml\(q\.request_summary\) : \(asked \? escHtml\(asked\.body\) : '—'\)/.test(app));
ok('A SENT ANSWER\'S SUMMARY IS NOT MARKED AS A DRAFT',
   /if \(short && sent\) return `<span style="white-space:pre-wrap">\$\{escHtml\(short\)\}<\/span>`;/.test(app),
   'oq-draft-cell is what the PDF strips — carrying it would blank a real answer out of the download');
ok('  and an unsent one still is', /if \(short\) return `<span class="oq-draft-cell"/.test(app));
ok('there is a box to write the short form in', /id="oq-sum-\$\{id\}"/.test(app));
ok('  and saving carries both fields', /query_id: queryId, org_id: q\.org_id, body: body \|\| null, summary,/.test(app));

console.log('\n  The owner can add a note to open work');

const m942 = read('supabase', 'migrations', '942_owner_notes_on_tasks.sql')
  .split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
ok('it is an RPC, not an UPDATE policy on tasks',
   /CREATE OR REPLACE FUNCTION public\.owner_add_task_note/.test(m942) &&
   !/CREATE POLICY[\s\S]*ON public\.tasks FOR UPDATE/.test(m942),
   'a scoped UPDATE policy would let an owner retitle, reassign or close our work — RLS cannot restrict columns');
ok('  it only appends, never overwrites',
   /SET comments = coalesce\(comments, '\[\]'::jsonb\) \|\| jsonb_build_object/.test(m942));
ok('  the side is stamped by the function, not passed in',
   /'side', 'client'/.test(m942),
   "the agency writes comments on the same task; a note must say truthfully which side it came from");
ok('  only on tasks they can already see', /t\.client_visible/.test(m942) &&
   /t\.property_id = ANY \(public\.client_property_uuids\(\)\)/.test(m942));
ok('  AND ONLY ON OPEN ONES — "only on the todos"',
   /kanban_status, 'todo'\) NOT IN \('done', 'cancelled'\)/.test(m942) &&
   /status, 'pending'\)     NOT IN \('completed', 'cancelled'\)/.test(m942),
   'both columns, because the board reads one and everything else reads the other');
ok('  an empty note is refused', /RAISE EXCEPTION 'empty note'/.test(m942));
ok('  and anon cannot call it',
   /REVOKE ALL ON FUNCTION public\.owner_add_task_note\(uuid, text\) FROM PUBLIC, anon/.test(m942));

ok('the box is on the owner card', /id="ctn-\$\{t\.id\}"/.test(app));
ok('  hidden on finished work', /\$\{col\.id === 'done' \|\| col\.id === 'cancelled' \? '' :/.test(app));
ok('  existing notes are shown, both sides apart',
   /c\.side === 'client' \? '#e0f2fe' : 'var\(--surface-2\)'/.test(app));
ok('  and escaped', /escHtml\(c\.text \|\| c\.body \|\| ''\)/.test(app));
ok('  in their language', /ct\('addNote'\)/.test(app));

console.log('\n  Correcting an answer already sent');

const m943 = read('supabase', 'migrations', '943_correct_a_sent_answer.sql')
  .split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
ok('the original text is kept', /ADD COLUMN IF NOT EXISTS[\s\S]{0,80}original_body text/.test(m943),
   'the owner may already have read it, or acted on it');
ok('  and the correction is timestamped', /edited_at     timestamptz/.test(m943));
ok('OUR SIDE ONLY — the owner\'s words cannot be rewritten',
   (m943.match(/author_side = 'agency'/g) || []).length === 2,
   'both USING and WITH CHECK, or an agency message could be edited INTO a client one');
ok('  and only by a member of that org',
   /EXISTS \(SELECT 1 FROM public\.owner_queries q[\s\S]{0,120}is_org_member\(q\.org_id\)\)/.test(m943));

const ed = (app.match(/async function editOwnerMessage\(msgId, queryId\)[\s\S]*?\n\}/) || [''])[0];
ok('there is an editor', !!ed);
ok('  the first correction records the original',
   /original_body: current,/.test(ed) && /\.is\('original_body', null\)/.test(ed),
   'a second tidy-up must not overwrite what was first sent');
ok('  a later one moves only the text and the time',
   /\.not\('original_body', 'is', null\)/.test(ed));
ok('  an answer cannot be emptied', /An answer cannot be emptied/.test(ed));
ok('  and an unchanged one is a no-op', /if \(body === current\.trim\(\)\) return;/.test(ed));
ok('the edit button is only on OUR messages',
   /\$\{us \? `<button onclick="editOwnerMessage/.test(app));
ok('BOTH SIDES SEE THAT IT CHANGED',
   /m\.edited_at \? `<span title="Corrected/.test(app) && /m\.edited_at \? ' · <span style="color:#b45309/.test(app),
   'a silent edit leaves the owner remembering a paragraph that is no longer there');
ok('  in their language', /ct\('corrected'\)/.test(app));

console.log('\n  Removing a comment, and not rendering it raw');

const rdc = (app.match(/function renderDrawerComments\(t\)[\s\S]*?\n\}/) || [''])[0];
ok('author, time and text are all escaped',
   /escHtml\(author\)/.test(rdc) && /escHtml\(when\)/.test(rdc) && /escHtml\(c\.text \|\| c\.body \|\| ''\)/.test(rdc),
   'this rendered raw, and 942 let an outside account write into it');
ok('  including the initials in the avatar',
   /escHtml\(author\.split\(' '\)\.map/.test(rdc));
ok('an owner note shows its timestamp, not "undefined"',
   /c\.time \|\| \(c\.at \? fmtDate/.test(rdc),
   'ours carry `time` pre-formatted; theirs come from the RPC with `at`');
ok('  and is marked as theirs', /c\.side === 'client'/.test(rdc) && /owner<\/span>/.test(rdc));

const rmc = (app.match(/async function removeDrawerComment\(i\)[\s\S]*?\n\}/) || [''])[0];
ok('there is a remove button', /onclick="removeDrawerComment\(\$\{i\}\)"/.test(rdc) && !!rmc);
ok('  it confirms, naming whose comment it is',
   /confirm\(`Remove \$\{who\}'s comment\?/.test(rmc) && /the owner\)` : /.test(rmc));
ok('  it writes the shortened list to the database before memory',
   rmc.indexOf("update({ comments: kept })") < rmc.indexOf('t._comments = kept;'),
   'a failed write must not leave the screen showing a comment that is still stored');
ok('  and a failed removal is reported', /Could not remove that/.test(rmc));
ok('  both copies of the list are kept in step',
   /t\._comments = kept;\s*\n\s*t\.comments  = kept;/.test(rmc),
   'the drawer reads _comments and the save path reads comments');

// ══ 8. FIVE LANGUAGES ═════════════════════════════════════════════════════
console.log('\nStill five languages');

['en','de','cs','pl','es'].forEach(loc => {
  const d = CT[loc];
  const missing = ['occGuests','occOwner','occBlocked'].filter(k => !d[k]);
  const cats = d.reqCats ? Object.keys(d.reqCats) : [];
  ok('  ' + loc + ': legend + ' + cats.length + ' categories',
     missing.length === 0 && cats.length === KEYS.length,
     'missing ' + missing.join(',') + '; cats ' + cats.length + ' vs ' + KEYS.length);
});
ok('  every category key has a label in every language',
   ['en','de','cs','pl','es'].every(l => KEYS.every(k => CT[l].reqCats[k])));
ok('  and Czech is really Czech, not English left in',
   CT.cs.reqCats.pool === 'Bazén' && CT.cs.occOwner === 'Majitelé' && CT.cs.reqCats.meeting.includes('schůzku'),
   [CT.cs.reqCats.pool, CT.cs.occOwner, CT.cs.reqCats.meeting].join(' / '));
ok('  German too, since that is the language she reads it in',
   CT.de.occGuests === 'Gäste' && CT.de.reqCats.garden === 'Garten & Bewässerung',
   [CT.de.occGuests, CT.de.reqCats.garden].join(' / '));

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ owner portal v2: all checks passed');
