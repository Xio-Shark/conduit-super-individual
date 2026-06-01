import { DEFAULT_VALIDATION, assertIncludes, insertBeforeAnchorOnce } from "./skillHelpers.js";

const SKILL_ID = "article-favorite-filter-toggle";
const PREVIEW_PATH = "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx";
const STYLE_PATH = "frontend/src/styles.css";

export const articleFavoriteFilterToggleSkill = Object.freeze({
  id: SKILL_ID,
  version: "1.0.0",
  intent: "在文章列表增加收藏状态筛选开关",
  planSummary: "在 ArticlesPreview 顶部增加仅看已收藏文章的本地筛选开关。",
  appliesWhen: ["收藏状态筛选", "收藏筛选", "favorite filter", "favorited filter"],
  intentWeights: {
    收藏状态筛选: 4,
    收藏筛选: 4,
    "favorite filter": 4,
  },
  targetPaths: [PREVIEW_PATH, STYLE_PATH],
  validation: DEFAULT_VALIDATION,
});

export async function applyArticleFavoriteFilterToggle(sandbox) {
  const preview = await sandbox.readText(PREVIEW_PATH);
  const styles = await sandbox.readText(STYLE_PATH);

  await sandbox.writeText(PREVIEW_PATH, updatePreview(preview));
  await sandbox.writeText(STYLE_PATH, updateStyles(styles));

  return {
    changedFiles: articleFavoriteFilterToggleSkill.targetPaths,
    summary: "Article preview now supports a local favorite-only filter toggle.",
  };
}

function updatePreview(source) {
  if (source.includes("favorite-filter-toggle")) return source;

  const importAnchor = 'import { Link } from "react-router-dom";';
  const componentAnchor = "function ArticlesPreview({ articles, loading, updateArticles }) {";
  const returnAnchor = "  return articles?.length > 0 ? (";
  const mapAnchor = "    articles.map((article) => {";
  assertIncludes(source, importAnchor, { filePath: PREVIEW_PATH, skillId: SKILL_ID });
  assertIncludes(source, componentAnchor, { filePath: PREVIEW_PATH, skillId: SKILL_ID });
  assertIncludes(source, returnAnchor, { filePath: PREVIEW_PATH, skillId: SKILL_ID });
  assertIncludes(source, mapAnchor, { filePath: PREVIEW_PATH, skillId: SKILL_ID });

  return source
    .replace(importAnchor, `${importAnchor}\nimport { useState } from "react";`)
    .replace(componentAnchor, `${componentAnchor}\n  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);`)
    .replace(returnAnchor, "  const visibleArticles = showFavoritesOnly ? articles?.filter((article) => article.favorited) : articles;\n\n  return articles?.length > 0 ? (")
    .replace(
      mapAnchor,
      `    <>
      <button
        className="favorite-filter-toggle"
        onClick={() => setShowFavoritesOnly((value) => !value)}
        type="button"
      >
        {showFavoritesOnly ? "Show all articles" : "Show favorites only"}
      </button>
      {visibleArticles.map((article) => {`,
    )
    .replace("    })", "      })}\n    </>");
}

function updateStyles(source) {
  return insertBeforeAnchorOnce(source, {
    marker: ".favorite-filter-toggle",
    anchor: ".article-preview {",
    insert: `.favorite-filter-toggle {
  margin-bottom: 1rem;
  border: 1px solid var(--themeColor);
  border-radius: 0.25rem;
  background: transparent;
  color: var(--themeColor);
  font-size: 0.85rem;
  padding: 0.35rem 0.75rem;
}`,
    filePath: STYLE_PATH,
    skillId: SKILL_ID,
  });
}
