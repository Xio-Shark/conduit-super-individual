import {
  DEFAULT_VALIDATION,
  assertIncludes,
  assertMatches,
  insertBeforeAnchorOnce,
} from "./skillHelpers.js";

const SKILL_ID = "article-list-display-field";
const PREVIEW_PATH = "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx";
const STYLE_PATH = "frontend/src/styles.css";
const READING_COUNT_BASE = 128;
const READING_COUNT_RANGE = 872;

export const articleListDisplayFieldSkill = Object.freeze({
  id: SKILL_ID,
  version: "1.0.0",
  intent: "在文章列表卡片增加展示字段",
  planSummary: "在 Conduit 文章列表卡片增加确定性阅读量展示。",
  appliesWhen: ["文章列表", "阅读量", "展示字段", "front-end display"],
  targetPaths: [PREVIEW_PATH, STYLE_PATH],
  validation: DEFAULT_VALIDATION,
});

export async function applyArticleListDisplayField(sandbox) {
  const preview = await sandbox.readText(PREVIEW_PATH);
  const styles = await sandbox.readText(STYLE_PATH);

  await sandbox.writeText(PREVIEW_PATH, updatePreview(preview));
  await sandbox.writeText(STYLE_PATH, updateStyles(styles));

  return {
    changedFiles: articleListDisplayFieldSkill.targetPaths,
    summary: "Article list cards now show a deterministic front-end read count.",
  };
}

function updatePreview(source) {
  if (source.includes("getReadingCount(article)")) {
    return source;
  }

  const componentAnchor = "function ArticlesPreview({ articles, loading, updateArticles }) {";
  const readMoreAnchor = /^(\s*)<span>Read more\.\.\.<\/span>$/m;
  assertIncludes(source, componentAnchor, { filePath: PREVIEW_PATH, skillId: SKILL_ID });
  assertMatches(source, readMoreAnchor, { filePath: PREVIEW_PATH, skillId: SKILL_ID });

  const withHelper = source.replace(
    componentAnchor,
    `${buildHelper()}\nfunction ArticlesPreview({ articles, loading, updateArticles }) {`,
  );

  return withHelper.replace(readMoreAnchor, buildReadMoreLine);
}

function updateStyles(source) {
  const styleAnchor = ".article-preview .preview-link ul {";
  return insertBeforeAnchorOnce(source, {
    marker: ".article-preview .reading-count",
    anchor: styleAnchor,
    insert: buildReadingCountStyles(),
    filePath: STYLE_PATH,
    skillId: SKILL_ID,
  });
}

function buildReadMoreLine(match, indent) {
  const nestedIndent = `${indent}  `;
  return [
    `${indent}<span>Read more...</span>`,
    `${indent}<span className="reading-count">`,
    `${nestedIndent}<i className="ion-eye"></i> {getReadingCount(article)} reads`,
    `${indent}</span>`,
  ].join("\n");
}

function buildHelper() {
  return `const READING_COUNT_BASE = ${READING_COUNT_BASE};\nconst READING_COUNT_RANGE = ${READING_COUNT_RANGE};\n\nfunction getReadingCount(article) {\n  const seed = article.slug ?? article.title;\n  if (typeof seed !== "string" || seed.trim() === "") {\n    throw new Error("Article slug or title is required to calculate reading count");\n  }\n  const total = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);\n  return READING_COUNT_BASE + (total % READING_COUNT_RANGE);\n}\n`;
}

function buildReadingCountStyles() {
  return `.article-preview .reading-count {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.25rem;\n  margin-left: 0.75rem;\n  color: var(--text-light);\n  font-size: 0.8rem;\n  font-weight: 300;\n}\n\n.article-preview .reading-count .ion-eye {\n  font-size: 0.9rem;\n}`;
}
