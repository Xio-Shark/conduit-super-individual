# PR Draft: Popular Tags 前 5 个打标

## Requirement
给 Popular Tags 侧边栏前5个标签打醒目标记，纯前端

## Plan
在 Conduit 文章列表卡片增加确定性阅读量展示。

## Files Changed
- frontend/src/components/ArticlesPreview/ArticlesPreview.jsx
- frontend/src/components/PopularTags/TagButton.jsx
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
diff --git a/frontend/src/components/PopularTags/TagButton.jsx b/frontend/src/components/PopularTags/TagButton.jsx
diff --git a/frontend/src/routes/Article/Article.jsx b/frontend/src/routes/Article/Article.jsx
diff --git a/frontend/src/styles.css b/frontend/src/styles.css
