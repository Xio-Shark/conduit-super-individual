# sandbox-repo 依赖 Audit 决策（X1）

决策日期：**2026-05-21**。  
范围：`bytedance-implementation/sandbox-repo/`（Conduit RealWorld 上游依赖树）。

---

## 扫描结果

```bash
cd bytedance-implementation
npm audit --audit-level=moderate          # 根：0 vulnerabilities
cd sandbox-repo && npm audit --audit-level=moderate
```

| 严重级别 | 数量 | 主要包 |
|----------|------|--------|
| high | 5 | axios, lodash, path-to-regexp, picomatch, vite |
| moderate | 3 | brace-expansion, follow-redirects, postcss |
| **合计** | **8** | 均为 Conduit / Vitest / Vite 传递依赖 |

`npm audit fix` 可自动修复，但可能升级 Conduit 上游 lockfile，**超出 Skill 演示改动范围**，需单独回归 `npm run verify`。

---

## 决策

| 选项 | 选择 | 理由 |
|------|------|------|
| A. 立即 `npm audit fix` 并全量 verify | 未采用 | 可能引入 Conduit 上游行为变化；当前 verify 已绿 |
| B. **记录风险，答辩前评估** | **✅ 采用** | 漏洞位于 dev/test 工具链（Vite/Vitest）与 Conduit 后端 axios 等；演示不对外暴露 Conduit 生产服务 |
| C. 忽略且不记录 | 否 | 违反 X1 留痕要求 |

**结论**：维持当前 `sandbox-repo` lockfile；在答辩材料中说明为 **上游 Conduit 传递依赖**；若评审要求，可在公开仓发布前执行 `npm audit fix` + 全量 `npm run verify` 并更新本文件。

---

## 全量 verify（决策后）

```bash
cd bytedance-implementation && npm run verify
```

| 环节 | 结果 |
|------|------|
| 实现仓 Node/API/Web/scripts 测试 524 项（523 pass / 1 skip） | ✅ pass |
| sandbox lint | ✅ pass |
| Conduit Vitest 12 项 | ✅ pass |
| Web 生产构建 | ✅ pass |

**X1 文档项：已完成**（决策已记录 + verify 已复跑）。

---

## 后续动作（可选）

1. `cd sandbox-repo && npm audit fix`
2. `cd .. && npm run verify`
3. 若 diff 仅 lockfile，单独 commit 并更新本文件「决策 → 已 fix」
