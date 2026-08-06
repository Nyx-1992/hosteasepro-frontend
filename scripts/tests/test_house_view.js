#!/usr/bin/env node
/**
 * The house view: rooms drawn as a building, not listed as rows.
 *
 * WHY THIS EXISTS. "I would love even a look of a sketched house and one
 * can add floors and rooms per floor, which visualises the booking a bit!
 * Besides it's chalets etc." — and then "I am sure we can add a dropdown
 * of guest house building types!"
 *
 * Both remarks are load-bearing, and the second one saves the first. A
 * guesthouse stacks floors under one roof. A chalet park does not have
 * floors at all — it has cabins standing on grass. Drawing the second as
 * the first is the kind of wrong that makes somebody stop believing the
 * rest of the screen, so the building type is recorded and the layout
 * follows from it rather than being guessed.
 *
 * WHAT A SOURCE-READING TEST CAN SEE. Not whether the picture looks nice.
 * It guards the decisions underneath it: that the two layouts exist and
 * are driven by type, that "floor" is a label rather than a number, and
 * that adding a room cannot quietly become adding a property.
 *
 * The room states were checked against the live database with four rooms
 * on two floors — one mid-stay, one arriving, one departing with a clean
 * booked, one empty — and came back occupied / arriving / departing /
 * free, grouped by floor.
 *
 * Run: node scripts/tests/test_house_view.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const app = read('demo', 'index_fixed.html');
const mig = read('supabase', 'migrations', '911_room_layout.sql');

const fail = [];
const ok = (name, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) { if (detail) console.log('      ' + detail); fail.push(name); }
};

// ══ A CHALET PARK IS NOT A BLOCK OF FLATS ═════════════════════════
console.log('\n── Two layouts, chosen by what the place actually is ──');

const types = app.slice(app.indexOf('const BUILDING_TYPES = ['), app.indexOf('];', app.indexOf('const BUILDING_TYPES = [')));
['guesthouse','bnb','hotel','backpackers','apartment_block'].forEach(k =>
  ok(`${k} stacks its floors`, new RegExp(`'${k}'[^\\n]*layout: 'stacked'`).test(types)));
['chalets','cottages','lodge','farmstay','camping'].forEach(k =>
  ok(`${k} stands as detached units`, new RegExp(`'${k}'[^\\n]*layout: 'detached'`).test(types)));

ok('the renderer actually branches on the layout',
   /bt\.layout === 'stacked' \? stacked\(\) : detached\(\)/.test(app));
// Drawn in SVG now rather than assembled from divs — "I hoped the view
// will be more in a sketch view, which looks nicer in black and grey and
// white, or at least not like a box."
ok('stacked draws one roof spanning the whole building',
   /const stackedSvg = \(\)[\s\S]{0,900}L \$\{w \/ 2\} 8/.test(app));
ok('detached gives every unit its own roof, standing on a ground line',
   /const detachedSvg = \(\)[\s\S]{0,900}L \$\{x \+ W \/ 2\} \$\{y\}/.test(app) &&
   /\/\/ the ground/.test(app));
ok('the hand-drawn look is a filter, so it degrades to clean lines',
   /feTurbulence/.test(app) && /feDisplacementMap/.test(app) && /filter="url\(#hvRough\)"/.test(app));
// A picture that only works in colour stops working when it is printed,
// photocopied, or looked at by somebody colour-blind.
ok('state is carried by fill weight, not by hue',
   /STATE IS FILL WEIGHT, NOT HUE/.test(app) &&
   /stroke-dasharray="5 4"/.test(app) &&
   /r\.state === 'departing'[\s\S]{0,200}<line /.test(app));

// The word for a group changes with the type — a chalet park has clusters,
// not floors, and labelling them "Floor 2" is the fiction this avoids.
ok('the word for a group follows the building type',
   /floorWord: 'cluster'/.test(types) && /floorWord: 'floor'/.test(types) && /floorWord: 'area'/.test(types));
ok('the form asks for that word, not the literal "floor"',
   /cap\(parentType\.floorWord\)/.test(app));

// ══ FLOOR IS A LABEL, NOT A NUMBER ════════════════════════════════
console.log('\n── The grouping survives contact with a chalet ──');
ok('floor is stored as text', /ADD COLUMN IF NOT EXISTS floor\s+text/.test(mig));
ok('the migration says why it is not an integer',
   /chalet park has no storeys|chalet park has clusters/i.test(mig));
ok('rooms have an explicit order', /sort_order\s+int NOT NULL DEFAULT 0/.test(mig));
ok('the reason is recorded — room names do not sort',
   /Room 10" sorts before "Room 2/.test(mig));
ok('building_type is constrained to the known kinds',
   /properties_building_type_check/.test(mig) && /'chalets','cottages','lodge','farmstay','camping'/.test(mig));
ok('a room with no group still renders',
   /groups\.find\(x => x\.key === key\)/.test(app) && /if \(g\.key\)/.test(app));
ok('previously used groups are offered as suggestions, not forced',
   /datalist id="pr-floor-list"/.test(app) && /knownFloors/.test(app));

// ══ THE STATES A MORNING NEEDS ════════════════════════════════════
console.log('\n── What each room is doing today ──');
const fn = mig.slice(mig.indexOf('FUNCTION public.rooms_on_date'));
ok('four states: free, arriving, departing, occupied',
   /'free'/.test(fn) && /'arriving'/.test(fn) && /'departing'/.test(fn) && /'occupied'/.test(fn));
// A same-day turnover matches two stays. The departing one is the one with
// work in it, so it wins.
ok('a same-day turnover shows as departing, not arriving',
   /ORDER BY CASE WHEN b\.co = p_date THEN 0 ELSE 1 END/.test(fn));
ok('cancelled stays and owner blocks are not guests',
   /status,''\) <> 'cancelled'/.test(fn) && /is_owner_block,false\) = false/.test(fn));
// The broom badge is gone: it said a clean existed and refused to say
// whose, which is the question actually being asked in the morning.
ok('a booked clean is NAMED on the tile',
   /clean_due/.test(fn) && /hv-cell-clean/.test(app) && /dh-clean/.test(app));
// The cost that matters is per ROOM, not per screen. Two screens draw a
// house — the dashboard card and the full view — and each makes one call
// per building. An earlier version of this check counted call sites and
// so failed the moment the dashboard card was added, which was a correct
// change; the check was measuring the wrong thing.
// "Not inside a .map" was too blunt — the dashboard legitimately maps over
// BUILDINGS, one call each. What must never happen is a call per room, so
// name the collection instead of banning the construct.
const roomsCalls = (app.match(/db\.rpc\('rooms_on_date'/g) || []).length;
const perRoomLoop = /\b(rows|rooms)\.map\([^)]*=>[\s\S]{0,300}db\.rpc\('rooms_on_date'/.test(app);
ok('one call per building, never one per room',
   roomsCalls >= 1 && roomsCalls <= 2 && !perRoomLoop,
   roomsCalls + ' call site(s), per-room loop: ' + perRoomLoop);
ok('the dashboard fans out over buildings, one call each',
   /buildings\.map\(async b =>[\s\S]{0,300}db\.rpc\('rooms_on_date'/.test(app));
ok('the date can be moved, including back', /function hvNudge/.test(app) && /hvNudge\(-1\)/.test(app));
ok('the function is scoped to the signed-in org',
   /p\.org_id = public\.current_org_id\(\)/.test(fn));

// ══ ADDING A ROOM CANNOT BECOME ADDING A PROPERTY ═════════════════
console.log('\n── The two things the form must not confuse ──');
ok('adding a room records which building it is in',
   /function openAddRoom/.test(app) && /row\.parent_id = _pendingRoomParent/.test(app));
// _pendingRoomParent is module state, so a stale value would silently
// attach the NEXT property to a building as a room.
ok('the pending parent is cleared after saving',
   /_pendingRoomParent = null;\s*\/\/ or the next "Add Property"/.test(app));
ok('and cleared when Add Property is pressed',
   /function openAddProperty\(\) \{ _pendingRoomParent = null;/.test(app));
// building_type is only on the property form. Sending it for a room would
// blank it on every edit, because the input is not on screen.
ok('a field is only saved when its input is actually on screen',
   /const btEl = document\.getElementById\('pr-btype'\);\s*\n\s*if \(btEl\)/.test(app) &&
   /const floorEl = document\.getElementById\('pr-floor'\);\s*\n\s*if \(floorEl\)/.test(app));
ok('the form is titled for what is being made',
   /Add a room to/.test(app) && /'Edit room'/.test(app));

// ══ DAILY SERVICING ═══════════════════════════════════════════════
console.log('\n── Servicing ──');
ok('the daily-service toggle is on the property form', /id="pr-daily"/.test(app));
ok('it is saved', /daily_service: !!document\.getElementById\('pr-daily'\)\.checked/.test(app));
ok('the form explains arrival and departure are already covered',
   /Arrival and\s*\n?\s*departure days are already covered/.test(app));
ok('the plan button only appears once something is serviced daily',
   /const anyDaily = _propertiesRaw\.some\(p => p\.daily_service\)/.test(app) && /if \(anyDaily\)/.test(app));
ok('pressing it twice is safe and says so',
   /Safe to press twice/.test(app) && /already planned/.test(app));

// ══ WHO IS CLEANING IT ════════════════════════════════════════════
//
// "It looks nice, just seems a bit complicated? How do I see the cleaner
// for the full day there?"
//
// Both halves were fair. The tile showed a broom and refused to say whose,
// and the screen carried five legend entries and three lines of prose
// explaining itself.
console.log('\n── The cleaner is named, not implied ──');
ok('the room state query returns who is cleaning', /clean_by/.test(app));
ok('the tile names them rather than showing a bare broom',
   /const clean = r\.clean_by \? firstName\(r\.clean_by\)/.test(app));
// A clean nobody is on is not the same as no clean, and it is the one
// that needs doing something about.
ok('a clean with nobody on it says so',
   /\(r\.clean_due \? 'unassigned' : ''\)/.test(app) && /hv-cell-clean\.unassigned/.test(app));
ok('the dashboard card says the same thing', /dh-clean\.unassigned/.test(app));

console.log('\n── The cleaner\'s whole day ──');
ok('the list can group by cleaner, not just by job',
   /function hkGroupBy/.test(app) && /_hkBy === 'cleaner'/.test(app));
ok('both groupings are offered as buttons',
   /hkGroupBy\('task'\)/.test(app) && /hkGroupBy\('cleaner'\)/.test(app));
// Unassigned is the only group that needs a decision, so it goes first.
ok('unassigned work sorts to the top of the by-cleaner view',
   /\(a \? 1 : -1\) - \(b \? 1 : -1\)/.test(app) && /Nobody assigned/.test(app));
ok('by-cleaner shows what the job is, by-job shows who has it',
   /byCleaner\s*\n?\s*\? escHtml\(HK_TASK\[r\.task\]\[2\]\)/.test(app));

console.log('\n── Less on screen ──');
ok('the legend hides states that are not happening today',
   /return n \? `<span><span class="hv-key"/.test(app));
// "2026/07/31" is a date you decode; "Sun 2 Aug" is one you read.
ok('the date reads as a day, not as a number',
   /function hvDayLabel/.test(app) && /'Today' : diff === 1 \? 'Tomorrow'/.test(app));
// btn-sm is a 24px target you have to aim at.
ok('the day steppers are a real tap target',
   /class="hv-step"/.test(app) && /\.hv-step\{width:34px;height:34px/.test(app));
ok('the explanatory paragraph is gone unless it is useful',
   !/tap one to edit it/.test(app));

// ══ IT HAS TO BE WHERE SHE LOOKS ══════════════════════════════════
//
// "Where is my little catch with the amount of chalets / guest rooms to
// visually display occupied rooms?" — it was behind Settings → Properties
// → House view, which is where you put something you CONFIGURE, not
// something you look at every morning. Being buried is a bug in a screen
// whose whole value is the glance.
console.log('\n── On the dashboard, not in settings ──');
ok('the dashboard has a slot for it', /id="dash-house"/.test(app));
ok('renderDashboard fills it',
   /renderDashboardPropertyColumns\(\);\s*\n\s*renderDashHouses\(\);/.test(app));
// Properties usually finish loading after the first dashboard render, so
// without this the card only appears on the second visit to the tab —
// which reads exactly like it not existing.
ok('it refreshes once properties have loaded',
   /if \(typeof renderDashHouses === 'function'\) renderDashHouses\(\);/.test(app));
ok('the tiles open the full house view', /onclick="openHouseView\('\$\{b\.id\}'\)"/.test(app));
ok('an agency with no rooms sees nothing at all',
   /if \(!buildings\.length \|\| !db\) \{ el\.innerHTML = ''; return; \}/.test(app));
ok('it counts occupied against the total',
   /\$\{full\} of \$\{rows\.length\}/.test(app));
ok('it says chalets or rooms depending on the building',
   /bt\.layout === 'detached' \? 'chalets' : 'rooms'/.test(app));
// One building failing to load must not blank the whole dashboard.
ok('a building that will not load does not take the dashboard with it',
   /a building that will not load must not blank the dashboard/.test(app));

// ══ THE MORNING SHEET ═════════════════════════════════════════════
//
// "With guesthouses we ask if daily cleaners are on board, since this
// would give them a list of cleaning required." The flag was never the
// point; the list is.
console.log('\n── The cleaning list ──');
const hk = read('supabase', 'migrations', '912_housekeeping_list.sql');

ok('the question is asked once about the building, not per room',
   /Do you have cleaners in daily\?/.test(app));
ok('and it cascades to every room in one statement',
   /set_daily_service/.test(hk) && /db\.rpc\('set_daily_service'/.test(app));
ok('a room can still differ from its building',
   /Overrides the building for this room/.test(app));
// A guesthouse that services room 3 daily and room 4 weekly does not
// exist; a self-catering cottage in the garden of one does.
ok('the migration says why it is one question',
   /No guesthouse services room 3 daily and room 4 weekly/.test(hk));

ok('three jobs: turn over, prepare, service',
   /'turnover'/.test(hk) && /'prepare'/.test(hk) && /'service'/.test(hk));
// A departure has a deadline — somebody may be arriving into that room
// this afternoon — so it is done first.
ok('turnovers are listed first', /WHEN 'turnover' THEN 0/.test(hk));
ok('service only appears where cleaners are in daily',
   /WHEN s\.daily_service\s*\n\s*AND EXISTS/.test(hk));

// THE important property of this list.
ok('the sheet is derived from bookings, not from generated cleans',
   /Derived from bookings/.test(hk) &&
   !/FROM public\.domestics[\s\S]{0,200}AS task/.test(hk));
ok('and says why — a scheduled-only list hides the room you forgot',
   /hides the room you forgot|hides the room nobody scheduled/.test(hk));
ok('where a clean exists, who has it is shown', /assigned_to/.test(hk) && /unassigned/.test(app));
ok('rooms needing nothing are left out', /WHERE w\.task IS NOT NULL/.test(hk));

ok('the house view can switch to the list and back',
   /function hvToggleView/.test(app) && /_hvMode === 'clean'/.test(app));
ok('reopening always shows the picture first',
   /_hvMode = 'house';   \/\/ reopening always shows the picture first/.test(app));

// ══ THE LIST STILL MAKES SENSE ════════════════════════════════════
console.log('\n── The property list ──');
ok('rooms are drawn under their building, indented',
   /roomsOf\(p\.id\)\.map\(r => line\(r, true\)\)/.test(app) && /padding-left:18px/.test(app));
ok('a room sorts under its guesthouse, not by its own name',
   /sortKey = p => \(p\.parent_id \?/.test(app));
ok('House view is offered only on something with rooms',
   /\$\{!isRoom && \(p\.building_type \|\| kids\.length\) \?[^\n]*openHouseView/.test(app));

// ── Result ────────────────────────────────────────────────────────
console.log('');
if (fail.length) {
  console.log(`✗ ${fail.length} check(s) failed:`);
  fail.forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('✓ house view: all checks passed');
