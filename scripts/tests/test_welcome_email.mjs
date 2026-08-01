#!/usr/bin/env node
/**
 * The welcome email a new agency receives, and the guarantee that it can
 * never cost them their account.
 *
 * WHY THIS EXISTS. Owner, 2026-08-01: "new customers should also receive a
 * welcome email when registering." HEP had no way to send mail at all —
 * the booking site's Resend key belongs to a different Vercel project.
 *
 * THE RULE THIS FILE PROTECTS: sendWelcomeEmail() must never throw and must
 * do nothing without a key. signup.js deletes a half-made org when anything
 * fails, so an email provider having a bad afternoon would otherwise delete
 * the account of somebody who just signed up. A missing welcome email is a
 * courtesy not delivered; a deleted account is the product not working.
 *
 * The business name is user input that goes straight into an HTML body, so
 * escaping is checked here rather than assumed.
 *
 * Run: node scripts/tests/test_welcome_email.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { welcomeHtml, sendWelcomeEmail } = await import(
  path.join(HERE, '..', '..', 'api', '_lib', 'welcomeEmail.js'));

const html = welcomeHtml({
  name: 'Thandi Mokoena', business: 'Cape Coast Property Co',
  origin: 'https://hosteasepro.com', portalKey: 'cape-coast-property-co',
  trialEndsAt: new Date('2026-08-09').toISOString(),
});


const fail=[], ok=(n,c)=>{console.log((c?'  ✓ ':'  ✗ ')+n); if(!c)fail.push(n);};
ok('renders', html.length > 1500);
ok('carries their own portal link', html.includes('https://hosteasepro.com/domestic/cape-coast-property-co'));
ok('shows the trial end date', /9 August 2026/.test(html));
ok('greets by first name only', html.includes('Welcome, Thandi') && !html.includes('Welcome, Thandi Mokoena'));
ok('names the agency', html.includes('Cape Coast Property Co'));
ok('carries the registration number', html.includes('2026/613044/07'));

// A business name is user input and goes straight into an email body.
const nasty = welcomeHtml({name:'A', business:'<script>alert(1)</script> & Co', origin:'https://x'});
ok('escapes a hostile business name', nasty.includes('&lt;script&gt;') && !nasty.includes('<script>alert'));
ok('escapes an ampersand', nasty.includes('&amp; Co'));

// No portal key yet -> the block is omitted rather than linking to nowhere.
ok('omits the portal box when there is no key',
   !welcomeHtml({name:'A',business:'B',origin:'https://x'}).includes('staff portal link'));

// The whole point: it must be harmless before it is configured.
const r = await sendWelcomeEmail({email:'a@b.c', name:'A', business:'B', origin:'https://x'});
ok('does nothing without an API key, and does not throw', r && r.skipped);
console.log(fail.length?`\n${fail.length} FAILED\n`:'\nAll passed\n');
process.exit(fail.length?1:0);
