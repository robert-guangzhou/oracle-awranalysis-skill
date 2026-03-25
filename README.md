# Oracle AWR Skills

This repository contains Codex skills for Oracle AWR analysis and review workflows.

## Included skills

- `oracle-awr-analysis`: Parse AWR reports, locate core problem windows, analyze load, waits, SQL, and resources, and generate report artifacts.
- `oracle-awr-result-review`: Review generated analysis outputs from a senior Oracle DBA perspective.
- `oracle-awr-end-to-end`: Orchestrate analysis, review, Markdown correction, and final customer-ready report generation.

## Repository layout

```text
.codex/skills/
  oracle-awr-analysis/
  oracle-awr-end-to-end/
  oracle-awr-result-review/
```

## Notes

- This repository intentionally tracks only `.codex/skills`.
- Dependency directories such as `node_modules` are excluded from version control.
- The workspace may contain many local report files, but they are not part of this Git repository.
