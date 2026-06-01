# 演示视频录制指南（S7）

§8.2 要求：**3–8 分钟**，覆盖 **§2.1 MVP** + **§2.2 六项** + **§7.2 留痕**。本文档为录制脚本与检查清单；**视频文件/外链须人工录制后通过比赛提交系统或 external evidence 单独填写**。

---

## 录制前准备

```bash
cd bytedance-implementation
cp .env.example .env   # 配置 LLM_*（勿入库）
npm install && cd sandbox-repo && npm install && cd ..
npm run verify
BLOCK_ON_CONFIRM=1 AI_MODE=llm PLAN_MODE=llm npm run dev
```

| 检查项 | 证据 |
|--------|------|
| 多轮 LLM clarify | `run-l3-multi-turn-clarify` |
| plan 阶段 LLM | `run-plan-llm-driven` |
| U1 跨栈自动驱动 | `run-l2-auto-cover-image` |
| U4 语义召回 | `run-semantic-recall-demo` |
| U5 非列表 Skill | `run-l2-comment-like` |
| 人工确认 | `BLOCK_ON_CONFIRM=1` 后进入 waiting 阶段，再 Record review + Continue |
| 断点重放 | Web「Resume from edit (plan kept)」 |
| AI 留痕材料 | `prompt-changelog.md`、`clarify-conversation-export.md` |

本地录屏完成后，先写 `docs/reports/submission/video-evidence.json` 并运行 `npm run check:video-evidence`。该 gate 只检查本地录屏文件、时间线、覆盖项与本地证据引用；公开视频 URL 仍由 [`external-submission-evidence.json`](./external-submission-evidence.template.json) / `npm run check:external-submission` 在上传后校验。

---

## 建议时间分配（总计 6–7 分钟）

| 时段 | 内容 | §2.2 / §7.2 |
|------|------|-------------|
| 0:00–0:30 | 开场：PM→PR 闭环、三层架构图（`architecture.md`） | — |
| 0:30–1:45 | **#6 澄清深度**：展示 `run-l3-multi-turn-clarify`，PM 在 UI 输入答复，LLM 第二轮 refine，`clarification-history.jsonl` 4 行 PM 答复与 `ai-calls.jsonl` 2 行模型调用 | #6 / §7.2-1 |
| 1:45–2:30 | **#4 可观测性 + U3**：打开 AI Usage 面板，展示 `stage=plan` 非零 tokens（`run-plan-llm-driven`） | #4 |
| 2:30–3:15 | **#3 跨栈自动驱动 + U1**：展示 `run-l2-auto-cover-image`，Skill 只声明 `schemaChange`，diff 含 6 个前后端文件 | #3 |
| 3:15–4:00 | **#5 业务上下文 + U4**：展示 `run-semantic-recall-demo` 的 `match_type=semantic` 与 plan `history_references` | #5 |
| 4:00–4:50 | **#2 断点重放 / 人工 gate**：`BLOCK_ON_CONFIRM=1` 下 waiting → Record review → Continue；再演示 resume-from-stage 只重跑 edit→verify→pr | #2 |
| 4:50–5:30 | **#1 抽象到位 + U5**：展示 6 Skill，重点是 `articleCoverImage.js` ≤30 行、`commentLikeCount.js` ≤50 行且不改主干 | #1 |
| 5:30–6:20 | §2.1 MVP：展示 L1 run 的 diff、verification、PR 草稿；说明 rules 只作稳定回放 | §2.1 |
| 6:20–6:50 | §7.2 留痕：`prompt-changelog.md`、`ai-usage.md`、`clarify-conversation-export.md` | §7.2 |
| 6:50–7:00 | 收尾：公开 AI 主仓/Demo/视频链接由比赛提交系统或 external evidence 最终填写 | §8.2 |

详细逐步脚本见 [`demo-script.md`](./demo-script.md)。

---

## 必拍镜头清单

- [ ] PM 输入框 + 阶段进度条
- [ ] 多轮 LLM clarify：PM 答复输入框 + 第二轮 refine
- [ ] AI Usage 面板 **非零** metrics，且含 `stage=plan`
- [ ] plan.md 中 `history_references`、`match_type`、`similarity_score`
- [ ] schema-driven L2 diff：backend model/controller + frontend type/service/mock/component
- [ ] resume-from-stage 按钮与重放后 events
- [ ] 6 个 Skill 文件列表 / registry
- [ ] verification.json 通过 + pr-draft.md
- [ ] submission 目录或 `prompt-changelog.md` 一页

---

## 口播备用

早期 `run-2026-05-20T17-37-55-856Z` 等 doubao 探索 run 虽有非零 tokens，但输入为 **清晰 L1 原句**，仅作工程探索，**不作为 §2.2 澄清深度证据**。#6 澄清深度采用双证据：`run-l3-multi-turn-clarify`（多轮 LLM refine）+ `run-2026-05-21T05-58-01-181Z`（单轮模糊 + `mimo-v2.5`）。

S7 主叙事必须使用 LLM 澄清与 LLM plan 证据；`AI_MODE=rules` 仅作为稳定回放和 P0 胶水链路证明，不能作为可观测性或澄清深度主证据。

---

## 录制完成后

1. 保存本地录屏文件和录制纪要。
2. 填写 `docs/reports/submission/video-evidence.json`，运行 `npm run check:video-evidence`。
3. 将视频上传至可公开访问的平台。
4. 在比赛提交系统或 `external-submission-evidence.json` 填写「演示视频链接」。
5. 在 [`checklist.md`](./checklist.md) 勾选 S7。
