// The email a new agency gets when they sign up.
//
// ── WHY IT CANNOT BREAK SIGNUP ────────────────────────────────────
//
// send() never throws and never returns a rejected promise. A welcome
// email is a courtesy; an account is the thing the person came for. If
// Resend is down, or the key is missing, or the domain is not verified
// yet, the correct outcome is an account that works and no email — not a
// 500 on a form somebody just filled in. signup.js already deletes a
// half-made org on failure, and "the welcome email bounced" must never be
// what triggers that.
//
// ── INERT UNTIL CONFIGURED ────────────────────────────────────────
//
// With no RESEND_API_KEY this returns { skipped: true } and does nothing.
// So it ships today, and starts sending the moment the key and the DNS
// records exist, with no code change — the same pattern as the booking
// site's brand switch.
//
// TO TURN IT ON:
//   1. Verify hosteasepro.com in Resend, which prints DKIM and SPF records
//      to add at xneelo. Sending "from" a domain without them lands in
//      spam, which is worse than not sending: the first thing a new
//      customer sees from you would be in their junk folder.
//   2. Set RESEND_API_KEY in the Vercel project (Production only — it is a
//      real credential, and preview deployments sit on guessable URLs).
//   3. Optionally set WELCOME_FROM, default below.

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.WELCOME_FROM || 'HostEase Pro <info@hosteasepro.com>';
const REPLY_TO = process.env.WELCOME_REPLY_TO || 'info@hosteasepro.com';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * @param {object} p
 * @param {string} p.email      where to send
 * @param {string} p.name       the person who signed up
 * @param {string} p.business   their agency
 * @param {string} p.origin     e.g. https://hosteasepro.com — taken from the
 *                              request, so it is right on every deployment
 *                              rather than hardcoded to one hostname
 * @param {string} [p.portalKey] their staff portal key, if known
 * @param {string} [p.trialEndsAt] ISO date
 */
export function welcomeHtml(p) {
  const first = String(p.name || '').trim().split(/\s+/)[0] || 'there';
  const portal = p.portalKey ? `${p.origin}/domestic/${p.portalKey}` : '';
  const trial = p.trialEndsAt
    ? new Date(p.trialEndsAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  // Three steps, not ten. These are the ones that make the rest of the app
  // stop being empty — a dashboard with no property cannot show anything,
  // and cleaning cannot be scheduled without staff.
  const steps = [
    ['Add your first property', 'Name, address and cleaning fee. The dashboard, calendar and reports all fill in around it.'],
    ['Add your cleaning staff', 'Each person gets a PIN and their own view of what needs doing. You will need this before you can schedule a turnover.'],
    ['Connect your calendars', 'Paste your Airbnb, Booking.com and LekkeSlaap iCal links so bookings arrive on their own and dates stop drifting apart.'],
  ];

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff">

  <div style="background:#14161D;padding:26px 32px">
    <div style="color:#C17F3C;font-size:19px;font-weight:700;letter-spacing:.2px">HostEase&nbsp;Pro</div>
  </div>

  <div style="padding:30px 32px 8px">
    <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#14161D;font-weight:700">Welcome, ${esc(first)}</h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#4a5361">
      ${esc(p.business)} is set up and ready. You can sign in whenever you like —
      there is no card on the account and nothing to cancel.
    </p>
  </div>

  <div style="padding:0 32px">
    <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a93a0;margin-bottom:12px">
      Three things to do first
    </div>
    ${steps.map(([t, d], i) => `
    <div style="display:block;padding:14px 0;border-top:1px solid #eceef1">
      <div style="font-size:15px;font-weight:700;color:#14161D;margin-bottom:3px">${i + 1}. ${esc(t)}</div>
      <div style="font-size:14px;line-height:1.6;color:#6b7280">${esc(d)}</div>
    </div>`).join('')}
  </div>

  <div style="padding:24px 32px 8px">
    <a href="${esc(p.origin)}" style="display:inline-block;background:#C17F3C;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:9px;font-size:15px;font-weight:700">
      Open HostEase Pro
    </a>
  </div>

  ${portal ? `
  <div style="padding:18px 32px 0">
    <div style="background:#f7f8fa;border:1px solid #eceef1;border-radius:10px;padding:16px">
      <div style="font-size:13px;font-weight:700;color:#14161D;margin-bottom:5px">Your staff portal link</div>
      <div style="font-size:13px;line-height:1.6;color:#6b7280;margin-bottom:8px">
        Send this to your cleaners. They sign in with a PIN — no app to install, no password to remember.
      </div>
      <div style="font-size:13px;color:#C17F3C;word-break:break-all">${esc(portal)}</div>
    </div>
  </div>` : ''}

  <div style="padding:22px 32px 30px">
    <p style="margin:0;font-size:14px;line-height:1.65;color:#6b7280">
      ${trial ? `Your free week runs until <strong style="color:#14161D">${esc(trial)}</strong>. ` : ''}Reply to this
      email if anything is unclear or does not work — it comes straight to us.
    </p>
  </div>

  <div style="background:#f7f8fa;border-top:1px solid #eceef1;padding:16px 32px;text-align:center">
    <div style="font-size:12px;color:#9aa2ad">
      HOSTEASE PRO &middot; Reg 2026/613044/07 &middot; Cape Town, South Africa
    </div>
  </div>

</div></body></html>`;
}

export async function sendWelcomeEmail(p) {
  if (!RESEND_API_KEY) return { skipped: 'no RESEND_API_KEY' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [p.email],
        reply_to: REPLY_TO,
        subject: `Welcome to HostEase Pro, ${String(p.name || '').trim().split(/\s+/)[0] || 'there'}`,
        html: welcomeHtml(p),
      }),
    });
    if (!r.ok) return { error: (await r.text()).slice(0, 300) };
    return { sent: true };
  } catch (e) {
    return { error: e && e.message };
  }
}
