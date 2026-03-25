---
name: oracle-awr-end-to-end
description: Orchestrate end-to-end Oracle AWR report delivery from raw AWR HTML or existing awr_*.json outputs through core-window determination, full A-H analysis, senior DBA review, Markdown correction, and synchronized Word regeneration. Use when Codex needs one workflow that combines oracle-awr-analysis and oracle-awr-result-review, or when the user asks for a reviewed customer-ready AWR Markdown or .docx report instead of analysis-only or review-only work.
---

# Oracle AWR End-to-End

## Overview

Use this skill as the wrapper for full AWR delivery. Follow the detailed analysis rules in [oracle-awr-analysis](../oracle-awr-analysis/SKILL.md) and the skeptical second-pass rules in [oracle-awr-result-review](../oracle-awr-result-review/SKILL.md); do not duplicate their low-level checklists here.

## Workflow Decision

- If the user wants only QA, challenge review, or sign-off on existing outputs, switch to [oracle-awr-result-review](../oracle-awr-result-review/SKILL.md) directly.
- If structured `awr_*.json` outputs or the Markdown report do not exist yet, start with [oracle-awr-analysis](../oracle-awr-analysis/SKILL.md).
- If the user asks for a complete deliverable, run the full workflow below even when some artifacts already exist, unless the user explicitly asks to skip regeneration.

## End-to-End Flow

1. Build or refresh the structured AWR artifacts with [oracle-awr-analysis](../oracle-awr-analysis/SKILL.md).
2. Read `awr_core_baseline.json` first and present the core-window determination before any deeper conclusion.
3. Generate the Markdown report as the working source of truth.
4. Review the structured outputs and Markdown with [oracle-awr-result-review](../oracle-awr-result-review/SKILL.md).
5. If the verdict is `Ready`, render the Word document from the final Markdown.
6. If the verdict is `Ready with fixes` or `Not ready`, fix the Markdown first, then re-check the corrected result and only then regenerate the Word document.
7. Deliver the final verdict, final conclusion, final recommendations, and artifact status.

## Contracts Between Stages

- Treat `awr_*.json` as primary evidence and raw HTML as verification only.
- Treat the Markdown report as the single editable source of truth.
- Never patch the `.docx` directly; regenerate it from the final Markdown.
- Every SQL ID referenced in findings or recommendations must appear in the appendix or in `awr_sql_text.json`.
- Preserve instance-specific reasoning; do not collapse RAC evidence into one conclusion when instances differ.

## Non-Negotiable Rules

- Never skip any A-H section required by [oracle-awr-analysis](../oracle-awr-analysis/SKILL.md).
- Never rubber-stamp the first draft.
- Distinguish observed fact, reasonable inference, and speculation.
- Block delivery when instance mapping, baseline pairing, major conclusions, or SQL appendix coverage are wrong.
- When review and analysis disagree, prefer the safer conclusion and state exactly what evidence is missing.

## Output Contract

Return results in this order:

1. Core-window determination
2. Review verdict: `Ready`, `Ready with fixes`, or `Not ready`
3. Final conclusion
4. Final recommendations
5. Artifact status for structured outputs, Markdown, and Word
6. Remaining risks or follow-up checks, if any
