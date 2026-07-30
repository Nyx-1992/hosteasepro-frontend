// Tests the statement parsers AS SHIPPED: the parser source is extracted
// straight out of demo/index_fixed.html rather than duplicated here, so
// this can never pass against a stale copy while the real app is broken.
//
// Fixtures are the actual text of two real statements the owner provided
// (an Airbnb monthly earnings report and a LekkeSlaap statement), and the
// expected totals are the ones printed on those documents.
//
// Run: node scripts/tests/test_statement_parsers.js
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../../demo/index_fixed.html'), 'utf8');
const start = html.indexOf('// "1 344.00" / "-1 110.90"');
const end = html.indexOf('// \u2500\u2500 FINANCE DOCUMENTS');
if (start < 0 || end < 0 || end <= start) {
  console.error('Could not locate the statement-parser block in demo/index_fixed.html.');
  console.error('If it was renamed or moved, update the markers in this test.');
  process.exit(2);
}
const sandbox = { window: {} };
const src = html.slice(start, end) +
  '\nmodule.exports = { parseStatementText, parseMoney, parseStatementDate, round2, detectPlatform };';
const { parseStatementText, round2 } = (function () {
  const module = { exports: {} };
  new Function('module', 'window', 'PROPS', src)(module, sandbox.window, {});
  return module.exports;
})();

