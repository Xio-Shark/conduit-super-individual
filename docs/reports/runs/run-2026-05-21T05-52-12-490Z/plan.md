# Plan

```json
{
  "summary": "在 Conduit 文章列表与 API 响应中展示草稿状态（前后端一致）。",
  "requirement_id": "REQ-L2-ARTICLE-DRAFT",
  "skill_id": "article-draft-indicator",
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
      "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx"
    ],
    "backend_paths": [
      "backend/models/Article.js",
      "backend/controllers/articles.js"
    ],
    "cross_stack": true
  },
  "history_references": [
    {
      "run_id": "run-2026-05-21T05-52-04-582Z",
      "goal": "文章列表与 API 展示草稿状态",
      "skill_id": "article-list-display-field",
      "score": 1,
      "summary": "在 Conduit 文章列表卡片增加确定性阅读量展示。"
    },
    {
      "run_id": "run-2026-05-20T17-09-37-011Z",
      "goal": "文章列表卡片展示阅读量",
      "skill_id": "article-list-display-field",
      "score": 0.313,
      "summary": "在 Conduit 文章列表卡片增加确定性阅读量展示。"
    },
    {
      "run_id": "run-2026-05-20T17-11-44-097Z",
      "goal": "文章列表卡片展示阅读量",
      "skill_id": "article-list-display-field",
      "score": 0.313,
      "summary": "在 Conduit 文章列表卡片增加确定性阅读量展示。"
    }
  ],
  "target_files": [
    "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx",
    "backend/models/Article.js",
    "backend/controllers/articles.js"
  ],
  "risks": [
    "Conduit 根仓没有 lint script 时由实现仓库 ESLint 检查本次改动文件",
    "L2 跨栈改动须保持 API 字段与前端展示一致"
  ],
  "validation_commands": [
    "npm test"
  ]
}
```
