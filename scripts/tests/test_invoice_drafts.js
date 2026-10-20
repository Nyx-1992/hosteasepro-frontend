#!/usr/bin/env node
/**
 * Zwischenspeichern — putting a half-written invoice down and picking it up.
 *
 *   "Something Silja brought forward is when she creates the invoice, she
 *    wants to have a 'saving' button (Zwischenspeicher) when not completing
 *    the invoice at once"
 *
 * GENERATING THE PDF WAS THE ONLY THING THAT SAVED ANYTHING. Stop halfway and
 * the guest, the dates, the line items and the notes were gone on the next
 * page load. The table already had a `status` column defaulting to 'draft'
 * that nothing had ever set or read — so every finished invoice in Past
 * Documents has been labelled "draft" since the table was created, and the
 * word meant nothing.
 *
 * THREE THINGS BLOCKED A DRAFT BUTTON, and all three are the same mistake —
 * a schema that only ever imagined finished documents:
 *
 *   guest_name was NOT NULL, so a half-written invoice — which is exactly the
 *   thing that has no guest yet — could not be saved at all.
 *
 *   The address, the discount, the deposit and the two hidden date fields had
 *   no columns. Restoring a draft without them hands Silja back a form that
 *   quietly dropped her work, which is worse than no draft button.
 *
 *   The status vocabulary had no word for "the document exists now": draft,
 *   sent, paid, cancelled. 'sent' claims something about her outbox that this
 *   app cannot know.
 *
 * Run: node scripts/tests/test_invoice_drafts.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const app = read('demo', 'index_fixed.html');
const mig = read('supabase', 'migrations', '933_invoice_drafts.sql');

const codeOnly = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
const sqlCode = (s) => s.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// ══ 1. THE BUTTON ════════════════════════════════════════════════════════
console.log('\nThere is something to press');

ok('a save-draft button exists', /id="inv-draft-btn"[^>]*onclick="invSaveDraft\(\)"/.test(app));
ok('  it sits beside Download PDF, not instead of it',
   app.indexOf('inv-draft-btn') < app.indexOf('generateInvoicePDF()') &&
   /Download PDF/.test(app));
ok('  and says what it is for', /finish later/i.test(app));

const saveDraft = (app.match(/async function invSaveDraft\(\)[\s\S]*?\n\}/) || [''])[0];
ok('it writes a draft, explicitly', /status:\s*'draft'/.test(saveDraft));
ok('  double-tap guarded', /if \(_savingInvDraft\) return;/.test(saveDraft));
ok('  and refuses without a number, which is the row identity',
   /if \(!number\) \{[\s\S]{0,120}?return;/.test(codeOnly(saveDraft)));
ok('  a failed save is reported, not swallowed',
   /Could not save the draft/.test(saveDraft));

// ══ 2. A HALF-WRITTEN INVOICE HAS NO GUEST YET ═══════════════════════════
console.log('\nSaving something incomplete');

ok('guest_name is nullable now',
   /ALTER COLUMN guest_name DROP NOT NULL/.test(sqlCode(mig)));
ok('  but a finished document must still name its guest',
   /CHECK \(coalesce\(status, 'draft'\) = 'draft' OR guest_name IS NOT NULL\)/.test(sqlCode(mig)),
   'dropping the rule entirely would let a real invoice go out unaddressed');
ok('the draft saves a real null rather than inventing a name',
   /guest_name:\s*invV\('inv-guest'\) \|\| null/.test(saveDraft),
   "a placeholder 'Guest' would print on the finished document");

// Run the constraint's logic.
{
  const allowed = (status, guest) => (status || 'draft') === 'draft' || guest != null;
  ok('  proof: a nameless draft is allowed', allowed('draft', null) === true);
  ok('  proof: a nameless issued invoice is not', allowed('issued', null) === false);
  ok('  proof: an issued invoice with a guest is fine', allowed('issued', 'Silja') === true);
}

// ══ 3. NOTHING ON THE FORM IS LOST ═══════════════════════════════════════
console.log('\nEverything on the form comes back');

ok('draft_state exists to hold the whole form',
   /ADD COLUMN IF NOT EXISTS draft_state jsonb/.test(sqlCode(mig)));

const FIELDS = (app.match(/const INV_DRAFT_FIELDS = \[([\s\S]*?)\];/) || ['',''])[1];
// Every input the form actually has must be captured, or resuming drops it.
const mustHave = ['inv-number','inv-date','inv-valid','inv-ref','inv-guest','inv-company',
                  'inv-email','inv-addr','inv-prop','inv-dates','inv-checkin','inv-checkout',
                  'inv-platform','inv-discount-pct','inv-deposit-amt','inv-notes'];
const missing = mustHave.filter(f => !FIELDS.includes("'" + f + "'"));
ok('every form field is in the snapshot', missing.length === 0, 'missing: ' + missing.join(', '));

// The four that have no column of their own are the whole reason for jsonb.
['inv-addr','inv-discount-pct','inv-deposit-amt','inv-checkin'].forEach(f => {
  ok('  ' + f + ' is captured (it has no column)', FIELDS.includes("'" + f + "'"));
});

const collect = (app.match(/function invCollectDraftState\(\)[\s\S]*?\n\}/) || [''])[0];
ok('the deposit CHECKBOX is captured too, not just its amount',
   /depositEnabled/.test(collect),
   'the amount is hidden until the box is ticked, so the box has to come back ticked');
ok('line items are captured', /lines: invLines\.map/.test(collect));
ok('and the quotation/invoice choice', /docType: invType/.test(collect));

const openDraft = (app.match(/async function invOpenDraft\(id\)[\s\S]*?\n\}/) || [''])[0];
ok('reopening restores from the snapshot', /st\.fields\[fid\]/.test(openDraft));
ok('  restores the deposit checkbox and re-runs its toggle',
   /dep\.checked = !!st\.depositEnabled; invToggleDeposit\(\)/.test(openDraft),
   'without the toggle the amount field stays hidden');
ok('  restores the line items', /invLines = \(st\.lines \|\| \[\]\)/.test(openDraft));
ok('  and re-renders both the lines and the preview',
   /invRenderLines\(\);\s*\n\s*invRender\(\);/.test(codeOnly(openDraft)));
ok('  the restored number is not regenerated underneath her',
   /invNumberManual = true;/.test(openDraft),
   'auto-numbering would silently move the document to a different number');
ok('a row saved before 933 can still be reopened',
   /\} else \{[\s\S]{0,700}?data\.line_items/.test(openDraft),
   'old documents have no draft_state; falling back to the columns keeps them usable');

// ══ 4. GENERATING THE PDF ENDS THE DRAFT ═════════════════════════════════
console.log('\nOnce the PDF exists it is not a draft');

const saveRec = (app.match(/async function saveInvoiceRecord\(payload, total\)\{[\s\S]*?\n\}/) || [''])[0];
ok('the PDF path marks it issued', /status:\s*'issued'/.test(saveRec));
ok('  and clears the form snapshot', /draft_state: null/.test(saveRec),
   'a finished document carrying a half-written form is just confusing');
ok("'issued' is an allowed status",
   /'issued'::text/.test(sqlCode(mig)));
ok("and 'sent' was not pressed into service for it",
   !/status:\s*'sent'/.test(codeOnly(app)),
   'generating a PDF says nothing about whether she sent it');

ok('existing rows were corrected, not left reading "draft"',
   /UPDATE public\.invoices\s+SET status = 'issued'\s+WHERE coalesce\(status, 'draft'\) = 'draft'/.test(sqlCode(mig)),
   'every finished invoice in the table says draft today');

// ══ 5. FINDING IT AGAIN ══════════════════════════════════════════════════
console.log('\nGetting back to it');

const hist = (app.match(/async function loadInvHistory[\s\S]*?\/\/ ── DRAFTS: Zwischenspeichern/) || [''])[0];
ok('drafts sort to the top', /\.order\('status',\{ascending:true\}\)/.test(hist),
   'by date alone an old half-written one sinks out of sight');
ok('a draft row is visually distinct', /isDraft\?'background:#fffbeb'/.test(hist));
ok('every row has a way back in', /invOpenDraft\(/.test(hist));
ok('  worded for which it is', /isDraft\?'Continue':'Reopen'/.test(hist));

// The OTHER history table in this file shares the status-cell markup verbatim.
ok('the unrelated second history table was not touched',
   (app.match(/invOpenDraft/g) || []).length === 2,
   'found ' + (app.match(/invOpenDraft/g) || []).length + ' — should be the definition and one button');

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ invoice drafts: all checks passed');
