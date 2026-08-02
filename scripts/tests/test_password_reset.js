#!/usr/bin/env node
/**
 * There is a way back into an account.
 *
 * WHY THIS EXISTS. Owner, 2026-08-02, looking at the sign-in screen: "just
 * realized we will need a forgot my password function too." There was none.
 * An agency that forgets its password had to email someone and wait — and
 * HEP is sold to people who have never met us, so "reply and we will reset
 * it by hand" is not a product, and it is no help at 11pm on a Sunday when
 * a cleaner needs the schedule.
 *
 * THE TWO THINGS MOST EASILY GOT WRONG, both pinned here:
 *
 *   IT MUST NOT SAY WHETHER AN ACCOUNT EXISTS. "No account with that email"
 *   turns the box into a way to enumerate customers one address at a time.
 *   The message is identical either way, including when the call fails.
 *
 *   restoreSession() MUST STAND ASIDE. A recovery link carries a real, if
 *   limited, session. Without the guard the page signs them into the app and
 *   the password they came to change never gets changed — the reset appears
 *   to work and silently does nothing.
 *
 * Behaviour was exercised in a real browser: the link, the empty-email case
 * sending nothing, the message wording, the recovery URL showing a
 * set-password form instead of the app, and all three validation rules.
 *
 * Run: node scripts/tests/test_password_reset.js
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'demo', 'index_fixed.html'), 'utf8');

const fail = [];
const ok = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) fail.push(name); };

console.log('\n── Getting a link ──');
ok('the sign-in card offers it', /Forgot your password\?/.test(html));
ok('it is wired to the handler', /onclick="startPasswordReset\(\);return false;"/.test(html));
ok('it asks Supabase to send the email', /resetPasswordForEmail\(email/.test(html));
// Built from the current origin: hardcoding one host breaks the link on
// every other deployment, and it must be on Supabase's allow-list.
ok('the return link is built from the current origin',
   /redirectTo:\s*location\.origin/.test(html));

console.log('\n── Not leaking who has an account ──');
ok('the confirmation is the same whether or not the address is known',
   /If there is an account for/.test(html));
// The catch must not change the message — a failure that reads differently
// from a success is the same leak by another route. So: within the handler,
// the "If there is an account" line must be the LAST thing said, with no
// other message reachable after the send is attempted.
const handler = (() => {
  const i = html.indexOf('async function startPasswordReset()');
  let d = 0;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') d++;
    else if (html[k] === '}' && --d === 0) return html.slice(i, k + 1);
  }
  return '';
})();
const says = [...handler.matchAll(/say\(/g)].map(m => m.index);
const unconditional = handler.indexOf("say('If there is an account");
ok('the handler was found', handler.length > 200);
ok('a failed send says exactly the same thing',
   unconditional > 0 && Math.max(...says) === unconditional);
// Every earlier message is a "you have not sent anything yet" guard, which
// is fine: those happen before the address is ever submitted.
ok('nothing is sent before those guards',
   handler.indexOf('resetPasswordForEmail') > says.filter(i => i < unconditional).pop());

console.log('\n── Coming back from the email ──');
ok('recovery is detected from the URL fragment', /\[#&\]type=recovery/.test(html));
// Both link shapes: implicit puts tokens in the fragment, PKCE sends ?code=.
ok('a PKCE ?code= link is recognised too', /\[\?&\]code=/.test(html));
// THE BUG THIS PINS: supabase-js has detectSessionInUrl on by default, reads
// the tokens the moment the client is created and strips them with
// history.replaceState. Reading location.hash afterwards is a race, and it
// lost — the recovery link opened the ordinary sign-in screen. The URL must
// be captured BEFORE createClient, and every check must use that copy.
const capture = html.indexOf('const INITIAL_URL');
const create  = html.indexOf('supabase.createClient(');
ok('the URL is captured before the client is created', capture > 0 && capture < create);
ok('no recovery check reads location.hash directly',
   !/type=recovery\/\.test\(location\.hash\)/.test(html));
ok('restoreSession stands aside for it',
   /async function restoreSession\(\)[\s\S]{0,500}if \(isRecoveryUrl\(\)\) return;/.test(html));
ok('the watcher runs at boot', /^watchForPasswordRecovery\(\);$/m.test(html));
ok('a set-password form is shown', /function showSetNewPassword\(\)/.test(html) && /Choose a new password/.test(html));

console.log('\n── The new password ──');
ok('at least 8 characters, same as signup', /Password must be at least 8 characters\./.test(html));
ok('letters and numbers, same as signup', /Use a mix of letters and numbers\./.test(html));
ok('the repeat must match', /Those two do not match\./.test(html));
// The token sits in the address bar, which ends up in history and in
// whatever someone pastes to a colleague when asking for help.
ok('the recovery token is cleared from the URL once used',
   /history\.replaceState\(null, '', location\.pathname\)/.test(html));

console.log(fail.length ? `\n${fail.length} FAILED\n` : '\nAll passed\n');
process.exit(fail.length ? 1 : 0);
