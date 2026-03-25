const { parseReportByDimension } = require('./deep-parser');
const fs = require('fs');
const path = require('path');

// 测试文件路径
const testFile = 'E:\\traeworkspace\\awr\\iboss_awr_20260319\\awrrpt_1_239324_239328.html';

if (!fs.existsSync(testFile)) {
    console.error('测试文件不存在:', testFile);
    process.exit(1);
}

console.log('正在测试 Instance Activity Stats 提取功能...');
console.log('测试文件:', testFile);
console.log('');

try {
    const result = parseReportByDimension(testFile);
    
    console.log('=== 解析结果 ===');
    console.log('文件:', result.fileName);
    
    // 检查会话数据
    if (result.sessions && result.sessions.sessionsInfo) {
        console.log('\n=== Sessions Info ===');
        console.log('Begin Snap Sessions:', result.sessions.sessionsInfo.sessionsBegin);
        console.log('End Snap Sessions:', result.sessions.sessionsInfo.sessionsEnd);
        console.log('Begin Snap Cursors/Session:', result.sessions.sessionsInfo.cursorsPerSessionBegin);
        console.log('End Snap Cursors/Session:', result.sessions.sessionsInfo.cursorsPerSessionEnd);
    }
    
    // 检查 Instance Activity Stats
    if (result.sessions && result.sessions.instanceActivityStats) {
        const stats = result.sessions.instanceActivityStats;
        console.log('\n=== Instance Activity Stats ===');
        console.log('User Logons Cumulative:', stats.userLogonsCumulative);
        console.log('User Logouts Cumulative:', stats.userLogoutsCumulative);
        console.log('End Snap Sessions:', stats.sessionsEnd);
        
        // 计算连接风暴指标
        if (stats.userLogonsCumulative && stats.sessionsEnd) {
            const logonsVsSessions = (stats.userLogonsCumulative / stats.sessionsEnd) * 100;
            console.log('\n=== 连接风暴分析 ===');
            console.log('登录数量 / End Snap 会话数:', logonsVsSessions.toFixed(2) + '%');
            
            if (logonsVsSessions > 30) {
                console.log('状态: 存在连接风暴');
            } else if (logonsVsSessions > 15) {
                console.log('状态: 有连接风暴嫌疑');
            } else {
                console.log('状态: 正常');
            }
        }
        
        // 计算登录/登出比例
        if (stats.userLogonsCumulative && stats.userLogoutsCumulative) {
            const logonLogoutRatio = stats.userLogonsCumulative / stats.userLogoutsCumulative;
            console.log('登录/登出比例:', logonLogoutRatio.toFixed(2));
            
            if (logonLogoutRatio > 1.2) {
                console.log('状态: 可能存在连接泄漏');
            } else if (logonLogoutRatio < 0.5) {
                console.log('状态: 可能存在短连接风暴');
            } else {
                console.log('状态: 正常');
            }
        }
    } else {
        console.log('\n=== Instance Activity Stats ===');
        console.log('未找到 Instance Activity Stats 数据');
    }
    
} catch (error) {
    console.error('解析失败:', error.message);
    console.error(error.stack);
}