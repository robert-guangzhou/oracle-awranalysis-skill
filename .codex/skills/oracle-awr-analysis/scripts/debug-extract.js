const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// 测试文件路径
const testFile = 'E:\\traeworkspace\\awr\\iboss_awr_20260319\\awrrpt_1_239324_239328.html';

if (!fs.existsSync(testFile)) {
    console.error('测试文件不存在:', testFile);
    process.exit(1);
}

console.log('正在调试 extractInstanceActivityStats 函数...');
console.log('测试文件:', testFile);
console.log('');

try {
    const html = fs.readFileSync(testFile, 'utf-8');
    const $ = cheerio.load(html);
    
    const activityStats = {
        userLogonsCumulative: null,
        userLogoutsCumulative: null,
        sessionsEnd: null
    };
    
    console.log('=== 开始查找 Instance Activity Stats 表格 ===');
    
    // 直接查找包含 "Instance Activity Stats" 标题的表格
    $('h3.awr').each((i, heading) => {
        const $heading = $(heading);
        const title = $heading.text().trim();
        
        console.log(`检查标题 ${i}: "${title}"`);
        
        if (title.includes('Instance Activity Stats') && !title.includes('Key') && !title.includes('Absolute') && !title.includes('Thread')) {
            console.log('找到匹配的标题');
            
            // 找到正确的表格
            let $table = $heading.nextAll('table.tdiff').first();
            
            if ($table.length > 0) {
                console.log('找到表格，开始遍历行...');
                
                // 直接遍历表格行查找所需数据
                $table.find('tr').each((j, tr) => {
                    const $tr = $(tr);
                    const $cells = $tr.find('td');
                    
                    if ($cells.length >= 2) {
                        const statName = $cells.eq(0).text().toLowerCase().trim();
                        const cumulativeValue = $cells.eq(1).text().trim();
                        
                        console.log(`行 ${j}: "${statName}" = "${cumulativeValue}"`);
                        
                        if (statName.includes('user logons cumulative')) {
                            console.log('找到 user logons cumulative!');
                            activityStats.userLogonsCumulative = cumulativeValue;
                        } else if (statName.includes('user logouts cumulative')) {
                            console.log('找到 user logouts cumulative!');
                            activityStats.userLogoutsCumulative = cumulativeValue;
                        }
                    }
                });
            } else {
                console.log('未找到表格');
            }
            
            console.log('---');
        }
    });
    
    console.log('\n=== 提取结果 ===');
    console.log('userLogonsCumulative:', activityStats.userLogonsCumulative);
    console.log('userLogoutsCumulative:', activityStats.userLogoutsCumulative);
    
} catch (error) {
    console.error('调试失败:', error.message);
    console.error(error.stack);
}