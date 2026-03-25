#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const { scanAWRDirectory, parseAWRReport } = require('./awr-parser');
const { analyzeReports } = require('./core-detector');
const { parseReportDeeply, parseReportByDimension } = require('./deep-parser');
const { performFullAnalysis } = require('./analyzer');
const { generateMarkdownReport, generateWordReport, generateStandaloneSqlAppendix, saveReport } = require('./report-generator');
const { renderMarkdownFileToDocx } = require('./report-renderer');
const { detectReportLanguage, getLanguageSuffix } = require('./localization');

function resolveDirectories(directory, baseline) {
    const directories = [path.resolve(directory)];
    if (baseline) {
        const baselineDirs = baseline.split(',').map(item => item.trim()).filter(Boolean);
        for (const baselineDir of baselineDirs) {
            directories.push(path.resolve(baselineDir));
        }
    }
    return directories;
}

function ensureDirectoriesExist(directories) {
    for (const directory of directories) {
        if (!fs.existsSync(directory)) {
            throw new Error(`Directory does not exist: ${directory}`);
        }
    }
}

function collectReports(directories) {
    let reports = [];
    for (const directory of directories) {
        reports = reports.concat(scanAWRDirectory(directory));
    }
    return reports;
}

function buildDimensionOutputs(reports, verbose) {
    const outputs = {
        summary: [],
        sessions: [],
        load: [],
        waits: [],
        slowSQL: [],
        freqSQL: [],
        efficiency: [],
        resources: [],
        sqlTextMap: {}
    };

    for (const report of reports) {
        try {
            const dimensionData = parseReportByDimension(report.filePath);
            outputs.summary.push(dimensionData.summary);
            outputs.sessions.push(dimensionData.sessions);
            outputs.load.push(dimensionData.load);
            outputs.waits.push(dimensionData.waits);
            outputs.slowSQL.push(dimensionData.slowSQL);
            outputs.freqSQL.push(dimensionData.freqSQL);
            outputs.efficiency.push(dimensionData.efficiency);
            outputs.resources.push(dimensionData.resources);
            Object.assign(outputs.sqlTextMap, dimensionData.sqlTextMap);

            if (verbose) {
                console.log(`  Parsed by dimension: ${report.fileName}`);
            }
        } catch (error) {
            if (verbose) {
                console.error(`  Failed to parse ${report.fileName}: ${error.message}`);
            }
        }
    }

    return outputs;
}

