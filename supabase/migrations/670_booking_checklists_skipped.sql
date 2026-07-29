-- 670_booking_checklists_skipped.sql
-- Runs on BOTH databases.
--
-- Adds "ticked off without sending" tracking to the Guest Messages
-- touchpoints (booking_checklists). The owner wants to dismiss a due
-- message she decided not to send (e.g. mid-stay handled in person) so it
-- stops nagging — but visibly distinct from actually sent: yellow ring in
-- the UI instead of green.
--
-- One jsonb map instead of a *_skipped_at column per stage because the
-- sent-side already burned five separate timestamp columns (COL_MAP in
-- index_fixed.html) and every new stage would need another ALTER here;
-- the map holds e.g. {"mid_stay_msg": true} and unknown keys cost nothing.
-- Sent timestamps stay the source of truth for "sent" — a stage is
-- "skipped" only if its flag is set here AND its sent column is NULL.
--
-- No RLS change: booking_checklists' existing org-scoped authenticated
-- policy (see 580's section 2) already covers this column like any other.

ALTER TABLE public.booking_checklists
  ADD COLUMN IF NOT EXISTS skipped_stages jsonb NOT NULL DEFAULT '{}'::jsonb;

-- End 670_booking_checklists_skipped.
