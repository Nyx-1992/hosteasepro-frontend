// Tell the agency a property owner has asked something.
//
// ══ WHY THIS EXISTS ══════════════════════════════════════════════
//
// "Most importantly they should be able to raise queries through that
// instead of bombarding us via WhatsApp."
//
// A portal only replaces WhatsApp if the answer comes back. WhatsApp is not
// winning on features — it is winning because a message there is SEEN. Put a
// question somewhere nobody is watching and the owner learns, once, that the
// portal is where questions go to die, and never uses it again.
//
// So there are two notifications, not one: a badge on the Owner Questions
// tab for whoever is already in the app, and this, for whoever is not.
//
// ══ WHAT IT WILL NOT DO ══════════════════════════════════════════
//
// It never fails the question. The query and its first message are already
// committed by the time the browser calls this; a bounced alert must never
// be shown to an owner as "your question did not send". Every path returns
// 200 with a reason, and the caller does not await it.
//
// Inert with no RESEND_API_KEY, the same as welcomeEmail.js and
// ownerAlert.js — so this ships today and starts working the moment the key
// is there.
//
// ══ IT DOES NOT TRUST THE BROWSER ════════════════════════════════
//
// The body carries a query id and nothing else that matters. Subject and
// preview are re-read from the database with the service role, because a
// caller could otherwise post any text they liked to the agency's inbox
// through an endpoint that needs no session. The id is the only input, and
// an id that does not exist is a 200 and a shrug.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM     = process.env.WELCOME_FROM        || 'HostEase Pro <info@hosteasepro.com>';
// Same env var ownerAlert.js already uses, rather than inventing a second
// one that would have to be set separately and silently would not be.
const FALLBACK = process.env.OWNER_ALERT_EMAIL   || 'info@hosteasepro.com';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`supabase ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return res.status(200).json({ skipped: 'server not configured' });
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const queryId = String(body.queryId || '');
    if (!/^[0-9a-f-]{36}$/i.test(queryId)) {
      return res.status(200).json({ skipped: 'no query id' });
    }

    // Re-read everything from the database. Nothing the browser sent is used
    // in the email itself.
    const rows = await rest(
      `owner_queries?id=eq.${queryId}&select=id,subject,status,category,org_id,property_id,raised_by_name,last_message_at`);
    const q = rows && rows[0];
    if (!q) return res.status(200).json({ skipped: 'no such query' });

    const msgs = await rest(
      `owner_query_messages?query_id=eq.${queryId}&order=created_at.desc&limit=1&select=body,author_side,author_name`);
    const last = (msgs && msgs[0]) || {};
    // Only an owner's message is news. Our own reply coming back round would
    // be the agency emailing itself.
    if (last.author_side === 'agency') {
      return res.status(200).json({ skipped: 'last message is ours' });
    }

    const props = await rest(`properties?id=eq.${q.property_id}&select=name`);
    const propName = (props && props[0] && props[0].name) || 'a property';

    // THE AGENCY WHOSE OWNER ASKED, not us. org_settings.email is each
    // agency's own address. profiles has no email column — the addresses
    // live in auth.users, and that schema is not exposed over REST.
    //
    // The fallback is the platform inbox, so a question always lands
    // somewhere. For a second agency that is the wrong somewhere, which is
    // why it is a fallback and not the rule.
    let to = [];
    try {
      const settings = await rest(`org_settings?org_id=eq.${q.org_id}&select=email`);
      const addr = settings && settings[0] && settings[0].email;
      if (addr) to = [addr];
    } catch (e) { /* fall through to the fallback address */ }
    if (!to.length) to = [FALLBACK];

    if (!RESEND_API_KEY) {
      return res.status(200).json({ skipped: 'no RESEND_API_KEY', wouldHaveSent: to.length });
    }

    const preview = String(last.body || '').slice(0, 600);
    const who = q.raised_by_name || last.author_name || 'The owner';
    // The topic goes in the subject line, because that is the part read on
    // a phone before anything is opened: "TV House · Pool: ..." says
    // whether this is for today or for the weekly catch-up.
    const CATS = { maintenance:'Maintenance', pool:'Pool', garden:'Garden', cleaning:'Cleaning',
                   access:'Keys & security', utilities:'Utilities', invoice:'Invoice',
                   booking:'Bookings', meeting:'Meeting request', other:'Other' };
    const cat = q.category && CATS[q.category] ? CATS[q.category] : '';
    const subject = `${propName}${cat ? ' · ' + cat : ''}: ${q.subject}`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to,
        reply_to: FALLBACK,
        subject: `🏡 ${subject}`,
        text:
`${who} asked something about ${propName}.

${q.subject}

"${preview}"

Answer it in HostEase Pro → Messages → Owner Questions.
Replying to this email does NOT reach them — the thread lives in the app.`,
        html:
`<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px">
  <p style="margin:0 0 4px"><strong>${esc(who)}</strong> asked something about <strong>${esc(propName)}</strong>.</p>
  <p style="margin:14px 0 6px;font-size:1.05rem;font-weight:700">${esc(q.subject)}</p>
  <blockquote style="margin:0;padding:10px 14px;border-left:3px solid #c8922e;background:#faf7f1;white-space:pre-wrap">${esc(preview)}</blockquote>
  <p style="margin:18px 0 4px">Answer it in HostEase Pro → <strong>Messages → Owner Questions</strong>.</p>
  <p style="margin:0;color:#61748c;font-size:.85rem">Replying to this email does not reach them — the thread lives in the app.</p>
</div>`,
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.warn('owner-query-alert: resend', r.status, detail.slice(0, 200));
      return res.status(200).json({ sent: false, status: r.status });
    }
    return res.status(200).json({ sent: true, recipients: to.length });
  } catch (e) {
    // Never a failure the owner can see.
    console.warn('owner-query-alert:', e && e.message);
    return res.status(200).json({ sent: false, error: 'alert failed' });
  }
}
