#!/usr/bin/env node
/**
 * The client dashboard's occupancy and booking maths, run against the
 * real TV House booking rows.
 *
 * WHY THIS EXISTS. The owner logged into the client view and said the
 * occupancy rate was wrong. It read 100%, from 9,393 nights in a 365-day
 * year, because the code summed every booking's `nights` column. Three
 * separate things in the data cause that, and each one had to be found
 * the hard way:
 *
 *   1. iCal PLACEHOLDER BLOCKS. Rows with status 'blocked' and a guest
 *      name of literally "Blocked" are calendar holds, not lettings.
 *      The longest is 183 nights.
 *   2. THE CARETAKER. Tino lives in the granny flat: one standing row
 *      of 333 nights that is not a letting of the house at all.
 *   3. OVERLAPPING STAYS. Two real bookings can cover the same night
 *      (11-15 Sep and 11-13 Sep). Summing lengths counts those twice.
 *
 * The fix keys everything off a day map — one night, one entry — so a
 * night cannot be counted twice and occupancy cannot exceed 100% by
 * construction. This test pins that behaviour to real rows, because
 * every one of the three problems above is invisible in tidy test data.
 *
 * The code under test is EXTRACTED FROM demo/index_fixed.html rather
 * than copied here. A copy would drift, and a drifted copy of this
 * particular calculation is how the wrong number reached the owner.
 *
 * Run: node scripts/tests/test_client_dashboard.js
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../../demo/index_fixed.html');
const html = fs.readFileSync(FILE, 'utf8');

// ── Pull the real source out of the page ──────────────────────────
function grabFn(name) {
  const start = html.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('cannot find function ' + name + ' in index_fixed.html');
  let depth = 0, i = html.indexOf('{', start);
  for (let j = i; j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}' && --depth === 0) return html.slice(start, j + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}

function grabLine(re, label) {
  const m = html.match(re);
  if (!m) throw new Error('cannot find ' + label + ' in index_fixed.html');
  return m[0];
}

function grabBetween(startMarker, endMarker) {
  const a = html.indexOf(startMarker);
  const b = html.indexOf(endMarker, a);
  if (a < 0 || b < 0) throw new Error('cannot find block ' + startMarker);
  return html.slice(a, b + endMarker.length);
}

// If either marker moves, this throws rather than silently testing an
// empty string — a green test over code it never ran is worse than none.
const dayMathSrc = grabBetween(
  'const rows = clientNormalise(bookings)',
  'const perNight = paidNights ? netTotal / paidNights : 0;'
);

const src = [
  grabLine(/^const BLOCK_PLACEHOLDERS = .*$/m, 'BLOCK_PLACEHOLDERS'),
  grabFn('isRealGuestName'),
  grabFn('isOwnerStay'),
  grabFn('isCaretaker'),
  grabFn('clientNormalise'),
  grabFn('stayNights'),
  grabLine(/^const CLIENT_PLAT_ORDER = .*$/m, 'CLIENT_PLAT_ORDER'),
  grabLine(/^const clientPlat = .*$/m, 'clientPlat'),
  'let _clientDays = {}; let _clientCalMonth = ""; let _clientChartMonths = 12;',
  'function compute(bookings, from, today, netTotal, earnings) {',
  dayMathSrc,
  '  return { nightsBooked, occupancy, windowDays, mix, mixOrder, byMonth, monthKeys,',
  '           bestKey, avgStay, perNight, paidNights, days: _clientDays, lettable, blocks };',
  '}',
  'module.exports = { compute, clientNormalise, clientPlat, isCaretaker, isOwnerStay, stayNights,',
  '  setChartMonths: n => { _clientChartMonths = n; } };',
].join('\n\n');

const mod = { exports: {} };
new Function('module', 'exports', src)(mod, mod.exports);
const { compute, clientPlat, stayNights } = mod.exports;
const setChartMonths = n => mod.exports.setChartMonths(n);

// ── The real rows, as the client's browser receives them ──────────
// Straight from the staging database: every TV House booking whose
// check-out falls on or after the window start. Trimmed of columns the
// calculation never reads.
const B = (check_in_date, check_out_date, platform, status, guest_name, notes, nights) =>
  ({ check_in_date, check_out_date, platform, status, guest_name, notes, nights, is_active: true });

const BOOKINGS = [
  B('2025-07-28','2025-08-01','booking','checked-out','Nocanda Nkululeko','Trello: 28 Jul-1 Aug TV',4),
  B('2025-08-16','2025-08-25','booking','checked-out','Tsz Wa Vincent Wong','Trello: 16-25 Aug TV',9),
  B('2025-08-27','2025-08-31','booking','checked-out','Priscilla Sithole','Trello: 27-31 Aug TV',4),
  B('2025-09-04','2025-09-09','booking','checked-out','Diergaardt Anuschka','Trello: 4-9 Sep TV',5),
  B('2025-09-05','2025-09-07','booking','checked-out','Amohelang Tshabalala','Trello: 5-7 Sep TV',2),
  B('2025-09-11','2025-09-15','booking','checked-out','Landib Du Preez','Trello: 11-15 Sep TV',4),
  B('2025-09-11','2025-09-13','booking','checked-out','Elizabeth Hakizimana','Trello: 11-13 Sep TV',2),
  B('2025-09-17','2025-09-24','booking','checked-out','Wete Morais','Trello: 17-24 Sep TV',7),
  B('2025-09-19','2025-09-28','booking','checked-out','Jairus Perumal','Trello: 19-28 Sep TV',9),
  B('2025-09-27','2025-10-05','booking','checked-out','Michael Linder','Trello: 27 Sep-5 Oct TV',8),
  B('2025-10-05','2025-10-11','booking','checked-out','Bongile Pateni','Trello: 5-11 Oct TV',6),
  B('2025-10-08','2025-10-12','booking','checked-out','Nicole van Aswegen','Trello: 8-12 Oct TV',4),
  B('2025-10-23','2025-10-27','booking','checked-out','Thomas Joseph','Trello: 23-27 Oct TV',4),
  B('2025-10-30','2025-11-03','booking','checked-out','Thobile Jane Majola','Trello: 30 Oct-3 Nov TV',4),
  B('2025-11-06','2025-11-10','booking','checked-out','Hendrickse Delvin','Trello: 6-10 Nov TV',4),
  B('2025-11-14','2025-12-12','manual','owner','Mirka & Antonin (Owners)','TV House owners visit — cleaning required on checkout',28),
  B('2025-11-30','2025-12-02','booking','checked-out','Bongani Mxoli','Trello: 30 Nov-2 Dec TV',2),
  B('2025-12-09','2025-12-12','booking','checked-out','Makole Magoro','Trello: 9-12 Dec TV',3),
  B('2025-12-20','2025-12-26','booking','checked-out','Bertrina West','Trello: 20-26 Dec TV',6),
  B('2025-12-24','2025-12-26','booking','checked-out','Adolfo Cisneros Diaz','Trello: 24-26 Dec TV',2),
  B('2025-12-27','2025-12-31','airbnb','checked-out','Pulkit Kapur','TV House Airbnb Dec 2025',4),
  B('2025-12-31','2026-01-08','booking','checked-out','Julia Audick','Trello: 31 Dec-8 Jan TV',8),
  B('2026-01-09','2026-01-12','booking','checked-out','Anesh Sookraj','Trello: 9-12 Jan TV',3),
  B('2026-01-13','2026-01-25','booking','checked-out','Klaus-Uwe Bonnke','Trello: 13-25 Jan TV',12),
  B('2026-01-15','2026-01-21','booking','checked-out','Sarah Todman','Trello: 15-21 Jan TV',6),
  B('2026-02-01','2026-12-31','manual','confirmed','Tino Caretaker','Caretaker granny flat permanent resident',333),
  B('2026-02-01','2026-02-05','booking','checked-out','Nadezda Neveikina','Trello: 1-5 Feb TV',4),
  B('2026-02-06','2026-02-12','booking','checked-out','Andreas Plattner','Trello: 6-12 Feb TV',6),
  B('2026-02-11','2026-02-13','booking','checked-out','Jenna McBean','Trello: 11-13 Feb TV',2),
  B('2026-02-13','2026-02-20','booking','checked-out','Thomas Fux','Trello: 13-20 Feb TV',7),
  B('2026-02-20','2026-02-24','booking','checked-out','Kan van Waterschoot','Trello: 20-24 Feb HOUSE',4),
  B('2026-02-28','2026-03-07','booking','checked-out','Geoffrey Woodcock','Trello: 28 Feb-7 Mar HOUSE',7),
  B('2026-03-10','2026-03-12','booking','checked-out','Barry Botha','Trello: 10-12 Mar HOUSE',2),
  B('2026-03-12','2026-03-14','booking','checked-out','Roslynne Carelsen','Trello: 12-14 Mar HOUSE',2),
  B('2026-03-17','2026-03-20','booking','checked-out','Annika Delacor','Trello: 17-20 Mar TV',3),
  B('2026-03-19','2026-03-24','booking','checked-out','Ziyaadh Khan','Trello: 19-24 Mar HOUSE',5),
  B('2026-03-26','2026-03-31','booking','checked-out','Noluthando Nkabinde','Trello: 26-31 Mar HOUSE',5),
  B('2026-03-31','2026-04-05','booking','checked-out','Radichidi Tsele','Trello: 31 Mar-5 Apr HOUSE',5),
  B('2026-04-07','2026-04-13','airbnb','checked-out','Hamza Kazee','Trello: 7-13 Apr HOUSE',6),
  B('2026-04-13','2026-04-22','booking','blocked','Clare Lang','Trello: 13-22 Apr TV 9 nights',9),
  B('2026-04-25','2026-04-30','lekkeslaap','confirmed','Dimakatso Kunene','Trello: 25-30 Apr TV',5),
  B('2026-04-25','2026-04-30','lekkeslaap','confirmed','Dimakatso',null,5),
  B('2026-05-01','2026-05-09','booking','blocked','Heinrich Winkler',null,8),
  B('2026-06-23','2026-06-29','booking','blocked','Nonduduzo Mmoni',null,6),
  B('2026-07-15','2026-07-20','booking','confirmed','Hassad Aly',null,5),
  B('2026-07-27','2026-07-31','booking','blocked','Skhosana Thandeka',null,10),
  B('2026-07-31','2026-08-28','booking','blocked','Jacob Buss',null,17),
  B('2026-07-31','2026-08-20','manual','confirmed','Skhosana Thandeka','',20),
  B('2026-11-04','2026-11-06','booking','blocked','Blocked',null,2),
  B('2026-11-06','2026-12-01','airbnb','blocked','Blocked',null,25),
  B('2026-12-01','2027-02-27','booking','blocked','Blocked',null,88),
  B('2027-04-27','2027-08-01','airbnb','blocked','🔒 Blocked',null,96),
  B('2027-08-01','2028-01-31','booking','blocked','🔒 Blocked',null,183),
];

const FROM  = '2025-07-31';
const TODAY = '2026-07-31';
// Three statements covering April and May 2026 — the shape S&N actually
// holds: LekkeSlaap and Airbnb for the same month, plus Booking.com.
const EARNINGS = [
  { platform: 'booking',    period_start: '2026-05-01', period_end: '2026-05-31', net_earnings: 34800 },
  { platform: 'airbnb',     period_start: '2026-04-01', period_end: '2026-04-30', net_earnings: 16100 },
  { platform: 'lekkeslaap', period_start: '2026-04-01', period_end: '2026-04-30', net_earnings: 5500 },
];
const NET = EARNINGS.reduce((s, e) => s + e.net_earnings, 0);
const r = compute(BOOKINGS, FROM, TODAY, NET, EARNINGS);

// ── Checks ────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✓' : '✗'} ${label}: ${JSON.stringify(got)}${ok ? '' : `  EXPECTED ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}
function checkTrue(label, cond, detail) {
  console.log(`${cond ? '✓' : '✗'} ${label}${cond ? '' : '  — ' + detail}`);
  cond ? pass++ : fail++;
}

console.log('\n── The number the owner reported as wrong ──');
check('window is a full year', r.windowDays, 365);
check('nights booked (was 9,393, then 218)', r.nightsBooked, 191);
check('occupancy (was 100%, then 60%)', r.occupancy, 52);
checkTrue('occupancy can never exceed 100%', r.occupancy <= 100, `got ${r.occupancy}`);

console.log('\n── 1. iCal placeholder blocks are not lettings ──');
checkTrue('"Blocked" rows are excluded from lettings',
  !r.lettable.some(b => /blocked/i.test(b.guest_name || '')),
  'a placeholder row was counted as a booking');
checkTrue('a placeholder night is shown as unavailable, not booked',
  r.days['2026-11-05'] && r.days['2026-11-05'].blocked === true,
  '2026-11-05 should be grey');
checkTrue('a blocked row WITH a real guest name still counts (feed quirk)',
  r.days['2026-04-14'] && r.days['2026-04-14'].blocked === false,
  'Clare Lang, status blocked but plainly a real booking, was dropped');

console.log('\n── 2. The caretaker is dropped, not shaded grey ──');
checkTrue('caretaker row never reaches the calendar',
  !r.lettable.concat(r.blocks).some(b => /tino/i.test(b.guest_name || '')),
  'the 333-night granny-flat row is being drawn');
checkTrue('a free night inside the caretaker span reads as FREE',
  r.days['2026-05-20'] === undefined,
  '2026-05-20 is free but was painted over by the caretaker block');

console.log('\n── 3. Overlapping stays count a night once ──');
// 11-15 Sep and 11-13 Sep together occupy 4 nights, not 6.
const sep = ['11','12','13','14'].filter(d => r.days['2025-09-' + d] && !r.days['2025-09-' + d].blocked);
check('11-15 Sep + 11-13 Sep = 4 nights', sep.length, 4);
checkTrue('15 Sep (check-out day) is free again',
  r.days['2025-09-15'] === undefined, 'the check-out night was counted');

console.log('\n── The same stay synced twice ──');
// Two LekkeSlaap rows, same dates, different guest spelling.
check('duplicate LekkeSlaap rows count 5 nights, not 10', r.mix.lekkeslaap, 5);

console.log('\n── Owner stays ──');
checkTrue('owner stay is greyed out, not counted as income-earning',
  r.days['2025-11-20'] && r.days['2025-11-20'].blocked === true,
  'the owners\' November visit is being counted as a letting');

console.log('\n── Platform mix ──');
check('mix adds up to the nights counted',
  Object.values(r.mix).reduce((s, n) => s + n, 0), r.nightsBooked);
check('busiest platform first', r.mixOrder[0], 'booking');
check('manual and direct share one bucket', [clientPlat('manual'), clientPlat('direct'), clientPlat(null)],
  ['direct', 'direct', 'direct']);

console.log('\n── Monthly chart ──');
check('twelve months', r.monthKeys.length, 12);
check('last month is the current one', r.monthKeys[11], TODAY.slice(0, 7));
checkTrue('every month total is within the days of that month',
  r.monthKeys.every(k => {
    const [y, m] = k.split('-').map(Number);
    const tot = Object.values(r.byMonth[k]).reduce((s, n) => s + n, 0);
    return tot <= new Date(y, m, 0).getDate();
  }), 'a month claims more booked nights than it has days');

console.log('\n── Averages ──');
checkTrue('average stay is a plausible length',
  r.avgStay > 1 && r.avgStay < 30, `got ${r.avgStay}`);
// April and May 2026 hold 24 + 8 booked nights. Two April statements
// cover the same April nights, so April must be counted once.
check('per-night divides by the nights the statements cover', r.paidNights, 32);
checkTrue('per-night is the real nightly rate, not a 12-month dilution',
  Math.round(r.perNight) === Math.round(NET / 32),
  `got ${r.perNight}, diluted figure would be ${NET / r.nightsBooked}`);

console.log('\n── Stay length comes from the dates ──');
// The row stores nights: 17 for a 31 Jul → 28 Aug stay. It is 28.
check('31 Jul → 28 Aug is 28 nights, not the 17 the column claims',
  stayNights({ check_in_date: '2026-07-31', check_out_date: '2026-08-28' }), 28);
check('a missing check-out yields 0, not NaN',
  stayNights({ check_in_date: '2026-07-31', check_out_date: null }), 0);

console.log('\n── The 3 / 6 / 12 month filter ──');
// Narrowing the chart must narrow ONLY the chart. Occupancy and the mix
// are stated as 12-month figures, and quietly redefining them when a
// chart button is pressed would be worse than not offering the filter.
[3, 6, 12].forEach(n => {
  setChartMonths(n);
  const rn = compute(BOOKINGS, FROM, TODAY, NET, EARNINGS);
  check(`${n}-month view draws ${n} bars`, rn.monthKeys.length, n);
  check(`${n}-month view still reports 12-month occupancy`, rn.occupancy, 52);
  check(`${n}-month view still reports 12-month nights`, rn.nightsBooked, 191);
});
setChartMonths(12);

// ── The columns the dashboard actually asks the database for ──────
// Two queries named columns that do not exist — domestics.service_date
// and property_inspections.created_at — so PostgREST rejected both, .data
// came back null, `|| []` turned that into "nothing to show", and a real
// inspection report from Nina sat invisible while the cleaning count read
// zero. Nothing failed loudly, which is exactly why this check exists.
console.log('\n── Queries name real columns ──');
const REAL_COLUMNS = {
  domestics: ['id','cleaner','property_id','date','time','type','status','notes','checklist',
    'booking_ref','created_at','amount_paid','linked_booking_id','cleaner_name',
    'cancellation_acknowledged_at','cleaner_phone','link_sent_at','access_token','org_id'],
  property_inspections: ['id','org_id','property_id','property_name','inspection_date','submitted_by',
    'submitted_at','electricity_meter','pool_status','pool_notes','garden_status','garden_notes',
    'irrigation_status','terrace_status','lights_ok','lights_notes','breakage_found','breakage_notes',
    'pests_found','overall_condition','cleanliness_ok','appliances_ok','general_notes','photo_urls',
    'task_created','reviewed','flagged','inspector_name','checklist','issues','breakages','notes'],
  inventory_reports: ['id','org_id','domestic_id','property_id','cleaner','clean_date','submitted_at',
    'flagged_items','all_ok','reviewed','task_created','notes'],
  bookings: ['check_in_date','check_out_date','is_active','platform','status','guest_name','notes','nights'],
  platform_earnings: ['platform','period_start','period_end','gross_earnings','net_earnings','property_id'],
};
// Read the client dashboard's own fetch block out of the page.
const fetchBlock = html.slice(html.indexOf('const [propRes, bookRes'),
                              html.indexOf('const prop = (propRes.data'));
Object.entries(REAL_COLUMNS).forEach(([table, cols]) => {
  const line = fetchBlock.split('\n').find(l => l.includes(`from('${table}')`));
  if (!line) return;
  const named = [...line.matchAll(/\.(?:eq|gte|lte|order|neq|lt|gt)\('([a-z_]+)'/g)].map(m => m[1]);
  const bogus = named.filter(c => !cols.includes(c));
  checkTrue(`${table}: filters and ordering name real columns`,
    bogus.length === 0, `${table} has no column(s): ${bogus.join(', ')}`);
});

// ── A client cannot reach a staff tab ─────────────────────────────
// The role check in switchTab used to be a silent no-op for a client:
// no NAV entry lists 'client', so a client failed every role test and
// was redirected to 'dashboard' — which a client also fails, so the
// recursion guard returned having changed nothing, leaving them on
// whatever pane happened to be open. Checked here by reading the guard
// out of the page, because "the access check quietly did nothing" is
// indistinguishable from "the access check passed" at a glance.
console.log('\n── Client tab guard ──');
const switchTabSrc = grabFn('switchTab');
checkTrue('switchTab handles a client BEFORE the NAV role test',
  switchTabSrc.indexOf("role === 'client'") > -1 &&
  switchTabSrc.indexOf("role === 'client'") < switchTabSrc.indexOf('NAV.find'),
  'the client case must come first — a client matches no NAV entry, so the generic check cannot help them');
checkTrue('the client case redirects rather than falling through',
  /role === 'client'[\s\S]{0,200}showClientOnly\(\)[\s\S]{0,40}return/.test(switchTabSrc),
  'a client must be put back on their own screen, not silently left where they were');
const clientOnlySrc = grabFn('showClientOnly');
['tab-client', '.sidebar', '.topbar', '.mob-bar', '.mob-drawer'].forEach(sel =>
  checkTrue(`showClientOnly deals with ${sel}`, clientOnlySrc.includes(sel),
    `${sel} would stay on screen for a client`));

console.log(fail ? `\n${fail} failed, ${pass} passed` : `\nAll ${pass} checks passed`);
process.exit(fail ? 1 : 0);
