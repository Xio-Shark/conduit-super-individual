import { DEFAULT_VALIDATION, assertIncludes, insertBeforeAnchorOnce } from "./skillHelpers.js";

const SKILL_ID = "article-detail-word-count";
const ARTICLE_PATH = "frontend/src/routes/Article/Article.jsx";
const STYLE_PATH = "frontend/src/styles.css";

export const articleDetailWordCountSkill = Object.freeze({
  id: SKILL_ID,
  version: "1.0.0",
  intent: "在文章详情页展示正文字数",
  planSummary: "在文章详情页基于 Article.body 展示字数统计。",
  appliesWhen: ["字数", "字数统计", "word count", "详情页"],
  targetPaths: [ARTICLE_PATH, STYLE_PATH],
  validation: DEFAULT_VALIDATION,
});

export async function applyArticleDetailWordCount(sandbox) {
  const articlePage = await sandbox.readText(ARTICLE_PATH);
  const styles = await sandbox.readText(STYLE_PATH);

  await sandbox.writeText(ARTICLE_PATH, updateArticlePage(articlePage));
  await sandbox.writeText(STYLE_PATH, updateStyles(styles));

  return {
    changedFiles: articleDetailWordCountSkill.targetPaths,
    summary: "Article detail page now shows a deterministic word count for Article.body.",
  };
}

function updateArticlePage(source) {
  if (source.includes("getWordCount(body)")) {
    return source;
  }

  const importAnchor = 'import getArticle from "../../services/getArticle";';
  const bodyAnchor = "{body && <Markdown options={{ forceBlock: true }}>{body}</Markdown>}";
  assertIncludes(source, importAnchor, { filePath: ARTICLE_PATH, skillId: SKILL_ID });
  assertIncludes(source, bodyAnchor, { filePath: ARTICLE_PATH, skillId: SKILL_ID });

  const withHelper = source.replace(
    importAnchor,
    `${importAnchor}\n\nfunction getWordCount(text) {\n  if (typeof text !== "string" || !text.trim()) return 0;\n  return text.trim().split(/\\s+/).length;\n}`,
  );

  return withHelper.replace(
    bodyAnchor,
    `{body ? (\n              <>\n                <Markdown options={{ forceBlock: true }}>{body}</Markdown>\n                <p className="article-word-count">{getWordCount(body)} words</p>\n              </>\n            ) : null}`,
  );
}

function updateStyles(source) {
  const anchor = ".article-page .banner {";
  return insertBeforeAnchorOnce(source, {
    marker: ".article-word-count",
    anchor,
    insert: `.article-word-count {\n  margin-top: 1rem;\n  color: var(--text-light);\n  font-size: 0.85rem;\n}`,
    filePath: STYLE_PATH,
    skillId: SKILL_ID,
  });
}
