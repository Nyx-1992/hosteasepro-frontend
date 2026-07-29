-- 610_team_messages.sql
-- Runs on BOTH databases.
--
-- New table backing the Messages tab's "Team Chat" sub-tab, replacing the
-- hardcoded, in-memory-only `messages` array in demo/index_fixed.html.
-- That array was never fetched from or written to Supabase, so messages
-- vanished on refresh and never synced between devices — the reported
-- "Supabase toggle doesn't work for chat" bug. This table plus the
-- accompanying client wiring fixes both.
--
-- Named `messages`, scoped like team_contacts (520): any authenticated org
-- member can read/post (matches the Messages tab's nav gate
-- roles:['owner','admin','host']); no update/delete policy — chat history
-- is append-only.

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_name text NOT NULL,
  role text NOT NULL DEFAULT '',
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_org_id_created_at_idx ON public.messages (org_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select ON public.messages FOR SELECT USING (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_member(org_id)
);

DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND org_id = public.current_org_id() AND public.is_org_member(org_id)
);

-- End 610_team_messages.
