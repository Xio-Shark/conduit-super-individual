# 答辩与 §8.2 提交准备（S10）

截止：**2026-06-10**。本文档汇总提交材料索引与答辩路径；**不含 GitHub 远端推送**。

---

## 材料包索引

| 材料 | 路径 | 状态 |
|------|------|------|
| 提交清单 | [`checklist.md`](./checklist.md) | ✅ |
| 团队 / 链接 | 比赛提交系统 / `external-submission-evidence.json` | 🟡 不进入公开仓 |
| 演示脚本 | [`demo-script.md`](./demo-script.md) | ✅ |
| 视频录制指南 | [`video-recording-guide.md`](./video-recording-guide.md) | ✅ 脚本；视频待录 |
| Q&A 演练证据 | `defense-rehearsal-evidence.json` | 🟡 校验脚本已接入；真实演练待执行 |
| 架构说明 | [`architecture.md`](./architecture.md) | ✅ 已同步 |
| 工程难点 | [`engineering-notes.md`](./engineering-notes.md) | ✅ 已同步 |
| AI 使用说明 | [`ai-usage.md`](./ai-usage.md) | ✅ |
| Prompt / Skill 变更 | [`prompt-changelog.md`](./prompt-changelog.md) | ✅ |
| 澄清对话导出 | [`clarify-conversation-export.md`](./clarify-conversation-export.md) | ✅ |
| 开发工具清单 | [`tools-manifest.md`](./tools-manifest.md) | ✅ |
| 公开仓指南 | [`public-repo-guide.md`](./public-repo-guide.md) | 草稿存在；远端公开仓 `pending_human` |
| 安全检查 | [`security-check-report.md`](./security-check-report.md) | ✅ |
| 依赖 audit 决策 | [`dependency-audit-decision.md`](./dependency-audit-decision.md) | ✅ |

---

## §2.2 六项证据速查

| # | 亮点 | 证据 run / 路径 |
|---|------|-----------------|
| 1 | 抽象到位 | 6 个 Skill；`articleCoverImage.js` ≤30 行；`commentLikeCount.js` ≤50 行；`run-l2-comment-like` |
| 2 | 断点重放 | `resume-from-stage`；`checkpoints.json`；Web Resume from edit |
| 3 | 跨栈一致性 | `run-l2-auto-cover-image`（schema-driven 6 文件 diff）；老 L2 exemplar `run-2026-05-21T05-52-12-490Z` |
| 4 | 可观测性 | `run-plan-llm-driven`（`stage=plan` 非零 tokens）+ AI Usage 面板；老验收 run `run-2026-05-21T05-58-01-181Z` |
| 5 | 业务上下文 | `run-semantic-recall-demo`（`match_type=semantic`）+ `plan.history_references`；老召回 run `run-2026-05-21T05-51-56-519Z` |
| 6 | 澄清深度 | `run-l3-multi-turn-clarify`（clarify + clarify-refine）+ 老单轮模糊 run `run-2026-05-21T05-58-01-181Z` |

验收 YAML：文档仓 `docs/11-acceptance.yaml`（29/33 AC verified；AC-F011 仍待外部/人工闭合）。

---

## 答辩叙述顺序（建议 15 分钟现场）

1. **问题与架构**（2 min）：PM→PR 闭环；[`architecture.md`](./architecture.md)
2. **Live Demo**（5 min）：按 [`video-recording-guide.md`](./video-recording-guide.md) 精简版
3. **§2.2 六项**（5 min）：逐项指 run 目录与面板
4. **AI 留痕与合规**（2 min）：`ai-usage.md` + `prompt-changelog.md`
5. **Q&A 备用**（1 min）：[`engineering-notes.md`](./engineering-notes.md) 难点

---

## Q&A 演练证据门

> 对应文档仓 `docs/13-optimization-plan.csv` B 组 S10（id=38）。

生成待填模板：

```bash
npm run check:defense-rehearsal -- --write-template docs/reports/submission/defense-rehearsal-evidence.template.json
```

