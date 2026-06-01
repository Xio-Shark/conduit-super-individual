# 公开仓库发布指南（S8）

§8.2 要求：**AI 系统主仓公开**，且内含 **`sandbox-repo/` Conduit 代码目录**。本文档说明结构与发布检查清单；本轮已创建并推送公开 GitHub 仓库。

这里的“公开仓”指公开 `bytedance-implementation/` 这个实现仓，不是向 `TonyMckes/conduit-realworld-example-app` 上游仓库直接提交 PR。真实 draft PR / 上游 PR 是 H17 可选远端能力，当前最小提交不依赖它。

---

## 双仓分工（答辩口径）

| 仓库 | 角色 | §8.2 是否必须公开 |
|------|------|-------------------|
| `bytedance-implementation/` | **AI 系统主仓**（Web + API + Orchestrator + Agents + Skills + 证据） | **是** |
| `bytedance-implementation/sandbox-repo/` | Conduit 代码目录，Skill 改动的真实目标 | **是**（须在主仓内） |
| `bytedance/`（文档仓） | 设计基线 `docs/01`–`12` | 否（可在 README 附链接） |

评审应能从 **一个公开 AI 主仓** 克隆后本地 `npm run verify` 并查看 Conduit diff 来源。

---

## 推荐公开目录结构

```text
conduit-super-individual/          # 公开 AI 主仓根
├── README.md                      # 启动、配置、API、完成判定
├── .env.example                   # 无真实 key
├── apps/web/
├── apps/api/
├── services/
├── external/git-provider/
├── docs/reports/
│   ├── runs/                      # run 证据（含 §2.2 验收 run）
│   └── submission/                # 本目录全部提交材料
├── sandbox-repo/                  # Conduit clone（须一并公开）
│   ├── frontend/
│   ├── backend/
│   └── package.json
└── package.json
```

`sandbox-repo/` 可采用：**同仓子目录**（当前实现）、git submodule、或 subtree — 推荐保持当前 **子目录** 以降低评审克隆成本。

---

## 发布前检查清单

### 必须包含

- [ ] `README.md`：依赖、启动、`AI_MODE`、验证命令
- [ ] `.env.example`（**无**真实 `LLM_API_KEY` / `GITHUB_TOKEN`）
- [ ] `sandbox-repo/` 完整且 `npm install` 可执行
- [ ] `docs/reports/submission/` 全套材料
- [ ] 至少一条 L1 + 一条 §2.2 LLM 验收 run 证据目录

### 必须排除（见 [`security-check-report.md`](./security-check-report.md)）

- [ ] 根目录 `.env`、任何 `*.pem`、真实 token
- [ ] 运行报告中的 Bearer / API key 明文

### 建议 README 补充段落

```markdown
## 设计基线

课题设计文档见：[文档仓链接]（可选）

## Conduit 来源

sandbox-repo 基于 TonyMckes/conduit-realworld-example-app fork/clone。
```

---

## 本地验证（发布前最后一道）

```bash
cd bytedance-implementation
npm run verify
npm run run:p0
# 可选：npm run run:fuzzy-llm（须本地 .env）
```

---

## 发布内容校验（必须人工确认）

本地目录存在不等于公开仓会包含它。发布前必须分别完成本地候选包校验、Git 跟踪清单校验、远端 fresh clone 机器校验和远端公开仓人工复核。

候选归档检查：

```bash
npm run archive:dry-run
```

该命令读取 [`scripts/archive-manifest.json`](../../../scripts/archive-manifest.json)，枚举将进入候选发布包的实现源码、submission 材料、`sandbox-repo/` 与关键 run 证据，并拒绝 `.env`、`node_modules`、Web build 产物、测试结果目录和常见密钥模式。输出中的 `manifestHash` 是候选路径清单 SHA-256，`contentHash` 是路径 + 内容 SHA-256，可用于发布日前后比对候选包是否变化。它只证明**本地候选包内容可枚举且无明显禁入路径**，不替代公开仓 URL、Demo URL、视频 URL、团队信息或最终提交。

