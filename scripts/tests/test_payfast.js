#!/usr/bin/env node
/**
 * PayFast signing and notification validation.
 *
 * WHY THIS EXISTS. Two failure modes, in opposite directions, and both
 * are silent:
 *
 *   Sign it wrong and PayFast rejects every real payment. The signature
 *   is an MD5 over the fields IN THE ORDER SENT — not sorted — using
 *   PHP's urlencode, which differs from encodeURIComponent in two ways
 *   ('+' for space, upper-case hex). Getting either detail wrong
 *   produces a valid-looking hash that never matches.
 *
 *   Validate it wrong and /api/payfast-itn becomes an endpoint anyone on
 *   the internet can call to mark their own org paid. PayFast's own
 *   checklist is four steps and the one people skip is comparing the
 *   AMOUNT — without it, a real R1 payment can be replayed as a R750
 *   subscription.
 *
 * These are pure functions, so they are tested directly. The endpoint
 * wiring around them is checked by reading the source at the bottom:
 * cheap, and it catches a check being deleted.
 *
 * Run: node scripts/tests/test_payfast.js
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { signature, itnSignatureMatches, PLANS } from '../../api/_lib/payfast.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = path.join(__dirname, '..', '..', 'api');

const fail = [];
const ok = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fail.push(name); };

// ── The signature ─────────────────────────────────────────────────
console.log('\n── Signing ──');

// Worked by hand the way PayFast documents it, so this is an independent
// check rather than the implementation agreeing with itself.
const simple = { merchant_id: '10000100', merchant_key: '46f0cd694581a', amount: '350.00' };
const expected = crypto.createHash('md5')
  .update('merchant_id=10000100&merchant_key=46f0cd694581a&amount=350.00')
  .digest('hex');
ok('matches a hand-computed MD5 over the query string', signature(simple, '') === expected);

const withPass = crypto.createHash('md5')
  .update('merchant_id=10000100&merchant_key=46f0cd694581a&amount=350.00&passphrase=secret+phrase')
  .digest('hex');
ok('appends the passphrase, url-encoded, at the end',
   signature(simple, 'secret phrase') === withPass);

// Order is the classic mistake: sorting the fields produces a stable,
// plausible, permanently-rejected signature.
const a = { merchant_id: '1', amount: '10.00', item_name: 'X' };
const b = { amount: '10.00', item_name: 'X', merchant_id: '1' };
ok('field ORDER changes the signature (it is not sorted)', signature(a, '') !== signature(b, ''));

ok('a space encodes as "+", not %20',
   signature({ item_name: 'HostEase Pro' }, '') ===
   crypto.createHash('md5').update('item_name=HostEase+Pro').digest('hex'));

ok('hex escapes are upper-case',
   signature({ item_name: 'a@b' }, '') ===
   crypto.createHash('md5').update('item_name=a%40b').digest('hex'));

ok('empty fields are omitted entirely',
   signature({ a: '1', b: '', c: null, d: undefined, e: '2' }, '') ===
   crypto.createHash('md5').update('a=1&e=2').digest('hex'));

ok('values are trimmed',
   signature({ a: '  1  ' }, '') === crypto.createHash('md5').update('a=1').digest('hex'));

// ── Notification signatures ───────────────────────────────────────
console.log('\n── Verifying a notification ──');

const itn = {
  m_payment_id: 'hep-org-1-123', pf_payment_id: '999',
  payment_status: 'COMPLETE', amount_gross: '350.00',
  custom_str1: 'org-1', custom_str2: 'starter',
};
const signed = { ...itn, signature: signature(itn, 'pp') };
ok('a correctly signed notification verifies', itnSignatureMatches(signed, 'pp'));
ok('a tampered AMOUNT fails', !itnSignatureMatches({ ...signed, amount_gross: '750.00' }, 'pp'));
ok('a tampered ORG fails',    !itnSignatureMatches({ ...signed, custom_str1: 'someone-else' }, 'pp'));
ok('the wrong passphrase fails', !itnSignatureMatches(signed, 'not-the-passphrase'));
ok('a missing signature fails',  !itnSignatureMatches(itn, 'pp'));

// ── Prices ────────────────────────────────────────────────────────
console.log('\n── Plans ──');
ok('Starter is R350', PLANS.starter.cents === 35000);
ok('Growth is R550',  PLANS.growth.cents  === 55000);
ok('Pro is R750',     PLANS.pro.cents     === 75000);
ok('Pro has no property ceiling', PLANS.pro.properties === null);
ok('every price is whole cents, no floats',
   Object.values(PLANS).every(p => Number.isInteger(p.cents)));

// ── The endpoints still do all four checks ────────────────────────
console.log('\n── The ITN endpoint ──');
const itnSrc = fs.readFileSync(path.join(API, 'payfast-itn.js'), 'utf8');
ok('1. verifies the signature',        /itnSignatureMatches\(/.test(itnSrc));
ok('2. verifies the source is PayFast', /isPayfastSource\(/.test(itnSrc));
ok('3. compares the amount to what we expect',
   /amount_cents/.test(itnSrc) && /does not match expected/.test(itnSrc));
ok('4. confirms with PayFast server-side', /confirmWithPayfast\(/.test(itnSrc));
ok('records rejected notifications too, for diagnosis',
   /accepted: false/.test(itnSrc) && /subscription_events/.test(itnSrc));
ok('only COMPLETE activates a subscription',
   /payment_status === 'COMPLETE' \? 'active'/.test(itnSrc));

console.log('\n── The checkout endpoint ──');
const subSrc = fs.readFileSync(path.join(API, 'payfast-subscribe.js'), 'utf8');
ok('takes the org from the caller\'s profile, never the request body',
   /profile\.org_id/.test(subSrc) && !/req\.body[^)]*org_id/.test(subSrc));
ok('the amount comes from the server-side plan table',
   /PLANS\[plan\]/.test(subSrc) && !/req\.body\.amount/.test(subSrc));
ok('refuses a plan it does not know', /Unknown plan/.test(subSrc));
ok('only an owner or admin can start billing', /Only an owner or admin/.test(subSrc));
ok('subscription_type 1, monthly, until cancelled',
   /subscription_type: '1'/.test(subSrc) && /frequency:\s*'3'/.test(subSrc) && /cycles:\s*'0'/.test(subSrc));

// The passphrase is what stops someone who knows the merchant id from
// forging a payment form, so it must never reach a browser.
const page = fs.readFileSync(path.join(__dirname, '..', '..', 'demo', 'index_fixed.html'), 'utf8');
ok('the passphrase is never in the page', !/PAYFAST_PASSPHRASE|passphrase/i.test(page));
ok('the page posts to our endpoint, not straight to PayFast',
   /\/api\/payfast-subscribe/.test(page));

console.log(fail.length ? `\n${fail.length} FAILED\n` : '\nAll checks passed\n');
process.exit(fail.length ? 1 : 0);
