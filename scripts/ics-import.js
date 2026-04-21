const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

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

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'HEP-iCal-Sync/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function parseDate(str) {
  if (!str) return '';
  const s = str.replace(/[TZ]/g, '').replace(/[+-]\d{4}$/, '');
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
}

function parseICal(text, feed) {
  const events = [];
  const blocks = text.split('BEGIN:VEVENT');
  for (const block of blocks.slice(1)) {
    const get = key => { const m = block.match(new RegExp(key + '[^:]*:([^\r\n]+')); return m ? m[1].trim() : ''; };
    const checkIn  = parseDate(get('DTSTART'));
    const checkOut = parseDate(get('DTEND'));
    const summary  = get('SUMMARY') || '';
    const uid      = get('UID') || '';
    if (!checkIn || !checkOut || checkIn >= checkOut) continue;

    const s = summary.toLowerCase();
    const isOwner   = s.includes('mirka') || s.includes('antonin') || s.includes('nicole') || s.includes('silja') || s.includes('owner');
    const isBlocked = !isOwner && (summary.trim() === '-' || summary.trim() === '' || s.includes('not available') || s.includes('closed') || s.includes('reserved') || s.includes('blocked') || s.includes('unavailable'));

    let status    = isOwner ? 'owner' : isBlocked ? 'blocked' : 'confirmed';
    let guestName = isOwner ? ('Owner Stay — ' + (s.includes('mirka') || s.includes('antonin') ? 'Mirka & Antonin' : 'Nicole & Silja')) : isBlocked ? 'Blocked' : (summary || 'Guest');

    events.push({
      source_uid: uid, property_id: feed.property_id, property_name: feed.property_name,
      platform: feed.platform, guest_name: guestName,
      guest_first_name: guestName.split(' ')[0], guest_last_name: guestName.split(' ').slice(1).join(' '),
      check_in_date: checkIn, check_out_date: checkOut,
      check_in: `${checkIn} 15:00:00+02`, check_out: `${checkOut} 10:00:00+02`,
      nights: Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000),
      status, is_active: true, total_amount: 0, currency: 'ZAR', number_of_guests: 1,
    });
  }
  return events;
}

async function run() {
  let totalNew = 0, totalUpdated = 0, errors = 0;

  for (const feed of FEEDS) {
    try {
      console.log(`Fetching ${feed.platform} / ${feed.property_name}...`);
      const text = await fetchUrl(feed.url);
      if (!text.includes('BEGIN:VCALENDAR')) { console.warn('  ❌ Not valid iCal'); errors++; continue; }
      const events = parseICal(text, feed);
      console.log(`  ✅ ${events.length} events`);

      for (const evt of events) {
        const { data: existing } = await db.from('bookings')
          .select('id, status, guest_name, is_active')
          .eq('property_id', evt.property_id)
          .eq('check_in_date', evt.check_in_date)
          .eq('check_out_date', evt.check_out_date)
          .eq('platform', evt.platform)
          .limit(1);

        if (existing && existing.length > 0) {
          const ex = existing[0];
          const updates = { is_active: true };
          if (!ex.guest_name || ex.guest_name === 'Guest') updates.guest_name = evt.guest_name;
          if (!['cancelled','checked-out','checked-in','owner'].includes(ex.status)) updates.status = evt.status;
          await db.from('bookings').update(updates).eq('id', ex.id);
          totalUpdated++;
        } else {
          const { error } = await db.from('bookings').insert([evt]);
          if (error) console.error('  Insert error:', error.message);
          else totalNew++;
        }
      }
    } catch (e) {
      console.error(`  ❌ Feed error: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n✅ Done: ${totalNew} new · ${totalUpdated} updated · ${errors} errors`);
  if (errors > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
