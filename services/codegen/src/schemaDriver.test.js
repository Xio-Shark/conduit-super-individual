import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  readModelSchema,
  diffSchema,
  inferFrontendTargets,
  planSchemaChange,
} from "./schemaDriver.js";

async function buildTempRepo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "schema-driver-"));
  await fs.mkdir(path.join(root, "backend/models"), { recursive: true });
  await fs.mkdir(path.join(root, "frontend/src/services"), { recursive: true });
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
      description: DataTypes.TEXT,
      body: DataTypes.TEXT,
    },
    { sequelize, modelName: "Article" },
  );
  return Article;
};
`,
  );
  await fs.writeFile(
    path.join(root, "frontend/src/services/articles.js"),
    `export const list = () => [];\n`,
  );
  return root;
}

test("readModelSchema parses Sequelize init block", async () => {
  const repo = await buildTempRepo();
  const schema = await readModelSchema(repo, "Article");
  assert.equal(schema.model, "Article");
  assert.deepEqual(
    schema.fields,
    [
      { name: "slug", type: "STRING" },
      { name: "title", type: "STRING" },
      { name: "description", type: "TEXT" },
      { name: "body", type: "TEXT" },
    ],
  );
});

test("readModelSchema fails on missing model file", async () => {
  const repo = await buildTempRepo();
  await assert.rejects(() => readModelSchema(repo, "Missing"), /ENOENT/);
});

test("diffSchema rejects unsupported op", async () => {
  const repo = await buildTempRepo();
  const schema = await readModelSchema(repo, "Article");
  assert.throws(() => diffSchema(schema, { model: "Article", field: "x", type: "STRING", op: "wat" }), /change.op must be one of/);
});

test("diffSchema flags duplicate add and missing modify", async () => {
  const repo = await buildTempRepo();
  const schema = await readModelSchema(repo, "Article");
  assert.throws(
    () => diffSchema(schema, { model: "Article", field: "slug", type: "STRING", op: "add" }),
    /already exists/,
  );
  assert.throws(
    () => diffSchema(schema, { model: "Article", field: "coverImage", type: "STRING", op: "modify" }),
    /not found/,
  );
});

test("diffSchema returns FieldChangeSet for add", async () => {
  const repo = await buildTempRepo();
  const schema = await readModelSchema(repo, "Article");
  const change = diffSchema(schema, { model: "Article", field: "coverImage", type: "STRING", op: "add" });
  assert.equal(change.op, "add");
  assert.equal(change.field, "coverImage");
  assert.equal(change.currentType, null);
  assert.equal(change.modelPath, "backend/models/Article.js");
});

test("inferFrontendTargets splits existing and newly generated paths", async () => {
  const repo = await buildTempRepo();
  const targets = await inferFrontendTargets(repo, {
    model: "Article",
    field: "coverImage",
    type: "STRING",
    op: "add",
  });
  assert.deepEqual(targets.backendPaths, ["backend/models/Article.js"]);
  assert.ok(targets.frontendPaths.existing.includes("frontend/src/services/articles.js"));
  assert.ok(targets.frontendPaths.newlyGenerated.includes("frontend/src/types/Article.ts"));
  assert.ok(targets.frontendPaths.newlyGenerated.includes("frontend/src/__mocks__/articles.js"));
});

test("planSchemaChange composes diff + targets", async () => {
  const repo = await buildTempRepo();
  const plan = await planSchemaChange(repo, {
    model: "Article",
    field: "coverImage",
    type: "STRING",
    op: "add",
  });
  assert.equal(plan.change.field, "coverImage");
  assert.ok(plan.targetFiles.includes("backend/models/Article.js"));
  assert.ok(plan.targetFiles.includes("frontend/src/types/Article.ts"));
});
