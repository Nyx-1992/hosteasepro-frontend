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
ok('a customer owner still gets every other owner tab',
   platformOwner.filter(id => id !== 'roadmap').every(id => customerOwner.includes(id)));
ok('roadmap is the ONLY difference between them',
   platformOwner.length === customerOwner.length + 1);
ok('a customer owner still has the tabs they pay for',
   ['dashboard', 'bookings', 'calendar', 'invoices', 'reports'].every(id => customerOwner.includes(id)));

console.log('\n── The flag itself ──');

const flagged = M.NAV.filter(n => n.platformOnly).map(n => n.id);
ok('roadmap is marked platformOnly', flagged.includes('roadmap'));
ok('nothing else is marked platformOnly by accident',
   flagged.length === 1 && flagged[0] === 'roadmap');
ok('both navs go through the same check',
   (html.match(/navFor\(/g) || []).length >= 3);
ok('switchTab checks it too — the nav is not the only way in',
   /nav\.platformOnly && !isPlatformOwner\(\)/.test(html));
ok('no raw NAV.filter left that would bypass it',
   !/NAV\.filter\(n\s*=>\s*n\.roles\.includes\(currentUser\.role\)\)/.test(html));

console.log(fail.length ? `\n${fail.length} FAILED\n` : '\nAll checks passed\n');
process.exit(fail.length ? 1 : 0);
