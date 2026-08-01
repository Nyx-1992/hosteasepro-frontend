// PayFast signing and validation, shared by the checkout and ITN
// endpoints. Kept in one file because the signature rules are fiddly and
// two subtly different implementations of them is exactly how a payment
// integration ends up rejecting real payments.
import crypto from 'crypto';

export const SANDBOX_PROCESS = 'https://sandbox.payfast.co.za/eng/process';
export const LIVE_PROCESS    = 'https://www.payfast.co.za/eng/process';
export const SANDBOX_VALIDATE = 'https://sandbox.payfast.co.za/eng/query/validate';
export const LIVE_VALIDATE    = 'https://www.payfast.co.za/eng/query/validate';

// PayFast's published sandbox merchant. Safe to have here: these are
// documented test credentials that move no real money, and having a
// working default means the flow can be exercised end to end before the
// live account exists.
const SANDBOX_MERCHANT_ID  = '10000100';
const SANDBOX_MERCHANT_KEY = '46f0cd694581a';

export function payfastConfig() {
  const live = String(process.env.PAYFAST_LIVE || '').toLowerCase() === 'true';
  return {
    live,
    merchantId:  process.env.PAYFAST_MERCHANT_ID  || (live ? '' : SANDBOX_MERCHANT_ID),
    merchantKey: process.env.PAYFAST_MERCHANT_KEY || (live ? '' : SANDBOX_MERCHANT_KEY),
    // Optional on PayFast's side, but it is the only thing stopping
    // someone who knows your merchant id from forging a valid-looking
    // payment form. Set it in both the dashboard and the environment.
    passphrase:  process.env.PAYFAST_PASSPHRASE || '',
    processUrl:  live ? LIVE_PROCESS  : SANDBOX_PROCESS,
    validateUrl: live ? LIVE_VALIDATE : SANDBOX_VALIDATE,
  };
}

// PayFast expects PHP's urlencode: spaces as '+', and hex digits in
// UPPER case. encodeURIComponent gives '%20' and lower-case hex, so both
// have to be corrected or every signature is wrong.
function pfEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/%20/g, '+')
    .replace(/%[0-9a-f]{2}/g, m => m.toUpperCase());
}

// The signature is an MD5 over the fields IN THE ORDER THEY ARE SENT,
// not sorted — the single most common way to get this wrong. Empty
// values are omitted entirely.
export function signature(fields, passphrase) {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => `${k}=${pfEncode(String(v).trim())}`);
  if (passphrase) parts.push(`passphrase=${pfEncode(passphrase.trim())}`);
  return crypto.createHash('md5').update(parts.join('&')).digest('hex');
}

// An ITN arrives with its own signature over everything except the
// signature field, in the order received. Object key order in JS follows
// insertion order for string keys, so parsing the body preserves it.
export function itnSignatureMatches(body, passphrase) {
  const received = body.signature;
  if (!received) return false;
  const fields = {};
  for (const [k, v] of Object.entries(body)) { if (k !== 'signature') fields[k] = v; }
  return signature(fields, passphrase) === received;
}

// PayFast posts from a known set of hosts. Resolving them each time
// rather than pinning IPs, because the addresses do change.
const PF_HOSTS = [
  'www.payfast.co.za', 'sandbox.payfast.co.za',
  'w1w.payfast.co.za', 'w2w.payfast.co.za',
];

export async function isPayfastSource(ip) {
  if (!ip) return false;
  const { promises: dns } = await import('dns');
  const allowed = new Set();
  await Promise.all(PF_HOSTS.map(async host => {
    try { (await dns.resolve4(host)).forEach(a => allowed.add(a)); } catch { /* host may not resolve */ }
  }));
  return allowed.has(String(ip).replace(/^::ffff:/, ''));
}

// Step four of PayFast's own checklist: hand the notification straight
// back to them and ask whether they sent it. This is what makes a forged
// ITN useless even if every other check somehow passed.
export async function confirmWithPayfast(body, validateUrl) {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) form.append(k, v);
  const r = await fetch(validateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const text = (await r.text()).trim();
  return text === 'VALID';
}

// R350 / R550 / R750, the owner's decision (p3-14). Cents, because
// floating point and money do not belong together.
export const PLANS = {
  starter: { label: 'Starter', cents: 35000, properties: 2 },
  growth:  { label: 'Growth',  cents: 55000, properties: 8 },
  pro:     { label: 'Pro',     cents: 75000, properties: null },
};