const LEKKE = `Statement
Tripco (Pty) Ltd. t/a LekkeSlaap
VAT reg no.: 422 025 9214
Phone: 021 201 8901
Email: accounts@lekkeslaap.co.za
LekkeSlaap, The Pavilion
Corner Portswood and Beach Rd
V&A Waterfront, Cape Town
8001
Name: Nicole Babczyk
Email: sn_apt_management@outlook.com
Phone: 063 602 1847
Property: Calm Apartment
Statement date 27 October 2025
Transaction summary for the period 01 April 2025 to 27 October 2025
Opening Balance as at 01 April 2025 R 0.00
Due to you 4 435.58
Guest payments 45 432.00
Commission and fees -10 304.71
Payouts -30 691.71
Closing Balance as at 27 October 2025 R 4 435.58
(due to you)
Transaction detail for the period 01 April 2025 to 27 October 2025
Date Booking
reference Description Amount Balance
01 Apr 2025 - Opening Balance - 0.00
15 Jun 2025 LS-5C3FM7 Commission -463.68 -463.68
15 Jun 2025 LS-5C3FM7 Payment handling fee -27.82 -491.50
15 Jun 2025 LS-5C3FM7 Guest payment 1 344.00 852.50
21 Jun 2025 LS-5C63WM Guest payment 6 440.00 7 292.50
21 Jun 2025 LS-5C63WM Payment handling fee -133.30 7 159.20
21 Jun 2025 LS-5C63WM Commission -1 110.90 6 048.30
29 Jun 2025 LS-5C6XQ1 Guest payment 2 856.00 8 904.30
29 Jun 2025 LS-5C6XQ1 Payment handling fee -59.11 8 845.19
29 Jun 2025 LS-5C6XQ1 Commission -492.66 8 352.53
03 Jul 2025 LS-5C63WM Payout -5 195.80 3 156.73
03 Jul 2025 LS-5C6XQ1 Payout -2 304.23 852.50
06 Jul 2025 LS-5C3FM7 Guest payment 1 344.00 2 196.50
06 Jul 2025 LS-5C3FM7 Payment handling fee -27.82 2 168.68
11 Jul 2025 LS-5CMKQW Guest payment 2 954.01 5 122.69
11 Jul 2025 LS-5CMKQW Commission -509.57 4 613.12
11 Jul 2025 LS-5CMKQW Payment handling fee -61.14 4 551.98
12 Jul 2025 LS-5CMKQW Payout -2 383.30 2 168.68
13 Jul 2025 LS-5CMKQW Guest payment 92.30 2 260.98
13 Jul 2025 LS-5CMKQW Booking edit - commission increase -159.38 2 101.60
13 Jul 2025 LS-5CMKQW Payment handling fee -17.21 2 084.39
13 Jul 2025 LS-5CMKQW Guest payment 831.69 2 916.08
13 Jul 2025 LS-5CMKQW Payment handling fee -1.91 2 914.17
15 Jul 2025 LS-5C3FM7 Payout -1 316.18 1 597.99
15 Jul 2025 LS-5CMKQW Payout offset -68.99 1 529.00
15 Jul 2025 LS-5CMKQW Host refund received 68.99 1 597.99
15 Jul 2025 LS-5CMKQW Payout -745.49 852.50
15 Jul 2025 LS-5C3FM7 Payout -852.50 0.00
27 Aug 2025 LS-5FR543 Commission -655.16 -655.16
27 Aug 2025 LS-5FR543 Payment handling fee -65.51 -720.67
27 Aug 2025 LS-5FR543 Guest payment 3 165.00 2 444.33
29 Aug 2025 LS-5FR543 Payout -2 444.33 0.00
04 Sep 2025 LS-5FZBWT Payment handling fee -49.68 -49.68
04 Sep 2025 LS-5FZ37J Payment handling fee -78.24 -127.92
04 Sep 2025 LS-5FZ37J Guest payment 3 780.00 3 652.08
04 Sep 2025 LS-5FZ37J Commission -782.46 2 869.62
04 Sep 2025 LS-5FZBMB Payment handling fee -107.64 2 761.98
04 Sep 2025 LS-5FZBMB Commission -1 076.40 1 685.58
04 Sep 2025 LS-5FZBMB Guest payment 5 200.00 6 885.58
04 Sep 2025 LS-5FZBWT Commission -496.80 6 388.78
04 Sep 2025 LS-5FZBWT Guest payment 2 400.00 8 788.78
06 Sep 2025 LS-5FZBWT Payout -1 853.52 6 935.26
20 Sep 2025 LS-5J6925 Guest payment 1 975.00 8 910.26
20 Sep 2025 LS-5J6925 Payment handling fee -40.88 8 869.38
20 Sep 2025 LS-5J6925 Commission -817.65 8 051.73
25 Sep 2025 LS-5JC4C4 Guest payment 4 125.00 12 176.73
25 Sep 2025 LS-5JC4C4 Commission -853.88 11 322.85
25 Sep 2025 LS-5JC4C4 Payment handling fee -85.38 11 237.47
26 Sep 2025 LS-5JCMRB Payment handling fee -46.57 11 190.90
26 Sep 2025 LS-5JCMRB Guest payment 2 250.00 13 440.90
26 Sep 2025 LS-5JCMRB Commission -931.50 12 509.40
28 Sep 2025 LS-5JC4C4 Payout -3 185.74 9 323.66
29 Sep 2025 LS-5JF9X8 Payment handling fee -50.71 9 272.95
29 Sep 2025 LS-5JF9X8 Guest payment 2 450.00 11 722.95
29 Sep 2025 LS-5JF9X8 Commission -1 014.30 10 708.65
03 Oct 2025 LS-5J6925 Payment handling fee -40.88 10 667.77
03 Oct 2025 LS-5J6925 Guest payment 1 975.00 12 642.77
03 Oct 2025 LS-5FZBMB Payout -4 015.96 8 626.81
16 Oct 2025 LS-5FZ37J Payout -2 919.30 5 707.51
17 Oct 2025 LS-5JCMRB Guest payment 2 250.00 7 957.51
17 Oct 2025 LS-5JCMRB Payment handling fee -46.57 7 910.94
24 Oct 2025 LS-5JCMRB Payout -1 271.93 6 639.01
24 Oct 2025 LS-5JCMRB Payout -2 203.43 4 435.58
27 Oct 2025 Closing Balance R 4 435.58`.split('\n');

