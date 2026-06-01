# Plan

```json
{
  "summary": "在 Conduit 文章列表卡片增加确定性阅读量展示。",
  "requirement_id": "REQ-L1-ARTICLE-READS",
  "skill_id": "article-list-display-field",
  "skill_version": "1.0.0",
  "impacted_modules": [
    "frontend article preview",
    "global styles"
  ],
  "target_files": [
    "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx",
    "frontend/src/styles.css"
  ],
  "risks": [
    "P0 只展示前端假数据，不代表真实阅读量统计",
    "Conduit 根仓没有 lint script 时由实现仓库 ESLint 检查本次改动文件"
  ],
  "validation_commands": [
    "npm test"
  ]
}
```
