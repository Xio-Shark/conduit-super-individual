import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateType,
  generateServiceStub,
  generateMock,
  generateAll,
} from "./frontendGenerators.js";

const COVER_CHANGE = Object.freeze({
  model: "Article",
  field: "coverImage",
  type: "STRING",
  op: "add",
});

const ARTICLE_SCHEMA = Object.freeze({
  model: "Article",
  modelPath: "backend/models/Article.js",
  fields: Object.freeze([
    { name: "slug", type: "STRING" },
    { name: "title", type: "STRING" },
    { name: "body", type: "TEXT" },
  ]),
});

test("generateType emits TS interface with merged field", () => {
  const code = generateType(COVER_CHANGE, ARTICLE_SCHEMA);
  assert.ok(code.includes("export interface Article {"));
  assert.ok(code.includes("slug: string;"));
  assert.ok(code.includes("coverImage: string;"));
});

test("generateType drops field on remove op", () => {
  const code = generateType(
    { model: "Article", field: "body", type: "TEXT", op: "remove" },
    ARTICLE_SCHEMA,
  );
  assert.ok(!code.includes("body: string"));
  assert.ok(code.includes("slug: string;"));
});

test("generateServiceStub emits list + update functions", () => {
  const code = generateServiceStub(COVER_CHANGE);
  assert.ok(code.includes("export async function getArticleList()"));
  assert.ok(code.includes("export async function updateArticleCoverImage(slug, value)"));
  assert.ok(code.includes("fetch(\"/api/articles\")"));
});

test("generateMock emits mock array with field values", () => {
  const code = generateMock(COVER_CHANGE);
  assert.ok(code.includes("export const mockArticles = ["));
  assert.ok(code.includes("coverImage: \"mock-1\""));
});

test("generateAll returns three artifacts", () => {
  const all = generateAll(COVER_CHANGE, ARTICLE_SCHEMA);
  assert.ok(all.type.includes("interface Article"));
  assert.ok(all.serviceStub.includes("updateArticleCoverImage"));
  assert.ok(all.mock.includes("mockArticles"));
});

test("generators reject invalid change shape", () => {
  assert.throws(() => generateType({}, ARTICLE_SCHEMA), /change.model/);
  assert.throws(() => generateServiceStub({ model: "X" }), /change.field/);
});
