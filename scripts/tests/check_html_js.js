#!/usr/bin/env node
/**
 * Load-time safety check for the inline JavaScript in
 * demo/index_fixed.html.
 *
 *   1. SYNTAX — does it parse.
 *   2. TEMPORAL DEAD ZONE — does it throw "Cannot access X before
 *      initialization" when actually executed.
 *
 * WHY THIS EXISTS. A const was consolidated into one place
 * (BOOKING_SITE_URL) and declared next to UUID_MAP, which sits AFTER the
 * CLIENT_BRAND object literal that consumes it. The file was perfectly
 * valid syntax, so a parse check passed — but `const` is hoisted and
 * unusable until its declaration runs, so the page threw on load, the
 * whole inline script aborted, the Supabase client was never created, and
 * NOBODY COULD LOG IN. Syntax-valid, runtime-fatal, and it reached
 * production.
 *
 * HOW. A first attempt used regex to spot "used above declared", but it
 * flagged uses inside function bodies — which are fine, since a function
 * body is not evaluated at load. False alarms get a check ignored, so
 * instead this EXECUTES the script against a permissive stub global and
 * watches for the one error that matters. Anything else the script
 * complains about in a fake browser is expected and ignored; only a real
 * temporal-dead-zone failure is reported.
 *
 * Run: node scripts/tests/check_html_js.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '../../demo/index_fixed.html');
const html = fs.readFileSync(FILE, 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => ({ code: m[1], at: html.slice(0, m.index).split('\n').length }));

/**
 * A global that answers to anything: every property read returns another
 * such object, and it is callable, indexable and constructible. Lets the
 * script run far enough to hit its top-level declarations without a real
 * DOM.
 */
function makeStub() {
  const fn = function () { return makeStub(); };
  return new Proxy(fn, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === 'then') return undefined;               // not a thenable
      if (prop === Symbol.iterator) return function* () {};
      return makeStub();
    },
    set() { return true; },
    has() { return true; },
    apply() { return makeStub(); },
    construct() { return makeStub(); },
  });
}

let failures = 0;

blocks.forEach((b, i) => {
  const label = `inline script #${i + 1} (starts line ${b.at})`;

  try {
    new vm.Script(b.code);
  } catch (e) {
    console.log(`✗ ${label}: SYNTAX — ${e.message}`);
    failures++;
    return;
  }

  const sandbox = {
    window: { HEP_CONFIG: { supabaseUrl: 'https://stub.supabase.co', supabaseAnonKey: 'stub' } },
    document: makeStub(),
    navigator: makeStub(),
    localStorage: makeStub(),
    location: makeStub(),
    console: { log(){}, warn(){}, error(){}, info(){} },
    setTimeout(){}, setInterval(){}, clearTimeout(){}, clearInterval(){},
    fetch: () => new Promise(() => {}),
    supabase: makeStub(),
    pdfjsLib: makeStub(),
    html2canvas: makeStub(),
    jspdf: makeStub(),
    alert(){}, confirm(){ return false; }, prompt(){ return null; },
    addEventListener(){}, removeEventListener(){},
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  Object.assign(sandbox.window, {
    addEventListener(){}, removeEventListener(){}, matchMedia: () => makeStub(),
    location: makeStub(), innerWidth: 1024, scrollTo(){},
  });

  try {
    vm.createContext(sandbox);
    new vm.Script(b.code).runInContext(sandbox, { timeout: 5000 });
  } catch (e) {
    const msg = String(e && e.message || e);
    if (/Cannot access '(.+?)' before initialization/.test(msg)) {
      const name = msg.match(/Cannot access '(.+?)'/)[1];
      console.log(`✗ ${label}: TEMPORAL DEAD ZONE — '${name}' is used above the line that declares it.`);
      console.log(`    This aborts the whole script at load. Move the declaration above its first use.`);
      failures++;
    }
    // Everything else is expected: the script is talking to a fake
    // browser. Only the load-order failure above is a real defect.
  }
});

console.log(failures
  ? `\n${failures} problem(s) — DO NOT DEPLOY`
  : `${blocks.length} inline script block(s): parse OK, and no const used before its declaration`);
process.exit(failures ? 1 : 0);
