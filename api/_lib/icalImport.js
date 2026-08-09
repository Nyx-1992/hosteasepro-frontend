// Pulling bookings IN from Airbnb, Booking.com and LekkeSlaap.
//
// ══ THE BUG THIS EXISTS TO FIX ════════════════════════════════════
//
// Reported from production: "Nina complained she couldn't see the latest
// booking in the domestic platform to assign a cleaner. When she tried
// syncing, a new one came in from LekkeSlaap and it didn't load on her
// end. I tried about 1.5h later and it worked immediately."
//
// The booking was not hidden from Nina. IT WAS NOT IN THE DATABASE.
//
// Until now the only thing that ever imported bookings was syncICalFeeds()
// in demo/index_fixed.html — client-side, fired three seconds after an
// ADMIN signs in and every thirty minutes for as long as they leave the
// tab open. The staff portal has no sync at all, so Nina could not trigger
// one however many buttons she pressed. An hour and a half later the owner
// opened HEP, it synced on login, and the booking appeared "immediately" —
// which looked like it fixing itself and was actually somebody else's
// browser doing the work Nina's could not.
//
// So: bookings only reached HEP while the owner had it open. For an agency
// whose owner takes a day off, nothing arrives. Sold to other agencies,
// that is not a quirk, it is a product that loses reservations.
//
// ══ WHAT THIS DELIBERATELY DOES NOT DO ═══════════════════════════
//
// IT NEVER CANCELS, RELEASES OR DEACTIVATES ANYTHING. Only inserts and
// updates.
//
// The browser sync also runs a "stale sweep": rows that vanish from a feed
// get released or cancelled. That is the destructive half, it has real
// incident history behind it — an active stay was once wrongly auto-
// cancelled by it, which is why the check-in guard exists — and it is
// carefully tuned against feeds nobody can re-run on demand. Porting it
// blind to a server that runs unattended every fifteen minutes is how you
// turn a missing-booking bug into a deleted-booking bug.
//
// The reported problem is entirely "new bookings do not arrive". That is
// the additive half. The sweep stays where it is, in the app, under a
// human, until it can be moved deliberately and tested against real feeds.
//
// ══ AND IT NEEDS NO CORS PROXY ═══════════════════════════════════
//
// The browser cannot fetch a platform's iCal directly, so it goes through
// a proxy list. The first entry points at /api/ical-proxy, WHICH DOES NOT
// EXIST — so in practice every sync in the product today is relayed by
// api.allorigins.win, a free third-party service. That is a reliability
// problem (it is very likely what Nina actually hit) and a privacy one:
// guest names and dates pass through a stranger's server on the way in.
//
// Server-side there is no CORS, so this fetches the platform directly.
// Strictly more reliable, and one fewer party seeing customer data.

const SUPABASE_URL = process.env.SUPABASE_URL;

// ── PARSING ───────────────────────────────────────────────────────
// Ported verbatim from the browser copy: it is pure, it is debugged
// against real feeds from all three platforms, and "improving" it here
// would mean the two sides disagree about what a feed says.

export function parseICalDate(str) {
  if (!str) return '';
  const s = String(str).replace(/[TZ]/g, '').replace(/[+-]\d{4}$/, '');
  return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
}

