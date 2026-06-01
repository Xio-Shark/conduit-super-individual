import assert from "node:assert/strict";
import test from "node:test";
import { applyArticleDetailWordCount } from "./articleDetailWordCount.js";

const articlePage = `import Markdown from "markdown-to-jsx";
import getArticle from "../../services/getArticle";

function Article() {
  return (
    <div>
      {body && <Markdown options={{ forceBlock: true }}>{body}</Markdown>}
    </div>
  );
}
`;

const styles = `.article-page .banner {
  padding: 2rem 0;
}
`;

test("article detail word count Skill writes word count UI", async () => {
  const sandbox = createFakeSandbox({ articlePage, styles });
  const result = await applyArticleDetailWordCount(sandbox);

  assert.deepEqual(result.changedFiles, [
    "frontend/src/routes/Article/Article.jsx",
    "frontend/src/styles.css",
  ]);
  assert.match(sandbox.files["frontend/src/routes/Article/Article.jsx"], /getWordCount\(body\)/);
  assert.match(sandbox.files["frontend/src/styles.css"], /article-word-count/);
});

test("article detail word count Skill fails when body anchor is missing", async () => {
  const sandbox = createFakeSandbox({
    articlePage: articlePage.replace(
      "{body && <Markdown options={{ forceBlock: true }}>{body}</Markdown>}",
      "{body}",
    ),
    styles,
  });

  await assert.rejects(
    () => applyArticleDetailWordCount(sandbox),
    /missing anchor in frontend\/src\/routes\/Article\/Article.jsx/,
  );
});

function createFakeSandbox({ articlePage, styles }) {
  const files = {
    "frontend/src/routes/Article/Article.jsx": articlePage,
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
