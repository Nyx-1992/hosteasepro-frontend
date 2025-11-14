-- verification.sql
-- Run these queries in Supabase SQL editor after CI workflow completes and seeds executed.

-- 1. Tables present (core + feeds + financial + checklist)
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN (
  'organizations','properties','bookings','booking_checklists','contacts','ical_feeds','financial_transactions','tasks','domestic_services','user_profiles'
) ORDER BY table_name;

-- 2. Organization & user profiles
SELECT * FROM public.organizations;
SELECT u.email, p.role, p.org_id FROM public.user_profiles p JOIN auth.users u ON u.id = p.user_id;

-- 3. Properties
SELECT id, name, org_id, status FROM public.properties;

-- 4. iCal feeds
SELECT platform, property_id, is_active, last_import_at FROM public.ical_feeds;

-- 5. Bookings sample
SELECT id, property_id, platform, check_in, check_out, status FROM public.bookings ORDER BY check_in DESC LIMIT 25;

-- 6. Checklist progress view exists?
SELECT * FROM public.booking_checklist_status LIMIT 10;

-- 7. Financial monthly summary view exists?
SELECT * FROM public.financial_monthly_summary LIMIT 5;

-- 8. RLS sanity: attempt selecting ical_feeds without admin (should fail for non-admin user)
-- (Manually test by logging in with a non-admin session and querying ical_feeds.)

-- 9. Overlap uniqueness test (optional)
-- Try inserting a duplicate booking span to confirm unique indexes block it.
-- INSERT INTO public.bookings (org_id, property_id, platform, check_in, check_out) VALUES (...);

-- 10. Financial monthly aggregation sanity
SELECT month_start, income_total, expense_total, net_total
FROM public.financial_monthly_summary
ORDER BY month_start DESC LIMIT 12;

-- End of verification checklist.
