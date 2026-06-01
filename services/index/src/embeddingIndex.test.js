import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  tokenize,
  embed,
  cosineSimilarity,
  indexPassedRuns,
  writeEmbeddingsIndex,
  readEmbeddingsIndex,
  recallTopK,
} from "./embeddingIndex.js";

test("tokenize emits ASCII words and Chinese bigrams", () => {
  const tokens = tokenize("Add article cover image 给文章加封面图");
  assert.ok(tokens.includes("article"));
  assert.ok(tokens.includes("cover"));
  assert.ok(tokens.includes("image"));
  assert.ok(tokens.includes("文章"));
  assert.ok(tokens.includes("封面"));
});

test("embed returns fixed-dim normalized vector", () => {
  const v = embed("文章列表展示阅读量");
  assert.equal(v.length, 256);
  let mag = 0;
  for (const value of v) mag += value * value;
  assert.ok(Math.abs(Math.sqrt(mag) - 1) < 1e-5);
});

test("cosineSimilarity is high for similar Chinese texts", () => {
  const v1 = embed("文章列表展示阅读量");
  const v2 = embed("文章列表展示字数统计");
  const v3 = embed("用户登录页面调整");
  const simClose = cosineSimilarity(v1, v2);
  const simFar = cosineSimilarity(v1, v3);
  assert.ok(simClose > simFar, `similar should beat unrelated: close=${simClose} far=${simFar}`);
});

async function buildProjectFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "embedding-idx-"));
  const runsRoot = path.join(root, "docs/reports/runs");
  await fs.mkdir(runsRoot, { recursive: true });
  const runA = path.join(runsRoot, "run-A");
  await fs.mkdir(runA, { recursive: true });
  await fs.writeFile(path.join(runA, "run-summary.json"), JSON.stringify({ status: "passed", skillId: "article-detail-word-count" }));
  await fs.writeFile(path.join(runA, "requirement.md"), `# Requirement\n\n\`\`\`json\n${JSON.stringify({
    source_input: "在文章详情页展示字数统计",
    goal: "Article detail word count",
    clarifications: ["前端 only，不改后端"],
  })}\n\`\`\`\n`);
  return root;
}

test("indexPassedRuns + writeEmbeddingsIndex + readEmbeddingsIndex round-trip", async () => {
  const root = await buildProjectFixture();
  const records = await indexPassedRuns(root);
  assert.equal(records.length, 1);
  await writeEmbeddingsIndex(root, records);
  const reloaded = await readEmbeddingsIndex(root);
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0].runId, "run-A");
  assert.equal(reloaded[0].vector.length, 256);
});

test("recallTopK ranks higher similarity first", async () => {
  const root = await buildProjectFixture();
  const records = await indexPassedRuns(root);
  const query = embed("文章详情页加阅读时长");
  const top = recallTopK(query, records, 3);
  assert.equal(top[0].runId, "run-A");
  assert.ok(top[0].similarity > 0);
});
