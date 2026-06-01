# Submission Checklist

对齐文档仓 [`docs/06-plan#冲刺关键路径`](../../../../docs/06-plan.md#冲刺关键路径进度-ssot) 与 [`docs/11-acceptance.yaml`](../../../../docs/11-acceptance.yaml)。

## 基础信息

- 项目名称 / 课题：实现一个可以端到端交付全栈项目的“超级个体”
- 团队名称与成员名单：不进入公开仓；通过比赛提交系统单独填写
- 分工说明：不进入公开仓；公开仓只保留技术材料与证据索引

## 证据库卫生（演示前置）

- [x] **H1**：坏归档影响已隔离为 `degraded` / `skipped`，不伪装全量召回；旧失败归档仍可保留为失败证据
- [x] **H2**：`history-recall` 脱离 `invalid_history`（或 spec 对齐命名）

## §2.2 代码/run 证据（S7 视频待录）

- [x] **#1 抽象到位**（H10–H12 + U1/U5）：6 个 Skill；`article-cover-image` schema-driven Skill ≤30 行、`comment-like-count` 非列表 Skill ≤50 行；新模式不改 Orchestrator/Agent 主干
- [x] **#2 断点重放**（H5–H7）：`resume-from-stage`；plan 后改输入，只重跑 edit→verify→pr
- [x] **#3 跨栈一致性**（H10–H11 + U1）：`run-l2-auto-cover-image` schema-driven 自动驱动 6 文件 diff；老 L2 exemplar 保留
- [x] **#4 可观测性**（H4,H13 + U3）：§2.2 验收口径 LLM run 非零 tokens；`run-plan-llm-driven` 含 `stage=plan` 非零 tokens；Web 面板可展示
- [x] **#5 业务上下文反哺**（H8–H9 + U4）：相似 run 召回 **写入 plan**；`run-semantic-recall-demo` 含 `match_type=semantic` 和 `similarity_score`
- [x] **#6 澄清深度**（H4 + U2）：**故意模糊**输入 + 真实 LLM 主动追问；`run-l3-multi-turn-clarify` 证明 PM 答复后 LLM refine（清晰 L1 原句 run **不计入**）

> 上述勾选只代表代码 / run 证据已归档；最终评判仍需 S7 演示视频逐项展示六项。

## §7.2 AI 留痕（提交前）

- [x] **S1**：`prompt-changelog.md`（Prompt/Skill 版本与变更意图）
- [x] **S2**：README + `ai-usage.md` 模型清单表（含 **豆包决策**：不强制、P1-5 跳过）
- [x] **S3**：`ai-usage.md` 合规段
- [x] **S4**：`tools-manifest.md`（开发期 Agent/IDE 与配置版本，建议项）
- [x] **S5**：关键对话材料（`clarify-conversation-export.md`）

## 功能说明（答辩叙述）

见 [`defense-prep.md`](./defense-prep.md) 与本 README。

## 交付材料（§8.2）

- 在线 Demo 链接：不进入公开仓；通过比赛提交系统或 external evidence 单独填写
- 演示视频链接：不进入公开仓；通过比赛提交系统或 external evidence 单独填写，脚本见 [`video-recording-guide.md`](./video-recording-guide.md)
- **源代码仓库**：<https://github.com/Xio-Shark/conduit-super-individual>；公开 AI 系统主仓已包含 `sandbox-repo/`
- [x] README / 运行说明：[`README.md`](../../../README.md)

## 技术说明

- [x] 系统架构说明 / 技术栈：[`architecture.md`](./architecture.md)
- [x] AI 使用说明 / Prompt / Skill / Agent 留痕：[`ai-usage.md`](./ai-usage.md)、[`prompt-changelog.md`](./prompt-changelog.md)、[`tools-manifest.md`](./tools-manifest.md)
- [x] 工程难点：[`engineering-notes.md`](./engineering-notes.md)
- [x] 项目亮点 / 创新点（≤3 条）：README 与 [`defense-prep.md`](./defense-prep.md)

## 工程验证

- [x] **H14**：`npm test` 通过（524 项 Node/API/Web/scripts 测试；523 pass / 1 skip），`lint:sandbox`、Conduit Vitest 12 项和 Web build 已复核通过；只证明本地代码门禁，不勾选 §8.2 对外交付
- [x] submission readiness API 会把 Demo/视频/公开仓占位和未勾选最终提交项标为 `pending_human`
- [x] `npm run archive:dry-run` 通过：候选发布包可枚举关键源码、submission 材料、四类 evidence 模板、`sandbox-repo/`、脚本测试与 12 条关键 run（450 files；`manifestHash` / `contentHash` 以最新 dry-run 输出为准）；排除 `.env`、`node_modules`、Web build 产物、测试结果目录和 `runs-archive`
- [x] `npm run check:public-repo -- --repo <fresh-clone-path>` 已接入：发布后可校验 fresh clone 的 required 路径、关键 run、submission 占位、禁入路径、常见 secret 模式、保留示例域名 / 模板替换 token / 示例路径段和 Git clean 状态；不创建或证明远端 URL
- [x] `npm run check:external-submission` 已接入：读取 `docs/reports/submission/external-submission-evidence.json`，校验团队信息、Demo/视频/公开仓 URL、3–8 分钟视频覆盖项、fresh clone 路径与结果、远端 secret scanning 与最终提交确认；`publicRepo.freshClonePath` 必须是本机存在的目录且 `freshCloneCheckStatus` 必须为 `passed`；发布日传入 `--public-repo <fresh-clone-path>` 或 `PUBLIC_REPO_CLONE_PATH` 后，还会要求 evidence 路径与发布日 fresh clone 路径一致；保留示例域名、示例路径段、模板替换 token 和占位链接会被拒绝；脚本可用 `--write-template <path>` 生成占位模板，但模板不得当作真实证据提交
- [x] `npm run check:video-evidence` 已接入：读取 `docs/reports/submission/video-evidence.json`，校验本地录屏文件、录制纪要、3–8 分钟时长、讲解时间线、§2.1 / §2.2 / U1–U5 / AI usage / public-repo 覆盖和本地证据引用；脚本拒绝公开视频 URL / 上传状态声明，避免替代 `check:external-submission`
- [x] `npm run check:defense-rehearsal` 已接入：读取 `docs/reports/submission/defense-rehearsal-evidence.json`，校验 Q&A 演练覆盖 architecture、U1–U6、submission boundary，要求 ≥8 个已回答问题、≥2 个追问、10–120 分钟时长、非空录屏 / 纪要 / 本地证据引用和 `openIssues=[]`；脚本不替代真实人工演练
- [x] `npm run scaffold:submission-evidence` 已接入：统一生成 `u6-rehearsal-manifest.template.json`、`video-evidence.template.json`、`external-submission-evidence.template.json`、`defense-rehearsal-evidence.template.json`；这些模板保留占位符，只能复制/改名后填入真实证据，不可直接当作通过证据
- [x] U6 演练模板与校验脚本存在：`npm run scaffold:u6` 可生成 3 题 manifest 模板；`npm run check:u6 -- ...` 可校验单题 run/Skill/registry/实现改动清单/计时/录屏证据，并拒绝 Orchestrator / Agent / API / Web 主干改动；`npm run check:u6 -- --manifest <path>` 可校验 3 题批次、≥2 题通过和 runId/skillId 去重；模板和脚本不把真实演练标为完成
- [x] `npm run check:submission-gates` 已接入：聚合 archive dry-run、U6 manifest、本地视频证据、外部提交证据、Q&A 演练、fresh clone `check:public-repo` 与 `pre-submission-check.sh`，输出统一 `blockers`、`openPlanItems`，并为每个 gate / blocker 标出 `planItems` 与 `requiredEvidence`；缺真实计时/录屏/外部 URL/fresh clone/最终提交证据时会失败，不替代人工执行
- [ ] `PUBLIC_REPO_CLONE_PATH=<fresh-clone-path> scripts/pre-submission-check.sh` 通过（当前会先运行 archive dry-run，再聚合报告 6 类外部门禁阻塞：公开发布清单路径未全部被 Git 跟踪、关键源码 / run / submission / sandbox 发布路径仍未准备成 tracked public repository、§8.2 Demo/视频/公开仓占位、最终外部提交 checklist 未完成、外部提交证据 JSON 缺失或不完整、缺少或未通过远端 fresh clone `check:public-repo`、外部证据 JSON 中 fresh clone 路径与 `PUBLIC_REPO_CLONE_PATH` 不一致；readiness 失败后不会继续跑 `npm run verify`；即使发布日脚本通过，也仍需人工验证公开 URL、Demo、视频）
- [x] **H15–H16**：对照 `docs/11` / `docs/12` 勾选（29/33 AC verified；AC-F006-02、AC-F011-01 partial；AC-F011-02/03 manual_pending；U1-U5 acceptance 与 traceability 已同步）
- [ ] **S9**：公开发布当天最终安全检查通过（当前仅已生成 [`security-check-report.md`](./security-check-report.md)，仍需重跑脚本与远端扫描）
- [x] **X1**：`sandbox-repo` audit 决策（[`dependency-audit-decision.md`](./dependency-audit-decision.md)）

## 答辩准备（S10）

- [x] 材料包索引：[`defense-prep.md`](./defense-prep.md)
- [x] 四类证据模板已生成：`u6-rehearsal-manifest.template.json`、`video-evidence.template.json`、`external-submission-evidence.template.json`、`defense-rehearsal-evidence.template.json`
- [ ] 本地视频证据通过：`npm run check:video-evidence`（需 `video-evidence.json`、本地录屏、纪要和每段证据引用）
- [ ] 真实 Q&A 演练记录通过：`npm run check:defense-rehearsal`（需 `defense-rehearsal-evidence.json`、录屏、纪要与每题证据）
- [ ] 6.10 前对外提交：Demo 链接 + 视频 + 公开 AI 系统主仓（人工）

## 结果说明（≤3 条亮点，映射 §2.2）

见 README 与 [`defense-prep.md`](./defense-prep.md)。
