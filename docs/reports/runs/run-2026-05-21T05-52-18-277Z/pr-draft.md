# PR Draft: 文章详情页展示正文字数统计

## Requirement
在文章详情页根据 Article.body 做字数统计展示。

## Plan
在文章详情页基于 Article.body 展示字数统计。

## Files Changed
- frontend/src/routes/Article/Article.jsx
- frontend/src/styles.css

## Verification
- npm run lint:sandbox: exit 0
- npm run test: exit 0

## Risks
- P0 adds deterministic front-end read counts for demo delivery; it does not add production analytics instrumentation.
- If the Conduit repo has no lint script, the implementation repo runs ESLint on the changed Conduit files.

## Rollback
Revert the generated patch or discard the branch before submitting PR.

## Diff Summary
diff --git a/frontend/src/routes/Article/Article.jsx b/frontend/src/routes/Article/Article.jsx
diff --git a/frontend/src/styles.css b/frontend/src/styles.css
