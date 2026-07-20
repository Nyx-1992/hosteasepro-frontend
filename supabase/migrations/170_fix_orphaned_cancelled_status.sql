-- 170_fix_orphaned_cancelled_status.sql
-- Runs on BOTH databases. Data correction, not a code bug — confirmed only
-- 1 row matches on production (booking id 574, "LS-5XBX33"), so this is a
-- one-off historical inconsistency, not something the current cancellation
-- code is still producing.
--
-- The row has is_active=false and cancelled_at set (it was clearly treated
-- as cancelled at some point), but status was left at its pre-cancellation
-- value instead of being updated to 'cancelled'. That let it keep passing
-- status-based filters (e.g. the dashboard's "Today's Check-ins" card,
-- which excludes status='cancelled' but has no reason to also check
-- is_active) even though it was already deactivated.

UPDATE public.bookings
SET status = 'cancelled'
WHERE is_active = false AND cancelled_at IS NOT NULL AND status NOT IN ('cancelled', 'blocked');

-- End 170_fix_orphaned_cancelled_status.
