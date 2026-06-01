# Plan

```json
{
  "summary": "在 Conduit 文章列表卡片增加确定性阅读量展示。",
  "requirement_id": "REQ-L1-POPULAR-TAGS-TOP-FIVE",
  "skill_id": "popular-tags-top-five",
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
      "frontend/src/components/PopularTags/TagButton.jsx",
      "frontend/src/styles.css"
    ],
    "backend_paths": [],
    "cross_stack": false
  },
  "history_references": [
    {
      "run_id": "run-2026-05-20T17-09-37-011Z",
      "goal": "文章列表卡片展示阅读量",
      "skill_id": "article-list-display-field",
      "score": 0.148,
      "summary": "在 Conduit 文章列表卡片增加确定性阅读量展示。"
    },
    {
      "run_id": "run-2026-05-20T17-11-44-097Z",
      "goal": "文章列表卡片展示阅读量",
      "skill_id": "article-list-display-field",
      "score": 0.148,
      "summary": "在 Conduit 文章列表卡片增加确定性阅读量展示。"
    },
    {
      "run_id": "run-2026-05-20T17-20-38-453Z",
      "goal": "文章列表卡片展示阅读量",
      "skill_id": "article-list-display-field",
      "score": 0.148,
      "summary": "在 Conduit 文章列表卡片增加确定性阅读量展示。"
    }
  ],
  "target_files": [
    "frontend/src/components/PopularTags/TagButton.jsx",
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
