-- 160_cleanup_ical_horizon_junk.sql
-- Runs on BOTH databases — production too. See incident note below.
--
-- INCIDENT: Booking.com's TV House feed emits a rolling "nothing bookable
-- beyond this horizon" marker as a fake several-month 'blocked' event, with
-- a fresh UID every single day. syncICalFeeds() could never match it to a
-- prior row (new UID daily, and the date range itself also shifts daily),
-- so every sync run inserted a brand new junk row and let the previous
-- day's row go stale (is_active=false via the sweep). Confirmed on staging:
-- 73 such rows, one property/platform (TV House booking.com) — Speranta's
-- own booking.com feed shows none of this. Staging was mirrored from
-- production, and production's sync has been running far longer than
-- staging's post-mirror history, so production almost certainly has the
-- same junk accumulating right now. Root cause fixed in demo/index_fixed.html
-- (parseICalText skips any event over 120 nights outright, never importing
-- it as a booking) — this migration is the one-time cleanup of what already
-- accumulated before that fix shipped.
--
-- Scoped generally (not just TV House/booking.com) since the same fix in
-- the parser applies to every feed — if another platform/property ever hit
-- the same pattern, this clears it too. No genuine stay or deliberate
-- manual block in this app is anywhere near 120 nights.

DELETE FROM public.bookings
WHERE status = 'blocked' AND (check_out_date - check_in_date) > 120;

-- End 160_cleanup_ical_horizon_junk.
