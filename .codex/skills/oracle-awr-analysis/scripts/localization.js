const TEXTS = {
    'en-US': {
        reportTitle: 'Oracle AWR Comparative Analysis Report',
        generatedAt: 'Generated at',
        environmentOverview: '## 1. Environment Overview',
        databaseInformation: '### Database Information',
        clusterOverview: '#### Cluster Overview',
        instanceDetails: '#### Instance Details',
        item: 'Item',
        value: 'Value',
        deployment: 'Deployment',
        instanceCount: 'Instance Count',
        hostCount: 'Host Count',
        instancesLabel: 'Instances',
        hostsLabel: 'Hosts',
        hostNameLabel: 'Host Name',
        memoryGbLabel: 'Memory (GB)',
        deploymentModeSingle: 'Single Instance',
        deploymentModeRac: count => `RAC (${count} instances)`,
        analysisWindow: '### Analysis Window',
        problemTime: 'Problem time',
        coreWindow: 'Core window',
        coreDetermination: '## 2. Core AWR Determination',
        comparativeAnalysis: '## 3. Comparative Analysis',
        addmSection: '### 3.1 Top ADDM Findings',
        connectionSection: '### 3.2 Session / Connection Anomalies',
        loadSection: '### 3.3 Load Changes',
        waitSection: '### 3.4 Wait Event Anomalies',
        slowSqlSection: '### 3.5 Slow SQL',
        highFreqSqlSection: '### 3.6 High-Frequency / Reparse SQL',
        multiDimSqlSection: '### 3.7 Multi-Dimensional Problem SQL',
        efficiencySection: '### 3.8 Instance Efficiency',
        resourcesSection: '### 3.9 System Resources',
        anomalySummary: '## 4. Anomaly Summary',
        sqlAppendix: '## Appendix: Full SQL Text',
        noAddmData: 'ADDM extraction returned no data. Verify the Report Summary / ADDM section in raw HTML before concluding that no ADDM anomalies exist.',
        noAddmDifferences: 'No material ADDM differences detected.',
        noConnectionAnomalies: 'No session or connection anomalies detected.',
        noLoadAnomalies: 'No significant load anomalies detected.',
        noWaitData: 'Wait-event extraction returned no data. Verify the Top 10 Foreground Events section in raw HTML before concluding that no wait anomalies exist.',
        noWaitAnomalies: 'No wait-event anomalies detected.',
        noSlowSqlTables: 'No slow-SQL dimension tables generated.',
        noHighFreqSqlTables: 'No high-frequency SQL dimension tables generated.',
        noMultiDimSqlTables: 'No SQL met the multi-dimensional problem criterion.',
        noEfficiencyAnomalies: 'No instance-efficiency anomalies detected.',
        noResourceAnomalies: 'No system-resource anomalies detected.',
        noProblemSql: 'No problem SQL identified.',
        addmFinding: 'Finding',
        coreAas: 'Core AAS',
        baselineAas: 'Baseline AAS',
        change: 'Change',
        status: 'Status',
        description: 'Description',
        metric: 'Metric',
        coreValue: 'Core Value',
        baselineAverage: 'Baseline Average',
        baselineValue: 'Baseline Value',
        severity: 'Severity',
        category: 'Category',
        anomalies: 'Anomalies',
        highSeverity: 'High Severity',
        totalSummary: 'Total',
        newStatus: 'New',
        existingStatus: 'Existing',
        worsenedStatus: 'Worsened',
        improvedStatus: 'Improved',
        stableStatus: 'Stable',
        highLabel: 'High',
        mediumLabel: 'Medium',
        sqlId: 'SQL ID',
        module: 'Module',
        sqlPreview50: 'SQL First 50',
        newOrExisting: 'New or Existing',
        changePercent: 'Change Percent',
        occurrenceDimensions: 'Occurrence Dimensions',
        sourceModules: 'Source Modules',
        issueTypes: 'Issue Types',
        relatedDimensions: 'Related Dimensions',
        sqlTextNotFound: 'SQL text not found in parsed reports.',
        waitNewTop10: 'New Top 10 Wait Events',
        waitWorsened: 'Worsened Wait Events',
        waitSpecial: 'Special Wait Events to Watch',
        waitEvent: 'Wait Event',
        dimensionLabels: {
            'Elapsed Time': 'Elapsed Time',
            'Elapsed per Exec': 'Elapsed per Exec',
            'CPU Time': 'CPU Time',
            'I/O Wait Time': 'I/O Wait Time',
            'Buffer Gets': 'Buffer Gets',
            'Physical Reads': 'Physical Reads',
            'Cluster Wait Time': 'Cluster Wait Time',
            'Executions': 'Executions',
            'Parse Ratio': 'Parse Ratio'
        },
        waitTypeLabels: {
            lock_event: 'Lock Wait',
            latch_event: 'Latch Wait',
            gc_event: 'GC Cluster Wait',
            log_sync_slow: 'Slow Log File Sync',
            seq_read_slow: 'Slow Sequential Read'
        },
        summarySentence: (total, high, medium) =>
            `**Total**: ${total} anomalies, including ${high} high-severity and ${medium} medium-severity findings.`,
        describe: {
            addmNew: findingName => `New ADDM finding in the core window: ${findingName}`,
            addmDisappeared: findingName => `ADDM finding disappeared in the core window: ${findingName}`,
            addmChanged: (findingName, changeRate) => `ADDM finding ${findingName} changed by ${changeRate.toFixed(1)}% AAS`,
            sessionsChanged: changeRate => `Sessions changed by ${changeRate.toFixed(1)}%`,
            logonsIncreased: changeRate => `Logons/s increased by ${changeRate.toFixed(1)}% versus baseline`,
            loadIncreased: (metricName, changeRate, threshold) => `${metricName} increased by ${changeRate.toFixed(1)}%, above the ${threshold}% threshold`,
            waitNew: (eventName, percentDbTime) => `New Top 10 wait event: ${eventName} (%DB time: ${percentDbTime?.toFixed(2) || 'N/A'}%)`,
            waitDbTimeIncreased: (eventName, changeRate) => `${eventName} %DB time increased by ${changeRate.toFixed(1)}%`,
            waitAvgIncreased: (eventName, changeRate) => `${eventName} average wait increased by ${changeRate.toFixed(1)}%`,
            waitLock: eventName => `Lock-related wait entered Top 10: ${eventName}`,
            waitLatch: eventName => `Latch wait entered Top 10: ${eventName}`,
            waitGc: (eventName, percentDbTime) => `GC cluster wait exceeds 3% DB time: ${eventName} (${percentDbTime.toFixed(2)}%)`,
            waitLogSync: avgWait => `log file sync average wait exceeds 5ms: ${avgWait.toFixed(2)}ms`,
            waitSeqRead: avgWait => `db file sequential read average wait exceeds 10ms: ${avgWait.toFixed(2)}ms`,
            efficiencyBelow: (metricName, threshold, value) => `${metricName} is below the ${threshold}% threshold: ${value.toFixed(2)}%`,
            efficiencyDrop: (metricName, drop) => `${metricName} dropped by ${drop.toFixed(1)} percentage points versus baseline`,
            idleDrop: idleDrop => `%Idle dropped by ${idleDrop.toFixed(1)} percentage points versus baseline`,
            wioIncrease: changeRate => `%WIO increased by ${changeRate.toFixed(1)}% versus baseline`
        },
        categories: {
            addm: 'ADDM',
            connection: 'Session / Connection',
            load: 'Load Change',
            waitEvents: 'Wait Events',
            slowSQL: 'Slow SQL',
            highFreqSQL: 'High-Frequency SQL',
            multiDimensionalSQL: 'Multi-Dimensional Problem SQL',
            efficiency: 'Instance Efficiency',
            resources: 'System Resources'
        },
        core: {
            title: '## Core AWR Determination',
            userProblemTime: 'User-reported problem time',
            coreWindows: '### Core AWR Windows',
            baselineWindows: '### Baseline AWR Windows',
            crossDayBaselines: '### Cross-Day Same-Slot Baselines',
            file: 'File',
            instance: 'Instance',
            timeRange: 'Time Range',
            inclusionReason: 'Inclusion Reason',
            dbTimeMin: 'DB Time(min)',
            keySignals: 'Key Signals',
            note: 'Note',
            nextStep: 'The next step is a detailed comparison between the core and baseline AWR windows.',
            reasons: {
                primary: 'Primary core',
                pre: 'Pre-extension',
                post: 'Post-extension'
            },
            crossDayReason: coreFileName => `Cross-day same-slot comparison for core report ${coreFileName}`
        }
    },
    'zh-CN': {
        reportTitle: 'Oracle AWR 对比分析报告',
        generatedAt: '生成时间',
        environmentOverview: '## 1. 环境概要',
        databaseInformation: '### 数据库信息',
        clusterOverview: '#### 集群概览',
        instanceDetails: '#### 实例明细',
        item: '项目',
        value: '值',
        deployment: '部署模式',
        instanceCount: '实例数',
        hostCount: '主机数',
        instancesLabel: '实例列表',
        hostsLabel: '主机列表',
        hostNameLabel: '主机名',
        memoryGbLabel: '内存 (GB)',
        deploymentModeSingle: '单实例',
        deploymentModeRac: count => `RAC (${count} 实例)`,
        analysisWindow: '### 分析时间范围',
        problemTime: '故障时间',
        coreWindow: '核心时段',
        coreDetermination: '## 2. 核心 AWR 判定',
        comparativeAnalysis: '## 3. 对比分析',
        addmSection: '### 3.1 ADDM 重点发现',
        connectionSection: '### 3.2 会话 / 连接异常',
        loadSection: '### 3.3 负载变化',
        waitSection: '### 3.4 等待事件异常',
        slowSqlSection: '### 3.5 慢 SQL',
        highFreqSqlSection: '### 3.6 高频 / 重解析 SQL',
        multiDimSqlSection: '### 3.7 多维问题 SQL',
        efficiencySection: '### 3.8 实例效率',
        resourcesSection: '### 3.9 系统资源',
        anomalySummary: '## 4. 异常汇总',
        sqlAppendix: '## 附录：SQL 完整文本',
        noAddmData: 'ADDM 解析结果为空。下结论前请回查原始 HTML 中的 Report Summary / ADDM 段落。',
        noAddmDifferences: '未发现需要特别关注的 ADDM 差异。',
        noConnectionAnomalies: '未发现会话或连接异常。',
        noLoadAnomalies: '未发现显著负载异常。',
        noWaitData: '等待事件解析结果为空。下结论前请回查原始 HTML 中的 Top 10 Foreground Events 段落。',
        noWaitAnomalies: '未发现等待事件异常。',
        noSlowSqlTables: '未生成慢 SQL 维度表。',
        noHighFreqSqlTables: '未生成高频 SQL 维度表。',
        noMultiDimSqlTables: '没有 SQL 满足多维问题判定条件。',
        noEfficiencyAnomalies: '未发现实例效率异常。',
        noResourceAnomalies: '未发现系统资源异常。',
        noProblemSql: '未识别到问题 SQL。',
        addmFinding: 'Finding',
        coreAas: '核心 AAS',
        baselineAas: '基线 AAS',
        change: '变化率',
        status: '状态',
        description: '描述',
        metric: '指标',
        coreValue: '核心值',
        baselineAverage: '基线均值',
        baselineValue: '基线值',
        severity: '严重程度',
        category: '类别',
        anomalies: '异常数',
        highSeverity: '高严重度',
        totalSummary: '总计',
        newStatus: '新增',
        existingStatus: '存量',
        worsenedStatus: '恶化',
        improvedStatus: '改善',
        stableStatus: '平稳',
        highLabel: '高',
        mediumLabel: '中',
        sqlId: 'SQL ID',
        module: 'Module',
        sqlPreview50: 'SQL 前50',
        newOrExisting: '新增或存量',
        changePercent: '变化百分比',
        occurrenceDimensions: '出现维度',
        sourceModules: '来源模块',
        issueTypes: '问题类型',
        relatedDimensions: '相关维度',
        sqlTextNotFound: '未在已解析报告中找到 SQL 文本。',
        waitNewTop10: '新增 Top 10 等待事件',
        waitWorsened: '恶化的等待事件',
        waitSpecial: '需要关注的特殊等待事件',
        waitEvent: '等待事件',
        dimensionLabels: {
            'Elapsed Time': '总耗时',
            'Elapsed per Exec': '单次耗时',
            'CPU Time': 'CPU 时间',
            'I/O Wait Time': 'I/O 等待时间',
            'Buffer Gets': 'Buffer Gets',
            'Physical Reads': '物理读',
            'Cluster Wait Time': '集群等待时间',
            'Executions': '执行次数',
            'Parse Ratio': '解析比例'
        },
        waitTypeLabels: {
            lock_event: '锁等待',
            latch_event: 'Latch 等待',
            gc_event: 'GC 集群等待',
            log_sync_slow: 'Log File Sync 偏慢',
            seq_read_slow: 'Sequential Read 偏慢'
        },
        summarySentence: (total, high, medium) =>
            `**总计**: ${total} 个异常，其中 ${high} 个高严重度，${medium} 个中等严重度。`,
        describe: {
            addmNew: findingName => `核心时段新增 ADDM 发现: ${findingName}`,
            addmDisappeared: findingName => `该 ADDM 发现仅出现在基线中，核心时段已消失: ${findingName}`,
            addmChanged: (findingName, changeRate) => `ADDM 发现 ${findingName} 的 AAS 变化为 ${changeRate.toFixed(1)}%`,
            sessionsChanged: changeRate => `Sessions 相比基线变化 ${changeRate.toFixed(1)}%`,
            logonsIncreased: changeRate => `Logons/s 相比基线增长 ${changeRate.toFixed(1)}%`,
            loadIncreased: (metricName, changeRate, threshold) => `${metricName} 增长 ${changeRate.toFixed(1)}%，超过 ${threshold}% 阈值`,
            waitNew: (eventName, percentDbTime) => `新增 Top 10 等待事件: ${eventName}（%DB time: ${percentDbTime?.toFixed(2) || 'N/A'}%）`,
            waitDbTimeIncreased: (eventName, changeRate) => `${eventName} 的 %DB time 增长 ${changeRate.toFixed(1)}%`,
            waitAvgIncreased: (eventName, changeRate) => `${eventName} 的平均等待增长 ${changeRate.toFixed(1)}%`,
            waitLock: eventName => `锁相关等待进入 Top 10: ${eventName}`,
            waitLatch: eventName => `Latch 等待进入 Top 10: ${eventName}`,
            waitGc: (eventName, percentDbTime) => `GC 集群等待占比超过 3%: ${eventName}（${percentDbTime.toFixed(2)}%）`,
            waitLogSync: avgWait => `log file sync 平均等待超过 5ms: ${avgWait.toFixed(2)}ms`,
            waitSeqRead: avgWait => `db file sequential read 平均等待超过 10ms: ${avgWait.toFixed(2)}ms`,
            efficiencyBelow: (metricName, threshold, value) => `${metricName} 低于 ${threshold}% 阈值: ${value.toFixed(2)}%`,
            efficiencyDrop: (metricName, drop) => `${metricName} 相比基线下降 ${drop.toFixed(1)} 个百分点`,
            idleDrop: idleDrop => `%Idle 相比基线下降 ${idleDrop.toFixed(1)} 个百分点`,
            wioIncrease: changeRate => `%WIO 相比基线增长 ${changeRate.toFixed(1)}%`
        },
        categories: {
            addm: 'ADDM',
            connection: '会话 / 连接',
            load: '负载变化',
            waitEvents: '等待事件',
            slowSQL: '慢 SQL',
            highFreqSQL: '高频 SQL',
            multiDimensionalSQL: '多维问题 SQL',
            efficiency: '实例效率',
            resources: '系统资源'
        },
        core: {
            title: '## 核心 AWR 判定',
            userProblemTime: '用户报告故障时间',
            coreWindows: '### 核心 AWR 窗口',
            baselineWindows: '### 基线 AWR 窗口',
            crossDayBaselines: '### 跨天同时段基线',
            file: '文件',
            instance: '实例',
            timeRange: '时段',
            inclusionReason: '归入原因',
            dbTimeMin: 'DB Time(min)',
            keySignals: '关键信号',
            note: '说明',
            nextStep: '下一步将对核心与基线 AWR 进行详细对比分析。',
            reasons: {
                primary: '主核心',
                pre: '前扩展',
                post: '后扩展'
            },
            crossDayReason: coreFileName => `与核心报告 ${coreFileName} 做跨天同时段对比`
        }
    }
};

