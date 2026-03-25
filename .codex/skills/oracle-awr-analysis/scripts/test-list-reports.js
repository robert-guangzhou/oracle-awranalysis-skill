
const { scanAWRDirectory } = require('./awr-parser');
const path = require('path');

const testDir = path.resolve(__dirname, '../../../../iboss_awr_20260319');

console.log('测试目录:', testDir);
console.log('');

const reports = scanAWRDirectory(testDir);

console.log('');
console.log('=== 找到的报告列表 ===');
for (const report of reports) {
    console.log(`文件名: ${report.fileName}`);
    console.log(`  - header.instance: ${report.header?.instance}`);
    console.log(`  - report.instance: ${report.instance}`);
    console.log('');
}