// RFC 5545: a CRLF followed by one space or tab is a folded continuation,
// not a new line. Miss this and long SUMMARY fields silently truncate.
export function unfoldIcal(text) {
  return String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

// LekkeSlaap packs the real guest details into SUMMARY, delimited by a
// literal backslash-n rather than a newline.
export function parseICalSummaryFields(rawSummary) {
  const result = { externalRef: null, customerName: null, guestEmail: null, guestCount: null };
  if (!rawSummary) return result;
  String(rawSummary).split('\\n').map(s => s.trim()).filter(Boolean).forEach(part => {
    const refMatch   = part.match(/^Reference:\s*(LS-[A-Z0-9]+)/i);
    const bareRef    = part.match(/^(LS-[A-Z0-9]+)$/i);
    const custMatch  = part.match(/^Customer:\s*(.+)$/i);
    const emailMatch = part.match(/^Email:\s*(.+)$/i);
    const guestMatch = part.match(/^Guests?:\s*(\d+)$/i);
    if (refMatch)   result.externalRef  = refMatch[1];
    if (bareRef)    result.externalRef  = bareRef[1];
    if (custMatch)  result.customerName = custMatch[1].trim();
    if (emailMatch) result.guestEmail   = emailMatch[1].trim();
    if (guestMatch) result.guestCount   = parseInt(guestMatch[1], 10);
  });
  return result;
}

/**
 * Is this a name the system invented, or one a person actually knows?
 *
 * THE WHOLE POINT OF HAVING THIS IN ONE PLACE. Two rules in importFeed
 * needed to answer this question, each answered it separately, and they
 * disagreed. The guest-name rule said a real name must never be
 * overwritten; the status rule did not consult names at all and let the
 * feed mark the row 'blocked'. A booking therefore ended up with a guest
 * name only Nicole could have typed and a status saying nobody was
 * coming, and Nina could not see it.
 *
 * Anything a platform or this importer generated is a placeholder. A name
 * that is not on this list came from a human, and beats a calendar feed.
 *
 * @param {string} name
 */
export function isPlaceholderName(name) {
  const s = (name || '').trim();
  if (!s) return true;
  if (s === 'Guest' || s === 'Booking.com Guest') return true;
  if (s.includes('🔒') || /^blocked$/i.test(s)) return true;
  // A bare LekkeSlaap reference is an id, not a person.
  if (/^LS-[A-Z0-9]+$/i.test(s)) return true;
  return false;
}

/**
 * @param {string} text     raw .ics
 * @param {object} feed     { property_id, property_name, platform }
 * @param {string[]} ownerNames  per-org names that mean "the owner is staying"
 */
export function parseICalText(text, feed, ownerNames = []) {
  const events = [];
  for (const block of unfoldIcal(text).split('BEGIN:VEVENT').slice(1)) {
    const get = key => {
      const m = block.match(new RegExp(key + '[^:]*:([^\r\n]+)'));
      return m ? m[1].trim() : '';
    };
    const startRaw = get('DTSTART'), endRaw = get('DTEND');
    if (!startRaw || !endRaw) continue;
    const checkIn = parseICalDate(startRaw), checkOut = parseICalDate(endRaw);
    if (!checkIn || !checkOut || checkIn >= checkOut) continue;

    const summary = get('SUMMARY') || '';
    const rawDesc = get('DESCRIPTION') || '';
    const desc = rawDesc.toLowerCase();
    const uid = get('UID') || '';
    const icalStatus = (get('STATUS') || '').toUpperCase();
    const nights = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000);
    const sumLower = summary.toLowerCase();
    const sumTrim = summary.trim();

    const ls = parseICalSummaryFields(summary);

    // OWNER STAYS. The browser copy hardcodes four first names — S&N's two
    // owner couples — in logic that every agency's feed runs through. On
    // another agency's calendar a guest called Nicole becomes an "owner
    // stay" and vanishes from their revenue. A DEFAULT THAT IS ONE
    // TENANT'S REAL DATA IS NEVER A SAFE DEFAULT.
    //
    // Here the names come from the org, and an org that has set none gets
    // only the generic test. Nobody inherits somebody else's family.
    const isOwnerStay =
      sumLower.includes('owner') || desc.includes('owner') ||
      ownerNames.some(n => n && sumLower.includes(String(n).toLowerCase()));

    // ── WHAT THE PLATFORMS ACTUALLY SEND ─────────────────────────
    //
    // Checked against S&N's real feeds rather than assumed, because the
    // rule that used to live here was backwards and hid a guest arriving
    // the same afternoon:
    //
    //   Airbnb reservation   SUMMARY "Reserved"
    //                        DESCRIPTION "Reservation URL: …/HMQYBA2F88
    //                                     Phone Number (Last 4 Digits): 2152"
    //   Airbnb block         SUMMARY "Airbnb (Not available)"
    //                        DESCRIPTION empty
    //   Booking.com, BOTH    SUMMARY "CLOSED - Not available"
    //                        DESCRIPTION empty
    //
    // So Airbnb separates them cleanly and we were reading it inside out:
    // `airbnb && includes('reserved')` marked every genuine reservation as
    // a block, while real Airbnb blocks say "Not available" and were
    // already caught by the test above it. That rule could only ever
    // misfire. A reservation URL in the description is the positive proof,
    // and it is present on every Airbnb booking in the data.
    const hasReservationUrl = /airbnb\.com\/hosting\/reservations/i.test(rawDesc);

    // Booking.com cannot be separated. Their export says "CLOSED - Not
    // available" with an empty description for a real reservation AND for
    // a closure the host set — 15 rows in S&N's data, identical.
    //
    // SO IT IS A JUDGEMENT CALL, AND THIS IS THE SIDE TO ERR ON. Of the 19
    // Booking.com rows filed as blocks, at least 12 had a real guest name
    // Nicole had typed in from Booking.com's own emails — they were
    // reservations. Treating them as bookings that need a name is wrong
    // occasionally and shows one extra line she can correct; treating them
    // as blocks is wrong most of the time and hides an arrival from the
    // person who has to clean for it. A dirty flat on arrival day costs
    // more than a glance.
    //
    // WITH ONE LIMIT, LEARNED BY OVERSHOOTING. The first version of this
    // lifted three TV House rows that were closures: 2 nights, 88 nights
    // and 183 nights. Nobody books a house for six months through
    // Booking.com. The threshold is not a round number picked for comfort
    // — the longest genuine reservation in this data is 20 nights, and the
    // closures start at 88, so a month is comfortably between them and
    // wrong in neither direction.
    const TOO_LONG_FOR_A_STAY = 31;
    const bookingComClosed = feed.platform === 'booking'
      && sumLower.includes('closed')
      && nights <= TOO_LONG_FOR_A_STAY;

    // AND IT ONLY GETS A VOTE ON ROWS THAT DO NOT EXIST YET.
    //
    // "CLOSED - Not available" carries no information: Booking.com sends
    // it for a reservation and for a closure alike. Guessing 'confirmed'
    // is the right default for a row nobody has seen — Nina needs to know
    // somebody is arriving. It is the wrong thing to do to a row that has
    // already been classified, because the guess then overwrites a
    // decision using no evidence.
    //
    // That is what started oscillating on TV House id 570, a 2-night
    // CLOSED period: the repair marked it a block, the next sync guessed
    // 'confirmed' and flipped it back, every run. Same disagreement as the
    // original bug — a feed that knows nothing overruling something that
    // knows more — in a new place.
    //
    // So an ambiguous event proposes a status for an INSERT and stays
    // silent on an UPDATE. Airbnb is unaffected: its feed genuinely
    // distinguishes the two, so it always has something to say.
    const ambiguousStatus = bookingComClosed;

    const isManualBlock = !isOwnerStay && !hasReservationUrl && !bookingComClosed && (
      sumTrim === '' || sumTrim === '-' ||
      sumLower.includes('not available') || sumLower.includes('unavailable') ||
      sumLower.includes('closed') || sumLower === 'blocked'
    );

    let status, guestName;
    if (icalStatus === 'CANCELLED') {
      status = 'cancelled';
      guestName = ls.customerName || sumTrim || 'Cancelled';
    } else if (isOwnerStay) {
      status = 'owner';
      guestName = 'Owner Stay — ' + (sumTrim || 'owner');
    } else if (isManualBlock) {
      status = 'blocked';
      guestName = '🔒 Blocked';
    } else {
      status = 'confirmed';
      guestName = ls.customerName || ls.externalRef ||
        (feed.platform === 'booking' ? 'Booking.com Guest' : 'Guest');
    }

    events.push({
      uid,
      // Not a column — stripped before insert, read only by the update
      // path to know this event has no opinion worth acting on.
      ambiguousStatus,
      property_id: feed.property_id,
      property_name: feed.property_name,
      platform: feed.platform,
      guest_name: guestName,
      guest_first_name: guestName.split(' ')[0],
      guest_last_name: guestName.split(' ').slice(1).join(' '),
      check_in_date: checkIn,
      check_out_date: checkOut,
      check_in: checkIn + ' 15:00:00+02',
      check_out: checkOut + ' 10:00:00+02',
      nights,
      number_of_guests: ls.guestCount || 1,
      status,
      is_active: true,
      total_amount: 0,
      currency: 'ZAR',
      source_uid: uid,
      raw_summary: summary,
      raw_description: rawDesc.slice(0, 500),
      guest_email: ls.guestEmail,
      external_ref: ls.externalRef,
    });
  }
  return events;
}

