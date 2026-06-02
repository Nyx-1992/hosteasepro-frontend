const https = require('https');
const url_module = require('url');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FEEDS = [
  { property_id: 'e9737638-d83a-4947-940a-8746789e4d9f', property_name: 'Speranta Flat', platform: 'booking',
    url: 'https://ical.booking.com/v1/export?t=8123e217-45b4-403d-8fa0-9dcc65c26800' },
  { property_id: 'e9737638-d83a-4947-940a-8746789e4d9f', property_name: 'Speranta Flat', platform: 'airbnb',
    url: 'https://www.airbnb.com/calendar/ical/1237076374831130516.ics?s=01582d0497e99114aa6013156146cea4' },
  { property_id: 'e9737638-d83a-4947-940a-8746789e4d9f', property_name: 'Speranta Flat', platform: 'lekkeslaap',
    url: 'https://www.lekkeslaap.co.za/suppliers/icalendar.ics?t=bXEzOHNicTJQT3Nkd1dHb1ZSaXhRUT09' },
  { property_id: '83b2a84a-5451-4be5-a84f-2efc0d2602d5', property_name: 'TV House', platform: 'booking',
    url: 'https://ical.booking.com/v1/export?t=ea29c451-4d0b-4fa4-b7a8-e879a33a8940' },
  { property_id: '83b2a84a-5451-4be5-a84f-2efc0d2602d5', property_name: 'TV House', platform: 'airbnb',
    url: 'https://www.airbnb.com/calendar/ical/1402174824640448492.ics?s=373c5a71c137230a72f928e88728dcf3' },
  { property_id: '83b2a84a-5451-4be5-a84f-2efc0d2602d5', property_name: 'TV House', platform: 'lekkeslaap',
    url: 'https://www.lekkeslaap.co.za/suppliers/icalendar.ics?t=QzZ2aFlFVHhxYnoxdGRVL3ZwelRGUT09' },
];

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function fetchUrl(rawUrl, redirects, baseUrl) {
  redirects = redirects || 0;
  return new Promise(function(resolve, reject) {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    var fullUrl = baseUrl ? url_module.resolve(baseUrl, rawUrl) : rawUrl;
    var parsed;
    try { parsed = new URL(fullUrl); } catch(e) { return reject(new Error('Invalid URL: ' + fullUrl)); }
    var options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HEP-iCal-Sync/2.0)',
        'Accept': 'text/calendar, application/calendar+xml, */*',
      }
    };
    var req = https.request(options, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, redirects + 1, fullUrl).then(resolve).catch(reject);
      }
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { resolve(data); });
    });
    req.on('error', reject);
    req.setTimeout(20000, function() { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function supabaseRequest(method, path, body) {
  return new Promise(function(resolve, reject) {
    var parsed = new URL(SUPABASE_URL);
    var payload = body ? JSON.stringify(body) : null;
    var headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    var options = {
      hostname: parsed.hostname,
      path: '/rest/v1/' + path,
      method: method,
      headers: headers
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve({ status: res.statusCode, data: JSON.parse(data || '[]'), raw: data }); }
        catch(e) { resolve({ status: res.statusCode, data: [], raw: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── iCal parsing ──────────────────────────────────────────────────────────────

function unfold(text) {
  // RFC 5545: lines folded with CRLF/LF + whitespace = logical continuation
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function parseDate(str) {
  if (!str) return '';
  var s = str.replace(/[TZ]/g, '').replace(/[+-]\d{4}$/, '');
  return s.slice(0,4) + '-' + s.slice(4,6) + '-' + s.slice(6,8);
}

// Parse LekkeSlaap SUMMARY fields — literal \n as delimiter
// e.g. "Reference: LS-5W38B2 \nCustomer: Angela Nuttall \nEmail: angela@x.com \nGuests: 2"
function parseLSSummary(raw) {
  var result = { ref: null, customer: null, email: null, guests: null };
  if (!raw) return result;
  var parts = raw.split(/\s*\\n/).map(function(s) { return s.trim(); }).filter(Boolean);
  parts.forEach(function(part) {
    var refM   = part.match(/^Reference:\s*(LS-[A-Z0-9]+)/i);
    var bareM  = part.match(/^(LS-[A-Z0-9]+)$/i);
    var custM  = part.match(/^Customer:\s*(.+)$/i);
    var emailM = part.match(/^Email:\s*(.+)$/i);
    var guestM = part.match(/^Guests?:\s*(\d+)$/i);
    if (refM)   result.ref      = refM[1];
    if (bareM)  result.ref      = bareM[1];
    if (custM)  result.customer = custM[1].trim();
    if (emailM) result.email    = emailM[1].trim();
    if (guestM) result.guests   = parseInt(guestM[1], 10);
  });
  return result;
}

function parseICal(text, feed) {
  var unfolded = unfold(text);
  var events = [];
  var blocks = unfolded.split('BEGIN:VEVENT');

  for (var i = 1; i < blocks.length; i++) {
    var block = blocks[i];
    var get = function(key) {
      var m = block.match(new RegExp(key + '[^:]*:([^\r\n]+)'));
      return m ? m[1].trim() : '';
    };

    var checkIn     = parseDate(get('DTSTART'));
    var checkOut    = parseDate(get('DTEND'));
    var summary     = get('SUMMARY') || '';
    var rawDesc     = get('DESCRIPTION') || '';
    var uid         = get('UID') || '';
    var icalStatus  = (get('STATUS') || '').toUpperCase();
    var desc        = rawDesc.toLowerCase();

    if (!checkIn || !checkOut || checkIn >= checkOut) continue;

    var nights  = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000);
    var sumLow  = summary.toLowerCase();
    var sumTrim = summary.trim();

    // ── Classify ────────────────────────────────────────────────────────────
    var isCancelledByStatus = icalStatus === 'CANCELLED';

    var isOwner = sumLow.indexOf('mirka') >= 0 || sumLow.indexOf('antonin') >= 0 ||
                  sumLow.indexOf('nicole') >= 0 || sumLow.indexOf('silja') >= 0 ||
                  sumLow.indexOf('owner') >= 0 || desc.indexOf('owner') >= 0;

    var isBlocked = !isOwner && (
      !sumTrim || sumTrim === '-' ||
      sumLow === 'not available' || sumLow.indexOf('not available') >= 0 ||
      sumLow.indexOf('closed') >= 0 || sumLow.indexOf('airbnb (not available)') >= 0 ||
      sumLow.indexOf('booking.com (not available)') >= 0 ||
      sumLow.indexOf('reserved') >= 0 || sumLow.indexOf('unavailable') >= 0 ||
      sumLow === 'blocked'
    );

    // ── Parse LekkeSlaap structured fields ──────────────────────────────────
    var ls = parseLSSummary(summary);

    // ── Determine status + guest name ────────────────────────────────────────
    var status, guestName, guestEmail, externalRef, guestCount;

    if (isCancelledByStatus) {
      status    = 'cancelled';
      guestName = ls.customer || sumTrim || 'Cancelled';
    } else if (isOwner) {
      status    = 'owner';
      guestName = 'Owner Stay — ' + (
        (sumLow.indexOf('mirka') >= 0 || sumLow.indexOf('antonin') >= 0) ? 'Mirka & Antonin' :
        (sumLow.indexOf('nicole') >= 0 || sumLow.indexOf('silja') >= 0)  ? 'Nicole & Silja'  :
        summary
      );
    } else if (isBlocked) {
      status    = 'blocked';
      guestName = 'Blocked';
    } else {
      status    = 'confirmed';
      guestName = ls.customer || ls.ref || summary || 'Guest';
    }

    guestEmail   = ls.email   || null;
    externalRef  = ls.ref     || null;
    guestCount   = ls.guests  || 1;

    events.push({
      property_id:      feed.property_id,
      property_name:    feed.property_name,
      platform:         feed.platform,
      guest_name:       guestName,
      guest_first_name: guestName.split(' ')[0],
      guest_last_name:  guestName.split(' ').slice(1).join(' '),
      check_in_date:    checkIn,
      check_out_date:   checkOut,
      check_in:         checkIn  + ' 15:00:00+02',
      check_out:        checkOut + ' 10:00:00+02',
      nights:           nights,
      number_of_guests: guestCount,
      status:           status,
      is_active:        true,
      org_id:           '5966bc67-5c2f-45ae-8519-9b7eaeee09f4',
      total_amount:     0,
      payment_status:   isCancelledByStatus ? 'cancelled' : 'pending',
      currency:         'ZAR',
      source_uid:       uid || null,
      raw_summary:      summary || null,
      raw_description:  rawDesc.slice(0, 500) || null,
      guest_email:      guestEmail,
      external_ref:     externalRef,
      cancelled_at:     isCancelledByStatus ? new Date().toISOString() : null,
    });
  }
  return events;
}

// ── Name placeholder detection ────────────────────────────────────────────────
function isPlaceholderName(name) {
  if (!name || name === 'Guest' || name === 'Blocked') return true;
  if (/^LS-[A-Z0-9]+$/i.test(name.trim())) return true;
  if (name.startsWith('Reference:')) return true;
  if (name.indexOf('\\n') >= 0) return true;
  return false;
}

// ── Main sync ─────────────────────────────────────────────────────────────────
async function run() {
  var totalNew = 0, totalUpdated = 0, totalCancelled = 0, errors = 0;

  for (var fi = 0; fi < FEEDS.length; fi++) {
    var feed = FEEDS[fi];
    try {
      console.log('Fetching ' + feed.platform + ' / ' + feed.property_name + '...');
      var text = await fetchUrl(feed.url, 0, feed.url);

      if (text.indexOf('BEGIN:VCALENDAR') < 0) {
        console.warn('  Not valid iCal — skipping');
        errors++;
        continue;
      }

      var events = parseICal(text, feed);
      console.log('  ' + events.length + ' events parsed');

      for (var ei = 0; ei < events.length; ei++) {
        var evt = events[ei];

        // ── Step 1: Try UID match ──────────────────────────────────────────
        var existing = null;
        if (evt.source_uid) {
          var byUid = await supabaseRequest('GET',
            'bookings?source_uid=eq.' + encodeURIComponent(evt.source_uid) +
            '&select=id,status,guest_name,number_of_guests,source_uid&limit=1', null);
          if (byUid.data && byUid.data.length > 0) existing = byUid.data[0];
        }

        // ── Step 2: Fallback — match by dates + property + platform ───────
        if (!existing) {
          var qs = 'property_id=eq.' + evt.property_id +
                   '&check_in_date=eq.'  + evt.check_in_date +
                   '&check_out_date=eq.' + evt.check_out_date +
                   '&platform=eq.'       + evt.platform +
                   '&select=id,status,guest_name,number_of_guests,source_uid&limit=1';
          var byDates = await supabaseRequest('GET', 'bookings?' + qs, null);
          if (byDates.data && byDates.data.length > 0) existing = byDates.data[0];
        }

        if (existing) {
          // ── UPDATE ────────────────────────────────────────────────────────
          var updates = { is_active: true };

          // Always store raw iCal fields
          if (evt.raw_summary)     updates.raw_summary     = evt.raw_summary;
          if (evt.raw_description) updates.raw_description = evt.raw_description;
          if (evt.guest_email)     updates.guest_email     = evt.guest_email;
          if (evt.external_ref)    updates.external_ref    = evt.external_ref;
          if (evt.source_uid && !existing.source_uid) updates.source_uid = evt.source_uid;

          // Cancellation always wins
          if (evt.status === 'cancelled' && existing.status !== 'cancelled') {
            updates.status       = 'cancelled';
            updates.cancelled_at = new Date().toISOString();
            totalCancelled++;
            console.log('  ✗ Cancelled: ' + existing.id + ' (' + evt.check_in_date + ')');
          } else if (['checked-out','checked-in','owner'].indexOf(existing.status) < 0) {
            if (existing.status !== evt.status) updates.status = evt.status;
          }

          // Only update name if current is a placeholder
          if (isPlaceholderName(existing.guest_name) && !isPlaceholderName(evt.guest_name)) {
            updates.guest_name       = evt.guest_name;
            updates.guest_first_name = evt.guest_name.split(' ')[0];
            updates.guest_last_name  = evt.guest_name.split(' ').slice(1).join(' ');
          }

          // Update guest count if we now know it
          if (evt.number_of_guests > 1 && (!existing.number_of_guests || existing.number_of_guests <= 1)) {
            updates.number_of_guests = evt.number_of_guests;
          }

          await supabaseRequest('PATCH', 'bookings?id=eq.' + existing.id, updates);
          totalUpdated++;

        } else {
          // ── INSERT ────────────────────────────────────────────────────────
          var result = await supabaseRequest('POST', 'bookings', evt);
          if (result.status >= 200 && result.status < 300) {
            totalNew++;
            console.log('  + New: ' + evt.guest_name + ' ' + evt.check_in_date + ' → ' + evt.check_out_date + ' (' + evt.platform + ')');
          } else {
            console.error('  Insert failed ' + result.status + ': ' + result.raw.slice(0, 200));
          }
        }
      }

    } catch(e) {
      console.error('  Feed error (' + feed.platform + ' / ' + feed.property_name + '): ' + e.message);
      errors++;
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────');
  console.log('New:       ' + totalNew);
  console.log('Updated:   ' + totalUpdated);
  console.log('Cancelled: ' + totalCancelled);
  console.log('Errors:    ' + errors + ' / ' + FEEDS.length + ' feeds');

  if (errors > 0) process.exit(1);
}

run().catch(function(e) { console.error(e); process.exit(1); });
