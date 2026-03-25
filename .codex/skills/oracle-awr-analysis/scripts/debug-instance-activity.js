const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// 测试文件路径
const testFile = 'E:\\traeworkspace\\awr\\iboss_awr_20260319\\awrrpt_1_239324_239328.html';

if (!fs.existsSync(testFile)) {
    console.error('测试文件不存在:', testFile);
    process.exit(1);
}

console.log('正在调试 Instance Activity Stats 提取功能...');
console.log('测试文件:', testFile);
console.log('');

try {
    const html = fs.readFileSync(testFile, 'utf-8');
    const $ = cheerio.load(html);
    
    console.log('=== 查找 Instance Activity Stats 标题 ===');
    
    // 查找标题
    $('h3.awr').each((i, heading) => {
        const title = $(heading).text().trim();
        if (title.includes('Instance Activity Stats')) {
            console.log('找到标题:', title);
            console.log('标题位置:', i);
            
            // 查找后续的表格
            let $table = $(heading).next('table.tdiff');
            if ($table.length === 0) {
                $table = $(heading).next().next('table.tdiff');
            }
            if ($table.length === 0) {
                $table = $(heading).nextAll('table.tdiff').first();
            }
            
            if ($table.length > 0) {
                console.log('找到表格');
                console.log('表格 summary:', $table.attr('summary') || '无summary');
                
                // 检查表格内容
                const $rows = $table.find('tr');
                console.log('表格行数:', $rows.length);
                
                // 检查前几行
                $rows.slice(0, 5).each((j, tr) => {
                    const $tr = $(tr);
                    const cells = [];
                    $tr.find('td, th').each((k, cell) => {
                        cells.push($(cell).text().trim());
                    });
                    console.log(`行 ${j}:`, cells);
                });
            } else {
                console.log('未找到表格');
            }
            
            console.log('---');
        }
    });
    
    console.log('\n=== 直接查找包含 user logons cumulative 的行 ===');
    
    // 直接查找包含 user logons cumulative 的行
    $('td').each((i, td) => {
        const text = $(td).text().toLowerCase().trim();
        if (text.includes('user logons cumulative')) {
            console.log('找到 user logons cumulative');
            const $tr = $(td).closest('tr');
            const cells = [];
            $tr.find('td').each((j, cell) => {
                cells.push($(cell).text().trim());
            });
            console.log('整行内容:', cells);
        }
    });
    
} catch (error) {
    console.error('调试失败:', error.message);
    console.error(error.stack);
}