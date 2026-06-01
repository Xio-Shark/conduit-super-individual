import assert from "node:assert/strict";
import test from "node:test";
import { buildPrDraft } from "./prAgent.js";

test("buildPrDraft lists files from the actual diff", () => {
  const draft = buildPrDraft({
    diff: [
      "diff --git a/frontend/src/App.jsx b/frontend/src/App.jsx",
      "diff --git a/package.json b/package.json",
    ].join("\n"),
    plan: {
      target_files: ["frontend/src/App.jsx"],
      risks: [
        "P0 只展示前端假数据，不代表真实阅读量统计",
        "Conduit 根仓没有 lint script 时由实现仓库 ESLint 检查本次改动文件",
      ],
    },
    requirementCard: {
      goal: "展示阅读量",
      source_input: "给文章列表加阅读量展示",
    },
    verification: {
      checks: [{ command: "npm test", exitCode: 0 }],
    },
  });

  assert.match(draft, /- frontend\/src\/App\.jsx/);
  assert.match(draft, /- package\.json/);
  assert.match(draft, /前端假数据/);
  assert.doesNotMatch(draft, /placeholder reads/);
});

test("buildPrDraft uses plan risks instead of hard-coded read-count copy", () => {
  const draft = buildPrDraft({
    diff: "diff --git a/backend/models/Article.js b/backend/models/Article.js",
    plan: {
      summary: "在 Conduit 文章列表与 API 响应中展示草稿状态（前后端一致）。",
      target_files: ["backend/models/Article.js"],
      risks: ["L2 跨栈改动须保持 API 字段与前端展示一致"],
    },
    requirementCard: {
      goal: "展示草稿状态",
      source_input: "文章列表展示草稿状态",
    },
    verification: {
      checks: [{ command: "npm test", exitCode: 0 }],
    },
  });

  assert.match(draft, /L2 跨栈改动/);
  assert.doesNotMatch(draft, /read counts/);
});

test("buildPrDraft fails when plan risks are missing", () => {
  assert.throws(
    () => buildPrDraft({
      diff: "diff --git a/frontend/src/App.jsx b/frontend/src/App.jsx",
      plan: { target_files: ["frontend/src/App.jsx"] },
      requirementCard: {
        goal: "展示阅读量",
        source_input: "给文章列表加阅读量展示",
      },
      verification: {
        checks: [{ command: "npm test", exitCode: 0 }],
      },
    }),
    /requires plan\.risks/,
  );
});
