#!/usr/bin/env node
/**
 * The Roadmap tab belongs to the platform owner and nobody else.
 *
 * WHY THIS EXISTS. The owner's instruction was "no one should see the
 * roadmap tab but me". 891 locked the ticks and 892 moved the notes into
 * an owner-only table, so another agency's roadmap is empty and
 * unreadable — but the TAB was gated on roles:['owner'] alone, and every
 * agency has an owner. So every customer's owner had a sidebar item
 * called Roadmap, opened it, and found an empty screen. Nothing leaked.
 * It is simply not their tab, and an empty tab in someone else's product
 * is still a thing they can see and ask about.
 *
 * The distinction the nav was missing is between "an owner" and "the
 * owner of the organisation that owns the platform" — recorded in
 * platform_settings.platform_org_id (896) so it follows HEP into its own
 * company without a code change.
 *
 * The case most worth keeping: platform_settings is fetched AFTER the nav
 * is first built, so platformOrgId is briefly null. A null must read as
 * "not the platform owner", never as "everyone qualifies" — that is the
 * shape of mistake that would put the tab in front of every customer for
 * the first second of every session.
 *
 * Run: node scripts/tests/test_platform_nav.js
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

// The real NAV array from the page, so a tab added later is covered by
// the sweep at the bottom rather than by a copy that drifts.
const navStart = html.indexOf('const NAV = [');
const navEnd = html.indexOf('\n];', navStart);
const NAV_SRC = html.slice(navStart, navEnd + 3);

const src = [
  NAV_SRC,
  'let currentUser = null, platformOrgId = null;',
  grabFn('isPlatformOwner'),
  grabFn('navFor'),
  'module.exports = { NAV, navFor,',
  '  as: (role, orgId, platformOrg) => { currentUser = role ? { role, org_id: orgId } : null;',
  '                                      platformOrgId = platformOrg; } };',
].join('\n\n');

const mod = { exports: {} };
new Function('module', 'exports', src)(mod, mod.exports);
const M = mod.exports;

const fail = [];
const ok = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fail.push(name); };
const navIds = (role, org, platform) => { M.as(role, org, platform); return M.navFor(role).map(n => n.id); };

const PLATFORM = 'org-platform';
const CUSTOMER = 'org-customer';

console.log('\n── Who sees Roadmap ──');

ok('the platform owner sees it',
   navIds('owner', PLATFORM, PLATFORM).includes('roadmap'));
ok("another agency's OWNER does not",
   !navIds('owner', CUSTOMER, PLATFORM).includes('roadmap'));
ok('an admin inside the platform org does not',
   !navIds('admin', PLATFORM, PLATFORM).includes('roadmap'));
ok('a host does not',
   !navIds('host', PLATFORM, PLATFORM).includes('roadmap'));

// The timing case: the nav is built before platform_settings resolves.
ok('an unresolved platform org hides it rather than showing it',
   !navIds('owner', PLATFORM, null).includes('roadmap'));
ok('a signed-out session hides it',
   !navIds(null, null, PLATFORM).includes('roadmap'));

console.log('\n── Everything else is unaffected ──');

const customerOwner = navIds('owner', CUSTOMER, PLATFORM);
const platformOwner = navIds('owner', PLATFORM, PLATFORM);

// THE SHAPE CHANGED ON 2026-08-02, deliberately. This used to assert that
// roadmap was the ONLY difference — i.e. the platform owner saw the tenant
// app plus one tab. That was the wrong product: HEP manages no flats, so
// Bookings, Calendar, Cleaning and Invoices were permanently empty for the
// one person who cannot use them. The platform owner now gets a separate
// nav (PLATFORM_NAV_GROUPS), not the tenant one with extras.
const PLATFORM_ONLY = ['customers', 'roadmap'];
ok('a customer owner gets none of the platform tabs',
   PLATFORM_ONLY.every(id => !customerOwner.includes(id)));
ok('the platform owner gets all of them',
   PLATFORM_ONLY.every(id => platformOwner.includes(id)));
ok('those tabs are the only difference in what each MAY see',
   platformOwner.filter(id => !PLATFORM_ONLY.includes(id)).join() === customerOwner.join());
ok('a customer owner still has the tabs they pay for',
   ['dashboard', 'bookings', 'calendar', 'invoices', 'reports'].every(id => customerOwner.includes(id)));

// What each is SHOWN, which is a different question from what they may see:
// renderNavGroups swaps the whole grouping for the platform owner.
ok('the platform owner is shown a different nav entirely',
   /isPlatformOwner\(\) \? PLATFORM_NAV_GROUPS : NAV_GROUPS/.test(html));
const platGroups = (html.match(/const PLATFORM_NAV_GROUPS = \[([\s\S]*?)\];/) || [])[1] || '';
ok('and that nav contains no tenant tabs',
   platGroups.length > 0 &&
   !['bookings','calendar','cleaning','tasks','invoices','spending','reports','people','vault','marketing','messages','knowledge','inspections','dashboard']
     .some(id => platGroups.includes(`'${id}'`)));

// Where each lands. The platform owner's home is HQ — signing in
// and being shown 0 check-ins and 0 of 0 properties is the wrong first
// screen for someone who runs the software rather than a letting agency,
// and 'dashboard' is not even in her nav.
ok('signing in sends the platform owner to HQ',
   /if \(isPlatformOwner\(\)\) switchTab\('customers'\);/.test(html));
// The bounce target had the same problem: a tab she may not open would
// have dropped her on the tenant dashboard.
ok('and a refused tab bounces her there too, not to the tenant dashboard',
   /const home = \(\) => \(isPlatformOwner\(\) \? 'customers' : 'dashboard'\)/.test(html) &&
   !/if \(id !== 'dashboard'\) switchTab\('dashboard'\)/.test(html));

console.log('\n── The flag itself ──');

const flagged = M.NAV.filter(n => n.platformOnly).map(n => n.id).sort();
ok('roadmap is marked platformOnly', flagged.includes('roadmap'));
ok('the customers screen is too', flagged.includes('customers'));
ok('nothing else is marked platformOnly by accident',
   flagged.join() === PLATFORM_ONLY.slice().sort().join());
ok('both navs go through the same check',
   (html.match(/navFor\(/g) || []).length >= 3);
ok('switchTab checks it too — the nav is not the only way in',
   /nav\.platformOnly && !isPlatformOwner\(\)/.test(html));
ok('no raw NAV.filter left that would bypass it',
   !/NAV\.filter\(n\s*=>\s*n\.roles\.includes\(currentUser\.role\)\)/.test(html));

// ══ SIGNING IN DOES NOT INHERIT THE LAST PERSON'S TAB ═════════════
//
// Nina signed in as a HOST on a browser just signed out of HQ, and landed
// on HQ — the platform console, revenue cards and customer list.
//
// Nothing leaked: platform_summary() and platform_customers() are gated on
// is_platform_owner() in the database, so every figure was zero and the
// list empty. The guard inside switchTab() was correct too. It was simply
// never CALLED — currentTab was still 'customers', its pane still had
// .active, and signing in re-rendered around a tab nobody re-checked.
//
// An empty shell of someone else's private screen is still exactly what
// another agency's staff would report as a leak.
console.log('\n── A new sign-in re-checks the open tab ──');
ok('logging in routes the open tab through the guard',
   /if \(typeof switchTab === 'function'\) switchTab\('dashboard'\);/.test(html));
ok('it happens in the shared post-login path, so every way in is covered',
   /async function _afterLogin\(user\)[\s\S]{0,1800}switchTab\('dashboard'\)/.test(html));
ok('and the reason is recorded where it happened',
   /signed in as a host on a browser that had just been signed out of/i.test(html));

console.log(fail.length ? `\n${fail.length} FAILED\n` : '\nAll checks passed\n');
process.exit(fail.length ? 1 : 0);
