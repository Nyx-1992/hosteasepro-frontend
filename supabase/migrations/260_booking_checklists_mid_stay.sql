-- 260_booking_checklists_mid_stay.sql
-- Runs on BOTH databases.
--
-- Adds the one new touchpoint booking_checklists didn't already have.
-- The other three Guest Timeline stages (pre-arrival, check-in day,
-- post-stay) reuse existing columns (guest_contacted_at, checked_in_at,
-- follow_up_sent_at) — this is the only schema change B1 needs.

ALTER TABLE public.booking_checklists
  ADD COLUMN IF NOT EXISTS mid_stay_msg_at timestamptz;

-- End 260_booking_checklists_mid_stay.
