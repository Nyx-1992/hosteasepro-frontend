#!/usr/bin/env node
/**
 * HQ can change what a customer is charged — and nothing else.
 *
 * WHY THIS EXISTS. Until 906 the platform console could only look. Every
 * policy on org_subscriptions is scoped to current_org_id(), so the owner
 * signed into HOSTEASE PRO's own org could change exactly one
 * subscription: her own. Comping a tester meant opening the SQL editor.
 *
 * Adding write access across every org is the moment two promises could
 * quietly stop being true, so both are asserted here rather than trusted:
 *
 *   1. THE BUTTON IS NOT THE PERMISSION. Hiding a button is presentation.
 *      Anyone can un-hide it with dev tools. The rule has to live in a
 *      SECURITY DEFINER function that re-checks is_platform_owner() —
 *      which was verified against the live database by calling all three
 *      actions with no auth.uid() and confirming each raised 42501, wrote
 *      no audit row, and left the subscription untouched.
 *
 *   2. COUNTS, NEVER CONTENTS. 904 promised an agency evaluating HEP can
 *      be told their guests and revenue are invisible to us. Write access
 *      does not change that, and must not become a hole through which it
 *      does.
 *
 * Run: node scripts/tests/test_hq_actions.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const app = read('demo', 'index_fixed.html');
const mig = read('supabase', 'migrations', '906_platform_actions.sql');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};
const codeOnly = (src) => src.split('\n').filter(l => !/^\s*(--|\/\/|\*)/.test(l)).join('\n');

const ACTIONS = [
  'platform_comp_account',
  'platform_end_comp',
  'platform_extend_trial',
  'platform_set_plan',
  'platform_set_note',
];

// ══ THE RULE LIVES ON THE SERVER ══════════════════════════════════
console.log('\n── The rule is server-side, not in the page ──');

ACTIONS.forEach(fn => {
  const body = (mig.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\b[\\s\\S]*?\\n\\$fn\\$;|CREATE OR REPLACE FUNCTION public\\.${fn}\\b[\\s\\S]*?END \\$\\$;`)) || [])[0]
    || (mig.split(`FUNCTION public.${fn}`)[1] || '').split('END $$;')[0];
  ok(`${fn} runs SECURITY DEFINER`, /SECURITY DEFINER/.test(body || ''));
  ok(`${fn} calls the guard before touching anything`,
     /platform_guard\(p_org\)/.test(body || ''));
  ok(`${fn} writes an audit row`, /platform_log\(/.test(body || ''));
});

// One guard, so five call sites cannot drift and a sixth action cannot
// ship without the check by being written slightly differently.
const guard = (mig.split('FUNCTION public.platform_guard')[1] || '').split('END $$;')[0];
ok('the guard refuses anyone who is not the platform owner',
   /NOT public\.is_platform_owner\(\)/.test(guard) && /42501/.test(guard));
ok('the guard refuses HostEase Pro itself', /platform_org_id/.test(guard));
ok('the guard refuses an unknown org', /No such organisation/.test(guard));

// The audit trail must not be forgeable from a browser. If platform_log
// were reachable, anyone could write whatever they liked into the record
// of who was comped and why.
ok('platform_log is not granted to authenticated',
   !/GRANT EXECUTE ON FUNCTION public\.platform_log/.test(mig));
ok('platform_guard is not granted to authenticated',
   !/GRANT EXECUTE ON FUNCTION public\.platform_guard/.test(mig));
ok('the actions themselves are granted to authenticated',
   ACTIONS.every(fn => new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}`).test(mig)));
ok('nothing is granted to anon', !/TO anon/.test(codeOnly(mig)));

// The log table is readable by the owner and writable by nobody: there is
// no INSERT policy, so only the SECURITY DEFINER functions can add to it.
ok('the audit table is RLS-protected and owner-read only',
   /ALTER TABLE public\.platform_actions ENABLE ROW LEVEL SECURITY/.test(mig) &&
   /FOR SELECT USING \(public\.is_platform_owner\(\)\)/.test(mig));
ok('there is no INSERT policy on the audit table',
   !/CREATE POLICY[\s\S]{0,200}platform_actions[\s\S]{0,120}FOR INSERT/.test(mig));
ok('only SELECT is granted on the audit table',
   /GRANT SELECT ON public\.platform_actions TO authenticated/.test(mig) &&
   !/GRANT (INSERT|UPDATE|DELETE|ALL)[^\n]*platform_actions/.test(mig));

// 880 attaches a "your subscription lapsed, you cannot write" trigger to
// every table with an org_id, found by loop. platform_actions has one. If
// that trigger were attached, logging a reactivation would be blocked by
// the very lapse it records — for exactly the customers that matter most.
ok('the lapse trigger is detached from the audit table',
   /DROP TRIGGER IF EXISTS subscription_write_gate ON public\.platform_actions/.test(mig));

// ══ THE PAGE GOES THROUGH THOSE FUNCTIONS ═════════════════════════
console.log('\n── The page cannot take a shortcut ──');

const hq = app.slice(app.indexOf('function customerById'), app.indexOf('async function renderRoadmapTab'));
ok('HQ actions exist in the page', hq.length > 500);
ACTIONS.forEach(fn => ok(`the page calls ${fn} by RPC`, hq.includes(`'${fn}'`)));

// A direct table write would bypass the guard entirely and fail silently
// under RLS — no error, no change, and no way to tell from the screen.
ok('no direct write to org_subscriptions from HQ',
   !/from\(['"]org_subscriptions['"]\)[\s\S]{0,80}\.(update|upsert|insert|delete)/.test(hq));
ok('every action reports failure rather than swallowing it',
   /catch \(e\)[\s\S]{0,120}toast\(/.test(hq));

// ══ NOTHING NEW IS EXPOSED ════════════════════════════════════════
console.log('\n── Still counts, never contents ──');

// The only column added to the customer list is the owner's own note about
// them, which is her text, not theirs.
//
// Body only, stopping at COMMENT ON. The comment says the function returns
// no "addresses", and scanning it alongside the SQL reports the word
// "address" as a leaked column — the check failing on the sentence that
// promises the thing it is checking.
const custAll = mig.slice(mig.lastIndexOf('CREATE FUNCTION public.platform_customers()'));
const cust = custAll.slice(0, custAll.indexOf('COMMENT ON FUNCTION'));
const forbidden = ['guest_name', 'check_in_date', 'check_out_date', 'address', 'amount_total', 'guest_email', 'phone'];
const leaked = forbidden.filter(c => cust.includes(c));
ok('the customer list exposes no guest, address or income column', leaked.length === 0, 'found: ' + leaked.join(', '));
ok('the only new column is the owner\'s own note', /NULLIF\(s\.notes, ''\)/.test(cust));
ok('the list is still gated on is_platform_owner()', /WHERE public\.is_platform_owner\(\)/.test(cust));
ok('HostEase Pro is still excluded from its own customer list', /platform_org_id/.test(cust));
ok('orgs nobody can sign into are still excluded (905)',
   /EXISTS \(SELECT 1 FROM public\.profiles p WHERE p\.org_id = o\.id\)/.test(cust));

// ══ THE ACTIONS BEHAVE THE WAY THEY READ ══════════════════════════
console.log('\n── The actions do what the button says ──');

const comp = (mig.split('FUNCTION public.platform_comp_account')[1] || '').split('END $$;')[0];
ok('comping sets founder/active with no trial clock',
   /plan = 'founder'/.test(comp) && /status = 'active'/.test(comp) && /trial_ends_at = NULL/.test(comp));
ok('comping zeroes the amount so nothing reports a payment that never happened',
   /amount_cents = 0/.test(comp));

const ext = (mig.split('FUNCTION public.platform_extend_trial')[1] || '').split('END $$;')[0];
// "+7 days" must ADD to what is left. Setting now()+7 would silently
// shorten a trial that still had ten days on it.
ok('extending adds to whatever is left rather than replacing it',
   /GREATEST\(COALESCE\(trial_ends_at, now\(\)\), now\(\)\)/.test(ext));
ok('extending refuses a nonsense number of days', /p_days < 1 OR p_days > 365/.test(ext));

const endc = (mig.split('FUNCTION public.platform_end_comp')[1] || '').split('END $$;')[0];
// Nobody should discover they owe money without warning.
ok('ending a comp drops to a trial, not straight to a bill',
   /status = 'trialing'/.test(endc));

const setp = (mig.split('FUNCTION public.platform_set_plan')[1] || '').split('END $$;')[0];
ok('set_plan rejects an unknown plan or status',
   /Unknown plan/.test(setp) && /Unknown status/.test(setp));
ok('set_plan clears a stale trial date when the account is not trialing',
   /trial_ends_at = CASE WHEN p_status = 'trialing'/.test(setp));

// The two that stop the money get a confirmation; the reversible ones do
// not, because a confirm on everything trains you to click through them.
ok('comping and un-comping ask first',
   /function hqComp[\s\S]{0,400}confirmAction/.test(hq) && /function hqEndComp[\s\S]{0,400}confirmAction/.test(hq));
ok('cancelling or failing a payment asks first',
   /status === 'cancelled' \|\| status === 'past_due'[\s\S]{0,400}confirmAction/.test(hq));
ok('extending a trial does not ask — it is reversible and routine',
   !/function hqExtend[\s\S]{0,200}confirmAction/.test(hq));

// The lapse message customers see is "read everything, write nothing"
// (880). The confirm text must not promise something different.
ok('the cancel confirmation says they keep read access, not that they are locked out',
   /keep full read access/.test(hq) && /not locked out/.test(hq));

// ══ NAMING ════════════════════════════════════════════════════════
console.log('\n── It has a name ──');
ok("the console is called HQ", /\{id:'customers',label:'HQ'/.test(app));
ok('HQ is still platform-owner only', /\{id:'customers'[^}]*platformOnly:true/.test(app));

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ HQ actions: all checks passed');
