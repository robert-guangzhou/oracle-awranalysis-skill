const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

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

function parseTimeToMinutes(timeStr) {
    if (!timeStr) return null;
    const cleaned = parseHtmlEntities(timeStr).trim();
    
    const minsMatch = cleaned.match(/([\d,]+\.?\d*)\s*\(mins\)/i);
    if (minsMatch) {
        return parseFloat(minsMatch[1].replace(/,/g, ''));
    }
    
    const hourMatch = cleaned.match(/(\d+)\s*(?:hrs?|hours?)/i);
    const minMatch = cleaned.match(/(\d+)\s*(?:mins?|minutes?)/i);
    
    let totalMinutes = 0;
    if (hourMatch) totalMinutes += parseInt(hourMatch[1]) * 60;
    if (minMatch) totalMinutes += parseInt(minMatch[1]);
    
    if (totalMinutes > 0) return totalMinutes;
    
    const simpleMinutes = cleaned.match(/^([\d,]+\.?\d*)$/);
    if (simpleMinutes) {
        return parseFloat(simpleMinutes[1].replace(/,/g, ''));
    }
    
    return null;
}

function parseDateTime(dateStr) {
    if (!dateStr) return null;
    const cleaned = parseHtmlEntities(dateStr).trim();
    
    const monthMap = {
        'jan': 0, 'january': 0,
        'feb': 1, 'february': 1,
        'mar': 2, 'march': 2,
        'apr': 3, 'april': 3,
        'may': 4,
        'jun': 5, 'june': 5,
        'jul': 6, 'july': 6,
        'aug': 7, 'august': 7,
        'sep': 8, 'september': 8,
        'oct': 9, 'october': 9,
        'nov': 10, 'november': 10,
        'dec': 11, 'december': 11,
        '1月': 0, '2月': 1, '3月': 2, '4月': 3, '5月': 4, '6月': 5,
        '7月': 6, '8月': 7, '9月': 8, '10月': 9, '11月': 10, '12月': 11,
        '一月': 0, '二月': 1, '三月': 2, '四月': 3, '五月': 4, '六月': 5,
        '七月': 6, '八月': 7, '九月': 8, '十月': 9, '十一月': 10, '十二月': 11
    };
    
    const patterns = [
        {
            regex: /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
            handler: (m) => new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6]))
        },
        {
            regex: /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
            handler: (m) => new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6]))
        },
        {
            regex: /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/,
            handler: (m) => new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6]))
        },
        {
            regex: /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/,
            handler: (m) => new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6]))
        },
        {
            regex: /^(\d{2})-([A-Za-z]+)-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
            handler: (m) => {
                const month = monthMap[m[2].toLowerCase()];
                if (month === undefined) return null;
                return new Date(2000 + parseInt(m[3]), month, parseInt(m[1]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6]));
            }
        },
        {
            regex: /^(\d{2})-([A-Za-z]+)-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/,
            handler: (m) => {
                const month = monthMap[m[2].toLowerCase()];
                if (month === undefined) return null;
                return new Date(parseInt(m[3]), month, parseInt(m[1]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6]));
            }
        },
        {
            regex: /^(\d{1,2})-(\d{1,2})月\s*-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
            handler: (m) => {
                const monthStr = m[2] + '月';
                const month = monthMap[monthStr] !== undefined ? monthMap[monthStr] : parseInt(m[2]) - 1;
                return new Date(2000 + parseInt(m[3]), month, parseInt(m[1]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6]));
            }
        },
        {
            regex: /^(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2}):(\d{2})$/,
            handler: (m) => new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6]))
        },
        {
            regex: /^(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})$/,
            handler: (m) => new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), parseInt(m[4]), parseInt(m[5]), 0)
        },
        {
            regex: /^(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2}):(\d{2})$/,
            handler: (m) => {
                const monthStr = m[1] + '月';
                const month = monthMap[monthStr] !== undefined ? monthMap[monthStr] : parseInt(m[1]) - 1;
                const year = new Date().getFullYear();
                return new Date(year, month, parseInt(m[2]), parseInt(m[3]), parseInt(m[4]), parseInt(m[5]));
            }
        },
        {
            regex: /^(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})$/,
            handler: (m) => {
                const monthStr = m[1] + '月';
                const month = monthMap[monthStr] !== undefined ? monthMap[monthStr] : parseInt(m[1]) - 1;
                const year = new Date().getFullYear();
                return new Date(year, month, parseInt(m[2]), parseInt(m[3]), parseInt(m[4]), 0);
            }
        },
        {
            regex: /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/,
            handler: (m) => {
                const month = monthMap[m[1].toLowerCase()];
                if (month === undefined) return null;
                return new Date(parseInt(m[3]), month, parseInt(m[2]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6]));
            }
        },
        {
            regex: /^([A-Za-z]+)\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})$/,
            handler: (m) => {
                const month = monthMap[m[1].toLowerCase()];
                if (month === undefined) return null;
                return new Date(parseInt(m[6]), month, parseInt(m[2]), parseInt(m[3]), parseInt(m[4]), parseInt(m[5]));
            }
        },
        {
            regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i,
            handler: (m) => {
                let hour = parseInt(m[4]);
                if (m[7] && m[7].toUpperCase() === 'PM' && hour < 12) hour += 12;
                if (m[7] && m[7].toUpperCase() === 'AM' && hour === 12) hour = 0;
                return new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]), hour, parseInt(m[5]), parseInt(m[6]));
            }
        }
    ];
    
    for (const pattern of patterns) {
        const match = cleaned.match(pattern.regex);
        if (match) {
            const result = pattern.handler(match);
            if (result && !isNaN(result.getTime())) {
                return result;
            }
        }
    }
    
    const fallbackDate = new Date(cleaned);
    if (!isNaN(fallbackDate.getTime())) {
        return fallbackDate;
    }
    
    return null;
}

