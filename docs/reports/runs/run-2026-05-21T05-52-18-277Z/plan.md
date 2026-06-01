# Plan

```json
{
  "summary": "在文章详情页基于 Article.body 展示字数统计。",
  "requirement_id": "REQ-L1-ARTICLE-WORD-COUNT",
  "skill_id": "article-detail-word-count",
  "skill_version": "1.0.0",
  "impacted_modules": [
    "frontend"
  ],
  "impact_matrix": {
    "level": "L1",
    "modules": [
      "frontend"
    ],
    "frontend_paths": [
      "frontend/src/routes/Article/Article.jsx",
      "frontend/src/styles.css"
    ],
    "backend_paths": [],
    "cross_stack": false
  },
  "history_references": [
    {
      "run_id": "run-2026-05-21T05-52-07-802Z",
      "goal": "文章详情页展示正文字数统计",
      "skill_id": "article-detail-word-count",
      "score": 1,
      "summary": "在文章详情页基于 Article.body 展示字数统计。"
    },
    {
      "run_id": "run-2026-05-20T18-44-28-027Z",
      "goal": "文章列表卡片展示阅读量",
      "skill_id": "article-list-display-field",
      "score": 0.36,
      "summary": "在 Conduit 文章列表卡片增加确定性阅读量展示。"
    },
    {
      "run_id": "run-2026-05-20T17-09-37-011Z",
      "goal": "文章列表卡片展示阅读量",
      "skill_id": "article-list-display-field",
      "score": 0.32,
      "summary": "在 Conduit 文章列表卡片增加确定性阅读量展示。"
    }
  ],
  "target_files": [
    "frontend/src/routes/Article/Article.jsx",
    "frontend/src/styles.css"
  ],
  "risks": [
    "Conduit 根仓没有 lint script 时由实现仓库 ESLint 检查本次改动文件",
    "P0 只展示前端假数据，不代表真实阅读量统计"
  ],
  "validation_commands": [
    "npm test"
  ]
}
```
