# PR Draft: 文章列表卡片展示阅读量

## Requirement
给文章列表加阅读量展示，前端假数据即可，不改后端。

## Plan
在 Conduit 文章列表卡片增加确定性阅读量展示。

## Files Changed
- frontend/src/components/ArticlesPreview/ArticlesPreview.jsx
- frontend/src/styles.css

## Verification
- npm run lint: gap
- npm run test: exit 1

## Risks
- P0 uses deterministic front-end placeholder reads, not production analytics.
- Lint is recorded as an explicit gap if the Conduit repo has no lint script.

## Rollback
Revert the generated patch or discard the branch before submitting PR.

## Diff Summary
diff --git a/frontend/src/components/ArticlesPreview/ArticlesPreview.jsx b/frontend/src/components/ArticlesPreview/ArticlesPreview.jsx
diff --git a/frontend/src/styles.css b/frontend/src/styles.css
