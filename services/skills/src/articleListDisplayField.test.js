import assert from "node:assert/strict";
import test from "node:test";
import { applyArticleListDisplayField } from "./articleListDisplayField.js";

const preview = `import { Link } from "react-router-dom";
import ArticleMeta from "../ArticleMeta";
import ArticleTags from "../ArticleTags";
import FavButton from "../FavButton";

function ArticlesPreview({ articles, loading, updateArticles }) {
  return (
    <Link>
      <span>Read more...</span>
      <ArticleTags tagList={article.tagList} />
    </Link>
  );
}
`;

const styles = `.article-preview .preview-link ul {
  float: right;
}
`;

test("article list display Skill writes read count UI", async () => {
  const sandbox = createFakeSandbox({ preview, styles });
  const result = await applyArticleListDisplayField(sandbox);

  assert.deepEqual(result.changedFiles, [
    "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx",
    "frontend/src/styles.css",
  ]);
  assert.match(
    sandbox.files["frontend/src/components/ArticlesPreview/ArticlesPreview.jsx"],
    /getReadingCount\(article\)/,
  );
  assert.match(sandbox.files["frontend/src/styles.css"], /reading-count/);
});

test("article list display Skill fails when expected JSX anchor is missing", async () => {
  const sandbox = createFakeSandbox({
    preview: preview.replace("      <span>Read more...</span>", "      <span>Continue</span>"),
    styles,
  });

  await assert.rejects(
    () => applyArticleListDisplayField(sandbox),
    /missing anchor in frontend\/src\/components\/ArticlesPreview\/ArticlesPreview.jsx/,
  );
});

test("article list display Skill fails when expected CSS anchor is missing", async () => {
  const sandbox = createFakeSandbox({
    preview,
    styles: ".article-preview { color: inherit; }\n",
  });

  await assert.rejects(
    () => applyArticleListDisplayField(sandbox),
    /missing anchor in frontend\/src\/styles.css/,
  );
});

function createFakeSandbox({ preview, styles }) {
  const files = {
    "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx": preview,
    "frontend/src/styles.css": styles,
  };

  return {
    files,
    readText: async (path) => files[path],
    writeText: async (path, content) => {
      files[path] = content;
    },
  };
}
