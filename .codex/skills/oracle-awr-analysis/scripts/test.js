const path = require('path');
const fs = require('fs');

const sampleHtml = `<!DOCTYPE html>
<html>
<head><title>AWR Report</title></head>
<body>
<h2 class="awr">AWR Report</h2>
<table border="0" class="tdiff">
<tr><th class="awrbg">DB Name</th><td class="awrc">ORCL</td><th class="awrbg">DB Id</th><td class="awrc">1234567890</td></tr>
<tr><th class="awrbg">Instance</th><td class="awrc">orcl1</td><th class="awrbg">Inst num</th><td class="awrc">1</td></tr>
<tr><th class="awrbg">Release</th><td class="awrc">19.0.0.0.0</td><th class="awrbg">Host Name</th><td class="awrc">dbserver01</td></tr>
</table>

<h3 class="awr">Snapshots</h3>
<table border="0" class="tdiff">
<tr><th class="awrbg">Begin Snap</th><td class="awrc">239324</td><th class="awrbg">Snap Begin</th><td class="awrc">20-Mar-2026 10:00:00</td></tr>
<tr><th class="awrbg">End Snap</th><td class="awrc">239328</td><th class="awrbg">Snap End</th><td class="awrc">20-Mar-2026 11:00:00</td></tr>
<tr><th class="awrbg">Elapsed</th><td class="awrc">60.0 (mins)</td><th class="awrbg">DB Time</th><td class="awrc">120.5 (mins)</td></tr>
</table>

<h3 class="awr">Load Profile</h3>
<table border="0" class="tdiff">
<tr><th class="awrbg">Per Second</th><th class="awrbg">Per Transaction</th></tr>
<tr><td class="awrc">DB Time(s):</td><td class="awrc">2.0</td><td class="awrc">0.1</td></tr>
<tr><td class="awrc">DB CPU(s):</td><td class="awrc">1.5</td><td class="awrc">0.08</td></tr>
<tr><td class="awrc">Redo size:</td><td class="awrc">1,234,567</td><td class="awrc">56,789</td></tr>
</table>

<h3 class="awr">Top 10 Foreground Events</h3>
<table border="0" class="tdiff">
<tr><th class="awrbg">Event</th><th class="awrbg">Waits</th><th class="awrbg">Time(s)</th><th class="awrbg">Avg Wait(ms)</th><th class="awrbg">%DB time</th></tr>
<tr><td class="awrc">db file sequential read</td><td class="awrc">1,234,567</td><td class="awrc">1,234.5</td><td class="awrc">1.0</td><td class="awrc">17.1%</td></tr>
<tr><td class="awrc">log file sync</td><td class="awrc">567,890</td><td class="awrc">567.8</td><td class="awrc">1.0</td><td class="awrc">7.9%</td></tr>
<tr><td class="awrc">CPU time</td><td class="awrc">&#160;</td><td class="awrc">456.7</td><td class="awrc">&#160;</td><td class="awrc">6.3%</td></tr>
</table>

<h3 class="awr">Instance Efficiency Percentages</h3>
<table border="0" class="tdiff">
<tr><td class="awrc">Buffer Nowait %:</td><td class="awrc">99.95</td><td class="awrc">Redo NoWait %:</td><td class="awrc">100.00</td></tr>
<tr><td class="awrc">Buffer Hit %:</td><td class="awrc">98.45</td><td class="awrc">Library Hit %:</td><td class="awrc">99.12</td></tr>
<tr><td class="awrc">Soft Parse %:</td><td class="awrc">95.67</td><td class="awrc">Execute to Parse %:</td><td class="awrc">45.23</td></tr>
</table>

<h3 class="awr">Host CPU</h3>
<table border="0" class="tdiff">
<tr><td class="awrc">%User:</td><td class="awrc">65.5%</td><td class="awrc">%Sys:</td><td class="awrc">15.2%</td></tr>
<tr><td class="awrc">%Idle:</td><td class="awrc">19.3%</td><td class="awrc">%WIO:</td><td class="awrc">0.0%</td></tr>
</table>

</body>
</html>`;

const testDir = path.join(__dirname, 'test_output');
if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir);
}

const testFile1 = path.join(testDir, 'awrrpt_1_239324_239328.html');
const testFile2 = path.join(testDir, 'awrrpt_1_239320_239324.html');
const testFile3 = path.join(testDir, 'awrrpt_1_239328_239332.html');

fs.writeFileSync(testFile1, sampleHtml);
fs.writeFileSync(testFile2, sampleHtml.replace('239324', '239320').replace('239328', '239324').replace('10:00:00', '09:00:00').replace('11:00:00', '10:00:00'));
fs.writeFileSync(testFile3, sampleHtml.replace('239324', '239328').replace('239328', '239332').replace('10:00:00', '11:00:00').replace('11:00:00', '12:00:00'));

console.log('Test files created in:', testDir);
console.log('Test files:');
console.log('  - awrrpt_1_239320_239324.html (09:00-10:00)');
console.log('  - awrrpt_1_239324_239328.html (10:00-11:00)');
console.log('  - awrrpt_1_239328_239332.html (11:00-12:00)');
console.log('');
console.log('Running parser test...');

const { parseAWRReport } = require('./awr-parser');

try {
    const report = parseAWRReport(testFile1);
    console.log('Parsed report:');
    console.log(JSON.stringify({
        fileName: report.fileName,
        header: report.header,
        snapshots: report.snapshots,
        topEvents: report.topEvents,
        instanceEfficiency: report.instanceEfficiency,
        hostCpu: report.hostCpu
    }, null, 2));
    console.log('\nParser test PASSED!');
} catch (error) {
    console.error('Parser test FAILED:', error.message);
    console.error(error.stack);
}

console.log('\nRunning core detector test...');

const { scanAWRDirectory } = require('./awr-parser');
const { analyzeReports } = require('./core-detector');

try {
    const reports = scanAWRDirectory(testDir);
    console.log(`Found ${reports.length} reports`);
    
    const result = analyzeReports(reports, '2026-03-20 10:05:00');
    console.log('\nCore AWR detection result:');
    console.log(result.markdownReport);
    console.log('\nCore detector test PASSED!');
} catch (error) {
    console.error('Core detector test FAILED:', error.message);
    console.error(error.stack);
}

console.log('\n========================================');
console.log('All tests completed!');
console.log('========================================');
