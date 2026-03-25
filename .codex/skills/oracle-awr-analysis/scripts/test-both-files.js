
const { parseAWRReport } = require('./awr-parser');
const path = require('path');

console.log('=== 测试真实 AWR 报告 ===');
const realFile = path.resolve(__dirname, '../../../../iboss_awr_20260319/awrrpt_1_239324_239328.html');
const realReport = parseAWRReport(realFile);
console.log('真实报告:', realFile);
console.log('  - dbName:', realReport.header.dbName);
console.log('  - instance:', realReport.instance);
console.log('  - beginSnapTime:', realReport.beginSnapTime);

console.log('\n=== 测试测试 AWR 报告 ===');
const testFile = path.resolve(__dirname, './test_output/awrrpt_1_239320_239324.html');
const testReport = parseAWRReport(testFile);
console.log('测试报告:', testFile);
console.log('  - dbName:', testReport.header.dbName);
console.log('  - instance:', testReport.instance);
console.log('  - beginSnapTime:', testReport.beginSnapTime);