Git 跟踪清单检查：

最终门禁由 `scripts/pre-submission-check.sh` 从 `scripts/archive-manifest.json` 读取 required 路径，检查关键 run 证据文件是否已被 Git 跟踪，执行外部提交证据 JSON 校验，并在提供 `PUBLIC_REPO_CLONE_PATH` 后执行远端 fresh clone 内容校验。下面命令只是人工抽查常见关键路径：

```bash
git ls-files --error-unmatch \
  README.md \
  package.json \
  apps/api/src/app.js \
  apps/api/src/apiErrors.js \
  apps/api/src/runExecutionRoutes.js \
  apps/api/src/runEvidenceRoutes.js \
  apps/api/src/runReviewRoutes.js \
  apps/api/src/runRoutes.js \
  apps/api/src/systemRoutes.js \
  apps/web/src/App.jsx \
  apps/web/src/useConsoleController.js \
  apps/web/src/components/ConsoleShell.jsx \
  services/orchestrator/src/orchestrator.js \
  services/agents/src/requirementAgent.js \
  services/skills/src/registry.js \
  services/checks/src/crossStackSync.js \
  scripts/pre-submission-check.sh \
  scripts/check-public-repo.mjs \
  scripts/check-external-submission.mjs \
  scripts/check-video-evidence.mjs \
  scripts/check-submission-gates.mjs \
  docs/reports/submission/checklist.md \
  sandbox-repo/package.json
```

如果上述命令报 `pathspec` / `error-unmatch`，说明该路径尚未被 Git 跟踪；公开前必须先纳入发布清单或改用明确的 archive 打包流程。`git status --short` 中的 `?? sandbox-repo/`、`?? docs/reports/runs/...`、`?? scripts/` 都不能当作已发布证据。

远端 fresh clone 校验：

```bash
npm run check:public-repo -- --repo <fresh-clone-path>
```

该命令读取 fresh clone 内的 `scripts/archive-manifest.json`，复核 required 路径、12 条关键 run 的证据文件、禁入路径、submission 占位符、保留示例域名 / 模板替换 token / 示例路径段、常见 secret 模式和 Git clean 状态。它只校验**公开仓克隆后的内容**，不会创建或证明远端 URL、Demo URL、视频 URL、团队信息，也不替代最终 §8.2 提交。

外部提交证据校验：

```bash
npm run check:external-submission
```

该命令读取 `docs/reports/submission/external-submission-evidence.json`，校验团队信息、Demo/视频/公开仓 URL、3–8 分钟视频覆盖 `p2.1` / `p2.2-1` 至 `p2.2-6` / `ai-usage` / `public-repo`、fresh clone 路径与结果、远端 secret scanning 结果和最终提交确认。`publicRepo.freshClonePath` 必须指向本机存在的 fresh clone 目录，且 `publicRepo.freshCloneCheckStatus` 必须为 `passed`；传入 `--public-repo <fresh-clone-path>` 或设置 `PUBLIC_REPO_CLONE_PATH` 时，还会要求 evidence 中的路径与发布日指定 fresh clone 路径一致。保留示例域名、示例路径段、模板替换 token 和占位链接会被当作占位拒绝；可用 `node scripts/check-external-submission.mjs --write-template <path>` 生成模板；模板含占位符，只能作为人工填写起点，不能当作通过证据。

本地视频证据校验：

```bash
npm run check:video-evidence
```

该命令读取 `docs/reports/submission/video-evidence.json`，校验本地录屏文件、录制纪要、时间线、3–8 分钟时长、§2.1 / §2.2 / U1–U5 / AI usage / public-repo 覆盖和本地证据引用；它会拒绝公开视频 URL 或上传状态声明，这些外部事实只能写入 `external-submission-evidence.json`。

四类证据模板可一次生成：

```bash
npm run scaffold:submission-evidence
```

