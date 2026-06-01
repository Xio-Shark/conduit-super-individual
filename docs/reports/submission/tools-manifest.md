# Tools Manifest（开发期 Agent / IDE 与配置版本）

§7.2-6 建议项（S4）。记录**开发协作期**使用的工具与版本；与**产品运行时**模型清单（[`ai-usage.md`](./ai-usage.md)）分离。

采集时间：2026-05-24。Git 发布状态以 [`public-repo-guide.md`](./public-repo-guide.md) 的 `git ls-files` / archive dry-run / fresh clone `check:public-repo` 校验为准，不以本地口头 git 状态判断；当前仍有未跟踪实现、run、submission 路径待公开发布前确认。`git ls-files` 与 archive dry-run 是本地发布候选校验，`check:public-repo` 是远端公开后的 fresh clone 内容校验，三者都不替代 §8.2 外部门禁。

---

## 开发环境

| 项 | 版本 / 值 |
|----|-----------|
| OS | macOS 26.2 (darwin 25.2.0) |
| Node.js | v24.14.0 |
| npm | 11.9.0 |
| 包管理 | npm workspaces（`apps/api`、`apps/web`） |

---

## IDE / Agent（开发协作）

| 工具 | 用途 | 备注 |
|------|------|------|
| Cursor | 文档基线维护、实现仓编码与调试 | CLI：`cursor`（`~/.local/bin/cursor`） |
| Cursor Agent | 按 `docs/03-spec.md` 实现 Orchestrator / Skill / 验收 | 见文档仓 `AGENTS.md` 双仓分工 |

> **口径**：开发协作 AI（维护 `docs/`、实现仓代码）与产品运行时 AI（PM 在系统内 clarify）分开统计；见文档仓 [`01-understanding.md`](../../../../docs/01-understanding.md#两类用-ai-不要混用)。

---

## 实现仓依赖版本（节选）

| 包 / 模块 | 版本 | 位置 |
|-----------|------|------|
| `conduit-super-individual` | 1.0.0 | 根 `package.json` |
| `@conduit-super-individual/api` | 1.0.0 | Express 5.2.1 |
| `@conduit-super-individual/web` | 1.0.0 | React 19.2.4、Vite 7.3.1 |
| eslint | ^10.4.0 | sandbox lint adapter |
| stylelint | ^17.12.0 | sandbox lint adapter |
| vitest | 4.0.18 | `sandbox-repo` 单测 |
| concurrently | ^9.2.1 | 本地 dev 并行启动 |

---

## 产品运行时配置（不含密钥）

| 变量 | 典型值 | 说明 |
|------|--------|------|
| `AI_MODE` | `rules` / `llm` | 必须显式设置；代码级 P0 用 rules，§2.2 澄清验收用 llm |
| `PLAN_MODE` | `rules` / `llm` | 默认 rules；U3 / 可观测性演示用 llm，`target_files` 不存在时 fail-fast |
| `LLM_MODEL` | `mimo-v2.5` | U2 多轮 clarify 与 U3 plan 阶段验收 run |
| `LLM_BASE_URL` | OpenAI 兼容网关 | 仅本地 `.env`，不入库 |
| `SANDBOX_REPO_PATH` | `sandbox-repo/` | Conduit fork 路径 |

---

## 验证命令

```bash
cd bytedance-implementation
npm run verify    # 本地代码门禁：npm test 524 项（523 pass / 1 skip）+ sandbox lint + Conduit Vitest + web build
npm run check:public-repo -- --repo <fresh-clone-path>
npm run scaffold:submission-evidence
npm run check:video-evidence
npm run check:defense-rehearsal
npm run check:submission-gates -- --public-repo <fresh-clone-path>
npm run scaffold:u6
npm run check:u6 -- --manifest docs/reports/submission/u6-rehearsal-manifest.json
npm run run:p0:rules
npm run run:fuzzy-llm
PLAN_MODE=llm npm run run:p0
```

---

## 关联材料

- [`prompt-changelog.md`](./prompt-changelog.md) — Prompt / Skill 版本（S1）
- [`clarify-conversation-export.md`](./clarify-conversation-export.md) — 模糊澄清对话（S5）
- [`ai-usage.md`](./ai-usage.md) — 产品运行时模型与合规
