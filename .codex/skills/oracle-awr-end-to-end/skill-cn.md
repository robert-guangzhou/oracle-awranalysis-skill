---
name: "oracle-awr-end-to-end"
description: "从原始 Oracle AWR HTML 或已有 awr_*.json 输出出发，完成从核心窗口判定、A-H 全量分析、资深 DBA 复核、Markdown 修订到 Word 报告同步重生成的端到端交付技能。适用于 Codex 需要把 [oracle-awr-analysis](../oracle-awr-analysis/skill-cn.md) 与 [oracle-awr-result-review](../oracle-awr-result-review/skill-cn.md) 组合成一个完整流程，或用户希望拿到可直接交付的 AWR Markdown / .docx 报告而不是单纯分析或单纯评审的场景。"
---

# Oracle AWR 端到端交付

## 概览

将这个 skill 作为完整 AWR 交付流程的总控入口。底层分析规则遵循 [oracle-awr-analysis](../oracle-awr-analysis/skill-cn.md)，二次审查规则遵循 [oracle-awr-result-review](../oracle-awr-result-review/skill-cn.md)；不要在这里重复它们的细节检查清单。

## 工作流判断

- 如果用户只需要 QA、挑战性复核或最终签发，直接切换到 [oracle-awr-result-review](../oracle-awr-result-review/skill-cn.md)。
- 如果结构化 `awr_*.json` 输出或 Markdown 报告尚不存在，先从 [oracle-awr-analysis](../oracle-awr-analysis/skill-cn.md) 开始。
- 如果用户需要完整交付物，即使部分产物已经存在，也应走完整流程；只有在用户明确要求跳过重生成时才可例外。

## 端到端流程

1. 通过 [oracle-awr-analysis](../oracle-awr-analysis/skill-cn.md) 生成或刷新结构化 AWR 产物。
2. 优先阅读 `awr_core_baseline.json`，在任何深层结论之前先展示核心窗口判定结果。
3. 先生成 Markdown 报告，并把它视为唯一的工作真相源。
4. 使用 [oracle-awr-result-review](../oracle-awr-result-review/skill-cn.md) 对结构化输出和 Markdown 进行复核。
5. 如果结论为 `Ready`，再从最终 Markdown 渲染 Word 文档。
6. 如果结论为 `Ready with fixes` 或 `Not ready`，必须先修正 Markdown，再复查修正结果，最后才允许重新生成 Word。
7. 交付时输出最终 verdict、最终结论、最终建议，以及各类产物状态。

## 阶段间约束

- 将 `awr_*.json` 视为主要证据，原始 HTML 仅用于核验。
- 将 Markdown 报告视为唯一可编辑的真相源。
- 绝不能直接修补 `.docx`，必须从最终 Markdown 重新生成。
- 结论或建议中提到的每个 SQL ID，都必须出现在附录中，或者至少存在于 `awr_sql_text.json`。
- 必须保留实例级推理；当 RAC 各实例表现不同，不能把证据粗暴合并成单一结论。

## 不可妥协的规则

- 绝不能跳过 [oracle-awr-analysis](../oracle-awr-analysis/skill-cn.md) 要求的任何 A-H 章节。
- 绝不能对第一稿直接盖章放行。
- 必须清楚区分观察事实、合理推断和猜测。
- 如果实例映射、基线配对、主要结论或 SQL 附录覆盖存在错误，必须阻止交付。
- 当分析与复核意见冲突时，优先采用更保守的结论，并明确指出缺失了什么证据。

## 输出约定

请按以下顺序返回结果：

1. 核心窗口判定
2. 复核结论：`Ready`、`Ready with fixes` 或 `Not ready`
3. 最终结论
4. 最终建议
5. 结构化输出、Markdown 与 Word 的产物状态
6. 剩余风险或后续检查项（如有）
