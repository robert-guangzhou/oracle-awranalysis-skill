const { detectReportLanguage, getReportTexts } = require('./localization');

function parseProblemTime(timeStr) {
    if (!timeStr) return null;

    const match1 = timeStr.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (match1) {
        return new Date(
            Number(match1[1]),
            Number(match1[2]) - 1,
            Number(match1[3]),
            Number(match1[4]),
            Number(match1[5]),
            Number(match1[6] || 0)
        );
    }

    const match2 = timeStr.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (match2) {
        return new Date(
            Number(match2[1]),
            Number(match2[2]) - 1,
            Number(match2[3]),
            Number(match2[4]),
            Number(match2[5]),
            Number(match2[6] || 0)
        );
    }

    const match3 = timeStr.match(/(\d{2})-(\d{2})-(\d{4})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (match3) {
        return new Date(
            Number(match3[3]),
            Number(match3[2]) - 1,
            Number(match3[1]),
            Number(match3[4]),
            Number(match3[5]),
            Number(match3[6] || 0)
        );
    }

    const match4 = timeStr.match(/(\d{4})\u5e74(\d{1,2})\u6708(\d{1,2})\u65e5\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match4) {
        return new Date(
            Number(match4[1]),
            Number(match4[2]) - 1,
            Number(match4[3]),
            Number(match4[4]),
            Number(match4[5]),
            Number(match4[6] || 0)
        );
    }

    const match5 = timeStr.match(/(\d{1,2})\u6708(\d{1,2})\u65e5\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match5) {
        const today = new Date();
        return new Date(
            today.getFullYear(),
            Number(match5[1]) - 1,
            Number(match5[2]),
            Number(match5[3]),
            Number(match5[4]),
            Number(match5[5] || 0)
        );
    }

    const simpleTime = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (simpleTime) {
        const today = new Date();
        return new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
            Number(simpleTime[1]),
            Number(simpleTime[2]),
            Number(simpleTime[3] || 0)
        );
    }

    return null;
}

function timeDiffInMinutes(date1, date2) {
    if (!date1 || !date2) return null;
    return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
}

function isTimeInRange(problemTime, beginTime, endTime) {
    if (!problemTime || !beginTime || !endTime) return false;
    return problemTime >= beginTime && problemTime <= endTime;
}

