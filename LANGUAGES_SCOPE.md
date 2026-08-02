# Languages — scope

**Status: scoped, not built.** Nothing in this document has been implemented.
Written because the ask was *"proceed with staff portal for the languages you
offered; admin app (HEP) I would like to offer in maybe German first"*, followed
by *"this can be scoped and doesn't have to be done now."*

Two separate jobs with very different costs. The staff portal is small and
useful today. The HEP admin app is roughly seven times the work and only pays
off once there is a customer who needs it.

---

## What already exists

This is not a greenfield job. The **client-facing property page is already
translated into five languages** and has been in production since the Czech
client was onboarded. The machinery works:

| Piece | Where | What it does |
|---|---|---|
| `CLIENT_T` | `demo/index_fixed.html:12706` | Dictionary: `en`, `de`, `cs`, `pl`, `es` — ~85 keys each |
| `ct(key)` | `:12714` | Lookup with double fallback: chosen locale → English → the key itself |
| `LOCALES` | `:13533` | Display names, 10 entries |
| `profiles.locale` | migration `830` | Per-user column, `NOT NULL DEFAULT 'en'` |
| `setClientLocale()` | `:13518` | Writes the choice back to the profile |

**Correction to something I said earlier:** I flagged the language picker as
buggy — offering 10 languages when only 5 are translated. It isn't. Both places
that build the dropdown filter with `Object.keys(LOCALES).filter(l => CLIENT_T[l])`
(`:13228` and `:13668`), so only translated languages are ever offered. `LOCALES`
just carries names ready for later. There is nothing to fix.

So the pattern is proven, and the remaining work is applying it to two screens
that were built English-only.

---

## Job 1 — Staff portal (`demo/domestic.html`)

**Languages:** English, Afrikaans, Shona, isiXhosa.

The ones that matter are the ones the cleaners actually speak, which is worth
checking with them directly rather than picking by what's official.

### Size — measured, not estimated

`demo/domestic.html` is 2,071 lines.

| Layer | Count | How it gets translated |
|---|---|---|
| Static markup | 75 strings | Script sweep adds `data-t="key"`, English stays as fallback |
| Inside JS template literals | 66 strings | Hand-replaced with `t('key')` |
| `toast()` / `alert()` / `confirm()` | 9 calls | Hand-replaced |
| `.textContent =` assignments | 8 | Hand-replaced |

**≈ 150 distinct strings.** Across 4 languages, ~600 translated strings.

The 75 markup keys were already extracted once — `portal`, `greet`, `pickName`,
`enterPin`, `signOut`, `nextUp`, `thisMonth`, `myCleans`, `upcoming`,
`completed`, `back`, `noteOffice`, `submitInv`, `myAvail`, `tapDay`,
`saveAvail`, `myEarnings`, `navHome`, `navCleans`, `navAvail`, `navEarn`,
`tabSchedule`, `tabInspect`, `tabReports`, `newInspection`, `submitInspection`,
`inspectionHistory`, `overallCondition`, `excellent`, `good`, `fair`, `poor`,
`breakages`, `notes`, `tapPhotos`, `assignCleaning`, `confirmAssignment`,
`scheduledCleanings`, `cleanerActivity`, `cleanerAvail`, `turnover`,
`deepClean`, `property`, `date`, `time`, `type`, `cleaner`, `coordinator`,
`name`, `phoneWa`, `review`, `all`, `next14`, `next30`, `prev`, `next`,
`continue`, `cancel`, `viewAllHep`, `upcomingCheckouts`, `inventoryReports`,
`submittedByCleaners`, `allSubmitted`, `allCleans`, `lastInspection`,
`inspectionSubmitted`, `inspPrep`, `selectDots`.

Four more are built by JS and have no element to tag: `cleanBooked`,
`availTap`, `unavail`, `checkoutClean`.

### Things that will bite

1. **Hardcoded English month names.** `MONTHS` and `MONTHS_S` at
   `domestic.html:675-676`. These are arrays, not markup — a `data-t` sweep
   walks straight past them, and the calendar would stay in English while
   everything around it translated.
2. **Hardcoded `'en-ZA'`.** `domestic.html:1088` formats dates with a fixed
   locale. Needs to follow the user's choice.
3. **English pluralisation baked into templates.** 2 instances of
   `clean${n!==1?'s':''}`. Afrikaans is close enough to survive this; Shona and
   isiXhosa are not — they don't form plurals by adding *s*. Those strings need
   a full singular and a full plural form, not a suffix.
4. **Service worker cache.** `demo/sw.js`, registered at `domestic.html:2055`.
   Cleaners' phones hold the old page. A language release that doesn't bump the
   cache version means they keep seeing English and conclude it didn't work.
   This has to be part of the release, not noticed afterwards.
