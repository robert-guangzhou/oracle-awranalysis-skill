# Oracle AWR Skills

This repository contains Codex skills for Oracle AWR analysis and review workflows.

本仓库用于存放 Oracle AWR 分析与复核相关的 Codex skills，覆盖分析、评审以及端到端报告交付流程。

## Included skills

## 已包含的技能

- `oracle-awr-analysis`: Parse AWR reports, locate core problem windows, analyze load, waits, SQL, and resources, and generate report artifacts.
- `oracle-awr-result-review`: Review generated analysis outputs from a senior Oracle DBA perspective.
- `oracle-awr-end-to-end`: Orchestrate analysis, review, Markdown correction, and final customer-ready report generation.

- `oracle-awr-analysis`：解析 AWR 报告，识别核心问题时间窗口，分析负载、等待事件、SQL 与资源使用情况，并生成分析结果。
- `oracle-awr-result-review`：从资深 Oracle DBA 的视角对分析结果进行复核和质量把关。
- `oracle-awr-end-to-end`：串联分析、评审、Markdown 修正与最终客户交付报告生成的完整流程。

## Repository layout

## 仓库结构

```text
.codex/skills/
  oracle-awr-analysis/
  oracle-awr-end-to-end/
  oracle-awr-result-review/
```

## Notes

## 说明

- This repository intentionally tracks only `.codex/skills`.
- Dependency directories such as `node_modules` are excluded from version control.
- The workspace may contain many local report files, but they are not part of this Git repository.

- 本仓库有意只跟踪 `.codex/skills` 目录。
- `node_modules` 等依赖目录不会纳入版本控制。
- 工作区中可能存在大量本地报告文件，但它们不属于这个 Git 仓库的同步范围。