function extractTable($, sectionTitle) {
    const tables = [];
    
    $('h3.awr, h2.awr').each((i, heading) => {
        const $heading = $(heading);
        const title = parseHtmlEntities($heading.text());
        
        if (title.toLowerCase().includes(sectionTitle.toLowerCase())) {
            let $table = $heading.next('table.tdiff');
            
            if ($table.length === 0) {
                $table = $heading.nextUntil('table.tdiff').next('table.tdiff').first();
            }
            
            if ($table.length > 0) {
                const table = parseTable($, $table);
                tables.push({ title, data: table });
            }
        }
    });
    
    return tables;
}

function extractTableBySummaryKeywords($, keywordSets) {
    const tables = [];

    $('table.tdiff').each((i, table) => {
        const $table = $(table);
        const summary = parseHtmlEntities($table.attr('summary') || '').toLowerCase().trim();

        if (!summary) return;

        const matched = keywordSets.some(keywords => keywords.every(keyword => summary.includes(keyword)));
        if (!matched) return;

        tables.push({
            title: summary,
            data: parseTable($, $table)
        });
    });

    return tables;
}

function parseTable($, $table) {
    const rows = [];
    
    $table.find('tr').each((i, tr) => {
        const row = [];
        const $tr = $(tr);
        
        $tr.find('th, td').each((j, cell) => {
            const $cell = $(cell);
            let text = $cell.text();
            text = parseHtmlEntities(text);
            row.push(text);
        });
        
        if (row.length > 0) {
            rows.push(row);
        }
    });
    
    return rows;
}

function parseKeyValueTable(rows) {
    const result = {};
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.length >= 2) {
            const key = row[0].trim().replace(/:$/, '');
            const value = row[1].trim();
            result[key] = value;
        }
    }
    
    return result;
}

