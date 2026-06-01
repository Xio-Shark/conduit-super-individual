# Plan

```json
{
  "summary": "在文章详情页基于 Article.body 展示字数统计。",
  "requirement_id": "REQ-001",
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
      "run_id": "run-l3-multi-turn-clarify",
      "goal": "在文章详情页正文末尾添加字数统计展示，以提升用户停留时间。",
      "skill_id": "article-detail-word-count",
      "score": 0.261,
      "summary": "在文章详情页基于 Article.body 展示字数统计。",
      "match_type": "both",
      "similarity_score": 0.338
    },
    {
      "run_id": "run-2026-05-20T17-37-55-856Z",
      "goal": "文章列表卡片展示阅读量",
      "skill_id": "article-list-display-field",
      "score": 0.349,
      "summary": "文章列表卡片展示阅读量",
      "match_type": "semantic",
      "similarity_score": 0.349
    },
    {
      "run_id": "run-2026-05-21T05-57-20-736Z",
      "goal": "优化 Conduit 前端文章列表的视觉展示，增加数据指标显示，保持最小代码改动",
      "skill_id": "article-list-display-field",
      "score": 0.33,
      "summary": "优化 Conduit 前端文章列表的视觉展示，增加数据指标显示，保持最小代码改动",
      "match_type": "semantic",
      "similarity_score": 0.33
    }
  ],
  "target_files": [
    "frontend/src/routes/Article/Article.jsx",
    "frontend/src/styles.css"
  ],
  "target_files_source": "skill-targets",
  "schema_resolution": null,
  "sandbox_index": {
    "fileCount": 130,
    "frontendFiles": 97,
    "backendFiles": 33,
    "targets": [
      {
        "path": "frontend/src/routes/Article/Article.jsx",
        "exists": true,
        "exports": [],
        "imports": [
          "markdown-to-jsx",
          "react",
          "react-router-dom",
          "../../components/ArticleMeta",
          "../../components/ArticlesButtons",
          "../../components/ArticleTags",
          "../../components/BannerContainer",
          "../../context/AuthContext"
        ]
      },
      {
        "path": "frontend/src/styles.css",
        "exists": true,
        "exports": [],
        "imports": []
      }
    ]
  },
  "risks": [
    "Conduit 根仓没有 lint script 时由实现仓库 ESLint 检查本次改动文件",
    "P0 只展示前端假数据，不代表真实阅读量统计"
  ],
  "validation_commands": [
    "npm run lint:sandbox",
    "npm test"
  ],
  "plan_mode": "rules",
  "source": "rules-driven",
  "ai_call": null
}
```
