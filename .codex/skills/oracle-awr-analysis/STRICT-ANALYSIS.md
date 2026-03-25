# Strict Analysis Checklist

Use this checklist whenever the task is not a quick scan. The goal is to keep ADDM, slow SQL, and high-frequency SQL analysis strict and reproducible.

## 1. Core / baseline discipline

- Read `awr_core_baseline.json` first.
- Treat each RAC instance independently.
- Use both same-day nearby baselines and cross-day same-slot baselines when available.
- Never compare one instance's core data to another instance's baseline.

## 2. A. ADDM checks

- Compare all `findingName` values in core vs baseline, not only the top 1-2 findings.
- Aggregate `avgActiveSessions` by finding name for each instance.
- Classify each finding:
  - `New`: core exists, baseline missing
  - `Worsened`: both exist and AAS increases by more than 15%
  - `Stable`: both exist and AAS change is within -15% to +15%
  - `Improved`: both exist and AAS decreases by more than 15%, or baseline exists but core disappears
- Explicitly call out recurring findings such as `User I/O`, `Top SQL Statements`, and `Undersized SGA`.
- Distinguish ongoing issues from newly emerged issues.

## 3. D. Wait-event checks

- Read `awr_waits.json` first.
- If `topEvents` is empty or suspicious, verify `Top 10 Foreground Events` in raw HTML.
- Compare at least `% DB time`, `Avg Wait`, and wait class.
- Highlight:
  - new wait events entering Top 10
  - `% DB time` increase above 20%
  - `Avg Wait` increase above 20%
  - lock, latch, library cache, row cache, GC, log file sync, and `db file sequential read`
- Cross-reference wait-heavy periods with SQL ordered by wait, reads, and executions.

## 4. E. Slow-SQL checks

- Inspect all rows returned in core windows for all available dimensions:
  - `sqlByElapsed`
  - `sqlByCPU`
  - `sqlByIOWait` / `sqlByWaitTime`
  - `sqlByGets`
  - `sqlByReads`
  - `sqlByCluster` when available
- Do not stop at top 10.
- For each SQL ID, compute the baseline average for the same dimension and classify:
  - `New`: core exists, baseline missing
  - `Worsened`: change > 15%
  - `Stable`: change within -15% to +15%
  - `Improved`: change < -15%
- Track the source dimension for every SQL ID. A SQL can belong to multiple dimensions.
- Mark likely I/O-bound SQL when:
  - `elapsed_per_exec > 1s`, and
  - `cpu_time / elapsed_time < 50%`
- Mark likely CPU-bound SQL when:
  - `cpu_time / elapsed_time > 80%`
- Always attach SQL module and full SQL text in the appendix for every SQL called out in the body.

## 5. F. High-frequency SQL checks

- Inspect all rows returned in:
  - `sqlByExecutions`
  - `sqlByParseCalls`
- Do not stop at top 10.
- Classify execution growth using the same 15% rule.
- Always compute parse ratio as:
  - `parses_per_exec` if present, otherwise
  - `parse_calls / executions`
- Treat parse ratio `>= 0.90` as a real parsing problem worth calling out.
- Separate three patterns:
  - high-frequency but stable
  - execution growth
  - parse storm / repeated parse behavior
- For system SQL, explain whether it is a real problem or an expected heartbeat or monitoring query.

## 6. G / H support checks

- In efficiency metrics, explicitly compare:
  - `bufferHitPercent`
  - `libraryHitPercent`
  - `softParsePercent`
  - `executeToParsePercent`
  - `parseCpuToParseElapsdPercent`
- In resource metrics, explicitly compare:
  - CPU `%User`, `%Idle`, `%WIO`
  - IO `dbMBRead`, `dbMBWrite`
  - memory `pgaUseMBEnd`, `sgaUseMBEnd` when present

## 7. Final synthesis rules

- Do not claim a new outage if the same pattern already exists in baseline.
- Do not blame CPU if CPU user load is flat or lower and I/O waits dominate.
- Do not blame connection storms if logons/logouts and heartbeat SQL are flat or lower.
- Root-cause chains must link workload shape, wait profile, SQL evidence, and system/resource evidence.