function normalizeLanguage(language) {
    if (!language) return null;
    const normalized = String(language).trim().toLowerCase();

    if (normalized.startsWith('zh') || normalized === 'cn' || normalized === 'zh_cn') {
        return 'zh-CN';
    }

    if (normalized.startsWith('en')) {
        return 'en-US';
    }

    return null;
}

function detectReportLanguage(explicitLanguage) {
    const explicit = normalizeLanguage(explicitLanguage);
    if (explicit) return explicit;

    const candidates = [
        process.env.CODEX_REPORT_LANGUAGE,
        process.env.LC_ALL,
        process.env.LC_MESSAGES,
        process.env.LANG,
        Intl.DateTimeFormat().resolvedOptions().locale
    ];

    for (const candidate of candidates) {
        const language = normalizeLanguage(candidate);
        if (language) {
            return language;
        }
    }

    return 'en-US';
}

function getReportTexts(language) {
    return TEXTS[detectReportLanguage(language)] || TEXTS['en-US'];
}

function getLanguageSuffix(language) {
    return detectReportLanguage(language).replace('-', '_');
}

function localizeSqlDimension(dimension, language) {
    const texts = getReportTexts(language);
    return texts.dimensionLabels[dimension] || dimension;
}

function localizeSqlType(type, language) {
    const resolvedLanguage = detectReportLanguage(language);
    if (resolvedLanguage === 'en-US') {
        return type;
    }

    return String(type)
        .replace(/^New /, '新增 ')
        .replace(/^Existing /, '存量 ')
        .replace(/^Worsened /, '恶化 ')
        .replace('I/O Bottleneck', 'I/O 瓶颈')
        .replace('Parse Pressure', '解析压力')
        .replace('Execution Growth', '执行次数增长');
}

module.exports = {
    detectReportLanguage,
    getLanguageSuffix,
    getReportTexts,
    localizeSqlDimension,
    localizeSqlType
};
