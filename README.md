# Conduit Super Individual

面向 Conduit 的端到端 AI 交付系统：PM 输入需求，系统完成澄清、方案、真实 `sandbox-repo` 写入、验证和 PR 草稿。公开提交目标是本实现仓，且必须包含 `sandbox-repo/`；不是直接向上游 Conduit 提 PR。

## 5 分钟 Demo 路径

```bash
npm install && npm install --prefix sandbox-repo
npm run verify
BLOCK_ON_CONFIRM=1 AI_MODE=llm PLAN_MODE=llm npm run dev
```

- UI 入口：`http://localhost:5173`
- 关键 run：`run-l3-multi-turn-clarify`（多轮 LLM 澄清）、`run-plan-llm-driven`（plan 阶段 LLM）、`run-l2-auto-cover-image`（schema-driven 跨栈自动驱动）
- 兜底 run：`run-2026-05-21T02-16-15-215Z`（L1 rules 主线）、`run-l2-comment-like`（非文章列表 Skill）、`run-semantic-recall-demo`（语义召回）

## 当前状态

- 代码级 P0 已闭合：`AI_MODE=rules npm run run:p0` 可跑 L1「文章列表阅读量，前端假数据，不改后端」到 PR 草稿。
- §2.2 六项代码 / run 证据已齐：6 个 Skill、断点重放、跨栈自动驱动、AI Usage、语义召回、多轮 LLM 澄清。
- 课题完成仍依赖人工外部项：演示视频、Demo URL、external evidence 和最终提交确认。
- 公开仓不包含团队名称、成员姓名或联系方式；这些个人/团队信息通过比赛提交系统单独填写，不进入 public repository。

## 运行说明

### 环境要求

| 项 | 要求 |
|----|------|
| Node.js | 20+ |
| npm | 随 Node 安装即可 |
| Git | 用于 `sandbox-repo/` diff、fresh clone 校验 |
| 可选 LLM 配置 | `AI_MODE=llm` 或 `PLAN_MODE=llm` 时需要 `LLM_API_KEY`、`LLM_MODEL`、`LLM_BASE_URL` |
| 可选 GitHub 配置 | 仅创建真实 draft PR 时需要 `GITHUB_TOKEN`、`GITHUB_OWNER`、`GITHUB_REPO` |

### 安装

```bash
npm install
npm install --prefix sandbox-repo
```

### 本地启动

稳定演示推荐先用 rules 模式启动：

```bash
AI_MODE=rules PLAN_MODE=rules npm run dev
```

需要演示人工确认 / 断点重放时开启确认阻塞：

```bash
BLOCK_ON_CONFIRM=1 AI_MODE=rules PLAN_MODE=rules npm run dev
```

需要现场调用 LLM 时，先在 `.env` 填写 `LLM_*`，再启动：

```bash
BLOCK_ON_CONFIRM=1 AI_MODE=llm PLAN_MODE=llm npm run dev
```

访问 `http://localhost:5173`。API 默认监听 `http://localhost:3001`。

### 验证命令

| 命令 | 用途 |
|------|------|
| `npm run test` | Node/API/Web/scripts 单测 |
| `npm run lint:sandbox` | 对 Conduit 目标改动跑 ESLint / Stylelint |
| `npm run test --prefix sandbox-repo` | Conduit Vitest |
| `npm run build -w apps/web` | Web 生产构建 |
| `npm run verify` | 聚合本地代码门禁 |
| `npm run archive:dry-run` | 检查候选发布包路径、run 证据和禁入项 |

### 典型演示流程

1. 运行 `npm run dev` 并打开 Web 控制台。
2. 输入需求，创建 DeliveryRun。
3. 查看 Requirement / Plan / Diff / Verification / PR Draft 面板。
4. 用 `run-l3-multi-turn-clarify` 展示多轮澄清，用 `run-plan-llm-driven` 展示 plan 阶段 LLM 调用，用 `run-l2-auto-cover-image` 展示 schema-driven 跨栈自动驱动。
5. 最终证据落在 `docs/reports/runs/<run-id>/`，提交材料落在 `docs/reports/submission/`。

## 目录