const AIRBNB = `1 June 2026 – 30 June 2026
Earnings report
888 Brannan Street
San Francisco, CA 94103
Airbnb tax ID number: 26-3051428
Host name: Nicole Babczyk
User ID: 599669176
Report generated: 20 July 2026
Summary Gross earnings Adjustments1
Service fees2 Tax withheld3 Total (ZAR)
Earnings R 3,001.60 ZAR R 0.00 ZAR -R 535.04 ZAR R 0.00 ZAR R 2,466.56 ZAR
Performance stats
Nights booked
3
Avg. night stay
3
Homes
Home Gross earnings Adjustments1
Service fees2 Tax withheld3 Total (ZAR)
Calm Blouberg Beach Apt - Gated & Lift Access R 3,001.60 ZAR R 0.00 ZAR -R 535.04 ZAR R 0.00 ZAR R 2,466.56 ZAR
TV House R 0.00 ZAR R 0.00 ZAR R 0.00 ZAR R 0.00 ZAR R 0.00 ZAR
Earnings types
Types Total (ZAR)
Homes R 2,466.56 ZAR
Payout methods
Payout method Total
SN Apt Management, Checking 7345 (ZAR) R 2,466.56 ZAR
Performance stats
Home Nights booked Avg. night stay
Calm Blouberg Beach Apt - Gated & Lift Access 3 3
TV House 0 0`.split('\n');

let failures = 0;
function check(label, actual, expected) {
  const ok = Math.abs((actual ?? 0) - expected) < 0.005;
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${actual} ${ok ? '' : '(expected ' + expected + ')'}`);
}

console.log('===== LekkeSlaap =====');
const ls = parseStatementText(LEKKE);
console.log('platform:', ls.platform, '| listing:', JSON.stringify(ls.listings[0].listing_name));
console.log('period:', ls.period_start, '->', ls.period_end);
console.log('lines parsed:', ls.lines.length);
const l0 = ls.listings[0];
check('gross (statement says 45 432.00)', l0.gross_earnings, 45432.00);
check('commission + fees (statement says 10 304.71)', round2(l0.commission + l0.fees), 10304.71);
check('adjustments (host refund 68.99)', l0.adjustments, 68.99);
check('payouts', l0.payouts_total, 30760.70);
check('closing balance', l0.closing_balance, 4435.58);
check('opening balance', ls.opening_balance, 0);
// The real integrity test: opening + net - payouts must equal closing
check('RECONCILES: opening + net - payouts == closing',
  round2((ls.opening_balance||0) + l0.net_earnings - l0.payouts_total), 4435.58);
const byType = {};
ls.lines.forEach(l => byType[l.line_type] = (byType[l.line_type]||0)+1);
console.log('line types:', JSON.stringify(byType));
const others = ls.lines.filter(l => l.line_type === 'other');
console.log('unclassified lines:', others.length, others.map(o=>o.description).join('; ')||'(none)');

console.log('\n===== Airbnb =====');
const ab = parseStatementText(AIRBNB);
console.log('platform:', ab.platform);
console.log('period:', ab.period_start, '->', ab.period_end);
console.log('listings:', ab.listings.map(l=>l.listing_name).join(' | '));
const calm = ab.listings.find(l => l.listing_name.startsWith('Calm'));
const tvh = ab.listings.find(l => l.listing_name === 'TV House');
check('Calm gross', calm.gross_earnings, 3001.60);
check('Calm service fees', calm.fees, 535.04);
check('Calm net', calm.net_earnings, 2466.56);
check('Calm nights booked', calm.nights_booked, 3);
check('TV House net', tvh.net_earnings, 0);
check('TV House nights', tvh.nights_booked, 0);
check('summary row captured separately', ab.summary ? ab.summary.net_earnings : -1, 2466.56);
check('per-home totals sum to summary', round2(ab.listings.reduce((s,l)=>s+l.net_earnings,0)), 2466.56);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
