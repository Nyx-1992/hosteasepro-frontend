-- When a cleaner's report was dealt with, and by whom.
--
-- Owner: "I marked a review complete from Spiwe where something was broken —
-- but all are reviewed now and I can't see when sth was reported
-- historically."
--
-- Nothing was lost: Spiwe's 28 August report is intact, flagged, with its one
-- item ("Kitchen — Bowls (×4) — 1 bowls missing"). The gap is that marking it
-- reviewed wrote a single boolean and nothing else. reviewed = true says it
-- was handled; it cannot say WHEN, or by whom, so a reviewed report is
-- indistinguishable from one reviewed six months ago, and there is no record
-- of who looked at it.
--
-- That matters most for the reports that carry a breakage. A list of "all
-- reviewed" is only trustworthy if you can see when each was dealt with —
-- otherwise the honest reading of a tick is "somebody, at some point,
-- possibly".
--
-- Both NULL for every existing row, deliberately. We do not know when the
-- already-reviewed reports were reviewed, and inventing a timestamp — now(),
-- or the clean date — would put a precise-looking lie next to a real one. The
-- app renders a reviewed report with no date as plain "Reviewed", which is
-- exactly what is known about it.

ALTER TABLE public.inventory_reports
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by text;

COMMENT ON COLUMN public.inventory_reports.reviewed_at IS
  'When the report was marked reviewed. NULL for rows reviewed before 931, and for unreviewed rows.';
COMMENT ON COLUMN public.inventory_reports.reviewed_by IS
  'Display name of whoever marked it reviewed. NULL for rows reviewed before 931.';

-- Issue history is read by date far more than by anything else: "what has
-- been reported, and when". Everything flagged, newest first.
CREATE INDEX IF NOT EXISTS inventory_reports_issues_idx
  ON public.inventory_reports (org_id, submitted_at DESC)
  WHERE all_ok = false;