function writeReadOutputs(outputDir, scanResult, reports, dimensionOutputs) {
    const coreBaselineData = {
        problemTime: scanResult.problemTimeStr,
        parsedProblemTime: scanResult.problemTime,
        coreAWRs: scanResult.coreAWRs.map(report => ({
            fileName: report.fileName,
            instance: report.instance,
            beginSnapTime: report.beginSnapTime,
            endSnapTime: report.endSnapTime,
            dbTimeMinutes: report.dbTimeMinutes
        })),
        baselineAWRs: scanResult.baselineAWRs.map(report => ({
            fileName: report.fileName,
            instance: report.instance,
            beginSnapTime: report.beginSnapTime,
            endSnapTime: report.endSnapTime,
            dbTimeMinutes: report.dbTimeMinutes
        })),
        crossDayBaselines: (scanResult.crossDayBaselines || []).map(report => ({
            fileName: report.fileName,
            instance: report.instance,
            beginSnapTime: report.beginSnapTime,
            endSnapTime: report.endSnapTime
        }))
    };

    fs.writeFileSync(path.join(outputDir, 'awr_core_baseline.json'), JSON.stringify(coreBaselineData, null, 2), 'utf-8');
    console.log('  - awr_core_baseline.json');

    fs.writeFileSync(path.join(outputDir, 'awr_summary.json'), JSON.stringify(dimensionOutputs.summary, null, 2), 'utf-8');
    console.log('  - awr_summary.json');

    fs.writeFileSync(path.join(outputDir, 'awr_sessions.json'), JSON.stringify(dimensionOutputs.sessions, null, 2), 'utf-8');
    console.log('  - awr_sessions.json');

    fs.writeFileSync(path.join(outputDir, 'awr_load.json'), JSON.stringify(dimensionOutputs.load, null, 2), 'utf-8');
    console.log('  - awr_load.json');

    fs.writeFileSync(path.join(outputDir, 'awr_waits.json'), JSON.stringify(dimensionOutputs.waits, null, 2), 'utf-8');
    console.log('  - awr_waits.json');

    fs.writeFileSync(path.join(outputDir, 'awr_slow_sql.json'), JSON.stringify(dimensionOutputs.slowSQL, null, 2), 'utf-8');
    console.log('  - awr_slow_sql.json');

    fs.writeFileSync(path.join(outputDir, 'awr_freq_sql.json'), JSON.stringify(dimensionOutputs.freqSQL, null, 2), 'utf-8');
    console.log('  - awr_freq_sql.json');

    fs.writeFileSync(path.join(outputDir, 'awr_efficiency.json'), JSON.stringify(dimensionOutputs.efficiency, null, 2), 'utf-8');
    console.log('  - awr_efficiency.json');

    fs.writeFileSync(path.join(outputDir, 'awr_resources.json'), JSON.stringify(dimensionOutputs.resources, null, 2), 'utf-8');
    console.log('  - awr_resources.json');

    const coreSqlTextMap = {};

    for (const coreReport of scanResult.coreAWRs) {
        const slowSqlData = dimensionOutputs.slowSQL.find(item => item.fileName === coreReport.fileName);
        if (slowSqlData) {
            const sqlIds = new Set();
            (slowSqlData.sqlByElapsed || []).forEach(sql => sqlIds.add(sql.sqlId));
            (slowSqlData.sqlByCPU || []).forEach(sql => sqlIds.add(sql.sqlId));
            (slowSqlData.sqlByIOWait || []).forEach(sql => sqlIds.add(sql.sqlId));
            (slowSqlData.sqlByGets || []).forEach(sql => sqlIds.add(sql.sqlId));
            (slowSqlData.sqlByReads || []).forEach(sql => sqlIds.add(sql.sqlId));
            (slowSqlData.sqlByCluster || []).forEach(sql => sqlIds.add(sql.sqlId));

            for (const sqlId of sqlIds) {
                if (dimensionOutputs.sqlTextMap[sqlId]) {
                    coreSqlTextMap[sqlId] = dimensionOutputs.sqlTextMap[sqlId];
                }
            }
        }

        const freqSqlData = dimensionOutputs.freqSQL.find(item => item.fileName === coreReport.fileName);
        if (freqSqlData) {
            const sqlIds = new Set();
            (freqSqlData.sqlByExecutions || []).forEach(sql => sqlIds.add(sql.sqlId));
            (freqSqlData.sqlByParseCalls || []).forEach(sql => sqlIds.add(sql.sqlId));

            for (const sqlId of sqlIds) {
                if (dimensionOutputs.sqlTextMap[sqlId]) {
                    coreSqlTextMap[sqlId] = dimensionOutputs.sqlTextMap[sqlId];
                }
            }
        }
    }

    fs.writeFileSync(path.join(outputDir, 'awr_sql_text.json'), JSON.stringify(coreSqlTextMap, null, 2), 'utf-8');
    console.log('  - awr_sql_text.json');
}

function uniqueReports(reports) {
    const reportMap = new Map();
    for (const report of reports) {
        if (!reportMap.has(report.fileName)) {
            reportMap.set(report.fileName, report);
        }
    }
    return Array.from(reportMap.values());
}