function determineCoreAWRs(reports, problemTimeStr) {
    const problemTime = parseProblemTime(problemTimeStr);

    if (!problemTime) {
        throw new Error(`Invalid problem time format: ${problemTimeStr}`);
    }

    const result = {
        problemTime,
        problemTimeStr,
        coreAWRs: [],
        baselineAWRs: [],
        groupedByInstance: {}
    };

    for (const report of reports) {
        const instance = report.instance || 'unknown';
        if (!result.groupedByInstance[instance]) {
            result.groupedByInstance[instance] = [];
        }
        result.groupedByInstance[instance].push(report);
    }

    for (const instance of Object.keys(result.groupedByInstance)) {
        result.groupedByInstance[instance].sort((left, right) => {
            const leftTime = left.beginSnapTime || new Date(0);
            const rightTime = right.beginSnapTime || new Date(0);
            return leftTime - rightTime;
        });
    }

    for (const instance of Object.keys(result.groupedByInstance)) {
        const instanceReports = result.groupedByInstance[instance];
        const coreForInstance = [];

        for (let index = 0; index < instanceReports.length; index += 1) {
            const report = instanceReports[index];
            if (!report.beginSnapTime || !report.endSnapTime) continue;

            if (isTimeInRange(problemTime, report.beginSnapTime, report.endSnapTime)) {
                coreForInstance.push({
                    report,
                    reason: 'primary',
                    index
                });
            }
        }

        for (const core of coreForInstance) {
            const report = core.report;
            const currentIndex = core.index;

            const distToBegin = timeDiffInMinutes(problemTime, report.beginSnapTime);
            if (distToBegin !== null && distToBegin <= 15 && currentIndex > 0) {
                const previousReport = instanceReports[currentIndex - 1];
                if (!coreForInstance.find(entry => entry.report === previousReport)) {
                    coreForInstance.push({
                        report: previousReport,
                        reason: 'pre',
                        index: currentIndex - 1
                    });
                }
            }

            const distToEnd = timeDiffInMinutes(problemTime, report.endSnapTime);
            if (distToEnd !== null && distToEnd <= 15 && currentIndex < instanceReports.length - 1) {
                const nextReport = instanceReports[currentIndex + 1];
                if (!coreForInstance.find(entry => entry.report === nextReport)) {
                    coreForInstance.push({
                        report: nextReport,
                        reason: 'post',
                        index: currentIndex + 1
                    });
                }
            }
        }

        for (const core of coreForInstance) {
            result.coreAWRs.push({
                ...core.report,
                coreReason: core.reason
            });
        }

        for (const report of instanceReports) {
            if (result.coreAWRs.find(core => core.fileName === report.fileName)) continue;

            const coreTimes = coreForInstance.map(core => ({
                begin: core.report.beginSnapTime,
                end: core.report.endSnapTime,
                date: core.report.beginSnapTime?.toDateString()
            }));

            let shouldInclude = false;

            for (const coreTime of coreTimes) {
                const beginDiff = timeDiffInMinutes(report.beginSnapTime, coreTime.begin);
                const endDiff = timeDiffInMinutes(report.endSnapTime, coreTime.end);
                const isSameDay = report.beginSnapTime?.toDateString() === coreTime.date;
                const isCrossDaySameTime = !isSameDay
                    && report.beginSnapTime?.getHours() === coreTime.begin.getHours()
                    && Math.abs(report.beginSnapTime?.getMinutes() - coreTime.begin.getMinutes()) < 30;

                if ((isSameDay && (beginDiff <= 60 || endDiff <= 60)) || isCrossDaySameTime) {
                    shouldInclude = true;
                    break;
                }
            }

            if (shouldInclude) {
                result.baselineAWRs.push(report);
            }
        }
    }

    return result;
}

function findCrossDayBaselines(reports, coreAWRs) {
    const crossDayBaselines = [];

    for (const core of coreAWRs) {
        const coreInstance = core.instance || core.header?.instance || 'unknown';
        const coreBeginHour = core.beginSnapTime?.getHours();
        const coreBeginMinute = core.beginSnapTime?.getMinutes();
        const coreDate = core.beginSnapTime?.toDateString();

        for (const report of reports) {
            if (coreAWRs.find(entry => entry.fileName === report.fileName)) continue;
            const reportInstance = report.instance || report.header?.instance || 'unknown';
            if (reportInstance !== coreInstance) continue;

            const reportBeginHour = report.beginSnapTime?.getHours();
            const reportBeginMinute = report.beginSnapTime?.getMinutes();
            const reportDate = report.beginSnapTime?.toDateString();

            if (
                coreBeginHour === reportBeginHour &&
                Math.abs(coreBeginMinute - reportBeginMinute) < 30 &&
                coreDate !== reportDate &&
                !crossDayBaselines.find(entry => entry.fileName === report.fileName)
            ) {
                crossDayBaselines.push({
                    ...report,
                    crossDayReasonKey: core.fileName
                });
            }
        }
    }

    return crossDayBaselines;
}

