import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { recallHistory } from "./historyRecall.js";

test("recallHistory ranks similar archived requirements from evidence", async () => {
  const projectRoot = await makeProjectRoot();
  await makeArchivedRun(projectRoot, "run-related", {
    requirement: {
      source_input: "给文章列表加阅读量展示",
      goal: "文章列表卡片展示阅读量",
      acceptance: ["文章列表每张卡片显示 reads"],
    },
    plan: {
      summary: "在 Conduit 文章列表卡片增加确定性阅读量展示。",
      skill_id: "article-list-display-field",
      target_files: ["frontend/src/components/ArticlesPreview/ArticlesPreview.jsx"],
    },
  });
  await makeArchivedRun(projectRoot, "run-unrelated", {
    requirement: {
      source_input: "给设置页增加主题切换",
      goal: "设置页主题切换",
      acceptance: ["用户可以切换主题"],
    },
    plan: {
      summary: "修改设置页面主题开关。",
      skill_id: "settings-theme-toggle",
      target_files: ["frontend/src/settings.jsx"],
    },
  });

  const result = await recallHistory({
    input: "文章列表展示阅读量，前端估算即可",
    projectRoot,
  });

  assert.equal(result.matches[0].runId, "run-related");
  assert.equal(result.matches[0].skillId, "article-list-display-field");
  assert.ok(result.matches[0].score > 0);
});

test("recallHistory reports incomplete archived runs as degraded with skipped", async () => {
  const projectRoot = await makeProjectRoot();
  await mkdir(path.join(projectRoot, "docs/reports/runs/run-incomplete"), { recursive: true });

  const result = await recallHistory({ input: "文章列表阅读量", projectRoot });

  assert.equal(result.matches.length, 0);
  assert.equal(result.skipped[0].runId, "run-incomplete");
  assert.equal(result.status, "degraded");
});

test("recallHistory reports degraded when any archived run is incomplete but matches exist", async () => {
  const projectRoot = await makeProjectRoot();
  await mkdir(path.join(projectRoot, "docs/reports/runs/run-incomplete"), { recursive: true });
  await makeArchivedRun(projectRoot, "run-related", {
    requirement: {
      source_input: "给文章列表加阅读量展示",
      goal: "文章列表卡片展示阅读量",
      acceptance: ["文章列表每张卡片显示 reads"],
    },
    plan: {
      summary: "在 Conduit 文章列表卡片增加确定性阅读量展示。",
      skill_id: "article-list-display-field",
      target_files: ["frontend/src/components/ArticlesPreview/ArticlesPreview.jsx"],
    },
  });

  const result = await recallHistory({ input: "文章列表阅读量", projectRoot });

  assert.equal(result.status, "degraded");
  assert.equal(result.matches[0].runId, "run-related");
  assert.equal(result.skipped[0].runId, "run-incomplete");
});

test("recallHistory exposes missing history directory", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "super-individual-history-missing-"));

  const result = await recallHistory({ input: "文章列表阅读量", projectRoot });

  assert.equal(result.status, "missing_history");
  assert.equal(result.matches.length, 0);
  assert.match(result.invalidRuns[0].path, /docs\/reports\/runs/);
});

async function makeProjectRoot() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "super-individual-history-"));
  await mkdir(path.join(projectRoot, "docs/reports/runs"), { recursive: true });
  return projectRoot;
}

async function makeArchivedRun(projectRoot, runId, { requirement, plan }) {
  const runDir = path.join(projectRoot, "docs/reports/runs", runId);
  await mkdir(runDir, { recursive: true });
  await writeMarkdownJson(path.join(runDir, "requirement.md"), requirement);
  await writeMarkdownJson(path.join(runDir, "plan.md"), plan);
}

function writeMarkdownJson(filePath, value) {
  return writeFile(
    filePath,
    `# Data\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`,
  );
}
