const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { parseNumber, parsePercentage, parseHtmlEntities } = require('./deep-parser');

function loadAWRReport(filePath) {
    const html = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(html);
    return $;
}

function extractHeader($) {
    const header = {};
    
    const dbInfoTable = $('table:contains "DB Name"');
    if (dbInfoTable.length > 0) {
        const rows = dbInfoTable.find('tr');
        for (const row of rows) {
            const cells = row.find('td');
            if (cells.length >= 2) {
                const label = cells[0].text().trim();
                const value = cells[1].text().trim();
                if (label.includes('DB Name')) header.dbName = value;
                if (label.includes('DB Id')) header.dbId = value;
                if (label.includes('Instance')) header.instance = value;
                if (label.includes('Inst Num')) header.instNum = parseNumber(value);
                if (label.includes('Release')) header.release = value;
                if (label.includes('Host Name')) header.hostName = value;
            }
        }
    }
    
    const snapshotTable = $('table:contains "Snap Id"');
    if (snapshotTable.length > 0) {
        const rows = snapshotTable.find('tr');
        for (const row of rows) {
            const cells = row.find('td');
            if (cells.length >= 2) {
                const label = cells[0].text().trim();
                const value = cells[1].text().trim();
                if (label.includes('Snap Id')) {
                    header.beginSnapId = parseNumber(value);
                    header.endSnapId = parseNumber(cells[2].text().trim());
                }
            }
        }
    }
    
    return header;
}

function extractSnapshots($) {
    const snapshots = {};
    
    const snapshotTable = $('table:contains "Snap Id"');
    if (snapshotTable.length > 0) {
        const rows = snapshotTable.find('tr');
        for (const row of rows) {
            const cells = row.find('td');
            if (cells.length >= 2) {
                const label = cells[0].text().trim();
                const value = cells[1].text().trim();
                if (label.includes('Snap Id')) {
                    snapshots.beginSnapId = parseNumber(value);
                    snapshots.endSnapId = parseNumber(cells[2].text().trim());
                }
                if (label.includes('Snap Time')) {
                    snapshots.beginSnapTime = value;
                    snapshots.endSnapTime = cells[2].text().trim();
                }
            }
        }
    }
    
    return snapshots;
}

function extractLoadProfile($) {
    const loadProfile = {};
    
    const loadTable = $('table:contains "Per Second"');
    if (loadTable.length > 0) {
        const rows = loadTable.find('tr');
        for (const row of rows) {
            const cells = row.find('td');
            if (cells.length >= 2) {
                const label = cells[0].text().trim();
                const value = cells[1].text().trim();
                if (label.includes('DB Time')) loadProfile.dbTimePerSec = parseNumber(value);
                if (label.includes('DB CPU')) loadProfile.dbCpuPerSec = parseNumber(value);
                if (label.includes('Redo size')) loadProfile.redoSizePerSec = parseNumber(value);
                if (label.includes('Logons')) loadProfile.logonsPerSec = parseNumber(value);
            }
        }
    }
    
    return loadProfile;
}

function extractTopEvents($) {
    const topEvents = [];
    
    const eventsTable = $('table:contains "Event"');
    if (eventsTable.length > 0) {
        const rows = eventsTable.find('tr');
        for (const row of rows) {
                const cells = row.find('td');
                if (cells.length >= 6) {
                    topEvents.push({
                    event: cells[0].text().trim(),
                    waits: parseNumber(cells[1].text()),
                    time: parseNumber(cells[2].text()),
                    avgWait: parseNumber(cells[3].text()),
                    percentDbTime: parsePercentage(cells[4].text()),
                    waitClass: cells[5].text().trim()
                });
            }
        }
    }
    
    return topEvents;
}

function extractHostCPU($) {
    const hostCPU = {};
    
    const cpuTable = $('table:contains "%User"');
    if (cpuTable.length > 0) {
        const rows = cpuTable.find('tr');
        for (const row of rows) {
                const cells = row.find('td');
                if (cells.length >= 4) {
                    hostCPU.userPercent = parsePercentage(cells[0].text());
                    hostCPU.sysPercent = parsePercentage(cells[1].text());
                    hostCPU.idlePercent = parsePercentage(cells[2].text());
                    hostCPU.wioPercent = parsePercentage(cells[3].text());
                }
            }
        }
    }
    
    return hostCPU;
}

function extractInstanceEfficiency($) {
    const efficiency = {};
    
    const effTable = $('table:contains "Buffer Hit"');
    if (effTable.length > 0) {
        const rows = effTable.find('tr');
        for (const row of rows) {
                const cells = row.find('td');
                if (cells.length >= 2) {
                    const label = cells[0].text().trim();
                    const value = cells[1].text().trim();
                    if (label.includes('Buffer Hit')) efficiency.bufferHitPercent = parsePercentage(value);
                    if (label.includes('Library Hit')) efficiency.libraryHitPercent = parsePercentage(value);
                    if (label.includes('Soft Parse')) efficiency.softParsePercent = parsePercentage(value);
                }
            }
        }
    }
    
    return efficiency;
}

module.exports = {
    loadAWRReport,
    extractHeader,
    extractSnapshots,
    extractLoadProfile,
    extractTopEvents,
    extractHostCPU,
    extractInstanceEfficiency
};
