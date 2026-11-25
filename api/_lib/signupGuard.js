// Whether a self-serve signup should be allowed through right now.
//
// Written after 24-25 November, when eighteen accounts were registered in
// a day and one of them was used to plant a script in a booking.
//
// ── WHY THERE IS A GLOBAL CEILING ─────────────────────────────────
//
// Those eighteen came from eighteen different IP addresses. A per-IP
// counter would have seen a single attempt from each and allowed every
// one. Per-IP and per-email limits stop a careless script; only a ceiling
// on the whole endpoint stops a distributed one. The number is set where
// a genuine hour of traffic at this stage cannot reach it.
//
// ── FAIL OPEN, DELIBERATELY ───────────────────────────────────────
//
// If the counting query itself fails, signup proceeds. A rate limiter
// that takes the product down when the database hiccups has done more
// damage than the abuse it was written for, and the endpoint's blast
// radius is junk rows in an empty new org — not access to anyone's data.

import crypto from 'node:crypto';

export const LIMITS = {
  perIpPerHour: 3,
  perEmailPerHour: 3,
  globalPerHour: 20,
};

// Reserved and non-routable domains (RFC 2606 / 6761) cannot receive
// mail, so an address at one is never a real customer. example.com and
// probe-*.com showed up repeatedly in the November attempts.
const RESERVED = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost|local)$/i;

export const hashEmail = (email) =>
  crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');

// Vercel puts the real client address first in x-forwarded-for; the rest
// are proxies and are attacker-settable, so only the first is used.
export function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.headers['x-real-ip'] || req.socket?.remoteAddress || null;
}

// Signing up with the platform's OWN domain is never legitimate — those
// addresses are issued, not self-registered — and three of the November
// accounts used exactly that to look like staff.
export function domainAllowed(email, ownDomain = 'hosteasepro.com') {
  const domain = String(email).trim().toLowerCase().split('@')[1] || '';
  if (!domain) return false;
  if (RESERVED.test(domain)) return false;
  if (domain === String(ownDomain).toLowerCase()) return false;
  return true;
}

/**
 * @returns {Promise<{allowed: boolean, reason?: string, message?: string}>}
 */
export async function checkSignupAllowed({ supabaseUrl, svcHeaders, ip, email }) {
  if (!domainAllowed(email)) {
    return {
      allowed: false,
      reason: 'blocked_domain',
      message: 'Please sign up with a working business email address.',
    };
  }

  const since = new Date(Date.now() - 3600_000).toISOString();
  const q = (filter) =>
    fetch(`${supabaseUrl}/rest/v1/signup_attempts?created_at=gte.${since}&${filter}&select=id`,
          { headers: { ...svcHeaders, Prefer: 'count=exact', Range: '0-0' } });

  try {
    const [ipRes, emailRes, allRes] = await Promise.all([
      ip ? q(`ip=eq.${encodeURIComponent(ip)}`) : Promise.resolve(null),
      q(`email_hash=eq.${hashEmail(email)}`),
      q('id=gt.0'),
    ]);

    // PostgREST returns the total after the slash in Content-Range.
    const total = (r) => {
      if (!r || !r.ok) return 0;
      const n = parseInt(String(r.headers.get('content-range') || '').split('/')[1], 10);
      return Number.isFinite(n) ? n : 0;
    };

    // The message never says which limit was hit, or whether the address
    // is known. "Too many signups from this address" tells a script what
    // to vary next, and confirms an email exists to anyone who asks.
    const busy = {
      allowed: false,
      message: 'Too many signups just now. Please try again in an hour.',
    };

    if (total(allRes) >= LIMITS.globalPerHour) return { ...busy, reason: 'blocked_global' };
    if (ip && total(ipRes) >= LIMITS.perIpPerHour) return { ...busy, reason: 'blocked_ip' };
    if (total(emailRes) >= LIMITS.perEmailPerHour) return { ...busy, reason: 'blocked_email' };

    return { allowed: true };
  } catch (e) {
    // See "fail open" above.
    return { allowed: true };
  }
}

export async function recordSignupAttempt({ supabaseUrl, svcHeaders, ip, email, outcome }) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/signup_attempts`, {
      method: 'POST',
      headers: { ...svcHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify([{ ip: ip || null, email_hash: hashEmail(email), outcome }]),
    });
  } catch (e) {
    // Recording an attempt must never be the reason a signup fails.
  }
}
