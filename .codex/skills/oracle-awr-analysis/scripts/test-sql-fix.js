const fs = require('fs');
const cheerio = require('cheerio');
const { extractSQLOrderedByElapsed, parseHtmlEntities } = require('./deep-parser');

const filePath = 'e:/traeworkspace/awr/iboss_awr_20260319/awrrpt_1_239324_239328.html';
const html = fs.readFileSync(filePath, 'utf8');
const $ = cheerio.load(html);

console.log('Testing extractSQLOrderedByElapsed...');
const sqlList = extractSQLOrderedByElapsed($);
console.log(`Found ${sqlList.length} SQL statements`);
console.log('\nFirst 5:');
sqlList.slice(0, 5).forEach((sql, i) => {
    console.log(`\n${i + 1}. SQL Id: ${sql.sqlId}`);
    console.log(`   Elapsed Time: ${sql.elapsed_time}s`);
    console.log(`   Executions: ${sql.executions}`);
    console.log(`   SQL Module: ${sql.sql_module}`);
});