```text
apps/web/                 React + Vite 控制台
apps/api/                 Express API
services/orchestrator/    状态机、证据归档、checkpoint
services/agents/          Requirement / Planning / Coding / Verification / PR
services/skills/          6 个 Skill 与注册表
services/codegen/         schemaDriver + frontendGenerators
services/index/           sandbox index + 语义召回
services/sandbox/         Conduit 读写、diff、命令执行
external/                 GitHub provider / model client
libs/types/               共享阶段常量
docs/reports/             run 证据与 submission 材料
sandbox-repo/             Conduit 真实代码目录，公开仓必须包含
```

## 配置

复制 `.env.example` 到 `.env`，只在本地填写真实密钥；不要提交 `.env`。

```bash
AI_MODE=rules
PLAN_MODE=rules
SANDBOX_REPO_PATH=./sandbox-repo
LLM_API_KEY=
LLM_MODEL=
LLM_BASE_URL=
GITHUB_TOKEN=
GITHUB_OWNER=
GITHUB_REPO=
API_PORT=3001
```

- `AI_MODE=rules`：确定性 P0 胶水链路。
- `AI_MODE=llm`：真实 LLM clarify；用于 §2.2 #6。
- `PLAN_MODE=llm`：plan 阶段真实 LLM；用于 U3 / 可观测性。
- `GITHUB_*`：仅 H17 可选 draft PR 使用；代码级 P0 只要求本地 `pr-draft.md`。

## 常用命令

```bash
npm run dev                 # API :3001 + Web :5173
npm run run:p0              # 固定 L1 rules run
npm run run:fuzzy-llm       # 模糊输入 LLM 澄清，需 LLM_*
npm run test
npm run verify              # Node/API/Web/scripts + sandbox lint + Conduit Vitest + Web build
npm run archive:dry-run     # 本地发布候选清单检查
npm run scaffold:submission-evidence
npm run scaffold:submission-evidence -- --markdown
npm run scaffold:submission-evidence -- --commands
npm run scaffold:submission-evidence -- --commands --write docs/reports/submission/scaffold-evidence.sh
npm run scaffold:submission-evidence -- --copy-final
npm run scaffold:submission-evidence -- --kind video-evidence --commands
npm run scaffold:submission-evidence -- --kind video-evidence --copy-final
SCAFFOLD_SUBMISSION_EVIDENCE_COPY_FINAL=1 npm run scaffold:submission-evidence -- --commands
SCAFFOLD_SUBMISSION_EVIDENCE_RUN_VALIDATION=1 FRESH_CLONE_PATH=/path/to/fresh/clone npm run scaffold:submission-evidence -- --commands
npm run scaffold:submission-evidence -- --kind external-submission --public-repo /path/to/fresh/clone --markdown
npm run check:video-evidence
npm run check:external-submission
npm run check:submission-gates
npm run submission:next-steps
npm run submission:next-steps -- --summary
npm run submission:next-steps -- --summary --write docs/reports/submission/next-steps-summary.json
npm run submission:next-steps -- --markdown
npm run submission:next-steps -- --commands
npm run submission:next-steps -- --next --markdown
npm run submission:next-steps -- --markdown --blocker video
npm run submission:next-steps -- --markdown --category public-repo
npm run submission:next-steps -- --markdown --plan-item S7
npm run submission:next-steps -- --markdown --write docs/reports/submission/next-steps.md
npm run submission:next-steps -- --commands --write docs/reports/submission/next-steps.sh
npm run submission:next-steps:summary
npm run submission:next-steps:summary:write
npm run submission:next-steps:markdown
npm run submission:next-steps:commands
npm run submission:next-steps:commands:write
npm run submission:next-steps:next
npm run submission:next-steps:next:summary
npm run submission:next-steps:next:summary:write
npm run submission:next-steps:next:markdown
npm run submission:next-steps:next:commands
npm run submission:next-steps:next:commands:write
SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS=1 npm run submission:next-steps -- --commands
SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1 FRESH_CLONE_PATH=/path/to/fresh/clone npm run submission:next-steps -- --commands
npm run check:public-repo -- --repo <fresh-clone-path>
PUBLIC_REPO_CLONE_PATH=<fresh-clone-path> bash scripts/pre-submission-check.sh
```

