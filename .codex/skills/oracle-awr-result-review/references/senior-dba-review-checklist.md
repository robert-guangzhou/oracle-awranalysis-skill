# Senior DBA Review Checklist

## Table of Contents

1. Fast triage
2. Core and baseline integrity
3. A-H technical review
4. Root-cause challenge matrix
5. Deliverable QA
6. Suggested verdict language

## 1. Fast triage

- Decide whether the task is:
  - a technical challenge review,
  - a pre-delivery QA review, or
  - a rewrite request after defects are found.
- Read `awr_core_baseline.json` and the generated Markdown before drilling into details.
- Look for early blockers first:
  - duplicated core windows,
  - wrong RAC instance pairing,
  - conclusions that contradict the data,
  - missing SQL appendix coverage,
  - Markdown and Word drift.
- If an early blocker exists, say so immediately instead of burying it later in the review.

## 2. Core and baseline integrity

### 2.1 Core-window checks

- Confirm the core window actually covers the reported problem time.
- Confirm any "pre" or "post" extension windows are labeled correctly and are not duplicated.
- Verify each RAC instance has its own core window list.
- Verify cluster-wide summaries do not silently merge mismatched instance windows.

### 2.2 Baseline checks

- Compare each core instance only with baselines from the same instance.
- Require both nearby same-day baselines and cross-day same-slot baselines when they are available.
- Reject any review that pairs `ibossdb1` core findings to `ibossdb2` baseline evidence.
- Treat missing baseline rows as "not proven yet" until all returned rows and relevant dimensions are checked.

### 2.3 Time and labeling checks

- Ensure report timestamps, window labels, and table captions are consistent.
- Call out duplicate time ranges, repeated rows, or headings that imply a stronger conclusion than the table supports.
- Verify the narrative matches the actual window order.

## 3. A-H technical review

### A. ADDM

- Compare all major `findingName` rows, not just the first one or two.
- Distinguish:
  - recurring issues,
  - newly emerged issues,
  - improved but still relevant issues.
- Treat `Undersized SGA`, `User I/O`, `Top SQL Statements`, hard-parse findings, and RAC findings as first-class evidence.
- Reject statements like "memory is the root cause" unless ADDM aligns with efficiency, waits, and SQL evidence.

### B. Session and connection review

- Require evidence before accepting a connection storm conclusion:
  - `Logons/s`,
  - `user logons cumulative`,
  - `user logouts cumulative`,
  - end-of-window online sessions,
  - heartbeat SQL such as `select 1 from dual`.
- If logons are flat or down, do not blame short-connection storms.
- If online sessions fall while logons stay flat, consider service drain, failover, or application-side contraction instead.

### C. Load-change review

- Review load deltas per instance and per core window, not only aggregated averages.
- Require the report to explain whether the increase is caused by:
  - executions,
  - physical reads,
  - parsing,
  - batch overlap,
  - or cluster redistribution.
- Reject vague statements like "load increased" unless the report names the metric and the delta.

### D. Wait-event review

- Verify Top 10 wait events from `awr_waits.json`.
- If `topEvents` looks incomplete or suspicious, verify raw HTML.
- Compare both `% DB time` and `Avg Wait`.
- Highlight new entries, not only worsened old entries.
- Review whether the report distinguishes:
  - CPU pressure,
  - storage or scan pressure,
  - single-block read pressure,
  - lock or latch contention,
  - RAC global cache waits,
  - commit or redo pressure.
- Reject any root cause that cites waits without linking them to SQL, objects, or workload shape.

### E. Slow SQL review

- Inspect all returned rows in:
  - `sqlByElapsed`,
  - `sqlByCPU`,
  - `sqlByIOWait` or `sqlByWaitTime`,
  - `sqlByGets`,
  - `sqlByReads`,
  - `sqlByCluster` when present.
- Do not accept a "top 5 only" review as complete.
- Check whether a SQL marked `new` is truly absent from the relevant baseline rows.
- Track whether each SQL is problematic for elapsed time, CPU, reads, gets, or cluster cost.
- Require the report to name the SQL ID and module, and ideally explain why it is heavy.
- Require appendix coverage for every SQL ID called out in the body.

### F. High-frequency SQL review

