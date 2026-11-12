-- Sending the answer must not throw away its short form.
--
-- sendQueryDraft() deleted the draft row once the message was safely in,
-- which was right when a draft held only the unsent reply. 940 put the
-- report's short version on the same row — so sending an answer also
-- deleted the one-line summary the monthly report reads, and the report
-- fell back to showing the full reply again. Exactly the long-cell table
-- 940 existed to get rid of, reappearing the moment anything was answered.
--
-- So the row survives and the body is emptied instead. body nullable means
-- "answered, and the short form is still here".

ALTER TABLE public.owner_query_drafts ALTER COLUMN body DROP NOT NULL;

COMMENT ON COLUMN public.owner_query_drafts.body IS
  'The unsent reply. Cleared to NULL when the answer is actually sent — the row stays so its summary survives, because the monthly report needs the short form long after the long one has gone out.';