上述 `check:*` 脚本默认输出 JSON；兼容自动化调用里的 `--json` 参数，缺证据或缺参数时也保持结构化失败输出，但 `--json` 不会放宽任何必填证据或人工 gate。

`scaffold:submission-evidence` 统一生成 U6、S7 视频、外部提交和 Q&A 演练的 `*.template.json`，只作为人工填写起点；可传 `--markdown` 输出人工交接清单，或传 `--commands` 输出 shell-safe 命令清单。传 `--kind <kind>` 可只聚焦 `u6-rehearsal`、`video-evidence`、`external-submission` 或 `defense-rehearsal` 中的一类；传 `--copy-final` 会显式把缺失的最终 evidence JSON 从模板复制出来，便于人工填写，但不会覆盖已有最终文件，也不会让占位 evidence 通过校验。`--commands` 默认不复制最终 evidence JSON、也不执行验证；只有显式设置 `SCAFFOLD_SUBMISSION_EVIDENCE_COPY_FINAL=1` 才会调用 `scaffold:submission-evidence -- --kind <kind> --copy-final` 复制缺失的最终占位 evidence，只有显式设置 `SCAFFOLD_SUBMISSION_EVIDENCE_RUN_VALIDATION=1` 才会执行验证，涉及外部提交校验时还需设置 `FRESH_CLONE_PATH`。传入 `--public-repo <fresh-clone-path>` 会把发布日 fresh clone 路径传播到 external-submission 的 handoff / validate 命令；commands 输出会把该路径作为 `FRESH_CLONE_PATH` 默认值，仍需显式 opt-in 才会执行验证。传入 `--write <path>` 可保存同一份 JSON / Markdown / commands 输出；commands 输出会写成可执行 bash 脚本，并拒绝写到最终 evidence JSON 文件。模板、最终占位 evidence 和 `--write` 输出都会拒绝项目外路径、symlink 父目录逃逸和 symlink 目标文件。`check:video-evidence` 读取 `docs/reports/submission/video-evidence.json`，校验本地录屏文件、讲解时间线、3–8 分钟时长、§2.1 / §2.2 / U1–U5 / AI usage / public-repo 覆盖和本地证据引用；它不上传视频、不验证公开视频 URL，也不替代 `check:external-submission`。

