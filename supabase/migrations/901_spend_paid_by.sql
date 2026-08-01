-- 901_spend_paid_by.sql
-- Runs on BOTH databases.
--
-- Correcting an assumption in 900. That migration was written around
-- Nina filing slips for things she buys, and the owner pointed out the
-- obvious: "spending is not limited to nina only, since we also pay for
-- repairs etc."
--
-- Three people spend money on these properties, sometimes from the
-- business account and sometimes from a personal card that has to be
-- paid back. A list of amounts with no payer on it cannot answer the
-- question that actually gets asked at month end, which is not "what did
-- we spend" but "who is out of pocket, and for how much".
--
-- Two columns, because they are genuinely different questions and
-- conflating them is what makes reimbursement arguments:
--
--   created_by — who typed it in. Automatic, never edited.
--   paid_by    — whose money it was. Defaults to the person logging it,
--                because usually you are filing your own receipt, but
--                editable: Silja files a slip for something Nina bought,
--                and Nina is still the one owed.
ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS paid_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Null means the business account paid, which is the common case and the
-- right default for the 213 rows already there — none of them were
-- personal money as far as anyone has recorded.
ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS reimbursed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS finance_transactions_paid_by_idx
  ON public.finance_transactions (org_id, paid_by) WHERE paid_by IS NOT NULL;

COMMENT ON COLUMN public.finance_transactions.created_by IS
  'Who recorded this spend. Set once, not edited — it is a fact about the record, not about the money.';
COMMENT ON COLUMN public.finance_transactions.paid_by IS
  'Whose money it was, when it was not the business account. NULL means the business paid and nobody is owed. Distinct from created_by on purpose: filing someone else''s receipt must not make them the payer, or the reverse.';
COMMENT ON COLUMN public.finance_transactions.reimbursed IS
  'Whether a personal payment has been paid back. Only meaningful when paid_by is set.';

-- ══ SEEING WHO IS OWED ════════════════════════════════════════════
-- Names, not uuids. profiles is org-scoped by its own policies, so this
-- returns nothing for anyone outside the org.
CREATE OR REPLACE VIEW public.spend_owed AS
  SELECT t.org_id,
         t.paid_by,
         p.name  AS paid_by_name,
         count(*)      AS items,
         sum(t.amount) AS total
    FROM public.finance_transactions t
    JOIN public.profiles p ON p.id = t.paid_by
   WHERE t.type = 'expense' AND t.paid_by IS NOT NULL AND NOT t.reimbursed
   GROUP BY t.org_id, t.paid_by, p.name;

COMMENT ON VIEW public.spend_owed IS
  'Outstanding out-of-pocket spend per person. What month end actually needs: not what was spent, but who has not been paid back.';

GRANT SELECT ON public.spend_owed TO authenticated;

-- End 901_spend_paid_by.