function extractReportHeader($) {
    const header = {
        dbName: null,
        dbId: null,
        instance: null,
        instNum: null,
        version: null,
        hostName: null,
        platform: null,
        CPUs: null,
        cores: null,
        sockets: null,
        memory: null
    };

    const fieldMap = {
        'db name': 'dbName',
        'db id': 'dbId',
        'release': 'version',
        'instance': 'instance',
        'inst num': 'instNum',
        'host name': 'hostName',
        'platform': 'platform',
        'cpus': 'CPUs',
        'cores': 'cores',
        'sockets': 'sockets',
        'memory (gb)': 'memory'
    };

    function assignHeaderValue(label, rawValue) {
        const field = fieldMap[label];
        if (!field) return;

        const value = rawValue?.trim?.() ?? rawValue;
        if (value === undefined || value === null || value === '') return;

        let parsedValue = value;
        if (['instNum', 'CPUs', 'cores', 'sockets'].includes(field)) {
            parsedValue = parseNumber(value);
            if (parsedValue === null || parsedValue === undefined) return;
        }

        if (header[field] === null || header[field] === undefined || header[field] === '') {
            header[field] = parsedValue;
        }
    }
    
    $('table.tdiff').each((i, table) => {
        const $table = $(table);
        const rows = parseTable($, $table);
        
        if (rows.length > 0) {
            const headers = rows[0].map(h => h.toLowerCase().trim());
            
            if (headers.length > 0) {
                let allHeadersKnown = true;
                for (let j = 0; j < headers.length; j++) {
                    const h = headers[j];
                    const isKnown = [
                        'db name', 'db id', 'unique name', 'role', 'edition', 'release', 'rac', 'cdb',
                        'instance', 'inst num', 'startup time',
                        'host name', 'platform', 'cpus', 'cores', 'sockets', 'memory (gb)'
                    ].includes(h);
                    if (!isKnown) {
                        allHeadersKnown = false;
                        break;
                    }
                }
                
                if (!allHeadersKnown) {
                    for (let j = 0; j < rows.length; j++) {
                        const row = rows[j];
                        for (let k = 0; k < row.length; k += 2) {
                            if (k + 1 < row.length) {
                                const h = row[k]?.toLowerCase().replace(/:$/, '').trim();
                                const v = row[k + 1]?.trim();
                                assignHeaderValue(h, v);
                            }
                        }
                    }
                } else {
                    if (rows.length > 1) {
                        const dataRow = rows[1];
                        for (let j = 0; j < headers.length && j < dataRow.length; j++) {
                            const h = headers[j];
                            const v = dataRow[j]?.trim();
                            assignHeaderValue(h, v);
                        }
                    }
                }
            }
        }
    });
    
    return header;
}

function extractSnapshots($) {
    const snapshots = {
        beginSnap: { id: null, time: null },
        endSnap: { id: null, time: null },
        elapsed: null,
        dbTime: null
    };
    
    $('table.tdiff').each((i, table) => {
        const $table = $(table);
        const rows = parseTable($, $table);
        
        for (const row of rows) {
            const firstCell = row[0]?.toLowerCase().trim();
            
            if (firstCell === 'begin snap:') {
                snapshots.beginSnap.id = parseNumber(row[1]);
                snapshots.beginSnap.time = parseDateTime(row[2]);
            } else if (firstCell === 'end snap:') {
                snapshots.endSnap.id = parseNumber(row[1]);
                snapshots.endSnap.time = parseDateTime(row[2]);
            } else if (firstCell === 'elapsed:') {
                snapshots.elapsed = parseTimeToMinutes(row[2]);
            } else if (firstCell === 'db time:') {
                snapshots.dbTime = parseTimeToMinutes(row[2]);
            } else {
                for (let k = 0; k < row.length; k += 2) {
                    const key = row[k]?.toLowerCase().replace(/:$/, '').trim();
                    const value = row[k + 1]?.trim();
                    
                    if (key && value) {
                        switch (key) {
                            case 'begin snap':
                                snapshots.beginSnap.id = parseNumber(value);
                                break;
                            case 'snap begin':
                                snapshots.beginSnap.time = parseDateTime(value);
                                break;
                            case 'end snap':
                                snapshots.endSnap.id = parseNumber(value);
                                break;
                            case 'snap end':
                                snapshots.endSnap.time = parseDateTime(value);
                                break;
                            case 'snap time':
                                if (value.toLowerCase().includes('begin')) {
                                    snapshots.beginSnap.time = parseDateTime(value.split(',')[0]?.replace(/.*begin\s*/i, ''));
                                } else if (value.toLowerCase().includes('end')) {
                                    snapshots.endSnap.time = parseDateTime(value.split(',')[0]?.replace(/.*end\s*/i, ''));
                                }
                                break;
                            case 'elapsed':
                                snapshots.elapsed = parseTimeToMinutes(value);
                                break;
                            case 'db time':
                                snapshots.dbTime = parseTimeToMinutes(value);
                                break;
                        }
                    }
                }
            }
        }
    });
    
    return snapshots;
}