`check:external-submission` 读取 `docs/reports/submission/external-submission-evidence.json`，只校验人工记录的团队、Demo、视频、公开仓、fresh clone 路径、远端 secret scanning 和最终提交证据是否完整；其中 `publicRepo.freshClonePath` 必须是本机存在的 fresh clone 目录，且 `freshCloneCheckStatus` 必须为 `passed`。当传入 `--public-repo <fresh-clone-path>` 或设置 `PUBLIC_REPO_CLONE_PATH` 时，脚本还会要求 evidence 中的 fresh clone 路径与发布日指定路径一致。它不创建 URL、不上传视频、不发布仓库。`check:submission-gates` 聚合 archive、U6、video、external、Q&A、fresh clone 和 pre-submission 本地门禁；缺真实证据时会失败，并在 JSON 中输出 `openPlanItems`、每个 gate / blocker 的 `planItems`、`requiredEvidence` 与 `categoryCounts`。`submission:next-steps` 复用同一 gate JSON，只输出精简 blocker / nextSteps 摘要，并把模板准备、人工输入和验证命令展开到 `actionPlan[]`；同时输出 `evidenceChecklist`、`actionSummary`、`nextClosureActionSummary`、`closureSequence[]`、`categoryBlockers[]` 和 `availableFilters`，其中 `evidenceChecklist` 汇总当前过滤范围内需要人工填写的 evidence JSON、对应 `scaffold:submission-evidence -- --kind ...` handoff / copy-final 命令、必须提供的外部输入和对应验证命令，`actionSummary` 汇总 evidence 文件数、人工输入数、验证命令数、可 scaffold 的 blocker、需要 fresh clone 路径的 blocker，以及缺少准备动作或验证命令的 blocker；`nextClosureActionSummary` 用同一口径汇总当前视图最早未闭合收口组，便于不用再跑 `--next` 也能看到眼前动作量，`closureSequence[]` 与面向人工执行的 `actionPlan[]` 按本地 evidence → public repo fresh clone → external evidence → pre-submission gate 排序。`categoryBlockers[]` 把每个失败分类映射回 blocker id、计划项和验证命令；当失败 check 带 `evidence[]` 时，Markdown / commands 输出会显示最多 5 条截断 evidence 摘要和剩余数量，避免 `git-tracking` 等分类刷屏。`availableFilters` 列出当前可用的 `--blocker` / `--category` / `--plan-item` 过滤值。默认输出还会给出 `firstOpenClosureStep`、`fullGateFirstOpenClosureStep`、`fullGateSuggestedNextCommand`、`suggestedNextCommand`、`nextClosureCommandsWriteCommand`、`currentViewNextCommand`、`currentViewCommandsWriteCommand`、`currentViewSummaryWriteCommand`、`filterState`、`prerequisiteState`、`completionSemantics`、`nextStepFocus`、`actionSummary`、`nextClosureActionSummary`、`scriptWriteRecommendation` 和 `summaryWriteRecommendation`，提示下一次应优先运行的 `--next` 聚焦命令，给出保留当前过滤器并安全写入 commands 脚本或 summary JSON 的命令，标明过滤视图隐藏了多少完整 gate blocker，明确只有完整 gate 通过且 blocker 为 0 时才能标记提交完成，并标明过滤视图是否正在使用 `categoryNextSteps` 覆盖普通 `nextStep`；`scriptWriteRecommendation` 让自动化明确识别 commands 输出应通过 `--write`、`submission:next-steps:commands:write` 或 `submission:next-steps:next:commands:write` 保存，避免 shell 重定向污染脚本；`summaryWriteRecommendation` 让自动化明确识别 summary 输出应通过 `--summary --write`、`submission:next-steps:summary:write` 或 `submission:next-steps:next:summary:write` 保存，避免 shell 重定向污染 JSON。`fullGateSuggestedNextCommand` 始终指向未过滤完整 gate 的最早收口组；`suggestedNextCommand` 则保留当前过滤器，用于继续查看当前聚焦视图；`nextClosureCommandsWriteCommand` 则把下一收口组聚焦视图直接保存为 `docs/reports/submission/next-steps.sh`；`currentViewNextCommand` 在已聚焦视图中优先指向当前 Markdown / JSON / commands 视图的可复制命令，避免 `--next` 视图只显示 `suggestedNextCommand=none`；`currentViewCommandsWriteCommand` 保留当前 `--next` / `--category` / `--plan-item` / `--blocker` 过滤器，并追加 `--commands --write docs/reports/submission/next-steps.sh`，用于保存当前视图而不使用 shell 重定向；`currentViewSummaryWriteCommand` 保留当前过滤器与转发参数，并追加 `--summary --write docs/reports/submission/next-steps-summary.json`，用于保存当前 compact summary JSON。Markdown 输出也会显示当前视图的安全写入命令，并以 `Action summary` 行显示 evidence 文件数、人工输入数、验证命令数、可 scaffold blocker、fresh clone blocker、缺少准备动作的 blocker 和缺少验证命令的 blocker；`Next closure action summary` 用同一格式只显示当前视图最早未闭合收口组；commands 输出也会在脚本头部写入同等 `# action_*` 和 `# next_action_*` 注释。`--public-repo` 和 `--u6-manifest` 会保留到 `forwardedGateArgs[]`、下一步建议命令、下一收口组写入命令和当前视图写入命令里，避免复制 suggested command 时丢失发布日 fresh clone 路径或自定义 U6 manifest。当 commands 输出需要 fresh clone 路径且已传入 `--public-repo` 时，生成脚本会把该路径作为 `FRESH_CLONE_PATH` 默认值；这只减少手工重复输入，验证仍必须显式设置 `SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1`。`prerequisiteState` 会在聚焦视图从较晚收口组开始时列出被跳过的完整 gate 前置步骤，例如先完成 U6 / video / defense 本地证据再处理 release-day pre-submission gate。JSON 输出保留原始 `nextSteps[]` 方便审计完整 gate，同时提供 `focusedNextSteps[]` 表示当前过滤范围内实际用于 `actionPlan[]` 的 next step；`--summary` 输出紧凑 JSON，保留完整 blocker 数、过滤后 blocker 数、隐藏 blocker 数、完整 gate 建议命令、当前视图建议命令、当前视图 summary 写入命令、`actionSummary` / `nextClosureActionSummary` 聚合计数、当前 blocker 和验证入口，适合交接或快速看 gate。需要保存 summary JSON 时应使用 `--summary --write docs/reports/submission/next-steps-summary.json`，或 package shortcut `submission:next-steps:summary:write` / `submission:next-steps:next:summary:write`，避免 `npm run ... > file` 把 npm banner 写入 JSON 文件。传入 `--next` 可只聚焦当前最早未闭合的收口组，例如先只显示 U6 / video / defense 本地证据；传入 `--blocker <id>` 可只聚焦某个精确 blocker（例如 `video`），传入 `--category <name>` 可只聚焦某一类 blocker（例如 `public-repo`），传入 `--plan-item <id>` 可按冲刺清单项聚焦（例如 `S7`），这些过滤器可组合取交集；传入未知过滤值时会输出 `filterWarnings[]` 和可用值提示，`filterState.emptyBecauseOfFilters` 会明确空结果是过滤视图造成的。带 `--category` 时，`blockers[].nextStep`、`focusedNextSteps[]`、`actionPlan[]`、`evidenceChecklist`、`closureSequence`、`planItemBlockers` 与 `categoryBlockers[]` 会优先使用对应 `categoryNextSteps`，例如 public-repo 聚焦视图只提示 fresh clone 校验，而不会混入完整 pre-submission 门禁命令。`blockerCount`、`completionSemantics.fullGateStatus`、`prerequisiteState.fullGateFirstOpenClosureStep`、`fullGateSuggestedNextCommand` 和退出码始终反映完整 gate 状态，不会隐藏其它未闭合人工项；`completionSemantics.filtersChangeCompletion=false` 明确过滤器只改变视图，不改变完成判定。传入 `--markdown` 可输出人工可读清单，传入 `--commands` 可输出 shell-safe 命令清单；如需保存可执行脚本，应使用 `--commands --write docs/reports/submission/next-steps.sh`，避免 `npm run ... > file` 把 npm banner 写入脚本，写出的 bash 脚本会自动设置执行权限。生成脚本默认只打印 `TODO` 和跳过提示，不复制最终 evidence JSON，也不执行验证，并以非零退出提醒 blockers 仍未闭合；当聚焦视图跳过完整 gate 前置步骤时，commands 脚本执行时也会打印 warning、完整 gate next-step 命令和被跳过的 prerequisite 列表，而不是只把这些信息藏在注释里。只有显式设置 `SUBMISSION_NEXT_STEPS_PREPARE_PLACEHOLDERS=1` 时才会通过 `scaffold:submission-evidence -- --kind <kind> --copy-final` 准备缺失的占位 evidence；只有显式设置 `SUBMISSION_NEXT_STEPS_RUN_VALIDATION=1` 时才会执行验证段，涉及 public repo / external / pre-submission 的验证还需自行设置 `FRESH_CLONE_PATH`；即使聚焦视图内的验证命令都执行成功，只要完整 gate 仍是 failed，生成脚本末尾仍会非零退出；如果过滤后没有任何 blocker 但完整 gate 仍 failed，保存后的 commands 脚本直接执行也会非零退出。传入 `--write <path>` 可把同一份 JSON / Markdown / commands 输出写到指定摘要文件；它拒绝写入最终 evidence JSON 文件，且仍会在缺真实证据时失败。`check:public-repo` 只在公开仓发布后校验 fresh clone 内容，不创建或证明 URL。`pre-submission-check.sh` 会在 §8.2 人工项、U6 / 视频 / 答辩演练本地 evidence、外部证据 JSON、Git 跟踪清单、占位链接或 `PUBLIC_REPO_CLONE_PATH` 未闭合时失败，并在末尾输出 `pre-submission-check` JSON summary，这是正确行为；通过本地 `verify`、`archive:dry-run`、external-submission JSON 校验、submission-gates 汇总或 fresh clone 内容检查都不等于最终提交完成。

