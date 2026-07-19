-- 110_domestics_cancellation_ack.sql
-- Runs on BOTH databases. Adds one nullable column to public.domestics.
--
-- Supports the booking-cancellation workflow (Task 3): when syncICalFeeds
-- detects a named-guest booking cancelled upstream and a scheduled clean
-- was already linked to it, the clean's status is set to 'cancelled' (kept
-- permanently for reporting/history — never deleted or hidden) and this
-- column tracks whether Nina has acknowledged/dismissed it from the
-- dashboard's Urgent Actions panel. NULL = still needs attention.
--
-- No RLS/policy change needed — domestics already has open anon+
-- authenticated policies (see supabase/migrations/README.md) that cover
-- reading and writing any column on this table.

ALTER TABLE public.domestics
  ADD COLUMN IF NOT EXISTS cancellation_acknowledged_at timestamptz;

-- End 110_domestics_cancellation_ack.
