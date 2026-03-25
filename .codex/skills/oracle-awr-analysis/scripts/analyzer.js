const { detectReportLanguage, getReportTexts } = require('./localization');

const STRICT_CHANGE_THRESHOLD = 15;
const LOAD_CHANGE_THRESHOLD = 20;
const WAIT_CHANGE_THRESHOLD = 20;
const HIGH_CHANGE_THRESHOLD = 50;

function calculateBaselineAverage(baselineReports, getValueFunc) {
    const values = baselineReports
        .map(report => getValueFunc(report))
        .filter(value => value !== null && value !== undefined);

    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateChangeRate(currentValue, baselineValue) {
    if (baselineValue === null || baselineValue === 0 || currentValue === null || currentValue === undefined) {
        return null;
    }
    return ((currentValue - baselineValue) / baselineValue) * 100;
}

function normalizeRatio(value) {
    if (value === null || value === undefined) return null;
    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) return null;
    return numericValue > 1 ? numericValue / 100 : numericValue;
}

function getSessionCurrent(report) {
    return report.sessions?.current
        ?? report.sessions?.sessionsEnd
        ?? report.sessions?.sessionsInfo?.sessionsEnd
        ?? report.instanceActivityStats?.sessionsEnd
        ?? null;
}

function getLoadMetricPerSecond(report, metricKey) {
    const loadProfile = report.loadProfile || {};
    if (loadProfile[metricKey]?.perSecond !== undefined) {
        return loadProfile[metricKey].perSecond;
    }

    const fallbackMap = {
        'DB Time(s)': 'dbTimePerSec',
        'DB CPU(s)': 'dbCpuPerSec',
        'Physical Reads': 'physicalReadsPerSec',
        'Redo size': 'redoSizePerSec',
        'Executes': 'executesPerSec',
        'Logons/s': 'logonsPerSec'
    };

    const fallbackKey = fallbackMap[metricKey];
    return fallbackKey ? (loadProfile[fallbackKey] ?? null) : null;
}

function getEfficiencyMetric(report, metricKey) {
    const efficiency = report.instanceEfficiency || {};
    if (efficiency[metricKey] !== undefined) {
        return efficiency[metricKey];
    }

    const fallbackMap = {
        'Buffer Hit %': 'bufferHitPercent',
        'Library Hit %': 'libraryHitPercent',
        'Soft Parse %': 'softParsePercent',
        'Execute to Parse %': 'executeToParsePercent',
        'Parse CPU to Parse Elapsd %': 'parseCpuToParseElapsdPercent'
    };

    const fallbackKey = fallbackMap[metricKey];
    return fallbackKey ? (efficiency[fallbackKey] ?? null) : null;
}

function getReportInstance(report) {
    return report?.instance || report?.header?.instance || 'unknown';
}

function getComparableBaselineReports(coreReport, baselineReports) {
    const coreInstance = getReportInstance(coreReport);
    return (baselineReports || []).filter(report => getReportInstance(report) === coreInstance);
}

function addUniqueValue(list, value) {
    if (!value) return;
    if (!list.includes(value)) {
        list.push(value);
    }
}

function addProblemSQL(problemSQLs, sqlId, { type, module, dimension }) {
    if (!sqlId) return;

    if (!problemSQLs.has(sqlId)) {
        problemSQLs.set(sqlId, {
            sqlId,
            types: [],
            modules: [],
            dimensions: []
        });
    }

    const entry = problemSQLs.get(sqlId);
    addUniqueValue(entry.types, type);
    addUniqueValue(entry.modules, module);
    addUniqueValue(entry.dimensions, dimension);
}

function mergeProblemSQLMaps(targetMap, sourceMap) {
    for (const [sqlId, sourceEntry] of sourceMap.entries()) {
        if (!targetMap.has(sqlId)) {
            targetMap.set(sqlId, {
                sqlId,
                types: [],
                modules: [],
                dimensions: []
            });
        }

        const targetEntry = targetMap.get(sqlId);
        for (const type of sourceEntry.types || []) addUniqueValue(targetEntry.types, type);
        for (const module of sourceEntry.modules || []) addUniqueValue(targetEntry.modules, module);
        for (const dimension of sourceEntry.dimensions || []) addUniqueValue(targetEntry.dimensions, dimension);
    }
}