- Inspect all returned rows in `sqlByExecutions` and `sqlByParseCalls`.
- Recompute `parse_calls / executions` when `parses_per_exec` is missing.
- Treat parse ratio `>= 0.90` as a serious parsing concern unless the SQL is a known lightweight exception.
- Separate:
  - high-frequency but stable SQL,
  - workload growth,
  - parse storm behavior.
- For system SQL, say whether it is an expected heartbeat or a genuine problem.

### G. Instance efficiency review

- Review:
  - `bufferHitPercent`,
  - `libraryHitPercent`,
  - `softParsePercent`,
  - `executeToParsePercent`,
  - `parseCpuToParseElapsdPercent`.
- Do not treat a single weak ratio as sufficient proof of root cause.
- Use efficiency metrics to support or weaken claims about memory, shared pool, and parse behavior.

### H. Host and resource review

- Review:
  - CPU `%User`, `%Idle`, `%WIO`,
  - `dbMBRead`, `dbMBWrite`,
  - `pgaUseMBEnd`, `sgaUseMBEnd` when present.
- Require host and I/O evidence before calling the issue an infrastructure bottleneck.
- If DB waits worsen but host saturation does not, consider workload shape or SQL access path problems before blaming hardware.

## 4. Root-cause challenge matrix

### CPU bottleneck

- Accept only when DB CPU share is materially higher and the dominant SQL is CPU-heavy.
- Downgrade when I/O waits, GC waits, or lock waits dominate.

### I/O bottleneck

- Accept only when physical reads or read waits materially worsen and the report can tie them to specific SQL or objects.
- Downgrade when the report shows high read volume but no storage-latency increase and no scan-heavy SQL explanation.

### SGA or shared-pool shortage

- Accept only when ADDM, efficiency metrics, and wait or latch evidence point in the same direction.
- Downgrade when the report jumps from one ADDM line directly to "increase memory" without further proof.

### Parse storm or hard-parse pressure

- Accept only when parse ratios, execute-to-parse behavior, library cache symptoms, or literal SQL patterns support it.
- Downgrade when the report cites shared pool issues but parse evidence is missing.

### Connection storm

- Accept only when logons, session counts, and heartbeat or monitoring SQL all expand in a matching way.
- Downgrade when the session profile is flat or falling.

### RAC contention

- Accept only when GC waits worsen and the report identifies cross-instance hotspots, service placement issues, or object access skew.
- Downgrade when GC waits are present but minor and the main cost is still local I/O or SQL inefficiency.

### Commit or redo pressure

- Accept only when `log file sync`, commit-heavy SQL or transaction patterns, and redo symptoms line up.
- Downgrade when `log file sync` is only mildly elevated and other waits are clearly larger.

## 5. Deliverable QA

### 5.1 Evidence quality

- Require every material claim to cite:
  - metric,
  - instance,
  - time window,
  - and baseline comparison.
- Separate facts from interpretation.
- Replace "caused by" with "consistent with" when proof is incomplete.

### 5.2 Report structure

- Ensure the report covers all required A-H sections.
- Ensure the root-cause chain links:
  - workload shape,
  - wait profile,
  - SQL evidence,
  - host or resource evidence.
- Ensure recommendations are specific enough to act on:
  - SQL ID,
  - object,
  - parameter,
  - service placement,
  - scheduling action,
  - or application behavior.

### 5.3 SQL appendix

- Every SQL ID cited in findings or recommendations must appear in the appendix or in `awr_sql_text.json`.
- Check that SQL anchors and appendix references resolve correctly in Markdown.
- If the Word report exists, spot-check that the same SQL IDs and conclusions appear there too.

### 5.4 Markdown and Word consistency

- Confirm the title, problem time, section order, findings, conclusion, and recommendations match.
- If they differ, treat Markdown as the source of truth and require Word regeneration.

## 6. Suggested verdict language

- `Ready`: conclusions are technically sound, evidence-backed, and consistent across deliverables.
- `Ready with fixes`: the report is directionally correct but needs targeted edits before delivery.
- `Not ready`: there are blockers such as wrong instance mapping, unsupported root-cause claims, duplicated windows, or missing SQL evidence.

When possible, rewrite the final conclusion into the strongest defensible wording instead of only saying it is wrong.