真实演练完成后，把模板复制或改名为 `docs/reports/submission/defense-rehearsal-evidence.json`，再运行：

```bash
npm run check:defense-rehearsal
```

该命令只校验本地 Q&A 演练记录：至少 8 个已回答问题覆盖 architecture、U1–U6 和 submission boundary；至少 2 个追问 drill；演练时长 10–120 分钟；录屏、纪要、每题本地证据引用非空；`openIssues` 为空且 `defense-prep.md` 被标记 finalized。脚本不证明真实答辩已经发生，也不验证 Demo / 视频 / 公开仓外链。

---

## 提交前最后 48 小时 Checklist

- [ ] 比赛提交系统或 `external-submission-evidence.json` 中 Demo/视频/仓库链接已填
- [ ] 演示视频 3–8 分钟已上传（S7）
- [ ] AI 系统主仓已公开，且仓内包含 `sandbox-repo/`（S8）
- [ ] [`security-check-report.md`](./security-check-report.md) 发布日再检
- [ ] `npm run verify` 全绿
- [ ] 文档仓 `docs/10-progress.md` 与根目录汇报同步

---

## 仍待人工 / 远端（非本文档范围）

| 项 | 说明 |
|----|------|
| H17 真实 draft PR | 可选远端能力；上游 Conduit PR 非 §8.2 必填，本地 `pr-draft.md` 即可 |
| 豆包 clarify（P1-5） | **已决策跳过**；不强制豆包；§2.2 #6 以 `run-l3-multi-turn-clarify`（mimo-v2.5，多轮）+ `run-2026-05-21T05-58-01-181Z`（mimo-v2.5，单轮模糊）双重举证 |
| GitHub 公开推送 | 见 [`public-repo-guide.md`](./public-repo-guide.md) |
| 团队姓名 | 不进入公开仓；通过比赛提交系统单独填写 |

---

## U1-U5 优秀档升级答辩素材（2026-05-22 落地）

### U1：跨栈自动驱动（schemaDriver + frontendGenerators）

| 问 | 答 |
|----|-----|
| 跨栈一致性怎么做到的？ | Skill 只声明 `schemaChange={Article, coverImage, STRING}`（≤30 行），`services/codegen/schemaDriver.js` 解析 Sequelize model → `frontendGenerators.js` 自动生成前端 TS/service/mock + 注入 backend controller + preview 组件，共改 6 个文件且不手写 targetPaths |
| 如果评委现场要改另一个字段？ | 复制 article-cover-image  Skill，改 `schemaChange` 字段名 + 类型 + appliesWhen 关键词，重新注册到 registry，`npm run run:p0` 即可自动推断目标；≤5 分钟完成 |
| 为什么不用完整 AST？ | 降级到正则 + 模板字符串；答辩承认 v0 简化，但功能已跑通且 fail-fast 健壮 |

### U2：多轮 LLM 澄清（propose + refine + CLARIFYING_AWAITING_ANSWER）

| 问 | 答 |
|----|-----|
| 怎么证明是真多轮？ | `ai-calls.jsonl` 2 行：`stage=clarify`（首轮 propose，问 Q1-Q4）+ `stage=clarify-refine`（第二轮，prompt 含 Q1-Q4 的 PM 答复）；`clarification-history.jsonl` 4 行 PM 答复；视频可展示 PM 在 UI 输入框输入 → 第二轮追问的闭环 |
| LLM 会不会无限循环？ | pipeline 每次 reply 都显式 `decision=finalize|clarify`；只有 `decision=clarify` + 非空 `pending_questions` 才进入 pause；无 pending questions 直接 fail-fast；降级路径：LLM 不稳定时切 2 轮硬模板 |

### U3：plan 阶段接真 LLM