// ── DATA ACCESS ───────────────────────────────────────────────────
// PostgREST over fetch with the service key, matching the convention in
// signup.js and payfast-itn.js rather than pulling supabase-js into a
// serverless function for four queries.

function svc(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function q(key, path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: svc(key) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

async function patch(key, path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...svc(key), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

async function insert(key, table, rows) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...svc(key), Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

const enc = encodeURIComponent;

// ── ONE FEED ──────────────────────────────────────────────────────

export async function importFeed(key, feed, { ownerNames = [], dry = false } = {}) {
  const out = { feed: feed.property_name + ' · ' + feed.platform, events: 0, created: 0, updated: 0, skipped: 0, errors: [] };

  let text;
  try {
    // No proxy: server-side fetch has no CORS to satisfy. 20s because a
    // cold platform feed is slow, not broken.
    const res = await fetch(feed.feed_url, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'HostEasePro/1.0 (+https://hosteasepro.com)' },
    });
    if (!res.ok) { out.errors.push('fetch ' + res.status); return out; }
    text = await res.text();
  } catch (e) {
    out.errors.push('fetch failed: ' + (e && e.message));
    return out;
  }
  if (!text.includes('BEGIN:VCALENDAR')) { out.errors.push('not an iCal document'); return out; }

  const events = parseICalText(text, feed, ownerNames);
  out.events = events.length;
  // An empty parse from a valid calendar is normal (nothing booked). An
  // empty BODY is not, and is handled above — so no error here.

  for (const evt of events) {
    try {
      // ── Match, in the same order the browser does ────────────────
      let existing = null;

      if (evt.uid) {
        const byUid = await q(key,
          `bookings?source_uid=eq.${enc(evt.uid)}&org_id=eq.${feed.org_id}` +
          `&select=id,status,guest_name,number_of_guests,source_uid&limit=1`);
        if (byUid.length) existing = byUid[0];
      }

      if (!existing) {
        const byDates = await q(key,
          `bookings?property_id=eq.${feed.property_id}&check_in_date=eq.${evt.check_in_date}` +
          `&check_out_date=eq.${evt.check_out_date}&platform=eq.${enc(evt.platform)}` +
          `&select=id,status,guest_name,number_of_guests,source_uid&limit=1`);
        if (byDates.length) existing = byDates[0];
      }

      // Blocked-only overlap fallback. Some platforms re-issue a long
      // closure with a fresh UID every time the feed regenerates, so
      // without this a new duplicate row appears on every single sync —
      // and this now runs every fifteen minutes rather than when somebody
      // happens to be logged in, which turns a slow leak into a flood.
      // AND THE SAME PROTECTION HAD TO WIDEN WHEN 'CLOSED' STOPPED BEING
      // A BLOCK. The guard above keyed on evt.status === 'blocked'. The
      // moment Booking.com's "CLOSED - Not available" started arriving as
      // 'confirmed', these events fell straight past it — and Booking.com
      // is precisely the platform that re-issues a period under a fresh
      // UID. That would have reinstated the duplicate flood this guard
      // exists to stop, from the other side.
      //
      // For an ambiguous Booking.com period the status filter also has to
      // go, because the stored row may now be either. Dropping it is safe
      // here and nowhere else: one property cannot hold two overlapping
      // Booking.com reservations, so an overlapping row on the same
      // property and platform IS this period, re-issued.
      let matchedByOverlap = false;
      if (!existing && (evt.status === 'blocked' || evt.ambiguousStatus)) {
        const byOverlap = await q(key,
          `bookings?property_id=eq.${feed.property_id}&platform=eq.${enc(feed.platform)}` +
          (evt.ambiguousStatus ? `&status=in.(blocked,confirmed)` : `&status=eq.blocked`) +
          `&is_active=eq.true` +
          `&check_in_date=lte.${evt.check_out_date}&check_out_date=gte.${evt.check_in_date}` +
          `&select=id,status,guest_name,number_of_guests,source_uid&limit=1`);
        if (byOverlap.length) { existing = byOverlap[0]; matchedByOverlap = true; }
      }

      if (existing) {
        const updates = { is_active: true };
        if (matchedByOverlap) {
          updates.check_in_date = evt.check_in_date;
          updates.check_out_date = evt.check_out_date;
          updates.check_in = evt.check_in;
          updates.check_out = evt.check_out;
          updates.source_uid = evt.uid;
        }
        if (evt.raw_summary) updates.raw_summary = evt.raw_summary;
        if (evt.raw_description) updates.raw_description = evt.raw_description;
        if (evt.guest_email) updates.guest_email = evt.guest_email;
        if (evt.external_ref) updates.external_ref = evt.external_ref;
        if (evt.source_uid && !existing.source_uid) updates.source_uid = evt.source_uid;

        // A cancellation in the feed is always honoured. Every other
        // status change respects what a human did: once somebody has
        // checked a guest in or out, or marked it an owner stay, a
        // calendar feed does not get to overrule them.
        //
        // ── AND A NAME ONLY A HUMAN COULD KNOW COUNTS AS A DECISION ──
        //
        // These next few lines and the guest-name rule below used to
        // contradict each other, and the row ended up believing both. The
        // name rule says "NEVER overwrite a real name a human typed"; the
        // status rule did not list 'confirmed', so the feed was free to
        // demote it. On a Booking.com stay that reads "CLOSED - Not
        // available" in the feed, the result was a booking carrying a real
        // guest name — which only Nicole could have entered, off their
        // emails — and a status saying nobody was coming.
        //
        // Nina then could not see it, said so, and the fifteen-minute cron
        // undid the fix every time it was made. Tiago Borralho was
        // arriving that same afternoon; his row was rewritten at 18:30 and
        // she messaged at 18:56.
        //
        // A feed that cannot name a guest does not get to overrule
        // somebody who can.
        const nameIsHuman = !isPlaceholderName(existing.guest_name);
        const feedWouldDemote = evt.status === 'blocked' && nameIsHuman;

        if (evt.status === 'cancelled') {
          if (existing.status !== 'cancelled') {
            updates.status = 'cancelled';
            updates.cancelled_at = new Date().toISOString();
          }
        } else if (evt.ambiguousStatus) {
          // Booking.com's "CLOSED - Not available" means both things at
          // once, so it has nothing to add about a row that already has a
          // status. Saying nothing is the answer; overwriting on a guess
          // is what made id 570 flip on every run.
        } else if (!['checked-out', 'checked-in', 'owner'].includes(existing.status)
                   && existing.status !== evt.status
                   && !feedWouldDemote) {
          updates.status = evt.status;
        }

        // NEVER overwrite a real name a human typed. Only fill in when
        // what is stored is a placeholder and the feed has something
        // better. Same helper the status rule above uses — they are two
        // halves of one question and used to answer it differently.
        //
        // "Better" is a real name, or anything at all when the row
        // currently has nothing: one LekkeSlaap booking in the data
        // (LS-5XRK4T) arrives with a reference and no Customer line, and
        // a bare reference on screen still beats a blank.
        const storedIsEmpty = !(existing.guest_name || '').trim();
        const feedNameIsBetter = evt.guest_name &&
          (!isPlaceholderName(evt.guest_name) || storedIsEmpty);
        if (!nameIsHuman && feedNameIsBetter) {
          updates.guest_name = evt.guest_name;
          if (!/^LS-[A-Z0-9]+$/i.test(evt.guest_name.trim())) {
            updates.guest_first_name = evt.guest_name.trim().split(' ')[0];
            updates.guest_last_name = evt.guest_name.trim().split(' ').slice(1).join(' ');
          }
        }
        if (evt.number_of_guests > 1 && !(existing.number_of_guests > 1)) {
          updates.number_of_guests = evt.number_of_guests;
        }

        // Nothing beyond the is_active touch: leave the row alone rather
        // than burning a write and a updated_at on every run.
        if (Object.keys(updates).length === 1) { out.skipped++; continue; }
        if (!dry) await patch(key, `bookings?id=eq.${existing.id}`, updates);
        out.updated++;
      } else {
        // Both of these are parse-time signals, not columns. Leaving
        // ambiguousStatus in would make PostgREST reject the whole insert.
        const { uid: _drop, ambiguousStatus: _drop2, ...row } = evt;
        if (!dry) {
          await insert(key, 'bookings', [{
            ...row,
            org_id: feed.org_id,
            payment_status: evt.status === 'cancelled' ? 'cancelled' : 'pending',
            cancelled_at: evt.status === 'cancelled' ? new Date().toISOString() : null,
          }]);
        }
        out.created++;
      }
    } catch (e) {
      // One bad event must not abandon the rest of the feed, or a single
      // malformed row keeps every later booking out of the system.
      out.errors.push(`${evt.check_in_date}: ${(e && e.message) || 'failed'}`);
    }
  }

  if (!dry && !out.errors.length) {
    try {
      await patch(key, `ical_feeds?id=eq.${feed.id}`, { last_import_at: new Date().toISOString() });
    } catch (e) { /* the sync worked; recording that it did is not worth failing over */ }
  }
  return out;
}

// ── EVERY FEED, EVERY AGENCY ──────────────────────────────────────

export async function importAllFeeds(key, { dry = false, orgId = null } = {}) {
  const feeds = await q(key,
    `ical_feeds?is_active=eq.true${orgId ? `&org_id=eq.${orgId}` : ''}` +
    `&select=id,org_id,property_id,platform,feed_url&order=org_id`);

  // Two lookups for the whole run rather than two per feed.
  const props = await q(key, 'properties?select=id,name');
  const nameOf = Object.fromEntries(props.map(p => [p.id, p.name]));

  // Owner-stay names, per org (914). Empty for everybody who has not set
  // one, so no agency inherits another's family — the four first names
  // this replaces were S&N's, hardcoded in shared client code, and they
  // reclassified any other agency's guest of the same name as an owner
  // stay: out of their occupancy, out of their income, silently.
  const settings = await q(key, 'org_settings?select=org_id,owner_stay_names');
  const ownersOf = Object.fromEntries(settings.map(r => [r.org_id, r.owner_stay_names || []]));

  const results = [];
  for (const f of feeds) {
    if (!f.feed_url) continue;
    results.push(await importFeed(key, {
      ...f,
      property_name: nameOf[f.property_id] || 'Property',
    }, { dry, ownerNames: ownersOf[f.org_id] || [] }));
  }
  return results;
}
