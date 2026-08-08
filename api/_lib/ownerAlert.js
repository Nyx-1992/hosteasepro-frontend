// The email that tells the platform owner somebody signed up.
//
// ══ WHY THIS EXISTS ══════════════════════════════════════════════
//
// "I am missing that I am not being informed if there is a new customer!
// I am scared someone finds the website and tries it out and I never
// realise it without logging into the platform."
//
// Signup has been open since the marketing page shipped. api/signup.js
// creates the org, the login, the trial and the settings row, then emails
// a welcome TO THE CUSTOMER — and tells nobody here. The only way to
// discover a new agency was to open HQ and count.
//
// A trial is seven days. Lose the first three and most of it is gone
// before anyone says hello, on exactly the customer who arrived unaided.
//
// ══ WHAT IT WILL NOT DO ══════════════════════════════════════════
//
// It never throws and never rejects. An alert is for our benefit; the
// account is what the person came for. signup.js deletes a half-made org
// when something fails, and "the owner's notification bounced" must never
// be the thing that triggers that — the customer would see their signup
// fail for a reason that has nothing to do with them.
//
// Inert with no RESEND_API_KEY, same as welcomeEmail.js: returns
// { skipped: true } and does nothing, so this ships today and starts
// working the moment the key exists.
//
// ══ THE BIT THAT MATTERS WHEN IT DOES NOT WORK ═══════════════════
//
// A failed email looks exactly like a quiet week, which is the state she
// is frightened of being wrong about. So the caller records the attempt in
// platform_alerts (918) whether it worked or not, a daily sweep re-sends
// anything with no successful row, and HQ shows the count that never got
// out. The email is the fast path, not the only one.

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

// ── WHY THIS IS NOT WELCOME_FROM ─────────────────────────────────
//
// The first alert landed in SPAM, while the welcome email and the trial
// reminder — same domain, same key — went to the inbox. The difference is
// that this one was addressed to itself: From info@hosteasepro.com, To
// info@hosteasepro.com. Mail claiming to come from your own address while
// arriving from an outside server is one of the oldest spoofing patterns
// there is, and Gmail treats it accordingly. The customer-facing mail
// never hits this because it goes to somebody else.
//
// So alerts get their own sender. Any address on the verified domain works
// in Resend with no extra setup, and From no longer equals To.
const FROM     = process.env.ALERT_FROM || 'HostEase Pro Alerts <alerts@hosteasepro.com>';
// Replies should reach a person, not the alert robot.
const REPLY_TO = process.env.WELCOME_REPLY_TO || 'info@hosteasepro.com';
// Where the alert goes. Separate from the customer-facing addresses on
// purpose: this one can be a personal inbox or a phone-notified address
// without changing what customers see in a From line.
const ALERT_TO = process.env.OWNER_ALERT_EMAIL || 'info@hosteasepro.com';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtDate = (d) => {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch (e) { return String(d).slice(0, 10); }
};

const shell = (title, bodyHtml) => `
<div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;background:#F4F0E7;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;border:1px solid #e8e2d6">
    <div style="font-size:1.15rem;font-weight:700;color:#3A3632;margin-bottom:14px">${esc(title)}</div>
    ${bodyHtml}
  </div>
  <div style="max-width:520px;margin:12px auto 0;font-size:.72rem;color:#8a8378;text-align:center">
    Sent by HostEase Pro because you are the platform owner. Nobody else receives this.
  </div>
</div>`;

const row = (k, v) => v
  ? `<tr><td style="padding:5px 12px 5px 0;color:#8a8378;font-size:.84rem;white-space:nowrap">${esc(k)}</td>
         <td style="padding:5px 0;color:#3A3632;font-size:.9rem;font-weight:600">${esc(v)}</td></tr>`
  : '';

/** One new agency. */
export function signupAlertHtml(p) {
  const days = p.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(p.trialEndsAt) - Date.now()) / 86400000))
    : null;
  return shell('🎉 A new agency just signed up', `
    <table style="border-collapse:collapse;margin-bottom:18px">
      ${row('Business', p.business)}
      ${row('Person',   p.name)}
      ${row('Email',    p.email)}
      ${row('Trial ends', p.trialEndsAt ? `${fmtDate(p.trialEndsAt)}${days != null ? ` · ${days} day${days === 1 ? '' : 's'} left` : ''}` : '')}
    </table>
    <div style="background:#F7F4EC;border-radius:9px;padding:12px 14px;font-size:.85rem;color:#5e574d;line-height:1.6">
      They found this on their own and have <strong>seven days</strong>. Worth a note today —
      by day four most of the trial is gone.
    </div>
    ${p.origin ? `<div style="margin-top:18px">
      <a href="${esc(p.origin)}" style="display:inline-block;background:#3A3632;color:#fff;text-decoration:none;
         padding:10px 18px;border-radius:8px;font-size:.88rem;font-weight:600">Open HQ</a>
    </div>` : ''}`);
}

/** The daily sweep found signups that were never announced. */
export function digestHtml(list, origin) {
  return shell(
    list.length === 1 ? '1 signup you were not told about' : `${list.length} signups you were not told about`, `
    <div style="font-size:.87rem;color:#5e574d;line-height:1.6;margin-bottom:14px">
      These agencies exist and no alert reached you when they arrived — most likely the mailer was
      unavailable at the time. Catching them here is why the alert is recorded and not just sent.
    </div>
    <table style="border-collapse:collapse;width:100%">
      ${list.map(s => `<tr>
        <td style="padding:8px 12px 8px 0;border-top:1px solid #efeae0">
          <div style="font-weight:650;color:#3A3632;font-size:.92rem">${esc(s.org_name || 'Unnamed')}</div>
          <div style="color:#8a8378;font-size:.8rem">${esc(s.owner_name || '')}${s.owner_email ? ' · ' + esc(s.owner_email) : ''}</div>
        </td>
        <td style="padding:8px 0;border-top:1px solid #efeae0;text-align:right;color:#8a8378;font-size:.8rem;white-space:nowrap">
          ${esc(fmtDate(s.created_at))}
        </td></tr>`).join('')}
    </table>
    ${origin ? `<div style="margin-top:18px">
      <a href="${esc(origin)}" style="display:inline-block;background:#3A3632;color:#fff;text-decoration:none;
         padding:10px 18px;border-radius:8px;font-size:.88rem;font-weight:600">Open HQ</a>
    </div>` : ''}`);
}

// Never throws. Returns { skipped } | { ok } | { error } — the caller
// records which, so a broken mailer is visible instead of silent.
async function send(subject, html) {
  if (!RESEND_API_KEY) return { skipped: true, error: 'RESEND_API_KEY not set' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM, to: [ALERT_TO], reply_to: REPLY_TO, subject, html,
        // Marks this as automated so a mail client files it as a
        // notification rather than weighing it as ordinary correspondence.
        headers: { 'X-Auto-Response-Suppress': 'All', 'Auto-Submitted': 'auto-generated' },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return { error: `Resend ${r.status}: ${(await r.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 200) };
  }
}

export function sendSignupAlert(p) {
  return send(`New signup: ${p.business || 'an agency'}`, signupAlertHtml(p));
}

export function sendSignupDigest(list, origin) {
  return send(
    list.length === 1 ? '1 signup you were not told about'
                      : `${list.length} signups you were not told about`,
    digestHtml(list, origin));
}

export const alertTo = () => ALERT_TO;
export const alertsConfigured = () => !!RESEND_API_KEY;
