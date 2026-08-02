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
ok('stacked draws one roof over the whole building',
   /const stacked = \(\)[\s\S]{0,300}hv-roof-wrap[\s\S]{0,200}hv-building/.test(app));
ok('detached gives every unit its own roof on a plot',
   /const detached = \(\)[\s\S]{0,400}hv-plot[\s\S]{0,300}hv-unit-roof/.test(app));

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
   /g\.key \?/.test(app) && /groups\.find\(x => x\.key === key\)/.test(app));
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
ok('a booked clean is shown on the tile', /clean_due/.test(fn) && /hv-broom/.test(app));
ok('one call draws the whole house, not one per room',
   /rooms_on_date/.test(app) && (app.match(/db\.rpc\('rooms_on_date'/g) || []).length === 1);
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
