import { checkArticleDraftCrossStackSync } from "../../checks/src/crossStackSync.js";
import { DEFAULT_VALIDATION, assertIncludes } from "./skillHelpers.js";

const SKILL_ID = "article-draft-indicator";
const PREVIEW_PATH = "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx";
const ARTICLE_MODEL = "backend/models/Article.js";
const ALL_ARTICLES = "backend/controllers/articles.js";

export const articleDraftIndicatorSkill = Object.freeze({
  id: SKILL_ID,
  version: "1.0.0",
  intent: "在文章列表与 API 中展示草稿状态",
  planSummary: "在 Conduit 文章列表与 API 响应中展示草稿状态（前后端一致）。",
  appliesWhen: ["草稿", "draft", "草稿状态"],
  targetPaths: [PREVIEW_PATH, ARTICLE_MODEL, ALL_ARTICLES],
  validation: DEFAULT_VALIDATION,
  crossStackCheck: checkArticleDraftCrossStackSync,
});

export async function applyArticleDraftIndicator(sandbox) {
  const preview = await sandbox.readText(PREVIEW_PATH);
  const model = await sandbox.readText(ARTICLE_MODEL);
  const controller = await sandbox.readText(ALL_ARTICLES);

  await sandbox.writeText(PREVIEW_PATH, updatePreview(preview));
  await sandbox.writeText(ARTICLE_MODEL, updateModel(model));
  await sandbox.writeText(ALL_ARTICLES, updateController(controller));

  return {
    changedFiles: articleDraftIndicatorSkill.targetPaths,
    summary: "Article list and API now expose a consistent draft flag.",
  };
}

function updatePreview(source) {
  if (source.includes("article.draft")) {
    return source;
  }

  const titleAnchor = "<h1>{article.title}</h1>";
  assertIncludes(source, titleAnchor, { filePath: PREVIEW_PATH, skillId: SKILL_ID });
  return source.replace(
    titleAnchor,
    `<h1>{article.title}{article.draft ? <span className="draft-badge">Draft</span> : null}</h1>`,
  );
}

function updateModel(source) {
  if (source.includes("draft: DataTypes.BOOLEAN")) {
    return source;
  }

  const bodyAnchor = "body: DataTypes.TEXT,";
  assertIncludes(source, bodyAnchor, { filePath: ARTICLE_MODEL, skillId: SKILL_ID });
  return source.replace(bodyAnchor, "body: DataTypes.TEXT,\n      draft: DataTypes.BOOLEAN,");
}

function updateController(source) {
  if (source.includes("draft: false")) {
    return source;
  }

  const createAnchor = `    const article = await Article.create({
      slug: slug,
      title: title,
      description: description,
      body: body,
    });`;
  assertIncludes(source, createAnchor, { filePath: ALL_ARTICLES, skillId: SKILL_ID });
  return source.replace(
    createAnchor,
    `    const article = await Article.create({
      slug: slug,
      title: title,
      description: description,
      body: body,
      draft: false,
    });`,
  );
}
