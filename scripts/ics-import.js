const https = require('https');

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

function fetchUrl(rawUrl, redirects) {
  redirects = redirects || 0;
  return new Promise(function(resolve, reject) {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    var parsed;
    try { parsed = new URL(rawUrl); } catch(e) { return reject(new Error('Invalid URL: ' + rawUrl)); }
    var options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { 'User-Agent': 'HEP-iCal-Sync/1.0' }
    };
    var req = https.request(options, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, redirects + 1).then(resolve).catch(reject);
      }
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { resolve(data); });
    });
    req.on('error', reject);
    req.setTimeout(15000, function() { req.destroy(); reject(new Error('Timeout')); });
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

function parseDate(str) {
  if (!str) return '';
  var s = str.replace(/[TZ]/g, '').replace(/[+-]\d{4}$/, '');
  return s.slice(0,4) + '-' + s.slice(4,6) + '-' + s.slice(6,8);
}

function parseICal(text, feed) {
  var events = [];
  var blocks = text.split('BEGIN:VEVENT');
  for (var i = 1; i < blocks.length; i++) {
    var block = blocks[i];
    var get = function(key) {
      var m = block.match(new RegExp(key + '[^:]*:([^\r\n]+)'));
      return m ? m[1].trim() : '';
    };
    var checkIn  = parseDate(get('DTSTART'));
    var checkOut = parseDate(get('DTEND'));
    var summary  = get('SUMMARY') || '';
    if (!checkIn || !checkOut || checkIn >= checkOut) continue;
    var s = summary.toLowerCase();
    var isOwner   = s.indexOf('mirka') >= 0 || s.indexOf('antonin') >= 0 || s.indexOf('nicole') >= 0 || s.indexOf('silja') >= 0 || s.indexOf('owner') >= 0;
    var isBlocked = !isOwner && (!summary.trim() || summary.trim() === '-' || s.indexOf('not available') >= 0 || s.indexOf('closed') >= 0 || s.indexOf('reserved') >= 0 || s.indexOf('blocked') >= 0 || s.indexOf('unavailable') >= 0);
    var status    = isOwner ? 'owner' : isBlocked ? 'blocked' : 'confirmed';
    var guestName = isOwner ? 'Owner Stay' : isBlocked ? 'Blocked' : (summary || 'Guest');
    var nights    = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000);
    events.push({
      property_id:      feed.property_id,
      property_name:    feed.property_name,
      platform:         feed.platform,
      guest_name:       guestName,
      guest_first_name: guestName.split(' ')[0],
      guest_last_name:  guestName.split(' ').slice(1).join(' '),
      check_in_date:    checkIn,
      check_out_date:   checkOut,
      check_in:         checkIn + ' 15:00:00+02',
      check_out:        checkOut + ' 10:00:00+02',
      nights:           nights,
      number_of_guests: 1,
      status:           status,
      is_active:        true,
      total_amount:     0,
      payment_status:   'pending',
      currency:         'ZAR'
    });
  }
  return events;
}

async function run() {
  var totalNew = 0, totalUpdated = 0, errors = 0;

  for (var fi = 0; fi < FEEDS.length; fi++) {
    var feed = FEEDS[fi];
    try {
      console.log('Fetching ' + feed.platform + ' / ' + feed.property_name + '...');
      var text = await fetchUrl(feed.url);
      if (text.indexOf('BEGIN:VCALENDAR') < 0) {
        console.warn('  Not valid iCal');
        errors++;
        continue;
      }
      var events = parseICal(text, feed);
      console.log('  ' + events.length + ' events parsed');

      for (var ei = 0; ei < events.length; ei++) {
        var evt = events[ei];
        var qs = 'property_id=eq.' + evt.property_id +
                 '&check_in_date=eq.' + evt.check_in_date +
                 '&check_out_date=eq.' + evt.check_out_date +
                 '&platform=eq.' + evt.platform +
                 '&select=id,status,guest_name&limit=1';

        var existing = await supabaseRequest('GET', 'bookings?' + qs, null);

        if (existing.data && existing.data.length > 0) {
          var ex = existing.data[0];
          var updates = { is_active: true };
          if (!ex.guest_name || ex.guest_name === 'Guest') updates.guest_name = evt.guest_name;
          if (['cancelled','checked-out','checked-in','owner'].indexOf(ex.status) < 0) updates.status = evt.status;
          await supabaseRequest('PATCH', 'bookings?id=eq.' + ex.id, updates);
          totalUpdated++;
        } else {
          var result = await supabaseRequest('POST', 'bookings', evt);
          if (result.status >= 200 && result.status < 300) {
            totalNew++;
            console.log('  + New: ' + evt.guest_name + ' ' + evt.check_in_date + ' -> ' + evt.check_out_date);
          } else {
            console.error('  Insert failed ' + result.status + ': ' + result.raw.slice(0, 300));
          }
        }
      }
    } catch(e) {
      console.error('  Feed error: ' + e.message);
      errors++;
    }
  }

  console.log('\nDone: ' + totalNew + ' new, ' + totalUpdated + ' updated, ' + errors + ' errors');
  if (errors > 0) process.exit(1);
}

run().catch(function(e) { console.error(e); process.exit(1); });
