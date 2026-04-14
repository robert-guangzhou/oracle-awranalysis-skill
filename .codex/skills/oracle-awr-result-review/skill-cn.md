---
name: "oracle-awr-result-review"
description: "从资深 Oracle DBA 的视角复核由 oracle-awr-analysis 生成的分析结果。适用于 Codex 需要对 awr_*.json 摘要、生成的 Markdown / Word AWR 报告、根因结论、RAC / 基线对比或整改建议进行审计、QA、挑战性复核和交付前签发的场景。"
---

# Oracle AWR 结果复核

把这个 skill 当作对 `oracle-awr-analysis` 产出的怀疑式第二遍审查。重点关注重大错误、证据不足的结论、缺失证据、互相矛盾的指标，以及是否具备交付条件。除非复核所需产物不存在，否则不要重新执行整套分析流程。

## 输入顺序

按以下顺序检查复核材料：

1. `awr_core_baseline.json`
2. `awr_summary.json`、`awr_load.json`、`awr_waits.json`、`awr_slow_sql.json`、`awr_freq_sql.json`、`awr_efficiency.json`、`awr_resources.json`、`awr_sessions.json`、`awr_sql_text.json`
3. 已生成的 Markdown 报告
4. 已生成的 `.docx`，仅用于一致性或版式抽查
5. 原始 AWR HTML，仅用于核对可疑数据行或解析结果与报告不一致的问题

如果只有原始 HTML，则应先切换到 `oracle-awr-analysis` 生成结构化输出，再回到本复核流程。

## 工作流

1. 先确认复核目标是技术正确性、交付 QA，还是面向客户的挑战性评审。
2. 先检查核心窗口和基线完整性。如果实例对齐、时间覆盖、窗口重复或跨天同时间段匹配存在问题，应尽早驳回结果。
3. 对照 JSON 输出复核全部 A-H 章节。在接受任何集群级结论之前，必须先逐个评估 RAC 实例。
4. 质疑每一个因果判断。必须要求“负载形态 -> 等待事件 -> SQL 证据 -> 主机 / 资源数据”的链路完整；如果只是看起来有道理，应降低结论强度。
5. 检查附录和交付质量。正文或建议中提到的每个 SQL ID，都必须出现在附录中，或存在于 `awr_sql_text.json`。如果 Markdown 和 Word 同时存在，还要确认两者的结论与发现一致。
6. 给出 verdict，明确严重级别、具体缺陷，以及报告是否可以交付。

## 不可妥协的规则

- 不能对报告走过场式放行。
- 必须区分 `observed fact`、`reasonable inference` 和 `speculation`。
- 优先依赖结构化 `awr_*.json` 输出。原始 HTML 仅用于核验或补洞。
- 如果没有同实例基线和跨天同时间段基线的支持，就不能把某个问题称为 `new`。
- 当 RAC 各实例证据不同，不能强行合并成单一结论。
- 如果报告存在错误的实例映射、重复窗口、互相矛盾的证据，或 SQL 附录缺失，必须阻止交付。

## 常见失败模式

- 核心窗口列表错误或重复
- 跨实例基线配对错误
- 明明 I/O 或 RAC 等待主导，却误判为 CPU 瓶颈
- 登录数、在线会话数和心跳 SQL 都平稳，却误判为连接风暴
- 在没有命中率、锁存器或解析证据支持的情况下，误判为 SGA 或 shared pool 不足
- 仅因基线摘录较短，就把某条 SQL 误判为 `new`，而不是检查完所有返回记录
- 建议只写“优化 SQL”或“增加内存”，却没有 SQL ID、对象或参数目标

如需完整技术检查清单和挑战矩阵，请阅读 [senior-dba-review-checklist.md](references/senior-dba-review-checklist.md)。

## 输出约定

请按以下顺序返回复核结果：

1. `Verdict`：`Ready`、`Ready with fixes` 或 `Not ready`
2. `Blockers / major findings`：先列出真正影响交付的重大问题
3. `Questionable conclusions`：需要降级、改写或重新证明的结论
4. `Missing evidence`：明确指出缺失的指标、SQL ID、实例、时间窗口或附录项
5. `Revised conclusion`：当原结论过强时，给出更稳妥的资深 DBA 版本
6. `Next actions`：需要如何修报告、补检查，或是否必须重新生成 Markdown 和 Word

如果用户要求你修报告，应先修改 Markdown，再从该 Markdown 重新生成 `.docx`，确保两者始终一致。
