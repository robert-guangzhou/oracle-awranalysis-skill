const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { extractTopEvents, extractReportHeader, extractSnapshots } = require('./awr-parser');

function parseHtmlEntities(text) {
    if (!text) return '';
    return text
        .replace(/&#160;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim();
}

function parseNumber(value) {
    if (!value) return null;
    const cleaned = parseHtmlEntities(value).replace(/,/g, '').trim();
    if (cleaned === '' || cleaned === '-') return null;
    
    const multiplierMatch = cleaned.match(/^([\d.]+)\s*([KMGTP])?$/i);
    if (multiplierMatch) {
        let num = parseFloat(multiplierMatch[1]);
        const unit = (multiplierMatch[2] || '').toUpperCase();
        switch (unit) {
            case 'K': num *= 1000; break;
            case 'M': num *= 1000000; break;
            case 'G': num *= 1000000000; break;
            case 'T': num *= 1000000000000; break;
            case 'P': num *= 1000000000000000; break;
        }
        return num;
    }
    
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

function parsePercentage(value) {
    if (!value) return null;
    const cleaned = parseHtmlEntities(value).trim();
    const match = cleaned.match(/^([\d.]+)%?$/);
    if (match) {
        return parseFloat(match[1]);
    }
    return null;
}

function findSection($, titlePattern) {
    const sections = [];
    const pattern = new RegExp(titlePattern, 'i');
    
    $('h3.awr, h2.awr').each((i, heading) => {
        const $heading = $(heading);
        const title = parseHtmlEntities($heading.text());
        
        if (pattern.test(title)) {
            // 尝试多种方式找到表格
            let $table = $heading.next('table.tdiff');
            
            if ($table.length === 0) {
                // 跳过可能的 <p /> 标签
                $table = $heading.next().next('table.tdiff');
            }
            
            if ($table.length === 0) {
                // 查找所有后续的 table.tdiff
                $table = $heading.nextAll('table.tdiff').first();
            }
            
            sections.push({
                title: title,
                $table: $table,
                $heading: $heading
            });
        }
    });
    
    return sections;
}

function parseSQLTable($, $table) {
    const rows = [];
    const headers = [];
    
    $table.find('tr').each((i, tr) => {
        const $tr = $(tr);
        const row = [];
        
        if (i === 0) {
            $tr.find('th').each((j, th) => {
                headers.push(parseHtmlEntities($(th).text()).toLowerCase());
            });
        }
        
        $tr.find('td').each((j, td) => {
            const $td = $(td);
            let text = $td.text();
            text = parseHtmlEntities(text);
            row.push(text);
        });
        
        if (row.length > 0) {
            rows.push(row);
        }
    });
    
    return { headers, rows };
}

function findColumnIndex(headers, patterns) {
    for (let i = 0; i < headers.length; i++) {
        for (const pattern of patterns) {
            if (headers[i].includes(pattern)) {
                return i;
            }
        }
    }
    return -1;
}

function extractSQLOrderedByElapsed($) {
    const sections = findSection($, 'SQL ordered by Elapsed Time');
    const sqlList = [];
    
    for (const section of sections) {
        const { headers, rows } = parseSQLTable($, section.$table);
        
        const idxElapsed = findColumnIndex(headers, ['elapsed']);
        const idxExec = findColumnIndex(headers, ['executions']);
        const idxElapsedPerExec = findColumnIndex(headers, ['per exec']);
        const idxTotal = findColumnIndex(headers, ['%total']);
        const idxCPU = findColumnIndex(headers, ['%cpu']);
        const idxIO = findColumnIndex(headers, ['%io']);
        const idxSQLId = findColumnIndex(headers, ['sql id']);
        const idxModule = findColumnIndex(headers, ['sql module']);
        
        for (const row of rows) {
            const sql = {
                sqlId: idxSQLId >= 0 ? extractSQLId(row[idxSQLId]) : null,
                elapsed_time: idxElapsed >= 0 ? parseNumber(row[idxElapsed]) : null,
                cpu_time: idxCPU >= 0 ? parseNumber(row[idxCPU]) : null,
                executions: idxExec >= 0 ? parseNumber(row[idxExec]) : null,
                elapsed_per_exec: idxElapsedPerExec >= 0 ? parseNumber(row[idxElapsedPerExec]) : null,
                percent_total: idxTotal >= 0 ? parsePercentage(row[idxTotal]) : null,
                sql_module: idxModule >= 0 ? row[idxModule] : null
            };
            
            if (sql.sqlId) {
                sqlList.push(sql);
            }
        }
    }
    
    return sqlList;
}

function extractSQLOrderedByCPU($) {
    const sections = findSection($, 'SQL ordered by CPU Time');
    const sqlList = [];
    
    for (const section of sections) {
        const { headers, rows } = parseSQLTable($, section.$table);
        
        const idxCPU = findColumnIndex(headers, ['cpu time']);
        const idxElapsed = findColumnIndex(headers, ['elapsed']);
        const idxExec = findColumnIndex(headers, ['executions']);
        const idxCPUPerExec = findColumnIndex(headers, ['per exec']);
        const idxTotal = findColumnIndex(headers, ['%total']);
        const idxSQLId = findColumnIndex(headers, ['sql id']);
        const idxModule = findColumnIndex(headers, ['sql module']);
        
        for (const row of rows) {
            const sql = {
                sqlId: idxSQLId >= 0 ? extractSQLId(row[idxSQLId]) : null,
                cpu_time: idxCPU >= 0 ? parseNumber(row[idxCPU]) : null,
                elapsed_time: idxElapsed >= 0 ? parseNumber(row[idxElapsed]) : null,
                executions: idxExec >= 0 ? parseNumber(row[idxExec]) : null,
                cpu_per_exec: idxCPUPerExec >= 0 ? parseNumber(row[idxCPUPerExec]) : null,
                percent_total: idxTotal >= 0 ? parsePercentage(row[idxTotal]) : null,
                sql_module: idxModule >= 0 ? row[idxModule] : null
            };
            
            if (sql.sqlId) {
                sqlList.push(sql);
            }
        }
    }
    
    return sqlList;
}

function extractSQLOrderedByExecutions($) {
    const sections = findSection($, 'SQL ordered by Executions');
    const sqlList = [];
    
    for (const section of sections) {
        const { headers, rows } = parseSQLTable($, section.$table);
        
        const idxExec = findColumnIndex(headers, ['executions']);
        const idxElapsedPerExec = findColumnIndex(headers, ['per exec']);
        const idxRows = findColumnIndex(headers, ['rows']);
        const idxGets = findColumnIndex(headers, ['buffer gets']);
        const idxSQLId = findColumnIndex(headers, ['sql id']);
        const idxModule = findColumnIndex(headers, ['sql module']);
        
        for (const row of rows) {
            const sql = {
                sqlId: idxSQLId >= 0 ? extractSQLId(row[idxSQLId]) : null,
                executions: idxExec >= 0 ? parseNumber(row[idxExec]) : null,
                elapsed_per_exec: idxElapsedPerExec >= 0 ? parseNumber(row[idxElapsedPerExec]) : null,
                rows_processed: idxRows >= 0 ? parseNumber(row[idxRows]) : null,
                buffer_gets: idxGets >= 0 ? parseNumber(row[idxGets]) : null,
                sql_module: idxModule >= 0 ? row[idxModule] : null
            };
            
            if (sql.sqlId) {
                sqlList.push(sql);
            }
        }
    }
    
    return sqlList;
}

function extractSQLOrderedByParseCalls($) {
    const sections = findSection($, 'SQL ordered by Parse Calls');
    const sqlList = [];
    
    for (const section of sections) {
        const { headers, rows } = parseSQLTable($, section.$table);
        
        const idxParse = findColumnIndex(headers, ['parse calls']);
        const idxExec = findColumnIndex(headers, ['executions']);
        const idxParsesPerExec = findColumnIndex(headers, ['parses per exec']);
        const idxSQLId = findColumnIndex(headers, ['sql id']);
        const idxModule = findColumnIndex(headers, ['sql module']);
        
        for (const row of rows) {
            const sql = {
                sqlId: idxSQLId >= 0 ? extractSQLId(row[idxSQLId]) : null,
                parse_calls: idxParse >= 0 ? parseNumber(row[idxParse]) : null,
                executions: idxExec >= 0 ? parseNumber(row[idxExec]) : null,
                parses_per_exec: idxParsesPerExec >= 0 ? parsePercentage(row[idxParsesPerExec]) : null,
                sql_module: idxModule >= 0 ? row[idxModule] : null
            };
            
            if (sql.sqlId) {
                sqlList.push(sql);
            }
        }
    }
    
    return sqlList;
}

function extractSQLOrderedByWaitTime($) {
    const sections = findSection($, 'SQL ordered by Wait Time');
    const sqlList = [];
    
    for (const section of sections) {
        const { headers, rows } = parseSQLTable($, section.$table);
        
        const idxWait = findColumnIndex(headers, ['wait time']);
        const idxElapsed = findColumnIndex(headers, ['elapsed']);
        const idxExec = findColumnIndex(headers, ['executions']);
        const idxWaitPerExec = findColumnIndex(headers, ['wait per exec']);
        const idxTotal = findColumnIndex(headers, ['%total']);
        const idxWaitClass = findColumnIndex(headers, ['wait class']);
        const idxSQLId = findColumnIndex(headers, ['sql id']);
        const idxModule = findColumnIndex(headers, ['sql module']);
        
        for (const row of rows) {
            const sql = {
                sqlId: idxSQLId >= 0 ? extractSQLId(row[idxSQLId]) : null,
                wait_time: idxWait >= 0 ? parseNumber(row[idxWait]) : null,
                elapsed_time: idxElapsed >= 0 ? parseNumber(row[idxElapsed]) : null,
                executions: idxExec >= 0 ? parseNumber(row[idxExec]) : null,
                wait_per_exec: idxWaitPerExec >= 0 ? parseNumber(row[idxWaitPerExec]) : null,
                percent_total: idxTotal >= 0 ? parsePercentage(row[idxTotal]) : null,
                wait_class: idxWaitClass >= 0 ? row[idxWaitClass] : null,
                sql_module: idxModule >= 0 ? row[idxModule] : null
            };
            
            if (sql.sqlId) {
                sqlList.push(sql);
            }
        }
    }
    
    return sqlList;
}

function extractSQLOrderedByGets($) {
    const sections = findSection($, 'SQL ordered by Gets');
    const sqlList = [];
    
    for (const section of sections) {
        const { headers, rows } = parseSQLTable($, section.$table);
        
        const idxGets = findColumnIndex(headers, ['buffer gets']);
        const idxExec = findColumnIndex(headers, ['executions']);
        const idxGetsPerExec = findColumnIndex(headers, ['gets per exec']);
        const idxTotal = findColumnIndex(headers, ['%total']);
        const idxElapsed = findColumnIndex(headers, ['elapsed']);
        const idxCPU = findColumnIndex(headers, ['cpu time']);
        const idxSQLId = findColumnIndex(headers, ['sql id']);
        const idxModule = findColumnIndex(headers, ['sql module']);
        
        for (const row of rows) {
            const sql = {
                sqlId: idxSQLId >= 0 ? extractSQLId(row[idxSQLId]) : null,
                buffer_gets: idxGets >= 0 ? parseNumber(row[idxGets]) : null,
                executions: idxExec >= 0 ? parseNumber(row[idxExec]) : null,
                gets_per_exec: idxGetsPerExec >= 0 ? parseNumber(row[idxGetsPerExec]) : null,
                percent_total: idxTotal >= 0 ? parsePercentage(row[idxTotal]) : null,
                elapsed_time: idxElapsed >= 0 ? parseNumber(row[idxElapsed]) : null,
                cpu_time: idxCPU >= 0 ? parseNumber(row[idxCPU]) : null,
                sql_module: idxModule >= 0 ? row[idxModule] : null
            };
            
            if (sql.sqlId) {
                sqlList.push(sql);
            }
        }
    }
    
    return sqlList;
}

function extractSQLOrderedByReads($) {
    const sections = findSection($, 'SQL ordered by Reads');
    const sqlList = [];
    
    for (const section of sections) {
        const { headers, rows } = parseSQLTable($, section.$table);
        
        const idxReads = findColumnIndex(headers, ['physical reads']);
        const idxExec = findColumnIndex(headers, ['executions']);
        const idxReadsPerExec = findColumnIndex(headers, ['reads per exec']);
        const idxTotal = findColumnIndex(headers, ['%total']);
        const idxElapsed = findColumnIndex(headers, ['elapsed']);
        const idxSQLId = findColumnIndex(headers, ['sql id']);
        const idxModule = findColumnIndex(headers, ['sql module']);
        
        for (const row of rows) {
            const sql = {
                sqlId: idxSQLId >= 0 ? extractSQLId(row[idxSQLId]) : null,
                physical_reads: idxReads >= 0 ? parseNumber(row[idxReads]) : null,
                executions: idxExec >= 0 ? parseNumber(row[idxExec]) : null,
                reads_per_exec: idxReadsPerExec >= 0 ? parseNumber(row[idxReadsPerExec]) : null,
                percent_total: idxTotal >= 0 ? parsePercentage(row[idxTotal]) : null,
                elapsed_time: idxElapsed >= 0 ? parseNumber(row[idxElapsed]) : null,
                sql_module: idxModule >= 0 ? row[idxModule] : null
            };
            
            if (sql.sqlId) {
                sqlList.push(sql);
            }
        }
    }
    
    return sqlList;
}

function extractSQLOrderedByClusterWait($) {
    const sections = findSection($, 'SQL ordered by Cluster Wait Time');
    const sqlList = [];
    
    for (const section of sections) {
        const { headers, rows } = parseSQLTable($, section.$table);
        
        const idxCluster = findColumnIndex(headers, ['cluster wait', 'clwait']);
        const idxExec = findColumnIndex(headers, ['executions']);
        const idxPerExec = findColumnIndex(headers, ['cluster wait per exec', 'clwait per exec']);
        const idxTotal = findColumnIndex(headers, ['%total']);
        const idxElapsed = findColumnIndex(headers, ['elapsed']);
        const idxSQLId = findColumnIndex(headers, ['sql id']);
        const idxModule = findColumnIndex(headers, ['sql module']);
        
        for (const row of rows) {
            const sql = {
                sqlId: idxSQLId >= 0 ? extractSQLId(row[idxSQLId]) : null,
                cluster_wait_time: idxCluster >= 0 ? parseNumber(row[idxCluster]) : null,
                executions: idxExec >= 0 ? parseNumber(row[idxExec]) : null,
                cluster_wait_per_exec: idxPerExec >= 0 ? parseNumber(row[idxPerExec]) : null,
                percent_total: idxTotal >= 0 ? parsePercentage(row[idxTotal]) : null,
                elapsed_time: idxElapsed >= 0 ? parseNumber(row[idxElapsed]) : null,
                sql_module: idxModule >= 0 ? row[idxModule] : null
            };
            
            if (sql.sqlId) {
                sqlList.push(sql);
            }
        }
    }
    
    return sqlList;
}

function extractSQLId(text) {
    if (!text) return null;
    const cleaned = parseHtmlEntities(text).trim();
    const match = cleaned.match(/^([a-z0-9]{13})$/i);
    if (match) return match[1];
    
    const anchorMatch = cleaned.match(/name="([a-z0-9]{13})"/i);
    if (anchorMatch) return anchorMatch[1];
    
    const sqlIdPattern = cleaned.match(/([a-z0-9]{13})/i);
    if (sqlIdPattern) return sqlIdPattern[1];
    
    return cleaned.substring(0, 13);
}

function extractCompleteSQLText($) {
    const sqlTextMap = {};
    
    // 查找包含 "Complete List of SQL Text" 标题的 h3 元素
    const $heading = $('h3.awr').filter((i, h3) => {
        return $(h3).text().includes('Complete List of SQL Text');
    });
    
    if ($heading.length > 0) {
        // 查找该标题后的表格，直到下一个 h3 元素
        const $table = $heading.nextUntil('h3.awr').find('table.tdiff').first();
        
        if ($table.length > 0) {
            // 解析表格
            $table.find('tr').each((i, tr) => {
                const $tr = $(tr);
                const $tds = $tr.find('td');
                
                if ($tds.length >= 2) {
                    // 第一列是 SQL ID，第二列是 SQL 文本
                    const sqlIdTd = $tds.eq(0);
                    const sqlTextTd = $tds.eq(1);
                    
                    // 提取 SQL ID
                    let sqlId = sqlIdTd.text().trim();
                    // 提取 13 位的 SQL ID
                    const match = sqlId.match(/([a-z0-9]{13})/i);
                    if (match) {
                        sqlId = match[1];
                    }
                    
                    // 提取 SQL 文本
                    const sqlText = sqlTextTd.text().trim();
                    
                    if (sqlId && sqlText) {
                        sqlTextMap[sqlId] = sqlText;
                    }
                }
            });
        }
    }
    
    return sqlTextMap;
}

function extractTimeModelStatistics($) {
    const sections = findSection($, 'Time Model Statistics');
    const stats = {};
    
    for (const section of sections) {
        const { rows } = parseSQLTable($, section.$table);
        
        for (const row of rows) {
            if (row.length >= 2) {
                const statName = row[0].trim();
                const value = parseNumber(row[1]);
                stats[statName] = value;
            }
        }
    }
    
    return stats;
}

function extractSessionsInfo($) {
    const sessions = {
        sessionsBegin: null,
        sessionsEnd: null,
        cursorsPerSessionBegin: null,
        cursorsPerSessionEnd: null
    };
    
    $('table.tdiff').each((i, table) => {
        const $table = $(table);
        const $rows = $table.find('tr');
        
        if ($rows.length < 2) return;
        
        const $headerRow = $rows.eq(0);
        const headerText = $headerRow.text().toLowerCase();
        
        if (headerText.includes('snap id') && headerText.includes('sessions')) {
            const headers = [];
            $headerRow.find('th').each((j, th) => {
                headers.push(parseHtmlEntities($(th).text()).toLowerCase().trim());
            });
            
            const sessionsIdx = headers.indexOf('sessions');
            const cursorsIdx = headers.indexOf('cursors/session');
            
            $rows.slice(1).each((j, tr) => {
                const $tr = $(tr);
                const $cells = $tr.find('td');
                const rowLabel = parseHtmlEntities($cells.eq(0).text()).toLowerCase().trim();
                
                if (rowLabel.includes('begin snap')) {
                    if (sessionsIdx >= 0 && sessionsIdx < $cells.length) {
                        sessions.sessionsBegin = parseNumber($cells.eq(sessionsIdx).text());
                    }
                    if (cursorsIdx >= 0 && cursorsIdx < $cells.length) {
                        sessions.cursorsPerSessionBegin = parseNumber($cells.eq(cursorsIdx).text());
                    }
                } else if (rowLabel.includes('end snap')) {
                    if (sessionsIdx >= 0 && sessionsIdx < $cells.length) {
                        sessions.sessionsEnd = parseNumber($cells.eq(sessionsIdx).text());
                    }
                    if (cursorsIdx >= 0 && cursorsIdx < $cells.length) {
                        sessions.cursorsPerSessionEnd = parseNumber($cells.eq(cursorsIdx).text());
                    }
                }
            });
            
            return false;
        }
    });
    
    return sessions;
}

function extractInstanceActivityStats($) {
    const activityStats = {
        userLogonsCumulative: null,
        userLogoutsCumulative: null,
        sessionsEnd: null
    };
    
    // 首先提取 End Snap 会话数
    const sessionsInfo = extractSessionsInfo($);
    if (sessionsInfo && sessionsInfo.sessionsEnd) {
        activityStats.sessionsEnd = sessionsInfo.sessionsEnd;
    }
    
    // 直接查找包含 "Instance Activity Stats" 标题的表格
    $('h3.awr').each((i, heading) => {
        const $heading = $(heading);
        const title = $heading.text().trim();
        
        if (title.includes('Instance Activity Stats') && !title.includes('Key') && !title.includes('Absolute') && !title.includes('Thread')) {
            // 找到正确的表格
            let $table = $heading.nextAll('table.tdiff').first();
            
            if ($table.length > 0) {
                // 直接遍历表格行查找所需数据
                $table.find('tr').each((j, tr) => {
                    const $tr = $(tr);
                    const $cells = $tr.find('td');
                    
                    if ($cells.length >= 2) {
                        const statName = $cells.eq(0).text().toLowerCase().trim();
                        const cumulativeValue = parseNumber($cells.eq(1).text()); // 第二列是累计值
                        
                        if (statName.includes('user logons cumulative')) {
                            activityStats.userLogonsCumulative = cumulativeValue;
                        } else if (statName.includes('user logouts cumulative')) {
                            activityStats.userLogoutsCumulative = cumulativeValue;
                        }
                    }
                });
            }
            
            return false; // 只处理第一个匹配的表格
        }
    });
    
    return Object.keys(activityStats).some(key => activityStats[key] !== null) ? activityStats : null;
}

function extractForegroundWaitClass($) {
    const sections = findSection($, 'Foreground Wait Class');
    const waitClasses = [];
    
    for (const section of sections) {
        const { rows } = parseSQLTable($, section.$table);
        
        for (const row of rows) {
            if (row.length >= 4) {
                waitClasses.push({
                    waitClass: row[0].trim(),
                    waits: parseNumber(row[1]),
                    totalTime: parseNumber(row[2]),
                    avgWait: parseNumber(row[3]),
                    timeouts: parseNumber(row[4]) || 0
                });
            }
        }
    }
    
    return waitClasses;
}

function extractLoadProfile($) {
    const loadProfile = {};
    
    $('table.tdiff').each((i, table) => {
        const $table = $(table);
        const summary = $table.attr('summary') || '';
        
        if (summary.toLowerCase().includes('load profile') && !summary.toLowerCase().includes('global cache')) {
            $table.find('tr').each((j, tr) => {
                const $tr = $(tr);
                const cells = $tr.find('td');
                
                if (cells.length >= 2) {
                    const label = parseHtmlEntities($(cells[0]).text()).toLowerCase().replace(/[:]/g, '').trim();
                    const perSecond = parseNumber($(cells[1]).text());
                    const perTransaction = cells.length >= 3 ? parseNumber($(cells[2]).text()) : null;
                    
                    if (label.includes('db time')) loadProfile.dbTimePerSec = perSecond;
                    else if (label.includes('db cpu') && !label.includes('background')) loadProfile.dbCpuPerSec = perSecond;
                    else if (label.includes('background cpu')) loadProfile.backgroundCpuPerSec = perSecond;
                    else if (label.includes('redo size')) loadProfile.redoSizePerSec = perSecond;
                    else if (label.includes('logical read')) loadProfile.logicalReadsPerSec = perSecond;
                    else if (label.includes('block changes')) loadProfile.blockChangesPerSec = perSecond;
                    else if (label.includes('physical read') && !label.includes('requests') && !label.includes('mb')) loadProfile.physicalReadsPerSec = perSecond;
                    else if (label.includes('physical write') && !label.includes('requests') && !label.includes('mb')) loadProfile.physicalWritesPerSec = perSecond;
                    else if (label.includes('read io requests')) loadProfile.readIORequestsPerSec = perSecond;
                    else if (label.includes('write io requests')) loadProfile.writeIORequestsPerSec = perSecond;
                    else if (label.includes('read io (mb)')) loadProfile.readIOMBPerSec = perSecond;
                    else if (label.includes('write io (mb)')) loadProfile.writeIOMBPerSec = perSecond;
                    else if (label.includes('user calls')) loadProfile.userCallsPerSec = perSecond;
                    else if (label.includes('parses (sql)') || label.includes('parses')) loadProfile.parsesPerSec = perSecond;
                    else if (label.includes('hard parses')) loadProfile.hardParsesPerSec = perSecond;
                    else if (label.includes('logons')) loadProfile.logonsPerSec = perSecond;
                    else if (label.includes('executes')) loadProfile.executesPerSec = perSecond;
                    else if (label.includes('transactions')) loadProfile.transactionsPerSec = perSecond;
                }
            });
        }
    });
    
    return Object.keys(loadProfile).length > 0 ? loadProfile : null;
}

function extractInstanceEfficiency($) {
    const efficiency = {};
    
    $('table.tdiff').each((i, table) => {
        const $table = $(table);
        const summary = $table.attr('summary') || '';
        
        if (summary.toLowerCase().includes('instance efficiency percentages')) {
            $table.find('tr').each((j, tr) => {
                const $tr = $(tr);
                const cells = $tr.find('td');
                
                for (let k = 0; k < cells.length; k += 2) {
                    if (k + 1 < cells.length) {
                        const label = parseHtmlEntities($(cells[k]).text()).toLowerCase().replace(/[:]/g, '').replace(/\s+/g, ' ').trim();
                        const value = parsePercentage($(cells[k + 1]).text());
                        
                        if (label.includes('buffer nowait')) efficiency.bufferNowaitPercent = value;
                        else if (label.includes('redo nowait')) efficiency.redoNoWaitPercent = value;
                        else if (label.includes('buffer hit')) efficiency.bufferHitPercent = value;
                        else if (label.includes('in-memory sort')) efficiency.inMemorySortPercent = value;
                        else if (label.includes('library hit')) efficiency.libraryHitPercent = value;
                        else if (label.includes('soft parse')) efficiency.softParsePercent = value;
                        else if (label.includes('execute to parse')) efficiency.executeToParsePercent = value;
                        else if (label.includes('latch hit')) efficiency.latchHitPercent = value;
                        else if (label.includes('parse cpu to parse elapsd')) efficiency.parseCpuToParseElapsdPercent = value;
                        else if (label.includes('non-parse cpu')) efficiency.nonParseCpuPercent = value;
                        else if (label.includes('flash cache hit')) efficiency.flashCacheHitPercent = value;
                    }
                }
            });
        }
    });
    
    return Object.keys(efficiency).length > 0 ? efficiency : null;
}

function extractHostCPU($) {
    const hostCPU = {};
    
    $('table.tdiff').each((i, table) => {
        const $table = $(table);
        const summary = $table.attr('summary') || '';
        
        if (summary.toLowerCase().includes('system load statistics')) {
            $table.find('tr').each((j, tr) => {
                const $tr = $(tr);
                
                if (j === 0) return;
                
                const cells = $tr.find('td');
                if (cells.length >= 9) {
                    hostCPU.cpus = parseNumber($(cells[0]).text());
                    hostCPU.cores = parseNumber($(cells[1]).text());
                    hostCPU.sockets = parseNumber($(cells[2]).text());
                    hostCPU.loadAverageBegin = parseNumber($(cells[3]).text());
                    hostCPU.loadAverageEnd = parseNumber($(cells[4]).text());
                    hostCPU.userPercent = parseNumber($(cells[5]).text());
                    hostCPU.systemPercent = parseNumber($(cells[6]).text());
                    hostCPU.wioPercent = parseNumber($(cells[7]).text());
                    hostCPU.idlePercent = parseNumber($(cells[8]).text());
                }
            });
        }
    });
    
    return Object.keys(hostCPU).length > 0 ? hostCPU : null;
}

function extractIOProfile($) {
    const ioProfile = {};
    
    $('table.tdiff').each((i, table) => {
        const $table = $(table);
        const summary = $table.attr('summary') || '';
        
        if (summary.toLowerCase().includes('io profile')) {
            $table.find('tr').each((j, tr) => {
                const $tr = $(tr);
                const cells = $tr.find('td');
                
                if (cells.length >= 4) {
                    const label = parseHtmlEntities($(cells[0]).text()).toLowerCase().replace(/[:]/g, '').trim();
                    const rwPerSec = parseNumber($(cells[1]).text());
                    const readPerSec = parseNumber($(cells[2]).text());
                    const writePerSec = parseNumber($(cells[3]).text());
                    
                    if (label.includes('total requests')) {
                        ioProfile.totalRequestsRW = rwPerSec;
                        ioProfile.totalRequestsRead = readPerSec;
                        ioProfile.totalRequestsWrite = writePerSec;
                    } else if (label.includes('database requests')) {
                        ioProfile.dbRequestsRW = rwPerSec;
                        ioProfile.dbRequestsRead = readPerSec;
                        ioProfile.dbRequestsWrite = writePerSec;
                    } else if (label.includes('total (mb)')) {
                        ioProfile.totalMBRW = rwPerSec;
                        ioProfile.totalMBRead = readPerSec;
                        ioProfile.totalMBWrite = writePerSec;
                    } else if (label.includes('database (mb)') && !label.includes('blocks')) {
                        ioProfile.dbMBRW = rwPerSec;
                        ioProfile.dbMBRead = readPerSec;
                        ioProfile.dbMBWrite = writePerSec;
                    } else if (label.includes('database (blocks)')) {
                        ioProfile.dbBlocksRW = rwPerSec;
                        ioProfile.dbBlocksRead = readPerSec;
                        ioProfile.dbBlocksWrite = writePerSec;
                    }
                }
            });
        }
    });
    
    return Object.keys(ioProfile).length > 0 ? ioProfile : null;
}

function extractMemoryStats($) {
    const memoryStats = {};
    
    $('table.tdiff').each((i, table) => {
        const $table = $(table);
        const summary = $table.attr('summary') || '';
        
        if (summary.toLowerCase().includes('memory statistics')) {
            $table.find('tr').each((j, tr) => {
                const $tr = $(tr);
                const cells = $tr.find('td');
                
                if (cells.length >= 3) {
                    const label = parseHtmlEntities($(cells[0]).text()).toLowerCase().replace(/[:]/g, '').trim();
                    const begin = parseNumber($(cells[1]).text());
                    const end = parseNumber($(cells[2]).text());
                    
                    if (label === 'host mem (mb)') {
                        memoryStats.hostMemMB = begin;
                        memoryStats.hostMemMBEnd = end;
                    } else if (label === 'sga use (mb)') {
                        memoryStats.sgaUseMB = begin;
                        memoryStats.sgaUseMBEnd = end;
                    } else if (label === 'pga use (mb)') {
                        memoryStats.pgaUseMB = begin;
                        memoryStats.pgaUseMBEnd = end;
                    } else if (label.includes('host mem used')) {
                        memoryStats.hostMemUsedPercent = begin;
                        memoryStats.hostMemUsedPercentEnd = end;
                    }
                }
            });
        }
    });
    
    return Object.keys(memoryStats).length > 0 ? memoryStats : null;
}

function extractADDMFindings($) {
    const findings = [];
    
    $('table.tdiff').each((i, table) => {
        const $table = $(table);
        const summary = $table.attr('summary') || '';
        
        if (summary.toLowerCase().includes('addm findings')) {
            $table.find('tr').each((j, tr) => {
                const $tr = $(tr);
                
                if (j === 0) return;
                
                const row = [];
                $tr.find('td').each((k, td) => {
                    row.push(parseHtmlEntities($(td).text()));
                });
                
                if (row.length >= 6) {
                    findings.push({
                        findingName: row[0].trim(),
                        avgActiveSessions: parseNumber(row[1]),
                        percentActiveSessions: parseNumber(row[2]),
                        taskName: row[3].trim(),
                        beginSnapTime: row[4].trim(),
                        endSnapTime: row[5].trim()
                    });
                }
            });
        }
    });
    
    return findings;
}

function parseReportDeeply(filePath) {
    const html = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(html);
    
    return {
        fileName: path.basename(filePath),
        filePath: filePath,
        header: extractReportHeader($),
        snapshots: extractSnapshots($),
        
        sqlByElapsed: extractSQLOrderedByElapsed($),
        sqlByCPU: extractSQLOrderedByCPU($),
        sqlByExecutions: extractSQLOrderedByExecutions($),
        sqlByParseCalls: extractSQLOrderedByParseCalls($),
        sqlByWaitTime: extractSQLOrderedByWaitTime($),
        sqlByGets: extractSQLOrderedByGets($),
        sqlByReads: extractSQLOrderedByReads($),
        sqlByCluster: extractSQLOrderedByClusterWait($),
        
        sqlTextMap: extractCompleteSQLText($),
        timeModelStats: extractTimeModelStatistics($),
        sessions: extractSessionsInfo($),
        foregroundWaitClass: extractForegroundWaitClass($),
        topEvents: extractTopEvents($)
    };
}

function parseReportByDimension(filePath) {
    const html = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(html);
    const fileName = path.basename(filePath);
    
    return {
        fileName: fileName,
        filePath: filePath,
        
        summary: {
            fileName: fileName,
            header: extractReportHeader($),
            snapshots: extractSnapshots($),
            addmFindings: extractADDMFindings($)
        },
        
        sessions: {
            fileName: fileName,
            sessionsInfo: extractSessionsInfo($),
            instanceActivityStats: extractInstanceActivityStats($)
        },
        
        load: {
            fileName: fileName,
            loadProfile: extractLoadProfile($)
        },
        
        waits: {
            fileName: fileName,
            topEvents: extractTopEvents($),
            waitClasses: extractForegroundWaitClass($),
            waitEventSQL: extractSQLOrderedByWaitTime($)
        },
        
        slowSQL: {
            fileName: fileName,
            sqlByElapsed: extractSQLOrderedByElapsed($),
            sqlByCPU: extractSQLOrderedByCPU($),
            sqlByIOWait: extractSQLOrderedByWaitTime($),
            sqlByGets: extractSQLOrderedByGets($),
            sqlByReads: extractSQLOrderedByReads($),
            sqlByCluster: extractSQLOrderedByClusterWait($)
        },
        
        freqSQL: {
            fileName: fileName,
            sqlByExecutions: extractSQLOrderedByExecutions($),
            sqlByParseCalls: extractSQLOrderedByParseCalls($)
        },
        
        efficiency: {
            fileName: fileName,
            instanceEfficiency: extractInstanceEfficiency($)
        },
        
        resources: {
            fileName: fileName,
            hostCPU: extractHostCPU($),
            ioProfile: extractIOProfile($),
            memoryStats: extractMemoryStats($)
        },
        
        sqlTextMap: extractCompleteSQLText($)
    };
}

function parseMultipleReportsDeeply(filePaths) {
    const results = {};
    
    for (const filePath of filePaths) {
        try {
            const data = parseReportDeeply(filePath);
            results[path.basename(filePath)] = data;
            console.log(`Deep parsed: ${path.basename(filePath)}`);
        } catch (error) {
            console.error(`Error deep parsing ${filePath}: ${error.message}`);
        }
    }
    
    return results;
}

module.exports = {
    parseReportDeeply,
    parseReportByDimension,
    parseMultipleReportsDeeply,
    extractSQLOrderedByElapsed,
    extractSQLOrderedByCPU,
    extractSQLOrderedByExecutions,
    extractSQLOrderedByParseCalls,
    extractSQLOrderedByWaitTime,
    extractSQLOrderedByGets,
    extractSQLOrderedByReads,
    extractSQLOrderedByClusterWait,
    extractCompleteSQLText,
    extractTimeModelStatistics,
    extractSessionsInfo,
    extractForegroundWaitClass,
    extractADDMFindings,
    extractInstanceEfficiency,
    extractSQLId,
    findSection,
    parseSQLTable,
    parseNumber,
    parsePercentage,
    parseHtmlEntities,
    findColumnIndex
};
