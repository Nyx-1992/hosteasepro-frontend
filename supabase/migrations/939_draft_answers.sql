-- An answer written but not yet sent.
--
-- Owner: "1 category, what their request was and then our answer to it with
-- the notes I gave you."
--
-- The third column of that table has to come from somewhere. The answers
-- exist as notes long before they are sent — she works through a month of
-- requests in several sittings, and the review happens across the whole
-- month rather than one thread at a time.
--
-- NOT A COLUMN ON owner_queries, which is where this started and where it
-- was wrong. owner_queries_select lets the property's owner read their own
-- rows, and PostgREST returns whatever columns are asked for — the client
-- portal calls .select('*'). A draft answer stored there is readable by the
-- person it has not been sent to, whatever the interface chooses to draw.
-- Hiding it in the UI would have left the leak and removed the evidence.
--
-- So: its own table, whose only policy is org membership. An owner has no
-- route to these rows at all.

CREATE TABLE IF NOT EXISTS public.owner_query_drafts (
  query_id   uuid PRIMARY KEY REFERENCES public.owner_queries(id) ON DELETE CASCADE,
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  body       text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.owner_query_drafts FROM anon;
ALTER TABLE public.owner_query_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_query_drafts_all ON public.owner_query_drafts;
CREATE POLICY owner_query_drafts_all ON public.owner_query_drafts FOR ALL
  USING      (auth.role() = 'authenticated' AND public.is_org_member(org_id))
  WITH CHECK (auth.role() = 'authenticated' AND public.is_org_member(org_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_query_drafts TO authenticated;

COMMENT ON TABLE public.owner_query_drafts IS
  'An answer written but not sent. Org members only — deliberately NOT a column on owner_queries, where the owner''s own select policy would return it.';
