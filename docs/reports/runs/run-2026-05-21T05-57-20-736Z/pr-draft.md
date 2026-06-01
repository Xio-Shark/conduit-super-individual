# PR Draft: 优化 Conduit 前端文章列表的视觉展示，增加数据指标显示，保持最小代码改动

## Requirement
文章列表想好看一点，加点数据，别动太多代码

## Plan
在 Conduit 文章列表卡片增加确定性阅读量展示。

## Files Changed
- frontend/src/components/ArticlesPreview/ArticlesPreview.jsx
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
diff --git a/frontend/src/components/ArticlesPreview/ArticlesPreview.jsx b/frontend/src/components/ArticlesPreview/ArticlesPreview.jsx
diff --git a/frontend/src/routes/Article/Article.jsx b/frontend/src/routes/Article/Article.jsx
diff --git a/frontend/src/styles.css b/frontend/src/styles.css