function extractLoadProfile($) {
    const loadProfile = {};
    
    const tables = extractTable($, 'Load Profile');
    if (tables.length > 0) {
        const rows = tables[0].data;
        
        if (rows.length > 1) {
            const headers = rows[0];
            const perSecondIdx = headers.findIndex(h => h.toLowerCase().includes('per second'));
            const perTransactionIdx = headers.findIndex(h => h.toLowerCase().includes('per transaction'));
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (row.length > 0) {
                    const metricName = row[0].trim();
                    loadProfile[metricName] = {
                        perSecond: perSecondIdx >= 0 ? parseNumber(row[perSecondIdx]) : null,
                        perTransaction: perTransactionIdx >= 0 ? parseNumber(row[perTransactionIdx]) : null
                    };
                }
            }
        }
    }
    
    return loadProfile;
}

function extractTopEvents($) {
    const events = [];
    
    let tables = extractTable($, 'Top 10 Foreground Events');
    if (tables.length === 0) {
        tables = extractTableBySummaryKeywords($, [
            ['top 10', 'wait events', 'total wait time'],
            ['foreground events', 'total wait time']
        ]);
    }

    if (tables.length > 0) {
        const rows = tables[0].data;
        
        if (rows.length > 1) {
            const headers = rows[0].map(h => h.toLowerCase().trim());
            const waitsIdx = headers.findIndex(h => h.includes('waits'));
            const timeoutsIdx = headers.findIndex(h => h.includes('timeouts') || h.includes('time outs'));
            const totalWaitIdx = headers.findIndex(h => h.includes('total wait') || h.includes('time(s)'));
            const avgWaitIdx = headers.findIndex(h => h.includes('avg wait') || h.includes('wait ms'));
            const percentDbIdx = headers.findIndex(h => h.includes('% db') || h.includes('%db'));
            const waitClassIdx = headers.findIndex(h => h.includes('wait class'));
            
            for (let i = 1; i < rows.length && i <= 10; i++) {
                const row = rows[i];
                if (row.length > 0 && row[0].trim()) {
                    const event = {
                        name: row[0].trim(),
                        waits: waitsIdx >= 0 ? parseNumber(row[waitsIdx]) : null,
                        timeOuts: timeoutsIdx >= 0 ? parseNumber(row[timeoutsIdx]) : null,
                        totalWaitTime: totalWaitIdx >= 0 ? parseNumber(row[totalWaitIdx]) : null,
                        avgWait: avgWaitIdx >= 0 ? parseNumber(row[avgWaitIdx]) : null,
                        percentDbTime: percentDbIdx >= 0 ? parsePercentage(row[percentDbIdx]) : null,
                        waitClass: waitClassIdx >= 0 ? row[waitClassIdx]?.trim() || null : null
                    };
                    events.push(event);
                }
            }
        }
    }
    
    return events;
}