该命令只生成 `*.template.json`，不会创建真实 U6 录屏、视频、外部链接、远端扫描或最终提交确认。发布前必须把模板复制或改名为非 template evidence 文件，并用真实证据替换占位符。

统一提交门禁汇总：

```bash
npm run check:submission-gates -- --public-repo <fresh-clone-path>
```

该命令聚合 `archive:dry-run`、U6 manifest、本地视频证据、外部提交证据、Q&A 演练、fresh clone `check:public-repo` 和 `pre-submission-check.sh`，输出统一 `blockers`、`openPlanItems`，并为每个 gate / blocker 标出 `planItems` 与 `requiredEvidence`；缺真实计时、录屏、外部 URL、fresh clone 或最终提交证据时会失败。它只是汇总本地 gate，不创建公开仓、不上传视频、不证明远端 URL。

最终提交前一键门禁：

```bash
PUBLIC_REPO_CLONE_PATH=<fresh-clone-path> bash scripts/pre-submission-check.sh
```

该命令会先跑本地候选包、Git 跟踪清单和 `check:external-submission -- --public-repo "$PUBLIC_REPO_CLONE_PATH"`，再调用 `check:public-repo` 校验 `PUBLIC_REPO_CLONE_PATH` 指向的 fresh clone；未提供该环境变量、外部证据 JSON 缺失，或 evidence 中 fresh clone 路径与该环境变量不一致都会失败。

---

## 发布步骤（S8 执行路径）

1. 在 GitHub 创建 **public** 仓库（AI 主仓）：<https://github.com/Xio-Shark/conduit-super-individual>。
2. 发布副本排除 `.env`、`node_modules/`、build 产物、`runs-archive/`、`test-results/` 与嵌套 `.git/`。
3. `sandbox-repo/` 以普通源码目录纳入公开仓，不作为 git submodule。
4. 公开后 fresh clone 远端仓库，并执行 `npm run check:public-repo -- --repo <fresh-clone-path>`。
5. 将公开 URL、Demo、视频、远端 secret scanning 和最终提交确认写入 `external-submission-evidence.json` 或比赛提交系统；团队名称、成员姓名和联系方式不进入公开仓。
6. 可选：文档仓单独公开或仅在主仓 README 链接。

---

## 当前状态（2026-06-02）

| 项 | 状态 |
|----|------|
| 本地 monorepo git | 有历史 commit；发布采用 `/tmp/conduit-super-individual-public.*` 副本，避免把外层文档仓误推为 AI 主仓 |
| 远端公开 URL | <https://github.com/Xio-Shark/conduit-super-individual> |
| `npm run archive:dry-run` | ✅ 通过；候选包包含关键源码、submission、四类 evidence 模板、`sandbox-repo/`、脚本测试与 12 条关键 run（471 files；`manifestHash` / `contentHash` 以最新 dry-run 输出为准）；不等于公开仓已发布 |
| `npm run check:external-submission` | 🟡 脚本已接入；真实 `external-submission-evidence.json` 尚未填写 |
| `npm run check:video-evidence` | 🟡 脚本已接入；真实本地录屏 `video-evidence.json` 尚未填写 |
| `npm run check:public-repo -- --repo <fresh-clone-path>` | 🟡 脚本已接入；本轮已对 fresh clone 执行，需以最新推送后的复跑结果为准 |
| `npm run check:submission-gates -- --public-repo <fresh-clone-path>` | 🟡 脚本已接入；统一汇总本地/远端证据 gate，输出 `openPlanItems` / `planItems` / `requiredEvidence`，真实证据未齐时应失败 |
| `sandbox-repo/` 在公开仓 | ✅ fresh clone 已确认 `sandbox-repo/frontend/src/components/ArticlesPreview/ArticlesPreview.jsx` 等真实源码文件存在 |
| `npm run verify` | ✅ 本地代码门禁已复核：`npm test` 524 项（523 pass / 1 skip）+ sandbox lint + Conduit Vitest 12 项 + Web build |