| 问 | 答 |
|----|-----|
| plan 为什么要接 LLM？ | 避免 §6.1 扣分项 #3「关键能力 mock」：全链路只有 1 行 clarify ai-call 会被评委一眼识别；U3 让 plan 也调模型，ai-calls 出现 `stage=plan` 非零 tokens，破单调面板 |
| demo 能现场切 llm 吗？ | `AI_MODE=rules PLAN_MODE=llm npm run run:p0` 一行命令；plan agent 自动读 env 创建 modelClient，无需改代码 |
| LLM 输出错误路径怎么办？ | `planWithLlm.assertTargetsExist()` 用 `fs.existsSync` 逐文件校验；任一不存在直接 throw，不回退到规则模板 |

### U4：语义召回

| 问 | 答 |
|----|-----|
| 为什么不用 embedding API？ | 离线优先：char bigram + 256 维 hash + L2 归一化 cosine，纯本地零依赖；39 行 embeddings.jsonl 秒级重建 |
| 语义 vs 关键词哪个准？ | 并集策略：skill_id token 匹配 + cosine top-3 语义去重合并；`match_type=both` 优先排序；演示 run `run-semantic-recall-demo` 输入无 Skill 关键词重叠仍 semantic 命中 |

### U5：非文章列表 Skill（commentLikeCount）

| 问 | 答 |
|----|-----|
| 怎么证明新模式？ | Skill 落点全在评论域（Comment/model + controller + route + CommentList.jsx + vitest），完全脱离 ArticlesPreview；Skill 文件 ≤50 行；`run-l2-comment-like` 5 文件 diff + vitest 16 pass |
| 如果出题「用户 follow / 分享按钮」？ | 做法同 commentLikeCount，新增 1 个 Skill 文件 + 注册即可，主流程不改任何代码 |

## U6 现场题应变包

> 对应文档仓 `docs/13-optimization-plan.csv` B 组 U6。以下 3 题用于答辩前计时演练；题面刻意避开已归档 run 和 submission 主叙事，不作为已交付 Skill 宣称。

| 题目 | 预期 Skill | 目标落点 | 15 分钟通过标准 |
|------|------------|----------|-----------------|
| 评论输入框字数倒计数 | `comment-draft-counter` | `frontend/src/components/CommentList/CommentList.jsx` 或相邻评论组件 | 新增 1 个 Skill 文件 + registry；diff 只改评论 UI；lint:sandbox 或相关 UI 锚点测试通过 |
| 作者资料卡显示注册天数 | `profile-account-age` | Profile 页面 / 用户资料展示组件 | 新增 1 个 Skill 文件；基于已有用户时间字段或 mock 值展示天数；不改 Orchestrator/Agent 主干 |
| 文章卡片收藏状态筛选开关 | `article-favorite-filter-toggle` | 文章列表控制区 + ArticlesPreview 数据过滤 | 新增 1 个 Skill 文件；能在列表页切换收藏过滤；验证记录缺后端时明确排除 backend schema |

演练记录模板：

| 题目 | 开始时间 | 结束时间 | 是否 ≤15 min | 结果 | 失败原因 / 兜底 |
|------|----------|----------|---------------|------|----------------|
| 评论输入框字数倒计数 | 待填 | 待填 | 待填 | 待录屏 | — |
| 作者资料卡显示注册天数 | 待填 | 待填 | 待填 | 待录屏 | — |
| 文章卡片收藏状态筛选开关 | 待填 | 待填 | 待填 | 待录屏 | — |

演练和提交前可先统一生成四类证据模板：

```bash
npm run scaffold:submission-evidence
```

该命令会生成 U6 manifest、本地视频、外部提交、Q&A 演练四个 `*.template.json`。模板只用于减少漏填字段，不能作为真实 evidence。若只需要 U6 manifest，也可单独运行：

```bash
npm run scaffold:u6
```

默认输出 `docs/reports/submission/u6-rehearsal-manifest.template.json`。复制或改名为 `u6-rehearsal-manifest.json` 后，把 `REPLACE_WITH_START_ISO` / `REPLACE_WITH_END_ISO` 替换成真实计时时间，并确保对应 run、Skill 文件、registry 注册和录屏文件都已经存在。
每道题还需保留一份实现改动清单（建议 `git status --short` 或 `git diff --name-only` 的结果），填入 manifest 的 `implementationChangeList` 字段；清单用于证明演练没有改 Orchestrator / Agent / API / Web 主干。

