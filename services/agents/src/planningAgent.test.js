import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildPlan } from "./planningAgent.js";
import { articleDetailWordCountSkill } from "../../skills/src/articleDetailWordCount.js";
import { articleDraftIndicatorSkill } from "../../skills/src/articleDraftIndicator.js";
import { articleListDisplayFieldSkill } from "../../skills/src/articleListDisplayField.js";
import { popularTagsTopFiveSkill } from "../../skills/src/popularTagsTopFive.js";
import { articleCoverImageSkill } from "../../skills/src/articleCoverImage.js";

test("buildPlan marks L2 cross-stack impact matrix for draft indicator Skill", async () => {
  const repoPath = await createSandboxRepo(articleDraftIndicatorSkill.targetPaths);
  const plan = await buildPlan({
    requirementCard: {
      id: "REQ-L2-ARTICLE-DRAFT",
      goal: "文章列表与 API 展示草稿状态",
      level: "L2",
    },
    sandbox: createAssertingSandbox(articleDraftIndicatorSkill.targetPaths),
    skill: articleDraftIndicatorSkill,
    historyRecall: { matches: [] },
    repoPath,
  });

  assert.equal(plan.impact_matrix.cross_stack, true);
  assert.deepEqual(plan.impact_matrix.modules, ["frontend", "backend"]);
  assert.ok(plan.impact_matrix.frontend_paths.length > 0);
  assert.ok(plan.impact_matrix.backend_paths.length > 0);
  assert.match(plan.summary, /草稿/);
});

test("buildPlan keeps L1 impact matrix frontend-only for display field Skill", async () => {
  const repoPath = await createSandboxRepo(articleListDisplayFieldSkill.targetPaths);
  const plan = await buildPlan({
    requirementCard: {
      id: "REQ-001",
      goal: "文章列表卡片展示阅读量",
      level: "L1",
    },
    sandbox: createAssertingSandbox(articleListDisplayFieldSkill.targetPaths),
    skill: articleListDisplayFieldSkill,
    historyRecall: { matches: [] },
    repoPath,
  });

  assert.equal(plan.impact_matrix.cross_stack, false);
  assert.deepEqual(plan.impact_matrix.modules, ["frontend"]);
  assert.equal(plan.impact_matrix.backend_paths.length, 0);
});

test("buildPlan writes history references from recall matches", async () => {
  const repoPath = await createSandboxRepo(articleListDisplayFieldSkill.targetPaths);
  const plan = await buildPlan({
    requirementCard: {
      id: "REQ-001",
      goal: "文章列表卡片展示阅读量",
      level: "L1",
    },
    sandbox: createAssertingSandbox(articleListDisplayFieldSkill.targetPaths),
    skill: articleListDisplayFieldSkill,
    repoPath,
    historyRecall: {
      matches: [
        {
          runId: "run-2026-05-21T05-51-56-519Z",
          goal: "文章列表卡片展示阅读量",
          skillId: "article-list-display-field",
          score: 1,
          summary: "在 Conduit 文章列表卡片增加确定性阅读量展示。",
        },
      ],
    },
  });

  assert.equal(plan.history_references.length, 1);
  assert.equal(plan.history_references[0].run_id, "run-2026-05-21T05-51-56-519Z");
});

test("buildPlan uses Skill-owned summaries for every registered P0 Skill", async () => {
  const cases = [
    [articleListDisplayFieldSkill, "在 Conduit 文章列表卡片增加确定性阅读量展示。"],
    [articleDraftIndicatorSkill, "在 Conduit 文章列表与 API 响应中展示草稿状态（前后端一致）。"],
    [articleDetailWordCountSkill, "在文章详情页基于 Article.body 展示字数统计。"],
    [popularTagsTopFiveSkill, "在 Popular Tags 侧边栏为前 5 个标签增加醒目标记。"],
  ];

  for (const [skill, expectedSummary] of cases) {
    const repoPath = await createSandboxRepo(skill.targetPaths);
    const plan = await buildPlan({
      requirementCard: {
        id: `REQ-${skill.id}`,
        goal: expectedSummary,
        level: "L1",
      },
      sandbox: createAssertingSandbox(skill.targetPaths),
      skill,
      historyRecall: { matches: [] },
      repoPath,
    });

    assert.equal(plan.summary, expectedSummary);
  }
});

test("buildPlan requires Skill-owned plan summary", async () => {
  const skill = {
    ...articleListDisplayFieldSkill,
    planSummary: "",
  };
  const repoPath = await createSandboxRepo(skill.targetPaths);
  await assert.rejects(
    () => buildPlan({
      requirementCard: {
        id: "REQ-001",
        goal: "文章列表卡片展示阅读量",
        level: "L1",
      },
      sandbox: createAssertingSandbox(skill.targetPaths),
      skill,
      historyRecall: { matches: [] },
      repoPath,
    }),
    /must declare planSummary/,
  );
});

test("buildPlan with PLAN_MODE=llm requires modelClient", async () => {
  const repoPath = await createSandboxRepo(articleListDisplayFieldSkill.targetPaths);
  await assert.rejects(
    () => buildPlan({
      requirementCard: {
        id: "REQ-001",
        goal: "文章列表卡片展示阅读量",
        level: "L1",
      },
      sandbox: createAssertingSandbox(articleListDisplayFieldSkill.targetPaths),
      skill: articleListDisplayFieldSkill,
      historyRecall: { matches: [] },
      repoPath,
      env: { PLAN_MODE: "llm" },
    }),
    /PLAN_MODE=llm requires modelClient/,
  );
});