Summary 写入字段补充：默认输出还会给出 `firstOpenClosureStep`、`fullGateFirstOpenClosureStep`、`fullGateSuggestedNextCommand`、`suggestedNextCommand`、`nextClosureCommandsWriteCommand`、`nextClosureSummaryWriteCommand`、`currentViewNextCommand`、`currentViewCommandsWriteCommand`、`currentViewSummaryWriteCommand`、`filterState`、`prerequisiteState`、`completionSemantics`、`nextStepFocus`、`actionSummary`、`nextClosureActionSummary`、`scriptWriteRecommendation` 和 `summaryWriteRecommendation`。`nextClosureSummaryWriteCommand` 则把下一收口组聚焦 summary 直接保存为 `docs/reports/submission/next-steps-summary.json`；`currentViewSummaryWriteCommand` 保留当前过滤器与转发参数，并追加 `--summary --write docs/reports/submission/next-steps-summary.json`。

Action warnings 字段补充：默认 JSON 输出包含 `actionWarnings[]`；`--summary` 仅在存在缺少准备动作或缺少验证命令的 blocker 时保留该字段。Markdown 会显示 `Action warnings` 行，commands 头部会写入 `# action_warnings=...` 注释。该字段只做交接诊断，不改变完整 gate 完成判定、过滤视图语义或退出码。