单题审计命令（示例）：

```bash
npm run check:u6 -- \
  --run-id run-u6-comment-draft-counter \
  --skill-id comment-draft-counter \
  --skill-file services/skills/src/commentDraftCounter.js \
  --implementation-change-list docs/reports/submission/u6-change-lists/comment-draft-counter.txt \
  --started-at 2026-05-24T10:00:00+08:00 \
  --ended-at 2026-05-24T10:12:30+08:00 \
  --recording docs/reports/submission/u6-recordings/comment-draft-counter.mp4
```

3 题批量审计时运行：

```bash
npm run check:u6 -- --manifest docs/reports/submission/u6-rehearsal-manifest.json
```

该命令只校验本地证据是否齐备：run 目录、`verification.json status=passed`、`run-summary.json status=passed`、非空 diff、Skill 文件、Skill id、registry 注册、实现改动清单、≤15 分钟计时、非空录屏文件，以及 manifest 中 ≥3 道题、≥2 道通过、runId/skillId 不重复。实现改动清单会拒绝 Orchestrator / Agent / API / Web 主干改动，避免把“改主流程”误报成“只新增 Skill 文件”。`scaffold:u6` 只生成待填模板；它不替代真实录屏、人工现场计时或 §8.2 外部提交。

## 现场题失败兜底

> 对应 [`docs/13-optimization-plan.csv`](../../../../docs/13-optimization-plan.csv) B 组 U6（id=28）。

| 失败场景 | 兜底话术 |
|----------|----------|
| 现场 5 分钟新增 Skill 超期 | 「项目采用 Skill 注册机制，新模式只需 1 个 Skill 文件。限时内因题目需要理解 Conduit 代码结构，时间偏紧，但我们的 6 个成熟 Skill（包括 schema-driven 和非列表模式）已充分证明抽象层覆盖度。」 |
| LLM plan 输出无效路径 | 「PLAN_MODE=llm 有 fail-fast 校验——LLM 输出的 target_files 必须存在于 sandbox。当前因为 LLM 基于旧 sandbox index 输出，但 schema-driven 路径已豁免新生成文件。我切回 PLAN_MODE=rules 重新跑一次。」 |
| 多轮 clarify 卡在 pending 出不来 | 「LLM 自主性不稳定时我们设计了 2 轮硬模板降级路径；现在我先手工写答复推进到 finalize，证明 pipeline pause-resume 机制是完整的。」 |
| sandbox git diff 为空 | 「sandbox 状态可能有残留改动；确认已 `git reset --hard HEAD && git clean -fd` 后再重跑。」 |
| 现场题涉及当前没有索引到的 Conduit 区域 | 「系统对未知目标会 fail-fast，不会硬编路径。我先用 sandbox index 定位真实文件，再新增 Skill；如果超出现场时间，保留为课后 run，不把未验证结果说成完成。」 |

## Git 基线

| 项 | 值 |
|----|-----|
| 本地 Git 状态 | 有历史 commit；当前仍有未跟踪实现 / run / submission 路径 |
| 发布范围 | 公开仓必须含实现仓、`sandbox-repo/`、关键 run 证据与 submission 文档；以 `public-repo-guide.md` 的 `git ls-files` / archive dry-run / `check:external-submission` / fresh clone `check:public-repo` 校验为准 |

`git ls-files` 与 `archive:dry-run` 只是本地发布候选校验；公开仓是否真实包含这些内容仍须远端发布后对 fresh clone 执行 `npm run check:public-repo -- --repo <fresh-clone-path>`，并用 `npm run check:external-submission` 校验人工记录的外部提交证据。两者仍不替代人工复核 §8.2 URL、视频、团队信息和最终提交结果。

公开推送前确认 `.env` 从未进入 commit history。
