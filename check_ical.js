const fs = require('fs');
const icsFile = process.argv[2];
if (!icsFile) {
  console.error('Usage: node check_ical.js <file.ics>');
  process.exit(1);
}
const content = fs.readFileSync(icsFile, 'utf8');

const events = content.split('BEGIN:VEVENT').slice(1);
for (const event of events) {
  const dtstart = event.match(/DTSTART.*:(\d{8})/);
  const dtend = event.match(/DTEND.*:(\d{8})/);
  if (dtstart && dtend) {
    const start = dtstart[1];
    const end = dtend[1];
    if ((start.startsWith('202603') || end.startsWith('202603'))) {
      console.log('---');
      console.log('Start:', start, 'End:', end);
      const summary = event.match(/SUMMARY:(.*)/);
      if (summary) console.log('Summary:', summary[1]);
    }
  }
}