function loadDetailedReports(reports, verbose) {
    const detailedReports = [];

    for (const report of reports) {
        const detailedReport = parseReportDeeply(report.filePath);
        const dimensionReport = parseReportByDimension(report.filePath);

        const mergedSessions = {
            ...(detailedReport.sessions || {}),
            ...(dimensionReport.sessions?.sessionsInfo || {}),
            instanceActivityStats: dimensionReport.sessions?.instanceActivityStats || {}
        };

        detailedReport.filePath = report.filePath;
        detailedReport.fileName = report.fileName;
        detailedReport.instance = report.instance;
        detailedReport.beginSnapTime = report.beginSnapTime;
        detailedReport.endSnapTime = report.endSnapTime;
        detailedReport.dbTimeMinutes = report.dbTimeMinutes;
        detailedReport.header = detailedReport.header || dimensionReport.summary?.header || null;
        detailedReport.snapshots = detailedReport.snapshots || dimensionReport.summary?.snapshots || null;
        detailedReport.addmFindings = (detailedReport.addmFindings && detailedReport.addmFindings.length > 0)
            ? detailedReport.addmFindings
            : (dimensionReport.summary?.addmFindings || []);
        detailedReport.loadProfile = Object.keys(detailedReport.loadProfile || {}).length > 0
            ? detailedReport.loadProfile
            : (dimensionReport.load?.loadProfile || {});
        detailedReport.topEvents = (detailedReport.topEvents && detailedReport.topEvents.length > 0)
            ? detailedReport.topEvents
            : (dimensionReport.waits?.topEvents || []);
        detailedReport.waitClasses = (detailedReport.waitClasses && detailedReport.waitClasses.length > 0)
            ? detailedReport.waitClasses
            : (dimensionReport.waits?.waitClasses || []);
        detailedReport.hostCpu = Object.keys(detailedReport.hostCpu || {}).length > 0
            ? detailedReport.hostCpu
            : (dimensionReport.resources?.hostCPU || {});
        detailedReport.ioProfile = Object.keys(detailedReport.ioProfile || {}).length > 0
            ? detailedReport.ioProfile
            : (dimensionReport.resources?.ioProfile || {});
        detailedReport.memoryStats = Object.keys(detailedReport.memoryStats || {}).length > 0
            ? detailedReport.memoryStats
            : (dimensionReport.resources?.memoryStats || {});
        detailedReport.instanceEfficiency = Object.keys(detailedReport.instanceEfficiency || {}).length > 0
            ? detailedReport.instanceEfficiency
            : (dimensionReport.efficiency?.instanceEfficiency || {});
        detailedReport.sessions = mergedSessions;
        detailedReport.instanceActivityStats = dimensionReport.sessions?.instanceActivityStats || {};
        detailedReports.push(detailedReport);

        if (verbose) {
            console.log(`  Deep parsed: ${report.fileName}`);
        }
    }

    return detailedReports;
}

function formatProblemTimeForFilename(problemTime) {
    return problemTime
        .replace(/[^\d]/g, '')
        .slice(0, 12) || 'report';
}

function deriveAppendixPath(markdownPath) {
    if (/\.md$/i.test(markdownPath)) {
        return markdownPath.replace(/\.md$/i, '_appendix.md');
    }

    return `${markdownPath}_appendix.md`;
}

program
    .name('oracle-awr-analysis')
    .description('Oracle AWR report parser and report generator')
    .version('1.0.0');

