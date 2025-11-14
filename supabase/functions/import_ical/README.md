# import_ical Edge Function

Imports booking events from stored iCal feeds in `public.ical_feeds` and upserts into `public.bookings`.

## Deploy
```bash
supabase functions deploy import_ical --project-ref <project-ref>
```

## Invoke
```bash
curl -X POST "https://<project-ref>.functions.supabase.co/import_ical" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
```

## Scheduling
Use Supabase Dashboard > Edge Functions > Schedule (or `supabase functions schedule create`) to run every hour/day:
```bash
supabase functions schedule create import_ical --project-ref <project-ref> --cron "0 * * * *"
```

## Security
- iCal feed URLs are in `public.ical_feeds` with admin-only RLS policies.
- Edge function requires service role key (do NOT expose to clients).

## Extending
- Add amount parsing by matching summary patterns.
- Record `last_import_at` via an UPDATE after successful import.
- Implement removal/archiving for cancelled events.