function formatOutput(result) {
    const texts = getReportTexts(result.language);
    return {
        problemTime: result.problemTimeStr,
        coreAWRs: result.coreAWRs.map(report => ({
            fileName: report.fileName,
            instance: report.instance,
            beginSnapTime: report.beginSnapTime?.toISOString(),
            endSnapTime: report.endSnapTime?.toISOString(),
            reason: report.coreReason,
            dbTimeMinutes: report.dbTimeMinutes,
            topEvents: report.topEvents?.slice(0, 3).map(event => event.name).join(', ') || 'N/A'
        })),
        baselineAWRs: result.baselineAWRs.map(report => ({
            fileName: report.fileName,
            instance: report.instance,
            beginSnapTime: report.beginSnapTime?.toISOString(),
            endSnapTime: report.endSnapTime?.toISOString(),
            dbTimeMinutes: report.dbTimeMinutes
        })),
        crossDayBaselines: (result.crossDayBaselines || []).map(report => ({
            fileName: report.fileName,
            instance: report.instance,
            beginSnapTime: report.beginSnapTime?.toISOString(),
            endSnapTime: report.endSnapTime?.toISOString(),
            crossDayReason: report.crossDayReason || texts.core.crossDayReason(report.crossDayReasonKey)
        }))
    };
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatTime(date) {
    if (!date) return 'N/A';
    if (typeof date === 'string') return date;

    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function generateMarkdownReport(result, options = {}) {
    const language = detectReportLanguage(options.language || result.language);
    const texts = getReportTexts(language);

    let markdown = `${texts.core.title}\n\n`;
    markdown += `${texts.core.userProblemTime}: ${result.problemTimeStr}\n\n`;

    markdown += `${texts.core.coreWindows}\n\n`;
    markdown += `| ${texts.core.file} | ${texts.core.instance} | ${texts.core.timeRange} | ${texts.core.inclusionReason} | ${texts.core.dbTimeMin} | ${texts.core.keySignals} |\n`;
    markdown += '|------|----------|------------|------------------|--------------|-------------|\n';

    for (const core of result.coreAWRs) {
        const timeRange = `${formatTime(core.beginSnapTime)} - ${formatTime(core.endSnapTime)}`;
        const topEvents = core.topEvents?.slice(0, 3).map(event => event.name).join(', ') || 'N/A';
        const reasonText = texts.core.reasons[core.coreReason] || core.coreReason;
        markdown += `| ${core.fileName} | ${core.instance || 'N/A'} | ${timeRange} | ${reasonText} | ${core.dbTimeMinutes || 'N/A'} | ${topEvents} |\n`;
    }

    markdown += `\n${texts.core.baselineWindows}\n\n`;
    markdown += `| ${texts.core.file} | ${texts.core.instance} | ${texts.core.timeRange} | ${texts.core.dbTimeMin} |\n`;
    markdown += '|------|----------|------------|--------------|\n';

    for (const baseline of result.baselineAWRs) {
        const timeRange = `${formatTime(baseline.beginSnapTime)} - ${formatTime(baseline.endSnapTime)}`;
        markdown += `| ${baseline.fileName} | ${baseline.instance || 'N/A'} | ${timeRange} | ${baseline.dbTimeMinutes || 'N/A'} |\n`;
    }

    if (result.crossDayBaselines && result.crossDayBaselines.length > 0) {
        markdown += `\n${texts.core.crossDayBaselines}\n\n`;
        markdown += `| ${texts.core.file} | ${texts.core.instance} | ${texts.core.timeRange} | ${texts.core.note} |\n`;
        markdown += '|------|----------|------------|------|\n';

        for (const baseline of result.crossDayBaselines) {
            const timeRange = `${formatTime(baseline.beginSnapTime)} - ${formatTime(baseline.endSnapTime)}`;
            const reasonText = typeof baseline.crossDayReason === 'string'
                ? baseline.crossDayReason
                : texts.core.crossDayReason(baseline.crossDayReasonKey);
            markdown += `| ${baseline.fileName} | ${baseline.instance || 'N/A'} | ${timeRange} | ${reasonText} |\n`;
        }
    }

    markdown += `\n${texts.core.nextStep}\n`;
    return markdown;
}

function analyzeReports(reports, problemTimeStr, options = {}) {
    const language = detectReportLanguage(options.language);
    const result = determineCoreAWRs(reports, problemTimeStr);
    result.language = language;
    result.crossDayBaselines = findCrossDayBaselines(reports, result.coreAWRs);
    result.formattedOutput = formatOutput(result);
    result.markdownReport = generateMarkdownReport(result, { language });
    return result;
}

module.exports = {
    parseProblemTime,
    timeDiffInMinutes,
    isTimeInRange,
    determineCoreAWRs,
    findCrossDayBaselines,
    formatOutput,
    generateMarkdownReport,
    analyzeReports
};
