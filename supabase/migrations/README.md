# Database Migrations

Every database change = one numbered SQL file in this folder. No exceptions —
changes made ad hoc through the Supabase dashboard SQL editor without a
matching file here are how drift happens (see the `domestics` /
`domestic_services` note below, which is exactly that).

## Running a migration

1. Open the file, read it.
2. Paste its contents into the Supabase SQL Editor for the target project(s)
   and run it. Unless a file's header says **STAGING ONLY**, run it on
   **both** projects — production (`dkyzbzlshrxdwetykmdo`) and staging
   (`rwsfbgtvqbkunbfvviiz`).
3. Files are idempotent where practical (`CREATE OR REPLACE`,
   `DROP ... IF EXISTS` + `CREATE`, `ON CONFLICT DO NOTHING`), so re-running
   one that already applied is safe.

## Numbering

Gap-of-10 convention (001, 010, 020 ... 060, 070, 080 ...) so a fix can be
slotted in later without renumbering everything. When adding a file, pick
the next unused number in the gap. Don't backfill a lower number once files
above it already exist — files are meant to be run in ascending filename
order.

| File | Applies to | Purpose |
|---|---|---|
| 001–060 | both | Original schema, functions, RLS, views |
| 070_is_org_admin_fix.sql | both | Security-hardens `is_org_admin` (adds `SECURITY DEFINER` + locked `search_path`) — superseded by `085`, see incident note |
| 080_is_org_member.sql | both | New `is_org_member` helper (owner/admin/host); widens day-to-day write policies to include hosts — superseded by `085`, see incident note |
| 085_is_org_functions_profiles_fix.sql | both | **Corrective.** Fixes `is_org_admin`/`is_org_member` to query `public.profiles` (the real role table) instead of the unused `public.user_profiles`. Run before `100`. |
| 090_staging_ical_feeds_seed.sql | **staging only** | Seeds `ical_feeds` on staging so iCal sync can be smoke-tested there |
| 095_staging_ical_feeds_index_fix.sql | **staging only** | Adds `ical_feeds_unique_platform_property`, which staging was missing (production had it) — required before 090 can run |
| 100_rls_parity.sql | both | Defines one clean policy target state and applies it to both databases — closes real gaps on staging, fixes the same redundant/legacy-mechanism bugs on production. Run after `085`. |
| 110_domestics_cancellation_ack.sql | both | Adds `domestics.cancellation_acknowledged_at` — supports Task 3's cancellation workflow (dashboard Urgent Actions dismiss tracking) |
| 120_roadmap_state_seed.sql | both | Marks this session's completed Roadmap tab items (p0-13 through p0-20) as done |
| 130_platform_fee_config.sql | both | New `platform_fee_config` table (per-org, per-platform host commission % + guest fee %) backing Task 5's rate calculator; seeded with ZA defaults, including HEP's own 5% direct-booking commission (0% for the S&N owner org) |
| 140_roadmap_state_task5.sql | both | Marks Roadmap tab item p0-22 (rate calculator) as done |
| 150_platform_fee_airbnb_correction.sql | both | **Corrective.** Fixes `130`'s Airbnb seed (3% host / 14% guest, the old split-fee model) to match a real earnings statement showing host-only pricing (17.8% host, 0% guest) — only touches rows still at the old default |

## ACTIVE INCIDENT (2026-07-18) — is_org_admin / is_org_member broken on BOTH databases from 2026-07-18 until 085 is applied

`070_is_org_admin_fix.sql` and `080_is_org_member.sql`, once run against
both databases, overwrote the live `is_org_admin`/`is_org_member`
functions with versions that query `public.user_profiles`. **That was
wrong.** The real, previously-working versions of these functions (created
directly via the SQL editor, never captured in this folder) query
`public.profiles`, which holds real owner/admin/host rows on both
databases (confirmed via `information_schema.columns`: `id uuid` — equal
to `auth.uid()` directly, no separate `user_id` column — `org_id uuid`,
`name text`, `role text`, `initials text`). `user_profiles` is unused by
the app — same suspected-legacy pattern as `domestic_services` vs
`domestics` below.

Net effect while broken: `is_org_admin()`/`is_org_member()` return `false`
for everyone on both databases. Any policy gated by one of these with no
wide-open fallback denies real users — on production that's at least
`properties_modify`, `bookings_update`, and `contacts_modify`.