program
    .command('read')
    .description('Read AWR reports and output raw parsed JSON artifacts')
    .option('-d, --directory <path>', 'Directory containing AWR reports', process.cwd())
    .option('-b, --baseline <path>', 'Optional baseline directories, comma-separated')
    .requiredOption('-t, --time <problemTime>', 'Problem time, for example 2026-03-19 10:00:00')
    .option('-o, --output <file>', 'Optional output JSON path used only to derive the output directory')
    .option('-v, --verbose', 'Print verbose progress output', false)
    .action(options => {
        try {
            const directories = resolveDirectories(options.directory, options.baseline);
            ensureDirectoriesExist(directories);

            console.log('========================================');
            console.log('Oracle AWR Report Reader');
            console.log('========================================');
            console.log(`Scan directories: ${directories.join(', ')}`);
            console.log(`Problem time: ${options.time}`);
            console.log('');

            console.log('Scanning AWR reports...');
            const reports = collectReports(directories);
            if (reports.length === 0) {
                throw new Error('No AWR report files were found. Expected names like awrrpt_{inst}_{begin_snap}_{end_snap}.html');
            }

            console.log(`Found ${reports.length} AWR reports`);
            console.log('');

            if (options.verbose) {
                console.log('Report list:');
                for (const report of reports) {
                    console.log(`  - ${report.fileName}`);
                    console.log(`    Instance: ${report.instance || 'N/A'}`);
                    console.log(`    Window: ${report.beginSnapTime?.toISOString() || 'N/A'} - ${report.endSnapTime?.toISOString() || 'N/A'}`);
                    console.log(`    DB Time: ${report.dbTimeMinutes || 'N/A'} minutes`);
                }
                console.log('');
            }

            console.log('Determining core AWR windows...');
            const scanResult = analyzeReports(reports, options.time);
            console.log('');
            console.log(`Core AWR windows: ${scanResult.coreAWRs.length}`);
            console.log(`Baseline AWR windows: ${scanResult.baselineAWRs.length}`);

            console.log('\nParsing reports by dimension...');
            const dimensionOutputs = buildDimensionOutputs(reports, options.verbose);
            const outputDir = options.output ? path.dirname(path.resolve(options.output)) : directories[0];
            writeReadOutputs(outputDir, scanResult, reports, dimensionOutputs);

            console.log('');
            console.log('========================================');
            console.log('Read completed');
            console.log('========================================');
            console.log(`Output directory: ${outputDir}`);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            if (options.verbose) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    });

program
    .command('parse <file>')
    .description('Parse a single AWR report file')
    .option('-o, --output <file>', 'Optional output JSON file path')
    .option('--deep', 'Run deep parsing', false)
    .action((file, options) => {
        try {
            const filePath = path.resolve(file);
            if (!fs.existsSync(filePath)) {
                throw new Error(`File does not exist: ${filePath}`);
            }

            console.log(`Parsing: ${filePath}`);

            let output;
            if (options.deep) {
                const report = parseReportDeeply(filePath);
                output = {
                    fileName: report.fileName,
                    header: report.header,
                    snapshots: report.snapshots,
                    loadProfile: report.loadProfile,
                    topEvents: report.topEvents,
                    waitClasses: report.waitClasses,
                    hostCpu: report.hostCpu,
                    instanceEfficiency: report.instanceEfficiency,
                    ioProfile: report.ioProfile,
                    memoryStats: report.memoryStats,
                    addmFindings: report.addmFindings,
                    sqlByElapsed: report.sqlByElapsed,
                    sqlByCPU: report.sqlByCPU,
                    sqlByExecutions: report.sqlByExecutions,
                    sqlByParseCalls: report.sqlByParseCalls,
                    sqlByCluster: report.sqlByCluster,
                    timeModelStats: report.timeModelStats,
                    sessions: report.sessions,
                    sqlTextMap: report.sqlTextMap
                };
            } else {
                const report = parseAWRReport(filePath);
                output = {
                    fileName: report.fileName,
                    header: report.header,
                    snapshots: report.snapshots,
                    loadProfile: report.loadProfile,
                    topEvents: report.topEvents,
                    waitClasses: report.waitClasses,
                    hostCpu: report.hostCpu,
                    instanceEfficiency: report.instanceEfficiency,
                    ioProfile: report.ioProfile,
                    memoryStats: report.memoryStats,
                    addmFindings: report.addmFindings
                };
            }

            if (options.output) {
                const outputPath = path.resolve(options.output);
                fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
                console.log(`Result saved to: ${outputPath}`);
            } else {
                console.log(JSON.stringify(output, null, 2));
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('list [directory]')
    .description('List AWR report files recursively')
    .action(directory => {
        try {
            const rootDir = directory ? path.resolve(directory) : process.cwd();
            if (!fs.existsSync(rootDir)) {
                throw new Error(`Directory does not exist: ${rootDir}`);
            }

            const awrPattern = /^awrrpt_\d+_\d+_\d+\.html$/i;
            const awrFiles = [];

            function scanDirectory(currentDir) {
                for (const item of fs.readdirSync(currentDir)) {
                    const itemPath = path.join(currentDir, item);
                    const stat = fs.statSync(itemPath);
                    if (stat.isDirectory()) {
                        scanDirectory(itemPath);
                    } else if (stat.isFile() && awrPattern.test(item)) {
                        awrFiles.push({ name: item, path: itemPath });
                    }
                }
            }

            scanDirectory(rootDir);
            console.log(`Directory: ${rootDir}`);
            console.log(`AWR report count: ${awrFiles.length}`);
            console.log('');

            for (const file of awrFiles) {
                console.log(`  ${path.relative(rootDir, file.path)}`);
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('parse-sql <file> <sqlId>')
    .description('Extract full SQL text for a SQL ID from an AWR report')
    .option('-o, --output <file>', 'Optional output JSON file path')
    .option('-v, --verbose', 'Print verbose progress output', false)
    .action((file, sqlId, options) => {
        try {
            const filePath = path.resolve(file);
            if (!fs.existsSync(filePath)) {
                throw new Error(`File does not exist: ${filePath}`);
            }

            console.log(`Parsing: ${filePath}`);
            console.log(`Looking for SQL ID: ${sqlId}`);
            const report = parseReportDeeply(filePath);

            if (options.verbose) {
                const sqlIds = Object.keys(report.sqlTextMap || {});
                console.log(`SQL text map size: ${sqlIds.length}`);
                console.log(`First 10 SQL IDs: ${sqlIds.slice(0, 10).join(', ')}`);
            }

            const output = {
                fileName: report.fileName,
                sqlId,
                sqlText: report.sqlTextMap?.[sqlId] || null,
                found: Boolean(report.sqlTextMap?.[sqlId]),
                sqlCount: Object.keys(report.sqlTextMap || {}).length
            };

            if (options.output) {
                const outputPath = path.resolve(options.output);
                fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
                console.log(`Result saved to: ${outputPath}`);
            } else {
                console.log(JSON.stringify(output, null, 2));
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('render-docx <markdownFile>')
    .description('Render a Word report directly from a Markdown report')
    .option('-o, --output <file>', 'Optional Word output path')
    .action(async (markdownFile, options) => {
        try {
            const inputPath = path.resolve(markdownFile);
            if (!fs.existsSync(inputPath)) {
                throw new Error(`Markdown file does not exist: ${inputPath}`);
            }

            const outputPath = options.output
                ? path.resolve(options.output)
                : inputPath.replace(/\.md$/i, '.docx');

            await renderMarkdownFileToDocx(inputPath, outputPath);
            console.log(`Word report saved to: ${outputPath}`);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('generate-report')
    .description('Generate a Markdown and Word report from AWR reports using the strict analysis workflow')
    .option('-d, --directory <path>', 'Directory containing AWR reports', process.cwd())
    .option('-b, --baseline <path>', 'Optional baseline directories, comma-separated')
    .option('-l, --language <language>', 'Optional report language override, for example zh-CN or en-US')
    .requiredOption('-t, --time <problemTime>', 'Problem time, for example 2026-03-19 10:00:00')
    .option('-m, --markdown <file>', 'Optional Markdown output path')
    .option('-w, --word <file>', 'Optional Word output path')
    .option('-v, --verbose', 'Print verbose progress output', false)
    .action(async options => {
        try {
            const directories = resolveDirectories(options.directory, options.baseline);
            ensureDirectoriesExist(directories);

            console.log('========================================');
            console.log('Oracle AWR Strict Report Generator');
            console.log('========================================');
            console.log(`Scan directories: ${directories.join(', ')}`);
            console.log(`Problem time: ${options.time}`);
            const reportLanguage = detectReportLanguage(options.language);
            console.log(`Report language: ${reportLanguage}`);
            console.log('');

            console.log('Scanning AWR reports...');
            const reports = collectReports(directories);
            if (reports.length === 0) {
                throw new Error('No AWR report files were found.');
            }
            console.log(`Found ${reports.length} AWR reports`);

            console.log('Determining core and baseline windows...');
            const scanResult = analyzeReports(reports, options.time, { language: reportLanguage });
            const baselineCandidates = uniqueReports([
                ...scanResult.baselineAWRs,
                ...(scanResult.crossDayBaselines || [])
            ]);

            console.log(`Core AWR windows: ${scanResult.coreAWRs.length}`);
            console.log(`Baseline AWR windows used for analysis: ${baselineCandidates.length}`);

            console.log('Deep parsing selected reports...');
            const coreReports = loadDetailedReports(scanResult.coreAWRs, options.verbose);
            const baselineReports = loadDetailedReports(baselineCandidates, options.verbose);

            console.log('Running strict anomaly analysis...');
            const analysisResult = performFullAnalysis(coreReports, baselineReports, { language: reportLanguage });

            const outputStem = formatProblemTimeForFilename(options.time);
            const languageSuffix = getLanguageSuffix(reportLanguage);
            const markdownPath = options.markdown
                ? path.resolve(options.markdown)
                : path.resolve(`awr_analysis_report_${outputStem}_${languageSuffix}.md`);
            const wordPath = options.word
                ? path.resolve(options.word)
                : path.resolve(`awr_analysis_report_${outputStem}_${languageSuffix}.docx`);
            const appendixMarkdownPath = deriveAppendixPath(markdownPath);

            console.log('Generating Markdown report...');
            const markdown = generateMarkdownReport(analysisResult, scanResult, coreReports, baselineReports, {
                language: reportLanguage,
                includeSqlAppendix: false,
                sqlAppendixFileName: path.basename(appendixMarkdownPath)
            });
            saveReport(markdown, markdownPath);
            const appendixMarkdown = generateStandaloneSqlAppendix(analysisResult, coreReports, baselineReports, {
                language: reportLanguage
            });
            saveReport(appendixMarkdown, appendixMarkdownPath);

            console.log('Generating Word report from Markdown...');
            await generateWordReport(analysisResult, scanResult, coreReports, baselineReports, wordPath, {
                language: reportLanguage,
                includeSqlAppendix: true
            });

            console.log('');
            console.log('========================================');
            console.log('Report generation completed');
            console.log('========================================');
            console.log(`Markdown: ${markdownPath}`);
            console.log(`SQL Appendix Markdown: ${appendixMarkdownPath}`);
            console.log(`Word: ${wordPath}`);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            if (options.verbose) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    });

program.parse();
