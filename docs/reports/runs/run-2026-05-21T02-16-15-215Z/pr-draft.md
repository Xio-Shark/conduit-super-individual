# PR Draft: 文章列表卡片展示阅读量

## Requirement
给文章列表加阅读量展示，前端假数据即可，不改后端。

## Plan
在 Conduit 文章列表卡片增加确定性阅读量展示。

## Files Changed
- frontend/src/components/ArticlesPreview/ArticlesPreview.jsx
- frontend/src/styles.css
- package-lock.json
- package.json

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
diff --git a/frontend/src/styles.css b/frontend/src/styles.css
diff --git a/package-lock.json b/package-lock.json
diff --git a/package.json b/package.json
