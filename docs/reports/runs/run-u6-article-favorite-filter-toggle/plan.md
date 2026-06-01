# Plan

```json
{
  "summary": "在 ArticlesPreview 顶部增加仅看已收藏文章的本地筛选开关。",
  "requirement_id": "REQ-U6-ARTICLE_FAVORITE_FILTER_TOGGLE",
  "skill_id": "article-favorite-filter-toggle",
  "skill_version": "1.0.0",
  "target_files": [
    "frontend/src/components/ArticlesPreview/ArticlesPreview.jsx",
    "frontend/src/styles.css"
  ],
  "target_files_source": "u6-skill-targets",
  "validation_commands": [
    "npm run lint:sandbox",
    "npm test"
  ],
  "plan_mode": "rules",
  "source": "u6-manual-rehearsal",
  "rehearsal_window": {
    "startedAt": "2026-06-02T09:36:00+08:00",
    "endedAt": "2026-06-02T09:48:30+08:00"
  },
  "risks": [
    "录屏文件需由人工保留；本地 checker 只校验证据文件存在性"
  ]
}
```