**Fixed by `085_is_org_functions_profiles_fix.sql`** — run it on both
databases as soon as possible; it's the first thing that should happen,
before `100_rls_parity.sql` or anything else.

**`current_org_id()` verified fine** (via `pg_get_functiondef`,
2026-07-18) — it already correctly queries `public.profiles`
(`select org_id from profiles where id = auth.uid() limit 1`), same
`STABLE SECURITY DEFINER SET search_path` shape, `LANGUAGE sql`. It was
never touched by `070`/`080` and was never broken; `030_rls_helpers.sql`'s
checked-in body (querying `user_profiles`) is simply stale/undocumented,
same as `is_org_admin`/`is_org_member` were before `085`. No further
corrective migration needed for it. `085`'s functions were rewritten to
match this confirmed `LANGUAGE sql` style instead of the more defensive
`plpgsql` pattern `070`/`080` mistakenly carried over.

Also flagged, not yet fixed: `property_users_modify`'s policy (ported
as-is in `100_rls_parity.sql`) joins against `user_profiles` in its EXISTS
subquery — the same wrong table, likely broken the same way, pre-existing
on production before any of this. Revisit once `profiles`' role there is
fully confirmed.

## Findings from the 2026-07-18 pg_policies audit

Before writing `100_rls_parity.sql`, we pulled the actual live policy set
from both databases (`SELECT * FROM pg_policies WHERE schemaname='public'`)
rather than trusting this folder's files to reflect reality. They didn't,
fully:

- **`public.user_profiles` is empty on both databases and is app-unused —
  see the incident note above.** The real role table is `public.profiles`.
- **Production itself is inconsistent, not a single clean granular set.**
  Some tables (`bookings`, `properties`, `contacts`, `domestic_services`,
  `user_profiles`, `property_users`) are genuinely locked down. Others
  (`tasks`, `booking_checklists`, `invoices`, `property_inspections`) have
  a narrow-looking policy with a redundant wide-open one layered on top,
  which wins — so those are just as open as staging was, on production too.
  `100_rls_parity.sql` tightens staging to the narrow policy only for
  these; production is **not** fixed by this file (worth a separate pass).
- **`financial_transactions` and `ical_feeds` gate access via custom JWT
  claims** (`auth.jwt() ->> 'org_id'`, `current_setting
  ('request.jwt.claim.org_id')`) rather than this repo's
  `current_org_id()`/`is_org_admin()` helpers — set by something outside
  this repo, likely a Supabase Auth Hook. Whether staging's Auth mints the
  same claims is unverified, so `100_rls_parity.sql` uses the helper-
  function equivalent for these two tables on staging instead of copying
  the JWT-claim policies verbatim.
- **`invoices` and `property_inspections`'s "narrow" prod policies hardcode
  one literal `org_id` UUID** (production's own org). That UUID doesn't
  exist in staging's database, so `100_rls_parity.sql` uses
  `current_org_id()` there instead of copying the literal.
- **Several tables have real data and real policies but no migration file
  defines them at all**: `invoices`, `property_inspections`,
  `property_users`, `financial_transactions`, `ical_feeds`,
  `monthly_earnings`, `domestic_services_detailed`, `booking_audit`,
  `import_runs`, `inventory_reports`, `kb_articles`,
  `cleaner_availability`, `roadmap_state`, `org_settings`, `profiles`,
  `finance_transactions` (a separate, apparently-unrelated table from
  `financial_transactions` — not yet investigated). None of these have a
  `CREATE TABLE` anywhere in `001`–`060`. TODO: backfill their schema into
  a migration file at some point so the table definitions aren't only
  discoverable by querying the live database.

## Known schema drift — read before touching cleaning/domestic tables

The live staff portal (`demo/domestic.html`) reads and writes a table called
`domestics`. The migrations in this folder (`001_init_core_schema.sql`,
`040_policies.sql`) instead define `domestic_services`, with its own RLS
policies (`domestic_select`, `domestic_insert`, `domestic_update`).
`domestic_services` appears unused by the live app — most likely a
legacy/abandoned table from before `domestics` existed.

**Do not rename or migrate data between the two without confirming first.**
`domestic_update` etc. are still updated in `080_is_org_member.sql` for
consistency with the rest of that migration, but that change does not affect
the live cleaning-assignment flow, which runs on `domestics`. TODO:
reconcile — either drop `domestic_services` if it's confirmed dead, or
figure out why both tables exist.
