#!/usr/bin/env node
/**
 * Tasks can only be assigned to the agency's OWN people.
 *
 * WHY THIS EXISTS. The assignee list was ['Nicole','Silja','Nina Williams',
 * 'Tino'] — S&N's four — written out in four places: the filter bar, the
 * New Task markup, the drawer, and a colour map keyed by name. Every other
 * agency's Tasks tab offered them four strangers to assign work to. Same
 * mistake as the hardcoded property list and the cleaner colours.
 *
 * THE PART THAT MAKES IT DELICATE. tasks.assigned is free text and has held
 * names for a year: 'Nicole', 'Silja', 'Nina Williams', 'Tino'.
 * team_contacts holds 'Nicole Babczyk' and 'Silja Faltin'. Reading the team
 * from team_contacts alone produces names that match nothing already saved,
 * so every historic task would read as unassigned and re-saving would write
 * a second spelling of the same person. The existing data therefore decides
 * the spelling, and this test pins that against the REAL production rows.
 *
 * Run: node scripts/tests/test_task_assignees.js
 */
// Pulls the functions out of the page as real source rather than keeping a
// copy, and runs them against the ACTUAL production tasks.assigned strings
// and team_contacts rows.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'demo', 'index_fixed.html'), 'utf8');
const grab = (name) => {
  const i = html.indexOf(`function ${name}(`);
  if (i < 0) throw new Error('not found: ' + name);
  let d = 0;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') d++;
    else if (html[k] === '}' && --d === 0) return html.slice(i, k + 1);
  }
};
const palette = html.match(/const ASSIGNEE_PALETTE = \[[^\]]+\];/)[0];
const src = palette + '\n' + ['getTaskAssignees','assigneeShort','assigneeColor'].map(grab).join('\n');

// Real production data.
const snTasks = ['Tino', null, 'Silja,Nina Williams,Tino', 'Nicole,Nina Williams',
                 'Nicole,Silja,Nina Williams', 'Nicole', 'Unassigned,Nina Williams',
                 'Unassigned,Nicole'].map(a => ({ assigned: a }));
const snContacts = [
  { cat:'management', name:'Nicole Babczyk' },
  { cat:'management', name:'Silja Faltin' },
  { cat:'management', name:'Nina Williams' },
  { cat:'domestic',   name:'Blessing' },
  { cat:'supplier',   name:'Laundry Inc' },
];
const run = (tasks, contacts, fn) =>
  new Function('tasks','contacts', src + `; return (${fn})({getTaskAssignees,assigneeShort,assigneeColor});`)(tasks, contacts);

const sn = run(snTasks, snContacts, 'a => ({ list: a.getTaskAssignees(), colors: a.getTaskAssignees().map(n => a.assigneeColor(n).bg) })');
// A brand-new agency: team on the People tab, no tasks assigned yet.
const fresh = run([], [{cat:'management',name:"Siobhán O'Connor"},{cat:'management',name:'Thabo Nkosi'}],
                  'a => ({ list: a.getTaskAssignees(), short: a.getTaskAssignees().map(n => a.assigneeShort(n)) })');
// Empty org: no team at all.
const empty = run([], [], 'a => a.getTaskAssignees()');
// Colour of a task saved as the long form, which the old map matched loosely.
const longForm = run(snTasks, snContacts, 'a => a.assigneeColor("Nina Williams").bg');

const fail = [], ok = (n, c) => { console.log((c ? '  ✓ ' : '  ✗ ') + n); if (!c) fail.push(n); };
console.log('\n  S&N   ', JSON.stringify(sn.list), '\n  colors', JSON.stringify(sn.colors));
console.log('  fresh ', JSON.stringify(fresh.list), '->', JSON.stringify(fresh.short));
console.log('  empty ', JSON.stringify(empty), '\n');

ok('S&N gets exactly the four names their tasks already use',
   JSON.stringify(sn.list) === JSON.stringify(['Nicole','Silja','Nina Williams','Tino']));
ok('and exactly the colours they have today',
   JSON.stringify(sn.colors) === JSON.stringify(['#c17f3c','#7c3aed','#16a34a','#0369a1']));
ok('"Nina Williams" still resolves to the Nina colour', longForm === '#16a34a');
ok('no full name from team_contacts leaks in ("Nicole Babczyk")',
   !sn.list.some(n => n.includes('Babczyk') || n.includes('Faltin')));
ok('"Unassigned" is not offered as a person', !sn.list.some(n => /unassigned/i.test(n)));
ok('a new agency gets its OWN team, no S&N names',
   JSON.stringify(fresh.list) === JSON.stringify(["Siobhán O'Connor", 'Thabo Nkosi']));
ok('chips shorten to first names', JSON.stringify(fresh.short) === JSON.stringify(['Siobhán','Thabo']));
// Two colleagues sharing a first name must stay distinguishable.
const twins = run([], [{cat:'management',name:'Thabo Nkosi'},{cat:'management',name:'Thabo Dlamini'}],
                  'a => ({ list: a.getTaskAssignees(), short: a.getTaskAssignees().map(n => a.assigneeShort(n)) })');
console.log('  twins ', JSON.stringify(twins.list), '->', JSON.stringify(twins.short));
ok('two people with the same first name are stored separately',
   JSON.stringify(twins.list) === JSON.stringify(['Thabo Nkosi','Thabo Dlamini']));
ok('and their chips are told apart',
   JSON.stringify(twins.short) === JSON.stringify(['Thabo N.','Thabo D.']));
ok('an org with no team gets an empty list, not a default one', empty.length === 0);
console.log(fail.length ? `\n${fail.length} FAILED\n` : '\nAll passed\n');
process.exit(fail.length ? 1 : 0);
