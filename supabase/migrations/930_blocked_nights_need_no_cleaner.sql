-- Blocked nights must not generate daily-service cleans.
--
-- HEP can now hold nights back from sale ("Blocked — not bookable" in the
-- New Booking form), which is how an agency keeps the night after a checkout
-- free when the clean only happens the following day.
--
-- generate_daily_service() walks every active, non-cancelled, non-owner-block
-- booking and schedules a daily service for each night BETWEEN check-in and
-- check-out. It had no opinion about status='blocked', so a block would send
-- a cleaner to service an empty flat for every night it covered.
--
-- Dormant on S&N today — both properties have daily_service = false, and a
-- one-night block generates an empty series anyway (GREATEST(in+1) is already
-- past LEAST(out-1)). It bites the first agency that turns daily service on
-- and blocks a week for maintenance, which is exactly who this feature is
-- for. Fixing the predicate is cheaper than the callout.
--
-- Only the booking filter changes; everything else is migration 922's version
-- verbatim, including the service_role/org-member guard.

CREATE OR REPLACE FUNCTION public.generate_daily_service(
  p_org uuid, p_from date, p_to date, p_cleaner text DEFAULT ''::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE n int;
BEGIN
  IF COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
     AND NOT (auth.uid() IS NOT NULL AND public.is_org_member(p_org)) THEN
    RAISE EXCEPTION 'Not permitted.' USING ERRCODE = '42501';
  END IF;
  IF p_to < p_from THEN
    RAISE EXCEPTION 'End date is before the start date.' USING ERRCODE = '22023';
  END IF;
  IF p_to - p_from > 92 THEN
    RAISE EXCEPTION 'Generate at most a quarter at a time.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.domestics (org_id, property_id, date, type, status, cleaner)
  SELECT p_org, pr.short_key, d::date, 'daily_service', 'scheduled', COALESCE(p_cleaner, '')
    FROM public.properties pr
    JOIN public.bookings b
      ON b.property_id = pr.id
     AND b.is_active
     AND COALESCE(b.status, '') <> 'cancelled'
     AND COALESCE(b.status, '') <> 'blocked'
     AND COALESCE(b.is_owner_block, false) = false
    CROSS JOIN LATERAL generate_series(
      GREATEST(b.check_in_date::date + 1, p_from),
      LEAST(b.check_out_date::date - 1, p_to),
      interval '1 day') d
   WHERE pr.org_id = p_org
     AND pr.daily_service
     AND pr.short_key IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.domestics x
        WHERE x.org_id = p_org AND x.property_id = pr.short_key AND x.date = d::date
          AND COALESCE(x.status, '') <> 'cancelled'
     );

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;
