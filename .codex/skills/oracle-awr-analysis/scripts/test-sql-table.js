const fs = require('fs');
const cheerio = require('cheerio');
const { parseHtmlEntities } = require('./deep-parser');

const filePath = 'e:/traeworkspace/awr/iboss_awr_20260319/awrrpt_1_239324_239328.html';
const html = fs.readFileSync(filePath, 'utf8');
const $ = cheerio.load(html);

console.log('=== Testing SQL ordered by Elapsed Time ===\n');

const h3Elements = $('h3');
let targetSection = null;

h3Elements.each((i, el) => {
    const text = $(el).text();
    if (text.includes('SQL ordered by Elapsed Time')) {
        console.log(`Found H3 at position ${i}: "${text}"`);
        targetSection = $(el);
        return false;
    }
});

if (targetSection) {
    let nextEl = targetSection.next();
    let tableFound = false;
    
    while (nextEl.length > 0 && !tableFound) {
        if (nextEl.is('table')) {
            console.log('\n=== Found table ===');
            const $table = nextEl;
            
            const headers = [];
            $table.find('th').each((j, th) => {
                headers.push(parseHtmlEntities($(th).text()));
            });
            console.log('\nHeaders:', headers);
            
            console.log('\n=== First 3 data rows ===');
            let rowCount = 0;
            $table.find('tr').each((i, tr) => {
                if (i === 0) return;
                if (rowCount >= 3) return;
                
                const $tr = $(tr);
                const row = [];
                $tr.find('td').each((j, td) => {
                    row.push(parseHtmlEntities($(td).text()));
                });
                
                if (row.length > 0) {
                    console.log(`\nRow ${i}:`);
                    row.forEach((cell, j) => {
                        console.log(`  Col ${j}: "${cell}"`);
                    });
                    rowCount++;
                }
            });
            tableFound = true;
        }
        nextEl = nextEl.next();
    }
}
