#!/usr/bin/env node
/**
 * The public signup endpoint must survive a flood.
 *
 * WHY THIS EXISTS. 24-25 November: eighteen accounts registered on the
 * platform in a day, from eighteen different IP addresses, using curl,
 * python-requests, Python-urllib and a headless browser. One was then
 * used to plant a script in a booking's guest name that drew a fake
 * Booking.com sign-in over the owner's admin page.
 *
 * THE CASE THAT MATTERS IS THE DISTRIBUTED ONE. A per-IP limit looks
 * like protection and would have allowed all eighteen, because no
 * address tried twice. The global ceiling is the part that actually
 * catches what happened, so it is tested explicitly below.
 *
 * Run: node scripts/tests/test_signup_guard.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

(async () => {
const guard = await import(path.join(ROOT, 'api', '_lib', 'signupGuard.js'));
const { checkSignupAllowed, domainAllowed, hashEmail, clientIp, LIMITS } = guard;

console.log('\nAddresses that are never a real customer\n');

ok('a normal business address is allowed',    domainAllowed('nicole@snapartments.co.za'));
ok('example.com is refused',                  !domainAllowed('pentest17955172102@example.com'));
ok('a .test / .invalid address is refused',   !domainAllowed('x@foo.test') && !domainAllowed('x@foo.invalid'));
ok('the platform\'s own domain is refused',   !domainAllowed('pentest.intern.2066@hosteasepro.com'),
   'three November accounts registered as @hosteasepro.com to look like staff');
ok('an address with no domain is refused',    !domainAllowed('nodomain'));

console.log('\nCounting\n');

// A fake PostgREST: every count query comes back with the number this
// test wants, in the Content-Range header the real one uses.
const fakeFetch = (counts) => async (url) => {
  const u = String(url);
  let n = 0;
  if (u.includes('ip=eq.')) n = counts.ip ?? 0;
  else if (u.includes('email_hash=eq.')) n = counts.email ?? 0;
  else if (u.includes('id=gt.0')) n = counts.global ?? 0;
  return { ok: true, headers: { get: (h) => h.toLowerCase() === 'content-range' ? `0-0/${n}` : null } };
};

const check = async (counts, email = 'someone@realagency.co.za', ip = '1.2.3.4') => {
  const saved = global.fetch;
  global.fetch = fakeFetch(counts);
  try {
    return await checkSignupAllowed({ supabaseUrl: 'https://x', svcHeaders: {}, ip, email });
  } finally { global.fetch = saved; }
};

ok('a quiet hour lets a signup through',
   (await check({ ip: 0, email: 0, global: 0 })).allowed);

ok('a fourth try from one address is refused',
   (await check({ ip: LIMITS.perIpPerHour, email: 0, global: 0 })).reason === 'blocked_ip');

ok('a fourth try for one email is refused',
   (await check({ ip: 0, email: LIMITS.perEmailPerHour, global: 0 })).reason === 'blocked_email');

// THE NOVEMBER CASE: eighteen attempts, each from a fresh address, so
// the per-IP and per-email counts are both zero every time.
const distributed = await check({ ip: 0, email: 0, global: LIMITS.globalPerHour });
ok('eighteen signups from eighteen addresses are refused',
   distributed.reason === 'blocked_global',
   'this is the shape of the real attack — per-IP limiting alone allows it');

console.log('\nWhat a refusal gives away\n');

ok('the refusal does not name which limit was hit',
   !/ip|email|global|address|domain/i.test(distributed.message || ''),
   `message was: ${distributed.message}`);

ok('the refusal is the same whoever asks',
   (await check({ ip: 0, email: LIMITS.perEmailPerHour, global: 0 })).message === distributed.message,
   'a different message for a known email confirms the account exists');

console.log('\nFailing safely\n');

const saved = global.fetch;
global.fetch = async () => { throw new Error('database down'); };
const whenBroken = await checkSignupAllowed({ supabaseUrl: 'https://x', svcHeaders: {}, ip: '1.2.3.4', email: 'a@realagency.co.za' });
global.fetch = saved;
ok('a database failure lets signup through rather than taking it down',
   whenBroken.allowed === true);

console.log('\nHashing and client address\n');

ok('the email is hashed, not stored',
   hashEmail('A@B.com') === hashEmail('a@b.com') && !/\@/.test(hashEmail('a@b.com')));

ok('only the first x-forwarded-for entry is trusted',
   clientIp({ headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1, 10.0.0.2' }, socket: {} }) === '9.9.9.9',
   'later entries are proxy-supplied and attacker-settable');

console.log('');
if (fail.length) {
  console.log(`${fail.length} failing:`);
  fail.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('All signup guard checks passed.\n');
})();
