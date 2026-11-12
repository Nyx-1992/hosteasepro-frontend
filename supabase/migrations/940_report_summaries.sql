-- A report is a digest, not a transcript.
--
-- Owner: "you just added the notes from them in the mail - I was expecting
-- to have a sum up and my notes i took earlier to be added as an answer!"
--
-- The monthly table carried their verbatim email in one column and a full
-- formal reply in the other. Both are the right text in the wrong place: a
-- month of 600-word cells cannot be read across, which is the entire reason
-- for a table. The thread keeps the full text — that is what gets sent to a
-- person — and the report gets the gist.
--
-- TWO FIELDS, IN TWO PLACES, because they are not equally sensitive.
-- request_summary is our precis of words the owner wrote themselves, and
-- owner_queries is readable by them, so it may live there. The answer
-- summary IS an answer, so it goes on owner_query_drafts, which is
-- org-members-only and therefore unreadable by the owner until the answer
-- is actually sent. Putting it on owner_queries would have handed them a
-- reply nobody had decided to send yet — the same mistake 939 fixed.

ALTER TABLE public.owner_queries
  ADD COLUMN IF NOT EXISTS request_summary text;

COMMENT ON COLUMN public.owner_queries.request_summary IS
  'One or two lines: what they asked. For the monthly report, which cannot be read if every cell is the full message. The owner can see this column — it is our precis of their own words.';

ALTER TABLE public.owner_query_drafts
  ADD COLUMN IF NOT EXISTS summary text;

COMMENT ON COLUMN public.owner_query_drafts.summary IS
  'The short form of the answer, for the monthly report. Lives here rather than on owner_queries because it is an answer: org members only, unreadable by the owner until it is actually sent.';
