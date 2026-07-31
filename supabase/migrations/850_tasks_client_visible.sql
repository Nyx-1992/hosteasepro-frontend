-- 850_tasks_client_visible.sql
-- Runs on BOTH databases.
--
-- Lets a property OWNER see the tasks S&N chooses to show them.
--
-- The owner's rule, in their words: "the owners can only see the tasks we
-- make available (by adding them on our end, just a 'client' button)."
-- So visibility is an explicit act by staff, never a default and never
-- inferred from the task's type or property.
--
-- WHY OPT-IN RATHER THAN OPT-OUT. An agency's board carries things a
-- customer should not read — "chase Tino about the invoice", "Blessing
-- swapping Saturday", "check whether the owners are actually paying for
-- the pool guy". Defaulting to visible would mean every card ever written
-- is one forgotten toggle away from the customer, forever. Defaulting to
-- hidden means the worst case is an owner not seeing something, which is
-- a phone call rather than an incident.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS client_visible boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tasks.client_visible IS
  'Staff explicitly shared this task with the property owner. Default false — the agency board is internal unless someone says otherwise.';

-- Only shared tasks are ever scanned for a client, so the partial index
-- stays small no matter how large the internal board grows.
CREATE INDEX IF NOT EXISTS tasks_client_visible_idx
  ON public.tasks (property_id) WHERE client_visible;

-- ── Client read access ────────────────────────────────────────────
-- Both conditions must hold: the task is on a property this client has
-- been granted (820's client_property_uuids), AND staff have shared it.
--
-- Note that permissive policies are OR-ed, so this ADDS a way in and can
-- never narrow the existing staff policies — the same property that made
-- migration 824 necessary. It is safe here precisely because it is
-- doubly restricted: a client with no property grants matches nothing,
-- and an unshared task matches nothing.
DROP POLICY IF EXISTS tasks_client_select ON public.tasks;
CREATE POLICY tasks_client_select ON public.tasks FOR SELECT USING (
  auth.role() = 'authenticated'
  AND client_visible
  AND property_id = ANY (public.client_property_uuids())
);

-- Deliberately NO insert, update or delete for clients.
--
-- Status is the AGENCY'S operational truth. An owner dragging a card to
-- Done does not make the light switch replaced, and letting them edit
-- would turn the board into a negotiation about what happened rather
-- than a record of it. Requests from owners are a separate flow worth
-- building later, with its own column, rather than write access to this
-- one.

-- End 850_tasks_client_visible.
