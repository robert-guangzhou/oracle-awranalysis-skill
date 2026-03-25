const { parseDateTime } = require('./awr-parser');

const testCases = [
    '2026-03-19 10:00:00',
    '2026/03/19 10:00:00',
    '19-03-2026 10:00:00',
    '03/19/2026 10:00:00',
    '19-Mar-26 10:00:00',
    '19-March-2026 10:00:00',
    '19-3月 -26 08:00:06',
    '2026年3月19日 10:00:00',
    '3月19日 10:00:00',
    'March 19, 2026 10:00:00',
    'Mar 19 10:00:00 2026',
    '03/19/2026 10:00:00 PM'
];

console.log('Date parsing test results:');
console.log('='.repeat(60));
for (const tc of testCases) {
    const result = parseDateTime(tc);
    console.log(`Input: '${tc}'`);
    console.log(`Output: ${result ? result.toISOString() : 'null'}`);
    console.log('-'.repeat(60));
}
