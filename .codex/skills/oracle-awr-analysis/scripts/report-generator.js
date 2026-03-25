const fs = require('fs');
const { renderMarkdownToDocx } = require('./report-renderer');
const { detectReportLanguage, getReportTexts, localizeSqlDimension, localizeSqlType } = require('./localization');

function formatNumber(value) {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'number') {
        return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    return String(value);
}

function formatPercent(value) {
    if (value === null || value === undefined) return 'N/A';
    return `${Number(value).toFixed(2)}%`;
}

function formatChangeRate(value) {
    if (value === null || value === undefined) return 'N/A';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
}

function calculateChangeRate(currentValue, baselineValue) {
    if (currentValue === null || currentValue === undefined || baselineValue === null || baselineValue === undefined || baselineValue === 0) {
        return null;
    }

    return ((currentValue - baselineValue) / baselineValue) * 100;
}

function truncateSQLText(text, maxLength = 50) {
    if (!text) return 'N/A';
    const cleaned = text.replace(/\s+/g, ' ').trim();
    return cleaned.length <= maxLength ? cleaned : `${cleaned.slice(0, maxLength)}...`;
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatTime(value) {
    if (!value) return 'N/A';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return String(value);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toFiniteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function averageNumbers(values) {
    const normalized = (values || []).map(toFiniteNumber).filter(value => value !== null);
    if (normalized.length === 0) return null;
    return normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
}

function getSessionEndingValue(report) {
    return toFiniteNumber(
        report?.sessions?.current
        ?? report?.sessions?.sessionsEnd
        ?? report?.sessions?.sessionsInfo?.sessionsEnd
        ?? report?.instanceActivityStats?.sessionsEnd
        ?? null
    );
}

function getLoadMetricValue(report, metricKey) {
    const loadProfile = report?.loadProfile || {};
    if (loadProfile[metricKey]?.perSecond !== undefined) {
        return toFiniteNumber(loadProfile[metricKey].perSecond);
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
    return fallbackKey ? toFiniteNumber(loadProfile[fallbackKey]) : null;
}

function getHeartbeatExecutions(report, heartbeatSqlId = 'bunvx480ynf57') {
    const candidates = [
        report?.sqlByExecutions,
        report?.sqlStats?.sqlByExecutions,
        report?.highFrequencySql?.sqlByExecutions
    ];

    for (const rows of candidates) {
        if (!Array.isArray(rows)) continue;
        const matchedRow = rows.find(row => row?.sqlId === heartbeatSqlId);
        if (matchedRow) {
            return toFiniteNumber(matchedRow.executions);
        }
    }

    return null;
}

function normalizeCoreDeterminationMarkdown(markdown) {
    if (!markdown) return '';
    return markdown.replace(/^##\s+.+?\n+/i, '');
}

function normalizeText(value) {
    return String(value || '').toLowerCase();
}

function uniqueStrings(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
}

function sortStrings(values) {
    return [...(values || [])].sort((left, right) => String(left).localeCompare(String(right)));
}

function formatDisplayValue(value) {
    if (value === null || value === undefined || value === '') return 'N/A';
    const numericValue = toFiniteNumber(value);
    return numericValue !== null ? formatNumber(numericValue) : String(value);
}

function formatValueList(values) {
    const normalized = sortStrings(uniqueStrings(values));
    return normalized.length > 0 ? normalized.join(', ') : 'N/A';
}

function upsertEnvironmentDetail(detailsByInstance, report) {
    const instanceName = report?.header?.instance || report?.instance;
    if (!instanceName) return;

    if (!detailsByInstance.has(instanceName)) {
        detailsByInstance.set(instanceName, {
            instance: instanceName,
            hostName: null,
            version: null,
            platform: null,
            cpus: null,
            cores: null,
            memory: null
        });
    }

    const current = detailsByInstance.get(instanceName);
    current.hostName = current.hostName || report?.header?.hostName || null;
    current.version = current.version || report?.header?.version || null;
    current.platform = current.platform || report?.header?.platform || null;
    current.cpus = current.cpus ?? report?.header?.CPUs ?? null;
    current.cores = current.cores ?? report?.header?.cores ?? null;
    current.memory = current.memory ?? report?.header?.memory ?? null;
}

function summarizeEnvironment(coreReports, baselineReports) {
    const preferredReports = coreReports.length > 0 ? coreReports : baselineReports;
    const fallbackReports = preferredReports.length > 0 ? preferredReports : [...coreReports, ...baselineReports];
    const detailsByInstance = new Map();

    for (const report of fallbackReports) {
        upsertEnvironmentDetail(detailsByInstance, report);
    }

    const instanceDetails = Array.from(detailsByInstance.values()).sort((left, right) => {
        return String(left.instance).localeCompare(String(right.instance));
    });

    return {
        dbNames: sortStrings(uniqueStrings(fallbackReports.map(report => report?.header?.dbName).filter(Boolean))),
        dbIds: sortStrings(uniqueStrings(fallbackReports.map(report => report?.header?.dbId).filter(value => value !== null && value !== undefined && value !== ''))),
        versions: sortStrings(uniqueStrings(instanceDetails.map(detail => detail.version).filter(Boolean))),
        platforms: sortStrings(uniqueStrings(instanceDetails.map(detail => detail.platform).filter(Boolean))),
        hostNames: sortStrings(uniqueStrings(instanceDetails.map(detail => detail.hostName).filter(Boolean))),
        instanceDetails
    };
}

function summarizeCoreWindows(coreReports) {
    const windows = new Map();

    for (const report of coreReports || []) {
        const begin = formatTime(report?.beginSnapTime);
        const end = formatTime(report?.endSnapTime);
        const key = `${begin}||${end}`;
        if (!windows.has(key)) {
            windows.set(key, {
                begin,
                end,
                instances: []
            });
        }

        const current = windows.get(key);
        const instanceName = report?.header?.instance || report?.instance;
        if (instanceName && !current.instances.includes(instanceName)) {
            current.instances.push(instanceName);
        }
    }

    return Array.from(windows.values()).map(window => ({
        ...window,
        instances: sortStrings(window.instances)
    }));
}

function joinItems(items, language) {
    const values = uniqueStrings(items);
    if (values.length === 0) return '';
    return detectReportLanguage(language) === 'zh-CN' ? values.join('、') : values.join(', ');
}

function hasKeyword(value, keywords) {
    const normalized = normalizeText(value);
    return keywords.some(keyword => normalized.includes(keyword));
}

function getRecommendationBundle(language) {
    if (detectReportLanguage(language) === 'zh-CN') {
        return {
            heading: '改进建议',
            noImmediateAction: '当前小节未发现需要立即执行的整改动作，建议保留现有监控并在下一个业务高峰继续复核。',
            addm: {
                stable: '当前 ADDM 差异不大，建议继续按实例保留 ADDM 历史样本，避免只看单次报告得出结论。',
                focusFindings: findings => `优先围绕 ADDM 中最突出的项目展开复核：${joinItems(findings, 'zh-CN')}。建议先确认这些项是否与同一实例、同一批 SQL 或同一批任务窗口相关。`,
                sga: '对于 “SGA 不够大 / Undersized SGA” 类结论，建议结合 `sga_target`、`db_cache_size`、`shared_pool_size` 以及物理读变化一起评估，再决定是否扩容，避免只加内存而不处理扫描型 SQL。',
                userIo: '对于 “User I/O” 类 ADDM 发现，建议先锁定 3.4 和 3.5 中最重的读等待和高物理读 SQL，核查执行计划、热点对象和存储时延，再决定是否需要扩容或错峰。',
                topSql: '对于 “Top SQL Statements” 类 ADDM 发现，建议优先处理 3.5 和 3.6 中高严重度 SQL ID，逐条检查执行计划、索引命中、分区裁剪和统计信息是否失真。',
                hardParse: '对于硬解析压力，建议业务侧优先启用绑定变量、statement cache、session cursor cache，并减少拼接 literal SQL；必要时再评估 `shared_pool_size`。',
                commit: '对于提交/回退相关发现，建议评估批量提交、数组 DML 和事务拆分策略，避免高频小事务把日志同步等待放大。',
                cluster: '对于集群相关 ADDM 发现，建议按实例检查热点对象的访问分布、服务亲和性和 RAC 跨实例块传输，避免相同热点在多个实例间来回争用。',
                generic: '建议把 ADDM 发现与负载、等待和 SQL 三类证据交叉验证后再落地整改，优先处理能同时解释多项异常的共因。'
            },
            connection: {
                stable: '当前没有明显的会话或连接风暴，建议维持现有连接池配置，并持续观察 `Logons/s` 与在线会话数在高峰时段是否重新抬升。',
                sessions: '如果会话数持续抬升，建议核查连接池上限、空闲会话回收、长事务会话和僵尸连接，避免会话堆积进一步放大共享池和锁竞争。',
                logons: '如果 `Logons/s` 异常增大，建议优先排查连接复用不足、应用频繁重连和连接池抖动，并确认是否存在心跳型短连接。',
                monitor: '建议保留按实例的会话数、登录速率和连接池命中率趋势，避免只从全库均值判断连接是否异常。'
            },
            load: {
                stable: '当前负载变化没有形成明确瓶颈，建议继续关注同时间窗的作业编排和实例间负载分配。',
                prioritize: metrics => `建议优先针对负载变化最明显的指标做归因：${joinItems(metrics, 'zh-CN')}，确认它们是由 SQL、批处理还是实例切换引起。`,
                dbTime: '如果 `DB Time` 持续抬升，建议先拆分到具体实例、具体 SQL 和具体业务窗口，确认是否存在并发膨胀或执行计划回退。',
                dbCpu: '如果 `DB CPU` 明显升高，建议核查 CPU 密集型 SQL、并行度设置和同主机上的并发任务，必要时做错峰或限流。',
                physicalReads: '对于 `Physical Reads` 增长，建议优先排查大表扫描、索引失效、分区裁剪缺失以及 buffer cache 命中率是否被重负载 SQL 拉低。',
                redo: '对于 `Redo size` 增长，建议检查批量 DML、频繁提交和热点表写入模式，必要时合并提交批次或优化写入路径。',
                executes: '对于 `Executes` 增长，建议排查应用侧循环调用、拆批过细或同一 SQL 被高频重复触发，优先改成批量执行。'
            },
            wait: {
                noData: '等待事件解析结果为空，建议先回看原始 AWR HTML 中的 `Top 10 Foreground Events` 和 `Wait Classes`，确认 parser 是否遗漏了关键等待，再决定整改方向。',
                stable: '当前等待事件没有显示出新的突出异常，建议继续在故障时间窗复核 Top 10 waits，确认没有被 parser 漏掉的临界等待。',
                prioritize: events => `建议优先围绕这些等待事件继续下钻：${joinItems(events, 'zh-CN')}，并把等待链路关联到具体 SQL、对象和实例。`,
                generic: '建议结合 ASH 或原始 AWR 明细确认等待是在 CPU 饱和、I/O 饱和、锁冲突还是 RAC 传输阶段放大，然后再定向处理。',
                lock: '如果出现锁等待，建议优先定位阻塞会话、热点对象和长事务，评估是否需要缩短事务、调整访问顺序或增加更合适的索引。',
                latch: '如果出现 latch 等等待，建议重点排查共享池争用、热点缓存结构和高频硬解析，必要时结合 AWR/ASH 看具体 latch 子类型。',
                gc: '如果出现 GC/RAC 等待，建议检查服务亲和性、对象主副本分布和跨实例访问模式，尽量把热点访问收敛到固定实例。',
                logSync: '如果 `log file sync` 偏慢，建议减少高频 commit，检查日志文件磁盘时延和日志切换节奏，并评估批量提交是否可行。',
                seqRead: '如果 `db file sequential read` 偏慢，建议检查索引访问选择性、单块读时延和热点索引/表段是否存在随机读放大。',
                directRead: '如果 `direct path read` 明显升高，建议核查是否存在大批量扫描或并行执行，并评估是否需要改写 SQL、分区或错峰。',
                scatteredRead: '如果 `db file scattered read` 占比偏高，建议优先检查全表扫描来源、统计 SQL 与报表任务是否叠加，以及对象分区裁剪是否生效。'
            },
            slowSql: {
                none: '当前没有生成可用的慢 SQL 维度表，建议先确认 AWR SQL 段是否完整，再决定是否补采样或回看原始 HTML。',
                prioritize: sqlIds => `建议先处理 3.5 中最突出的 SQL ID：${joinItems(sqlIds, 'zh-CN')}，逐条保留执行计划、对象统计和绑定变量信息，避免只看总量不看计划差异。`,
                modules: modules => `这些慢 SQL 主要集中在模块：${joinItems(modules, 'zh-CN')}。建议优先和对应应用/任务负责人确认业务批次、调用频率和变更时间点。`,
                elapsed: '如果总耗时或单次耗时偏高，建议比对核心窗口与基线窗口的执行计划、统计信息、绑定变量取值和并行度，确认是否存在计划回退。',
                reads: '如果 Buffer Gets 或 Physical Reads 偏高，建议重点检查谓词可索引性、分区裁剪、驱动表选择和是否存在不必要的大范围扫描。',
                cluster: '如果集群等待时间偏高，建议结合 RAC 服务和对象热点分布检查跨实例访问，优先降低热点块在实例间来回传递。'
            },
            highFreq: {
                none: '当前没有生成可用的高频 SQL 维度表，建议确认 AWR 频繁 SQL 段是否被完整解析。',
                prioritize: sqlIds => `建议优先处理 3.6 中执行次数或解析比例异常的 SQL ID：${joinItems(sqlIds, 'zh-CN')}，先确认它们是否来自批处理循环、轮询任务或连接池抖动。`,
                parse: '如果解析比例接近 1，建议优先启用绑定变量、statement cache、session cursor cache，并减少每次执行都重新解析的模式。',
                executions: '如果执行次数异常高，建议把逐条调用改成批量执行或数组 DML，并评估是否能在应用端合并重复请求。'
            },
            multiSql: {
                none: '当前没有 SQL 同时在多个慢 SQL / 高频 SQL 维度中重复出现，无需额外输出多维问题 SQL。',
                prioritize: sqlIds => `建议优先复核这些多维问题 SQL：${joinItems(sqlIds, 'zh-CN')}。它们同时出现在多个维度中，通常更接近真实瓶颈中心。`,
                modules: modules => `多维问题 SQL 主要集中在模块：${joinItems(modules, 'zh-CN')}。建议优先和对应应用或任务负责人确认批次、频率和最近变更。`,
                crossCheck: '建议对这些 SQL 同时核对执行计划、绑定变量、批量执行方式和对象统计信息，优先处理既有高读放大又有高执行/高重解析特征的 SQL。',
                parse: '如果同一 SQL 同时出现在“执行次数”和“解析比例”等维度，优先检查绑定变量、statement cache 和连接复用，减少重复解析。',
                reads: '如果同一 SQL 同时出现在“物理读”“Buffer Gets”“总耗时”等维度，优先检查索引命中、分区裁剪和大范围扫描问题。'
            },
            efficiency: {
                stable: '当前实例效率指标没有出现需要立即整改的异常，建议继续和 SQL 变化一起跟踪，而不要孤立看命中率。',
                bufferHit: '如果 `Buffer Hit %` 偏低，建议先确认是否被大扫描 SQL 拉低，再评估 buffer cache 扩容，而不是直接按命中率做参数放大。',
                libraryHit: '如果 `Library Hit %` 偏低，建议检查共享池压力、对象失效和高频硬解析，必要时结合 `shared_pool_size` 和 cursor 使用情况一起调整。',
                softParse: '如果 `Soft Parse %` 偏低，建议重点检查 literal SQL、statement cache、应用端连接复用和 session cursor cache 是否配置不足。',
                executeToParse: '如果 `Execute to Parse %` 偏低，通常说明解析次数偏多，建议优先从应用端减少重复解析，再看共享池参数。',
                parseCpu: '如果 `Parse CPU to Parse Elapsd %` 偏低，建议检查解析阶段等待、库缓存争用和硬解析压力，避免把问题误判成纯 CPU 不足。'
            },
            resources: {
                stable: '当前系统资源没有出现必须立即扩容的信号，建议继续按实例跟踪 CPU Idle、%WIO 和磁盘队列长度。',
                cpu: '如果 `%Idle` 明显下降，建议检查主机 CPU 饱和、并发作业叠加和操作系统 run queue，必要时将批处理与核心联机业务错峰。',
                wio: '如果 `%WIO` 明显升高，建议结合存储时延、磁盘队列、ASM/文件系统热点和高物理读 SQL 一起定位，不要只从数据库层面看问题。'
            }
        };
    }

    return {
        heading: 'Improvement Recommendations',
        noImmediateAction: 'No immediate remediation is required in this subsection. Keep the current monitoring in place and re-check during the next business peak.',
        addm: {
            stable: 'ADDM differences are currently limited. Keep historical ADDM samples by instance so conclusions are not based on a single snapshot.',
            focusFindings: findings => `Prioritize validation around the most visible ADDM findings: ${joinItems(findings, 'en-US')}. Confirm whether they point to the same instance, SQL set, or job window.`,
            sga: 'For "Undersized SGA" findings, review `sga_target`, `db_cache_size`, and `shared_pool_size` together with physical-read growth before increasing memory. Avoid masking scan-heavy SQL with memory alone.',
            userIo: 'For "User I/O" findings, start with the heaviest wait events and highest-physical-read SQL in sections 3.4 and 3.5. Validate execution plans, hot objects, and storage latency before changing capacity.',
            topSql: 'For "Top SQL Statements" findings, prioritize the high-severity SQL IDs in sections 3.5 and 3.6. Review execution plans, index usage, partition pruning, and optimizer statistics row by row.',
            hardParse: 'For hard-parse pressure, prioritize bind variables, statement cache, and session cursor cache in the application tier, then reassess whether `shared_pool_size` also needs adjustment.',
            commit: 'For commit and rollback findings, review batch commit size, array DML, and transaction design so frequent small commits do not amplify log sync pressure.',
            cluster: 'For cluster-related ADDM findings, inspect object hot spots, service affinity, and RAC cross-instance block traffic so the same hot data is not bouncing across instances.',
            generic: 'Cross-check ADDM findings against load, waits, and SQL evidence before choosing remediation. Start with the cause that explains multiple anomalies at once.'
        },
        connection: {
            stable: 'No clear session or connection storm is visible. Keep the current pool sizing and continue watching `Logons/s` and active sessions during peak periods.',
            sessions: 'If session count keeps rising, review pool limits, idle-session cleanup, long transactions, and stale connections before the extra sessions amplify shared-pool or locking pressure.',
            logons: 'If `Logons/s` rises abnormally, first check for poor connection reuse, frequent reconnects, and connection-pool thrashing, then confirm whether short heartbeat-style connections exist.',
            monitor: 'Keep per-instance trends for session count, login rate, and pool hit ratio so connection issues are not hidden by cluster-wide averages.'
        },
        load: {
            stable: 'No load metric has formed a standalone bottleneck yet. Continue tracking job scheduling and load distribution across instances.',
            prioritize: metrics => `Prioritize root-cause analysis for the most changed load metrics: ${joinItems(metrics, 'en-US')}. Confirm whether they come from SQL behavior, batch jobs, or instance shifts.`,
            dbTime: 'If `DB Time` remains elevated, break it down by instance, SQL, and business window first to confirm whether concurrency growth or plan regression is the driver.',
            dbCpu: 'If `DB CPU` increases materially, review CPU-heavy SQL, degree of parallelism, and competing host workloads; use throttling or schedule separation if needed.',
            physicalReads: 'For `Physical Reads` growth, first inspect large scans, missing index access, lost partition pruning, and whether heavy SQL is pushing buffer-cache effectiveness down.',
            redo: 'For `Redo size` growth, review bulk DML, frequent commits, and write patterns on hot tables. Merge commit batches or streamline write paths where possible.',
            executes: 'For `Executes` growth, look for application loops, overly small batch sizes, or the same SQL being triggered repeatedly, then consolidate calls into batch execution.'
        },
        wait: {
            noData: 'Wait-event extraction returned no data. Re-check the raw AWR HTML `Top 10 Foreground Events` and `Wait Classes` sections before deciding on remediation.',
            stable: 'No new standout wait anomaly is visible. Re-verify the Top 10 waits around the incident window to make sure the parser did not miss a borderline event.',
            prioritize: events => `Prioritize deeper inspection for these wait events: ${joinItems(events, 'en-US')}. Tie each wait back to the affected SQL, object, and instance.`,
            generic: 'Use ASH or raw AWR detail to confirm whether the waits are driven by CPU saturation, I/O saturation, locking, or RAC traffic before applying fixes.',
            lock: 'If lock waits appear, identify blockers, hot objects, and long transactions first, then decide whether access order, indexing, or transaction scope should change.',
            latch: 'If latch waits appear, focus on shared-pool contention, hot cache structures, and hard parsing. Use latch subtype detail before tuning parameters.',
            gc: 'If GC/RAC waits appear, review service affinity, object placement, and cross-instance access patterns so hot access stays local to one instance when possible.',
            logSync: 'If `log file sync` is slow, reduce high-frequency commits, check redo-log device latency and switch cadence, and evaluate whether batch commit is feasible.',
            seqRead: 'If `db file sequential read` is slow, review index selectivity, single-block read latency, and whether random I/O is amplified on hot indexes or tables.',
            directRead: 'If `direct path read` grows materially, confirm whether large scans or parallel execution are driving it, then evaluate SQL rewrites, partitioning, or schedule separation.',
            scatteredRead: 'If `db file scattered read` stays prominent, inspect full-scan sources, overlapping reporting/statistics tasks, and whether partition pruning is failing.'
        },
        slowSql: {
            none: 'No usable slow-SQL dimension tables were generated. Verify the AWR SQL sections before deciding whether another sample is needed.',
            prioritize: sqlIds => `Start with the most visible SQL IDs in section 3.5: ${joinItems(sqlIds, 'en-US')}. Preserve plans, object statistics, and bind details for each one before making changes.`,
            modules: modules => `These slow SQL rows are concentrated in modules: ${joinItems(modules, 'en-US')}. Confirm the related batch window, call frequency, and recent application changes with the owning teams.`,
            elapsed: 'When elapsed time or elapsed per execution is high, compare core-vs-baseline execution plans, optimizer statistics, bind values, and parallel settings for plan regression.',
            reads: 'When buffer gets or physical reads are high, review predicate sargability, partition pruning, driving-table choice, and unnecessary wide-range scans.',
            cluster: 'When cluster wait time is high, review RAC service placement and object hot spots so cross-instance traffic is reduced.'
        },
        highFreq: {
            none: 'No usable high-frequency SQL tables were generated. Verify that the AWR frequent-SQL sections were parsed completely.',
            prioritize: sqlIds => `Prioritize the SQL IDs with abnormal executions or parse ratio in section 3.6: ${joinItems(sqlIds, 'en-US')}. Confirm whether they come from batch loops, polling jobs, or connection churn.`,
            parse: 'If parse ratio is close to 1, prioritize bind variables, statement cache, and session cursor cache so executions stop reparsing on every call.',
            executions: 'If execution count is abnormally high, replace row-by-row calls with batch execution or array DML and consolidate duplicate requests at the application layer.'
        },
        multiSql: {
            none: 'No SQL appeared in multiple slow/high-frequency dimensions often enough to qualify as a multi-dimensional problem SQL.',
            prioritize: sqlIds => `Prioritize these multi-dimensional problem SQL IDs: ${joinItems(sqlIds, 'en-US')}. Repeated appearance across dimensions usually points closer to the real bottleneck center.`,
            modules: modules => `These multi-dimensional SQL rows are concentrated in modules: ${joinItems(modules, 'en-US')}. Confirm batch windows, call frequency, and recent changes with the owning teams.`,
            crossCheck: 'Review execution plans, bind usage, batch execution patterns, and object statistics together for these SQL IDs. Prioritize the ones that combine read amplification with high execution or high reparse pressure.',
            parse: 'If the same SQL appears in both execution-count and parse-ratio dimensions, prioritize bind variables, statement cache, and connection reuse to reduce repeat parsing.',
            reads: 'If the same SQL appears in physical-read, buffer-get, and elapsed-time dimensions, prioritize index access, partition pruning, and large-scan reduction.'
        },
        efficiency: {
            stable: 'No instance-efficiency metric requires immediate action. Keep tracking efficiency together with SQL behavior instead of reading hit ratios in isolation.',
            bufferHit: 'If `Buffer Hit %` is low, first confirm whether scan-heavy SQL is driving it down before expanding buffer cache based on hit ratio alone.',
            libraryHit: 'If `Library Hit %` is low, review shared-pool pressure, invalidations, and hard parsing, then tune `shared_pool_size` only with that evidence.',
            softParse: 'If `Soft Parse %` is low, focus on literal SQL, statement cache, connection reuse, and session cursor cache settings.',
            executeToParse: 'If `Execute to Parse %` is low, the priority is usually to reduce repeat parsing at the application tier before changing memory parameters.',
            parseCpu: 'If `Parse CPU to Parse Elapsd %` is low, inspect parse-phase waits, library-cache contention, and hard-parse pressure before treating it as a pure CPU issue.'
        },
        resources: {
            stable: 'No system-resource signal currently demands immediate expansion. Continue tracking CPU idle, `%WIO`, and disk queue length by instance.',
            cpu: 'If `%Idle` drops sharply, inspect host CPU saturation, overlapping jobs, and OS run queue pressure, then separate batch work from peak online traffic if needed.',
            wio: 'If `%WIO` increases materially, combine storage latency, disk queue, ASM/filesystem hot spots, and heavy-read SQL evidence before choosing remediation.'
        }
    };
}

function appendRecommendations(sectionBody, recommendations, bundle) {
    let markdown = sectionBody || '';
    if (!markdown.endsWith('\n\n')) {
        markdown = `${markdown.trimEnd()}\n\n`;
    }

    const lines = uniqueStrings(recommendations);
    markdown += `#### ${bundle.heading}\n\n`;

    if (lines.length === 0) {
        markdown += `- ${bundle.noImmediateAction}\n\n`;
        return markdown;
    }

    for (const line of lines) {
        markdown += `- ${line}\n`;
    }
    markdown += '\n';
    return markdown;
}

function collectTopSqlRows(dimensionTables, limit = 5) {
    const rows = [];

    for (const table of (dimensionTables || [])) {
        for (const row of (table.rows || [])) {
            if (!row.sqlModule) continue;
            rows.push({ ...row, dimension: table.dimension });
        }
    }

    rows.sort((left, right) => {
        const leftSeverity = left.severity === 'high' ? 0 : 1;
        const rightSeverity = right.severity === 'high' ? 0 : 1;
        if (leftSeverity !== rightSeverity) return leftSeverity - rightSeverity;

        const leftNew = left.status === 'New' ? 0 : 1;
        const rightNew = right.status === 'New' ? 0 : 1;
        if (leftNew !== rightNew) return leftNew - rightNew;

        const leftChange = Math.abs(left.changeRate ?? 0);
        const rightChange = Math.abs(right.changeRate ?? 0);
        if (leftChange !== rightChange) return rightChange - leftChange;

        return (Number(right.coreValue) || 0) - (Number(left.coreValue) || 0);
    });

    const seen = new Set();
    const selected = [];

    for (const row of rows) {
        if (seen.has(row.sqlId)) continue;
        seen.add(row.sqlId);
        selected.push(row);
        if (selected.length >= limit) break;
    }

    return selected;
}

function generateAddmRecommendations(anomalies, language) {
    const bundle = getRecommendationBundle(language);
    const lines = [];

    if (!anomalies || anomalies.length === 0) {
        return [bundle.addm.stable];
    }

    const findings = anomalies.map(anomaly => anomaly.metric).filter(Boolean).slice(0, 4);
    if (findings.length > 0) {
        lines.push(bundle.addm.focusFindings(findings));
    }

    if (anomalies.some(anomaly => hasKeyword(anomaly.metric, ['undersized sga', 'sga', '不够大']))) {
        lines.push(bundle.addm.sga);
    }

    if (anomalies.some(anomaly => hasKeyword(anomaly.metric, ['user i/o', '用户 i/o', '用户i/o']))) {
        lines.push(bundle.addm.userIo);
    }

    if (anomalies.some(anomaly => hasKeyword(anomaly.metric, ['top sql', 'sql statements', '顶级 sql', 'sql 语句']))) {
        lines.push(bundle.addm.topSql);
    }

    if (anomalies.some(anomaly => hasKeyword(anomaly.metric, ['hard parse', 'literal', '语法分析', '文字']))) {
        lines.push(bundle.addm.hardParse);
    }

    if (anomalies.some(anomaly => hasKeyword(anomaly.metric, ['commit', 'rollback', '提交', '回退']))) {
        lines.push(bundle.addm.commit);
    }

    if (anomalies.some(anomaly => hasKeyword(anomaly.metric, ['cluster', 'gc', '集群']))) {
        lines.push(bundle.addm.cluster);
    }

    if (lines.length === 1) {
        lines.push(bundle.addm.generic);
    }

    return uniqueStrings(lines);
}

function generateConnectionRecommendations(anomalies, language) {
    const bundle = getRecommendationBundle(language);

    if (!anomalies || anomalies.length === 0) {
        return [bundle.connection.stable];
    }

    const lines = [];

    if (anomalies.some(anomaly => anomaly.metric === 'Sessions')) {
        lines.push(bundle.connection.sessions);
    }

    if (anomalies.some(anomaly => anomaly.metric === 'Logons/s')) {
        lines.push(bundle.connection.logons);
    }

    lines.push(bundle.connection.monitor);
    return uniqueStrings(lines);
}

function generateLoadRecommendations(anomalies, language) {
    const bundle = getRecommendationBundle(language);

    if (!anomalies || anomalies.length === 0) {
        return [bundle.load.stable];
    }

    const lines = [];
    const metrics = uniqueStrings(anomalies.map(anomaly => anomaly.metric).filter(Boolean));

    if (metrics.length > 0) {
        lines.push(bundle.load.prioritize(metrics.slice(0, 4)));
    }

    if (metrics.includes('DB Time(s)')) lines.push(bundle.load.dbTime);
    if (metrics.includes('DB CPU(s)')) lines.push(bundle.load.dbCpu);
    if (metrics.includes('Physical Reads')) lines.push(bundle.load.physicalReads);
    if (metrics.includes('Redo size')) lines.push(bundle.load.redo);
    if (metrics.includes('Executes')) lines.push(bundle.load.executes);

    return uniqueStrings(lines);
}

function generateWaitRecommendations(anomalies, coreReports, baselineReports, language) {
    const bundle = getRecommendationBundle(language);
    const hasWaitData = [...coreReports, ...baselineReports].some(report => (report.topEvents || []).length > 0);

    if (!hasWaitData) {
        return [bundle.wait.noData];
    }

    if (!anomalies || anomalies.length === 0) {
        return [bundle.wait.stable];
    }

    const lines = [];
    const events = uniqueStrings(anomalies.map(anomaly => anomaly.metric.replace(/\s+Avg Wait$/i, '')).filter(Boolean)).slice(0, 4);

    if (events.length > 0) {
        lines.push(bundle.wait.prioritize(events));
    }

    lines.push(bundle.wait.generic);

    if (anomalies.some(anomaly => anomaly.type === 'lock_event')) lines.push(bundle.wait.lock);
    if (anomalies.some(anomaly => anomaly.type === 'latch_event')) lines.push(bundle.wait.latch);
    if (anomalies.some(anomaly => anomaly.type === 'gc_event' || hasKeyword(anomaly.metric, ['gc ', 'cluster', '集群']))) {
        lines.push(bundle.wait.gc);
    }
    if (anomalies.some(anomaly => anomaly.type === 'log_sync_slow' || hasKeyword(anomaly.metric, ['log file sync']))) {
        lines.push(bundle.wait.logSync);
    }
    if (anomalies.some(anomaly => anomaly.type === 'seq_read_slow' || hasKeyword(anomaly.metric, ['db file sequential read']))) {
        lines.push(bundle.wait.seqRead);
    }
    if (anomalies.some(anomaly => hasKeyword(anomaly.metric, ['direct path read']))) {
        lines.push(bundle.wait.directRead);
    }
    if (anomalies.some(anomaly => hasKeyword(anomaly.metric, ['db file scattered read']))) {
        lines.push(bundle.wait.scatteredRead);
    }

    return uniqueStrings(lines);
}

function generateSlowSqlRecommendations(dimensionTables, language) {
    const bundle = getRecommendationBundle(language);
    const topRows = collectTopSqlRows(dimensionTables, 5);

    if (topRows.length === 0) {
        return [bundle.slowSql.none];
    }

    const lines = [];
    const sqlIds = topRows.map(row => row.sqlId);
    const modules = uniqueStrings(topRows.map(row => row.sqlModule).filter(Boolean)).slice(0, 4);
    const dimensions = new Set((dimensionTables || []).filter(table => (table.rows || []).some(row => row.sqlModule)).map(table => table.dimension));

    lines.push(bundle.slowSql.prioritize(sqlIds));
    if (modules.length > 0) lines.push(bundle.slowSql.modules(modules));
    if (dimensions.has('Elapsed Time') || dimensions.has('Elapsed per Exec')) lines.push(bundle.slowSql.elapsed);
    if (dimensions.has('Buffer Gets') || dimensions.has('Physical Reads')) lines.push(bundle.slowSql.reads);
    if (dimensions.has('Cluster Wait Time')) lines.push(bundle.slowSql.cluster);

    return uniqueStrings(lines);
}

function generateHighFreqSqlRecommendations(dimensionTables, language) {
    const bundle = getRecommendationBundle(language);
    const topRows = collectTopSqlRows(dimensionTables, 5);

    if (topRows.length === 0) {
        return [bundle.highFreq.none];
    }

    const lines = [];
    const sqlIds = topRows.map(row => row.sqlId);
    const dimensions = new Set((dimensionTables || []).filter(table => (table.rows || []).some(row => row.sqlModule)).map(table => table.dimension));

    lines.push(bundle.highFreq.prioritize(sqlIds));
    if (dimensions.has('Parse Ratio')) lines.push(bundle.highFreq.parse);
    if (dimensions.has('Executions')) lines.push(bundle.highFreq.executions);

    return uniqueStrings(lines);
}

function buildSqlTextMap(coreReports, baselineReports) {
    const sqlTextMap = new Map();

    for (const report of [...coreReports, ...baselineReports]) {
        if (!report.sqlTextMap) continue;
        for (const [sqlId, sqlText] of Object.entries(report.sqlTextMap)) {
            if (!sqlTextMap.has(sqlId) && sqlText) {
                sqlTextMap.set(sqlId, sqlText);
            }
        }
    }

    return sqlTextMap;
}

function buildMultiDimensionalSqlRows(slowSqlTables, highFreqTables, coreReports, baselineReports, language) {
    const sqlTextMap = buildSqlTextMap(coreReports, baselineReports);
    const sqlMap = new Map();

    for (const table of [...(slowSqlTables || []), ...(highFreqTables || [])]) {
        for (const row of (table.rows || [])) {
            if (!row.sqlModule) continue;

            if (!sqlMap.has(row.sqlId)) {
                sqlMap.set(row.sqlId, {
                    sqlId: row.sqlId,
                    modules: new Set(),
                    dimensions: new Set(),
                    occurrences: 0
                });
            }

            const entry = sqlMap.get(row.sqlId);
            entry.modules.add(row.sqlModule);
            entry.dimensions.add(table.dimension);
            entry.occurrences += 1;
        }
    }

    return Array.from(sqlMap.values())
        .filter(entry => entry.occurrences >= 2)
        .map(entry => ({
            sqlId: entry.sqlId,
            module: Array.from(entry.modules).join(', '),
            sqlPreview50: truncateSQLText(sqlTextMap.get(entry.sqlId), 50),
            dimensions: Array.from(entry.dimensions),
            localizedDimensions: Array.from(entry.dimensions).map(dimension => localizeSqlDimension(dimension, language)),
            occurrenceCount: entry.occurrences
        }))
        .sort((left, right) => {
            if (right.occurrenceCount !== left.occurrenceCount) return right.occurrenceCount - left.occurrenceCount;
            if (right.dimensions.length !== left.dimensions.length) return right.dimensions.length - left.dimensions.length;
            return left.sqlId.localeCompare(right.sqlId);
        });
}

function generateMultiDimensionalSqlSection(rows, texts, language) {
    if (!rows || rows.length === 0) {
        return `${texts.noMultiDimSqlTables}\n\n`;
    }

    let markdown = `| ${texts.sqlId} | ${texts.module} | ${texts.sqlPreview50} | ${texts.occurrenceDimensions} |\n`;
    markdown += '|--------|--------|-------------|-------------|\n';

    for (const row of rows) {
        markdown += `| [${row.sqlId}](#sql-${row.sqlId}) | ${row.module} | ${row.sqlPreview50} | ${joinItems(row.localizedDimensions, language)} |\n`;
    }

    return `${markdown}\n`;
}

function generateMultiDimensionalSqlRecommendations(rows, language) {
    const bundle = getRecommendationBundle(language);

    if (!rows || rows.length === 0) {
        return [bundle.multiSql.none];
    }

    const lines = [];
    const sqlIds = rows.slice(0, 5).map(row => row.sqlId);
    const modules = uniqueStrings(rows.flatMap(row => row.module.split(',').map(item => item.trim()).filter(Boolean))).slice(0, 4);
    const dimensions = new Set(rows.flatMap(row => row.dimensions));

    lines.push(bundle.multiSql.prioritize(sqlIds));
    if (modules.length > 0) lines.push(bundle.multiSql.modules(modules));
    lines.push(bundle.multiSql.crossCheck);
    if (dimensions.has('Parse Ratio') || dimensions.has('Executions')) lines.push(bundle.multiSql.parse);
    if (dimensions.has('Physical Reads') || dimensions.has('Buffer Gets') || dimensions.has('Elapsed Time')) lines.push(bundle.multiSql.reads);

    return uniqueStrings(lines);
}

function generateEfficiencyRecommendations(anomalies, language) {
    const bundle = getRecommendationBundle(language);

    if (!anomalies || anomalies.length === 0) {
        return [bundle.efficiency.stable];
    }

    const metrics = uniqueStrings(anomalies.map(anomaly => anomaly.metric).filter(Boolean));
    const lines = [];

    if (metrics.includes('Buffer Hit %')) lines.push(bundle.efficiency.bufferHit);
    if (metrics.includes('Library Hit %')) lines.push(bundle.efficiency.libraryHit);
    if (metrics.includes('Soft Parse %')) lines.push(bundle.efficiency.softParse);
    if (metrics.includes('Execute to Parse %')) lines.push(bundle.efficiency.executeToParse);
    if (metrics.includes('Parse CPU to Parse Elapsd %')) lines.push(bundle.efficiency.parseCpu);

    return lines.length > 0 ? uniqueStrings(lines) : [bundle.efficiency.stable];
}

function generateResourceRecommendations(anomalies, language) {
    const bundle = getRecommendationBundle(language);

    if (!anomalies || anomalies.length === 0) {
        return [bundle.resources.stable];
    }

    const lines = [];

    if (anomalies.some(anomaly => anomaly.metric === '%Idle')) lines.push(bundle.resources.cpu);
    if (anomalies.some(anomaly => anomaly.metric === '%WIO')) lines.push(bundle.resources.wio);

    return lines.length > 0 ? uniqueStrings(lines) : [bundle.resources.stable];
}

function stripAvgWaitSuffix(metric) {
    return String(metric || '').replace(/\s+Avg Wait$/i, '');
}

function generateIncidentConclusionSection(analysisResult, coreReports, baselineReports, slowSqlTables, highFreqTables, multiDimensionalSqlRows, language) {
    const localizedLanguage = detectReportLanguage(language);
    const isChinese = localizedLanguage === 'zh-CN';
    const loadAnomalies = analysisResult.categorizedAnomalies.load || [];
    const waitAnomalies = analysisResult.categorizedAnomalies.waitEvents || [];
    const connectionAnomalies = analysisResult.categorizedAnomalies.connection || [];
    const efficiencyAnomalies = analysisResult.categorizedAnomalies.efficiency || [];

    const readLoadSignals = uniqueStrings(
        loadAnomalies
            .map(anomaly => anomaly.metric)
            .filter(metric => ['Physical Reads', 'Executes', 'DB Time(s)'].includes(metric))
    );
    const readWaitSignals = uniqueStrings(
        waitAnomalies
            .map(anomaly => stripAvgWaitSuffix(anomaly.metric))
            .filter(metric => hasKeyword(metric, ['db file scattered read', 'db file sequential read', 'read by other session', 'direct path read']))
    );
    const racSignals = uniqueStrings(
        waitAnomalies
            .map(anomaly => stripAvgWaitSuffix(anomaly.metric))
            .filter(metric => hasKeyword(metric, ['gc ']))
    );
    const sharedPoolSignals = uniqueStrings(
        waitAnomalies
            .map(anomaly => stripAvgWaitSuffix(anomaly.metric))
            .filter(metric => hasKeyword(metric, ['latch', 'library cache lock', 'row cache lock']))
    );

    const fallbackSqlIds = uniqueStrings([
        ...collectTopSqlRows(slowSqlTables || [], 3).map(row => row.sqlId),
        ...collectTopSqlRows(highFreqTables || [], 2).map(row => row.sqlId)
    ]).slice(0, 5);
    const topSqlIds = uniqueStrings((multiDimensionalSqlRows || []).map(row => row.sqlId)).slice(0, 5);
    const focusSqlIds = topSqlIds.length > 0 ? topSqlIds : fallbackSqlIds;

    const parseRows = (highFreqTables || [])
        .filter(table => table.dimension === 'Parse Ratio')
        .flatMap(table => table.rows || []);
    const parsePressure = parseRows.some(row =>
        row.status === 'New'
        || row.severity === 'high'
        || (row.changeRate !== null && row.changeRate > 15)
    ) || efficiencyAnomalies.some(anomaly => ['Execute to Parse %', 'Parse CPU to Parse Elapsd %', 'Library Hit %'].includes(anomaly.metric));

    const coreLogons = averageNumbers(coreReports.map(report => getLoadMetricValue(report, 'Logons/s')));
    const baselineLogons = averageNumbers(baselineReports.map(report => getLoadMetricValue(report, 'Logons/s')));
    const coreHeartbeat = averageNumbers(coreReports.map(report => getHeartbeatExecutions(report)));
    const baselineHeartbeat = averageNumbers(baselineReports.map(report => getHeartbeatExecutions(report)));
    const connectionStormRuledOut = connectionAnomalies.length === 0
        && (coreLogons === null || baselineLogons === null || coreLogons <= baselineLogons)
        && (coreHeartbeat === null || baselineHeartbeat === null || coreHeartbeat <= baselineHeartbeat);

    const readPressure = readLoadSignals.length > 0 || readWaitSignals.length > 0;
    let diagnosis;
    if (readPressure && racSignals.length > 0) {
        diagnosis = isChinese
            ? `本次问题更符合“读型负载放大 + SQL 访问路径/批处理读放大”，并伴随 RAC / Cache Fusion 传输放大，而不是单纯连接风暴或纯 CPU 瓶颈。`
            : `The incident is more consistent with read-heavy workload growth and SQL access-path or batch-read amplification, with additional RAC / cache-fusion overhead, rather than a pure connection storm or CPU-only bottleneck.`;
    } else if (readPressure) {
        diagnosis = isChinese
            ? `本次问题更符合“读型负载放大 + SQL 访问路径/批处理读放大”，主因应优先从重读 SQL、扫描型作业和对象访问模式排查。`
            : `The incident is more consistent with read-heavy workload growth and SQL access-path or batch-read amplification. The first priority should be heavy-read SQL, scan-heavy jobs, and object access patterns.`;
    } else if (parsePressure) {
        diagnosis = isChinese
            ? `当前异常更接近解析压力、共享池争用或反复解析行为放大，需要结合应用绑定变量和 cursor 复用继续下钻。`
            : `The anomaly pattern is closer to parse pressure, shared-pool contention, or repeated-parse amplification, and should be drilled down with bind-variable and cursor-reuse checks.`;
    } else {
        diagnosis = isChinese
            ? `当前证据不足以把问题定性为单一根因，建议继续用同实例基线、Top waits 和问题 SQL 做交叉验证后再定稿。`
            : `Current evidence is not yet strong enough to reduce the incident to a single root cause. Re-validate it with same-instance baselines, Top waits, and problem SQL before final sign-off.`;
    }

    const evidence = [];
    if (readLoadSignals.length > 0) {
        evidence.push(isChinese
            ? `负载侧：${joinItems(readLoadSignals, localizedLanguage)}`
            : `Load-side signals: ${joinItems(readLoadSignals, localizedLanguage)}`);
    }
    if (readWaitSignals.length > 0) {
        evidence.push(isChinese
            ? `等待侧：${joinItems(readWaitSignals, localizedLanguage)}`
            : `Wait-side signals: ${joinItems(readWaitSignals, localizedLanguage)}`);
    }
    if (racSignals.length > 0) {
        evidence.push(isChinese
            ? `RAC 侧：${joinItems(racSignals, localizedLanguage)}`
            : `RAC-side signals: ${joinItems(racSignals, localizedLanguage)}`);
    }
    if (focusSqlIds.length > 0) {
        evidence.push(isChinese
            ? `SQL 侧：优先关注 ${joinItems(focusSqlIds, localizedLanguage)}`
            : `SQL-side focus: ${joinItems(focusSqlIds, localizedLanguage)}`);
    }

    const secondaryFactors = [];
    if (parsePressure) {
        secondaryFactors.push(isChinese
            ? `解析/共享池指标存在压力，但更适合作为次要放大因素或长期治理项，不应在缺少进一步证据时直接盖过读放大结论。`
            : `Parse and shared-pool indicators show pressure, but they are better treated as secondary amplifiers or chronic debt unless stronger evidence outweighs the read-pressure story.`);
    }
    if (sharedPoolSignals.length > 0 && !parsePressure) {
        secondaryFactors.push(isChinese
            ? `共享池或库缓存相关等待存在，但还需要结合 SQL 计划、绑定变量和对象热点后再决定是否上升为主因。`
            : `Shared-pool or library-cache waits are present, but they still need SQL-plan, bind-variable, and hot-object confirmation before being promoted to the primary diagnosis.`);
    }

    const ruledOut = [];
    if (connectionStormRuledOut) {
        ruledOut.push(isChinese
            ? `当前 AWR 证据不支持连接风暴或短连接风暴。`
            : `Current AWR evidence does not support a connection storm or short-connection storm.`);
    }

    const actions = [];
    if (focusSqlIds.length > 0) {
        actions.push(isChinese
            ? `优先保留并复核 ${joinItems(focusSqlIds, localizedLanguage)} 的执行计划、对象统计、绑定变量和批处理窗口，先定位真正拉高读放大和集群传输的 SQL。`
            : `Retain and review the execution plans, object statistics, bind usage, and batch windows for ${joinItems(focusSqlIds, localizedLanguage)} first so the SQL actually driving read amplification and cluster traffic is identified.`);
    }
    if (racSignals.length > 0) {
        actions.push(isChinese
            ? `按实例复核 GC 等待对应的热点对象、服务亲和性和跨实例访问模式，避免把 GC 问题误导成锁等待。`
            : `Re-check the hot objects, service affinity, and cross-instance access pattern behind the GC waits by instance so RAC traffic is not misread as lock contention.`);
    }
    if (parsePressure) {
        actions.push(isChinese
            ? `对解析比例异常 SQL 优先区分“本次明显恶化”与“长期稳定高解析”两类，再决定是否调整绑定变量、statement cache 和 session cursor cache。`
            : `Separate parse-ratio SQL into materially worsened versus chronically stable-high parse behavior before changing bind-variable usage, statement cache, or session cursor cache.`);
    }
    if (actions.length === 0) {
        actions.push(isChinese
            ? `先按同实例基线、Top waits 和核心 SQL 重新做证据闭环，再决定最终结论和整改顺序。`
            : `Rebuild the evidence chain with same-instance baselines, Top waits, and core SQL before finalizing the conclusion and remediation order.`);
    }

    let markdown = `${isChinese ? '### 3.10 事件结论与处置优先级' : '### 3.10 Incident Conclusion and Priorities'}\n\n`;
    markdown += `${isChinese ? '**事件判定**' : '**Diagnosis**'}\n\n${diagnosis}\n\n`;

    if (evidence.length > 0) {
        markdown += `${isChinese ? '**主证据**' : '**Primary Evidence**'}\n`;
        for (const line of evidence) {
            markdown += `- ${line}\n`;
        }
        markdown += '\n';
    }

    if (secondaryFactors.length > 0) {
        markdown += `${isChinese ? '**次要因素**' : '**Secondary Factors**'}\n`;
        for (const line of secondaryFactors) {
            markdown += `- ${line}\n`;
        }
        markdown += '\n';
    }

    if (ruledOut.length > 0) {
        markdown += `${isChinese ? '**排除项**' : '**Ruled-Out Hypotheses**'}\n`;
        for (const line of ruledOut) {
            markdown += `- ${line}\n`;
        }
        markdown += '\n';
    }

    markdown += `${isChinese ? '**优先动作**' : '**Priority Actions**'}\n`;
    for (const line of actions) {
        markdown += `- ${line}\n`;
    }
    markdown += '\n';

    return markdown;
}

async function generateWordReport(analysisResult, scanResult, coreReports, baselineReports, outputPath, options = {}) {
    const markdown = generateMarkdownReport(analysisResult, scanResult, coreReports, baselineReports, options);
    await renderMarkdownToDocx(markdown, outputPath);
    console.log(`Word report saved to: ${outputPath}`);
}

function buildSplitAppendixNotice(language, appendixFileName) {
    const safeFileName = appendixFileName || 'sql_appendix.md';
    if (detectReportLanguage(language) === 'zh-CN') {
        return [
            `<!-- AWR_APPENDIX_BEGIN: ${safeFileName} -->`,
            `SQL 全文已拆分到 [${safeFileName}](${safeFileName})，以避免主报告内容过大而无法内联渲染。`,
            '<!-- AWR_APPENDIX_END -->'
        ].join('\n');
    }

    return [
        `<!-- AWR_APPENDIX_BEGIN: ${safeFileName} -->`,
        `Full SQL text has been moved to [${safeFileName}](${safeFileName}) so the main report can still be rendered inline.`,
        '<!-- AWR_APPENDIX_END -->'
    ].join('\n');
}

function generateMarkdownReport(analysisResult, scanResult, coreReports, baselineReports, options = {}) {
    const language = detectReportLanguage(options.language || scanResult.language);
    const texts = getReportTexts(language);
    const recommendationBundle = getRecommendationBundle(language);
    const includeSqlAppendix = options.includeSqlAppendix !== false;
    const environmentSummary = summarizeEnvironment(coreReports, baselineReports);
    const coreWindowSummary = summarizeCoreWindows(coreReports);

    let markdown = '';
    markdown += `# ${texts.reportTitle}\n\n`;
    markdown += `${texts.generatedAt}: ${formatTime(new Date())}\n\n`;

    markdown += `${texts.environmentOverview}\n\n`;

    if (environmentSummary.instanceDetails.length > 0) {
        const deploymentMode = environmentSummary.instanceDetails.length > 1
            ? texts.deploymentModeRac(environmentSummary.instanceDetails.length)
            : texts.deploymentModeSingle;

        markdown += `${texts.databaseInformation}\n\n`;
        markdown += `${texts.clusterOverview}\n\n`;
        markdown += `| ${texts.item} | ${texts.value} |\n`;
        markdown += '|------|-------|\n';
        markdown += `| DB Name | ${formatValueList(environmentSummary.dbNames)} |\n`;
        markdown += `| DB Id | ${formatValueList(environmentSummary.dbIds)} |\n`;
        markdown += `| ${texts.deployment} | ${deploymentMode} |\n`;
        markdown += `| ${texts.instanceCount} | ${environmentSummary.instanceDetails.length} |\n`;
        markdown += `| ${texts.hostCount} | ${environmentSummary.hostNames.length || 'N/A'} |\n`;
        markdown += `| ${texts.instancesLabel} | ${formatValueList(environmentSummary.instanceDetails.map(detail => detail.instance))} |\n`;
        markdown += `| ${texts.hostsLabel} | ${formatValueList(environmentSummary.hostNames)} |\n`;
        markdown += `| Version | ${formatValueList(environmentSummary.versions)} |\n`;
        markdown += `| Platform | ${formatValueList(environmentSummary.platforms)} |\n\n`;

        markdown += `${texts.instanceDetails}\n\n`;
        markdown += `| Instance | ${texts.hostNameLabel} | Version | Platform | CPUs | Cores | ${texts.memoryGbLabel} |\n`;
        markdown += '|----------|-----------|---------|----------|------|-------|-------------|\n';
        for (const detail of environmentSummary.instanceDetails) {
            markdown += `| ${detail.instance || 'N/A'} | ${detail.hostName || 'N/A'} | ${detail.version || 'N/A'} | ${detail.platform || 'N/A'} | ${formatDisplayValue(detail.cpus)} | ${formatDisplayValue(detail.cores)} | ${formatDisplayValue(detail.memory)} |\n`;
        }
        markdown += '\n';
    }

    markdown += `${texts.analysisWindow}\n\n`;
    markdown += `- ${texts.problemTime}: ${scanResult.problemTimeStr}\n`;
    for (const coreWindow of coreWindowSummary) {
        const instanceSuffix = environmentSummary.instanceDetails.length > 1
            ? ` (${texts.core.instance}: ${coreWindow.instances.join(', ')})`
            : '';
        markdown += `- ${texts.coreWindow}: ${coreWindow.begin} - ${coreWindow.end}${instanceSuffix}\n`;
    }
    markdown += '\n';

    markdown += `${texts.coreDetermination}\n\n`;
    markdown += normalizeCoreDeterminationMarkdown(scanResult.markdownReport || '');
    if (!markdown.endsWith('\n\n')) markdown += '\n\n';

    markdown += `${texts.comparativeAnalysis}\n\n`;

    const addmAnomalies = analysisResult.categorizedAnomalies.addm || [];
    markdown += `${texts.addmSection}\n\n`;
    markdown += appendRecommendations(
        generateAddmSection(addmAnomalies, coreReports, baselineReports, texts),
        generateAddmRecommendations(addmAnomalies, language),
        recommendationBundle
    );

    const connectionAnomalies = analysisResult.categorizedAnomalies.connection || [];
    markdown += `${texts.connectionSection}\n\n`;
    markdown += appendRecommendations(
        generateConnectionSection(connectionAnomalies, coreReports, baselineReports, texts, language),
        generateConnectionRecommendations(connectionAnomalies, language),
        recommendationBundle
    );

    const loadAnomalies = analysisResult.categorizedAnomalies.load || [];
    markdown += `${texts.loadSection}\n\n`;
    markdown += appendRecommendations(
        generateMetricSection(loadAnomalies, texts.noLoadAnomalies, texts),
        generateLoadRecommendations(loadAnomalies, language),
        recommendationBundle
    );

    const waitAnomalies = analysisResult.categorizedAnomalies.waitEvents || [];
    markdown += `${texts.waitSection}\n\n`;
    markdown += appendRecommendations(
        generateWaitEventsSection(waitAnomalies, coreReports, baselineReports, texts),
        generateWaitRecommendations(waitAnomalies, coreReports, baselineReports, language),
        recommendationBundle
    );

    const slowSqlTables = analysisResult.sqlDimensionTables?.slowSQL || [];
    markdown += `${texts.slowSqlSection}\n\n`;
    markdown += appendRecommendations(
        generateSqlDimensionSection(slowSqlTables, texts.noSlowSqlTables, texts),
        generateSlowSqlRecommendations(slowSqlTables, language),
        recommendationBundle
    );

    const highFreqTables = analysisResult.sqlDimensionTables?.highFreqSQL || [];
    markdown += `${texts.highFreqSqlSection}\n\n`;
    markdown += appendRecommendations(
        generateSqlDimensionSection(highFreqTables, texts.noHighFreqSqlTables, texts),
        generateHighFreqSqlRecommendations(highFreqTables, language),
        recommendationBundle
    );

    const multiDimensionalSqlRows = buildMultiDimensionalSqlRows(slowSqlTables, highFreqTables, coreReports, baselineReports, language);
    markdown += `${texts.multiDimSqlSection}\n\n`;
    markdown += appendRecommendations(
        generateMultiDimensionalSqlSection(multiDimensionalSqlRows, texts, language),
        generateMultiDimensionalSqlRecommendations(multiDimensionalSqlRows, language),
        recommendationBundle
    );

    const efficiencyAnomalies = analysisResult.categorizedAnomalies.efficiency || [];
    markdown += `${texts.efficiencySection}\n\n`;
    markdown += appendRecommendations(
        generatePercentSection(efficiencyAnomalies, texts.noEfficiencyAnomalies, texts),
        generateEfficiencyRecommendations(efficiencyAnomalies, language),
        recommendationBundle
    );

    const resourceAnomalies = analysisResult.categorizedAnomalies.resources || [];
    markdown += `${texts.resourcesSection}\n\n`;
    markdown += appendRecommendations(
        generatePercentSection(resourceAnomalies, texts.noResourceAnomalies, texts),
        generateResourceRecommendations(resourceAnomalies, language),
        recommendationBundle
    );

    markdown += generateIncidentConclusionSection(
        analysisResult,
        coreReports,
        baselineReports,
        slowSqlTables,
        highFreqTables,
        multiDimensionalSqlRows,
        language
    );

    markdown += `${texts.anomalySummary}\n\n`;
    markdown += generateSummarySection(analysisResult, texts, {
        multiDimensionalSQL: multiDimensionalSqlRows.length
    });

    markdown += `${texts.sqlAppendix}\n\n`;
    if (includeSqlAppendix) {
        markdown += generateSQLAppendix(analysisResult.problemSQLs || [], coreReports, baselineReports, texts, language);
    } else {
        markdown += `${buildSplitAppendixNotice(language, options.sqlAppendixFileName)}\n\n`;
    }

    return markdown;
}

function generateAddmSection(anomalies, coreReports, baselineReports, texts) {
    const hasAddmData = [...coreReports, ...baselineReports].some(report => (report.addmFindings || []).length > 0);
    if (!hasAddmData) {
        return `${texts.noAddmData}\n\n`;
    }

    if (anomalies.length === 0) {
        return `${texts.noAddmDifferences}\n\n`;
    }

    const statusMap = {
        new_finding: `**${texts.newStatus}**`,
        worsened: `**${texts.worsenedStatus}**`,
        improved: texts.improvedStatus,
        disappeared: texts.improvedStatus
    };

    let markdown = `| ${texts.addmFinding} | ${texts.coreAas} | ${texts.baselineAas} | ${texts.change} | ${texts.status} | ${texts.description} |\n`;
    markdown += '|---------|----------|--------------|--------|--------|-------------|\n';

    for (const anomaly of anomalies) {
        markdown += `| ${anomaly.metric} | ${formatNumber(anomaly.coreValue)} | ${formatNumber(anomaly.baselineValue)} | ${formatChangeRate(anomaly.changeRate)} | ${statusMap[anomaly.type] || texts.stableStatus} | ${anomaly.description} |\n`;
    }

    return `${markdown}\n`;
}

function generateMetricSection(anomalies, emptyMessage, texts) {
    if (anomalies.length === 0) {
        return `${emptyMessage}\n\n`;
    }

    let markdown = `| ${texts.metric} | ${texts.coreValue} | ${texts.baselineAverage} | ${texts.change} | ${texts.severity} | ${texts.description} |\n`;
    markdown += '|--------|------------|------------------|--------|----------|-------------|\n';

    for (const anomaly of anomalies) {
        const severity = anomaly.severity === 'high' ? `**${texts.highLabel}**` : texts.mediumLabel;
        markdown += `| ${anomaly.metric} | ${formatNumber(anomaly.coreValue)} | ${formatNumber(anomaly.baselineValue)} | ${formatChangeRate(anomaly.changeRate)} | ${severity} | ${anomaly.description} |\n`;
    }

    return `${markdown}\n`;
}

function generateConnectionEvidenceSection(coreReports, baselineReports, texts, language) {
    const localizedLanguage = detectReportLanguage(language);
    const isChinese = localizedLanguage === 'zh-CN';
    const labels = isChinese
        ? {
            intro: '从登录建立速率、登录/登出累计量、窗口末在线会话数与心跳 SQL 四类指标看，核心时段未见“连接风暴”特征。',
            caveatSuffix: '如业务侧同时存在连通性报错，建议结合应用连接池和监听日志复核。',
            scope: '范围',
            metric: '指标',
            coreValue: '核心值',
            baselineValue: '基线均值 / 区间',
            change: '变化',
            description: '说明',
            wholeDb: '全库',
            endingSessions: '窗口末在线会话数',
            heartbeatScope: '高频 SQL',
            heartbeatMetric: 'SELECT 1 FROM DUAL 执行量'
        }
        : {
            intro: 'Across login rate, cumulative logons/logouts, ending session counts, and heartbeat SQL, the core windows do not show a connection-storm pattern.',
            caveatSuffix: 'If the application also reported connectivity errors, validate this against pool, listener, and service logs.',
            scope: 'Scope',
            metric: 'Metric',
            coreValue: 'Core Value',
            baselineValue: 'Baseline Avg / Range',
            change: 'Change',
            description: 'Description',
            wholeDb: 'Cluster',
            endingSessions: 'Ending Sessions',
            heartbeatScope: 'High-Freq SQL',
            heartbeatMetric: 'SELECT 1 FROM DUAL Executions'
        };

    const rows = [];
    const caveats = [];

    function pushRow(scope, metric, coreValue, baselineDisplay, changeRate, description) {
        rows.push({ scope, metric, coreValue, baselineDisplay, changeRate, description });
    }

    const coreLogonsPerSec = averageNumbers(coreReports.map(report => getLoadMetricValue(report, 'Logons/s')));
    const baselineLogonsPerSec = averageNumbers(baselineReports.map(report => getLoadMetricValue(report, 'Logons/s')));
    if (coreLogonsPerSec !== null && baselineLogonsPerSec !== null) {
        const changeRate = calculateChangeRate(coreLogonsPerSec, baselineLogonsPerSec);
        pushRow(
            labels.wholeDb,
            'Logons/s',
            coreLogonsPerSec,
            formatNumber(baselineLogonsPerSec),
            changeRate,
            changeRate !== null && changeRate <= 0
                ? (isChinese ? '核心时段登录建立速率低于基线，不支持短时连接暴增' : 'Login creation rate is below baseline, which does not support a short-lived connection surge.')
                : (isChinese ? '登录建立速率略高于基线，但未达到连接风暴阈值' : 'Login creation rate is above baseline, but still below the connection-storm threshold.')
        );
    }

    const coreLogonsCumulative = averageNumbers(coreReports.map(report => report?.instanceActivityStats?.userLogonsCumulative));
    const baselineLogonsCumulative = averageNumbers(baselineReports.map(report => report?.instanceActivityStats?.userLogonsCumulative));
    if (coreLogonsCumulative !== null && baselineLogonsCumulative !== null) {
        const changeRate = calculateChangeRate(coreLogonsCumulative, baselineLogonsCumulative);
        pushRow(
            labels.wholeDb,
            'userLogons cumulative',
            coreLogonsCumulative,
            formatNumber(baselineLogonsCumulative),
            changeRate,
            changeRate !== null && changeRate <= 0
                ? (isChinese ? '登录累计量低于基线' : 'Cumulative logons are below baseline.')
                : (isChinese ? '登录累计量高于基线，但未单独构成连接风暴证据' : 'Cumulative logons are above baseline, but not enough on their own to prove a connection storm.')
        );
    }

    const coreLogoutsCumulative = averageNumbers(coreReports.map(report => report?.instanceActivityStats?.userLogoutsCumulative));
    const baselineLogoutsCumulative = averageNumbers(baselineReports.map(report => report?.instanceActivityStats?.userLogoutsCumulative));
    if (coreLogoutsCumulative !== null && baselineLogoutsCumulative !== null) {
        const changeRate = calculateChangeRate(coreLogoutsCumulative, baselineLogoutsCumulative);
        pushRow(
            labels.wholeDb,
            'userLogouts cumulative',
            coreLogoutsCumulative,
            formatNumber(baselineLogoutsCumulative),
            changeRate,
            changeRate !== null && changeRate <= 0
                ? (isChinese ? '登出累计量低于基线，未见频繁连断放大' : 'Cumulative logouts are below baseline, with no sign of amplified disconnect/reconnect churn.')
                : (isChinese ? '登出累计量高于基线，建议继续观察是否存在重连放大' : 'Cumulative logouts are above baseline; continue watching for retry or reconnect amplification.')
        );
    }

    const instanceNames = uniqueStrings([...coreReports, ...baselineReports].map(report => report?.header?.instance || report?.instance).filter(Boolean));
    for (const instanceName of instanceNames) {
        const coreInstanceReports = coreReports.filter(report => (report?.header?.instance || report?.instance) === instanceName);
        const baselineInstanceReports = baselineReports.filter(report => (report?.header?.instance || report?.instance) === instanceName);
        const coreSessions = coreInstanceReports.map(getSessionEndingValue).filter(value => value !== null);
        const baselineSessions = baselineInstanceReports.map(getSessionEndingValue).filter(value => value !== null);

        if (coreSessions.length === 0 || baselineSessions.length === 0) continue;

        const avgCoreSessions = averageNumbers(coreSessions);
        const avgBaselineSessions = averageNumbers(baselineSessions);
        const baselineMin = Math.min(...baselineSessions);
        const baselineMax = Math.max(...baselineSessions);
        const baselineDisplay = baselineMin === baselineMax
            ? formatNumber(avgBaselineSessions)
            : `${formatNumber(avgBaselineSessions)} (${formatNumber(baselineMin)}-${formatNumber(baselineMax)})`;
        const changeRate = calculateChangeRate(avgCoreSessions, avgBaselineSessions);

        pushRow(
            instanceName,
            labels.endingSessions,
            avgCoreSessions,
            baselineDisplay,
            changeRate,
            changeRate !== null && Math.abs(changeRate) < 5
                ? (isChinese ? '与基线基本持平' : 'Essentially flat versus baseline.')
                : (changeRate !== null && changeRate > 0
                    ? (isChinese ? '高于基线，建议继续观察是否持续抬升' : 'Above baseline; continue watching whether it keeps rising.')
                    : (isChinese ? '低于基线，更像会话收缩或流量回落' : 'Below baseline, which looks more like session contraction or traffic retreat.'))
        );

        if (coreSessions.some(value => value > baselineMax)) {
            caveats.push(
                isChinese
                    ? `${instanceName} 的部分窗口末在线会话数高于同实例基线区间，建议结合应用连接池继续观察是否还有局部连接堆积。`
                    : `Some ending session counts for ${instanceName} exceed the same-instance baseline range; continue watching the application pool for localized connection buildup.`
            );
        }

        if (coreSessions.some(value => value < baselineMin)) {
            caveats.push(
                isChinese
                    ? `${instanceName} 的部分窗口末在线会话数低于同实例基线区间，更像会话收缩或服务切换，而不是连接暴涨。`
                    : `Some ending session counts for ${instanceName} fell below the same-instance baseline range, which looks more like session contraction or service movement than a connection surge.`
            );
        }
    }

    const coreHeartbeatExecutions = averageNumbers(coreReports.map(report => getHeartbeatExecutions(report)));
    const baselineHeartbeatExecutions = averageNumbers(baselineReports.map(report => getHeartbeatExecutions(report)));
    if (coreHeartbeatExecutions !== null && baselineHeartbeatExecutions !== null) {
        const changeRate = calculateChangeRate(coreHeartbeatExecutions, baselineHeartbeatExecutions);
        pushRow(
            labels.heartbeatScope,
            labels.heartbeatMetric,
            coreHeartbeatExecutions,
            formatNumber(baselineHeartbeatExecutions),
            changeRate,
            changeRate !== null && changeRate <= 0
                ? (isChinese ? '心跳 SQL 未放大，不支持连接池抖动' : 'Heartbeat SQL is not amplified, which does not support a pool-thrashing hypothesis.')
                : (isChinese ? '心跳 SQL 略有放大，建议结合连接池日志继续核对' : 'Heartbeat SQL is somewhat amplified; validate it against pool logs before drawing a connection conclusion.')
        );
    }

    if (rows.length === 0) {
        return `${texts.noConnectionAnomalies}\n\n`;
    }

    let markdown = `${labels.intro}\n\n`;
    markdown += `| ${labels.scope} | ${labels.metric} | ${labels.coreValue} | ${labels.baselineValue} | ${labels.change} | ${labels.description} |\n`;
    markdown += '|------|------|--------|------------------|------|------|\n';

    for (const row of rows) {
        markdown += `| ${row.scope} | ${row.metric} | ${formatNumber(row.coreValue)} | ${row.baselineDisplay} | ${row.changeRate === null ? 'N/A' : formatChangeRate(row.changeRate)} | ${row.description} |\n`;
    }

    return `${markdown}\n`;
}

function generateConnectionSection(anomalies, coreReports, baselineReports, texts, language) {
    if (anomalies.length > 0) {
        return generateMetricSection(anomalies, texts.noConnectionAnomalies, texts);
    }

    return generateConnectionEvidenceSection(coreReports, baselineReports, texts, language);
}

function generateWaitEventsSection(anomalies, coreReports, baselineReports, texts) {
    const hasWaitData = [...coreReports, ...baselineReports].some(report => (report.topEvents || []).length > 0);
    if (!hasWaitData) {
        return `${texts.noWaitData}\n\n`;
    }

    if (anomalies.length === 0) {
        return `${texts.noWaitAnomalies}\n\n`;
    }

    let markdown = '';
    const newEvents = anomalies.filter(anomaly => anomaly.type === 'new_event');
    const worsened = anomalies.filter(anomaly => ['worsened', 'avg_wait_increase'].includes(anomaly.type));
    const specialEvents = anomalies.filter(anomaly => ['lock_event', 'latch_event', 'gc_event', 'log_sync_slow', 'seq_read_slow'].includes(anomaly.type));

    if (newEvents.length > 0) {
        markdown += `#### ${texts.waitNewTop10}\n\n`;
        markdown += `| ${texts.waitEvent} | %DB Time |\n`;
        markdown += '|------------|----------|\n';
        for (const event of newEvents) {
            markdown += `| ${event.metric} | ${formatPercent(event.coreValue)} |\n`;
        }
        markdown += '\n';
    }

    if (worsened.length > 0) {
        markdown += `#### ${texts.waitWorsened}\n\n`;
        markdown += `| ${texts.waitEvent} | ${texts.coreValue} | ${texts.baselineAverage} | ${texts.change} | ${texts.description} |\n`;
        markdown += '|------------|------------|------------------|--------|-------------|\n';
        for (const event of worsened) {
            markdown += `| ${event.metric} | ${formatNumber(event.coreValue)} | ${formatNumber(event.baselineValue)} | ${formatChangeRate(event.changeRate)} | ${event.description} |\n`;
        }
        markdown += '\n';
    }

    if (specialEvents.length > 0) {
        markdown += `#### ${texts.waitSpecial}\n\n`;
        markdown += `| ${texts.waitEvent} | ${texts.status} | ${texts.coreValue} | ${texts.description} |\n`;
        markdown += '|------------|--------|------------|-------------|\n';
        for (const event of specialEvents) {
            markdown += `| ${event.metric} | ${texts.waitTypeLabels[event.type] || event.type} | ${formatNumber(event.coreValue)} | ${event.description} |\n`;
        }
        markdown += '\n';
    }

    return markdown || `${texts.noWaitAnomalies}\n\n`;
}

function formatSqlDimensionValue(value, valueFormat) {
    if (valueFormat === 'percent_ratio') {
        return value === null || value === undefined ? 'N/A' : `${(value * 100).toFixed(2)}%`;
    }
    return formatNumber(value);
}

function generateSqlDimensionSection(dimensionTables, emptyMessage, texts) {
    if (!dimensionTables || dimensionTables.length === 0) {
        return `${emptyMessage}\n\n`;
    }

    let markdown = '';

    for (const table of dimensionTables) {
        const rows = (table.rows || []).filter(row => row.sqlModule);
        if (rows.length === 0) continue;

        markdown += `#### ${texts.dimensionLabels[table.dimension] || table.dimension}\n\n`;
        markdown += `| ${texts.sqlId} | ${texts.module} | ${texts.newOrExisting} | ${texts.coreValue} | ${texts.baselineAverage} | ${texts.changePercent} | ${texts.severity} |\n`;
        markdown += '|--------|--------|-----------------|------------|------------------|----------------|----------|\n';

        for (const row of rows) {
            const severity = row.severity === 'high' ? `**${texts.highLabel}**` : texts.mediumLabel;
            const status = row.status === 'New' ? texts.newStatus : texts.existingStatus;
            markdown += `| [${row.sqlId}](#sql-${row.sqlId}) | ${row.sqlModule} | ${status} | ${formatSqlDimensionValue(row.coreValue, row.valueFormat)} | ${formatSqlDimensionValue(row.baselineValue, row.valueFormat)} | ${formatChangeRate(row.changeRate)} | ${severity} |\n`;
        }

        markdown += '\n';
    }

    return markdown || `${emptyMessage}\n\n`;
}

function generatePercentSection(anomalies, emptyMessage, texts) {
    if (anomalies.length === 0) {
        return `${emptyMessage}\n\n`;
    }

    let markdown = `| ${texts.metric} | ${texts.coreValue} | ${texts.baselineValue} | ${texts.change} | ${texts.description} |\n`;
    markdown += '|--------|------------|----------------|--------|-------------|\n';

    for (const anomaly of anomalies) {
        markdown += `| ${anomaly.metric} | ${formatPercent(anomaly.coreValue)} | ${formatPercent(anomaly.baselineValue)} | ${formatChangeRate(anomaly.changeRate)} | ${anomaly.description} |\n`;
    }

    return `${markdown}\n`;
}

function generateSummarySection(analysisResult, texts, extras = {}) {
    const categories = [
        { name: texts.categories.addm, key: 'addm' },
        { name: texts.categories.connection, key: 'connection' },
        { name: texts.categories.load, key: 'load' },
        { name: texts.categories.waitEvents, key: 'waitEvents' },
        { name: texts.categories.slowSQL, key: 'slowSQL' },
        { name: texts.categories.highFreqSQL, key: 'highFreqSQL' },
        { name: texts.categories.multiDimensionalSQL, key: 'multiDimensionalSQL' },
        { name: texts.categories.efficiency, key: 'efficiency' },
        { name: texts.categories.resources, key: 'resources' }
    ];

    let markdown = `| ${texts.category} | ${texts.anomalies} | ${texts.highSeverity} |\n`;
    markdown += '|----------|-----------|---------------|\n';

    for (const category of categories) {
        if (category.key === 'multiDimensionalSQL') {
            markdown += `| ${category.name} | ${extras.multiDimensionalSQL || 0} | 0 |\n`;
            continue;
        }

        const anomalies = analysisResult.categorizedAnomalies[category.key] || [];
        const highSeverityCount = anomalies.filter(anomaly => anomaly.severity === 'high').length;
        markdown += `| ${category.name} | ${anomalies.length} | ${highSeverityCount} |\n`;
    }

    markdown += `\n${texts.summarySentence(analysisResult.summary.totalAnomalies, analysisResult.summary.highSeverity, analysisResult.summary.mediumSeverity)}\n\n`;
    return markdown;
}

function generateSQLAppendix(problemSQLs, coreReports, baselineReports, texts, language) {
    if (!problemSQLs || problemSQLs.length === 0) {
        return `${texts.noProblemSql}\n\n`;
    }

    const sqlTextMap = new Map();

    for (const report of [...coreReports, ...baselineReports]) {
        if (!report.sqlTextMap) continue;
        for (const [sqlId, sqlText] of Object.entries(report.sqlTextMap)) {
            if (!sqlTextMap.has(sqlId)) {
                sqlTextMap.set(sqlId, sqlText);
            }
        }
    }

    let markdown = '';
    const sortedSQL = [...problemSQLs].sort((left, right) => left.sqlId.localeCompare(right.sqlId));

    for (const sql of sortedSQL) {
        markdown += `### ${texts.sqlId}: ${sql.sqlId} <a id="sql-${sql.sqlId}"></a>\n\n`;
        const localizedTypes = (sql.types || []).map(type => localizeSqlType(type, language));
        const localizedDimensions = (sql.dimensions || []).map(dimension => localizeSqlDimension(dimension, language));
        markdown += `- **${texts.sourceModules}**: ${sql.modules?.join(', ') || 'N/A'}\n`;
        markdown += `- **${texts.issueTypes}**: ${localizedTypes.join(', ') || 'N/A'}\n`;
        markdown += `- **${texts.relatedDimensions}**: ${localizedDimensions.join(', ') || 'N/A'}\n\n`;

        const fullText = sqlTextMap.get(sql.sqlId);
        if (fullText) {
            markdown += '```sql\n';
            markdown += `${fullText}\n`;
            markdown += '```\n\n';
        } else {
            markdown += `*${texts.sqlTextNotFound}*\n\n`;
        }
    }

    return markdown;
}

function generateStandaloneSqlAppendix(analysisResult, coreReports, baselineReports, options = {}) {
    const language = detectReportLanguage(options.language);
    const texts = getReportTexts(language);
    return generateSQLAppendix(analysisResult.problemSQLs || [], coreReports, baselineReports, texts, language);
}

function saveReport(content, outputPath) {
    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(`Report saved to: ${outputPath}`);
}

module.exports = {
    generateMarkdownReport,
    generateWordReport,
    generateStandaloneSqlAppendix,
    formatNumber,
    formatPercent,
    formatChangeRate,
    truncateSQLText,
    formatTime,
    saveReport
};