function extractWaitClasses($) {
    const waitClasses = [];
    
    let tables = extractTable($, 'Wait Classes by Total Wait Time');
    if (tables.length === 0) {
        tables = extractTableBySummaryKeywords($, [
            ['wait class', 'total wait time'],
            ['wait class statistics', 'total wait time']
        ]);
    }

    if (tables.length > 0) {
        const rows = tables[0].data;
        
        if (rows.length > 1) {
            const headers = rows[0].map(h => h.toLowerCase().trim());
            const waitsIdx = headers.findIndex(h => h.includes('waits'));
            const totalTimeIdx = headers.findIndex(h => h.includes('time(s)') || h.includes('total'));
            const avgWaitIdx = headers.findIndex(h => h.includes('avg'));
            const percentDbIdx = headers.findIndex(h => h.includes('% db') || h.includes('%db') || h === '%' || h.endsWith('%'));
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (row.length > 0 && row[0].trim()) {
                    const waitClass = {
                        name: row[0].trim(),
                        waits: waitsIdx >= 0 ? parseNumber(row[waitsIdx]) : null,
                        totalTime: totalTimeIdx >= 0 ? parseNumber(row[totalTimeIdx]) : null,
                        avgWait: avgWaitIdx >= 0 ? parseNumber(row[avgWaitIdx]) : null,
                        percentDbTime: percentDbIdx >= 0 ? parsePercentage(row[percentDbIdx]) : null
                    };
                    waitClasses.push(waitClass);
                }
            }
        }
    }
    
    return waitClasses;
}

function extractHostCpu($) {
    const hostCpu = {
        userPercent: null,
        sysPercent: null,
        idlePercent: null,
        wioPercent: null
    };
    
    const tables = extractTable($, 'Host CPU');
    if (tables.length > 0) {
        const rows = tables[0].data;
        
        for (const row of rows) {
            if (row.length >= 2) {
                const key = row[0].toLowerCase().trim();
                const value = parsePercentage(row[1]);
                
                if (key.includes('user')) hostCpu.userPercent = value;
                else if (key.includes('sys')) hostCpu.sysPercent = value;
                else if (key.includes('idle')) hostCpu.idlePercent = value;
                else if (key.includes('wio') || key.includes('i/o')) hostCpu.wioPercent = value;
            }
        }
    }
    
    return hostCpu;
}

function extractInstanceEfficiency($) {
    const efficiency = {};
    
    const tables = extractTable($, 'Instance Efficiency Percentages');
    if (tables.length > 0) {
        const rows = tables[0].data;
        
        for (const row of rows) {
            for (let k = 0; k < row.length; k += 2) {
                const key = row[k]?.trim().replace(/:$/, '');
                const value = parsePercentage(row[k + 1]);
                
                if (key && value !== null) {
                    efficiency[key] = value;
                }
            }
        }
    }
    
    return efficiency;
}

function extractIOProfile($) {
    const ioProfile = {
        reads: { perSecond: null, perTransaction: null },
        writes: { perSecond: null, perTransaction: null },
        total: { perSecond: null, perTransaction: null }
    };
    
    const tables = extractTable($, 'IO Profile');
    if (tables.length > 0) {
        const rows = tables[0].data;
        
        if (rows.length > 1) {
            const headers = rows[0].map(h => h.toLowerCase().trim());
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (row.length > 0) {
                    const metricName = row[0].toLowerCase().trim();
                    
                    if (metricName.includes('read')) {
                        ioProfile.reads.perSecond = parseNumber(row[headers.findIndex(h => h.includes('per second'))]);
                        ioProfile.reads.perTransaction = parseNumber(row[headers.findIndex(h => h.includes('per transaction'))]);
                    } else if (metricName.includes('write')) {
                        ioProfile.writes.perSecond = parseNumber(row[headers.findIndex(h => h.includes('per second'))]);
                        ioProfile.writes.perTransaction = parseNumber(row[headers.findIndex(h => h.includes('per transaction'))]);
                    } else if (metricName.includes('total')) {
                        ioProfile.total.perSecond = parseNumber(row[headers.findIndex(h => h.includes('per second'))]);
                        ioProfile.total.perTransaction = parseNumber(row[headers.findIndex(h => h.includes('per transaction'))]);
                    }
                }
            }
        }
    }
    
    return ioProfile;
}

