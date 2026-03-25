---
name: oracle-awr-result-review
description: Review outputs produced by oracle-awr-analysis from a senior Oracle DBA perspective. Use when Codex needs to audit, QA, challenge, or sign off AWR analysis results such as awr_*.json summaries, generated Markdown or Word AWR reports, root-cause conclusions, RAC or baseline comparisons, or remediation advice before delivery.
---

# Oracle AWR Result Review

Use this skill as a skeptical second pass over `oracle-awr-analysis` outputs. Focus on material mistakes, unsupported conclusions, missing evidence, contradictory metrics, and delivery readiness. Do not rerun the full analysis workflow unless the review artifacts are missing.

## Inputs

Review artifacts in this order:

1. `awr_core_baseline.json`
2. `awr_summary.json`, `awr_load.json`, `awr_waits.json`, `awr_slow_sql.json`, `awr_freq_sql.json`, `awr_efficiency.json`, `awr_resources.json`, `awr_sessions.json`, `awr_sql_text.json`
3. Generated Markdown report
4. Generated `.docx` only for consistency or layout spot checks
5. Raw AWR HTML only to verify suspicious rows or parser-report mismatches

If only raw HTML exists, switch to `oracle-awr-analysis` first to generate structured outputs, then return to this review.

## Workflow

1. Confirm the review goal: technical correctness, delivery QA, or customer-facing challenge review.
2. Check core and baseline integrity first. Reject the result early if instance alignment, time coverage, duplicate windows, or cross-day same-slot matching is wrong.
3. Review all A-H sections against the JSON outputs. Treat each RAC instance independently before accepting any cluster-wide conclusion.
4. Challenge every causal claim. Require a chain that links workload shape, waits, SQL evidence, and host or resource data. Downgrade any claim that is merely plausible.
5. Check appendix and delivery quality. Every SQL ID mentioned in findings or recommendations must exist in the appendix or `awr_sql_text.json`. If Markdown and Word both exist, verify that they match on findings and conclusion.
6. Produce a verdict with severity, exact defects, and whether the report is ready to deliver.

## Non-Negotiable Rules

- Do not rubber-stamp the report.
- Distinguish `observed fact`, `reasonable inference`, and `speculation`.
- Prefer structured `awr_*.json` outputs. Use raw HTML only for verification or gap filling.
- Do not call a problem `new` unless the same-instance baseline and cross-day same-slot baseline support that claim.
- Do not merge RAC instances into one conclusion when evidence differs by instance.
- Block delivery when the report contains wrong instance mapping, duplicated windows, contradictory evidence, or SQL appendix gaps.

## Common Failure Modes

- Wrong or duplicated core-window listing
- Cross-instance baseline pairing errors
- Claiming CPU bottleneck while I/O or RAC waits dominate
- Claiming connection storm while logons, online sessions, and heartbeat SQL are flat
- Claiming SGA or shared pool shortage without supportive hit-ratio, latch, or parse evidence
- Calling a SQL `new` only because the baseline excerpt is short, not because all returned rows were checked
- Recommendations that say "optimize SQL" or "add memory" without SQL ID, object, or parameter targets

Read [senior-dba-review-checklist.md](references/senior-dba-review-checklist.md) for the full technical checklist and challenge matrix.

## Output Contract

Return the review in this order:

1. `Verdict`: `Ready`, `Ready with fixes`, or `Not ready`
2. `Blockers / major findings`: only material defects first
3. `Questionable conclusions`: claims that should be downgraded, reworded, or reproven
4. `Missing evidence`: exact metric, SQL ID, instance, window, or appendix gap
5. `Revised conclusion`: the safer senior-DBA version when the original conclusion is too strong
6. `Next actions`: report fixes, extra checks, or whether to regenerate Markdown and Word

If the user asks you to fix the report, edit the Markdown first, then regenerate the `.docx` from that Markdown so both stay aligned.