function average(values) {
    if (!values || values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeSqlModule(sqlModule) {
    if (!sqlModule) return null;
    const trimmed = String(sqlModule).trim();
    if (!trimmed || trimmed.toUpperCase() === 'N/A') return null;
    return trimmed;
}

function addEntryInstanceValue(entry, instance, numericValue) {
    entry.instances.add(instance);
    if (!entry.instanceValues.has(instance)) {
        entry.instanceValues.set(instance, []);
    }
    entry.instanceValues.get(instance).push(numericValue);
}

function averageEntryValuesForInstances(entry, instances) {
    if (!entry) return null;

    const values = [];
    for (const instance of instances || []) {
        values.push(...(entry.instanceValues.get(instance) || []));
    }

    return average(values);
}

function collectSqlDimensionMap(reports, arrayKey, valueGetter) {
    const sqlMap = new Map();

    for (const report of reports) {
        const reportInstance = getReportInstance(report);
        for (const row of (report[arrayKey] || [])) {
            const sqlId = row.sqlId;
            const sqlModule = normalizeSqlModule(row.sql_module);
            const rawValue = valueGetter(row);
            const numericValue = rawValue === null || rawValue === undefined ? null : Number(rawValue);

            if (!sqlId || !sqlModule || numericValue === null || Number.isNaN(numericValue)) {
                continue;
            }

            if (!sqlMap.has(sqlId)) {
                sqlMap.set(sqlId, {
                    sqlId,
                    modules: new Set(),
                    values: [],
                    percentTotals: [],
                    instances: new Set(),
                    instanceValues: new Map()
                });
            }

            const entry = sqlMap.get(sqlId);
            entry.modules.add(sqlModule);
            entry.values.push(numericValue);
            addEntryInstanceValue(entry, reportInstance, numericValue);

            if (row.percent_total !== null && row.percent_total !== undefined && !Number.isNaN(Number(row.percent_total))) {
                entry.percentTotals.push(Number(row.percent_total));
            }
        }
    }

    return sqlMap;
}

function buildSqlDimensionAnalysis({
    coreReports,
    baselineReports,
    arrayKey,
    dimension,
    category,
    valueGetter,
    valueFormat = 'number',
    includeRow,
    severityRule
}) {
    const anomalies = [];
    const problemSQLs = new Map();
    const rows = [];

    const coreMap = collectSqlDimensionMap(coreReports, arrayKey, valueGetter);
    const baselineMap = collectSqlDimensionMap(baselineReports, arrayKey, valueGetter);

    for (const [sqlId, coreEntry] of coreMap.entries()) {
        const baselineEntry = baselineMap.get(sqlId) || null;
        const comparableInstances = Array.from(coreEntry.instances);
        const sqlModule = Array.from(coreEntry.modules).join(', ');
        const coreValue = average(coreEntry.values);
        const baselineValue = averageEntryValuesForInstances(baselineEntry, comparableInstances);
        const changeRate = calculateChangeRate(coreValue, baselineValue);
        const status = baselineValue !== null ? 'Existing' : 'New';

        if (!includeRow({ coreValue, baselineValue, changeRate, status, coreEntry, baselineEntry })) {
            continue;
        }

        const severity = severityRule({ coreValue, baselineValue, changeRate, status, coreEntry, baselineEntry });
        const row = {
            category,
            sqlId,
            sqlModule,
            dimension,
            status,
            coreValue,
            baselineValue,
            changeRate,
            severity,
            valueFormat,
            metric: `${dimension}: ${sqlId}`,
            type: status === 'New' ? 'new_sql_dimension' : 'existing_sql_dimension',
            description: `${dimension} comparison for SQL ${sqlId}`
        };

        rows.push(row);
        anomalies.push(row);
        addProblemSQL(problemSQLs, sqlId, {
            type: `${status} ${dimension}`,
            module: sqlModule,
            dimension
        });
    }

    return {
        dimension,
        valueFormat,
        rows,
        anomalies,
        problemSQLs
    };
}

function defaultSqlIncludeRule({ status, changeRate }) {
    return status === 'New' || (changeRate !== null && changeRate > STRICT_CHANGE_THRESHOLD);
}

function defaultSqlSeverityRule({ status, changeRate, coreEntry }) {
    if (status === 'New') {
        const avgPercentTotal = average(coreEntry.percentTotals);
        return avgPercentTotal !== null && avgPercentTotal >= 10 ? 'high' : 'medium';
    }

    return changeRate !== null && changeRate > HIGH_CHANGE_THRESHOLD ? 'high' : 'medium';
}

function analyzeADDMFindings(coreReports, baselineReports, texts) {
    const anomalies = [];
    const coreMap = new Map();
    const baselineMap = new Map();

    function collect(reports, targetMap) {
        for (const report of reports) {
            const instance = getReportInstance(report);
            for (const finding of (report.addmFindings || [])) {
                if (!finding.findingName) continue;
                if (!targetMap.has(finding.findingName)) {
                    targetMap.set(finding.findingName, {
                        values: [],
                        instances: new Set(),
                        instanceValues: new Map()
                    });
                }
                const numericValue = Number(finding.avgActiveSessions) || 0;
                const entry = targetMap.get(finding.findingName);
                entry.values.push(numericValue);
                addEntryInstanceValue(entry, instance, numericValue);
            }
        }
    }

    collect(coreReports, coreMap);
    collect(baselineReports, baselineMap);

    const allFindingNames = new Set([...coreMap.keys(), ...baselineMap.keys()]);

    for (const findingName of allFindingNames) {
        const coreEntry = coreMap.get(findingName) || null;
        const baselineEntry = baselineMap.get(findingName) || null;
        const comparableInstances = Array.from(coreEntry?.instances || []);
        const coreAvg = coreEntry ? average(coreEntry.values) : null;
        const baselineAvg = averageEntryValuesForInstances(baselineEntry, comparableInstances);
        const changeRate = calculateChangeRate(coreAvg, baselineAvg);

        if (baselineAvg === null && coreAvg !== null) {
            anomalies.push({
                category: 'ADDM',
                metric: findingName,
                coreValue: coreAvg,
                baselineValue: null,
                changeRate: null,
                severity: coreAvg >= 20 ? 'high' : 'medium',
                type: 'new_finding',
                description: texts.describe.addmNew(findingName)
            });
            continue;
        }

        if (coreAvg === null && baselineAvg !== null) {
            anomalies.push({
                category: 'ADDM',
                metric: findingName,
                coreValue: null,
                baselineValue: baselineAvg,
                changeRate: null,
                severity: 'medium',
                type: 'disappeared',
                description: texts.describe.addmDisappeared(findingName)
            });
            continue;
        }

        if (changeRate !== null && Math.abs(changeRate) > STRICT_CHANGE_THRESHOLD) {
            anomalies.push({
                category: 'ADDM',
                metric: findingName,
                coreValue: coreAvg,
                baselineValue: baselineAvg,
                changeRate,
                severity: Math.abs(changeRate) > HIGH_CHANGE_THRESHOLD ? 'high' : 'medium',
                type: changeRate > 0 ? 'worsened' : 'improved',
                description: texts.describe.addmChanged(findingName, changeRate)
            });
        }
    }

    return anomalies;
}

function analyzeConnectionSession(coreReports, baselineReports, texts) {
    const anomalies = [];

    const coreSessions = coreReports.map(report => getSessionCurrent(report)).filter(value => value !== null && value !== undefined);
    const baselineSessions = baselineReports.map(report => getSessionCurrent(report)).filter(value => value !== null && value !== undefined);

    if (coreSessions.length > 0 && baselineSessions.length > 0) {
        const avgCoreSessions = coreSessions.reduce((sum, value) => sum + value, 0) / coreSessions.length;
        const avgBaselineSessions = baselineSessions.reduce((sum, value) => sum + value, 0) / baselineSessions.length;
        const changeRate = calculateChangeRate(avgCoreSessions, avgBaselineSessions);

        if (changeRate !== null && Math.abs(changeRate) > LOAD_CHANGE_THRESHOLD) {
            anomalies.push({
                category: 'Connection/Session',
                metric: 'Sessions',
                coreValue: avgCoreSessions,
                baselineValue: avgBaselineSessions,
                changeRate,
                severity: Math.abs(changeRate) > 50 ? 'high' : 'medium',
                description: texts.describe.sessionsChanged(changeRate)
            });
        }
    }

    for (const core of coreReports) {
        const logonsPerSec = getLoadMetricPerSecond(core, 'Logons/s');
        const baselineLogons = calculateBaselineAverage(
            baselineReports,
            report => getLoadMetricPerSecond(report, 'Logons/s')
        );

        if (logonsPerSec && baselineLogons) {
            const changeRate = calculateChangeRate(logonsPerSec, baselineLogons);

            if (changeRate !== null && changeRate > LOAD_CHANGE_THRESHOLD) {
                anomalies.push({
                    category: 'Connection/Session',
                    metric: 'Logons/s',
                    coreValue: logonsPerSec,
                    baselineValue: baselineLogons,
                    changeRate,
                    severity: 'high',
                    description: texts.describe.logonsIncreased(changeRate)
                });
            }
        }
    }

    return anomalies;
}

function analyzeLoadProfile(coreReports, baselineReports, texts) {
    const anomalies = [];

    const metrics = [
        { name: 'DB Time(s)', key: 'DB Time(s)', threshold: LOAD_CHANGE_THRESHOLD },
        { name: 'DB CPU(s)', key: 'DB CPU(s)', threshold: LOAD_CHANGE_THRESHOLD },
        { name: 'Physical Reads', key: 'Physical Reads', threshold: LOAD_CHANGE_THRESHOLD },
        { name: 'Redo size', key: 'Redo size', threshold: LOAD_CHANGE_THRESHOLD },
        { name: 'Executes', key: 'Executes', threshold: LOAD_CHANGE_THRESHOLD }
    ];

    for (const metric of metrics) {
        for (const core of coreReports) {
            const coreValue = getLoadMetricPerSecond(core, metric.key);
            const comparableBaselines = getComparableBaselineReports(core, baselineReports);
            const baselineValue = calculateBaselineAverage(
                comparableBaselines,
                report => getLoadMetricPerSecond(report, metric.key)
            );

            if (coreValue !== null && coreValue !== undefined && baselineValue !== null) {
                const changeRate = calculateChangeRate(coreValue, baselineValue);

                if (changeRate !== null && changeRate > metric.threshold) {
                    anomalies.push({
                        category: 'Load Change',
                        metric: metric.name,
                        coreValue,
                        baselineValue,
                        changeRate,
                        severity: changeRate > metric.threshold * 2 ? 'high' : 'medium',
                        description: texts.describe.loadIncreased(metric.name, changeRate, metric.threshold)
                    });
                }
            }
        }
    }

    return anomalies;
}

function analyzeWaitEvents(coreReports, baselineReports, texts) {
    const anomalies = [];
    const lockEventPattern = /\block\b/;

    for (const core of coreReports) {
        const coreEvents = core.topEvents || [];
        const baselineEvents = new Map();
        const comparableBaselines = getComparableBaselineReports(core, baselineReports);

        for (const baseline of comparableBaselines) {
            for (const event of (baseline.topEvents || [])) {
                if (!baselineEvents.has(event.name)) {
                    baselineEvents.set(event.name, []);
                }
                baselineEvents.get(event.name).push(event);
            }
        }

        for (const coreEvent of coreEvents) {
            const baselineEventList = baselineEvents.get(coreEvent.name);

            if (!baselineEventList || baselineEventList.length === 0) {
                anomalies.push({
                    category: 'Wait Events',
                    metric: coreEvent.name,
                    coreValue: coreEvent.percentDbTime,
                    baselineValue: 0,
                    changeRate: null,
                    severity: 'high',
                    type: 'new_event',
                    description: texts.describe.waitNew(coreEvent.name, coreEvent.percentDbTime)
                });
                continue;
            }

            const avgBaselinePercent = baselineEventList.reduce((sum, event) => sum + (event.percentDbTime || 0), 0) / baselineEventList.length;
            const avgBaselineAvgWait = baselineEventList.reduce((sum, event) => sum + (event.avgWait || 0), 0) / baselineEventList.length;
            let percentChange = null;

            if (coreEvent.percentDbTime && avgBaselinePercent > 0) {
                percentChange = calculateChangeRate(coreEvent.percentDbTime, avgBaselinePercent);

                if (percentChange !== null && percentChange > WAIT_CHANGE_THRESHOLD) {
                    anomalies.push({
                        category: 'Wait Events',
                        metric: coreEvent.name,
                        coreValue: coreEvent.percentDbTime,
                        baselineValue: avgBaselinePercent,
                        changeRate: percentChange,
                        severity: 'high',
                        type: 'worsened',
                        description: texts.describe.waitDbTimeIncreased(coreEvent.name, percentChange)
                    });
                }
            }

            if (coreEvent.avgWait && avgBaselineAvgWait > 0) {
                const avgWaitChange = calculateChangeRate(coreEvent.avgWait, avgBaselineAvgWait);

                if (avgWaitChange !== null && avgWaitChange > WAIT_CHANGE_THRESHOLD) {
                    anomalies.push({
                        category: 'Wait Events',
                        metric: `${coreEvent.name} Avg Wait`,
                        coreValue: coreEvent.avgWait,
                        baselineValue: avgBaselineAvgWait,
                        changeRate: avgWaitChange,
                        severity: 'medium',
                        type: 'avg_wait_increase',
                        description: texts.describe.waitAvgIncreased(coreEvent.name, avgWaitChange)
                    });
                }
            }

            const normalizedName = coreEvent.name.toLowerCase();

            if (normalizedName.includes('enq:') || lockEventPattern.test(normalizedName)) {
                anomalies.push({
                    category: 'Wait Events',
                    metric: coreEvent.name,
                    coreValue: coreEvent.percentDbTime,
                    baselineValue: avgBaselinePercent,
                    changeRate: null,
                    severity: 'high',
                    type: 'lock_event',
                    description: texts.describe.waitLock(coreEvent.name)
                });
            }

            if (normalizedName.includes('latch')) {
                anomalies.push({
                    category: 'Wait Events',
                    metric: coreEvent.name,
                    coreValue: coreEvent.percentDbTime,
                    baselineValue: avgBaselinePercent,
                    changeRate: null,
                    severity: 'high',
                    type: 'latch_event',
                    description: texts.describe.waitLatch(coreEvent.name)
                });
            }

            if (normalizedName.includes('gc ') && (coreEvent.percentDbTime > 1 || (percentChange !== null && percentChange > WAIT_CHANGE_THRESHOLD))) {
                anomalies.push({
                    category: 'Wait Events',
                    metric: coreEvent.name,
                    coreValue: coreEvent.percentDbTime,
                    baselineValue: avgBaselinePercent,
                    changeRate: null,
                    severity: 'medium',
                    type: 'gc_event',
                    description: texts.describe.waitGc(coreEvent.name, coreEvent.percentDbTime)
                });
            }

            if (normalizedName.includes('log file sync') && coreEvent.avgWait > 5) {
                anomalies.push({
                    category: 'Wait Events',
                    metric: coreEvent.name,
                    coreValue: coreEvent.avgWait,
                    baselineValue: avgBaselineAvgWait,
                    changeRate: null,
                    severity: 'medium',
                    type: 'log_sync_slow',
                    description: texts.describe.waitLogSync(coreEvent.avgWait)
                });
            }

            if (normalizedName.includes('db file sequential read') && coreEvent.avgWait > 10) {
                anomalies.push({
                    category: 'Wait Events',
                    metric: coreEvent.name,
                    coreValue: coreEvent.avgWait,
                    baselineValue: avgBaselineAvgWait,
                    changeRate: null,
                    severity: 'medium',
                    type: 'seq_read_slow',
                    description: texts.describe.waitSeqRead(coreEvent.avgWait)
                });
            }
        }
    }

    return anomalies;
}

function analyzeSlowSQL(coreReports, baselineReports) {
    const analyses = [
        buildSqlDimensionAnalysis({
            coreReports,
            baselineReports,
            arrayKey: 'sqlByElapsed',
            dimension: 'Elapsed Time',
            category: 'Slow SQL',
            valueGetter: row => row.elapsed_time,
            valueFormat: 'number',
            includeRow: defaultSqlIncludeRule,
            severityRule: defaultSqlSeverityRule
        }),
        buildSqlDimensionAnalysis({
            coreReports,
            baselineReports,
            arrayKey: 'sqlByElapsed',
            dimension: 'Elapsed per Exec',
            category: 'Slow SQL',
            valueGetter: row => row.elapsed_per_exec,
            valueFormat: 'number',
            includeRow: defaultSqlIncludeRule,
            severityRule: defaultSqlSeverityRule
        }),
        buildSqlDimensionAnalysis({
            coreReports,
            baselineReports,
            arrayKey: 'sqlByCPU',
            dimension: 'CPU Time',
            category: 'Slow SQL',
            valueGetter: row => row.cpu_time,
            valueFormat: 'number',
            includeRow: defaultSqlIncludeRule,
            severityRule: defaultSqlSeverityRule
        }),
        buildSqlDimensionAnalysis({
            coreReports,
            baselineReports,
            arrayKey: 'sqlByIOWait',
            dimension: 'I/O Wait Time',
            category: 'Slow SQL',
            valueGetter: row => row.io_wait_time ?? row.wait_time ?? row.user_io_wait_time ?? row.iowait_time ?? null,
            valueFormat: 'number',
            includeRow: defaultSqlIncludeRule,
            severityRule: defaultSqlSeverityRule
        }),
        buildSqlDimensionAnalysis({
            coreReports,
            baselineReports,
            arrayKey: 'sqlByGets',
            dimension: 'Buffer Gets',
            category: 'Slow SQL',
            valueGetter: row => row.buffer_gets,
            valueFormat: 'number',
            includeRow: defaultSqlIncludeRule,
            severityRule: defaultSqlSeverityRule
        }),
        buildSqlDimensionAnalysis({
            coreReports,
            baselineReports,
            arrayKey: 'sqlByReads',
            dimension: 'Physical Reads',
            category: 'Slow SQL',
            valueGetter: row => row.physical_reads,
            valueFormat: 'number',
            includeRow: defaultSqlIncludeRule,
            severityRule: defaultSqlSeverityRule
        }),
        buildSqlDimensionAnalysis({
            coreReports,
            baselineReports,
            arrayKey: 'sqlByCluster',
            dimension: 'Cluster Wait Time',
            category: 'Slow SQL',
            valueGetter: row => row.cluster_wait_time,
            valueFormat: 'number',
            includeRow: defaultSqlIncludeRule,
            severityRule: defaultSqlSeverityRule
        })
    ];

    const anomalies = analyses.flatMap(analysis => analysis.rows);
    const problemSQLs = new Map();
    for (const analysis of analyses) {
        mergeProblemSQLMaps(problemSQLs, analysis.problemSQLs);
    }

    return {
        anomalies,
        problemSQLs,
        dimensionTables: analyses.filter(analysis => analysis.rows.length > 0)
    };
}

function analyzeHighFrequencySQL(coreReports, baselineReports) {
    const analyses = [
        buildSqlDimensionAnalysis({
            coreReports,
            baselineReports,
            arrayKey: 'sqlByExecutions',
            dimension: 'Executions',
            category: 'High-Frequency SQL',
            valueGetter: row => row.executions,
            valueFormat: 'number',
            includeRow: defaultSqlIncludeRule,
            severityRule: defaultSqlSeverityRule
        }),
        buildSqlDimensionAnalysis({
            coreReports,
            baselineReports,
            arrayKey: 'sqlByParseCalls',
            dimension: 'Parse Ratio',
            category: 'High-Frequency SQL',
            valueGetter: row => normalizeRatio(row.parses_per_exec)
                ?? ((row.parse_calls && row.executions) ? (row.parse_calls / row.executions) : null),
            valueFormat: 'percent_ratio',
            includeRow: ({ status, coreValue, changeRate }) => status === 'New'
                || (coreValue !== null && coreValue >= 0.9)
                || (changeRate !== null && changeRate > STRICT_CHANGE_THRESHOLD),
            severityRule: ({ status, coreValue, changeRate, coreEntry }) => {
                if (status === 'New') {
                    const avgPercentTotal = average(coreEntry.percentTotals);
                    return avgPercentTotal !== null && avgPercentTotal >= 10 ? 'high' : 'medium';
                }

                if (coreValue !== null && coreValue >= 0.99) {
                    return 'high';
                }

                return changeRate !== null && changeRate > HIGH_CHANGE_THRESHOLD ? 'high' : 'medium';
            }
        })
    ];

    const executionRowsBySqlId = new Map(analyses[0].rows.map(row => [row.sqlId, row]));
    for (const row of analyses[1].rows) {
        const executionRow = executionRowsBySqlId.get(row.sqlId);
        const materialExecutionGrowth = executionRow
            && (executionRow.status === 'New' || (executionRow.changeRate !== null && executionRow.changeRate > STRICT_CHANGE_THRESHOLD));
        const materialParseRegression = row.status === 'New'
            || (row.changeRate !== null && row.changeRate > STRICT_CHANGE_THRESHOLD)
            || (row.baselineValue !== null && row.baselineValue < 0.9 && row.coreValue !== null && row.coreValue >= 0.9);

        if (row.status !== 'New' && row.coreValue !== null && row.coreValue >= 0.9 && !materialParseRegression && !materialExecutionGrowth) {
            row.severity = 'medium';
        }
    }

    const anomalies = analyses.flatMap(analysis => analysis.rows);
    const problemSQLs = new Map();
    for (const analysis of analyses) {
        mergeProblemSQLMaps(problemSQLs, analysis.problemSQLs);
    }

    return {
        anomalies,
        problemSQLs,
        dimensionTables: analyses.filter(analysis => analysis.rows.length > 0)
    };
}

function analyzeInstanceEfficiency(coreReports, baselineReports, texts) {
    const anomalies = [];

    const efficiencyMetrics = [
        { name: 'Buffer Hit %', key: 'Buffer Hit %', threshold: 95, dropThreshold: 5 },
        { name: 'Library Hit %', key: 'Library Hit %', threshold: 95, dropThreshold: 5 },
        { name: 'Soft Parse %', key: 'Soft Parse %', threshold: 90, dropThreshold: 5 },
        { name: 'Execute to Parse %', key: 'Execute to Parse %', threshold: 30, dropThreshold: 5 },
        { name: 'Parse CPU to Parse Elapsd %', key: 'Parse CPU to Parse Elapsd %', threshold: 30, dropThreshold: 5 }
    ];

    for (const core of coreReports) {
        const comparableBaselines = getComparableBaselineReports(core, baselineReports);
        for (const metric of efficiencyMetrics) {
            const coreValue = getEfficiencyMetric(core, metric.key);
            const baselineValue = calculateBaselineAverage(
                comparableBaselines,
                report => getEfficiencyMetric(report, metric.key)
            );

            if (coreValue !== null && coreValue !== undefined) {
                if (coreValue < metric.threshold) {
                    anomalies.push({
                        category: 'Instance Efficiency',
                        metric: metric.name,
                        coreValue,
                        baselineValue,
                        changeRate: null,
                        severity: 'medium',
                        type: 'below_threshold',
                        description: texts.describe.efficiencyBelow(metric.name, metric.threshold, coreValue)
                    });
                }

                if (baselineValue !== null && baselineValue !== undefined) {
                    const drop = baselineValue - coreValue;

                    if (drop > metric.dropThreshold) {
                        anomalies.push({
                            category: 'Instance Efficiency',
                            metric: metric.name,
                            coreValue,
                            baselineValue,
                            changeRate: -drop,
                            severity: 'medium',
                            type: 'efficiency_drop',
                            description: texts.describe.efficiencyDrop(metric.name, drop)
                        });
                    }
                }
            }
        }
    }

    return anomalies;
}

function analyzeSystemResources(coreReports, baselineReports, texts) {
    const anomalies = [];

    for (const core of coreReports) {
        const coreCpu = core.hostCpu || {};
        const comparableBaselines = getComparableBaselineReports(core, baselineReports);
        const baselineIdle = average(comparableBaselines.map(report => report.hostCpu?.idlePercent).filter(value => value !== null && value !== undefined));
        const baselineWio = average(comparableBaselines.map(report => report.hostCpu?.wioPercent).filter(value => value !== null && value !== undefined));

        if (coreCpu.idlePercent !== null && baselineIdle !== null) {
            const idleDrop = baselineIdle - coreCpu.idlePercent;

            if (idleDrop > 10) {
                anomalies.push({
                    category: 'System Resources',
                    metric: '%Idle',
                    coreValue: coreCpu.idlePercent,
                    baselineValue: baselineIdle,
                    changeRate: -idleDrop,
                    severity: 'high',
                    description: texts.describe.idleDrop(idleDrop)
                });
            }
        }

        if (coreCpu.wioPercent !== null && baselineWio !== null) {
            const wioIncrease = calculateChangeRate(coreCpu.wioPercent, baselineWio);

            if (wioIncrease !== null && wioIncrease > 10) {
                anomalies.push({
                    category: 'System Resources',
                    metric: '%WIO',
                    coreValue: coreCpu.wioPercent,
                    baselineValue: baselineWio,
                    changeRate: wioIncrease,
                    severity: 'medium',
                    description: texts.describe.wioIncrease(wioIncrease)
                });
            }
        }
    }

    return anomalies;
}

function performFullAnalysis(coreReports, baselineReports, options = {}) {
    const language = detectReportLanguage(options.language);
    const texts = getReportTexts(language);
    const allAnomalies = [];
    const problemSQLs = new Map();

    allAnomalies.push(...analyzeADDMFindings(coreReports, baselineReports, texts));
    allAnomalies.push(...analyzeConnectionSession(coreReports, baselineReports, texts));
    allAnomalies.push(...analyzeLoadProfile(coreReports, baselineReports, texts));
    allAnomalies.push(...analyzeWaitEvents(coreReports, baselineReports, texts));

    const slowSQLResult = analyzeSlowSQL(coreReports, baselineReports);
    allAnomalies.push(...slowSQLResult.anomalies);
    mergeProblemSQLMaps(problemSQLs, slowSQLResult.problemSQLs);

    const highFreqResult = analyzeHighFrequencySQL(coreReports, baselineReports);
    allAnomalies.push(...highFreqResult.anomalies);
    mergeProblemSQLMaps(problemSQLs, highFreqResult.problemSQLs);

    allAnomalies.push(...analyzeInstanceEfficiency(coreReports, baselineReports, texts));
    allAnomalies.push(...analyzeSystemResources(coreReports, baselineReports, texts));

    const categorizedAnomalies = {
        addm: allAnomalies.filter(anomaly => anomaly.category === 'ADDM'),
        connection: allAnomalies.filter(anomaly => anomaly.category === 'Connection/Session'),
        load: allAnomalies.filter(anomaly => anomaly.category === 'Load Change'),
        waitEvents: allAnomalies.filter(anomaly => anomaly.category === 'Wait Events'),
        slowSQL: allAnomalies.filter(anomaly => anomaly.category === 'Slow SQL'),
        highFreqSQL: allAnomalies.filter(anomaly => anomaly.category === 'High-Frequency SQL'),
        efficiency: allAnomalies.filter(anomaly => anomaly.category === 'Instance Efficiency'),
        resources: allAnomalies.filter(anomaly => anomaly.category === 'System Resources')
    };

    return {
        anomalies: allAnomalies,
        categorizedAnomalies,
        sqlDimensionTables: {
            slowSQL: slowSQLResult.dimensionTables,
            highFreqSQL: highFreqResult.dimensionTables
        },
        problemSQLs: Array.from(problemSQLs.values()),
        summary: {
            totalAnomalies: allAnomalies.length,
            highSeverity: allAnomalies.filter(anomaly => anomaly.severity === 'high').length,
            mediumSeverity: allAnomalies.filter(anomaly => anomaly.severity === 'medium').length,
            categories: Object.keys(categorizedAnomalies).filter(key => categorizedAnomalies[key].length > 0)
        }
    };
}

module.exports = {
    calculateBaselineAverage,
    calculateChangeRate,
    analyzeADDMFindings,
    analyzeConnectionSession,
    analyzeLoadProfile,
    analyzeWaitEvents,
    analyzeSlowSQL,
    analyzeHighFrequencySQL,
    analyzeInstanceEfficiency,
    analyzeSystemResources,
    performFullAnalysis
};
