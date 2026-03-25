---
name: "oracle-awr-analysis"
description: "Analyze Oracle AWR HTML reports for DBA-grade performance diagnosis. Use when Codex needs to identify core AWR windows around a problem time, compare core vs baseline reports across ADDM/load/waits/slow SQL/high-frequency SQL/resource metrics, or generate consistent Markdown and Word AWR reports from the same source."
---

# Oracle AWR Analysis

Use bundled scripts for deterministic parsing and report rendering. Keep root-cause judgment and optimization advice in the model.

## Workflow

1. Run `node scripts/index.js read -d <awr-dir> -t <problem-time> -v`.
2. Read `awr_core_baseline.json` first and show the core AWR determination before deep analysis.
3. Analyze all A-H dimensions. For strict ADDM / slow SQL / high-frequency SQL checks, read [STRICT-ANALYSIS.md](STRICT-ANALYSIS.md).
4. Compare each RAC instance independently before giving a global conclusion.
5. Generate the Markdown report first. By default, report language follows the customer environment. Use `--language` only when an explicit override is needed. For Markdown / Word consistency rules, read [REPORT-CONSISTENCY.md](REPORT-CONSISTENCY.md).
6. Render the Word report only from the finished Markdown by running `node scripts/index.js render-docx <report.md> -o <report.docx>`.

## Required rules

- Never skip any of A-H.
- Always compare core AWR against same-instance baseline AWR, including cross-day same-slot baselines when available.
- Prefer `awr_*.json` outputs over raw HTML. Use raw HTML only to verify suspicious rows or fill parser gaps.
- Treat ADDM findings as first-class evidence, not as optional summary text.
- For slow SQL and high-frequency SQL, inspect all rows returned in core windows, not only the top few rows shown in the report.
- When `parses_per_exec` is missing, compute `parse_calls / executions` manually.
- Tag Oracle system SQL such as `V$*`, `GV$*`, `DBA_*`, `ALL_*`, `USER_*`, `SYS.*`, except trivial heartbeat SQL like `select 1 from dual`.
- Keep recommendations concrete: SQL ID, wait event, parameter, object, or scheduling action must be explicit.

## Bundled commands

- `node scripts/index.js read ...`
- `node scripts/index.js parse <awr-file> --deep`
- `node scripts/index.js parse-sql <awr-file> <sql-id>`
- `node scripts/index.js render-docx <report.md> -o <report.docx>`
- `node scripts/index.js generate-report -d <awr-dir> -t <problem-time> [--language zh-CN|en-US]`

## When to fall back to raw HTML

- `awr_waits.json` lacks an expected Top 10 wait event.
- A SQL section or ADDM row looks suspicious and needs source verification.
- `awr_sql_text.json` does not contain a SQL text that is required in the report appendix.

## Output contract

- Show the core AWR determination first.
- Then deliver the full A-H analysis, root-cause chain, and 3-5 concrete recommendations.
- Every abnormal SQL referenced in the body must appear in the appendix with full SQL text.
- Markdown and Word must carry the same headings, tables, conclusions, and SQL appendix.
