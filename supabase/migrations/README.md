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
| 070_is_org_admin_fix.sql | both | Security-hardens `is_org_admin` (adds `SECURITY DEFINER` + locked `search_path`) |
| 080_is_org_member.sql | both | New `is_org_member` helper (owner/admin/host); widens day-to-day write policies to include hosts |
| 090_staging_ical_feeds_seed.sql | **staging only** | Seeds `ical_feeds` on staging so iCal sync can be smoke-tested there |
| 095_staging_ical_feeds_index_fix.sql | **staging only** | Adds `ical_feeds_unique_platform_property`, which staging was missing (production had it) — required before 090 can run |
| 100_rls_parity.sql | staging only (ports production's granular policies) | Replaces staging's wide-open `authenticated_all_*` policies |

## Known live-vs-documented policy mismatch — verify before writing 100_rls_parity.sql

`public.user_profiles` is empty on **both** production and staging (checked
2026-07-18). Since `is_org_admin`/`is_org_member` both key off a matching
`user_profiles` row, every admin-gated write policy in `040_policies.sql`
should currently deny everyone on both databases if those are really the
live policies. The app functions day-to-day regardless, which means the
*actual* enforcing policies on both databases are probably not the granular
`is_org_admin`-gated set this folder documents — likely something wider set
up later without a matching migration file (again, drift). Before writing
`100_rls_parity.sql`, get the real current policy set from both databases:

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

Run on both prod and staging and diff the results — don't assume
`040_policies.sql` reflects reality.

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
