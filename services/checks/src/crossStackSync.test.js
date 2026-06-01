import assert from "node:assert/strict";
import test from "node:test";
import { checkArticleDraftCrossStackSync } from "./crossStackSync.js";

test("checkArticleDraftCrossStackSync passes when draft appears on both sides", () => {
  const result = checkArticleDraftCrossStackSync({
    sandboxFiles: [
      {
        path: "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx",
        content: `<h1>{article.title}{article.draft ? <span className="draft-badge">Draft</span> : null}</h1>`,
      },
      { path: "backend/models/Article.js", content: "draft: DataTypes.BOOLEAN" },
      { path: "backend/controllers/articles.js", content: "draft: false" },
    ],
  });

  assert.equal(result.status, "passed");
});

test("checkArticleDraftCrossStackSync fails when backend draft is missing", () => {
  const result = checkArticleDraftCrossStackSync({
    sandboxFiles: [
      {
        path: "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx",
        content: `<span className="draft-badge">{article.draft}</span>`,
      },
      { path: "backend/models/Article.js", content: "draft: DataTypes.BOOLEAN" },
      { path: "backend/controllers/articles.js", content: "no article flag" },
    ],
  });

  assert.equal(result.status, "failed");
});

test("checkArticleDraftCrossStackSync rejects generic draft mentions without implementation anchors", () => {
  const result = checkArticleDraftCrossStackSync({
    sandboxFiles: [
      { path: "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx", content: "draft comment only" },
      { path: "backend/models/Article.js", content: "draft comment only" },
      { path: "backend/controllers/articles.js", content: "draft comment only" },
    ],
  });

  assert.equal(result.status, "failed");
});
