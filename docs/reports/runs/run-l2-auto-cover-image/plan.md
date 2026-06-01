# Plan

```json
{
  "summary": "schemaDriver 推断目标文件，frontendGenerators 生成跨栈三件套；Skill 不手写 targetPaths。",
  "requirement_id": "REQ-L2-ARTICLE-COVER-IMAGE",
  "skill_id": "article-cover-image",
  "skill_version": "1.0.0",
  "impacted_modules": [
    "frontend",
    "backend"
  ],
  "impact_matrix": {
    "level": "L2",
    "modules": [
      "frontend",
      "backend"
    ],
    "frontend_paths": [
      "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx",
      "frontend/src/types/Article.ts",
      "frontend/src/services/articles.js",
      "frontend/src/__mocks__/articles.js"
    ],
    "backend_paths": [
      "backend/models/Article.js",
      "backend/controllers/articles.js"
    ],
    "cross_stack": true
  },
  "history_references": [
    {
      "run_id": "run-2026-05-20T17-37-55-856Z",
      "goal": "文章列表卡片展示阅读量",
      "skill_id": "article-list-display-field",
      "score": 0.25,
      "summary": "在 Conduit 文章列表卡片增加确定性阅读量展示。",
      "match_type": "skill_id",
      "similarity_score": null
    },
    {
      "run_id": "run-2026-05-21T05-52-04-582Z",
      "goal": "文章列表与 API 展示草稿状态",
      "skill_id": "article-list-display-field",
      "score": 0.25,
      "summary": "在 Conduit 文章列表卡片增加确定性阅读量展示。",
      "match_type": "skill_id",
      "similarity_score": null
    },
    {
      "run_id": "run-2026-05-21T05-52-12-490Z",
      "goal": "文章列表与 API 展示草稿状态",
      "skill_id": "article-draft-indicator",
      "score": 0.25,
      "summary": "在 Conduit 文章列表与 API 响应中展示草稿状态（前后端一致）。",
      "match_type": "skill_id",
      "similarity_score": null
    }
  ],
  "target_files": [
    "backend/models/Article.js",
    "backend/controllers/articles.js",
    "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx",
    "frontend/src/types/Article.ts",
    "frontend/src/services/articles.js",
    "frontend/src/__mocks__/articles.js"
  ],
  "target_files_source": "schema-driven",
  "schema_resolution": {
    "model": "Article",
    "field": "coverImage",
    "type": "STRING",
    "op": "add",
    "generated_files": [
      "frontend/src/types/Article.ts",
      "frontend/src/services/articles.js",
      "frontend/src/__mocks__/articles.js"
    ],
    "already_applied": false
  },
  "sandbox_index": {
    "fileCount": 130,
    "frontendFiles": 97,
    "backendFiles": 33,
    "targets": [
      {
        "path": "backend/models/Article.js",
        "exists": true,
        "exports": [],
        "imports": []
      }
    ]
  },
  "risks": [
    "Conduit 根仓没有 lint script 时由实现仓库 ESLint 检查本次改动文件",
    "L2 跨栈改动须保持 API 字段与前端展示一致",
    "schema-driven Skill 生成的前端类型/服务/Mock 是首版骨架，业务字段绑定需后续 Skill 或人工细化"
  ],
  "validation_commands": [
    "npm run lint:sandbox",
    "npm test"
  ]
}
```
