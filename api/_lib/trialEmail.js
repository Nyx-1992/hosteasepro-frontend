// The three emails a trialling agency gets before, and when, their week
// runs out.
//
// ── WHAT THESE ARE ALLOWED TO SAY ─────────────────────────────────
//
// The truth, which is milder than most trial-expiry email you have ever
// received. 880 made a lapsed subscription mean READ EVERYTHING, WRITE
// NOTHING: the agency keeps full access to its own bookings, guests,
// cleaning history and reports, and simply cannot add or change anything
// until the subscription is live. Nothing is deleted. Nobody is locked
// out. The owner's rule was "definitely limited view, but not lock out."
//
// So none of these may imply data loss to manufacture urgency. The first
// one lands on somebody four days into deciding whether to trust a small
// company with the record of their business, and a scare tactic answers
// that question for them.
//
// ── NO CARD ON FILE, SO NOTHING HAPPENS BY ITSELF ─────────────────
//
// signup.js takes no card. That means the end of a trial is not a charge
// — it is simply the point at which writing stops. Saying so plainly is
// worth more than a discount: nobody is about to be billed by surprise,
// and there is nothing to cancel. Every one of these says it.

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmt = (iso) => {
  try {
    return new Date(iso).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
  } catch (e) { return ''; }
};

// Same shell as the welcome email, so the sequence reads as one company
// rather than three templates written on different days.
function shell(bodyHtml) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff">
  <div style="background:#14161D;padding:26px 32px">
    <div style="color:#C17F3C;font-size:19px;font-weight:700;letter-spacing:.2px">HostEase&nbsp;Pro</div>
  </div>
  ${bodyHtml}
  <div style="background:#f7f8fa;border-top:1px solid #eceef1;padding:16px 32px;text-align:center">
    <div style="font-size:12px;color:#9aa2ad">
      HOSTEASE PRO &middot; Reg 2026/613044/07 &middot; Cape Town, South Africa
    </div>
  </div>
</div></body></html>`;
}

const button = (origin, label) => `
  <div style="padding:22px 32px 8px">
    <a href="${esc(origin)}" style="display:inline-block;background:#C17F3C;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:9px;font-size:15px;font-weight:700">
      ${esc(label)}
    </a>
  </div>`;

// The paragraph that keeps all three honest. Repeated deliberately: it is
// the single most reassuring fact about this product's billing, and the
// person reading has probably not read the previous email.
const nothingHappens = `
  <div style="padding:18px 32px 0">
    <div style="background:#f7f8fa;border:1px solid #eceef1;border-radius:10px;padding:16px;font-size:14px;line-height:1.65;color:#4a5361">
      There is no card on your account, so nothing is charged automatically and
      there is nothing to cancel. If the trial simply runs out, your data stays
      exactly where it is and stays readable — you just cannot add or change
      anything until a plan is active.
    </div>
  </div>`;

const plans = `
  <div style="padding:20px 32px 0">
    <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a93a0;margin-bottom:10px">
      Plans
    </div>
    ${[['Starter', 'R350', 'Up to 3 properties'],
       ['Growth', 'R550', 'Up to 10 properties'],
       ['Pro', 'R750', 'Unlimited properties']]
      .map(([n, p, d]) => `
      <div style="display:block;padding:9px 0;border-top:1px solid #eceef1">
        <span style="font-size:15px;font-weight:700;color:#14161D">${n}</span>
        <span style="font-size:15px;color:#C17F3C;font-weight:700"> · ${p}/month</span>
        <div style="font-size:13px;color:#6b7280">${d}</div>
      </div>`).join('')}
  </div>`;

/**
 * @param {'t3'|'t1'|'t0'} kind
 * @param {object} p  { name, business, origin, trialEndsAt, daysLeft }
 * @returns {{subject: string, html: string}}
 */
export function trialEmail(kind, p) {
  const first = String(p.name || '').trim().split(/\s+/)[0] || 'there';
  const when = fmt(p.trialEndsAt);
  const origin = p.origin || 'https://hosteasepro.com';

  if (kind === 't3') {
    return {
      subject: `Your HostEase Pro trial ends ${when || 'soon'}`,
      html: shell(`
        <div style="padding:30px 32px 8px">
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#14161D;font-weight:700">A few days left, ${esc(first)}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#4a5361">
            ${esc(p.business || 'Your')} free week on HostEase Pro runs until
            <strong style="color:#14161D">${esc(when)}</strong>. No action is needed
            before then — this is just so it does not catch you out.
          </p>
          <p style="margin:0;font-size:15px;line-height:1.65;color:#4a5361">
            If something has not worked the way you expected, reply to this email and
            tell me. I would rather fix it than lose you over it.
          </p>
        </div>
        ${nothingHappens}
        ${plans}
        ${button(origin, 'Open HostEase Pro')}
        <div style="height:22px"></div>`),
    };
  }

  if (kind === 't1') {
    return {
      subject: 'One day left on your HostEase Pro trial',
      html: shell(`
        <div style="padding:30px 32px 8px">
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#14161D;font-weight:700">One day left, ${esc(first)}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#4a5361">
            ${esc(p.business || 'Your')} trial ends <strong style="color:#14161D">${esc(when)}</strong>.
            After that you can still open HostEase Pro and read everything in it —
            bookings, guests, cleaning history, reports — but adding and changing
            things stops until a plan is active.
          </p>
          <p style="margin:0;font-size:15px;line-height:1.65;color:#4a5361">
            If you need longer to decide, just ask. A few more days is not a problem.
          </p>
        </div>
        ${nothingHappens}
        ${plans}
        ${button(origin, 'Choose a plan')}
        <div style="height:22px"></div>`),
    };
  }

  // t0 — the day it runs out. This one has to be the least pushy of the
  // three, because the person reading it has just been told no.
  return {
    subject: 'Your HostEase Pro trial has ended',
    html: shell(`
      <div style="padding:30px 32px 8px">
        <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#14161D;font-weight:700">Your trial has ended</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#4a5361">
          ${esc(first)}, ${esc(p.business || 'your')} free week is up. Nothing has been
          deleted and you have not been locked out — sign in whenever you like and
          everything is still there to read.
        </p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#4a5361">
          What has stopped is writing: new bookings, edits, cleaning schedules and
          reports will not save until a plan is active. Pick one and everything
          carries on from exactly where you left it.
        </p>
        <p style="margin:0;font-size:15px;line-height:1.65;color:#4a5361">
          And if HostEase Pro was not right for you, that is genuinely useful to know.
          Reply and tell me what was missing — it is the fastest way this gets better.
        </p>
      </div>
      ${plans}
      ${button(origin, 'Reactivate')}
      <div style="height:22px"></div>`),
  };
}

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.WELCOME_FROM || 'HostEase Pro <info@hosteasepro.com>';
const REPLY_TO = process.env.WELCOME_REPLY_TO || 'info@hosteasepro.com';

// Never throws, same as sendWelcomeEmail. One agency's bounced reminder
// must not abort the run and rob everybody after them in the list.
export async function sendTrialEmail(kind, p) {
  if (!RESEND_API_KEY) return { skipped: 'no RESEND_API_KEY' };
  const { subject, html } = trialEmail(kind, p);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [p.email], reply_to: REPLY_TO, subject, html }),
    });
    if (!r.ok) return { error: (await r.text()).slice(0, 300) };
    return { sent: true };
  } catch (e) {
    return { error: e && e.message };
  }
}
