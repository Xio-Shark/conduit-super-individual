import assert from "node:assert/strict";
import test from "node:test";
import { applyArticleDraftIndicator } from "./articleDraftIndicator.js";

const preview = `function ArticlesPreview({ articles }) {
  return (
    <Link>
      <h1>{article.title}</h1>
    </Link>
  );
}
`;

const articleModel = `module.exports = (sequelize, DataTypes) => {
  const Article = sequelize.define("Article", {
    slug: DataTypes.STRING,
    title: DataTypes.STRING,
    description: DataTypes.STRING,
    body: DataTypes.TEXT,
  });
  return Article;
};
`;

const articlesController = `async function createArticle(req, res, next) {
  try {
    const article = await Article.create({
      slug: slug,
      title: title,
      description: description,
      body: body,
    });
    return res.json({ article });
  } catch (error) {
    next(error);
  }
}
`;

test("article draft indicator Skill writes cross-stack draft UI and API fields", async () => {
  const sandbox = createFakeSandbox({ preview, articleModel, articlesController });
  const result = await applyArticleDraftIndicator(sandbox);

  assert.deepEqual(result.changedFiles, [
    "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx",
    "backend/models/Article.js",
    "backend/controllers/articles.js",
  ]);
  assert.match(
    sandbox.files["frontend/src/components/ArticlesPreview/ArticlesPreview.jsx"],
    /draft-badge/,
  );
  assert.match(sandbox.files["backend/models/Article.js"], /draft: DataTypes\.BOOLEAN/);
  assert.match(sandbox.files["backend/controllers/articles.js"], /draft: false/);
});

test("article draft indicator Skill fails when preview anchor is missing", async () => {
  const sandbox = createFakeSandbox({
    preview: preview.replace("<h1>{article.title}</h1>", "<h2>{article.title}</h2>"),
    articleModel,
    articlesController,
  });

  await assert.rejects(
    () => applyArticleDraftIndicator(sandbox),
    /missing anchor in frontend\/src\/components\/ArticlesPreview\/ArticlesPreview.jsx/,
  );
});

function createFakeSandbox({ preview, articleModel, articlesController }) {
  const files = {
    "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx": preview,
    "backend/models/Article.js": articleModel,
    "backend/controllers/articles.js": articlesController,
  };

  return {
    files,
    readText: async (path) => files[path],
    writeText: async (path, content) => {
      files[path] = content;
    },
  };
}