Closure progress 字段补充：`closureProgressSummary` 按本地 evidence、公开仓 fresh clone、外部提交 evidence、pre-submission gate 四段收口顺序汇总完整 gate 和当前视图的未闭合 blocker。Markdown 会显示 `Closure progress summary` 行和 `Closure Progress Summary` 小节，commands 头部会写入 `# closure_progress=...` 注释。该字段只做收口顺序提示，不改变完整 gate 完成判定、过滤视图语义或退出码。

## API 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/runs` | 创建并执行 DeliveryRun |
| `GET` | `/api/runs/:id` | 查询内存或归档 run |
| `GET` | `/api/runs/:id/events` | SSE 阶段事件 |
| `GET` | `/api/runs/:id/diff` | 查看真实 git diff |
| `GET` | `/api/runs/:id/pr-draft` | 查看 PR 草稿 |
| `POST` | `/api/runs/:id/resume-from-stage` | 从指定阶段只重放下游 |
| `POST` | `/api/runs/:id/answer-clarification` | 提交多轮澄清答复 |
| `GET` | `/api/ai-usage/summary` | 聚合 passed run 的 AI metrics |
| `GET` | `/api/history` | 相似历史 run 召回 |
| `POST` | `/api/runs/:id/pr` | 显式确认后创建 GitHub draft PR |

## 证据索引

| 能力 | 证据 |
|------|------|
| P0 L1 到 PR 草稿 | `docs/reports/runs/run-2026-05-21T02-16-15-215Z` |
| 多轮 LLM 澄清 | `docs/reports/runs/run-l3-multi-turn-clarify` |
| plan 阶段 LLM | `docs/reports/runs/run-plan-llm-driven` |
| schema-driven 跨栈 | `docs/reports/runs/run-l2-auto-cover-image` |
| 语义召回 | `docs/reports/runs/run-semantic-recall-demo` |
| 非文章列表 Skill | `docs/reports/runs/run-l2-comment-like` |
| 提交材料 | `docs/reports/submission/` |

## 安全与边界

- 真实 API key、EP、Bearer token 只能存在于本地环境变量或部署密钥。
- `.env.example` 只保留占位字段。
- `sandbox-repo/` 是真实 Conduit 目标目录；所有核心 diff 必须来自这里。
- rules 模式用于稳定本地回放；答辩叙事以 LLM clarify + plan LLM run 为主。

更多设计基线见文档仓 `../docs/01-understanding.md`、`../docs/03-spec.md`、`../docs/06-plan.md`、`../docs/13-optimization-plan.md`。
