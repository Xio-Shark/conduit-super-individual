# PR Draft: 在每篇文章正文后展示阅读时间估算，帮助读者预估阅读投入

## Requirement
我想在每篇文章正文之后展示读完整篇所需时间的估算

## Plan
在文章详情页基于 Article.body 展示字数统计。

## Files Changed
- frontend/src/routes/Article/Article.jsx
- frontend/src/styles.css

## Verification
- npm run lint:sandbox: exit 0
- npm run test: exit 0

## Risks
- Conduit 根仓没有 lint script 时由实现仓库 ESLint 检查本次改动文件
- P0 只展示前端假数据，不代表真实阅读量统计

## Rollback
Revert the generated patch or discard the branch before submitting PR.

## Diff Summary
diff --git a/frontend/src/routes/Article/Article.jsx b/frontend/src/routes/Article/Article.jsx
diff --git a/frontend/src/styles.css b/frontend/src/styles.css
