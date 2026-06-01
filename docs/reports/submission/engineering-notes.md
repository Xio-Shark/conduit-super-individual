# Engineering Notes

更新时间：**2026-05-24**。

## 摘要

本项目的工程重点不是“让模型输出一段代码”，而是把 PM 需求转成可审计、可重放、可验证的 Conduit 真实仓库改动。实现上坚持三条原则：

1. **真实写入与真实验证**：所有核心 diff 来自 `sandbox-repo/`，验证失败就暴露失败，不构造假成功。
2. **Skill 注册式扩展**：新增需求模式优先新增 Skill 或 schemaChange 声明，Agent / Orchestrator 主干只读声明，不写业务分支。
3. **证据优先**：每个 run 都落盘 requirement、plan、diff、verification、PR draft 和 AI usage，答辩材料可从证据目录回放。

## 重点难点总览

| 难点 | 解决方案 | 对应证据 |
|------|----------|----------|
| Conduit 真实仓库写入 | `ConduitSandbox` 限制路径与 git origin，所有改动写入 `sandbox-repo/` | `diff.patch`、`verification.json` |
| 新需求模式不改主干 | 6 个 Skill + registry；planSummary / validation / crossStackCheck 下沉到 Skill 元数据 | `services/skills/src/*`、`registry.js` |
| 跨栈字段同步 | U1 `schemaChange` → `schemaDriver` + `frontendGenerators` 自动推断 backend/frontend 目标 | `run-l2-auto-cover-image` |
| 模糊需求不硬编 | U2 多轮 LLM clarify，pending questions 持久化，PM 回答后 refine | `run-l3-multi-turn-clarify` |
| 可观测与合规 | `ai-calls.jsonl` 记录 prompt_version、tokens、latency、cost；Web 面板展示 | `run-plan-llm-driven`、AI Usage panel |
| 历史上下文反哺 | token + semantic recall 并集，plan 写入 `history_references` | `run-semantic-recall-demo` |

## 难点 1：真实仓库写入

系统必须写入 Conduit clone，而不是 mock 仓库。`ConduitSandbox` 会检查 git origin 包含 `conduit-realworld-example-app`，并只允许在 sandbox 路径内读写。

## 难点 2：验证链路不伪造成功

Conduit 根仓目前没有 lint script。Verification Agent 由实现仓库 `npm run lint:sandbox` 对本次改动文件做 ESLint，并运行 Conduit `npm test`。失败进入 failed 状态；Vitest 需 `jsdom` devDependency。

## 难点 3：Skill 与主流程解耦

**6 个 Skill** 注册于 `registry.js`；Orchestrator 只推进阶段。早期 4 个 Skill（阅读量、草稿、字数、Popular Tags）+ U1 `article-cover-image`（schema-driven Skill ≤30 行不写 targetPaths，由 `schemaDriver` 自动推断目标文件）+ U5 `comment-like-count`（落点完全脱离文章列表，≤50 行 + sandbox vitest 4 条）均只新增 Skill 文件，不改 Agent/Orchestrator 主干（§2.2 #1）。Planning 摘要下沉为 Skill 元数据 `planSummary`，Verification 跨栈检查下沉为 Skill-owned `crossStackCheck`，默认验证命令与锚点断言收敛到 `skillHelpers.js`，Agent 主干只读取声明字段，漏填或缺证据直接失败，不再按 `skill.id` 写分支。

## 难点 4：跨栈自动驱动（U1）

Skill 声明 `schemaChange={model, field, type, op}`，`services/codegen/schemaDriver.js` 解析 Sequelize 模型 → `frontendGenerators.js` 生成 TS interface / fetch stub / mock 三件套；planningAgent 动态推断 6 文件目标清单（backend model + controller + preview + 3 新生成前端文件）。演示证据：`run-l2-auto-cover-image` diff 含 6 文件，`articleCoverImage.js` 仅 23 行。

## 难点 5：多轮 LLM 澄清（U2）

`clarifyWithLlm.js` 拆分为 `proposeClarifications`（首轮） + `refineWithAnswers`（含历史答复的后续轮）；LLM 响应 `{decision: "clarify"|"finalize", requirement_card, pending_questions}`；pipeline 捕获 `PendingClarificationError` 进入 `CLARIFYING_AWAITING_ANSWER` 状态；`POST /api/runs/:id/answer-clarification` 写 `clarification-history.jsonl`；`resume-from-stage=clarifying` 触发 refine。演示证据：`run-l3-multi-turn-clarify` ai-calls 2 行（stage=clarify + clarify-refine，第二轮 prompt 含首轮 PM 答复），history 4 行。

## 难点 6：plan 阶段接真 LLM（U3）

移除 `rejectUnsupportedPlanMode`；`planWithLlm.js` 输入 requirementCard + sandbox index + history，由 `mimo-v2.5` 输出 `target_files + impacted_modules + risks + reasoning`；LLM 输出 target_files 必须存在于 sandbox（fail-fast 不用 fallback）；plan.ai_call 合并入 `ai-calls.jsonl`（`stage=plan`，非零 tokens）。演示证据：`run-plan-llm-driven` ai-calls 含 stage=plan 行（1042/1590 tokens），`plan.md source=llm-driven`。

