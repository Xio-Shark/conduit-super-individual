# PR Draft: 文章列表与 API 展示草稿状态

## Requirement
给文章列表加上草稿状态展示，前后端 API 和列表卡片都要能看到 draft。

## Plan
在 Conduit 文章列表与 API 响应中展示草稿状态（前后端一致）。

## Files Changed
- backend/controllers/articles.js
- backend/models/Article.js
- frontend/src/components/ArticlesPreview/ArticlesPreview.jsx

## Verification
- npm run lint:sandbox: exit 0
- npm run test: exit 0

## Risks
- P0 adds deterministic front-end read counts for demo delivery; it does not add production analytics instrumentation.
- If the Conduit repo has no lint script, the implementation repo runs ESLint on the changed Conduit files.

## Rollback
Revert the generated patch or discard the branch before submitting PR.

## Diff Summary
diff --git a/backend/controllers/articles.js b/backend/controllers/articles.js
diff --git a/backend/models/Article.js b/backend/models/Article.js
diff --git a/frontend/src/components/ArticlesPreview/ArticlesPreview.jsx b/frontend/src/components/ArticlesPreview/ArticlesPreview.jsx
