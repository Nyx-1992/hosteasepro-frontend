-- 892_roadmap_private.sql
-- Runs on BOTH databases.
--
-- Follows 891, which locked roadmap_state to the owner and left an
-- honest note on the table: "locking this table protects the ticks, not
-- the content." This migration deals with the content, and with a
-- regression 891 introduced.
--
-- ══ 1. 891 BROKE SAVING A TICK ════════════════════════════════════
--
-- 891 added roadmap_state.org_id and wrote a policy requiring
-- org_id = current_org_id() in BOTH using and with check. The app upserts
-- {task_key, done, updated_at} and has never sent org_id, so every write
-- since 891 has inserted a NULL org_id, failed the with check, and been
-- swallowed by the empty catch around it. Reads still worked, so the tick
-- appeared to save until the page was reloaded.
--
-- Two independent fixes, because either alone would leave a sharp edge:
-- a column default here, so a client that forgets org_id still writes to
-- the right org, and an explicit org_id in the app.
UPDATE public.roadmap_state SET org_id = public.current_org_id() WHERE org_id IS NULL;

-- Any row still without an org after that belongs to nobody and cannot be
-- read under the 891 policy. Deleting is safe: it is a boolean tick that
-- no one can see, and the app re-creates it on the next click.
DELETE FROM public.roadmap_state WHERE org_id IS NULL;

ALTER TABLE public.roadmap_state ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.roadmap_state ALTER COLUMN org_id SET NOT NULL;

-- task_key alone was the primary key, so two orgs would collide on
-- 'p3-20' and the second one to tick it would overwrite the first. The
-- roadmap is per-org, and so is its key.
ALTER TABLE public.roadmap_state DROP CONSTRAINT IF EXISTS roadmap_state_pkey;
ALTER TABLE public.roadmap_state ADD PRIMARY KEY (org_id, task_key);

-- ══ 2. THE ROADMAP TEXT ITSELF ════════════════════════════════════
--
-- The instruction was "roadmap is ONLY for me and no one else to see."
-- The ticks are now owner-only, but the roadmap PROSE — 110 entries
-- carrying pricing decisions, competitor analysis, customer names and
-- write-ups of every security hole and its fix — was a const array inside
-- demo/index_fixed.html. That is a single-file app served to every
-- browser that loads it, so the notes were readable by anyone who opened
-- view-source, signed in or not. An RLS policy cannot help with text that
-- ships in the page.
--
-- So the content moves into the database, behind the same owner-only
-- policy as the ticks, and the array leaves the HTML.
CREATE TABLE IF NOT EXISTS public.roadmap_phases (
  org_id   uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  phase_id text NOT NULL,
  lbl      text NOT NULL,
  meta     text,
  col      text,
  sort     int  NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, phase_id)
);

CREATE TABLE IF NOT EXISTS public.roadmap_items (
  org_id   uuid NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_key text NOT NULL,
  phase_id text NOT NULL,
  title    text NOT NULL,
  note     text,
  cat      text,
  sort     int  NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, task_key),
  FOREIGN KEY (org_id, phase_id) REFERENCES public.roadmap_phases(org_id, phase_id) ON DELETE CASCADE
);

ALTER TABLE public.roadmap_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_items  ENABLE ROW LEVEL SECURITY;

-- Same shape as roadmap_owner_only in 891: owner of this org, nobody
-- else. Not admin, not host, not the client, not anon.
DROP POLICY IF EXISTS roadmap_phases_owner_only ON public.roadmap_phases;
CREATE POLICY roadmap_phases_owner_only ON public.roadmap_phases FOR ALL USING (
  auth.role() = 'authenticated'
  AND org_id = public.current_org_id()
  AND EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'owner' AND p.org_id = roadmap_phases.org_id)
) WITH CHECK (
  auth.role() = 'authenticated'
  AND org_id = public.current_org_id()
  AND EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'owner' AND p.org_id = roadmap_phases.org_id)
);

DROP POLICY IF EXISTS roadmap_items_owner_only ON public.roadmap_items;
CREATE POLICY roadmap_items_owner_only ON public.roadmap_items FOR ALL USING (
  auth.role() = 'authenticated'
  AND org_id = public.current_org_id()
  AND EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'owner' AND p.org_id = roadmap_items.org_id)
) WITH CHECK (
  auth.role() = 'authenticated'
  AND org_id = public.current_org_id()
  AND EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'owner' AND p.org_id = roadmap_items.org_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap_phases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap_items  TO authenticated;

-- ══ 3. WHY THERE IS NO SEED IN THIS FILE ══════════════════════════
--
-- Deliberate, and the only real exception to the migrations discipline
-- set in p0-14.
--
-- This repository is PUBLIC on GitHub. Pasting 110 private notes into a
-- migration would move them from one public place to another and change
-- nothing. The rows were therefore loaded straight into both databases
-- from the array that used to be in the HTML, and are not in version
-- control.
--
-- The cost is that a database rebuilt from migrations alone comes up with
-- an empty roadmap. That is acceptable: this is the owner's notebook, not
-- application data — nothing reads it, no feature depends on it, and the
-- tab simply shows nothing until rows exist. Every other table is still
-- fully reproducible from this directory.
--
-- If the repository is ever made private, a seed can be added here and
-- this note deleted.
COMMENT ON TABLE public.roadmap_items IS
  'The owner''s private roadmap notes. Owner-only by policy. Content is NOT seeded from migrations while the repo is public — see 892.';

-- End 892_roadmap_private.