5. **No login to hang the choice on.** Cleaners sign in with a PIN against
   `team_contacts`, not `auth.users`, so `profiles.locale` doesn't apply to
   them. The choice goes in `localStorage`, keyed per portal — or a `locale`
   column on `team_contacts` if it should follow them across devices. The
   `localStorage` version is a line of code; the column is a migration. Start
   with `localStorage`.

### Translation quality — read this before shipping

I can write Afrikaans that reads correctly. **Shona and isiXhosa I can produce,
but they should be read by a native speaker before any cleaner relies on them.**
These are not decorative strings — they are instructions about entering and
working in someone's home, and a sentence that lands slightly wrong is an
operational problem, not a cosmetic one.

The cheapest and best proofread is already on the payroll: ask the cleaners to
read their own language back before it goes live. It costs one conversation,
it's more accurate than anything paid, and it makes the people using the tool
part of building it.

### Effort

**Two sessions.** One to build the machinery, run the sweep and do Afrikaans;
one to add Shona and isiXhosa, fix the month arrays and pluralisation, bump the
service worker, and test on a real phone.

---

## Job 2 — HEP admin app (`demo/index_fixed.html`), German first

### Size — measured

15,194 lines.

| Layer | Count |
|---|---|
| Static markup | 326 strings |
| Markup attributes (`placeholder`, `title`, `aria-label`, `alt`) | 34 |
| Inside JS template literals | 596 |
| `toast()` / `alert()` / `confirm()` | 146 calls |
| `.textContent =` assignments | 88 |

**≈ 1,000 distinct strings — and about two-thirds of them live inside
JavaScript.**

That ratio is the whole story. Markup is cheap: a script tags elements with
`data-t`, the English stays put as a fallback, and if the dictionary misses a
key nothing breaks — you get an English word on an otherwise German screen.
Reversible, low risk, minutes of work.

Strings inside a template literal have no element to tag. Every one is a hand
edit, and a mistake is silent: a typo'd key renders the key, or `undefined`, on
a live screen belonging to a paying customer. There is no sweep that makes this
part safe — only care and testing.

### Things that will bite

1. **`MONTHS` at `index_fixed.html:2462`** — same hardcoded English array.
2. **18 instances of English `'s'` pluralisation** in template literals.
   German plurals aren't formed by suffixing *s*, so each is a real string pair.
3. **German runs 20–35% longer than English.** Buttons, table headers and the
   nav will overflow. *Übersichtsseite* does not fit where *Dashboard* fits.
   Expect a layout pass, not just a dictionary — and that pass is a second,
   separate cost that a string count doesn't show.
4. **Currency and number format.** The app is South African: `R`, `en-ZA`
   grouping. A German user reading `R 1,250.00` will read *one thousand two
   hundred and fifty*, which is correct, but German convention is
   `1.250,00` — the separators swap meaning. Getting this half-right is worse
   than leaving it English.
5. **Ship it tab by tab.** A half-translated app is worse than an English one,
   because the user can't tell whether a missing translation is a bug or a
   feature they haven't found. Each tab should go out complete.

### Effort

**Four to six sessions for German.** The 360 markup strings are one session;
the ~640 JS strings are the rest, plus the layout pass.

**About one session per additional language after that** — the machinery and
the key names already exist, so French, Dutch, Portuguese and Italian become
dictionary edits. `LOCALES` already carries their names.

---

## Recommendation

**Do the staff portal. Leave HEP-in-German until a German customer asks.**

The staff portal is a fifth of the work and helps people who are struggling
today — cleaners reading job instructions in their second or third language.
It's also a straight selling point in this market: no South African competitor
is offering a cleaner-facing app in isiXhosa, and it demonstrates the thing HEP
claims about itself, which is that it was built by someone who runs the
operation rather than someone who read about it.

HEP-in-German is real work with no revenue attached to it yet. Because each
language after the first costs about a session, the right time to build it is
when a German-speaking prospect asks — the answer *"yes, give me a week"* is
worth more than a finished German UI nobody has signed up for. What makes that
answer credible is doing the staff portal first, since it builds the machinery
that the HEP work reuses.

---

## Explicitly out of scope

**Guest-facing message templates are not part of this.** Check-in
instructions, mid-stay messages and review requests go out under the agency's
brand to paying guests, and an awkwardly translated sentence there costs a
booking rather than a moment's confusion. That is a separate decision with a
different quality bar — human-written per language, not swept and machine-
translated alongside the UI.

---

*Roadmap: `p3-35` (staff portal) and `p3-36` (HEP German).*
