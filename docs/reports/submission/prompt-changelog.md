# Prompt / Skill Changelog

对齐文档仓 [`docs/05-dev.md#ai-使用留痕`](../../../../docs/05-dev.md#ai-使用留痕) 与 §7.2-1（Prompt / Skill 版本与变更意图）。

**时间线来源**：run 归档 + 当前工作区文件。远端公开仓 URL 见 [`public-repo-guide.md`](./public-repo-guide.md)（待填）；公开前须按发布指南确认关键路径已进入 Git 跟踪或 archive 清单。该确认只是本地发布候选校验，不是远端公开仓证据，也不替代 §8.2 外部门禁。

**豆包决策（2026-05-21）**：不强制豆包；P1-5 已团队决策跳过。§2.2 #6 以 `run-2026-05-21T05-58-01-181Z`（`mimo-v2.5`，单轮模糊）+ `run-l3-multi-turn-clarify`（`mimo-v2.5`，多轮 refine）双重举证。早期 doubao 清晰 L1 run 为 legacy 探索，不计入 #6。详见 [`ai-usage.md`](./ai-usage.md)。

---

## 迭代策略摘要

1. **clarify 双路径**：`AI_MODE=rules` 用规则工厂（`rules-first-p0`）；`AI_MODE=llm` 用 `clarifyWithLlm` + 远端模型（验收 run 使用 `mimo-v2.5`）。
2. **plan 双路径**：`PLAN_MODE=rules` 走确定性 Planning Agent；`PLAN_MODE=llm` 走 `planWithLlm` 并写入 `ai-calls.jsonl`（U3）。
3. **rules 模式 fail-fast**：只支持已注册演示模式；未知需求不再默认套用阅读量主线，须走 LLM 澄清或新增 Skill。
4. **新增需求模式优先新增 Skill 文件**，注册到 `services/skills/src/registry.js`，并在 Skill 元数据声明 `planSummary`，不改 Orchestrator / Agent 主干（§2.2 #1）。
5. **模糊输入**须产出 `clarifications[]` 开放问题；U2 后支持 PM 答复历史进入第二轮 refine；清晰 L1 原句的 legacy 探索 run **不计入** §2.2 #6 验收口径。

---

## Prompt 变更记录

### 1. `rules-first-p0`（规则澄清，非 LLM Prompt）

| 字段 | 内容 |
|------|------|
| 标识 | `rules-first-p0` |
| 版本 | 隐式 `1.0.0`（无独立 Prompt 文件） |
| 源码 | `services/agents/src/requirementAgent.js` |
| 引入时间 | 2026-05-20（首批 rules run 归档） |
| 变更意图 | 代码级 P0 胶水：按关键词路由 L1 阅读量 / L2 草稿 / 详情字数 / Popular Tags，输出结构化需求卡片；tokens/延迟/成本恒为 0 |
| 关键规则 | 阅读量 → L1 且 exclude 后端；草稿 → L2 跨栈；字数 → L1 详情页；Popular Tags → L1；未知 rules 输入 fail-fast |
| 验收证据 | `run-2026-05-21T02-16-15-215Z`（代码级 P0 L1 闭环） |

### 2. `clarify-llm-system` · `1.0.0-llm`

| 字段 | 内容 |
|------|------|
| 常量 | `CLARIFY_PROMPT_VERSION = "1.0.0-llm"`（已升级到 `2.0.0-llm`，见 §3） |
| 源码 | `services/agents/src/clarifyWithLlm.js` |
| 引入时间 | 2026-05-21（H3/H4 模糊 LLM 验收前接入） |
| 变更意图 | §2.2 #6 澄清深度：模糊/缺边界输入必须主动追问，禁止静默决策；L1 列表展示任务不得擅自扩后端 |
| 关键规则摘要 | 仅返回 JSON 需求卡片；`clarifications` 须为 PM 可回答的开放问题；L1 阅读量假数据场景 exclude 后端 schema |
| 配套校验 | `services/agents/src/requirementCard.js` 缺字段直接失败 |
| 验收证据 | `run-2026-05-21T05-58-01-181Z`（`mimo-v2.5`，248/1818 tokens，3 条 `clarifications[]`） |
| 备注 | 验收 run 是收紧前归档，`prompt_version` 显示 `1.0.0`；当前代码路径不再回退到 `skill_version`，缺 `prompt_version` / summaries 会失败 |

### 3. `clarify-llm-system` · `2.0.0-llm`（U2 多轮 clarify）

| 字段 | 内容 |
|------|------|
| 常量 | `CLARIFY_PROMPT_VERSION = "2.0.0-llm"` |
| 源码 | `services/agents/src/clarifyWithLlm.js`（`proposeClarifications` + `refineWithAnswers`） |
| 引入时间 | 2026-05-22（docs/13 §U2 升级项） |
| 变更意图 | §2.2 #6 澄清深度从「单轮一锅端」升级到「真多轮迭代」：PM 答复 → LLM 再决定追问或收敛 |
| Response shape | `{ "decision": "finalize" \| "clarify", "requirement_card": <card> \| null, "pending_questions": [{ id, text }] }` |
| 关键规则 | (a) 充分时 `decision=finalize` 输出完整 `requirement_card`；(b) 仍歧义时 `decision=clarify` + 非空 `pending_questions`；(c) `pending_questions[].id` 唯一非空；(d) refine 输入必须含历史 `{ question, answer }` 列表；(e) backwards-compatible：legacy 直接 card JSON 仍接受，normalize 为 `finalize` |
| 配套 API | `POST /api/runs/:id/answer-clarification`（仅允许回答当前 `pendingQuestions[]`；写 `clarification-history.jsonl`，每行 `{ runId, questionId, question, answer, answeredAt }`；同一当前问题不可重复答复，后续轮可复用 `questionId` 但须按问题文本重新匹配） |
| 配套状态机 | `RUN_STAGES.CLARIFYING_AWAITING_ANSWER` + `paused.json.pendingQuestions[]` |
| 配套 Web | `apps/web/src/components/ClarificationsPanel.jsx` 显示每个 question 的输入框 + Submit；提交后调用 answer API 并 re-render 新 pendingQuestions |
| 验收证据 | `run-l3-multi-turn-clarify`（≥ 2 轮 LLM 调用；第二轮 prompt 含首轮答复）；`clarification-history.jsonl` 行数 ≥ 2 |
| 降级路径 | LLM 自主性失稳时降级到 2 轮硬模板（第一轮固定 3 问 / 第二轮基于答复挑 1 个深问）；不回退到单轮 |

### 4. Legacy 探索：`doubao-seed-2-0-lite-260428`（不计入 §2.2 #6）

| 字段 | 内容 |
|------|------|
| 模型 | `doubao-seed-2-0-lite-260428` |
| 时间 | 2026-05-20 17:26–17:37 UTC |
| 变更意图 | 早期 LLM 网关连通性探索；输入为**清晰 L1 原句**（非模糊验收口径） |
| 证据 | `run-2026-05-20T17-37-55-856Z`、`run-2026-05-20T17-26-03-046Z` |
| 状态 | **legacy**；当前产品路径已切换为 `AI_MODE=llm` + `mimo-v2.5` |

---

## Skill 变更记录

| Skill ID | 版本 | 等级 | 引入 / 证据 run | 变更意图 | 匹配关键词 | 目标路径 | 改主干？ |
|----------|------|------|-----------------|----------|------------|----------|----------|
| `article-list-display-field` | 1.0.0 | L1 | 2026-05-20；`run-2026-05-21T02-16-15-215Z` | P0 主线：文章列表卡片增加阅读量（前端假数据） | 文章列表、阅读量、展示字段 | `ArticlesPreview.jsx`、`styles.css` | 否（首个 Skill） |
| `article-draft-indicator` | 1.0.0 | L2 | 2026-05-21 05:52；`run-2026-05-21T05-52-12-490Z` | §2.2 #3 跨栈：列表与 API 一致展示草稿 | 草稿、draft | frontend + `Article.js` + `articles.js` | 否（仅新增 Skill + registry 注册） |
| `article-detail-word-count` | 1.0.0 | L1 | 2026-05-21 05:52；`run-2026-05-21T05-52-18-277Z` | §2.2 #1 第三模式：详情页字数统计 | 字数、word count、详情页 | `Article.jsx`、`styles.css` | **否**（仅新增 1 个 Skill 文件） |
| `popular-tags-top-five` | 1.0.0 | L1 | 2026-05-21 06:24；`run-2026-05-21T06-24-47-248Z` | §2.2 #1 第四模式：Popular Tags 前 5 打标 | popular tags、热门标签 | `Home.jsx` / tag list 相关路径 | **否** |
| `article-cover-image` | 1.0.0 | L2 / U1 | 2026-05-22；`run-l2-auto-cover-image` | schema-driven 跨栈自动驱动：Skill 只声明 `schemaChange`，目标文件由 codegen 推断 | 封面图、cover image | backend model/controller + frontend preview + 新生成 TS/service/mock | **否**（Skill ≤30 行） |
| `comment-like-count` | 1.0.0 | L2 / U5 | 2026-05-22；`run-l2-comment-like` | 非文章列表模式：评论点赞计数，证明 Skill 多样性 | 评论点赞、comment like | Comment model/controller/route + CommentList + vitest | **否**（Skill ≤50 行） |

**Skill 注册**：`services/skills/src/registry.js` — `findSkill()` 按 `appliesWhen` 关键词匹配；无匹配则 fail-fast（见失败 run `run-2026-05-21T05-57-39-036Z`）。

**Planning 边界**：`services/agents/src/planningAgent.js` 不再按 `skill.id` 分支生成摘要；每个 Skill 必须声明 `planSummary`，漏填直接失败，避免未知 Skill 被静默写成阅读量方案。

**Verification 边界**：`services/agents/src/verificationAgent.js` 不再按 `skill.id` 分支触发 L2 检查；跨栈一致性由 Skill-owned `crossStackCheck` 显式声明，缺 changed files 直接失败。

**Skill helper 边界**：`services/skills/src/skillHelpers.js` 只沉淀默认验证清单与锚点断言；不引入动态 registry、DSL 或新的 Skill 执行接口。

---

## 版本演进时间线（按 run 归档）

| 时间 (UTC) | 事件 | Prompt / Skill | 说明 |
|------------|------|----------------|------|
| 2026-05-20 17:09 | 首批 run | `rules-first-p0` + `article-list-display-field` | 工程骨架跑通 |
| 2026-05-20 17:26–17:37 | Legacy LLM 探索 | doubao + 清晰 L1 输入 | 非 §2.2 #6 验收口径 |
| 2026-05-21 02:16 | 代码级 P0 闭环 | rules + L1 Skill | `run-2026-05-21T02-16-15-215Z` |
| 2026-05-21 05:51 | 历史召回入 plan | rules | `run-2026-05-21T05-51-56-519Z`（§2.2 #5） |
| 2026-05-21 05:52 | L2 + 第 3 Skill | +draft-indicator、+detail-word-count | H10–H12 |
| 2026-05-21 05:57 | 模糊 LLM 迭代 | `1.0.0-llm` | 404 失败 → 澄清成功 → Skill 匹配失败 → 最终通过 |
| 2026-05-21 05:58 | **§2.2 验收 run** | `1.0.0-llm` + `mimo-v2.5` | `run-2026-05-21T05-58-01-181Z` |
| 2026-05-21 15:55 | rules fail-fast 收紧 | `rules-first-p0` | 未知需求不再静默落到阅读量；恢复路径必须读取已落盘 `ai-calls.jsonl` |
| 2026-05-22 | U2 多轮 clarify + U1 schema-driven | `2.0.0-llm`、`article-cover-image` | 拆分 `proposeClarifications`/`refineWithAnswers`；新增 `answer-clarification` API + `clarification-history.jsonl` + `CLARIFYING_AWAITING_ANSWER` 状态；schemaDriver 自动驱动 `articleCoverImage` 跨栈 6 文件（`run-l2-auto-cover-image`） |
| 2026-05-22 | U3 plan LLM + U4 semantic recall + U5 comment Skill | `plan-llm-system` v1.0.0、`comment-like-count` | `run-plan-llm-driven` 出现 `stage=plan` 非零 tokens；`run-semantic-recall-demo` 含 `match_type=semantic`；`run-l2-comment-like` 跨评论域 |

---

## 关键 run 与 Prompt/Skill 对应

| Run ID | 模式 | Prompt / 模型 | Skill | 结果 |
|--------|------|---------------|-------|------|
| `run-2026-05-21T02-16-15-215Z` | rules | `rules-first-p0` | `article-list-display-field` | passed |
| `run-2026-05-21T05-51-56-519Z` | rules | `rules-first-p0` | `article-list-display-field` | passed；plan 含 history_references |
| `run-2026-05-21T05-52-12-490Z` | rules | `rules-first-p0` | `article-draft-indicator` | passed；L2 cross_stack |
| `run-2026-05-21T05-52-18-277Z` | rules | `rules-first-p0` | `article-detail-word-count` | passed；第三 Skill |
| `run-2026-05-21T05-57-01-385Z` | llm | 网关 404 | — | failed |
| `run-2026-05-21T05-57-20-736Z` | llm | `mimo-v2.5` | `article-list-display-field` | passed clarify；中文 goal + clarifications |
| `run-2026-05-21T05-57-39-036Z` | llm | `mimo-v2.5` | — | failed；英文 goal 未命中 Skill 关键词 |
| `run-2026-05-21T05-58-01-181Z` | llm | `mimo-v2.5` | `article-list-display-field` | **passed**；§2.2 #4/#6 验收证据 |
| `run-l2-auto-cover-image` | rules + schema-driven | `rules-first-p0` | `article-cover-image` | **passed**；U1 跨栈自动驱动 |
| `run-l3-multi-turn-clarify` | llm | `2.0.0-llm` + `mimo-v2.5` | — | **passed**；U2 多轮 clarify/refine，history 4 行 |
| `run-plan-llm-driven` | rules + plan llm | `plan-llm-system` + `mimo-v2.5` | `article-list-display-field` | **passed**；U3 `stage=plan` 非零 tokens |
| `run-semantic-recall-demo` | rules + semantic recall | `rules-first-p0` | `article-detail-word-count` | **passed**；U4 `match_type=semantic` |
| `run-l2-comment-like` | rules | `rules-first-p0` | `comment-like-count` | **passed**；U5 非列表 Skill |

---

## 失败驱动的 Prompt / Skill 约束（留痕）

| 失败 run | 原因 | 后续约束 |
|----------|------|----------|
| `run-2026-05-21T05-57-01-385Z` | LLM 网关 404 | 修正 `LLM_BASE_URL` 后重跑 |
| `run-2026-05-21T05-57-39-036Z` | LLM 输出英文 goal，Skill 关键词未匹配 | 保留 fail-fast；答辩 run 仍匹配到 `article-list-display-field` |
| H1 坏归档（3 条） | 缺 `requirement.md` | history-recall 标 `degraded` / `skipped`，不伪装 ready |
| 跨 run AI Usage 污染风险 | 失败/暂停归档也可能有 `ai-calls.jsonl` | 只聚合 passed run，且要求 `run-summary.json.aiUsage` 与日志一致；其它归档进入 `skipped` / `invalidRuns` |

---

## 关联材料

- AI 使用说明：[`ai-usage.md`](./ai-usage.md)
- 模糊澄清对话导出：[`clarify-conversation-export.md`](./clarify-conversation-export.md)（S5）
- 开发工具清单：[`tools-manifest.md`](./tools-manifest.md)（S4）
- 单轮模糊验收 run 证据目录：`docs/reports/runs/run-2026-05-21T05-58-01-181Z/`
- 多轮澄清升级 run 证据目录：`docs/reports/runs/run-l3-multi-turn-clarify/`
