/* ICS Import Script */
const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEBUG = process.env.DEBUG === '1';
if (!SUPABASE_URL || !KEY) {
  console.warn('[ICS] Skipping import: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(0); // Graceful skip so workflow does not fail
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function api(path, { method='GET', body=null, query='' }={}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}${query}`;
  const opts = { method, headers: { ...headers } };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    // Merge duplicates when posting bookings; minimal return
    if (path === 'bookings' && method === 'POST') {
      opts.headers['Prefer'] = 'resolution=merge-duplicates,return=minimal';
    } else {
      opts.headers['Prefer'] = 'return=minimal';
    }
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${method} ${path} ${r.status} :: ${text.substring(0,500)}`);
  }
  return method === 'GET' ? r.json() : null;
}

function unfold(ics) { return ics.replace(/\r?\n[ \t]/g,''); }
function parseICS(ics) {
  const lines = unfold(ics).split(/\r?\n/);
  const events=[]; let cur=null;
  for (const line of lines) {
    if (line==='BEGIN:VEVENT') cur={};
    else if (line==='END:VEVENT') { if (cur?.DTSTART && cur?.DTEND) events.push(cur); cur=null; }
    else if (/^DTSTART/.test(line)) cur.DTSTART=line.split(':')[1];
    else if (/^DTEND/.test(line)) cur.DTEND=line.split(':')[1];
    else if (/^SUMMARY:/.test(line)) cur.SUMMARY=line.substring(8).trim();
  }
  return events;
}
function toTs(v){
  if (!v) return null;
  if (/^\d{8}$/.test(v)) return `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T00:00:00Z`;
  return /Z$/.test(v)?v:v+'Z';
}
function guest(summary){
  if(!summary) return {first:null,last:null};
  summary = summary.replace(/^Reservation:\s*/i,'').trim();
  const parts = summary.split(/\s+/);
  if (parts.length===1) return {first:parts[0],last:null};
  return {first:parts[0],last:parts.slice(1).join(' ')};
}

(async () => {
  const feeds = await api('ical_feeds',{query:'?select=id,org_id,property_id,platform,feed_url&is_active=eq.true'});
  const props = await api('properties',{query:'?select=id,name'});
  const propName = Object.fromEntries(props.map(p=>[p.id,p.name]));

  const rows=[];
  for (const f of feeds) {
    try {
      if (DEBUG) console.log(`[ICS] Fetching feed ${f.id} platform=${f.platform} url=${f.feed_url}`);
      const rf = await fetch(f.feed_url);
      if(!rf.ok){ console.warn(JSON.stringify({feed_id:f.id,status:rf.status,url:f.feed_url})); continue; }
      const events = parseICS(await rf.text());
      if (DEBUG) console.log(`[ICS] Parsed ${events.length} events from feed ${f.id}`);
      for (const ev of events) {
        const ci = toTs(ev.DTSTART); const co = toTs(ev.DTEND);
        if(!ci || !co) continue;
        const g = guest(ev.SUMMARY);
        rows.push({
          org_id: f.org_id,
          property_id: f.property_id,
          platform: f.platform,
          guest_first_name: g.first,
          guest_last_name: g.last,
          check_in: ci,
          check_out: co,
          status: 'confirmed',
          currency: 'ZAR'
        });
      }
      await api('ical_feeds',{method:'PATCH',body:{ last_import_at: new Date().toISOString() },query:`?id=eq.${f.id}`});
    } catch(e) {
      console.error('[ICS] Feed error', f.id, e.message);
      if (DEBUG) console.error(e.stack);
    }
  }

  const map=new Map();
  for (const r of rows) {
    const k=`${r.property_id}|${r.platform}|${r.check_in}|${r.check_out}`;
    if(!map.has(k)) map.set(k,r);
  }
  const finalRows=[...map.values()];

  let upsertErrors = 0;
  for(let i=0;i<finalRows.length;i+=300){
    const batch = finalRows.slice(i,i+300);
    if (DEBUG) console.log(`[ICS] Upserting batch size=${batch.length} offset=${i}`);
    try {
      await api('bookings',{method:'POST',body:batch,query:'?on_conflict=org_id,property_id,platform,check_in,check_out'});
    } catch(e) {
      upsertErrors++;
      console.error('[ICS] Upsert batch error (will continue):', e.message);
      if (/on conflict/i.test(e.message)) {
        console.warn('[ICS] Hint: unique constraint mismatch. Verify actual unique index columns for bookings.');
      }
    }
  }

  const nowIso = new Date().toISOString();
  const existing = await api('bookings',{query:`?select=id,property_id,platform,check_in,check_out,source_removed&check_in=gte.${nowIso}&source_removed=is.false`});
  const newKeys = new Set(finalRows.map(r=>`${r.property_id}|${r.platform}|${r.check_in}|${r.check_out}`));
  const toArchive = existing.filter(b=>!newKeys.has(`${b.property_id}|${b.platform}|${b.check_in}|${b.check_out}`)).map(b=>b.id);

  console.log('Archive candidates raw', JSON.stringify(toArchive));
  const cleanIds = toArchive.filter(id => Number.isInteger(id));
  if (cleanIds.length !== toArchive.length) {
    console.warn('Non-integer IDs detected, filtered out:', toArchive.filter(id => !Number.isInteger(id)));
  }
  if (cleanIds.length) {
    const filter = `id=in.(${cleanIds.join(',')})`;
    console.log('PATCH filter', filter);
    await api('bookings',{method:'PATCH',body:{ source_removed:true },query:`?${filter}`});
  } else {
    console.log('No bookings to archive');
  }

  console.log(JSON.stringify({
    feeds_processed: feeds.length,
    events_raw: rows.length,
    events_dedup: finalRows.length,
    bookings_soft_removed: cleanIds.length,
    upsert_batch_errors: upsertErrors
  }, null, 2));
})().catch(e => {
  console.error('[ICS] Fatal error:', e.stack || e.message);
  process.exit(1);
});
