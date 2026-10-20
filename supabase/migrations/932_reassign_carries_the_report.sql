-- Reassigning a clean carries its inventory report across — but remember who
-- actually filed it.
--
-- Owner: "When a clean was reassigned in a booking, it needs to move over to
-- another domestic. I would say this can retrospectively done for up to 2-3
-- weeks and then it probably should lock in?"
--
-- WHY THE REPORT HAS TO MOVE. When Nina's roster is out of date, the clean
-- sits against the wrong cleaner, and the portal only shows a cleaner the
-- cleans assigned to THEM — so the person who actually went is not the person
-- who can file the report. Fixing the roster afterwards has to carry the
-- report with it, or the clean says Patricia while its own report says
-- Fatima, and the October pay run disagrees with the paperwork.
--
-- WHY submitted_by EXISTS ANYWAY. Overwriting `cleaner` on reassignment would
-- destroy the one fact nothing else records: whose hands were on the phone
-- when that report was sent. That is worth keeping — it is how the
-- 2026-10-19 Speranta report was caught as a mis-tap (filed on 1 October, 18
-- days before the clean, by someone who had already filed one two days
-- earlier). So `cleaner` becomes "who this clean belongs to now" and
-- submitted_by stays "who pressed send".
--
-- The backfill is truthful rather than convenient: no reassignment has
-- happened yet, so for every existing row the cleaner IS the submitter.
-- Nothing is being guessed.

ALTER TABLE public.inventory_reports
  ADD COLUMN IF NOT EXISTS submitted_by text;

UPDATE public.inventory_reports
   SET submitted_by = cleaner
 WHERE submitted_by IS NULL;

COMMENT ON COLUMN public.inventory_reports.cleaner IS
  'Who this clean belongs to now. Follows the clean when it is reassigned, within the reassignment window.';
COMMENT ON COLUMN public.inventory_reports.submitted_by IS
  'Who actually submitted the report, from the portal. Never changes on reassignment. Backfilled from cleaner in 932, where they were by definition the same.';
