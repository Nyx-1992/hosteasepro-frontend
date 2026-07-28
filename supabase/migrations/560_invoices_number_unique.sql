-- 560_invoices_number_unique.sql
-- Runs on BOTH databases.
--
-- demo/index_fixed.html's saveInvoiceRecord() upserts new quotations/
-- invoices with {onConflict:'number'} — this only works if public.invoices
-- actually has a unique constraint on `number`. There's no CREATE TABLE
-- migration for this table on file (it predates this repo's migration
-- convention — see README.md's "backfill their schema" TODO and
-- 100_rls_parity.sql's header), so it's unconfirmed whether that
-- constraint exists on either database.
--
-- If it doesn't, every upsert has been failing at the database level —
-- and because supabase-js resolves with {data,error} rather than throwing
-- on that kind of failure, and the calling code wasn't checking `error`
-- (fixed alongside this migration), the failure was completely silent:
-- no document ever actually got saved, so the "next number" logic always
-- fell back to 001 and the number field looked stuck.
--
-- Guarded to no-op if the constraint already exists under any name, and to
-- warn (not fail the whole script) if existing data would violate it.

DO $$
BEGIN
  ALTER TABLE public.invoices ADD CONSTRAINT invoices_number_unique UNIQUE (number);
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'invoices_number_unique already exists — skipping';
  WHEN unique_violation THEN
    RAISE NOTICE 'Existing duplicate invoice numbers found — constraint NOT added. Needs manual cleanup (dedupe public.invoices.number) before this can be applied.';
END $$;

-- End 560_invoices_number_unique.
