-- 780_people_pay_permission.sql
-- Runs on BOTH databases. Data-only: seeds one new permission key into
-- the grid added by 750. No schema change.
--
-- Why it exists: the People tab (Staff + Contacts merged) is now visible
-- to hosts, because the owner reasonably expects the host manager to be
-- able to look someone up — "I would expect Nina to see the contacts if
-- she needs to contact someone." team_contacts already permits any org
-- member to SELECT (520) and restricts writes to admins, so no policy
-- change was needed for that.
--
-- But the staff cards carry more than contact details: cleaner rates,
-- payment method, birthdays, and free-text notes. The notes are the
-- reason this permission exists rather than a simple role check — the
-- real records contain the rate written out in prose ("Paid via ewallet
-- directly. Rate: R350/clean."), so hiding the rate field while showing
-- notes would have leaked exactly what was being protected. people.pay
-- therefore gates rate, payment method, birthday, portal-access flag AND
-- notes together.
--
-- Default: ON for admin, OFF for host. The owner can grant it in
-- Settings > Permissions if she wants Nina to see pay — that is a
-- business call, and the point of the grid is that it does not need a
-- developer.
--
-- Enforcement note, stated plainly: this one is UI-side only. Unlike
-- website.edit / budget.* / statements.upload (750, 770), it is NOT
-- backed by an RLS policy, because the sensitive values live in COLUMNS
-- of a row the host is legitimately allowed to read — Postgres RLS gates
-- rows, not columns. A host who opened the browser console could still
-- read the rate off the API response. Making it a real boundary needs
-- either column-level grants or a view that omits those columns for
-- non-admins; both are worth doing if pay data ever becomes genuinely
-- sensitive here, and neither is worth pretending has already been done.

INSERT INTO public.role_permissions (org_id, role, permission, allowed)
SELECT o.id, v.role, v.permission, v.allowed
FROM public.organizations o
CROSS JOIN (VALUES
  ('admin', 'people.pay', true),
  ('host',  'people.pay', false)
) AS v(role, permission, allowed)
ON CONFLICT (org_id, role, permission) DO NOTHING;

-- End 780_people_pay_permission.