function extractMemoryStats($) {
    let memoryStats = {};
    
    const tables = extractTable($, 'Memory Statistics');
    if (tables.length > 0) {
        const rows = tables[0].data;
        memoryStats = parseKeyValueTable(rows);
    }
    
    const cacheTables = extractTable($, 'Cache Sizes');
    if (cacheTables.length > 0) {
        const rows = cacheTables[0].data;
        for (const row of rows) {
            if (row.length >= 2) {
                const key = row[0].trim().replace(/:$/, '');
                memoryStats[key] = row[1].trim();
            }
        }
    }
    
    return memoryStats;
}

function extractADDMFindings($) {
    const findings = [];
    
    // ADDM Findings 在 "Report Summary" 部分的第一个表格
    // 表头: Finding Name, Avg active sessions of the task, Percent active sessions of finding, Task Name, Begin Snap Time, End Snap Time
    const tables = extractTable($, 'Report Summary');
    if (tables.length > 0) {
        const rows = tables[0].data;
        
        // 检查表头是否包含 ADDM 相关字段
        if (rows.length > 0) {
            const header = rows[0];
            const hasFindingName = header.some(h => 
                h && (h.toLowerCase().includes('finding') || h.includes('Finding Name'))
            );
            
            if (hasFindingName) {
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row.length >= 3) {
                        findings.push({
                            findingName: row[0]?.trim(),
                            avgActiveSessions: row[1]?.trim(),
                            percentActiveSessions: row[2]?.trim(),
                            taskName: row[3]?.trim(),
                            beginSnapTime: row[4]?.trim(),
                            endSnapTime: row[5]?.trim()
                        });
                    }
                }
            }
        }
    }
    
    return findings;
}

function parseAWRReport(filePath) {
    const html = fs.readFileSync(filePath, 'utf-8');
    const $ = cheerio.load(html);
    
    const report = {
        fileName: path.basename(filePath),
        filePath: filePath,
        header: extractReportHeader($),
        snapshots: extractSnapshots($),
        loadProfile: extractLoadProfile($),
        topEvents: extractTopEvents($),
        waitClasses: extractWaitClasses($),
        hostCpu: extractHostCpu($),
        instanceEfficiency: extractInstanceEfficiency($),
        ioProfile: extractIOProfile($),
        memoryStats: extractMemoryStats($),
        addmFindings: extractADDMFindings($)
    };
    
    report.instance = report.header.instance;
    report.beginSnapTime = report.snapshots.beginSnap.time;
    report.endSnapTime = report.snapshots.endSnap.time;
    report.dbTimeMinutes = report.snapshots.dbTime;
    
    return report;
}

function scanAWRDirectory(directory, recursive = true) {
    const reports = [];
    const awrPattern = /^awrrpt_\d+_\d+_\d+\.html$/i;
    
    function scanDir(dir) {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const itemPath = path.join(dir, item);
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory() && recursive) {
                scanDir(itemPath);
            } else if (stat.isFile() && awrPattern.test(item)) {
                try {
                    const report = parseAWRReport(itemPath);
                    reports.push(report);
                    console.log(`Parsed: ${item}`);
                } catch (error) {
                    console.error(`Error parsing ${item}: ${error.message}`);
                }
            }
        }
    }
    
    scanDir(directory);
    return reports;
}

module.exports = {
    parseAWRReport,
    scanAWRDirectory,
    parseHtmlEntities,
    parseNumber,
    parsePercentage,
    parseTimeToMinutes,
    parseDateTime,
    extractTable,
    parseTable,
    parseKeyValueTable,
    extractReportHeader,
    extractSnapshots,
    extractLoadProfile,
    extractTopEvents,
    extractWaitClasses,
    extractHostCpu,
    extractInstanceEfficiency,
    extractIOProfile,
    extractMemoryStats,
    extractADDMFindings
};
