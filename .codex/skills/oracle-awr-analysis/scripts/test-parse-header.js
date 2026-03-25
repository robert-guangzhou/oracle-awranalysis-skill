
const { parseAWRReport } = require('./awr-parser');
const path = require('path');

const testFile = path.resolve(__dirname, '../../../../iboss_awr_20260319/awrrpt_1_239324_239328.html');

console.log('测试文件:', testFile);
console.log('');

const report = parseAWRReport(testFile);

console.log('=== 报告标题 ===');
console.log('fileName:', report.fileName);
console.log('filePath:', report.filePath);
console.log('');

console.log('=== Header 信息 ===');
console.log('header:', report.header);
console.log('');

console.log('=== 报告实例 ===');
console.log('report.instance:', report.instance);