test("buildPlan in PLAN_MODE=llm merges LLM target_files and persists ai_call", async () => {
  const repoPath = await createSandboxRepo(articleListDisplayFieldSkill.targetPaths);
  const modelClient = {
    model: "mimo-v2.5",
    async chat() {
      return {
        content: JSON.stringify({
          target_files: [
            "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx",
            "frontend/src/styles.css",
          ],
          impacted_modules: ["frontend"],
          risks: ["LLM reasoning may drift from Skill intent"],
          reasoning: "Reuse article-list-display-field Skill on ArticlesPreview because requirement matches reading-count keyword.",
        }),
        tokensIn: 320,
        tokensOut: 180,
        latencyMs: 1400,
        costEstimate: 0.0015,
      };
    },
  };

  const plan = await buildPlan({
    requirementCard: {
      id: "REQ-001",
      goal: "文章列表卡片展示阅读量",
      level: "L1",
    },
    sandbox: createAssertingSandbox(articleListDisplayFieldSkill.targetPaths),
    skill: articleListDisplayFieldSkill,
    historyRecall: { matches: [] },
    repoPath,
    env: { PLAN_MODE: "llm" },
    modelClient,
  });

  assert.equal(plan.source, "llm-driven");
  assert.equal(plan.target_files_source, "llm-driven");
  assert.equal(plan.plan_mode, "llm");
  assert.ok(plan.reasoning.includes("article-list-display-field"));
  assert.equal(plan.ai_call.stage, "plan");
  assert.equal(plan.ai_call.model, "mimo-v2.5");
  assert.ok(plan.ai_call.tokens_in > 0);
});

test("buildPlan rejects unsupported PLAN_MODE values", async () => {
  const repoPath = await createSandboxRepo(articleListDisplayFieldSkill.targetPaths);
  await assert.rejects(
    () => buildPlan({
      requirementCard: {
        id: "REQ-001",
        goal: "文章列表卡片展示阅读量",
        level: "L1",
      },
      sandbox: createAssertingSandbox(articleListDisplayFieldSkill.targetPaths),
      skill: articleListDisplayFieldSkill,
      historyRecall: { matches: [] },
      repoPath,
      env: { PLAN_MODE: "experimental" },
    }),
    /Unsupported PLAN_MODE/,
  );
});

test("buildPlan requires a real sandbox repo path", async () => {
  await assert.rejects(
    () => buildPlan({
      requirementCard: {
        id: "REQ-001",
        goal: "文章列表卡片展示阅读量",
        level: "L1",
      },
      sandbox: createAssertingSandbox(articleListDisplayFieldSkill.targetPaths),
      skill: articleListDisplayFieldSkill,
      historyRecall: { matches: [] },
    }),
    /requires a sandbox repo path/,
  );
});

test("buildPlan infers schema-driven target_files when Skill declares schemaChange", async () => {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "planning-schema-"));
  await mkdir(path.join(repoPath, "backend/models"), { recursive: true });
  await writeFile(
    path.join(repoPath, "backend/models/Article.js"),
    `"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Article extends Model {}
  Article.init(
    {
      slug: DataTypes.STRING,
      body: DataTypes.TEXT,
    },
    { sequelize, modelName: "Article" },
  );
  return Article;
};
`,
  );

  const assertedPaths = [];
  const plan = await buildPlan({
    requirementCard: {
      id: "REQ-COVER",
      goal: "为文章模型新增封面图字段",
      level: "L2",
    },
    sandbox: {
      async assertFiles(paths) {
        assertedPaths.push(...paths);
      },
    },
    skill: articleCoverImageSkill,
    historyRecall: { matches: [] },
    repoPath,
  });

  assert.equal(plan.target_files_source, "schema-driven");
  assert.equal(plan.schema_resolution.model, "Article");
  assert.equal(plan.schema_resolution.field, "coverImage");
  assert.deepEqual(plan.schema_resolution.generated_files, [
    "frontend/src/types/Article.ts",
    "frontend/src/services/articles.js",
    "frontend/src/__mocks__/articles.js",
  ]);
  assert.ok(plan.target_files.includes("backend/models/Article.js"));
  assert.ok(plan.target_files.includes("frontend/src/types/Article.ts"));
  assert.equal(plan.impact_matrix.cross_stack, true);
  assert.deepEqual(assertedPaths, ["backend/models/Article.js"]);
  assert.ok(plan.risks.some((risk) => risk.includes("schema-driven")));
});

function createAssertingSandbox(targetPaths) {
  return {
    async assertFiles(paths) {
      assert.deepEqual(paths, targetPaths);
    },
  };
}

async function createSandboxRepo(targetPaths) {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "planning-agent-sandbox-"));
  await Promise.all(targetPaths.map((targetPath) => writeTargetFile(repoPath, targetPath)));
  return repoPath;
}

async function writeTargetFile(repoPath, targetPath) {
  const filePath = path.join(repoPath, targetPath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "export const marker = true;\n", "utf8");
}
