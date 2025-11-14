-- 060_views.sql
-- Define application views for checklist progress and monthly financial summaries.
-- Updated: use DROP VIEW IF EXISTS + CREATE to allow column order changes safely.

-- View: booking_checklist_status
-- Summarizes completion status of each booking's operational milestones.
DROP VIEW IF EXISTS public.booking_checklist_status CASCADE;
CREATE VIEW public.booking_checklist_status AS
SELECT
  bc.booking_id,
  bc.property_id,
  bc.org_id,
  (bc.domestic_booked_at    IS NOT NULL) AS domestic_booked,
  (bc.guest_contacted_at    IS NOT NULL) AS guest_contacted,
  (bc.checked_in_at         IS NOT NULL) AS checked_in,
  (bc.checked_out_at        IS NOT NULL) AS checked_out,
  (bc.review_written_at     IS NOT NULL) AS review_written,
  (bc.follow_up_sent_at     IS NOT NULL) AS follow_up_sent,
  -- progress metrics
  (
    ((bc.domestic_booked_at    IS NOT NULL)::int +
     (bc.guest_contacted_at    IS NOT NULL)::int +
     (bc.checked_in_at         IS NOT NULL)::int +
     (bc.checked_out_at        IS NOT NULL)::int +
     (bc.review_written_at     IS NOT NULL)::int +
     (bc.follow_up_sent_at     IS NOT NULL)::int)
  ) AS completed_items,
  6 AS total_items,
  ROUND(
    (
      ((bc.domestic_booked_at    IS NOT NULL)::int +
       (bc.guest_contacted_at    IS NOT NULL)::int +
       (bc.checked_in_at         IS NOT NULL)::int +
       (bc.checked_out_at        IS NOT NULL)::int +
       (bc.review_written_at     IS NOT NULL)::int +
       (bc.follow_up_sent_at     IS NOT NULL)::int)
    )::numeric / 6, 3
  ) AS progress_ratio,
  b.platform,
  b.check_in,
  b.check_out,
  b.status AS booking_status
FROM public.booking_checklists bc
JOIN public.bookings b ON b.id = bc.booking_id;

-- Suggested index for checklist view use (optional, materialize manually if needed):
-- CREATE INDEX ON public.booking_checklists (org_id, property_id);

-- View: financial_monthly_summary
-- Aggregates financial transactions by month, separating income & expense and net total.
DROP VIEW IF EXISTS public.financial_monthly_summary CASCADE;
CREATE VIEW public.financial_monthly_summary AS
SELECT
  ft.org_id,
  date_trunc('month', ft.txn_date)::date AS month_start,
  SUM(CASE WHEN ft.direction = 'income'  THEN ft.amount ELSE 0 END) AS income_total,
  SUM(CASE WHEN ft.direction = 'expense' THEN ft.amount ELSE 0 END) AS expense_total,
  SUM(CASE WHEN ft.direction = 'income'  THEN ft.amount ELSE -ft.amount END) AS net_total,
  COUNT(*) AS txn_count,
  ARRAY_AGG(DISTINCT ft.currency) AS currencies
FROM public.financial_transactions ft
GROUP BY ft.org_id, date_trunc('month', ft.txn_date)
ORDER BY month_start DESC;

-- End of views migration.
