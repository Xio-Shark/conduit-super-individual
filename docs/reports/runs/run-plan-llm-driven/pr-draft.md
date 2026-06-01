# PR Draft: 文章列表卡片展示阅读量

## Requirement
给文章列表加阅读量展示，前端假数据即可，不改后端

## Plan
在 Conduit 文章列表卡片增加确定性阅读量展示。

## Files Changed
- frontend/src/components/ArticlesPreview/ArticlesPreview.jsx
- frontend/src/styles.css

## Verification
- npm run lint:sandbox: exit 0
- npm run test: exit 0

## Risks
- Conduit 根仓没有 lint script 时由实现仓库 ESLint 检查本次改动文件
- P0 只展示前端假数据，不代表真实阅读量统计
- The skill targetPaths include 'frontend/src/styles.css', but this file is not present in the sandbox_index, which may cause style-related issues or require adaptation during implementation.

## Rollback
Revert the generated patch or discard the branch before submitting PR.

## Diff Summary
diff --git a/frontend/src/components/ArticlesPreview/ArticlesPreview.jsx b/frontend/src/components/ArticlesPreview/ArticlesPreview.jsx
diff --git a/frontend/src/styles.css b/frontend/src/styles.css
