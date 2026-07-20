-- 240_staging_restore_hassad_aly_booking.sql
-- STAGING ONLY.
--
-- Data correction, not a schema change. Booking id 573 (Hassad Aly, TV
-- House, 2026-07-15 -> 2026-07-20) was auto-cancelled by the same
-- false-positive iCal sync incident investigated earlier this session on
-- production. That incident's restore SQL was only ever applied to
-- production — staging has its own independent booking history and was
-- never restored, which is why staging's dashboard showed "Today's
-- Check-outs: 0" for 2026-07-20 while production correctly showed one.
--
-- This mirrors production's current (already-correct) values for this
-- row: status='confirmed', is_active=true, cancelled_at cleared.

UPDATE public.bookings
SET status = 'confirmed',
    is_active = true,
    cancelled_at = NULL
WHERE id = 573
  AND property_id = '83b2a84a-5451-4be5-a84f-2efc0d2602d5'
  AND guest_name = 'Hassad Aly';

-- End 240_staging_restore_hassad_aly_booking.