## 难点 7：语义历史召回（U4）

`services/index/src/embeddingIndex.js` 实现 character bigram + 256 维 hash + L2 归一化 cosine（纯本地，无外部依赖）；`embeddings.jsonl` 一行一 passed run（vector + meta）；`historyRecall.js` 合并 token 重叠 + semantic 并集（`match_type=semantic|skill_id|both`），`plan.history_references` 每条含 `similarity_score`。演示证据：`run-semantic-recall-demo` 输入无 Skill 关键词重叠仍 semantic 命中 word-count 老 run。

## 难点 8：归档治理（R1）

原 132 个 run 目录中 105 个 paused/failure-only，公开仓直接暴露会损害评委印象。`scripts/prune-runs.mjs --archive-paused` 按 KEEP_RUNS 显式声明保留清单移入 `runs-archive/`；`archive-manifest.json` denyPrefixes 排除归档目录。

## 难点 9：演示状态可恢复

API 冷启动从 `docs/reports/runs/<run-id>` 恢复；`metadata.json` 持久化 confirm / retry / PR 元数据。缺失证据 fail-fast，不补造成功。

## 难点 10：业务上下文反哺

`historyRecall` 扫描落盘 evidence；不完整归档 → `degraded` + `skipped`。Planning Agent 将匹配写入 **`plan.history_references`**（H8–H9）。U4 后语义召回与 token 召回取并集，每条引用带 `match_type` 与 `similarity_score`。

## 难点 11：AI 双路径与可观测

rules：`rules-first-p0`，tokens=0，仅支持已注册演示模式，未知需求 fail-fast。LLM：模糊输入验收 run `run-2026-05-21T05-58-01-181Z`（非零 tokens）与 U2 `run-l3-multi-turn-clarify`（clarify + clarify-refine）。U3 后 plan 阶段也可写 `ai-calls.jsonl`，`run-plan-llm-driven` 证明 `stage=plan` 非零 tokens。当前代码要求 AI call summaries 显式写入，`aiUsage` 持久化后再由读取路径校验；跨 run AI Usage 只聚合 passed run，不完整或不一致归档进入 `skipped`。

## 难点 12：PR 创建不伪造

GitHub PR 隔离在 `external/git-provider`；缺配置或 API 失败返回错误，不构造假 URL。

## 难点 13：阶段级断点重放

`deliveryPipeline` 事件溯源 + `checkpoints.json`；`POST /api/runs/:id/resume-from-stage` 从指定阶段只重放下游（H5–H7）。阶段推进已收敛为阶段表循环；从 `VERIFYING` 重放只读取上游 diff / plan，从 `PR_DRAFTING` 重放必须读取已有 `verification.json`。`retry` 创建新 run，**不能替代** resume。

## 难点 14：L2 跨栈与影响矩阵

`article-draft-indicator` 同时改 frontend + backend；`planningAgent` 输出 `impact_matrix.cross_stack`（H10–H11）。Planning 现在必须读取真实 sandbox repo path 与目标文件索引；缺 repo path、sandbox root 或目标文件时 fail-fast，不生成空 `sandbox_index`。`cross-stack-sync` 由 Skill 的 `crossStackCheck` 显式声明触发，检查 `article.draft` / `draft-badge` / `DataTypes.BOOLEAN` / controller 默认字段，避免泛文本命中造成假阳性；声明了检查但缺 changed files 会失败，不静默跳过。集成测试见 `planningAgent.test.js`、`verificationAgent.test.js`、`articleDraftIndicator.test.js`、`crossStackSync.test.js`。

## 难点 15：模糊 LLM 与 Skill 匹配

LLM clarify 可能产出英文 goal 导致 Skill 关键词未命中（`run-2026-05-21T05-57-39-036Z`）；registry fail-fast。当前 `findSkill()` 还会拒绝低置信度单关键词和并列候选，避免把混合需求静默路由到第一个 Skill。验收 run 仍匹配 `article-list-display-field` 并完成全链路。

## 难点 16：上游 Conduit 依赖 audit

`sandbox-repo` 有 8 项传递依赖告警；决策见 [`dependency-audit-decision.md`](./dependency-audit-decision.md)。实现仓根 `npm audit` 为 0。

## 答辩口径

1. **不是套壳聊天 UI**：Web 只是入口，核心是 API + Orchestrator + Agents + Skills + sandbox 写入与验证闭环。
2. **不是 mock 仓库**：Conduit 代码位于 `sandbox-repo/`，run evidence 中的 diff 和 verification 都来自真实目标目录。
3. **不是一次性 prompt 工程**：新增模式通过 Skill / schemaChange / validation 声明接入，主流程保持稳定。
4. **不是只看通过截图**：失败、暂停、不完整归档都保留并在汇总里标为 skipped / degraded，避免把坏证据混进成功指标。
