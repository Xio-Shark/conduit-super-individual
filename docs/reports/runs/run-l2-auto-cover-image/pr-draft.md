# PR Draft: 为 Article 模型新增 coverImage 字段并自动同步前端类型/服务/Mock

## Requirement
为文章加封面图字段

## Plan
schemaDriver 推断目标文件，frontendGenerators 生成跨栈三件套；Skill 不手写 targetPaths。

## Files Changed
- backend/controllers/articles.js
- backend/models/Article.js
- frontend/src/__mocks__/articles.js
- frontend/src/components/ArticlesPreview/ArticlesPreview.jsx
- frontend/src/services/articles.js
- frontend/src/types/Article.ts

## Verification
- npm run lint:sandbox: exit 0
- npm run test: exit 0

## Risks
- Conduit 根仓没有 lint script 时由实现仓库 ESLint 检查本次改动文件
- L2 跨栈改动须保持 API 字段与前端展示一致
- schema-driven Skill 生成的前端类型/服务/Mock 是首版骨架，业务字段绑定需后续 Skill 或人工细化

## Rollback
Revert the generated patch or discard the branch before submitting PR.

## Diff Summary
diff --git a/backend/controllers/articles.js b/backend/controllers/articles.js
diff --git a/backend/models/Article.js b/backend/models/Article.js
diff --git a/frontend/src/__mocks__/articles.js b/frontend/src/__mocks__/articles.js
diff --git a/frontend/src/components/ArticlesPreview/ArticlesPreview.jsx b/frontend/src/components/ArticlesPreview/ArticlesPreview.jsx
diff --git a/frontend/src/services/articles.js b/frontend/src/services/articles.js
diff --git a/frontend/src/types/Article.ts b/frontend/src/types/Article.ts
