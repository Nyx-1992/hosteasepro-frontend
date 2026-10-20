-- A half-finished invoice can be put down and picked up again.
--
-- Silja: she wants a "saving" button (Zwischenspeicher) for when she cannot
-- finish an invoice in one sitting.
--
-- Today the ONLY thing that writes to this table is generating the PDF. Stop
-- halfway and everything typed is gone on the next page load — guest, dates,
-- line items, notes. The table already has a `status` column defaulting to
-- 'draft', which nothing has ever set or read, so the shape was half here.
--
-- THREE THINGS WERE IN THE WAY.
--
-- guest_name was NOT NULL. A half-finished invoice frequently has a property
-- and some dates and no guest yet — that is what "half-finished" means — so
-- the save would simply fail. It is nullable now, with a CHECK that puts the
-- requirement back exactly where it belongs: a document that has been ISSUED
-- must name its guest. Drafts need not. No existing row is affected; they all
-- have names, and they are all about to be stamped 'issued'.
--
-- Several form fields were never stored at all: the address, the discount
-- percentage, the deposit, the check-in/check-out pair behind the date
-- picker. Restoring a draft without them would hand Silja a form that had
-- quietly dropped her work, which is worse than no draft button. draft_state
-- holds the whole form as one snapshot, so resuming restores exactly what she
-- left — and a field added to the form later needs no migration to be kept.
-- The flat columns stay the record of the DOCUMENT; draft_state is the record
-- of the EDIT.
--
-- And nothing recorded when a row was last touched, so a draft list could not
-- be ordered by what she was working on most recently.

ALTER TABLE public.invoices ALTER COLUMN guest_name DROP NOT NULL;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS draft_state jsonb,
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

-- The status vocabulary had no word for "the document exists now". It allowed
-- draft / sent / paid / cancelled, and generating a PDF is none of those:
-- 'draft' is what we are trying to stop meaning everything, and 'sent' claims
-- something about Silja's outbox that this app has no way of knowing. So
-- 'issued' is added, and sent/paid stay available for a workflow that does not
-- exist yet rather than being pressed into service for one that does.
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status = ANY (ARRAY['draft'::text,'issued'::text,'sent'::text,'paid'::text,'cancelled'::text]));

-- Existing rows are finished documents, not drafts. They were all created by
-- the PDF path, which is the only writer there has ever been — so every one
-- of them reads "draft" today purely because the column default was never
-- overridden, and the Past Documents list has been calling finished invoices
-- drafts since the table was created.
UPDATE public.invoices
   SET status = 'issued'
 WHERE coalesce(status, 'draft') = 'draft';

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_issued_needs_guest;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_issued_needs_guest
  CHECK (coalesce(status, 'draft') = 'draft' OR guest_name IS NOT NULL);

CREATE INDEX IF NOT EXISTS invoices_drafts_idx
  ON public.invoices (org_id, updated_at DESC)
  WHERE status = 'draft';

COMMENT ON COLUMN public.invoices.draft_state IS
  'Whole-form snapshot for resuming a half-finished document. Cleared when the PDF is generated.';
COMMENT ON COLUMN public.invoices.status IS
  'draft while being written, issued once the PDF has been generated. A non-draft must have a guest_name.';
