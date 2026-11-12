-- An answer already sent can be corrected, and says that it was.
--
-- Owner: "How can we see and update the questions and answers on our end?
-- The attached has to be changed."
--
-- The towel-holder paragraph went out saying the first repair had not held.
-- Nina's account is different: a DIFFERENT holder was repaired; this one is
-- new and broken, and nobody caught it because nobody shook it. The answer
-- is wrong and the owners have it.
--
-- NOT A SILENT EDIT. The message may already have been read, and the thread
-- is the record of what was said to a client about their property. So the
-- original text is kept and the correction is marked — the owner sees that
-- something changed rather than finding a paragraph they remember
-- differently and wondering which of them is wrong.
--
-- OUR SIDE ONLY. The policy requires author_side = 'agency'. Editing a
-- message from the owner would not be a correction, it would be rewriting
-- what somebody said.

ALTER TABLE public.owner_query_messages
  ADD COLUMN IF NOT EXISTS edited_at     timestamptz,
  ADD COLUMN IF NOT EXISTS original_body text;

COMMENT ON COLUMN public.owner_query_messages.edited_at IS
  'When this message was corrected. Non-null means the owner may have read something different — the thread says so.';
COMMENT ON COLUMN public.owner_query_messages.original_body IS
  'What it said the first time. Kept because the owner may already have acted on it.';

DROP POLICY IF EXISTS owner_query_messages_update ON public.owner_query_messages;
CREATE POLICY owner_query_messages_update ON public.owner_query_messages FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND author_side = 'agency'
    AND EXISTS (SELECT 1 FROM public.owner_queries q
                 WHERE q.id = query_id AND public.is_org_member(q.org_id))
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND author_side = 'agency'
    AND EXISTS (SELECT 1 FROM public.owner_queries q
                 WHERE q.id = query_id AND public.is_org_member(q.org_id))
  );

GRANT UPDATE ON public.owner_query_messages TO authenticated;
