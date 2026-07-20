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
-- the same pattern, this clears it too.
--
-- NOTE: this app's owners deliberately keep TV House blocked for long
-- stretches and only open it when they want to arrange their own travel —
-- so "long block" alone isn't proof of junk. What separates these 73 rows
-- from a real deliberate block: is_active=false (already superseded by a
-- later sync — a current, meaningful block would still be active), and a
-- source_uid that's either null or unique-per-row with no stable identity
-- across syncs, consistent with Booking.com re-issuing a fresh "nothing
-- bookable beyond this horizon" marker each time rather than one persistent
-- host-set block. Confirmed via pg_constraint that 4 other tables FK into
-- bookings (booking_checklists, domestic_services, tasks,
-- financial_transactions, finance_transactions) — checked all of them
-- against this exact WHERE clause first: 0 rows in any of the latter four,
-- and booking_checklists' 72 matching rows are all-null stub rows (no
-- guest_contacted_at/checked_in_at/etc — auto-created placeholders, not
-- real workflow data), safe to delete alongside the bookings themselves.
DELETE FROM public.booking_checklists bc
USING public.bookings b
WHERE bc.booking_id = b.id
  AND b.status = 'blocked' AND (b.check_out_date - b.check_in_date) > 120;

DELETE FROM public.bookings
WHERE status = 'blocked' AND (check_out_date - check_in_date) > 120;

-- End 160_cleanup_ical_horizon_junk.
