# Markdown / Word Consistency Rules

`oracle-awr-analysis` must follow a single-source-of-truth rule for report generation so that Markdown and Word never drift apart.

## 1. Single Source of Truth

- Generate the Markdown report first, then render the `.docx` from that exact Markdown file.
- Do not maintain two independent bodies of analysis content.
- If the Markdown changes, regenerate the Word report.
- Report language should follow the customer environment by default; use an explicit language override only when the user asks for it.

## 2. Standard Workflow

1. Complete the full A-H analysis and save `report.md`.
2. Run:

```powershell
node scripts/index.js render-docx report.md -o report.docx
```

3. If the analysis changes, rerun the same workflow instead of copy-pasting content.

## 3. Consistency Checklist

Before rendering Word, confirm that the Markdown already includes:

- Problem time and the core/baseline AWR determination
- `A. ADDM`
- `B. Session / connection`
- `C. Load change`
- `D. Wait events`
- `E. Slow SQL`
- `F. High-frequency SQL`
- `G. Instance efficiency`
- `H. Host / resource`
- Root-cause conclusion
- Actionable recommendations

After rendering Word, spot-check that both outputs match on:

- Title and problem time
- Section order
- ADDM / slow SQL / high-frequency SQL findings
- Root-cause conclusion
- Recommendations

## 4. Do Not

- Do not add a new conclusion directly inside `.docx` without updating Markdown.
- Do not use different thresholds or anomaly rules between Markdown and Word.
- Do not remove confirmed evidence from Word only for layout convenience.

## 5. Recommended Validation

- Prefer `node scripts/index.js render-docx ...` for Word generation.
- Check that the `.docx` package contains `word/document.xml`, `word/styles.xml`, and `word/numbering.xml`.
- Run extra `.docx` validation only when the environment supports it.
