import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ConduitSandbox } from "../../sandbox/src/conduitSandbox.js";
import { applySchemaDrivenChange } from "./schemaDrivenSkill.js";
import { applyArticleCoverImage, articleCoverImageSkill } from "./articleCoverImage.js";

async function buildSandboxFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cover-skill-"));
  await fs.mkdir(path.join(root, "backend/models"), { recursive: true });
  await fs.writeFile(
    path.join(root, "backend/models/Article.js"),
    `"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Article extends Model {}
  Article.init(
    {
      slug: DataTypes.STRING,
      title: DataTypes.STRING,
      body: DataTypes.TEXT,
    },
    { sequelize, modelName: "Article" },
  );
  return Article;
};
`,
  );
  return new ConduitSandbox(root);
}

test("articleCoverImageSkill declares schemaChange and no targetPaths", () => {
  assert.equal(articleCoverImageSkill.id, "article-cover-image");
  assert.equal(articleCoverImageSkill.schemaChange.model, "Article");
  assert.equal(articleCoverImageSkill.schemaChange.field, "coverImage");
  assert.equal(articleCoverImageSkill.schemaChange.op, "add");
  assert.ok(!("targetPaths" in articleCoverImageSkill));
});

test("applySchemaDrivenChange writes 4 cross-stack files", async () => {
  const sandbox = await buildSandboxFixture();
  const result = await applySchemaDrivenChange(sandbox, articleCoverImageSkill.schemaChange);
  assert.equal(result.changedFiles.length, 4);
  assert.deepEqual(result.changedFiles, [
    "backend/models/Article.js",
    "frontend/src/types/Article.ts",
    "frontend/src/services/articles.js",
    "frontend/src/__mocks__/articles.js",
  ]);

  const model = await sandbox.readText("backend/models/Article.js");
  assert.ok(model.includes("coverImage: DataTypes.STRING,"));
  const tsType = await sandbox.readText("frontend/src/types/Article.ts");
  assert.ok(tsType.includes("export interface Article"));
  assert.ok(tsType.includes("coverImage: string;"));
  const service = await sandbox.readText("frontend/src/services/articles.js");
  assert.ok(service.includes("updateArticleCoverImage"));
  const mock = await sandbox.readText("frontend/src/__mocks__/articles.js");
  assert.ok(mock.includes("mockArticles"));
});

test("applyArticleCoverImage is idempotent on model file", async () => {
  const sandbox = await buildSandboxFixture();
  await applyArticleCoverImage(sandbox);
  const firstModel = await sandbox.readText("backend/models/Article.js");
  await applyArticleCoverImage(sandbox);
  const secondModel = await sandbox.readText("backend/models/Article.js");
  assert.equal(firstModel, secondModel);
});

test("applySchemaDrivenChange also injects controller and preview when present", async () => {
  const sandbox = await buildSandboxFixture();
  const repoPath = sandbox.repoPath;
  await fs.mkdir(`${repoPath}/backend/controllers`, { recursive: true });
  await fs.writeFile(
    `${repoPath}/backend/controllers/articles.js`,
    `module.exports.create = async (req, res) => {
  const { title, body } = req.body;
  const article = await Article.create({
    title: title,
    body: body,
  });
  res.json(article);
};
`,
  );
  await fs.mkdir(`${repoPath}/frontend/src/components/ArticlesPreview`, { recursive: true });
  await fs.writeFile(
    `${repoPath}/frontend/src/components/ArticlesPreview/ArticlesPreview.jsx`,
    `export function ArticlesPreview({ article }) {
  return (
    <article>
      <h1>{article.title}</h1>
      <p>{article.body}</p>
    </article>
  );
}
`,
  );

  const result = await applyArticleCoverImage(sandbox);
  assert.ok(result.changedFiles.includes("backend/controllers/articles.js"));
  assert.ok(result.changedFiles.includes("frontend/src/components/ArticlesPreview/ArticlesPreview.jsx"));

  const controller = await sandbox.readText("backend/controllers/articles.js");
  assert.ok(controller.includes("coverImage: req.body.coverImage ?? null"));
  const preview = await sandbox.readText("frontend/src/components/ArticlesPreview/ArticlesPreview.jsx");
  assert.ok(preview.includes("article.coverImage"));
  assert.ok(preview.includes("coverImage-thumb"));
});
