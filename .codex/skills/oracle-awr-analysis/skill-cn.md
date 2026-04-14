---
name: "oracle-awr-analysis"
description: "面向 DBA 级别性能诊断的 Oracle AWR HTML 报告分析技能。适用于 Codex 需要围绕问题时点识别核心 AWR 窗口、对比核心与基线报告中的 ADDM、负载、等待、慢 SQL、高频 SQL、资源指标，或基于同一来源生成一致的 Markdown 与 Word AWR 报告的场景。"
---

# Oracle AWR 分析

使用内置脚本进行确定性解析与报告渲染。根因判断和优化建议仍由模型负责。

## 工作流

1. 运行 `node scripts/index.js read -d <awr-dir> -t <problem-time> -v`。
2. 优先阅读 `awr_core_baseline.json`，先展示核心 AWR 窗口判定结果，再进入深度分析。
3. 完整分析 A-H 全部维度。对于严格的 ADDM、慢 SQL、高频 SQL 检查，请阅读 [STRICT-ANALYSIS.md](STRICT-ANALYSIS.md)。
4. 在给出全局结论前，必须先分别比较每个 RAC 实例。
5. 先生成 Markdown 报告。默认情况下，报告语言跟随客户环境；仅在明确要求覆盖时使用 `--language`。关于 Markdown / Word 一致性规则，请阅读 [REPORT-CONSISTENCY.md](REPORT-CONSISTENCY.md)。
6. 仅在 Markdown 最终定稿后，再通过 `node scripts/index.js render-docx <report.md> -o <report.docx>` 渲染 Word 报告。

## 必须遵守的规则

- 绝不能跳过 A-H 中的任何一项。
- 必须始终将核心 AWR 与同实例基线 AWR 比较；如果存在跨天同时间段基线，也必须纳入对比。
- 优先使用 `awr_*.json` 输出，而不是直接读取原始 HTML。只有在核对可疑数据行或填补解析缺口时才回退到原始 HTML。
- 必须将 ADDM 结论视为一等证据，而不是可有可无的摘要文本。
- 对于慢 SQL 和高频 SQL，必须检查核心窗口中返回的全部记录，而不只是报告里展示的前几行。
- 如果 `parses_per_exec` 缺失，必须手动计算 `parse_calls / executions`。
- 需要标记 Oracle 系统 SQL，例如 `V$*`、`GV$*`、`DBA_*`、`ALL_*`、`USER_*`、`SYS.*`，但像 `select 1 from dual` 这种简单心跳 SQL 可排除。
- 建议必须具体，至少明确到 SQL ID、等待事件、参数、对象或调度动作。

## 内置命令

- `node scripts/index.js read ...`
- `node scripts/index.js parse <awr-file> --deep`
- `node scripts/index.js parse-sql <awr-file> <sql-id>`
- `node scripts/index.js render-docx <report.md> -o <report.docx>`
- `node scripts/index.js generate-report -d <awr-dir> -t <problem-time> [--language zh-CN|en-US]`

## 何时回退到原始 HTML

- `awr_waits.json` 中缺少预期的 Top 10 等待事件。
- 某个 SQL 区段或 ADDM 行看起来可疑，需要回到源数据核验。
- `awr_sql_text.json` 中找不到报告附录所需的 SQL 文本。

## 输出约定

- 先展示核心 AWR 窗口判定。
- 然后输出完整的 A-H 分析、根因链路，以及 3-5 条具体建议。
- 正文中提到的每一条异常 SQL，都必须在附录中附上完整 SQL 文本。
- Markdown 与 Word 必须保持相同的标题、表格、结论与 SQL 附录。
